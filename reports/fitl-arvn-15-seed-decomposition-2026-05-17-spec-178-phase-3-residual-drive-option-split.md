# FITL ARVN 15-Seed Per-Microturn-Class Decomposition

**Date**: 2026-05-17-spec-178-phase-3-residual-drive-option-split
**Status**: FITL ARVN measurement witness.
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005,1011,1008,1013,1009 --timeout-ms 600000 --date 2026-05-17-spec-178-phase-3-residual-drive-option-split --profile-buckets`
**CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-17-spec-178-phase-3-residual-drive-option-split.csv`

## Summary

- Seeds completed: 5/5
- Per-decision rows: 1500
- Hot class with slow:fast ratio >3x: no
- Per-seed timeout: 600000 ms
- Hot-path buckets: enabled
- WASM mode: enabled
- WASM timing profile: disabled
- WASM production preview-drive route count: 1299
- WASM production preview-drive unsupported count: 751
- WASM production preview-drive batch count: 1027
- WASM timing call count: 0
- WASM serialized input bytes: 0
- Bytecode input cache write bytes: 0

## Per-Seed Wall Time

| Seed | Status | Stop Reason | Wall ms | Decisions | ms/decision | Error |
|---:|---|---|---:|---:|---:|---|
| 1005 | OK | terminal | 44488.75 | 398 | 111.7808 |  |
| 1011 | OK | terminal | 7235.5 | 206 | 35.1238 |  |
| 1008 | OK | terminal | 19378.35 | 346 | 56.0068 |  |
| 1013 | OK | terminal | 7603.78 | 258 | 29.472 |  |
| 1009 | OK | terminal | 11989.41 | 292 | 41.0596 |  |

## Per-Microturn-Class Rollup

| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | Cache hits | Cache misses | Cache compile ms | WASM preview-drive routes | WASM preview-drive unsupported | WASM preview-drive unsupported reasons | WASM preview-drive batches | WASM timing calls | Marshaling ms | Execution ms | Deserialization ms | Bytes serialized | Cache write ms | Cache write bytes | Cache write count | Token index builds | Static rebuilds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| govern:chooseNStep:confirm | 44 | 16618.11 | 377.6843 | 401.1595 | 10260.3708 | 6.3864 | 0 | 877 | 397 | 0 | 0 | 0 | 0 | 0 | 0 | 182 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state/expected-terminal-boundary/seat-or-turn-boundary:182 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| train:chooseNStep:add | 14 | 13055.48 | 932.5343 | 3427.2257 | 3427.2257 | 17.5 | 0 | 3443 | 6438 | 0 | 0 | 0 | 0 | 0 | 180 | 5 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state/expected-terminal-boundary/seat-or-turn-boundary:5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| govern:chooseNStep:add | 55 | 11874.2 | 215.8946 | 314.5827 | 3963.0947 | 5.7818 | 0 | 1425 | 2217 | 0 | 0 | 0 | 0 | 0 | 261 | 35 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state/expected-terminal-boundary/seat-or-turn-boundary:35 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event | 109 | 8265.32 | 75.8286 | 177.9047 | 3118.8964 | 21.3119 | 109 | 0 | 0 | 109 | 78 | 0 | 0 | 0 | 0 | 122 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:122 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 18 | 119 |
| coupArvnRedeployPolice:chooseOne | 58 | 7286.87 | 125.6357 | 309.069 | 315.3214 | 30.5862 | 0 | 57816 | 1954 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| train:chooseNStep:confirm | 22 | 6221.42 | 282.7917 | 2914.9366 | 2954.8366 | 4.5 | 0 | 1747 | 3733 | 0 | 0 | 0 | 0 | 0 | 58 | 5 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state/expected-terminal-boundary/seat-or-turn-boundary:5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| govern | 47 | 3060.77 | 65.1227 | 79.6997 | 607.2399 | 11.1064 | 45 | 0 | 2 | 45 | 32 | 0 | 0 | 0 | 16 | 94 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:50; unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:44 | 66 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 45 |
| coupArvnRedeployOptionalTroops:chooseOne | 84 | 1679.06 | 19.9888 | 36.164 | 45.2164 | 8.2857 | 0 | 5844 | 816 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseNStep:add | 48 | 1583.65 | 32.9927 | 269.9458 | 391.781 | 9.6458 | 0 | 164 | 706 | 0 | 0 | 0 | 0 | 0 | 39 | 14 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state/expected-terminal-boundary/seat-or-turn-boundary:14 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally | 67 | 1331.68 | 19.8758 | 43.9262 | 48.3764 | 17.194 | 57 | 0 | 10 | 57 | 35 | 0 | 0 | 0 | 195 | 78 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:68; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:10 | 205 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 57 |
| coupArvnRedeployOptionalTroops | 32 | 1307.61 | 40.8628 | 49.27 | 52.5076 | 17.125 | 25 | 0 | 7 | 25 | 0 | 0 | 0 | 0 | 14 | 64 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:64 | 78 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 25 |
| coupArvnRedeployPolice | 27 | 829.03 | 30.7048 | 34.2021 | 34.2635 | 11.8889 | 27 | 0 | 0 | 27 | 0 | 0 | 0 | 0 | 0 | 54 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:54 | 54 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 27 |
| coupArvnRedeployMandatory:chooseOne | 12 | 306.86 | 25.5713 | 36.7545 | 36.7545 | 8 | 0 | 1428 | 204 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| transport:chooseOne | 8 | 274.8 | 34.3501 | 57.8537 | 57.8537 | 12.25 | 0 | 290 | 18 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupRedeployPass | 32 | 270.91 | 8.4658 | 26.6621 | 28.526 | 3.0625 | 15 | 0 | 17 | 15 | 13 | 0 | 0 | 0 | 32 | 16 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:16 | 48 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 15 |
| train | 8 | 243.04 | 30.3801 | 59.4618 | 59.4618 | 5.75 | 8 | 0 | 0 | 8 | 10 | 0 | 0 | 0 | 28 | 8 | agent-guided-completion/production-preview-drive.chooseN/only origin-seat greedy chooseN publication is supported:4; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:4 | 36 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 8 |
| coupPacifyUS | 25 | 219.99 | 8.7996 | 13.4904 | 20.6777 | 2.8 | 25 | 0 | 0 | 25 | 0 | 0 | 0 | 0 | 35 | 15 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:15 | 50 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 25 |
| transport | 4 | 205.18 | 51.2943 | 57.4014 | 57.4014 | 11.5 | 4 | 0 | 0 | 4 | 0 | 0 | 0 | 0 | 0 | 8 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:4; unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:4 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 4 |
| govern:chooseOne | 58 | 186.12 | 3.209 | 4.7248 | 4.994 | 2 | 0 | 80 | 80 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupAgitateVC | 22 | 166.65 | 7.5751 | 11.0734 | 12.2437 | 2.7273 | 17 | 0 | 5 | 17 | 4 | 0 | 0 | 0 | 64 | 24 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:24 | 88 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 17 |
| infiltrate | 16 | 159 | 9.9375 | 15.7812 | 15.7812 | 53.4375 | 12 | 0 | 4 | 12 | 2 | 0 | 0 | 0 | 55 | 0 |  | 55 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 12 |
| advise | 13 | 118.43 | 9.1103 | 15.5802 | 15.5802 | 11.6923 | 10 | 0 | 3 | 10 | 3 | 0 | 0 | 0 | 52 | 0 |  | 52 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 10 |
| coupPacifyARVN | 11 | 100.89 | 9.1716 | 12.6389 | 12.6389 | 3.8182 | 5 | 0 | 6 | 5 | 8 | 0 | 0 | 0 | 24 | 10 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:10 | 34 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5 |
| coupNvaRedeployTroops | 11 | 100.38 | 9.1252 | 17.6351 | 17.6351 | 3.6364 | 7 | 0 | 4 | 7 | 0 | 0 | 0 | 0 | 8 | 7 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:7 | 15 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 7 |
| coupCommitmentPass | 32 | 99.57 | 3.1115 | 4.4565 | 4.8156 | 1.1563 | 3 | 0 | 29 | 3 | 0 | 0 | 0 | 0 | 53 | 0 |  | 53 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 3 |
| march | 15 | 89.01 | 5.9338 | 11.6496 | 11.6496 | 4.6 | 10 | 0 | 5 | 10 | 13 | 0 | 0 | 0 | 39 | 0 |  | 39 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 10 |
| ambushVc | 7 | 88.94 | 12.7052 | 21.8329 | 21.8329 | 6.8571 | 7 | 0 | 0 | 7 | 0 | 0 | 0 | 0 | 30 | 6 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:6 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 7 |
| coupArvnRedeployMandatory | 2 | 84.73 | 42.3633 | 42.9381 | 42.9381 | 11.5 | 1 | 0 | 1 | 1 | 0 | 0 | 0 | 0 | 2 | 4 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:4 | 6 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| assault | 8 | 72.92 | 9.1145 | 14.3782 | 14.3782 | 4.875 | 8 | 0 | 0 | 8 | 1 | 0 | 0 | 0 | 31 | 0 |  | 31 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 8 |
| coupPacifyPass | 16 | 64.26 | 4.0165 | 5.8723 | 5.8723 | 1.0625 | 14 | 0 | 2 | 14 | 0 | 0 | 0 | 0 | 26 | 0 |  | 26 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 14 |
| train:chooseOne | 12 | 63.06 | 5.2546 | 7.503 | 7.503 | 2.25 | 0 | 28 | 39 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| attack | 4 | 47.07 | 11.7687 | 13.2682 | 13.2682 | 54.5 | 4 | 0 | 0 | 4 | 0 | 0 | 0 | 0 | 16 | 0 |  | 16 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 4 |
| coupResourcesResolve | 8 | 28.29 | 3.5365 | 4.025 | 4.025 | 1 | 1 | 0 | 7 | 1 | 0 | 0 | 0 | 0 | 8 | 0 |  | 8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| coupVictoryCheck | 8 | 27.53 | 3.4416 | 4.8586 | 4.8586 | 1 | 8 | 0 | 0 | 8 | 1 | 0 | 0 | 0 | 8 | 0 |  | 8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 8 |
| coupAgitatePass | 8 | 25.31 | 3.1638 | 5.2235 | 5.2235 | 1.125 | 5 | 0 | 3 | 5 | 0 | 0 | 0 | 0 | 18 | 0 |  | 18 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5 |
| coupCommitmentResolve | 3 | 13.55 | 4.5169 | 4.9251 | 4.9251 | 2 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 6 | 0 |  | 6 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| chooseOne:chooseOne | 13 | 9.37 | 0.7204 | 7.6499 | 7.6499 | 5.9231 | 0 | 4 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseNStep:add | 68 | 4.86 | 0.0715 | 0.0933 | 0.6275 | 20.9706 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| pass | 1 | 3.98 | 3.9806 | 3.9806 | 3.9806 | 1 | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 1 | 0 |  | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| event-decision:chooseOne | 12 | 3.65 | 0.3044 | 3.2927 | 3.2927 | 2.9167 | 0 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseNStep:confirm | 77 | 2.71 | 0.0352 | 0.0626 | 0.1753 | 17.6753 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseOne | 70 | 2.14 | 0.0306 | 0.0609 | 0.1198 | 1.3571 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:add | 13 | 1.51 | 0.1158 | 0.7441 | 0.7441 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseNStep:confirm | 47 | 1.48 | 0.0316 | 0.1082 | 0.1517 | 5.7234 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:confirm | 13 | 1.39 | 0.1072 | 0.8986 | 0.8986 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:add | 21 | 1.2 | 0.057 | 0.0744 | 0.0901 | 12.7143 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:confirm | 35 | 1.15 | 0.0328 | 0.0531 | 0.0532 | 4.8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseOne | 27 | 1.13 | 0.0417 | 0.0908 | 0.1216 | 2.4444 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupNvaRedeployTroops:chooseOne | 25 | 0.89 | 0.0358 | 0.048 | 0.0541 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseOne | 23 | 0.75 | 0.0326 | 0.0598 | 0.0629 | 1.6957 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:add | 16 | 0.71 | 0.0441 | 0.0512 | 0.0512 | 3.75 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:confirm | 26 | 0.67 | 0.0258 | 0.041 | 0.0565 | 4.5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:add | 8 | 0.48 | 0.0596 | 0.1324 | 0.1324 | 2.75 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:confirm | 16 | 0.43 | 0.0267 | 0.0778 | 0.0778 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupCommitmentResolve:chooseNStep:confirm | 12 | 0.39 | 0.0323 | 0.0974 | 0.0974 | 9.25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:add | 7 | 0.27 | 0.0393 | 0.0425 | 0.0425 | 3.5714 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| chooseNStep:chooseNStep:confirm | 6 | 0.27 | 0.0454 | 0.0711 | 0.0711 | 19.6667 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:confirm | 7 | 0.17 | 0.0237 | 0.0282 | 0.0282 | 4.5714 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseOne | 7 | 0.13 | 0.0181 | 0.0215 | 0.0215 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Top Hot Axes In Slow-Tier Seeds

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.

| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms | Cache hits | Cache misses | Cache compile ms |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | govern:chooseNStep:confirm | continuedDeepening | 33 | 16617.14 | 503.5497 | 523.0769 | 10260.3708 | 0 | 0 | 0 |
| 2 | train:chooseNStep:add | continuedDeepening | 14 | 13055.48 | 932.5343 | 3427.2257 | 3427.2257 | 0 | 0 | 0 |
| 3 | govern:chooseNStep:add | continuedDeepening | 55 | 11874.2 | 215.8946 | 314.5827 | 3963.0947 | 0 | 0 | 0 |
| 4 | event | singlePass | 109 | 8265.32 | 75.8286 | 177.9047 | 3118.8964 | 0 | 0 | 0 |
| 5 | coupArvnRedeployPolice:chooseOne | continuedDeepening | 58 | 7286.87 | 125.6357 | 309.069 | 315.3214 | 0 | 0 | 0 |
| 6 | train:chooseNStep:confirm | continuedDeepening | 12 | 6219.84 | 518.3196 | 2954.8366 | 2954.8366 | 0 | 0 | 0 |
| 7 | govern | singlePass | 47 | 3060.77 | 65.1227 | 79.6997 | 607.2399 | 0 | 0 | 0 |
| 8 | coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | 84 | 1679.06 | 19.9888 | 36.164 | 45.2164 | 0 | 0 | 0 |
| 9 | event-decision:chooseNStep:add | continuedDeepening | 6 | 1582.06 | 263.6769 | 391.781 | 391.781 | 0 | 0 | 0 |
| 10 | rally | singlePass | 67 | 1331.68 | 19.8758 | 43.9262 | 48.3764 | 0 | 0 | 0 |

## Hot-Path Buckets For Top Slow Axes

Captured only when `--profile-buckets` is enabled. Buckets are timing/count diagnostics inside `PolicyAgent.chooseDecision`; they are not correctness assertions.

### govern:chooseNStep:confirm | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| policyInnerPreview:chooseNStepDeepPass | 33 | 10420.24 |
| policyInnerPreview:chooseNStepBroadRun | 33 | 6172.83 |
| tokenStateIndex:refreshCachedEntries | 58404 | 769.11 |
| evalQuery:applyTokenFilter | 275379 | 398.98 |
| policyMicroturnSearch:chooseOneScoreOptions | 364 | 72.02 |
| zobrist:encodeDecisionStackFrame | 1456 | 57.46 |
| zobrist:digestDecisionStackFrame | 894 | 46.21 |
| evalQuery:countMatchingTokens | 37786 | 42.03 |
| policyInnerPreview:chooseNStepBroadSignals | 33 | 8.43 |
| policyInnerPreview:chooseNStepFinalSignals | 33 | 6.8 |
| policyMicroturnSearch:chooseNScoreOptions | 33 | 4.46 |
| policyInnerPreview:summarizeUsage | 33 | 0.57 |

### train:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| policyInnerPreview:chooseNStepBroadRun | 14 | 8052.96 |
| policyInnerPreview:chooseNStepDeepPass | 14 | 4980.08 |
| zobrist:digestDecisionStackFrame | 14430 | 2486.23 |
| zobrist:encodeDecisionStackFrame | 14556 | 1495.29 |
| tokenStateIndex:refreshCachedEntries | 15073 | 239.87 |
| policyMicroturnSearch:chooseNScoreOptions | 703 | 127.6 |
| policyMicroturnSearch:chooseOneScoreOptions | 487 | 82.64 |
| evalQuery:countMatchingTokens | 51110 | 68.34 |
| evalQuery:applyTokenFilter | 12738 | 33.93 |
| policyInnerPreview:chooseNStepBroadSignals | 14 | 6.95 |
| policyInnerPreview:chooseNStepFinalSignals | 14 | 6.1 |
| policyMicroturnSearch:chooseNRankOptions | 703 | 1.22 |

### govern:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| policyInnerPreview:chooseNStepDeepPass | 55 | 9371.29 |
| policyInnerPreview:chooseNStepBroadRun | 55 | 2457.2 |
| tokenStateIndex:refreshCachedEntries | 35197 | 427.16 |
| zobrist:digestDecisionStackFrame | 5372 | 248.61 |
| zobrist:encodeDecisionStackFrame | 5508 | 200.91 |
| evalQuery:applyTokenFilter | 117692 | 169.63 |
| policyMicroturnSearch:chooseOneScoreOptions | 592 | 84.35 |
| evalQuery:countMatchingTokens | 27021 | 31.15 |
| policyInnerPreview:chooseNStepBroadSignals | 55 | 14.28 |
| policyInnerPreview:chooseNStepFinalSignals | 55 | 11.59 |
| policyMicroturnSearch:chooseNScoreOptions | 55 | 8.25 |
| policyInnerPreview:summarizeUsage | 55 | 1.64 |

### event | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 58155 | 700.93 |
| evalQuery:applyTokenFilter | 110474 | 215.41 |
| zobrist:digestDecisionStackFrame | 1026 | 194.3 |
| zobrist:encodeDecisionStackFrame | 1026 | 116.33 |
| evalQuery:countMatchingTokens | 49013 | 49.21 |
| policyWasmRuntime:encodeBytecodeInput | 1124 | 31.46 |
| tokenStateIndex:build | 18 | 0.68 |
| evalQuery:applyTokenFilterCacheHit | 17764 | 0 |
| evalQuery:applyTokenFilterCompiled | 109718 | 0 |
| evalQuery:countMatchingTokensCacheHit | 1101739 | 0 |
| evalQuery:countMatchingTokensCompiled | 34985 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 2368255 | 0 |

### coupArvnRedeployPolice:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| policyInnerPreview:chooseOneRun | 58 | 7230.43 |
| policyInnerPreviewSubroutine:driveOption | 1774 | 6494.1 |
| policyInnerPreviewDriveOption:publishMicroturn | 1896 | 3056.07 |
| policyMicroturnSearch:chooseOneScoreOptions | 1954 | 1535.97 |
| policyInnerPreviewDriveOption:pickInnerDecision | 1896 | 1509.22 |
| tokenStateIndex:refreshCachedEntries | 142412 | 1306.2 |
| policyInnerPreviewSubroutine:resolveRefs | 1774 | 727.34 |
| policyInnerPreviewDriveOption:continuationDecisionApply | 1896 | 650.79 |
| policyInnerPreviewDriveOption:canonicalizeForExit | 1774 | 621.2 |
| policyInnerPreviewDriveOption:initialDecisionApply | 1774 | 528.01 |
| evalQuery:countMatchingTokens | 160806 | 186.54 |
| policyInnerPreviewDriveOption:syncDraftTokenStateIndex | 2844 | 106.32 |

### train:chooseNStep:confirm | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| policyInnerPreview:chooseNStepBroadRun | 12 | 3761.69 |
| policyInnerPreview:chooseNStepDeepPass | 12 | 2448.94 |
| zobrist:digestDecisionStackFrame | 8094 | 1430.46 |
| zobrist:encodeDecisionStackFrame | 8222 | 866.11 |
| tokenStateIndex:refreshCachedEntries | 3781 | 68.4 |
| policyMicroturnSearch:chooseNScoreOptions | 334 | 59.22 |
| policyMicroturnSearch:chooseOneScoreOptions | 269 | 32.57 |
| evalQuery:countMatchingTokens | 5845 | 6.71 |
| evalQuery:applyTokenFilter | 1507 | 4.39 |
| policyInnerPreview:chooseNStepBroadSignals | 12 | 4.17 |
| policyInnerPreview:chooseNStepFinalSignals | 12 | 2.17 |
| policyMicroturnSearch:chooseNRankOptions | 334 | 0.63 |

### govern | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 1272 | 160.26 |
| zobrist:encodeDecisionStackFrame | 1272 | 104.49 |
| tokenStateIndex:refreshCachedEntries | 5895 | 87.22 |
| evalQuery:applyTokenFilter | 17879 | 38.55 |
| policyWasmRuntime:encodeBytecodeInput | 376 | 14.94 |
| evalQuery:countMatchingTokens | 7293 | 8.2 |
| evalQuery:applyTokenFilterCacheHit | 18564 | 0 |
| evalQuery:applyTokenFilterCompiled | 17772 | 0 |
| evalQuery:countMatchingTokensCacheHit | 816766 | 0 |
| evalQuery:countMatchingTokensCompiled | 5131 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1552798 | 0 |
| policyWasmRuntime:encodedInputCacheMiss | 376 | 0 |

### coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| policyInnerPreview:chooseOneRun | 84 | 1641.82 |
| policyInnerPreviewSubroutine:driveOption | 696 | 1350.8 |
| policyInnerPreviewDriveOption:publishMicroturn | 732 | 357.82 |
| policyInnerPreviewSubroutine:resolveRefs | 696 | 285.45 |
| policyInnerPreviewDriveOption:continuationDecisionApply | 732 | 262.35 |
| policyInnerPreviewDriveOption:canonicalizeForExit | 696 | 239.18 |
| policyMicroturnSearch:chooseOneScoreOptions | 816 | 233.63 |
| policyInnerPreviewDriveOption:initialDecisionApply | 696 | 222.13 |
| policyInnerPreviewDriveOption:pickInnerDecision | 732 | 213.8 |
| tokenStateIndex:refreshCachedEntries | 22140 | 198.45 |
| policyInnerPreviewDriveOption:syncDraftTokenStateIndex | 1160 | 44.57 |
| evalQuery:countMatchingTokens | 36818 | 31.13 |

### event-decision:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| policyInnerPreview:chooseNStepDeepPass | 6 | 860.98 |
| policyInnerPreview:chooseNStepBroadRun | 6 | 712.99 |
| tokenStateIndex:refreshCachedEntries | 7120 | 92.77 |
| zobrist:digestDecisionStackFrame | 1396 | 44.28 |
| zobrist:encodeDecisionStackFrame | 1528 | 33.67 |
| evalQuery:countMatchingTokens | 5723 | 7.84 |
| evalQuery:applyTokenFilter | 2580 | 7.73 |
| policyInnerPreview:chooseNStepBroadSignals | 6 | 3.66 |
| policyMicroturnSearch:chooseOneScoreOptions | 11 | 2.01 |
| policyInnerPreview:chooseNStepFinalSignals | 6 | 1.68 |
| policyMicroturnSearch:chooseNScoreOptions | 6 | 1.39 |
| policyInnerPreview:summarizeUsage | 6 | 0.09 |

### rally | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 7575 | 77.81 |
| evalQuery:applyTokenFilter | 6170 | 21.99 |
| zobrist:digestDecisionStackFrame | 242 | 17.58 |
| zobrist:encodeDecisionStackFrame | 242 | 12.53 |
| policyWasmRuntime:encodeBytecodeInput | 345 | 12.35 |
| evalQuery:countMatchingTokens | 9881 | 10.3 |
| evalQuery:applyTokenFilterCacheHit | 3667 | 0 |
| evalQuery:applyTokenFilterCompiled | 6012 | 0 |
| evalQuery:countMatchingTokensCacheHit | 601356 | 0 |
| evalQuery:countMatchingTokensCompiled | 7719 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1418674 | 0 |
| policyWasmRuntime:encodedInputCacheMiss | 345 | 0 |


## Continued-Deepening No-Counter Residual Split

Rows include only `continuedDeepening` axes with zero route/unsupported counters. `continued-deepening-orchestration-inclusive` is a top-level same-run bucket; `*-nested` rows are child hot-path evidence inside that orchestration bucket and are not additive with it. The residual row is the measured axis wall time not explained by the top-level orchestration bucket.

| Microturn class | Preview branch | Classification | Count | Total ms | Share of axis wall |
|---|---|---|---:|---:|---:|
| coupArvnRedeployPolice:chooseOne | continuedDeepening | continued-deepening-orchestration-inclusive | 58 | 7230.43 | 99.2255% |
| coupArvnRedeployPolice:chooseOne | continuedDeepening | inner-preview-subroutine-nested | 3548 | 7221.44 | 99.1021% |
| coupArvnRedeployPolice:chooseOne | continuedDeepening | drive-option-subroutine-nested | 12080 | 6471.61 | 88.8119% |
| coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | continued-deepening-orchestration-inclusive | 84 | 1641.82 | 97.7821% |
| coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | inner-preview-subroutine-nested | 1392 | 1636.25 | 97.4504% |
| coupArvnRedeployPolice:chooseOne | continuedDeepening | policy-search-candidate-scoring-nested | 1954 | 1535.97 | 21.0786% |
| coupArvnRedeployPolice:chooseOne | continuedDeepening | existing-hot-path-bucket-nested | 303218 | 1492.74 | 20.4853% |
| coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | drive-option-subroutine-nested | 4748 | 1339.85 | 79.7976% |
| coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | policy-search-candidate-scoring-nested | 816 | 233.63 | 13.9143% |
| coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | existing-hot-path-bucket-nested | 58958 | 229.58 | 13.6731% |
| coupArvnRedeployPolice:chooseOne | continuedDeepening | unattributed-after-top-level-orchestration |  | 56.44 | 0.7745% |
| coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | unattributed-after-top-level-orchestration |  | 37.24 | 2.2179% |

## WASM Timing Buckets

_No WASM timing buckets recorded._

## WASM Serialization Stats

_No WASM serialization stats recorded._

## WASM Preview-Drive Unsupported Reasons

| Microturn class | Unsupported class | Unsupported owner | Reason | Count | Class unsupported total | Class route total |
|---|---|---|---|---:|---:|---:|
| govern:chooseNStep:confirm | unknown | production-deep-choosenstep-continuation.projectedState | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 182 | 182 | 0 |
| event | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 122 | 122 | 0 |
| rally | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 68 | 78 | 195 |
| coupArvnRedeployOptionalTroops | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 64 | 64 | 14 |
| coupArvnRedeployPolice | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 54 | 54 | 0 |
| govern | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 50 | 94 | 16 |
| govern | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 44 | 94 | 16 |
| govern:chooseNStep:add | unknown | production-deep-choosenstep-continuation.projectedState | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 35 | 35 | 261 |
| coupAgitateVC | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 24 | 24 | 64 |
| coupRedeployPass | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 16 | 16 | 32 |
| coupPacifyUS | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 15 | 15 | 35 |
| event-decision:chooseNStep:add | unknown | production-deep-choosenstep-continuation.projectedState | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 14 | 14 | 39 |
| coupPacifyARVN | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 10 | 10 | 24 |
| rally | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 10 | 78 | 195 |
| coupNvaRedeployTroops | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 7 | 7 | 8 |
| ambushVc | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 6 | 6 | 30 |
| train:chooseNStep:add | unknown | production-deep-choosenstep-continuation.projectedState | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 5 | 5 | 180 |
| train:chooseNStep:confirm | unknown | production-deep-choosenstep-continuation.projectedState | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 5 | 5 | 58 |
| coupArvnRedeployMandatory | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 4 | 4 | 2 |
| train | agent-guided-completion | production-preview-drive.chooseN | only origin-seat greedy chooseN publication is supported | 4 | 8 | 28 |
| train | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 4 | 8 | 28 |
| transport | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 4 | 8 | 0 |
| transport | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 4 | 8 | 0 |

## Terminal-Boundary Projected-State Split

| Microturn class | Classification | Boundary kind | Count |
|---|---|---|---:|
| govern:chooseNStep:confirm | expected-terminal-boundary | seat-or-turn-boundary | 182 |
| govern:chooseNStep:add | expected-terminal-boundary | seat-or-turn-boundary | 35 |
| event-decision:chooseNStep:add | expected-terminal-boundary | seat-or-turn-boundary | 14 |
| train:chooseNStep:add | expected-terminal-boundary | seat-or-turn-boundary | 5 |
| train:chooseNStep:confirm | expected-terminal-boundary | seat-or-turn-boundary | 5 |

## Fast-Tier vs Slow-Tier Delta

Fast tier: `1000`, `1006`, `1007`, `1010`, `1014`. Rows with ratio greater than `3.0` satisfy the Phase 0 hot-axis criterion.

| Microturn class | Slow decisions | Fast decisions | Slow mean ms | Fast mean ms | Slow:fast ratio | Verdict |
|---|---:|---:|---:|---:|---:|---|

## Notes

- `elapsedMs` is measured around the per-decision `PolicyAgent.chooseDecision` call. It excludes simulator apply/delta work and report rendering.
- Child processes enforce the per-seed timeout. Each child loads the built engine and production FITL GameSpecDoc, using the repo GameDef cache when available.
- WASM timing buckets are emitted only when `POLICY_WASM_TIMING_PROFILE=1` is set before the child process imports the WASM runtime module.
- The script does not modify engine source or production profile data.
