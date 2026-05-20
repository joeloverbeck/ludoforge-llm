# Spec 185 — Grant-Flow Preview Integrity: Honest Status, Bounded Free-Operation Continuation, and Witnesses

**Status**: COMPLETED
**Priority**: High — this is the unfixed engine-coverage gap that has been re-diagnosed ~4× (exp-004/005/006 on 2026-05-14; exp-002/arch-gap-003 on 2026-05-17) and blocks the `fitl-arvn-agent-evolution` campaign and the Spec 183 evolution-loop overhaul. Downstream specs keep building on a dishonest preview surface.
**Complexity**: M–L — three independently mergeable phases. Phase 1 (status integrity) is S–M and lands first: it stops the false-`ready` lie with no behavioral continuation change. Phase 2 (generalized grant-flow continuation) is M–L and is the substantive engine change. Phase 3 (cap-class taxonomy, trace provenance, WASM parity, witnesses) is M.
**Date**: 2026-05-20
**Dependencies**:
- `archive/specs/179-action-selection-preview-outcome-grant-opt-in.md` (`outcomeGrantContinuation` substrate — Spec 185 extends it from grant-offer acknowledgment to grant-effect completion; Spec 180 §2 (Non-Goals) explicitly reserved the `outcomeGrantResolve`-publishing production paths for a future spec)
- `archive/specs/180-standing-vector-observability-and-outer-preview-signal-integrity.md` (outer-preview seat-aggregate integrity, per-candidate × per-seat trace matrix, and `currentLeader`/`nearestThreat` role refs — Spec 185 makes those surfaces honest for the free-operation grant path they could not yet observe)
- `archive/specs/162-preview-signal-integrity.md` (Foundation #20 — the load-bearing principle for Phase 1)
- `archive/specs/164-continued-inner-preview-deepening.md` (cap-class registry pattern — model for the new `grantFlow` cap classes mandated by Foundation #10's cap-class-naming amendment)

**Trigger reports**:
- `reports/agent-evolution.md` (external ChatGPT-Pro deep-research proposal; this spec is the reassessed, scoped engine-integrity prerequisite carved out of that proposal — see §11)
- `archive/reports/fitl-arvn-preview-opponent-margin-uniform-2026-05-17.md` (original witness: ARVN opponent-margin preview is uniform across candidates because effects land behind an un-driven grant chain)

**Ticket namespace**: `185GRANTFLOWPI` (proposed; finalize during ticket decomposition)

---

## 1. Goal

Make bounded action-selection preview both **honest** and **effect-complete** across the kernel's grant / free-operation chains, using only generic kernel surfaces.

Three mergeable phases:

1. **Status integrity (Phase 1, Foundation #20).** A preview that stops at a grant-offered-but-not-executed state, or with unresolved pending free-operation grant obligations, MUST NOT resolve opponent/standing refs as `ready`. The drive currently returns `completed` at that point and the ref layer then records numeric `ready` values against the pre-effect state. Phase 1 closes that at the ref-resolution layer (`readyRefStats`, `allReadyValuesUniform`, seat-matrix recording) and un-collapses `postGrantCap` from `depthCap` in the usage summary. This phase stops the lie before any continuation behavior changes.

2. **Generalized grant-flow continuation (Phase 2).** Extend `outcomeGrantContinuation` so the preview drive continues — bounded and deterministic — past the `outcomeGrantResolve` offer through the kernel-published `freeOperation: true` action-selection move (and any inner choices it requires) that actually executes the granted operation's effects, **only** when those frames are part of the origin candidate's consequence chain. After this phase, `preview.victory.currentMargin.$seat`, `currentLeader`, and `nearestThreat` differentiate across candidates whose granted effects change those standings.

3. **Cap-class taxonomy, trace provenance, WASM parity, and witnesses (Phase 3).** Introduce named `grantFlow` cap classes (Foundation #10), distinct `postGrantCap` / `freeOperationCap` / `grantFlowPartial` exit reasons, trace segments for the grant chain, WASM parity-or-forced-TS-fallback for the new statuses, and the engine fixtures + FITL-like fixture + FITL ARVN witness that prove the property.

The defect class being closed: **bounded preview pretending to be complete preview** (Foundation #20), specifically the grant/free-operation case where the kernel publishes the grant offer in one decision and the effect in a separate `freeOperation: true` decision.

## 2. Non-Goals

- **No game-specific engine logic.** No FITL/ARVN/NVA/VC/`airStrike`/`SEALORDS`/`Agent Orange` identifiers or branches in `packages/engine/`. The continuation operates on generic kernel metadata: pending free-operation grants, grant authorization, `move.freeOperation`, decision-context kinds, origin seat/turn identity. (Foundation #1.)
- **No static effect-declaration table.** The external proposal's "focused effect projection" (Option 4) is rejected as a first fix: hand-authored per-game effect footprints drift from kernel execution (Foundation #15). Any future projection MUST execute real kernel effects on a scoped draft state and emit the same status/provenance taxonomy; that is a separate later spec, not this one.
- **No evolution-loop changes.** Composite acceptance, weight-soup lint, MAP-Elites quality-diversity archive, profile bootstrap, and profile promotion/rename live in Spec 183 (to be reassessed separately) and `campaigns/`. Spec 185 ships the engine prerequisite those depend on; it does not touch `campaigns/`, the improve-loop skill, or `data/games/fire-in-the-lake/92-agents.md` profile bindings.
- **No playing future independent turns.** Continuation MUST stop at the origin candidate's consequence-chain boundary (§5.1). It MUST NOT advance into a fresh `actionSelection` for a later independent turn, an opponent seat's free choice outside the grant chain, or a `turnRetirement` boundary.
- **No raising of inner/outer preview cap classes.** `standard256`, `deep1024` (Spec 164), and the existing `postGrant16` budget are unchanged. New `grantFlow` cap classes are additive.
- **No new compiled IR union variants.** This is a preview-drive + status-propagation change, not a new `AgentPolicyExpr` node. The config block is extended/renamed (§5.4), not a new expression type.
- **No performance gate as a correctness veto.** The proposal's 5% wall-clock regression gate is measured and reported (Phase 3), but it does not block landing a correctness fix. Bound it with cap classes; optimize after proof.

## 3. Context (verified against codebase)

All claims below were verified by source inspection on 2026-05-20.

### 3.1 The verified call chain

The kernel publishes the grant offer and the grant effect as **two separate decisions**:

1. A root action creates a pending free-operation grant (`turn-flow-eligibility.ts` → `toPendingFreeOperationGrants`). Grant lifecycle phases are `sequenceWaiting | ready | offered | consumed | exhausted | skipped | expired` (`contracts/turn-flow-free-operation-grant-contract.ts:87-95`; note `consumed` is a declared literal that `consumeUse` never assigns — it transitions to `exhausted` or back to `ready`).
2. The `outcomeGrantResolve` microturn decision handler (`kernel/microturn/apply.ts:746-770`, mirrored in `microturn/drive.ts:587-611`) calls `markOffered()` (phase `ready → offered`) and pops the frame. **It executes no effects.**
3. `legalMoves` enumerates pending free-operation grants into action moves tagged `freeOperation: true` (`kernel/legal-moves.ts:766-1271`, `enumeratePendingFreeOperationMoves`), checking grant authorization (`free-operation-grant-authorization.ts`).
4. Applying a `freeOperation: true` move runs the actual effects: `apply-move.ts:1417-1462` calls `executeMoveAction` → `applyEffects` **before** `consumeAuthorizedFreeOperationGrant`. Opponent-affecting effects (piece removal, margin changes) live in the action's `effects` array, applied here.

### 3.2 Why the current `outcomeGrantContinuation` is insufficient

`driveSyntheticCompletion` (`agents/policy-preview.ts:902-1133`) continues only while the top decision context is `outcomeGrantResolve` and `postGrantDepth < extraDepthCap` (`outcomeGrantContinuation`, fields `enabled`/`extraDepthCap`/`capClass`; `postGrant16 → 4` via `POST_GRANT_CAP_CLASS_BUDGETS`, compiled/validated in `cnl/compile-agents.ts:1201-1281` and `cnl/validate-agents.ts:132-189`). It applies the first legal `outcomeGrantResolve` action — which only marks the grant `offered` (§3.1 step 2) — then on the next iteration the top frame is a fresh `actionSelection` containing the `freeOperation: true` move. The driver treats that as a turn boundary and returns `completed` (`policy-preview.ts:1020-1033`: returns `completed` when the stack top is `undefined`, `actionSelection`, `turnRetirement`, or a non-origin seat/turn frame).

Result: the drive finalizes **after the grant is offered but before the free operation executes**. `arvn-evolved` (the ARVN binding target) enables `outcomeGrantContinuation: {enabled: true, extraDepthCap: 4, capClass: postGrant16}`, so it hits exactly this path.

### 3.3 The Foundation #20 violation is at the ref layer

The drive returns `completed`, not literally `ready`. But ref resolution then records numeric `ready` values against that completed-but-pre-effect state:
- `summarizeReadyRefStats` (`agents/policy-eval.ts:1500-1553`) includes a candidate iff `previewOutcome === 'ready'`.
- `summarizePreviewOutcomes` (`policy-eval.ts:1637-1639`) collapses `postGrantCap` into the `depthCap` counter (`unknownDepthCap` in the breakdown trace), losing cause specificity.
- `PolicyPreviewTraceOutcome` (`policy-preview.ts:167-176`) already distinguishes `ready | stochastic | random | hidden | unresolved | failed | depthCap | postGrantCap | noPreviewDecision | gated`, but there is **no status for "stopped at an offered/unresolved grant obligation"** — so the grant-offered state surfaces as `completed`/`ready`, exactly the case Foundation #20 forbids.

This matches the project's standing diagnosis: the uniformity of `preview.victory.currentMargin.<nva|vc>` is a TS-engine coverage gap, not a profile-quality, candidate-pruning, or WASM-parity problem. The preview reports `ready` ~75% of the time and so never enters `tiebreakAfterPreviewNoSignal`.

### 3.4 WASM and turn-shape

- `policy-wasm-preview-drive.ts:26` emits outcomes `completed | stochastic | depthCap | failed` and statuses `ready | stochastic | hidden | unresolved | failed | depthCap | gated` — **no `postGrantCap`, no free-operation status**. The WASM path cannot represent the new distinctions.
- `turnShapePreviewStatus` (`agents/turn-shape-eval.ts:40-56`) already maps `postGrantCap` and `depthCap` to `partial`, and `evaluateTurnShapeObjectives` skips objectives when status ≠ `ready` or the drive exceeds `maxSyntheticDecisions`. `resolveTurnShapeProjection` (`agents/policy-evaluation-core.ts:2194-2214`) returns a projected state only on `ready`/`stochastic`. Turn-shape is therefore *stricter* than raw refs but still consumes whatever the drive finalized; it is not an independent cure.

### 3.5 The existing test is a smoke test, not a proof

`packages/engine/test/architecture/preview-post-grant/post-grant-continuation-differentiates.test.ts` proves opt-out leaves the grant `ready` and opt-in marks it `offered`. Its fixture stubs `applyMove()` to fabricate `outcomeGrantResolve` frames with **empty action effects**. It does not — and cannot — prove that opponent operation effects become visible. Keep it as a lifecycle smoke test; it is not a preview-integrity proof.

## 4. Phase 1 — Status Integrity (Foundation #20)

Goal: no false-`ready` from a grant-offered or unresolved-grant preview state, with **no continuation-behavior change**. This is the lowest-risk, highest-integrity-value change and lands first.

Requirements:

1. **New finalization status for un-driven grant obligations.** When the drive finalizes (`completed`) but the finalized state has a pending free-operation grant in phase `offered` (or `ready`/`sequenceWaiting`) that is part of the origin candidate's consequence chain (§5.1 boundary; in Phase 1, conservatively: same origin seat and turn, grant created during the candidate's application), the preview outcome for opponent/standing refs MUST be a non-`ready` status. Introduce `grantFlowPartial` (and reuse `postGrantCap` where the cap was the cause) so the cause is explicit. Self-only refs that are already resolved on the finalized state remain `ready`.
2. **Ref-layer enforcement.** `summarizeReadyRefStats` and `allReadyValuesUniform` MUST exclude refs whose candidate finalized with a non-`ready` grant-flow status. `allReadyValuesUniform` MUST NOT trigger deepening or no-signal classification on excluded refs (consistent with Spec 180's seat-matrix integrity).
3. **Seat-matrix integrity.** Per-candidate × per-seat trace recording (Spec 180) MUST carry the per-seat status when a role resolution is unavailable due to a pre-effect grant-flow state.
4. **Un-collapse the summary.** `summarizePreviewOutcomes` MUST keep `postGrantCap` distinct from ordinary `depthCap`, and add `freeOperationCap` and `grantFlowPartial` counters. `PolicyPreviewOutcomeBreakdownTrace` gains the corresponding fields.
5. **No silent coercion.** Any consideration that converts a non-`ready` grant-flow ref into a numeric contribution MUST declare the fallback in profile YAML, visible in deterministic trace (Foundation #20, unchanged contract — Phase 1 only ensures the status is honest so the existing contract engages).

Phase 1 acceptance is provable today against the existing FITL ARVN candidates: the uniform opponent refs that currently report `ready` must instead report `grantFlowPartial` (or capped), and `readyRefStats` must exclude them.

## 5. Phase 2 — Generalized Grant-Flow Continuation

Goal: drive bounded, deterministic continuation through the grant chain so the granted operation's effects become visible to preview refs.

### 5.1 The consequence-chain boundary (the load-bearing definition)

Continuation MUST advance through a published frame iff **all** of the following hold:
- the frame's seat is the origin candidate's seat, and the turn is the origin candidate's turn (`turnId`); and
- the frame is either an `outcomeGrantResolve` for a grant created by (or transitively chained from) the origin candidate's application, or an `actionSelection` whose **only** continuation-eligible legal moves are `freeOperation: true` moves authorized by such a grant (or inner `chooseOne`/`chooseNStep` decisions required to complete such a free-operation move); and
- a configured cap class for the relevant continuation kind has remaining budget.

Continuation MUST stop (finalize) when:
- the top frame is a fresh `actionSelection` offering non-grant ordinary moves (a new independent turn segment); or
- the frame belongs to a non-origin seat or non-origin turn; or
- the top frame is `turnRetirement`; or
- a cap class is exhausted (→ `postGrantCap` / `freeOperationCap`); or
- a stochastic or hidden decision is reached (→ existing `stochastic` / `hidden` handling); or
- application fails (→ `failed`).

This boundary is the genuinely hard part the external proposal rated "Correctness risk: Medium." It MUST be expressed using generic kernel metadata only; if `legalMoves` / microturn publication does not currently expose enough to answer "is this `freeOperation` move authorized by a grant in the origin candidate's chain?", Phase 2 adds **generic** helper APIs in `kernel/legal-moves.ts` (e.g., `isMoveGrantAuthorized`, `canonicalGrantForMove`, `isGrantRequired`) and/or generic metadata on published legal actions (`kernel/microturn/*`) — never FITL-specific.

### 5.2 Continuation mechanics

Continuation MUST use the real one-rules protocol (Foundation #5): publish the microturn, choose a deterministic legal grant/free-operation move under the configured completion policy, apply it through the same `applyMove` path as runtime (Foundation #8 — deterministic, no preview-only effect shortcut), continue through any inner `chooseOne`/`chooseNStep`, and loop until the §5.1 stop condition. `apply-move.ts` MUST NOT gain preview-only behavior.

### 5.3 Selection policy and determinism

Free-operation move selection within continuation MUST be deterministic and bounded: same candidate stable move key ⇒ same continuation trajectory ⇒ same trace (Foundation #8). The selection policy reuses the existing deterministic completion policy used for inner preview, applied to the grant-authorized move set. RNG state is unchanged except where a stochastic decision is explicitly reached and handled (then the drive exits `stochastic`, not by consuming RNG silently).

### 5.4 Config shape

The `outcomeGrantContinuation` block is generalized to cover the full grant flow. Per Foundation #14 (no back-compat shims), this is a clean rename/extension of the config and all repository-owned profiles are migrated in the same change (note: profile *binding* promotion stays out of scope per §2; only the config-shape migration of profiles that already use the block lands here). The block gains separately-named cap classes for the two continuation segments (§6.1). The compiler (`compile-agents.ts`) and validator (`validate-agents.ts`) lower and validate the generalized shape and require each `extraDepthCap`/budget to equal its named cap-class budget.

## 6. Phase 3 — Cap-Class Taxonomy, Trace Provenance, WASM Parity, Witnesses

### 6.1 Cap classes (Foundation #10)

Named, statically-recorded cap classes for the grant-flow continuation segments, additive to `postGrant16`:
- `postGrant16` — legacy `outcomeGrantResolve` acknowledgment frames (unchanged budget).
- `grantFlow*` (e.g., `grantFlow16` / `grantFlow32`) — full grant / free-operation continuation budget (offered → effect, including inner choices).

The numeric suffix in a post-grant cap-class name is a registry label, not the budget value: `postGrant16` already maps to budget `4` (`POST_GRANT_CAP_CLASS_BUDGETS.postGrant16 = 4`, enforced by the `extraDepthCap`-must-equal-budget validator). The concrete `grantFlow*` budgets are pinned during ticket implementation; the spec fixes only that each class is statically named. The active cap class MUST be recorded in reproducibility metadata and surfaced in trace, so witnesses and replays can assert which class was active (Foundation #10).

### 6.2 Exit reasons and trace segments

Distinct exit reasons: `completed`, `stochastic`, `depthCap`, `postGrantCap`, `freeOperationCap`, `grantFlowPartial`, `failed`. Trace per candidate MUST record: `stableMoveKey`, root `actionId`, preview mode, completion policy, grant-continuation enabled/capClass/cap, and ordered segments — `outcomeGrantResolve`, `grantOffered`, `freeOperationActionSelection`, `selectedFreeOperation`, `innerChoice`, `grantConsumed`/`grantSkipped`/`grantExpired`, `deferredEffectsReleased` — plus `exitReason` and final status.

### 6.3 WASM parity or forced fallback

`policy-wasm-preview-drive.ts` MUST either add the new statuses/outcomes (`postGrantCap`, `freeOperationCap`, `grantFlowPartial`) or force unsupported-fallback to TS when grant-flow continuation is required for a candidate batch. **No WASM row may report `ready` where TS reports a non-`ready` grant-flow status.** Add parity tests. (Consistent with Spec 184's "TS is the oracle" stance.)

### 6.4 Witnesses

- **Engine fixture (regular):** extend `post-grant-continuation-differentiates.test.ts` to assert opt-out stops at `ready→offered` and makes **no claim** that effects executed; cap class and depth appear in the usage summary.
- **Engine fixture (free-operation):** new `post-grant-free-operation-continuation.test.ts` — tiny generic card-driven game where the root action creates a pending free-operation grant, `outcomeGrantResolve` marks it offered, and the only effectful state change occurs when the offered `freeOperation: true` move executes. Assert: pre-fix/opt-out stops with grant `offered` and target value unchanged and ref status non-`ready`; generalized behavior executes the operation and changes the projected value; trace records the grant-flow segments; cap-stopped continuation yields non-`ready` refs.
- **FITL-like fixture:** `fitl-like-ordered-free-operation-preview.test.ts` — generic objects mimicking FITL's ordered/per-space grant pattern; deterministic sequence; `preview.victory.currentMargin.<opponent-surrogate>` differentiates only after the granted operation executes.
- **FITL ARVN witness:** `packages/engine/test/policy-profile-quality/probes/fitl-arvn-may17-equivalent-opponent-preview.test.ts` (or the existing `test:policy-profile-quality` lane). Assert: ≥2 ARVN candidates whose granted effects should differ for NVA and/or VC margin produce differentiated `preview.victory.currentMargin.nva`/`.vc`; `currentLeader`/`nearestThreat` differentiate when standings should change; trace shows whether grant-flow continuation ran and how it exited; any partial/capped candidate's opponent refs are not counted as ready. This is a profile-quality witness (Appendix lane), non-blocking for CI, but the **engine fixtures in §6.4 are blocking architectural-invariant tests**.

## 7. Foundation alignment

- **#1 Engine Agnosticism** — continuation uses only generic grant/free-operation/decision-context metadata; §2 forbids FITL identifiers.
- **#5 One Rules Protocol** — continuation uses real `legalMoves`/`applyMove`; no preview-only effect path.
- **#8 Determinism** — deterministic bounded selection; same stable key ⇒ same trace; RNG untouched except explicit stochastic exits.
- **#10 Bounded Computation** — named `grantFlow` cap classes recorded in artifact + reproducibility metadata.
- **#14 No Backwards Compatibility** — config generalized via clean rename; owned profiles migrated in the same change; no aliases.
- **#16 Testing as Proof** — blocking engine fixtures prove the property; the free-operation fixture is written failing-first (TDD).
- **#20 Preview Signal Integrity** — the load-bearing principle; Phase 1 stops the false-`ready`, Phase 2 makes the preview genuinely complete, Phase 3 makes the status taxonomy and trace honest end-to-end including WASM.

No FOUNDATIONS.md amendment is required. Foundation #20 (added by Spec 162, extended by Spec 180) and Foundation #10's cap-class-naming amendment (Spec 164) already cover this work.

## 8. Deferred / out of scope

- **Focused effect projection** (proposal Option 4) — only as a later spec, and only if it executes real kernel effects on a scoped draft state and emits the same taxonomy. Rejected as a first fix (drift risk, Foundation #15).
- **Evolution-loop rework** — Spec 183's composite acceptance / weight-soup lint / MAP-Elites archive, and its internal inconsistency (the reassessment note vs. the retained "No engine changes" / `noSignalPenalty` / May-17 acceptance criterion (c)) are handled by a **separate Spec 183 reassessment** that declares Spec 185 a hard prerequisite. Spec 185 does not edit Spec 183.
- **ARVN profile promotion / rename / quarantine** — campaign and `92-agents.md` lifecycle changes follow the engine fix; out of scope here.
- **Performance tuning / WASM acceleration of the new path** — measured and reported in Phase 3, optimized afterward; not a landing blocker.

## 9. Acceptance criteria

**Phase 1 (status integrity):**
- (a) A preview that finalizes at a grant-offered (or unresolved grant) state in the origin candidate's chain reports a non-`ready` status (`grantFlowPartial` or capped) for opponent/standing refs; self-only refs resolved on the finalized state stay `ready`.
- (b) `summarizeReadyRefStats` and `allReadyValuesUniform` exclude such refs; no deepening / no-signal classification fires on them.
- (c) `summarizePreviewOutcomes` reports `postGrantCap`, `freeOperationCap`, and `grantFlowPartial` distinctly from `depthCap`.
- (d) Against current FITL ARVN candidates, the previously `ready`-uniform `preview.victory.currentMargin.<nva|vc>` refs now report a non-`ready` grant-flow status (regression proof for the standing diagnosis).

**Phase 2 (continuation):**
- (e) The new free-operation engine fixture: opt-out / pre-fix stops at grant `offered` with target value unchanged; generalized continuation executes the granted operation and the projected value changes.
- (f) Continuation stops at every §5.1 boundary; an explicit test proves it never advances into a non-origin seat/turn or a fresh independent `actionSelection`.
- (g) Determinism: same candidate stable key ⇒ identical continuation trajectory and trace across repeated runs.

**Phase 3 (taxonomy / trace / WASM / witnesses):**
- (h) Each `grantFlow` cap class has a fixed budget recorded in reproducibility metadata; cap exit is deterministic and surfaced as a cap, not `failed` or `ready`.
- (i) Trace includes the §6.2 segments and exit reason for grant-flow candidates.
- (j) No WASM row reports `ready` where TS reports a non-`ready` grant-flow status; WASM either supports the statuses or forces TS fallback, with parity tests.
- (k) The FITL ARVN witness shows differentiated NVA/VC margin and standing-role refs for effectful candidates, or an explicit trace proving the candidates are true no-ops with respect to those refs.

## 10. Test plan

- **Blocking architectural-invariant fixtures** (`packages/engine/test/architecture/preview-post-grant/`, `.../preview-signal-integrity/`, `.../preview-trace/`): regular post-grant fixture (extended); free-operation continuation fixture (failing-first); FITL-like ordered free-operation fixture; grant-flow status integrity; grant-flow trace provenance; boundary/consequence-chain stop tests; cap-class / determinism tests.
- **Blocking parity fixture** (`packages/engine/test/unit/agents/`): WASM/TS grant-flow parity — unsupported fallback when required; agreement where WASM supports the path; no `ready`-where-partial divergence.
- **Non-blocking profile-quality witness** (`packages/engine/test/policy-profile-quality/probes/`): FITL ARVN May-17-equivalent opponent-preview differentiation, classified per `.claude/rules/testing.md` (architectural-invariant for the engine fixtures; this witness is a profile-quality regression signal, not a blocking determinism proof).
- **Determinism corpus** unaffected: grant-flow continuation must not alter replay identity for games that do not use free-operation grants.

---

## 11. Reassessment of the external proposal (`reports/agent-evolution.md`)

This spec is a scoped reassessment of the ChatGPT-Pro proposal, not a verbatim transcription. What was verified, kept, changed, or dropped:

**Verified accurate (kept):** the proposal's core technical claims were confirmed against current code on 2026-05-20 — `outcomeGrantContinuation` exists and is wired (it advanced past the May-20 brief's "missing" framing); `outcomeGrantResolve` marks the grant `offered` without executing effects; the actual effects execute behind a separate `freeOperation: true` move in `applyMoveCore`; the drive finalizes pre-effect; `summarizePreviewOutcomes` collapses `postGrantCap`; the WASM path lacks the new statuses; the existing architecture test is a lifecycle smoke test; Spec 183 is internally inconsistent. The central thesis — a Foundation #20 violation on the grant/free-operation path — is correct and matches the project's standing diagnosis (re-diagnosed ~4×).

**Changed (precision):** the proposal frames the lie as the drive returning `ready`; verification showed the drive returns `completed` and the **ref-resolution layer** then records `ready`. Phase 1 therefore targets `readyRefStats` / `allReadyValuesUniform` / seat-matrix recording, not only the drive outcome. Two proposal references are inaccurate but immaterial: `source: currentPreviewDrive` (no such field) and locating `resolveTurnShapeProjection` in `turn-shape-eval.ts` (it is in `policy-evaluation-core.ts`).

**Scoped down (dropped from this spec):** the proposal bundles evolution-loop redesign, MAP-Elites descriptors, profile bootstrap/promotion/rename, and performance tuning. Per YAGNI and the dependency-direction rule, those are deferred (§8) — Spec 185 is the engine prerequisite the rest depend on. The proposal's Option 4 (effect-projection table) is rejected as a first fix (§2). The proposal's recommendation to split/rewrite Spec 183 is endorsed but executed as a **separate** Spec 183 reassessment, not inside this spec.

**Sharpened (the hard part):** the proposal under-specifies which grant/free-operation frames belong to the origin candidate's consequence chain. §5.1 makes that boundary the load-bearing definition and constrains it to generic kernel metadata.

## Tickets

Decomposed via `/spec-to-tickets` on 2026-05-20:

- [`archive/tickets/185GRANTFLOWPI-001.md`](../archive/tickets/185GRANTFLOWPI-001.md) — Phase 1 — Preview status integrity for un-driven grant obligations (covers §4)
- [`archive/tickets/185GRANTFLOWPI-002.md`](../archive/tickets/185GRANTFLOWPI-002.md) — Phase 2 — Grant-flow config generalization + `grantFlow` cap-class registry (covers §5.4, §6.1 registry)
- [`archive/tickets/185GRANTFLOWPI-003.md`](../archive/tickets/185GRANTFLOWPI-003.md) — Phase 2 — Generalized grant-flow continuation drive (covers §5.1–§5.3)
- [`archive/tickets/185GRANTFLOWPI-004.md`](../archive/tickets/185GRANTFLOWPI-004.md) — Phase 3 — Exit-reason taxonomy and grant-flow trace provenance (covers §6.2)
- [`archive/tickets/185GRANTFLOWPI-005.md`](../archive/tickets/185GRANTFLOWPI-005.md) — Phase 3 — WASM preview-drive parity or forced TS fallback (covers §6.3)
- [`archive/tickets/185GRANTFLOWPI-006.md`](../archive/tickets/185GRANTFLOWPI-006.md) — Phase 3 — End-to-end witnesses (covers §6.4, §10 witness)

## Outcome

Completed: 2026-05-20

Spec 185 landed across archived tickets `185GRANTFLOWPI-001` through `185GRANTFLOWPI-006`.

What changed:
- Preview status integrity now distinguishes grant-flow partial/cap outcomes from ordinary ready/depth-cap outcomes and prevents unresolved grant-flow refs from being counted as ready.
- Grant-flow continuation now drives bounded generic outcome-grant/free-operation consequence chains through the real rules protocol, with cap-class configuration, trace provenance, and deterministic stop boundaries.
- WASM preview-drive parity/fallback surfaces were aligned so WASM cannot report `ready` where TS reports grant-flow partial/capped status.
- End-to-end witnesses were added for a generic FITL-like ordered/per-space free-operation pattern and the current ARVN May-17-equivalent opponent-preview regression surface.

Deviations:
- The final ARVN profile-quality witness records the current replay-window surface: ready NVA/VC opponent-margin refs and non-uniform opponent-margin contributions. The live fixture did not expose `grantedOperationSimulated`; effectful grant-flow completion is proven by the generic architecture fixture instead.
- `pnpm -F @ludoforge/engine test:policy-profile-quality` remains red on an existing `fitl-march-dead-end-recovery` convergence witness before reaching the new witness; the new ARVN witness was run directly and passed.

Verification:
- `pnpm turbo build` — passed after the final marker correction.
- `node --test packages/engine/dist/test/architecture/preview-post-grant/fitl-like-ordered-free-operation-preview.test.js` — passed, 2 tests.
- `node --test packages/engine/dist/test/policy-profile-quality/probes/fitl-arvn-may17-equivalent-opponent-preview.test.js` — passed, 1 test.
- `node --test packages/engine/dist/test/unit/infrastructure/test-class-markers.test.js` — passed after correcting the profile-quality marker.
- `pnpm turbo lint` — passed.
- `pnpm turbo typecheck` — passed.
- `pnpm -F @ludoforge/engine test:all` — ran red only on `dist/test/unit/infrastructure/test-class-markers.test.js` before the marker correction; the affected marker test was rerun green afterward.
- `pnpm run check:ticket-deps` — passed with 0 active tickets and 2459 archived tickets.
