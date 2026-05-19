# Spec 176 Phase 5 — H5 State Serialization Cost

**Status**: ✅ EXPLOITED — archived 2026-05-19.

**Date**: 2026-05-17
**Status**: Measured verdict for H5.
**Command**: `POLICY_WASM_TIMING_PROFILE=1 node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 600000 --date 2026-05-17-phase-5-h5-serialization`
**Witness Markdown**: `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-5-h5-serialization.md`
**Witness CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-5-h5-serialization.csv`

## Verdict

`serialization-mixed-overhead-dominant`

The Phase 5 run recorded `407,142,300` serialized input bytes across `18,048` WASM calls. Total marshaling time was `1,309.86 ms`, compared with `479.28 ms` of WASM execution time. On the slow tier, marshaling was `529.53 ms` against `191.59 ms` execution time, so serialization/marshaling is material and cannot be classified as `serialization-not-dominant`.

The byte-size relationship is present but not strong enough to satisfy the pre-registered `serialization-linear-in-bytes` threshold: Pearson `r` for `bytesPerCall` vs `marshalingMsPerCall` was `0.4705` overall and `0.5900` on slow-tier axes, below the `0.7` linear threshold. It also does not satisfy the stricter pre-registered `serialization-fixed-overhead-dominant` threshold because the overall Pearson result is not `<0.4`. The added verdict label records this measured middle state rather than forcing the evidence into a failed threshold.

Bytecode input-cache write cost was not observed in the 15-seed campaign (`0` writes, `0` bytes, `0.0000 ms`). The focused unit test proves the write accumulator on a miss, but this witness shows cache-write cost is not a Phase 5 campaign factor.

## Totals

| Scope | WASM calls | Total bytes | Bytes/call | Marshaling ms | Execution ms | Marshaling / execution | Pearson r |
|---|---:|---:|---:|---:|---:|---:|---:|
| All 15 seeds | 18048 | 407142300 | 22558.85 | 1309.86 | 479.28 | 2.73x | 0.4705 |
| Slow tier only | 7854 | 159855164 | 20354.62 | 529.53 | 191.59 | 2.76x | 0.5900 |

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`.

## Per-Axis Table

Axes use the live profiler taxonomy `microturnClass|previewBranch`.

| Axis label | WASM calls | Total bytes | Bytes/call | Marshaling ms/call | Cache write ms | Cache write bytes | Cache write count |
|---|---:|---:|---:|---:|---:|---:|---:|
| `event|singlePass` | 2562 | 85327848 | 33305.17 | 0.088195 | 0.0000 | 0 | 0 |
| `rally|singlePass` | 1212 | 27993848 | 23097.23 | 0.097719 | 0.0000 | 0 | 0 |
| `govern:chooseNStep:add|continuedDeepening` | 2124 | 288864 | 136.00 | 0.047215 | 0.0000 | 0 | 0 |
| `govern|singlePass` | 986 | 31246976 | 31690.65 | 0.083550 | 0.0000 | 0 | 0 |
| `coupArvnRedeployOptionalTroops|singlePass` | 740 | 23542464 | 31814.14 | 0.089712 | 0.0000 | 0 | 0 |
| `coupPacifyUS|singlePass` | 896 | 25835728 | 28834.52 | 0.070120 | 0.0000 | 0 | 0 |
| `coupArvnRedeployPolice|singlePass` | 708 | 22789416 | 32188.44 | 0.085634 | 0.0000 | 0 | 0 |
| `infiltrate|singlePass` | 617 | 16659108 | 27000.18 | 0.095106 | 0.0000 | 0 | 0 |
| `advise|singlePass` | 633 | 15604616 | 24651.84 | 0.089118 | 0.0000 | 0 | 0 |
| `coupCommitmentPass|singlePass` | 931 | 26127356 | 28063.76 | 0.060162 | 0.0000 | 0 | 0 |
| `coupRedeployPass|singlePass` | 842 | 24839640 | 29500.76 | 0.063930 | 0.0000 | 0 | 0 |
| `march|singlePass` | 578 | 15575624 | 26947.45 | 0.080483 | 0.0000 | 0 | 0 |
| `train:chooseNStep:add|continuedDeepening` | 1044 | 141984 | 136.00 | 0.042113 | 0.0000 | 0 | 0 |
| `coupAgitateVC|singlePass` | 506 | 10689304 | 21125.11 | 0.083278 | 0.0000 | 0 | 0 |
| `coupPacifyPass|singlePass` | 478 | 13645944 | 28548.00 | 0.063741 | 0.0000 | 0 | 0 |
| `coupPacifyARVN|singlePass` | 346 | 9221372 | 26651.36 | 0.072942 | 0.0000 | 0 | 0 |
| `train|singlePass` | 318 | 6992108 | 21987.76 | 0.077099 | 0.0000 | 0 | 0 |
| `assault|singlePass` | 311 | 7620036 | 24501.72 | 0.075516 | 0.0000 | 0 | 0 |
| `train:chooseNStep:confirm|continuedDeepening` | 624 | 84864 | 136.00 | 0.031699 | 0.0000 | 0 | 0 |
| `attack|singlePass` | 199 | 5301016 | 26638.27 | 0.092377 | 0.0000 | 0 | 0 |
| `coupNvaRedeployTroops|singlePass` | 249 | 7670696 | 30806.01 | 0.068694 | 0.0000 | 0 | 0 |
| `coupResourcesResolve|singlePass` | 240 | 7164780 | 29853.25 | 0.063542 | 0.0000 | 0 | 0 |
| `coupVictoryCheck|singlePass` | 240 | 7163520 | 29848.00 | 0.061497 | 0.0000 | 0 | 0 |
| `coupAgitatePass|singlePass` | 170 | 3952020 | 23247.18 | 0.077596 | 0.0000 | 0 | 0 |
| `ambushVc|singlePass` | 96 | 1945968 | 20270.50 | 0.084427 | 0.0000 | 0 | 0 |
| `coupCommitmentResolve|singlePass` | 117 | 3237396 | 27670.05 | 0.052802 | 0.0000 | 0 | 0 |
| `ambushNva|singlePass` | 76 | 2159188 | 28410.37 | 0.080297 | 0.0000 | 0 | 0 |
| `transport|singlePass` | 56 | 1854252 | 33111.64 | 0.089000 | 0.0000 | 0 | 0 |
| `event-decision:chooseNStep:add|continuedDeepening` | 69 | 9384 | 136.00 | 0.049893 | 0.0000 | 0 | 0 |
| `coupArvnRedeployMandatory|singlePass` | 28 | 798316 | 28511.29 | 0.066439 | 0.0000 | 0 | 0 |
| `resolveHonoluluPacify|singlePass` | 28 | 909812 | 32493.29 | 0.051996 | 0.0000 | 0 | 0 |
| `pass|singlePass` | 14 | 423180 | 30227.14 | 0.049136 | 0.0000 | 0 | 0 |
| `patrol|singlePass` | 10 | 325672 | 32567.20 | 0.041250 | 0.0000 | 0 | 0 |

## Slow-Tier Subtotal

| Scope | WASM calls | Total bytes | Bytes/call | Marshaling ms | Execution ms |
|---|---:|---:|---:|---:|---:|
| Slow tier | 7854 | 159855164 | 20354.62 | 529.53 | 191.59 |

## Correlation Analysis

The overall Pearson correlation between `bytesPerCall` and `marshalingMsPerCall` is `0.4705`. The slow-tier-only correlation is `0.5900`. Those values show a positive relationship between encoded input size and marshaling time, but not a strong enough relationship to classify H5 as linearly byte-size dominated under the pre-registered `r >= 0.7` threshold.

The low-byte continued-deepening axes also show nontrivial per-call marshaling time (`136` bytes/call with `0.031699` to `0.049893` marshaling ms/call), while large single-pass axes cluster around `20-33 KB/call` with `0.05-0.10` marshaling ms/call. That shape is mixed: fixed per-call setup and byte-size costs both contribute.

## Phase 6 Implication

H5 should be treated as material mixed marshaling/serialization evidence, not as a pure byte-linear ABI-size finding. Phase 6 now accepts `serialization-mixed-overhead-dominant` as an H5 verdict label and should weigh it with H1 rather than treating it as a small cache/write-cost issue. The evidence supports an Accelerate branch only if Phase 6 decides that reducing WASM call/marshaling overhead is worth the architecture cost; it does not, by itself, prove that a narrower encoded-state byte-size optimization would be sufficient.
