# Spec 174 Phase 4c Residual Owner

**Date**: 2026-05-16
**Decision owner**: `archive/tickets/174WASMDEEPPRV-014.md`
**Witness report**: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4c-residual.md`
**Witness CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4c-residual.csv`
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 400000 --date 2026-05-16-phase-4c-residual --profile-buckets`
**Next owner**: `archive/tickets/174WASMDEEPPRV-015.md`

## Summary

The Phase 4c rerun completed all 15 seeds and preserved the prior activation totals: production preview-drive route count `181`, unsupported count `3394`, and batch count `1712`.

The residual owner is not the rejected default flip in `archive/tickets/174WASMDEEPPRV-010.md`. The dominant residual class is still `coupArvnRedeployPolice:chooseOne`, with `278705.94 ms` of measured agent-call time and `0` production preview-drive route, unsupported, and batch counts. The top slow-tier axis for the same class records `129057.88 ms` and is dominated by token/query buckets: `tokenStateIndex:refreshCachedEntries` at `23099.70 ms` and `evalQuery:countMatchingTokens` at `8391.55 ms`.

## Dominant Residual Classification

| Microturn class | Agent-call ms | Route count | Unsupported count | Classification | Evidence |
|---|---:|---:|---:|---|---|
| `coupArvnRedeployPolice:chooseOne` | 278705.94 | 0 | 0 | dominated by token/query/runtime work outside the production preview-drive route | top slow-tier buckets: `tokenStateIndex:refreshCachedEntries=23099.70 ms`, `evalQuery:countMatchingTokens=8391.55 ms`; no WASM preview-drive counters |
| `coupArvnRedeployOptionalTroops:chooseOne` | 34117.37 | 0 | 0 | dominated by token/query/runtime work outside the production preview-drive route | top slow-tier buckets: `tokenStateIndex:refreshCachedEntries=2083.86 ms`, `evalQuery:countMatchingTokens=679.61 ms`; no WASM preview-drive counters |
| `govern:chooseNStep:add` | 42905.47 | 0 | 759 | hidden unsupported/fallback now exposed with reason-granular telemetry | `667` agent-guided completion rows; `92` no-projected-state terminal-boundary rows |
| `govern:chooseNStep:confirm` | 41219.77 | 0 | 464 | hidden unsupported/fallback now exposed with reason-granular telemetry | `464` no-projected-state terminal-boundary rows |
| `event` | 37701.38 | 0 | 457 | broad preview-drive unsupported class, not route activation | `457` card-event action candidate rows |
| `train:chooseNStep:add` | 27929.25 | 2 | 227 | mixed route activation plus deep continuation unsupported | `220` agent-guided completion rows; `7` no-projected-state terminal-boundary rows |
| `train:chooseNStep:confirm` | 18688.50 | 12 | 147 | mixed route activation plus deep continuation unsupported | `143` agent-guided completion rows; `4` no-projected-state terminal-boundary rows |

## Reason-Granular Unsupported Leaders

| Microturn class | Unsupported class | Unsupported owner | Reason | Count |
|---|---|---|---|---:|
| `govern:chooseNStep:add` | `agent-guided-completion` | `production-deep-choosenstep-continuation.pickInnerDecision` | deep preview-drive selected a non-chooseNStep continuation decision | 667 |
| `govern:chooseNStep:confirm` | `unknown` | `production-deep-choosenstep-continuation.projectedState` | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 464 |
| `event` | `unsupported-effect` | `production-preview-drive.cardEventAction` | production preview-drive does not route card event action candidates | 457 |
| `rally` | `unsupported-effect` | `production-preview-drive.cardEventAction` | production preview-drive does not route card event action candidates | 338 |
| `coupArvnRedeployPolice` | `unsupported-effect` | `production-preview-drive.actionBatch` | production preview-drive requires deterministic shared scalar runtime bindings | 330 |
| `train:chooseNStep:add` | `agent-guided-completion` | `production-deep-choosenstep-continuation.pickInnerDecision` | deep preview-drive selected a non-chooseNStep continuation decision | 220 |
| `govern` | `unsupported-effect` | `production-preview-drive.cardEventAction` | production preview-drive does not route card event action candidates | 176 |
| `train:chooseNStep:confirm` | `agent-guided-completion` | `production-deep-choosenstep-continuation.pickInnerDecision` | deep preview-drive selected a non-chooseNStep continuation decision | 143 |

## Decision

The next non-overlapping owner was `archive/tickets/174WASMDEEPPRV-015.md`: a generic token/query lifetime optimization for zero-counter `continuedDeepening` chooseOne residuals. That owner is separate from the rejected default flip in `archive/tickets/174WASMDEEPPRV-010.md` because the dominant class records no production preview-drive route, unsupported, or batch activity to flip.

The reason-granular unsupported evidence remains useful successor input, but it is not the first owner because the dominant residual wall time is outside the production preview-drive route. A later WASM coverage ticket may use the reason rows above after the zero-counter token/query owner has either reduced or disproved the dominant residual.
