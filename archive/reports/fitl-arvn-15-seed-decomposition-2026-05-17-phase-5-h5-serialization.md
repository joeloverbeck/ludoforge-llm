# FITL ARVN 15-Seed Per-Microturn-Class Decomposition

**Status**: ✅ EXPLOITED — archived 2026-05-19.

**Date**: 2026-05-17-phase-5-h5-serialization
**Status**: Spec 173 measurement witness.
**Command**: `POLICY_WASM_TIMING_PROFILE=1 node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 600000 --date 2026-05-17-phase-5-h5-serialization`
**CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-5-h5-serialization.csv`

## Summary

- Seeds completed: 15/15
- Per-decision rows: 3769
- Hot class with slow:fast ratio >3x: no
- Per-seed timeout: 600000 ms
- Hot-path buckets: disabled
- WASM mode: enabled
- WASM timing profile: enabled
- WASM production preview-drive route count: 3125
- WASM production preview-drive unsupported count: 1998
- WASM production preview-drive batch count: 2648
- WASM timing call count: 18048
- WASM serialized input bytes: 407142300
- Bytecode input cache write bytes: 0

## Per-Seed Wall Time

| Seed | Status | Stop Reason | Wall ms | Decisions | ms/decision | Error |
|---:|---|---|---:|---:|---:|---|
| 1000 | OK | terminal | 5876.82 | 159 | 36.9611 |  |
| 1001 | OK | terminal | 7624.15 | 193 | 39.5034 |  |
| 1002 | OK | terminal | 4927.83 | 148 | 33.2961 |  |
| 1003 | OK | terminal | 9121.76 | 226 | 40.3618 |  |
| 1004 | OK | terminal | 14081.51 | 344 | 40.9346 |  |
| 1005 | OK | terminal | 46362 | 398 | 116.4874 |  |
| 1006 | OK | terminal | 10816.65 | 228 | 47.4414 |  |
| 1007 | OK | terminal | 7055.78 | 218 | 32.366 |  |
| 1008 | OK | terminal | 20168.39 | 346 | 58.2901 |  |
| 1009 | OK | terminal | 12173.08 | 292 | 41.6886 |  |
| 1010 | OK | terminal | 33897.83 | 339 | 99.9936 |  |
| 1011 | OK | terminal | 7432.51 | 206 | 36.0801 |  |
| 1012 | OK | terminal | 16656.29 | 201 | 82.8671 |  |
| 1013 | OK | terminal | 7520.07 | 258 | 29.1476 |  |
| 1014 | OK | terminal | 17859.09 | 213 | 83.8455 |  |

## Per-Microturn-Class Rollup

| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | Cache hits | Cache misses | Cache compile ms | WASM preview-drive routes | WASM preview-drive unsupported | WASM preview-drive unsupported reasons | WASM preview-drive batches | WASM timing calls | Marshaling ms | Execution ms | Deserialization ms | Bytes serialized | Cache write ms | Cache write bytes | Cache write count | Token index builds | Static rebuilds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| train:chooseNStep:add | 37 | 39899.12 | 1078.3546 | 3502.2121 | 14700.2678 | 17.4865 | 0 | 5183 | 7420 | 0 | 0 | 0 | 0 | 0 | 359 | 13 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:13 | 0 | 1044 | 43.9658 | 4.9939 | 18.603 | 141984 | 0 | 0 | 0 | 0 | 0 |
| govern:chooseNStep:confirm | 115 | 32733.28 | 284.6372 | 502.9775 | 10296.1355 | 6.6957 | 0 | 2505 | 1135 | 0 | 0 | 0 | 0 | 0 | 0 | 520 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:520 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| govern:chooseNStep:add | 135 | 26784.74 | 198.4055 | 310.7953 | 4288.7682 | 6.0815 | 0 | 3770 | 5825 | 0 | 0 | 0 | 0 | 0 | 708 | 73 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:73 | 0 | 2124 | 100.2854 | 10.8092 | 38.8235 | 288864 | 0 | 0 | 0 | 0 | 0 |
| event | 248 | 22460.91 | 90.5682 | 86.8509 | 4980.7485 | 19.121 | 248 | 0 | 0 | 248 | 234 | 2328 | 234 | 10.3881 | 0 | 276 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:276 | 0 | 2562 | 225.9549 | 102.0192 | 4.174 | 85327848 | 0 | 0 | 0 | 38 | 278 |
| coupArvnRedeployPolice:chooseOne | 153 | 15303.93 | 100.0257 | 306.3563 | 349.5981 | 30.3922 | 0 | 105697 | 3591 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| train:chooseNStep:confirm | 59 | 9959.7 | 168.8085 | 1696.0402 | 3218.2863 | 3.0508 | 0 | 1810 | 3782 | 0 | 0 | 0 | 0 | 0 | 72 | 12 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:12 | 0 | 624 | 19.78 | 2.841 | 9.6556 | 84864 | 0 | 0 | 0 | 0 | 0 |
| govern | 118 | 7094.44 | 60.1224 | 83.633 | 695.3531 | 10.7797 | 111 | 0 | 7 | 111 | 96 | 848 | 96 | 4.6793 | 42 | 236 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:132; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:104 | 146 | 986 | 82.3802 | 36.044 | 7.6982 | 31246976 | 0 | 0 | 0 | 0 | 111 |
| coupArvnRedeployOptionalTroops:chooseOne | 215 | 4283.71 | 19.9242 | 35.2032 | 50.8558 | 8.3907 | 0 | 13517 | 1865 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally | 165 | 3680.67 | 22.3071 | 47.5966 | 136.8241 | 15.0667 | 146 | 0 | 19 | 146 | 100 | 731 | 100 | 4.274 | 381 | 215 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:198; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:17 | 398 | 1212 | 118.4355 | 37.3886 | 25.9234 | 27993848 | 0 | 0 | 0 | 0 | 146 |
| coupArvnRedeployOptionalTroops | 88 | 3634.46 | 41.3007 | 49.3744 | 69.6997 | 17.2159 | 71 | 0 | 17 | 71 | 0 | 704 | 0 | 0 | 36 | 176 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:176 | 212 | 740 | 66.3869 | 25.4686 | 4.0923 | 23542464 | 0 | 0 | 0 | 0 | 71 |
| coupArvnRedeployPolice | 86 | 2710.53 | 31.5178 | 36.7623 | 46.1099 | 11.6744 | 85 | 0 | 1 | 85 | 0 | 688 | 0 | 0 | 20 | 172 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:172 | 192 | 708 | 60.6289 | 24.4271 | 2.9562 | 22789416 | 0 | 0 | 0 | 0 | 85 |
| event-decision:chooseNStep:add | 96 | 2297.01 | 23.9272 | 237.6021 | 389.4746 | 11.4479 | 0 | 250 | 1045 | 0 | 0 | 0 | 0 | 0 | 63 | 14 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:14 | 0 | 69 | 3.4426 | 0.4157 | 1.4418 | 9384 | 0 | 0 | 0 | 0 | 0 |
| transport:chooseOne | 14 | 780.79 | 55.7707 | 115.7036 | 115.7036 | 16.7143 | 0 | 952 | 37 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupRedeployPass | 80 | 686.71 | 8.5839 | 27.546 | 29.449 | 2.95 | 32 | 0 | 48 | 32 | 15 | 745 | 15 | 0.4174 | 82 | 40 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:40 | 122 | 842 | 53.8291 | 25.7964 | 6.6102 | 24839640 | 0 | 0 | 0 | 0 | 32 |
| coupPacifyUS | 76 | 662.34 | 8.715 | 14.0259 | 18.0282 | 2.8158 | 76 | 0 | 0 | 76 | 0 | 790 | 0 | 0 | 106 | 46 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:46 | 152 | 896 | 62.8271 | 27.6012 | 9.5289 | 25835728 | 0 | 0 | 0 | 0 | 76 |
| train | 23 | 635.37 | 27.6248 | 51.4219 | 56.584 | 5.4348 | 23 | 0 | 0 | 23 | 12 | 198 | 12 | 0.4684 | 108 | 20 | agent-guided-completion/production-preview-drive.chooseN/only origin-seat greedy chooseN publication is supported:12; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:4; unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:4 | 124 | 318 | 24.5176 | 7.9657 | 6.7855 | 6992108 | 0 | 0 | 0 | 0 | 23 |
| coupAgitateVC | 69 | 607.75 | 8.808 | 12.4858 | 13.3078 | 2.971 | 52 | 0 | 17 | 52 | 12 | 310 | 12 | 0.8958 | 184 | 92 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:92 | 276 | 506 | 42.1385 | 12.1894 | 14.456 | 10689304 | 0 | 0 | 0 | 0 | 52 |
| patrol | 1 | 568.91 | 568.906 | 568.906 | 568.906 | 4 | 1 | 0 | 0 | 1 | 0 | 10 | 0 | 0 | 0 | 1 | agent-guided-completion/production-preview-drive.chooseN/only origin-seat greedy chooseN publication is supported:1 | 1 | 10 | 0.4125 | 0.3394 | 0.004 | 325672 | 0 | 0 | 0 | 0 | 1 |
| advise | 43 | 538.31 | 12.5189 | 40.4691 | 44.7088 | 11.4186 | 32 | 0 | 11 | 32 | 8 | 461 | 8 | 0.7947 | 164 | 4 | agent-guided-completion/production-preview-drive.chooseN/only origin-seat greedy chooseN publication is supported:3; unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:1 | 167 | 633 | 56.4114 | 18.857 | 12.5777 | 15604616 | 0 | 0 | 0 | 0 | 32 |
| govern:chooseOne | 138 | 494.9 | 3.5862 | 5.2086 | 9.8829 | 2 | 0 | 178 | 178 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate | 37 | 382.97 | 10.3504 | 15.3717 | 17.972 | 48.4324 | 30 | 0 | 7 | 30 | 16 | 465 | 16 | 0.5428 | 136 | 0 |  | 136 | 617 | 58.6802 | 18.7616 | 9.043 | 16659108 | 0 | 0 | 0 | 0 | 30 |
| transport | 7 | 362.81 | 51.83 | 62.226 | 62.226 | 11.7143 | 7 | 0 | 0 | 7 | 0 | 56 | 0 | 0 | 0 | 14 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:10; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:4 | 4 | 56 | 4.984 | 1.9124 | 0.0405 | 1854252 | 0 | 0 | 0 | 0 | 7 |
| coupArvnRedeployMandatory:chooseOne | 13 | 341.76 | 26.2893 | 43.9751 | 43.9751 | 8 | 0 | 1435 | 205 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupPacifyARVN | 31 | 291.62 | 9.4072 | 12.984 | 13.7879 | 3.7742 | 14 | 0 | 17 | 14 | 30 | 250 | 30 | 1.5827 | 66 | 30 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:28; unsupported-effect/production-preview-drive.effect.popInterruptPhase/unsupported production preview-drive effect popInterruptPhase:2 | 96 | 346 | 25.2379 | 10.1328 | 4.6829 | 9221372 | 0 | 0 | 0 | 0 | 14 |
| coupCommitmentPass | 80 | 277.28 | 3.466 | 5.4422 | 10.0266 | 1.1375 | 9 | 0 | 71 | 9 | 2 | 798 | 2 | 0.1016 | 131 | 0 |  | 131 | 931 | 56.0104 | 27.456 | 9.5292 | 26127356 | 0 | 0 | 0 | 0 | 9 |
| march | 40 | 257.22 | 6.4306 | 10.74 | 11.0822 | 8.9 | 30 | 0 | 10 | 30 | 66 | 405 | 66 | 1.6267 | 107 | 0 |  | 107 | 578 | 46.5194 | 17.1135 | 7.6408 | 15575624 | 0 | 0 | 0 | 0 | 30 |
| assault | 21 | 191.68 | 9.1279 | 13.5318 | 14.8916 | 4.8095 | 20 | 0 | 1 | 20 | 3 | 228 | 3 | 0.222 | 80 | 0 |  | 80 | 311 | 23.4856 | 8.2121 | 5.7839 | 7620036 | 0 | 0 | 0 | 0 | 20 |
| coupNvaRedeployTroops | 19 | 185.39 | 9.7573 | 16.726 | 16.726 | 3.7368 | 12 | 0 | 7 | 12 | 0 | 235 | 0 | 0 | 14 | 12 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:12 | 26 | 249 | 17.1048 | 8.2321 | 1.2646 | 7670696 | 0 | 0 | 0 | 0 | 12 |
| coupPacifyPass | 40 | 174.25 | 4.3563 | 5.4882 | 11.9938 | 1.15 | 37 | 0 | 3 | 37 | 2 | 416 | 2 | 0.0851 | 60 | 2 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:2 | 62 | 478 | 30.4681 | 14.3174 | 5.4124 | 13645944 | 0 | 0 | 0 | 0 | 37 |
| ambushVc | 12 | 168.93 | 14.0777 | 24.5587 | 24.5587 | 8.1667 | 11 | 0 | 1 | 11 | 0 | 58 | 0 | 0 | 38 | 14 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:14 | 38 | 96 | 8.105 | 2.2471 | 2.0997 | 1945968 | 0 | 0 | 0 | 0 | 11 |
| train:chooseOne | 35 | 168.22 | 4.8063 | 6.7817 | 7.1047 | 2.3143 | 0 | 66 | 99 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| attack | 14 | 163.43 | 11.6735 | 24.6242 | 24.6242 | 31.6429 | 12 | 0 | 2 | 12 | 0 | 155 | 0 | 0 | 44 | 6 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:6 | 44 | 199 | 18.383 | 5.8786 | 2.5925 | 5301016 | 0 | 0 | 0 | 0 | 12 |
| coupArvnRedeployMandatory | 3 | 118.32 | 39.4384 | 43.93 | 43.93 | 11.3333 | 1 | 0 | 2 | 1 | 0 | 24 | 0 | 0 | 4 | 6 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:6 | 10 | 28 | 1.8603 | 0.8226 | 0.3162 | 798316 | 0 | 0 | 0 | 0 | 1 |
| coupAgitatePass | 20 | 75.39 | 3.7695 | 4.926 | 5.323 | 1.25 | 17 | 0 | 3 | 17 | 0 | 120 | 0 | 0 | 50 | 0 |  | 50 | 170 | 13.1914 | 4.3949 | 3.3646 | 3952020 | 0 | 0 | 0 | 0 | 17 |
| coupResourcesResolve | 20 | 75.29 | 3.7646 | 4.5765 | 6.5503 | 1 | 3 | 0 | 17 | 3 | 0 | 220 | 0 | 0 | 20 | 0 |  | 20 | 240 | 15.25 | 7.4575 | 1.8463 | 7164780 | 0 | 0 | 0 | 0 | 3 |
| coupVictoryCheck | 20 | 69.76 | 3.4882 | 4.6431 | 5.4912 | 1 | 20 | 0 | 0 | 20 | 4 | 216 | 4 | 0.4094 | 20 | 0 |  | 20 | 240 | 14.7592 | 8.2149 | 2.0989 | 7163520 | 0 | 0 | 0 | 0 | 20 |
| coupCommitmentResolve | 9 | 42.59 | 4.7319 | 6.7615 | 6.7615 | 2 | 0 | 0 | 9 | 0 | 0 | 99 | 0 | 0 | 18 | 0 |  | 18 | 117 | 6.1778 | 3.4411 | 3.6365 | 3237396 | 0 | 0 | 0 | 0 | 0 |
| ambushNva | 5 | 32.81 | 6.5621 | 10.5791 | 10.5791 | 15.2 | 5 | 0 | 0 | 5 | 0 | 65 | 0 | 0 | 11 | 0 |  | 11 | 76 | 6.1026 | 2.1894 | 0.6766 | 2159188 | 0 | 0 | 0 | 0 | 5 |
| chooseOne:chooseOne | 31 | 20.33 | 0.6559 | 6.974 | 9.0131 | 5.2903 | 0 | 7 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| resolveHonoluluPacify | 3 | 16.45 | 5.485 | 6.2301 | 6.2301 | 1 | 3 | 0 | 0 | 3 | 0 | 28 | 0 | 0 | 0 | 4 | unsupported-effect/production-preview-drive.effect.popInterruptPhase/unsupported production preview-drive effect popInterruptPhase:4 | 4 | 28 | 1.4559 | 0.9075 | 0.0123 | 909812 | 0 | 0 | 0 | 0 | 3 |
| rally:chooseNStep:add | 168 | 13.06 | 0.0777 | 0.1199 | 0.7861 | 20.75 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseNStep:confirm | 209 | 7.18 | 0.0344 | 0.0658 | 0.1793 | 14.7943 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseOne | 34 | 5.89 | 0.1732 | 0.5843 | 3.6326 | 3.6471 | 0 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseOne | 172 | 5.87 | 0.0341 | 0.0979 | 0.1696 | 1.3547 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:add | 43 | 5.09 | 0.1183 | 0.4531 | 1.06 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| pass | 1 | 4.07 | 4.0726 | 4.0726 | 4.0726 | 1 | 1 | 0 | 0 | 1 | 0 | 13 | 0 | 0 | 1 | 0 |  | 1 | 14 | 0.6879 | 0.434 | 0.086 | 423180 | 0 | 0 | 0 | 0 | 1 |
| march:chooseNStep:add | 57 | 3.45 | 0.0605 | 0.1129 | 0.1334 | 11.614 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseOne | 87 | 3.43 | 0.0394 | 0.0673 | 0.1279 | 2.4368 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:confirm | 91 | 3.43 | 0.0377 | 0.0655 | 0.114 | 5.2198 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseNStep:confirm | 89 | 2.87 | 0.0322 | 0.0914 | 0.1594 | 6.5169 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:add | 37 | 2.37 | 0.0641 | 0.0947 | 0.6096 | 3.7027 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:confirm | 43 | 1.93 | 0.045 | 0.0771 | 0.0862 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseOne | 57 | 1.87 | 0.0328 | 0.0666 | 0.1334 | 1.614 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupNvaRedeployTroops:chooseOne | 43 | 1.77 | 0.0411 | 0.0587 | 0.0767 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:confirm | 55 | 1.56 | 0.0283 | 0.0527 | 0.0841 | 4.4909 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:add | 21 | 1.18 | 0.0561 | 0.0642 | 0.1569 | 3.0952 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupCommitmentResolve:chooseNStep:confirm | 36 | 1.13 | 0.0313 | 0.0614 | 0.0826 | 9.25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:confirm | 42 | 1.12 | 0.0268 | 0.0445 | 0.099 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:add | 12 | 0.56 | 0.0465 | 0.0684 | 0.0684 | 3.4167 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| chooseNStep:chooseNStep:confirm | 10 | 0.47 | 0.0474 | 0.065 | 0.065 | 18.2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:confirm | 12 | 0.34 | 0.0282 | 0.0679 | 0.0679 | 4.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseOne | 12 | 0.26 | 0.0213 | 0.0306 | 0.0306 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseOne | 4 | 0.2 | 0.0493 | 0.0976 | 0.0976 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseNStep:add | 3 | 0.14 | 0.0456 | 0.0486 | 0.0486 | 3.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseOne | 5 | 0.13 | 0.0265 | 0.0356 | 0.0356 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseNStep:confirm | 3 | 0.08 | 0.0262 | 0.0325 | 0.0325 | 3.6667 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| patrol:chooseNStep:confirm | 3 | 0.07 | 0.0236 | 0.0292 | 0.0292 | 4.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| patrol:chooseNStep:add | 1 | 0.06 | 0.0642 | 0.0642 | 0.0642 | 17 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Top Hot Axes In Slow-Tier Seeds

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.

| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms | Cache hits | Cache misses | Cache compile ms |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | govern:chooseNStep:confirm | continuedDeepening | 33 | 16744.72 | 507.4157 | 510.2079 | 10296.1355 | 0 | 0 | 0 |
| 2 | train:chooseNStep:add | continuedDeepening | 14 | 13510.87 | 965.0619 | 3502.2121 | 3502.2121 | 0 | 0 | 0 |
| 3 | govern:chooseNStep:add | continuedDeepening | 55 | 12265.12 | 223.0023 | 314.1816 | 4288.7682 | 0 | 0 | 0 |
| 4 | event | singlePass | 109 | 8700.98 | 79.8255 | 164.6928 | 3400.0111 | 1046 | 78 | 3.6497 |
| 5 | coupArvnRedeployPolice:chooseOne | continuedDeepening | 58 | 7586.58 | 130.8031 | 334.6734 | 349.5981 | 0 | 0 | 0 |
| 6 | train:chooseNStep:confirm | continuedDeepening | 12 | 6566.63 | 547.2189 | 3218.2863 | 3218.2863 | 0 | 0 | 0 |
| 7 | govern | singlePass | 47 | 3146.37 | 66.944 | 84.7839 | 695.3531 | 344 | 32 | 2.3628 |
| 8 | coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | 84 | 1759.09 | 20.9415 | 35.804 | 50.8558 | 0 | 0 | 0 |
| 9 | event-decision:chooseNStep:add | continuedDeepening | 6 | 1578.56 | 263.094 | 389.4746 | 389.4746 | 0 | 0 | 0 |
| 10 | rally | singlePass | 67 | 1399.81 | 20.8927 | 51.0062 | 70.979 | 310 | 35 | 1.4633 |

## WASM Timing Buckets

| Microturn class | Route class | Calls | Marshaling ms | Execution ms | Deserialization ms |
|---|---|---:|---:|---:|---:|
| event | scoreRows | 2562 | 225.9549 | 102.0192 | 4.174 |
| govern:chooseNStep:add | productionPreviewDrive | 2124 | 100.2854 | 10.8092 | 38.8235 |
| train:chooseNStep:add | productionPreviewDrive | 1044 | 43.9658 | 4.9939 | 18.603 |
| govern | scoreRows | 944 | 74.1877 | 34.3811 | 0.8618 |
| coupPacifyUS | scoreRows | 760 | 43.2544 | 25.7836 | 0.5416 |
| rally | scoreRows | 724 | 62.7749 | 29.4175 | 0.7679 |
| coupArvnRedeployOptionalTroops | scoreRows | 704 | 61.9661 | 25.183 | 1.083 |
| coupArvnRedeployPolice | scoreRows | 688 | 58.3455 | 24.2773 | 1.1437 |
| coupCommitmentPass | scoreRows | 680 | 26.051 | 22.4096 | 0.2687 |
| coupRedeployPass | scoreRows | 680 | 36.2393 | 22.5248 | 0.3398 |
| train:chooseNStep:confirm | productionPreviewDrive | 624 | 19.78 | 2.841 | 9.6556 |
| infiltrate | scoreRows | 444 | 32.7844 | 16.1132 | 0.594 |
| advise | scoreRows | 430 | 20.3575 | 14.9389 | 0.2907 |
| march | scoreRows | 424 | 26.8484 | 14.6313 | 0.3152 |
| rally | productionPreviewDrive | 381 | 38.9971 | 3.3511 | 24.9874 |
| coupPacifyPass | scoreRows | 360 | 15.481 | 11.8597 | 0.1634 |
| coupAgitateVC | scoreRows | 276 | 18.675 | 9.5472 | 0.2034 |
| coupPacifyARVN | scoreRows | 248 | 13.9771 | 8.6157 | 0.1872 |
| coupNvaRedeployTroops | scoreRows | 228 | 12.7699 | 7.9058 | 0.1252 |
| assault | scoreRows | 210 | 10.5777 | 6.9162 | 0.1092 |
| coupResourcesResolve | scoreRows | 200 | 8.3452 | 6.586 | 0.0848 |
| coupVictoryCheck | scoreRows | 200 | 9.0171 | 7.2199 | 0.1088 |
| coupAgitateVC | productionPreviewDrive | 184 | 17.935 | 0.9485 | 14.1975 |
| train | scoreRows | 184 | 9.4135 | 6.2251 | 0.0938 |
| advise | productionPreviewDrive | 164 | 24.4793 | 2.1109 | 12.2169 |
| attack | scoreRows | 144 | 10.939 | 5.1878 | 0.1118 |
| infiltrate | productionPreviewDrive | 136 | 15.4783 | 1.074 | 8.367 |
| coupCommitmentPass | productionPreviewDrive | 131 | 14.7598 | 0.6618 | 9.1192 |
| coupCommitmentPass | previewCandidateFeatureRows | 120 | 15.1996 | 4.3846 | 0.1413 |
| train | productionPreviewDrive | 108 | 11.6923 | 0.6954 | 6.6542 |
| march | productionPreviewDrive | 107 | 11.9637 | 0.6124 | 7.2503 |
| rally | previewCandidateFeatureRows | 107 | 16.6635 | 4.62 | 0.1681 |
| coupPacifyUS | productionPreviewDrive | 106 | 11.7073 | 0.6454 | 8.9506 |
| coupCommitmentResolve | scoreRows | 90 | 2.7335 | 2.9154 | 0.0362 |
| coupRedeployPass | productionPreviewDrive | 82 | 7.4187 | 0.4172 | 6.188 |
| assault | productionPreviewDrive | 80 | 9.2947 | 0.4752 | 5.6347 |
| coupAgitatePass | scoreRows | 80 | 4.5102 | 2.7493 | 0.0638 |
| coupRedeployPass | previewCandidateFeatureRows | 80 | 10.1711 | 2.8544 | 0.0824 |
| event-decision:chooseNStep:add | productionPreviewDrive | 69 | 3.4426 | 0.4157 | 1.4418 |
| coupPacifyARVN | productionPreviewDrive | 66 | 7.7557 | 0.3184 | 4.4581 |
| ambushNva | scoreRows | 60 | 3.3859 | 1.9081 | 0.0264 |
| coupPacifyPass | productionPreviewDrive | 60 | 6.6763 | 0.3143 | 5.1845 |
| coupPacifyPass | previewCandidateFeatureRows | 58 | 8.3108 | 2.1434 | 0.0645 |
| transport | scoreRows | 56 | 4.984 | 1.9124 | 0.0405 |
| coupAgitatePass | productionPreviewDrive | 50 | 4.1213 | 0.2048 | 3.2612 |
| ambushVc | scoreRows | 48 | 3.9229 | 1.6847 | 0.0305 |
| march | previewCandidateFeatureRows | 47 | 7.7073 | 1.8698 | 0.0753 |
| coupAgitateVC | previewCandidateFeatureRows | 46 | 5.5285 | 1.6937 | 0.0551 |
| attack | productionPreviewDrive | 44 | 4.5021 | 0.2379 | 2.4618 |
| govern | productionPreviewDrive | 42 | 8.1925 | 1.6629 | 6.8364 |
| coupAgitatePass | previewCandidateFeatureRows | 40 | 4.5599 | 1.4408 | 0.0396 |
| advise | previewCandidateFeatureRows | 39 | 11.5746 | 1.8072 | 0.0701 |
| ambushVc | productionPreviewDrive | 38 | 3.0454 | 0.185 | 2.0571 |
| infiltrate | previewCandidateFeatureRows | 37 | 10.4175 | 1.5744 | 0.082 |
| coupArvnRedeployOptionalTroops | productionPreviewDrive | 36 | 4.4208 | 0.2856 | 3.0093 |
| coupPacifyARVN | previewCandidateFeatureRows | 32 | 3.5051 | 1.1987 | 0.0376 |
| coupPacifyUS | previewCandidateFeatureRows | 30 | 7.8654 | 1.1722 | 0.0367 |
| resolveHonoluluPacify | scoreRows | 28 | 1.4559 | 0.9075 | 0.0123 |
| train | previewCandidateFeatureRows | 26 | 3.4118 | 1.0452 | 0.0375 |
| coupArvnRedeployMandatory | scoreRows | 24 | 1.4219 | 0.7939 | 0.0134 |
| assault | previewCandidateFeatureRows | 21 | 3.6132 | 0.8207 | 0.04 |
| coupArvnRedeployPolice | productionPreviewDrive | 20 | 2.2834 | 0.1498 | 1.8125 |
| coupResourcesResolve | previewCandidateFeatureRows | 20 | 4.4627 | 0.7334 | 0.0269 |
| coupResourcesResolve | productionPreviewDrive | 20 | 2.4421 | 0.1381 | 1.7346 |
| coupVictoryCheck | previewCandidateFeatureRows | 20 | 3.5666 | 0.8526 | 0.0283 |
| coupVictoryCheck | productionPreviewDrive | 20 | 2.1755 | 0.1424 | 1.9618 |
| coupCommitmentResolve | productionPreviewDrive | 18 | 1.8414 | 0.1748 | 3.5864 |
| coupNvaRedeployTroops | productionPreviewDrive | 14 | 3.2635 | 0.0781 | 1.0773 |
| pass | scoreRows | 12 | 0.4295 | 0.3912 | 0.005 |
| ambushNva | productionPreviewDrive | 11 | 1.7783 | 0.0671 | 0.6417 |
| attack | previewCandidateFeatureRows | 11 | 2.9419 | 0.4529 | 0.0189 |
| ambushVc | previewCandidateFeatureRows | 10 | 1.1367 | 0.3774 | 0.0121 |
| patrol | scoreRows | 10 | 0.4125 | 0.3394 | 0.004 |
| coupCommitmentResolve | previewCandidateFeatureRows | 9 | 1.6029 | 0.3509 | 0.0139 |
| coupNvaRedeployTroops | previewCandidateFeatureRows | 7 | 1.0714 | 0.2482 | 0.0621 |
| ambushNva | previewCandidateFeatureRows | 5 | 0.9384 | 0.2142 | 0.0085 |
| coupArvnRedeployMandatory | productionPreviewDrive | 4 | 0.4384 | 0.0287 | 0.3028 |
| pass | previewCandidateFeatureRows | 1 | 0.1498 | 0.0357 | 0.0015 |
| pass | productionPreviewDrive | 1 | 0.1086 | 0.0071 | 0.0795 |

## WASM Serialization Stats

| Microturn class | Axis label | Calls | Total bytes | Bytes/call | Cache write ms | Cache write bytes | Cache write count |
|---|---|---:|---:|---:|---:|---:|---:|
| event | actionSelection|none | 2482 | 82678752 | 33311.3425 | 0 | 0 | 0 |
| govern | actionSelection|continuedDeepening | 944 | 31202520 | 33053.5169 | 0 | 0 | 0 |
| coupPacifyUS | actionSelection|none | 790 | 25734032 | 32574.7241 | 0 | 0 | 0 |
| coupArvnRedeployOptionalTroops | actionSelection|continuedDeepening | 704 | 23500736 | 33381.7273 | 0 | 0 | 0 |
| rally | actionSelection|none | 698 | 23261552 | 33326.0057 | 0 | 0 | 0 |
| coupArvnRedeployPolice | actionSelection|continuedDeepening | 688 | 22768376 | 33093.5698 | 0 | 0 | 0 |
| coupRedeployPass | coupRedeployPass|none | 680 | 19566480 | 28774.2353 | 0 | 0 | 0 |
| coupCommitmentPass | coupCommitmentPass|none | 559 | 15637060 | 27973.2737 | 0 | 0 | 0 |
| advise | actionSelection|none | 469 | 15415352 | 32868.5544 | 0 | 0 | 0 |
| infiltrate | actionSelection|none | 429 | 14823660 | 34553.986 | 0 | 0 | 0 |
| coupAgitateVC | actionSelection|none | 322 | 10512848 | 32648.5963 | 0 | 0 | 0 |
| march | actionSelection|none | 299 | 9868344 | 33004.495 | 0 | 0 | 0 |
| coupPacifyARVN | actionSelection|continuedDeepening | 280 | 9157868 | 32706.6714 | 0 | 0 | 0 |
| coupNvaRedeployTroops | actionSelection|none | 235 | 7656864 | 32582.4 | 0 | 0 | 0 |
| assault | actionSelection|none | 231 | 7532096 | 32606.4762 | 0 | 0 | 0 |
| coupResourcesResolve | coupResourcesResolve|none | 240 | 7164780 | 29853.25 | 0 | 0 | 0 |
| coupPacifyPass | coupPacifyPass|none | 240 | 7163520 | 29848 | 0 | 0 | 0 |
| coupVictoryCheck | coupVictoryCheck|none | 240 | 7163520 | 29848 | 0 | 0 | 0 |
| train | actionSelection|continuedDeepening | 210 | 6873508 | 32730.9905 | 0 | 0 | 0 |
| coupCommitmentPass | coupCommitmentPass|continuedDeepening | 240 | 6544000 | 27266.6667 | 0 | 0 | 0 |
| coupPacifyPass | coupPacifyPass|continuedDeepening | 218 | 5891512 | 27025.2844 | 0 | 0 | 0 |
| march | march|none | 219 | 5643700 | 25770.3196 | 0 | 0 | 0 |
| coupRedeployPass | actionSelection|continuedDeepening | 160 | 5271056 | 32944.1 | 0 | 0 | 0 |
| attack | actionSelection|none | 155 | 5253500 | 33893.5484 | 0 | 0 | 0 |
| rally | rally|none | 240 | 4445344 | 18522.2667 | 0 | 0 | 0 |
| coupCommitmentPass | actionSelection|none | 121 | 3933248 | 32506.1818 | 0 | 0 | 0 |
| coupCommitmentResolve | actionSelection|none | 99 | 3218112 | 32506.1818 | 0 | 0 | 0 |
| coupAgitatePass | coupAgitatePass|none | 130 | 2964860 | 22806.6154 | 0 | 0 | 0 |
| event | actionSelection|continuedDeepening | 80 | 2649096 | 33113.7 | 0 | 0 | 0 |
| ambushVc | actionSelection|none | 58 | 1906152 | 32864.6897 | 0 | 0 | 0 |
| transport | actionSelection|continuedDeepening | 56 | 1854252 | 33111.6429 | 0 | 0 | 0 |
| infiltrate | infiltrate|none | 89 | 1728440 | 19420.6742 | 0 | 0 | 0 |
| ambushNva | ambushNva|none | 44 | 1271936 | 28907.6364 | 0 | 0 | 0 |
| coupAgitatePass | actionSelection|none | 30 | 977480 | 32582.6667 | 0 | 0 | 0 |
| ambushNva | actionSelection|none | 26 | 880676 | 33872.1538 | 0 | 0 | 0 |
| coupArvnRedeployMandatory | actionSelection|continuedDeepening | 24 | 793820 | 33075.8333 | 0 | 0 | 0 |
| resolveHonoluluPacify | resolveHonoluluPacify|none | 20 | 649504 | 32475.2 | 0 | 0 | 0 |
| coupPacifyPass | actionSelection|continuedDeepening | 18 | 588976 | 32720.8889 | 0 | 0 | 0 |
| pass | pass|none | 14 | 423180 | 30227.1429 | 0 | 0 | 0 |
| patrol | actionSelection|none | 10 | 325672 | 32567.2 | 0 | 0 | 0 |
| govern:chooseNStep:add | production-deep-choosenstep-continuation|continuedDeepening | 2124 | 288864 | 136 | 0 | 0 | 0 |
| resolveHonoluluPacify | resolveHonoluluPacify|continuedDeepening | 8 | 260308 | 32538.5 | 0 | 0 | 0 |
| train:chooseNStep:add | production-deep-choosenstep-continuation|continuedDeepening | 1044 | 141984 | 136 | 0 | 0 | 0 |
| coupAgitateVC | coupAgitatePass|none | 138 | 131928 | 956 | 0 | 0 | 0 |
| rally | march|none | 84 | 94616 | 1126.381 | 0 | 0 | 0 |
| rally | attack|none | 86 | 85000 | 988.3721 | 0 | 0 | 0 |
| train:chooseNStep:confirm | production-deep-choosenstep-continuation|continuedDeepening | 624 | 84864 | 136 | 0 | 0 | 0 |
| rally | ambushVc|none | 74 | 76288 | 1030.9189 | 0 | 0 | 0 |
| coupPacifyUS | coupPacifyPass|none | 76 | 72656 | 956 | 0 | 0 | 0 |
| advise | advise|none | 42 | 49136 | 1169.9048 | 0 | 0 | 0 |
| advise | airLift|none | 38 | 48772 | 1283.4737 | 0 | 0 | 0 |
| coupAgitateVC | coupAgitateVC|none | 46 | 44528 | 968 | 0 | 0 | 0 |
| govern | govern|continuedDeepening | 42 | 44456 | 1058.4762 | 0 | 0 | 0 |
| advise | airStrike|none | 38 | 42840 | 1127.3684 | 0 | 0 | 0 |
| advise | assault|none | 40 | 41920 | 1048 | 0 | 0 | 0 |
| coupArvnRedeployOptionalTroops | coupArvnRedeployOptionalTroops|continuedDeepening | 36 | 41728 | 1159.1111 | 0 | 0 | 0 |
| infiltrate | rally|none | 33 | 38284 | 1160.1212 | 0 | 0 | 0 |
| train | assault|continuedDeepening | 32 | 33480 | 1046.25 | 0 | 0 | 0 |
| coupPacifyARVN | coupPacifyARVN|continuedDeepening | 34 | 32912 | 968 | 0 | 0 | 0 |
| infiltrate | nvaTransferResources|none | 33 | 32340 | 980 | 0 | 0 | 0 |
| infiltrate | march|none | 28 | 31268 | 1116.7143 | 0 | 0 | 0 |
| coupPacifyARVN | coupPacifyPass|continuedDeepening | 32 | 30592 | 956 | 0 | 0 | 0 |
| train | patrol|continuedDeepening | 26 | 29512 | 1135.0769 | 0 | 0 | 0 |
| coupPacifyUS | coupPacifyUS|none | 30 | 29040 | 968 | 0 | 0 | 0 |
| train | sweep|continuedDeepening | 24 | 27872 | 1161.3333 | 0 | 0 | 0 |
| train | train|continuedDeepening | 26 | 27736 | 1066.7692 | 0 | 0 | 0 |
| march | rally|none | 23 | 26332 | 1144.8696 | 0 | 0 | 0 |
| rally | terror|none | 24 | 24576 | 1024 | 0 | 0 | 0 |
| assault | patrol|none | 21 | 23828 | 1134.6667 | 0 | 0 | 0 |
| march | terror|none | 23 | 23528 | 1022.9565 | 0 | 0 | 0 |
| assault | train|none | 21 | 22356 | 1064.5714 | 0 | 0 | 0 |
| assault | assault|none | 21 | 22016 | 1048.381 | 0 | 0 | 0 |
| coupArvnRedeployPolice | coupArvnRedeployMandatory|continuedDeepening | 20 | 21040 | 1052 | 0 | 0 | 0 |
| assault | sweep|none | 17 | 19740 | 1161.1765 | 0 | 0 | 0 |
| march | nvaTransferResources|none | 14 | 13720 | 980 | 0 | 0 | 0 |
| coupCommitmentPass | coupCommitmentResolve|none | 11 | 13048 | 1186.1818 | 0 | 0 | 0 |
| attack | march|none | 11 | 12684 | 1153.0909 | 0 | 0 | 0 |
| attack | attack|none | 11 | 11272 | 1024.7273 | 0 | 0 | 0 |
| coupCommitmentResolve | coupCommitmentResolve|none | 9 | 10680 | 1186.6667 | 0 | 0 | 0 |
| ambushVc | ambushVc|none | 10 | 10248 | 1024.8 | 0 | 0 | 0 |
| coupAgitatePass | coupAgitateVC|none | 10 | 9680 | 968 | 0 | 0 | 0 |
| attack | rally|none | 8 | 9384 | 1173 | 0 | 0 | 0 |
| event-decision:chooseNStep:add | production-deep-choosenstep-continuation|continuedDeepening | 69 | 9384 | 136 | 0 | 0 | 0 |
| ambushVc | march|none | 8 | 8968 | 1121 | 0 | 0 | 0 |
| coupCommitmentResolve | coupCommitmentPass|none | 9 | 8604 | 956 | 0 | 0 | 0 |
| ambushVc | attack|none | 8 | 7928 | 991 | 0 | 0 | 0 |
| coupNvaRedeployTroops | coupNvaRedeployTroops|none | 7 | 7140 | 1020 | 0 | 0 | 0 |
| coupNvaRedeployTroops | coupRedeployPass|none | 7 | 6692 | 956 | 0 | 0 | 0 |
| ambushVc | subvert|none | 6 | 6360 | 1060 | 0 | 0 | 0 |
| ambushVc | tax|none | 6 | 6312 | 1052 | 0 | 0 | 0 |
| attack | nvaTransferResources|none | 6 | 5880 | 980 | 0 | 0 | 0 |
| infiltrate | terror|none | 5 | 5116 | 1023.2 | 0 | 0 | 0 |
| coupArvnRedeployMandatory | coupArvnRedeployMandatory|continuedDeepening | 4 | 4496 | 1124 | 0 | 0 | 0 |
| rally | subvert|none | 4 | 4392 | 1098 | 0 | 0 | 0 |
| advise | patrol|none | 3 | 3396 | 1132 | 0 | 0 | 0 |
| attack | infiltrate|none | 3 | 3204 | 1068 | 0 | 0 | 0 |
| advise | train|none | 3 | 3200 | 1066.6667 | 0 | 0 | 0 |
| attack | terror|none | 3 | 3060 | 1020 | 0 | 0 | 0 |
| ambushNva | march|none | 2 | 2372 | 1186 | 0 | 0 | 0 |
| ambushNva | infiltrate|none | 2 | 2140 | 1070 | 0 | 0 | 0 |
| coupRedeployPass | coupArvnRedeployMandatory|continuedDeepening | 2 | 2104 | 1052 | 0 | 0 | 0 |
| rally | tax|none | 2 | 2080 | 1040 | 0 | 0 | 0 |
| ambushNva | attack|none | 2 | 2064 | 1032 | 0 | 0 | 0 |
| attack | ambushNva|none | 2 | 2032 | 1016 | 0 | 0 | 0 |
| coupPacifyPass | coupPacifyARVN|continuedDeepening | 2 | 1936 | 968 | 0 | 0 | 0 |

## WASM Preview-Drive Unsupported Reasons

| Microturn class | Unsupported class | Unsupported owner | Reason | Count | Class unsupported total | Class route total |
|---|---|---|---|---:|---:|---:|
| govern:chooseNStep:confirm | unknown | production-deep-choosenstep-continuation.projectedState | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 520 | 520 | 0 |
| event | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 276 | 276 | 0 |
| rally | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 198 | 215 | 381 |
| coupArvnRedeployOptionalTroops | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 176 | 176 | 36 |
| coupArvnRedeployPolice | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 172 | 172 | 20 |
| govern | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 132 | 236 | 42 |
| govern | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 104 | 236 | 42 |
| coupAgitateVC | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 92 | 92 | 184 |
| govern:chooseNStep:add | unknown | production-deep-choosenstep-continuation.projectedState | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 73 | 73 | 708 |
| coupPacifyUS | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 46 | 46 | 106 |
| coupRedeployPass | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 40 | 40 | 82 |
| coupPacifyARVN | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 28 | 30 | 66 |
| rally | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 17 | 215 | 381 |
| ambushVc | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 14 | 14 | 38 |
| event-decision:chooseNStep:add | unknown | production-deep-choosenstep-continuation.projectedState | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 14 | 14 | 63 |
| train:chooseNStep:add | unknown | production-deep-choosenstep-continuation.projectedState | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 13 | 13 | 359 |
| coupNvaRedeployTroops | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 12 | 12 | 14 |
| train | agent-guided-completion | production-preview-drive.chooseN | only origin-seat greedy chooseN publication is supported | 12 | 20 | 108 |
| train:chooseNStep:confirm | unknown | production-deep-choosenstep-continuation.projectedState | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 12 | 12 | 72 |
| transport | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 10 | 14 | 0 |
| attack | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 6 | 6 | 44 |
| coupArvnRedeployMandatory | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 6 | 6 | 4 |
| resolveHonoluluPacify | unsupported-effect | production-preview-drive.effect.popInterruptPhase | unsupported production preview-drive effect popInterruptPhase | 4 | 4 | 0 |
| train | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 4 | 20 | 108 |
| train | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 4 | 20 | 108 |
| transport | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 4 | 14 | 0 |
| advise | agent-guided-completion | production-preview-drive.chooseN | only origin-seat greedy chooseN publication is supported | 3 | 4 | 164 |
| coupPacifyARVN | unsupported-effect | production-preview-drive.effect.popInterruptPhase | unsupported production preview-drive effect popInterruptPhase | 2 | 30 | 66 |
| coupPacifyPass | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 2 | 2 | 60 |
| advise | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 1 | 4 | 164 |
| patrol | agent-guided-completion | production-preview-drive.chooseN | only origin-seat greedy chooseN publication is supported | 1 | 1 | 0 |

## Fast-Tier vs Slow-Tier Delta

Fast tier: `1000`, `1006`, `1007`, `1010`, `1014`. Rows with ratio greater than `3.0` satisfy the Phase 0 hot-axis criterion.

| Microturn class | Slow decisions | Fast decisions | Slow mean ms | Fast mean ms | Slow:fast ratio | Verdict |
|---|---:|---:|---:|---:|---:|---|
| coupNvaRedeployTroops | 11 | 1 | 8.9337 | 3.5743 | 2.4994 |  |
| event-decision:chooseOne | 12 | 6 | 0.3445 | 0.1705 | 2.0205 |  |
| coupArvnRedeployPolice:chooseOne | 58 | 50 | 130.8031 | 70.834 | 1.8466 |  |
| train:chooseNStep:confirm | 22 | 17 | 298.5285 | 178.905 | 1.6686 |  |
| event-decision:chooseNStep:add | 48 | 30 | 32.9219 | 23.8496 | 1.3804 |  |
| govern:chooseNStep:confirm | 44 | 35 | 380.5847 | 282.6242 | 1.3466 |  |
| transport | 4 | 3 | 57.8221 | 43.8405 | 1.3189 |  |
| assault:chooseNStep:confirm | 16 | 12 | 0.0318 | 0.0248 | 1.2823 |  |
| assault:chooseNStep:add | 8 | 6 | 0.0634 | 0.0502 | 1.2629 |  |
| march:chooseNStep:add | 21 | 22 | 0.065 | 0.0539 | 1.2059 |  |
| advise:chooseNStep:confirm | 13 | 15 | 0.0491 | 0.0416 | 1.1803 |  |
| govern | 47 | 35 | 66.944 | 56.8676 | 1.1772 |  |
| advise:chooseOne | 27 | 30 | 0.0432 | 0.0368 | 1.1739 |  |
| coupVictoryCheck | 8 | 6 | 3.8148 | 3.3364 | 1.1434 |  |
| rally:chooseNStep:confirm | 77 | 72 | 0.0354 | 0.0319 | 1.1097 |  |
| govern:chooseNStep:add | 55 | 35 | 223.0023 | 205.0454 | 1.0876 |  |
| assault | 8 | 6 | 9.2811 | 8.6245 | 1.0761 |  |
| coupCommitmentPass | 32 | 24 | 3.5567 | 3.3054 | 1.076 |  |
| train:chooseOne | 12 | 11 | 4.9831 | 4.6743 | 1.0661 |  |
| coupArvnRedeployOptionalTroops:chooseOne | 84 | 60 | 20.9415 | 19.6809 | 1.0641 |  |
| coupArvnRedeployOptionalTroops | 32 | 25 | 42.326 | 40.4851 | 1.0455 |  |
| event-decision:chooseNStep:confirm | 47 | 27 | 0.0333 | 0.0319 | 1.0439 |  |
| coupRedeployPass | 32 | 24 | 8.6533 | 8.3596 | 1.0351 |  |
| coupArvnRedeployPolice | 27 | 32 | 31.5472 | 30.6995 | 1.0276 |  |
| attack | 4 | 8 | 11.0502 | 10.8221 | 1.0211 |  |
| coupPacifyUS | 25 | 26 | 8.7115 | 8.6657 | 1.0053 |  |
| advise:chooseNStep:add | 13 | 15 | 0.1318 | 0.1328 | 0.9925 |  |
| march | 15 | 13 | 5.9087 | 5.9615 | 0.9911 |  |
| ambushVc:chooseNStep:add | 7 | 3 | 0.0474 | 0.048 | 0.9875 |  |
| govern:chooseOne | 58 | 35 | 3.5134 | 3.6544 | 0.9614 |  |
| coupCommitmentResolve:chooseNStep:confirm | 12 | 12 | 0.0296 | 0.0308 | 0.961 |  |
| ambushVc:chooseOne | 7 | 4 | 0.0209 | 0.0218 | 0.9587 |  |
| coupPacifyARVN | 11 | 8 | 9.1308 | 9.6298 | 0.9482 |  |
| coupResourcesResolve | 8 | 6 | 3.725 | 3.9671 | 0.939 |  |
| coupAgitatePass | 8 | 6 | 3.5028 | 3.7526 | 0.9334 |  |
| rally:chooseOne | 70 | 57 | 0.0322 | 0.0345 | 0.9333 |  |
| train | 8 | 7 | 29.623 | 31.8106 | 0.9312 |  |
| event | 109 | 77 | 79.8255 | 86.4381 | 0.9235 |  |
| infiltrate | 16 | 8 | 9.7241 | 10.5671 | 0.9202 |  |
| chooseNStep:chooseNStep:confirm | 6 | 3 | 0.0442 | 0.0482 | 0.917 |  |
| coupCommitmentResolve | 3 | 3 | 4.0102 | 4.3954 | 0.9124 |  |
| chooseOne:chooseOne | 13 | 8 | 0.8307 | 0.9202 | 0.9027 |  |
| coupPacifyPass | 16 | 12 | 4.1686 | 4.804 | 0.8677 |  |
| ambushVc | 7 | 4 | 13.1463 | 15.2131 | 0.8641 |  |
| rally | 67 | 54 | 20.8927 | 24.5336 | 0.8516 |  |
| march:chooseNStep:confirm | 35 | 29 | 0.0353 | 0.0417 | 0.8465 |  |
| coupAgitateVC | 22 | 25 | 7.9517 | 9.6742 | 0.8219 |  |
| rally:chooseNStep:add | 68 | 56 | 0.0694 | 0.0872 | 0.7959 |  |
| infiltrate:chooseOne | 23 | 13 | 0.0316 | 0.0401 | 0.788 |  |
| advise | 13 | 15 | 10.48 | 14.1176 | 0.7423 |  |
| ambushVc:chooseNStep:confirm | 7 | 3 | 0.0259 | 0.0377 | 0.687 |  |
| infiltrate:chooseNStep:confirm | 26 | 12 | 0.0259 | 0.0382 | 0.678 |  |
| coupNvaRedeployTroops:chooseOne | 25 | 2 | 0.0376 | 0.0599 | 0.6277 |  |
| train:chooseNStep:add | 14 | 11 | 965.0619 | 1710.8081 | 0.5641 |  |
| transport:chooseOne | 8 | 6 | 39.43 | 77.5582 | 0.5084 |  |
| infiltrate:chooseNStep:add | 16 | 8 | 0.0497 | 0.1174 | 0.4233 |  |

## Notes

- `elapsedMs` is measured around the per-decision `PolicyAgent.chooseDecision` call. It excludes simulator apply/delta work and report rendering.
- Child processes enforce the per-seed timeout. Each child loads the built engine and production FITL GameSpecDoc, using the repo GameDef cache when available.
- WASM timing buckets are emitted only when `POLICY_WASM_TIMING_PROFILE=1` is set before the child process imports the WASM runtime module.
- The script does not modify engine source or production profile data.
