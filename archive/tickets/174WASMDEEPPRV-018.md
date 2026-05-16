# 174WASMDEEPPRV-018: Phase 4g — Reduce repeated decision-stack digest cost after continuation materialization

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — generic decision-stack digest/cache reuse and bounded Phase 4g witness
**Deps**: `archive/tickets/174WASMDEEPPRV-017.md`, `reports/174-phase-4f-non-choosenstep-continuation.md`, `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4f-non-choosenstep-continuation-final.md`, `archive/tickets/174WASMDEEPPRV-010.md`

## Problem

`archive/tickets/174WASMDEEPPRV-017.md` completed generic `chooseOne` deep continuation materialization and eliminated the Phase 4e `production-deep-choosenstep-continuation.pickInnerDecision` unsupported owner, but the bounded seed-1005 witness regressed from `62297.98 ms` to `63872.98 ms`. That is not a Phase 4 gate pass and does not authorize `archive/tickets/174WASMDEEPPRV-010.md`.

The post-017 report shows the same `train:chooseNStep:add | continuedDeepening` and `train:chooseNStep:confirm | continuedDeepening` axes still dominate the bounded sample. Their hot-path buckets are now led by repeated decision-stack digest/encode work:

- `train:chooseNStep:add | continuedDeepening`: `zobrist:digestDecisionStackFrame` `20128` calls / `3407.66 ms`; `zobrist:encodeDecisionStackFrame` `20344` calls / `1895.33 ms`.
- `train:chooseNStep:confirm | continuedDeepening`: `zobrist:digestDecisionStackFrame` `12646` calls / `2224.01 ms`; `zobrist:encodeDecisionStackFrame` `13158` calls / `1287.08 ms`.

This ticket owns the next non-overlapping generic cost-reduction slice: reduce repeated decision-stack frame digest/encode work on the deep preview-drive path without changing route semantics, hiding unsupported provenance, or reopening the default flip.

## Assumption Reassessment (2026-05-16)

1. `archive/tickets/174WASMDEEPPRV-017.md` retained generic `chooseOne` materialization and route activation; route count increased from `12` to `310`, unsupported count dropped from `519` to `221`, and the Phase 4e pickInnerDecision unsupported owner was eliminated.
2. The final Phase 4f bounded witness still failed the performance story: seed `1005` wall time regressed from `62297.98 ms` to `63872.98 ms`; `train:chooseNStep:add` regressed to `16401.44 ms`; `train:chooseNStep:confirm` regressed to `11149.88 ms`.
3. The post-017 top hot buckets identify a generic kernel/runtime owner, not a FITL-specific owner: repeated decision-stack frame digest/encode work dominates the two top slow axes after continuation materialization.
4. Residual unsupported rows remain explicit, including terminal-boundary/projected-state rows and existing card-event/shared-scalar unsupported owners. This ticket must not treat those unsupported rows as successful route activation.

## Architecture Check

1. Foundation #1: any retained optimization must be game-agnostic and operate on generic decision-stack frame identity, parent digest, runtime cache state, or preview-drive publication data. No FITL action names, factions, cards, profile labels, or microturn-class string branches are allowed in runtime code.
2. Foundation #20: unsupported/fallback rows remain explicit. Reducing digest/encode cost cannot reclassify unsupported rows as supported routes or suppress unavailable-preview provenance.
3. Foundation #14: `archive/tickets/174WASMDEEPPRV-010.md` remains rejected. This ticket does not delete A/B routing, flip defaults, or claim a gate pass without measured evidence.
4. Determinism boundary: any digest/cache reuse must preserve canonical `computeFullHash` output, decision-stack frame digest values, replay identity, and forked-runtime isolation.

## What to Change

### 1. Digest/encode ownership inventory

Inspect the post-017 deep preview-drive path and identify why `digestDecisionStackFrame` and `encodeDecisionStackFrameDigestInput` are repeated across the dominant continued-deepening axes. Classify the repeats by generic owner, such as:

- missing run-local cache reuse for structurally identical frame plus parent digest pairs
- cache keys that include unstable object identity instead of canonical frame content
- repeated full-state hash recomputation after already-materialized continuation patches
- preview-drive publication/probe loops rebuilding equivalent frame digests

Record the classification in a new Phase 4g report before retaining runtime changes.

### 2. Generic digest/cache reduction

Retain only a generic optimization that is safe across games and runtimes. Candidate approaches include:

- strengthening run-local frame digest cache reuse for canonical frame plus parent digest keys
- threading an already-known parent/frame digest through deep continuation replay when the value is already canonical
- avoiding duplicate encode/digest calls inside the same preview-drive attempt when no state, frame, or parent digest changed

The retained change must fail closed to the existing canonical digest path when cache identity, parent digest, or frame content is unavailable or ambiguous.

### 3. Parity and isolation proof

Add focused proof that the retained optimization preserves:

- canonical decision-stack frame digest values
- full projected state identity for the affected deep preview-drive path
- forked-runtime cache isolation
- route/unsupported provenance counters

The proof must compare canonical artifacts, not only route counts or timing.

### 4. Bounded Phase 4g witness

Rerun the bounded seed-1005 witness with hot-path buckets and record:

- before/after seed wall time
- top continued-deepening axes
- `zobrist:digestDecisionStackFrame` and `zobrist:encodeDecisionStackFrame` counts and total ms for the top axes
- production preview-drive route, unsupported, and batch counts
- reason-granular unsupported rows

If the bounded witness does not improve materially, record that truth and keep `archive/tickets/174WASMDEEPPRV-010.md` rejected.

## Files to Touch

- `packages/engine/src/kernel/zobrist.ts` (modify only if generic digest/cache reuse changes)
- `packages/engine/src/kernel/gamedef-runtime.ts` (modify only if run-local cache shape or fork behavior changes)
- `packages/engine/src/agents/policy-preview-inner-deepening.ts` (modify only if deep preview-drive can safely reuse canonical digest context)
- `packages/engine/src/agents/policy-wasm-preview-drive-state-patch.ts` (modify only if projected-state hash/digest recomputation can be safely avoided)
- `packages/engine/test/integration/zobrist-frame-digest-cache-equivalence.test.ts` or adjacent focused tests (modify/add)
- `packages/engine/test/integration/policy-wasm-preview-choosenstep-continuation-materialization.test.ts` or adjacent preview-drive parity tests (modify/add only if needed)
- `reports/174-phase-4g-decision-stack-digest-cost.md` (new)
- `reports/fitl-arvn-15-seed-decomposition-<YYYY-MM-DD>-phase-4g-decision-stack-digest-cost-*.md` (new bounded witness report)
- `reports/fitl-arvn-15-seed-decomposition-<YYYY-MM-DD>-phase-4g-decision-stack-digest-cost-*.csv` (new bounded witness CSV)
- `archive/specs/174-wasm-preview-drive-coverage-extension.md` (modify for outcome/ticket-list parity)

## Out of Scope

- No default flip or A/B wiring deletion; `archive/tickets/174WASMDEEPPRV-010.md` remains rejected until a later measured gate records a Pass.
- No FITL-specific identifiers, action names, card names, faction branches, profile labels, or microturn-class branches in runtime code.
- No GameSpecDoc, policy profile, `depthCap`, `maxOptions`, `chooseNBeamWidth`, or `capClass` changes.
- No broad 15-seed final gate rerun unless the bounded Phase 4g evidence justifies it and the ticket outcome records the exact command.
- No unsupported-row suppression: terminal-boundary/projected-state, card-event, and shared-scalar unsupported rows must remain explicit until separate tickets own them.

## Acceptance Criteria

### Tests That Must Pass

1. A focused digest/cache parity test proves the optimized path returns the same canonical decision-stack frame digest as the uncached/canonical path.
2. A focused preview-drive parity test proves the affected deep continuation path produces the same projected state and route/unsupported provenance as before the optimization.
3. A forked-runtime isolation test proves any retained cache state is run-local and cannot leak across forked or independent runs.
4. A bounded seed-1005 Phase 4g report records before/after wall time, top hot-path bucket counts/ms, route counts, unsupported counts, batch counts, and reason-granular unsupported rows.
5. Existing engine suite remains green: `pnpm turbo test`.

### Invariants

1. Decision-stack digest values remain canonical across object identity, forked runtime state, and replay order.
2. Unsupported/fallback rows cannot count as supported WASM route activation.
3. The default flip remains blocked unless a later measured gate records a Pass.
4. Retained changes remain deterministic across GameDef, state, seed, and actions.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/zobrist-frame-digest-cache-equivalence.test.ts` or adjacent test — strengthen canonical digest/cache parity and fork isolation for the retained cache strategy.
2. `packages/engine/test/integration/policy-wasm-preview-choosenstep-continuation-materialization.test.ts` or adjacent preview-drive parity test — confirm projected state and provenance remain stable on the optimized deep continuation path.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine exec node --test <focused-dist-test-paths>`
3. `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005 --timeout-ms 400000 --date <YYYY-MM-DD>-phase-4g-decision-stack-digest-cost --profile-buckets`
4. `pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

## Outcome

Implementation completed on 2026-05-16.

### Retained code

The retained generic optimization is in `packages/engine/src/agents/policy-wasm-preview-drive-state-patch.ts`.

`materializePolicyWasmPreviewStatePatch` now tracks whether its mirror state is still synchronized with a kernel-applied published decision. Manual patch operations still use the existing canonical `computeFullHash` fallback. When a patch stream ends after `applyChooseNStepDecision` or `applyChooseOneDecision` and all mirrors were synced from the `applyPublishedDecision` result, the materializer returns the already-canonical applied `GameState.stateHash` and records `policyWasmStatePatch:reuseAppliedStateHash`.

This keeps the optimization generic and fail-closed: ambiguous or manually patched state still recomputes through the canonical hash path.

### Touched-file scope

- Modified: `packages/engine/src/agents/policy-wasm-preview-drive-state-patch.ts`
- Modified: `packages/engine/test/integration/policy-wasm-preview-choosenstep-continuation-materialization.test.ts`
- Verified-no-edit: `packages/engine/src/kernel/zobrist.ts` already contains the run-local frame digest cache and canonical recompute path; no cache-shape change was required.
- Verified-no-edit: `packages/engine/src/kernel/gamedef-runtime.ts` already forks `zobristTable.frameDigestCache` run-locally; no runtime cache-shape change was required.
- Verified-no-edit: `packages/engine/src/agents/policy-preview-inner-deepening.ts` already threads the runtime into state-patch materialization; no route semantics change was required.
- New report: `reports/174-phase-4g-decision-stack-digest-cost.md`
- New bounded witness report: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4g-decision-stack-digest-cost-final.md`
- New bounded witness CSV: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4g-decision-stack-digest-cost-final.csv`
- Updated spec: `archive/specs/174-wasm-preview-drive-coverage-extension.md`

### Bounded Phase 4g witness

Final command:

```bash
node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005 --timeout-ms 400000 --date 2026-05-16-phase-4g-decision-stack-digest-cost-final --profile-buckets
```

Artifacts:

- `reports/174-phase-4g-decision-stack-digest-cost.md`
- `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4g-decision-stack-digest-cost-final.md`
- `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4g-decision-stack-digest-cost-final.csv`

| Metric | Phase 4f baseline | Phase 4g final | Delta |
|---|---:|---:|---:|
| Seed wall ms | 63872.98 | 59610.96 | -4262.02 |
| Decisions | 790 | 790 | 0 |
| WASM production preview-drive routes | 310 | 310 | 0 |
| WASM production preview-drive unsupported | 221 | 221 | 0 |
| WASM production preview-drive batches | 199 | 199 | 0 |

Top continued-deepening axes:

| Axis | Phase 4f total ms | Phase 4g total ms | Delta |
|---|---:|---:|---:|
| `train:chooseNStep:add` | 16401.44 | 15115.11 | -1286.33 |
| `train:chooseNStep:confirm` | 11149.88 | 9993.24 | -1156.64 |

Digest/encode bucket comparison:

| Axis / bucket | Phase 4f count | Phase 4f ms | Phase 4g count | Phase 4g ms | Delta ms |
|---|---:|---:|---:|---:|---:|
| `train:chooseNStep:add` / `zobrist:digestDecisionStackFrame` | 20128 | 3407.66 | 20128 | 3385.16 | -22.50 |
| `train:chooseNStep:add` / `zobrist:encodeDecisionStackFrame` | 20344 | 1895.33 | 20344 | 1832.19 | -63.14 |
| `train:chooseNStep:confirm` / `zobrist:digestDecisionStackFrame` | 12646 | 2224.01 | 12646 | 2208.62 | -15.39 |
| `train:chooseNStep:confirm` / `zobrist:encodeDecisionStackFrame` | 13158 | 1287.08 | 13158 | 1229.91 | -57.17 |

The retained route is active in the top train axes: `policyWasmStatePatch:reuseAppliedStateHash` recorded `1432` hits for `train:chooseNStep:add` and `1144` hits for `train:chooseNStep:confirm`. The digest/encode counts remain visible residual work, so this is a retained generic hash-reuse slice rather than an elimination of the train decision-stack digest owner.

Unsupported provenance is unchanged: the final bounded witness still records `5` terminal-boundary/projected-state unsupported rows for `train:chooseNStep:add` and `3` for `train:chooseNStep:confirm`; card-event and shared-scalar unsupported rows remain explicit. Fallback success does not count as route activation.

This is not a broad Phase 4 gate pass and does not authorize the default flip or A/B deletion. `archive/tickets/174WASMDEEPPRV-010.md` remains rejected until a later measured gate records a Pass.

### Source-size ledger

Pre-final counts:

- `packages/engine/src/agents/policy-wasm-preview-drive-state-patch.ts`: before `289`, after `298`; active growth `9`; under cap.
- `packages/engine/test/integration/policy-wasm-preview-choosenstep-continuation-materialization.test.ts`: before `255`, after `284`; active growth `29`; under cap.

### Command ledger

- PASS: `pnpm -F @ludoforge/engine build`
- PASS: `pnpm -F @ludoforge/engine exec node --test dist/test/integration/zobrist-frame-digest-cache-equivalence.test.js dist/test/integration/policy-wasm-preview-choosenstep-continuation-materialization.test.js` (`6` tests, `2` suites)
- PASS: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005 --timeout-ms 400000 --date 2026-05-16-phase-4g-decision-stack-digest-cost-final --profile-buckets`
- PASS: `pnpm turbo test` (`5` tasks successful, `1` cached build task; runner jsdom/canvas advisory stderr was non-ticket-owned and tests passed)
- PASS: `pnpm turbo lint` (`2` tasks successful, `1` cached runner lint task)
- PASS: `pnpm turbo typecheck` (`3` tasks successful, `1` cached engine build task)
- PASS: post-broad focused rerun `pnpm -F @ludoforge/engine exec node --test dist/test/integration/zobrist-frame-digest-cache-equivalence.test.js dist/test/integration/policy-wasm-preview-choosenstep-continuation-materialization.test.js` (`6` tests, `2` suites)
- PASS: `pnpm run check:ticket-deps` (`2` active tickets, `2367` archived tickets)

Late-edit proof validity: terminal status/proof/dependency-check transcription only; no scope, acceptance, command semantics, touched-file ownership, dependency ownership, or proof claim changed after the final lanes. The post-broad focused rerun covers the compiled-output witness after Turbo producers. The dependency-check transcription records the just-run checker result without changing ticket graph edges.
