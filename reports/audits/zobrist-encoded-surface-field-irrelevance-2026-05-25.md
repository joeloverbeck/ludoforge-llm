# Zobrist Encoded-Surface Field-Irrelevance Audit

**Date**: 2026-05-25
**Spec**: `archive/specs/194-zobrist-decision-stack-digest-optimization.md`
**Ticket**: `archive/tickets/194ZOBDECSTA-001.md`
**Phase 1 input**: `reports/perf-baseline/zobrist-residual-cost-2026-05-25.md`
**Boundary**: Observation-only audit. No engine source, engine test, fixture, schema, or replay artifact is changed by this ticket.

## 1. Encoded-Surface Inventory

`encodeDecisionStackFrameDigestInput` currently serializes `parentFrameDigest`, `frameId`, `parentFrameId`, `turnId`, `context`, optional `continuationBindings`, and `effectFrame` fields `programCounter`, `boundedIterationCursors`, `localBindings`, `pendingTriggerQueue`, optional `decisionHistory`, and optional `suspendedFrame` (`packages/engine/src/kernel/zobrist.ts:174-194`). `suspendedFrame` is summarized to `stateHash`, `rng`, `actorPlayer`, `bindings`, optional `freeOperationOverlay`, `leaf`, and `resumeStack` (`packages/engine/src/kernel/zobrist.ts:160-172`).

| Field | Source type | Optionality | Population and mutation pattern | Consumer references |
|---|---|---|---|---|
| `parentFrameDigest` | digest chain argument | required | Derived while walking the decision stack; validates parent-sensitive frame identity cache entries. | `digestDecisionStackFrame` cache validation and digest chain (`zobrist.ts:211-243`). |
| `frameId` | `DecisionStackFrame.frameId` (`microturn/types.ts:231-247`) | required | Allocated from `nextFrameId` when root/child frames are spawned. | Parent lookup, trace entries, rollback, publish snapshots. |
| `parentFrameId` | `DecisionStackFrame.parentFrameId` | required nullable | `null` on root frames; child frames point at the root or active parent. | `rootFrameFor` walks parent links in `microturn/apply.ts:46-60` and `microturn/drive.ts:45-59`. |
| `turnId` | `DecisionStackFrame.turnId` | required | Allocated from `nextTurnId` for a compound microturn sequence; shared by root/child frames. | Decision logs, rollback unavailable-action keys, publish state, active decider origin checks. |
| `context` | `DecisionStackFrame.context` | required | Published decision context for the current microturn. | `publishMicroturn`, decision matching, rebuild and apply paths consume decision kind, seat, options, and decision keys. |
| `continuationBindings` | `DecisionStackFrame.continuationBindings` | optional root-frame payload | Root-only move-param accumulation; child frames omit it. Created from action move params, updated by `withAccumulatedBinding` and choose-N completion. | `rebuildMoveFromFrame` consumers and continuation merge paths in `microturn/apply.ts:303-327, 627-635` and `microturn/drive.ts:190-215, 470-475`. |
| `effectFrame.programCounter` | `EffectExecutionFrameSnapshot.programCounter` (`microturn/types.ts:66-73`) | required | Empty active microturn frames use `0`; suspended execution frames resume from their stored control position. | Effect resume and serialized frame surfaces. |
| `effectFrame.boundedIterationCursors` | `EffectExecutionFrameSnapshot.boundedIterationCursors` | required | Empty active microturn frames use `{}`; suspended/resumed effect execution can carry loop cursor state. | Effect resume and serialized frame surfaces. |
| `effectFrame.localBindings` | `EffectExecutionFrameSnapshot.localBindings` | required | Empty active microturn frames use `{}`; suspended/resumed effect execution can carry local binding state. | Effect resume, scoped expression evaluation, and serialized frame surfaces. |
| `effectFrame.pendingTriggerQueue` | `EffectExecutionFrameSnapshot.pendingTriggerQueue` | required | Empty active microturn frames use `[]` in both canonical apply and preview drive; publish helper snapshots also set `[]`. No digest-time writer in the current microturn publication path populates it. | Serialization/schema only in the active decision-stack frame shape; no current rule branch reads non-empty pending queue from an active published frame. |
| `effectFrame.decisionHistory` | `EffectExecutionFrameSnapshot.decisionHistory` | optional | Root-frame compound-turn trace accumulator. Appended from published decisions and emitted in logs/compound-turn telemetry. | `rootHistory` and `appendTraceEntry` in apply/drive; `createRootFrameSnapshot` in publish tests/helpers. |
| `effectFrame.suspendedFrame.stateHash` | `SuspendedEffectFrameSnapshot.state.stateHash` (`microturn/types.ts:137-145`) | optional via `suspendedFrame` | Set when a choice suspends effect execution; records the canonical suspended state. | `resumeSuspendedEffectFrame`, probe/choice continuation, serialization. |
| `effectFrame.suspendedFrame.rng` | `SuspendedEffectFrameSnapshot.rng` | optional via `suspendedFrame` | Captures RNG state for deterministic resume after a choice. | Resume path and stochastic continuation. |
| `effectFrame.suspendedFrame.actorPlayer` | `SuspendedEffectFrameSnapshot.actorPlayer` | optional via `suspendedFrame` | Captures actor-player evaluation context. | Selector/effect evaluation during resume. |
| `effectFrame.suspendedFrame.bindings` | `SuspendedEffectFrameSnapshot.bindings` | optional via `suspendedFrame` | Captures local effect bindings at suspension. | Resume path, selector/effect evaluation. |
| `effectFrame.suspendedFrame.freeOperationOverlay` | `SuspendedEffectFrameSnapshot.freeOperationOverlay` | optional | Captures free-operation execution context when present. | Scoped var/query resolution during resumed execution. |
| `effectFrame.suspendedFrame.leaf` | `SuspendedEffectFrameSnapshot.leaf` | optional via `suspendedFrame` | Captures the suspended choice leaf and binding options. | Resume path determines how the chosen value binds back into execution. |
| `effectFrame.suspendedFrame.resumeStack` | `SuspendedEffectFrameSnapshot.resumeStack` | optional via `suspendedFrame` | Captures remaining sequence/forEach/let/reduce/pipeline frames. | Resume path controls remaining effect execution. |

Phase 1 measured an aggregate mean encoded size of 23,647.62 chars per miss, 32.72% encode-call rate, 44,355.641 ms aggregate encode time, and 82,289.213 ms aggregate FNV-1a digest time (`reports/perf-baseline/zobrist-residual-cost-2026-05-25.md`). Those figures make encoded-surface reduction a plausible lever, but the current ticket still requires per-field proof before any source change.

## 2. Per-Field Drop/Keep Verdict

### `parentFrameDigest` - KEEP

`parentFrameDigest` is the digest-chain input that makes a frame's digest parent-sensitive. It is also the validation dimension for the identity cache (`zobrist.ts:216-221`). Dropping it would let the same child-frame surface hash identically under different parent chains, which can distinguish reachable decision-stack states.

### `frameId` - KEEP

`frameId` is a live identity dimension for parent links, trace entries, rollback, and published microturn state. Two otherwise similar active decision frames with different frame ids can be distinguished by parent references and trace records. It is not derivable from the remaining fields once `nextFrameId` and stack history vary.

### `parentFrameId` - KEEP

`parentFrameId` is the explicit chain relation used by `rootFrameFor` in both apply and preview-drive paths (`microturn/apply.ts:46-60`, `microturn/drive.ts:45-59`). Dropping it would collapse root and child ancestry shapes that can have the same context and effect frame but different execution ownership.

### `turnId` - KEEP

`turnId` is part of decision logs, unavailable-action scoping, rollback, and active-origin checks. It is a current-state dimension, not a derivable value from frame surface alone. Dropping it could collide identical decision contexts in different compound turns.

### `context` - KEEP

`context` is the active decision contract: decision kind, decider seat, legal options, stochastic distribution, choose-N selection state, or turn-retirement grant. It directly controls published legal decisions and how `applyPublishedDecision` reconstructs the next move. It must remain encoded.

### `continuationBindings` - KEEP

`continuationBindings` is rule-authoritative root-frame state. Apply and preview-drive paths merge and update it while building the move that will eventually execute (`microturn/apply.ts:303-327, 627-635`; `microturn/drive.ts:190-215, 470-475`). Two states can have the same active child context with different accumulated root params; dropping this field could make different pending moves share a digest.

### `effectFrame.programCounter` - KEEP

For the empty active frames created in the current microturn paths this is `0`, but the type is the suspended execution snapshot's control-position field (`microturn/types.ts:66-73`). A safe reduction cannot assume every future reachable frame is empty once the type and resume surfaces admit non-zero values. Keep unless ticket `194ZOBDECSTA-002` proves, with executable tests, that all digest-time published frames always have `0`.

### `effectFrame.boundedIterationCursors` - KEEP

The field is empty on newly published active frames, but it is part of the effect execution snapshot and can distinguish bounded-loop resume state. Its value is not derivable from the kept decision context. Keep because a wrong drop would collapse different effect-resume positions.

### `effectFrame.localBindings` - KEEP

`localBindings` carries effect-local values for suspended/resumed execution. It can affect selectors, value expressions, and later emitted effects. It is not derivable from frame ids or context. Keep.

### `effectFrame.pendingTriggerQueue` - DROP-PROVEN-IRRELEVANT

Every current active-frame constructor used by the canonical apply path, preview-drive path, and publish helper creates the effect frame with `pendingTriggerQueue: []` (`microturn/drive.ts:102-107`, mirrored by apply's `emptyEffectFrame`, and `microturn/publish.ts:942-949`). The digest-time decision stack represents a published pending decision; trigger dispatch queues are resolved before publication and are not resumed from active microturn frames. Current consumers outside serialization/schema do not read a non-empty `pendingTriggerQueue` from the active `decisionStack`. Removing this field from the v2 encoded surface is therefore a no-op for reachable digest-time values and avoids repeatedly encoding a constant key/value pair.

### `effectFrame.decisionHistory` - DROP-PROVEN-IRRELEVANT

`decisionHistory` is compound-turn telemetry, not a rule-authoritative input to legal move construction. It is populated by appending the exact published decisions that led to the current root frame (`microturn/apply.ts:292-300, 539-552`; `microturn/drive.ts:180-187, 380-393`) and read by `rootHistory` only to append the next telemetry entry (`microturn/apply.ts:43-44`, `microturn/drive.ts:42-43`). The applied move is reconstructed from `continuationBindings`, the active decision, and `suspendedFrame` when present, not from the historical log entries. Dropping this field means the v2 digest no longer treats observation-only trace accumulation as part of the hash input; the Phase 2 ticket must document that this is a kernel-versioned canonical-hash representation change, not a within-v1 byte-preserving edit.

### `effectFrame.suspendedFrame.stateHash` - KEEP

Suspended effect execution resumes from a captured state. The summary intentionally uses `stateHash` rather than serializing the full state (`zobrist.ts:160-164`). This is already the compressed identity of the suspended state. Dropping it would collapse distinct suspended execution roots.

### `effectFrame.suspendedFrame.rng` - KEEP

The RNG captured at suspension controls deterministic stochastic continuation after resume. It cannot be derived from the kept frame context and must remain encoded.

### `effectFrame.suspendedFrame.actorPlayer` - KEEP

Actor-player context affects selectors and effect evaluation during resume. It is not always derivable from active player or seat after suspension, especially under free-operation and deferred-effect contexts. Keep.

### `effectFrame.suspendedFrame.bindings` - KEEP

Suspended bindings are the local data environment used when execution resumes. Dropping them would allow different pending computations to share a digest.

### `effectFrame.suspendedFrame.freeOperationOverlay` - KEEP

The overlay contributes scoped variables, captured sequence zones, and zone filters during resumed/free-operation evaluation. It is semantically relevant when present. Keep.

### `effectFrame.suspendedFrame.leaf` - KEEP

The leaf records the suspended choice kind, decision key, bind target, scope, and binding options (`microturn/types.ts:89-107`). It defines how the user's choice maps back into effect execution. Keep.

### `effectFrame.suspendedFrame.resumeStack` - KEEP

The resume stack records remaining sequence/forEach/let/reduce/pipeline continuation frames (`microturn/types.ts:109-135`). It is the execution continuation and cannot be inferred from the active decision context alone. Keep.

## 3. Cross-Check Against Spec 80 Incremental Contract

Spec 80's incremental contract requires `stateHash` to remain the final published hash and for incremental updates to agree with full recomputation. The proposed Drop fields are safe against that contract only under the v2 encoding bump owned by `tickets/194ZOBDECSTA-002.md`.

- `pendingTriggerQueue`: safe because all reachable digest-time active frames currently encode it as `[]`; dropping the constant field does not remove a state discriminator.
- `decisionHistory`: safe only as an intentional v2 identity reduction. It removes observation-only telemetry from the decision-stack-frame digest, so `tickets/194ZOBDECSTA-002.md` must bump the frame digest salt and re-bless pinned hashes atomically. Within v2, incremental and full recomputation can still agree because both paths call the same encoder.

No kernel source changed in this audit ticket, so Spec 80 behavior is unchanged here.

## 4. Cross-Check Against Spec 168 Cache Equivalence

The Spec 168 invariant test proves cache-hit, cache-miss, and recompute paths agree for the current encoder. The proposed Drop list does not change cache discipline:

- Identity cache validation remains keyed by `parentFrameDigest`.
- Content-cache lookup remains keyed by the encoded representation produced by the one canonical encoder.
- `recomputeDecisionStackFrameDigest` and `digestDecisionStackFrame` both consume the same encoded surface.

`tickets/194ZOBDECSTA-002.md` must update or rerun `packages/engine/test/integration/zobrist-frame-digest-cache-equivalence.test.ts` at v2. The property remains the same: warm cache, cold cache, and direct recompute must produce identical digest values at the active encoding version.

## 5. Encoded-Surface Size Projection

Phase 1 baseline: aggregate mean encoded chars per miss was **23,647.62**.

This audit does not have per-field byte counters, so the projection is a structural estimate rather than a measured replacement for Phase 3:

- Dropping `pendingTriggerQueue` removes a constant JSON member from every encoded frame. The exact serialized fragment is small, approximately 24-26 chars depending on neighboring comma placement.
- Dropping `decisionHistory` removes the only field that grows with the number and serialized size of prior microturn decisions in the current compound turn. Each history entry carries `seatId`, `decisionContextKind`, `decisionKey`, a serialized `decision`, and `frameId`; root histories are appended in apply and drive before new child frames are spawned. In the Phase 1 workloads, a conservative one-entry average of roughly 150-250 chars would project a post-reduction mean near **23,375-23,475 chars per miss**. Longer choose-N/action-continuation sequences should shrink more.

Projected aggregate mean encoded chars per miss after the Drop list: **about 23.4K chars/miss**, with the important caveat that this is not the final perf witness. `archive/tickets/194ZOBDECSTA-003.md` owns the measured post-implementation recapture.

## 6. Final Drop Field List

- `effectFrame.pendingTriggerQueue` - `DROP-PROVEN-IRRELEVANT`; current digest-time active frames always encode `[]`, and no rule path resumes trigger dispatch from this field in an active published decision-stack frame.
- `effectFrame.decisionHistory` - `DROP-PROVEN-IRRELEVANT`; observation-only compound-turn trace accumulator derived from published decisions and not used to reconstruct or apply the pending move.

`tickets/194ZOBDECSTA-002.md` should remove exactly these fields from `encodeDecisionStackFrameDigestInput`, bump the digest salt/version, document the v1-to-v2 reproducibility boundary, and re-bless/reprove the corpus atomically.

## 7. Risk and Residual

- `programCounter`, `boundedIterationCursors`, and `localBindings` are currently empty on newly published active frames in the inspected paths, but the type and suspended execution model make them semantically meaningful. They are `KEEP` because this audit did not prove a global digest-time invariant that they are always default-valued.
- All `suspendedFrame` subfields are `KEEP`. The existing summarizer is already a reduced surface (`stateHash` instead of full suspended state), and every remaining subfield contributes to deterministic resume identity.
- `decisionHistory` is the highest-risk Drop field because it intentionally removes telemetry from the v2 hash input. The risk is acceptable only with the version bump and corpus re-bless required by `tickets/194ZOBDECSTA-002.md`; it would not be acceptable as a same-version invisible behavior change.
- The size projection is approximate. The implementation ticket should avoid overclaiming perf gain from this audit alone; Phase 3 owns measured verification.
