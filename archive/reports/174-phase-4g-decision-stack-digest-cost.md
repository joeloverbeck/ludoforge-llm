# Spec 174 Phase 4g - Decision-stack digest cost after continuation materialization

**Status**: ✅ EXPLOITED — referenced during spec 174 implementation (archived 2026-05-16).

**Date**: 2026-05-16
**Ticket**: `archive/tickets/174WASMDEEPPRV-018.md`
**Status**: Retained generic state-patch hash reuse; no Phase 4 default-flip pass.

## Scope

Phase 4f eliminated the `production-deep-choosenstep-continuation.pickInnerDecision` unsupported owner by materializing generic `chooseOne` continuations, but the bounded seed-1005 witness regressed to `63872.98 ms`. The dominant remaining train continued-deepening axes were led by repeated `zobrist:digestDecisionStackFrame` and `zobrist:encodeDecisionStackFrame` bucket time.

Phase 4g inspected the retained deep continuation path and found a generic post-materialization recompute seam: `materializePolicyWasmPreviewStatePatch` recomputed a full projected-state hash even when a patch stream ended synchronized to a kernel-applied published decision whose resulting `GameState` already carried the canonical `stateHash`.

## Retained Change

`packages/engine/src/agents/policy-wasm-preview-drive-state-patch.ts` now tracks whether the materializer's structural `GameState` mirrors remain current.

- Manual patch operations (`setGlobalVar`, `setZoneVar`, `moveToken`, `setTokenProp`, `setMarker`, `setActionUsage`, and `setMicroturnMetadata`) keep the existing fail-closed full `computeFullHash` path.
- Generic `applyChooseNStepDecision` and `applyChooseOneDecision` materialization sync all mirrors from the `applyPublishedDecision` result.
- If the patch stream ends in that synchronized state, the materializer returns the already-canonical applied state hash and records `policyWasmStatePatch:reuseAppliedStateHash`.

This is game-agnostic and does not change route semantics, unsupported classification, GameSpecDoc data, policy profile bounds, or A/B/default routing.

## Proof Artifacts

- Final report: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4g-decision-stack-digest-cost-final.md`
- Final CSV: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4g-decision-stack-digest-cost-final.csv`

Final command:

```bash
node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005 --timeout-ms 400000 --date 2026-05-16-phase-4g-decision-stack-digest-cost-final --profile-buckets
```

## Seed-1005 Summary

| Metric | Phase 4f baseline | Phase 4g final | Delta |
|---|---:|---:|---:|
| Seed wall ms | 63872.98 | 59610.96 | -4262.02 |
| Decisions | 790 | 790 | 0 |
| WASM production preview-drive routes | 310 | 310 | 0 |
| WASM production preview-drive unsupported | 221 | 221 | 0 |
| WASM production preview-drive batches | 199 | 199 | 0 |

The bounded single-seed wall time improved by about `6.67%`. This is useful bounded evidence for the retained generic reuse, but it is not the broad 15-seed Phase 4 gate and does not authorize `archive/tickets/174WASMDEEPPRV-010.md`.

## Top Continued-Deepening Axes

| Axis | Phase 4f total ms | Phase 4g total ms | Delta |
|---|---:|---:|---:|
| `train:chooseNStep:add` | 16401.44 | 15115.11 | -1286.33 |
| `train:chooseNStep:confirm` | 11149.88 | 9993.24 | -1156.64 |

## Digest/Encode Bucket Comparison

| Axis / bucket | Phase 4f count | Phase 4f ms | Phase 4g count | Phase 4g ms | Delta ms |
|---|---:|---:|---:|---:|---:|
| `train:chooseNStep:add` / `zobrist:digestDecisionStackFrame` | 20128 | 3407.66 | 20128 | 3385.16 | -22.50 |
| `train:chooseNStep:add` / `zobrist:encodeDecisionStackFrame` | 20344 | 1895.33 | 20344 | 1832.19 | -63.14 |
| `train:chooseNStep:confirm` / `zobrist:digestDecisionStackFrame` | 12646 | 2224.01 | 12646 | 2208.62 | -15.39 |
| `train:chooseNStep:confirm` / `zobrist:encodeDecisionStackFrame` | 13158 | 1287.08 | 13158 | 1229.91 | -57.17 |

The retained change activates on the target route (`policyWasmStatePatch:reuseAppliedStateHash` count `1432` for `train:chooseNStep:add` and `1144` for `train:chooseNStep:confirm`). The bucket counts remain unchanged in the top train axes, so the residual repeated digest/encode owner is not eliminated. The measured bucket time improved modestly while the total bounded witness improved materially enough to keep the generic reuse.

## Unsupported Rows

Unsupported provenance is unchanged and remains explicit:

- `train:chooseNStep:add`: `5` terminal-boundary/projected-state unsupported rows.
- `train:chooseNStep:confirm`: `3` terminal-boundary/projected-state unsupported rows.
- Existing card-event and shared-scalar unsupported rows remain visible in the report.

## Verdict

Phase 4g retained a generic hash-reuse optimization for WASM continuation state-patch materialization. It preserves projected-state identity, keeps fork/run-local digest cache isolation, and records route activation separately from unsupported provenance.

This is not a default-flip or A/B deletion gate pass. `archive/tickets/174WASMDEEPPRV-010.md` remains rejected until a later measured gate records a Pass. The remaining repeated decision-stack digest/encode counts in the train continued-deepening axes are still visible residual work for future profiling, but this ticket's retained slice is complete.
