# Spec 176 Phase 4 — H4 Bytecode Cache Amortization

**Status**: ✅ EXPLOITED — archived 2026-05-19.

**Date**: 2026-05-17
**Status**: Measured verdict for H4.
**Command**: `POLICY_WASM_TIMING_PROFILE=1 node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 600000 --date 2026-05-17-phase-4-h4-cache-amortization`
**Witness Markdown**: `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-4-h4-cache-amortization.md`
**Witness CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-4-h4-cache-amortization.csv`

## Verdict

`cache-cost-negligible`

The bytecode cache amortizes close to the clean threshold, but not strictly under it: overall hit rate was `95.11%` while total compile time was `25.52 ms`, or `5.52%` of WASM execution time (`461.88 ms`). The slow-tier subtotal was effectively the same: `95.07%` hit rate and `5.57%` compile/execution ratio. No axis reached the `cache-thrashes` threshold: the largest per-axis compile/execution ratio was `16.25%` on `coupPacifyARVN|singlePass`, below the `20%` dominant-cache-cost threshold.

This supports the Phase 6 branch that H4 is observable but not the dominant cause of the WASM/TS wall-time equivalence. A small cache-specific follow-up is not justified by this evidence alone.

## Totals

| Scope | Cache hits | Cache misses | Hit rate | Compile ms | WASM execution ms | Compile / execution |
|---|---:|---:|---:|---:|---:|---:|
| All 15 seeds | 11664 | 600 | 95.11% | 25.52 | 461.88 | 5.52% |
| Slow tier only | 11561 | 600 | 95.07% | 25.52 | 458.47 | 5.57% |

## Per-Axis Table

Axes use the live profiler taxonomy `microturnClass|previewBranch`.

| Axis label | Cache hits | Cache misses | Hit rate | Compile ms | WASM execution ms | Compile / execution |
|---|---:|---:|---:|---:|---:|---:|
| `event|singlePass` | 2328 | 234 | 90.87% | 11.18 | 104.22 | 10.72% |
| `rally|singlePass` | 731 | 100 | 87.97% | 4.12 | 35.19 | 11.71% |
| `govern|singlePass` | 848 | 96 | 89.83% | 3.44 | 34.89 | 9.85% |
| `coupPacifyARVN|singlePass` | 250 | 30 | 89.29% | 1.65 | 10.16 | 16.25% |
| `march|singlePass` | 405 | 66 | 85.99% | 1.59 | 17.62 | 9.04% |
| `coupAgitateVC|singlePass` | 310 | 12 | 96.27% | 0.72 | 12.93 | 5.59% |
| `advise|singlePass` | 461 | 8 | 98.29% | 0.65 | 18.90 | 3.46% |
| `train|singlePass` | 198 | 12 | 94.29% | 0.54 | 7.73 | 6.97% |
| `infiltrate|singlePass` | 465 | 16 | 96.67% | 0.51 | 19.40 | 2.62% |
| `coupRedeployPass|singlePass` | 745 | 15 | 98.03% | 0.44 | 25.85 | 1.69% |
| `assault|singlePass` | 228 | 3 | 98.70% | 0.23 | 8.74 | 2.61% |
| `coupVictoryCheck|singlePass` | 216 | 4 | 98.18% | 0.23 | 7.45 | 3.04% |
| `coupCommitmentPass|singlePass` | 798 | 2 | 99.75% | 0.11 | 27.78 | 0.40% |
| `coupPacifyPass|singlePass` | 416 | 2 | 99.52% | 0.11 | 14.79 | 0.74% |
| `ambushNva|singlePass` | 65 | 0 | 100.00% | 0.00 | 2.20 | 0.00% |
| `ambushVc|singlePass` | 58 | 0 | 100.00% | 0.00 | 2.28 | 0.00% |
| `attack|singlePass` | 155 | 0 | 100.00% | 0.00 | 6.05 | 0.00% |
| `coupAgitatePass|singlePass` | 120 | 0 | 100.00% | 0.00 | 4.35 | 0.00% |
| `coupArvnRedeployMandatory|singlePass` | 24 | 0 | 100.00% | 0.00 | 0.89 | 0.00% |
| `coupArvnRedeployOptionalTroops|singlePass` | 704 | 0 | 100.00% | 0.00 | 26.13 | 0.00% |
| `coupArvnRedeployPolice|singlePass` | 688 | 0 | 100.00% | 0.00 | 24.35 | 0.00% |
| `coupCommitmentResolve|singlePass` | 99 | 0 | 100.00% | 0.00 | 3.44 | 0.00% |
| `coupNvaRedeployTroops|singlePass` | 235 | 0 | 100.00% | 0.00 | 7.65 | 0.00% |
| `coupPacifyUS|singlePass` | 790 | 0 | 100.00% | 0.00 | 27.78 | 0.00% |
| `coupResourcesResolve|singlePass` | 220 | 0 | 100.00% | 0.00 | 7.46 | 0.00% |
| `pass|singlePass` | 13 | 0 | 100.00% | 0.00 | 0.42 | 0.00% |
| `patrol|singlePass` | 10 | 0 | 100.00% | 0.00 | 0.32 | 0.00% |
| `resolveHonoluluPacify|singlePass` | 28 | 0 | 100.00% | 0.00 | 0.89 | 0.00% |
| `transport|singlePass` | 56 | 0 | 100.00% | 0.00 | 1.99 | 0.00% |

## Phase 6 Implication

H4 should not drive an `Accelerate WASM` decision by itself. Compile cost is measurable, but it is neither a cache-thrash failure nor a dominant share of the 15-seed policy WASM execution surface. Phase 6 should treat H4 as a minor contributor and weigh the stronger Phase 1–3 and Phase 5 evidence before selecting Keep, Accelerate, or Retire.
