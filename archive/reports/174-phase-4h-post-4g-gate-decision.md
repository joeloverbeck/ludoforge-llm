# Spec 174 Phase 4h - Post-4g Broad Gate Decision

**Status**: ✅ EXPLOITED — referenced during spec 174 implementation (archived 2026-05-16).

**Date**: 2026-05-16
**Verdict**: Fail
**Decision owner**: `archive/tickets/174WASMDEEPPRV-019.md`
**Witness report**: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4h-post-4g-gate.md`
**Witness CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4h-post-4g-gate.csv`
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 400000 --date 2026-05-16-phase-4h-post-4g-gate --profile-buckets`

## Gate Math

The Phase 4 gate requires the slow-tier median elapsed time for seeds `1005`, `1011`, `1008`, `1013`, and `1009` to improve by at least `25%` versus the post-008 baseline median.

| Metric | Value |
|---|---:|
| Post-008 baseline slow-tier median | 27211.75 ms |
| Required final median for 25% improvement | <= 20408.8125 ms |
| Phase 4h post-4g slow-tier median | 28601.78 ms |
| Delta vs baseline | +1390.03 ms |
| Percent change vs baseline | +5.1082% |
| Improvement | -5.1082% |
| Delta vs pass threshold | +8192.9675 ms |
| Verdict | Fail |

## Slow-Tier Per-Seed Wall Time

| Seed | Phase 4h wall ms | Gate role |
|---:|---:|---|
| 1005 | 64149.54 | slow tier |
| 1011 | 33182.64 | slow tier |
| 1008 | 28601.78 | slow-tier median |
| 1013 | 7018.31 | slow tier |
| 1009 | 9484.70 | slow tier |

For context, the earlier post-011 broad gate median was `62042.20 ms`; Phase 4h is substantially better than that broad failure but still above both the post-008 baseline and the required pass threshold.

## Activation Counters

| Counter | Value |
|---|---:|
| WASM production preview-drive route count | 1253 |
| WASM production preview-drive unsupported count | 2313 |
| WASM production preview-drive batch count | 1711 |

Route activation and unsupported provenance remain distinct. The fail verdict is not caused by an inactive witness, and fallback success is not counted as supported route coverage.

## Dominant Slow-Tier Axes

| Rank | Microturn class | Preview branch | Decisions | Total ms | Route count | Unsupported count | Batch count | Classification |
|---:|---|---|---:|---:|---:|---:|---:|---|
| 1 | `coupArvnRedeployPolice:chooseOne` | `continuedDeepening` | 236 | 26887.27 | 0 | 0 | 0 | zero-counter runtime residual outside production preview-drive route counters |
| 2 | `govern:chooseNStep:confirm` | `continuedDeepening` | 27 | 19309.53 | 0 | 464 | 0 | terminal-boundary projected-state unsupported rows |
| 3 | `train:chooseNStep:add` | `continuedDeepening` | 11 | 16289.03 | 222 | 7 | 0 | activated route plus remaining terminal-boundary projected-state unsupported rows |
| 4 | `event` | `singlePass` | 161 | 13497.45 | 0 | 457 | 0 | card-event action unsupported rows |
| 5 | `govern:chooseNStep:add` | `continuedDeepening` | 43 | 12300.16 | 663 | 89 | 0 | activated route plus remaining terminal-boundary projected-state unsupported rows |
| 6 | `train:chooseNStep:confirm` | `continuedDeepening` | 12 | 10803.37 | 155 | 4 | 0 | activated route plus remaining terminal-boundary projected-state unsupported rows |

## Hot Buckets For Dominant Axes

| Axis | Top bucket | Count | Total ms | Notes |
|---|---|---:|---:|---|
| `coupArvnRedeployPolice:chooseOne | continuedDeepening` | `tokenStateIndex:refreshCachedEntries` | 479298 | 4707.70 | zero-counter residual; no route, unsupported, or batch counts |
| `coupArvnRedeployPolice:chooseOne | continuedDeepening` | `evalQuery:countMatchingTokens` | 570974 | 702.52 | generic token/query work remains visible |
| `govern:chooseNStep:confirm | continuedDeepening` | `tokenStateIndex:refreshCachedEntries` | 55244 | 785.04 | paired with `464` terminal-boundary projected-state unsupported rows |
| `govern:chooseNStep:confirm | continuedDeepening` | `evalQuery:applyTokenFilter` | 375925 | 705.71 | generic query work, not a default-flip permission |
| `train:chooseNStep:add | continuedDeepening` | `zobrist:digestDecisionStackFrame` | 20128 | 3480.62 | route active, but digest/encode residual remains visible |
| `train:chooseNStep:add | continuedDeepening` | `zobrist:encodeDecisionStackFrame` | 20344 | 1966.49 | route active, but digest/encode residual remains visible |
| `train:chooseNStep:confirm | continuedDeepening` | `zobrist:digestDecisionStackFrame` | 12646 | 2268.84 | route active, but digest/encode residual remains visible |
| `train:chooseNStep:confirm | continuedDeepening` | `zobrist:encodeDecisionStackFrame` | 13158 | 1296.52 | route active, but digest/encode residual remains visible |

## Unsupported Leaders

| Microturn class | Unsupported owner | Reason | Count | Class route total |
|---|---|---|---:|---:|
| `govern:chooseNStep:confirm` | `production-deep-choosenstep-continuation.projectedState` | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 464 | 0 |
| `event` | `production-preview-drive.cardEventAction` | production preview-drive does not route card event action candidates | 457 | 0 |
| `rally` | `production-preview-drive.cardEventAction` | production preview-drive does not route card event action candidates | 338 | 0 |
| `coupArvnRedeployPolice` | `production-preview-drive.actionBatch` | production preview-drive requires deterministic shared scalar runtime bindings | 330 | 0 |
| `govern` | `production-preview-drive.cardEventAction` | production preview-drive does not route card event action candidates | 174 | 0 |
| `govern:chooseNStep:add` | `production-deep-choosenstep-continuation.projectedState` | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 89 | 663 |

## Decision

The broad Phase 4h gate fails. This does not authorize a default flip or A/B deletion, and `archive/tickets/174WASMDEEPPRV-010.md` remains historical rejected evidence.

No fresh default-flip ticket was created. No new measured-owner ticket was created in this closeout because the top measured residual is again the zero-counter `coupArvnRedeployPolice:chooseOne | continuedDeepening` axis. That overlaps the archived Phase 4d owner in `archive/tickets/174WASMDEEPPRV-015.md`, and this broad run does not by itself identify a new non-overlapping implementation seam beyond the already-attempted token/query/publication residual family.

The unsupported rows are concrete successor input, especially terminal-boundary projected-state rows under `production-deep-choosenstep-continuation.projectedState` and card-event/action-batch unsupported rows. They are not selected as an immediate successor here because the dominant slow-tier measured axis remains outside production preview-drive route counters. A future owner should start from this report and either prove a non-overlapping zero-counter owner or explicitly shift the series to one of the reason-granular unsupported classes with a measurable default-route gate rationale.
