# FITL ARVN 15-Seed Per-Microturn-Class Decomposition

**Date**: 2026-05-17-phase-4-h4-cache-amortization
**Status**: Spec 173 measurement witness.
**Command**: `POLICY_WASM_TIMING_PROFILE=1 node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 600000 --date 2026-05-17-phase-4-h4-cache-amortization`
**CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-4-h4-cache-amortization.csv`

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

## Per-Seed Wall Time

| Seed | Status | Stop Reason | Wall ms | Decisions | ms/decision | Error |
|---:|---|---|---:|---:|---:|---|
| 1000 | OK | terminal | 5628.76 | 159 | 35.401 |  |
| 1001 | OK | terminal | 7426.02 | 193 | 38.4768 |  |
| 1002 | OK | terminal | 4898.76 | 148 | 33.0997 |  |
| 1003 | OK | terminal | 8610.97 | 226 | 38.1016 |  |
| 1004 | OK | terminal | 13744.44 | 344 | 39.9548 |  |
| 1005 | OK | terminal | 47221.48 | 398 | 118.6469 |  |
| 1006 | OK | terminal | 10682.19 | 228 | 46.8517 |  |
| 1007 | OK | terminal | 7115.27 | 218 | 32.6389 |  |
| 1008 | OK | terminal | 20365.59 | 346 | 58.8601 |  |
| 1009 | OK | terminal | 12491.04 | 292 | 42.7775 |  |
| 1010 | OK | terminal | 33977.41 | 339 | 100.2283 |  |
| 1011 | OK | terminal | 7563.3 | 206 | 36.715 |  |
| 1012 | OK | terminal | 17261.96 | 201 | 85.8804 |  |
| 1013 | OK | terminal | 7884.76 | 258 | 30.5611 |  |
| 1014 | OK | terminal | 18793.47 | 213 | 88.2323 |  |

## Per-Microturn-Class Rollup

| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | Cache hits | Cache misses | Cache compile ms | WASM preview-drive routes | WASM preview-drive unsupported | WASM preview-drive unsupported reasons | WASM preview-drive batches | WASM timing calls | Marshaling ms | Execution ms | Deserialization ms | Token index builds | Static rebuilds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|
| train:chooseNStep:add | 37 | 39986.68 | 1080.721 | 3620.224 | 14502.9581 | 17.4865 | 0 | 5183 | 7420 | 0 | 0 | 0 | 0 | 0 | 359 | 13 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:13 | 0 | 1044 | 43.5231 | 4.903 | 18.3504 | 0 | 0 |
| govern:chooseNStep:confirm | 115 | 32934.7 | 286.3887 | 502.4544 | 10534.0192 | 6.6957 | 0 | 2505 | 1135 | 0 | 0 | 0 | 0 | 0 | 0 | 520 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:520 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| govern:chooseNStep:add | 135 | 26801.12 | 198.5268 | 321.3399 | 4233.5943 | 6.0815 | 0 | 3770 | 5825 | 0 | 0 | 0 | 0 | 0 | 708 | 73 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:73 | 0 | 2124 | 95.0004 | 11.0462 | 39.3827 | 0 | 0 |
| event | 248 | 23008.82 | 92.7775 | 93.2286 | 5294.9168 | 19.121 | 248 | 0 | 0 | 248 | 234 | 2328 | 234 | 11.1769 | 0 | 276 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:276 | 0 | 2562 | 227.8232 | 104.2165 | 3.4169 | 38 | 278 |
| coupArvnRedeployPolice:chooseOne | 153 | 15506.08 | 101.3469 | 312.6971 | 340.4627 | 30.3922 | 0 | 105697 | 3591 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| train:chooseNStep:confirm | 59 | 10270.94 | 174.0837 | 1700.2479 | 3383.2985 | 3.0508 | 0 | 1810 | 3782 | 0 | 0 | 0 | 0 | 0 | 72 | 12 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:12 | 0 | 624 | 20.7076 | 3.0502 | 10.3598 | 0 | 0 |
| govern | 118 | 7077.33 | 59.9774 | 81.4673 | 649.6852 | 10.7797 | 111 | 0 | 7 | 111 | 96 | 848 | 96 | 3.4375 | 42 | 236 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:132; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:104 | 146 | 986 | 79.4913 | 34.8854 | 6.178 | 0 | 111 |
| coupArvnRedeployOptionalTroops:chooseOne | 215 | 4333.09 | 20.1539 | 35.6079 | 41.9304 | 8.3907 | 0 | 13517 | 1865 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupArvnRedeployOptionalTroops | 88 | 3695.72 | 41.9968 | 50.8167 | 64.4282 | 17.2159 | 71 | 0 | 17 | 71 | 0 | 704 | 0 | 0 | 36 | 176 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:176 | 212 | 740 | 68.2666 | 26.1317 | 3.9885 | 0 | 71 |
| rally | 165 | 3652.57 | 22.1368 | 47.2753 | 144.4585 | 15.0667 | 146 | 0 | 19 | 146 | 100 | 731 | 100 | 4.1225 | 381 | 215 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:198; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:17 | 398 | 1212 | 113.6619 | 35.194 | 30.5096 | 0 | 146 |
| coupArvnRedeployPolice | 86 | 2723.71 | 31.671 | 36.0021 | 45.2257 | 11.6744 | 85 | 0 | 1 | 85 | 0 | 688 | 0 | 0 | 20 | 172 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:172 | 192 | 708 | 56.6994 | 24.3514 | 3.4975 | 0 | 85 |
| event-decision:chooseNStep:add | 96 | 2452.91 | 25.5511 | 275.7525 | 394.2562 | 11.4479 | 0 | 250 | 1045 | 0 | 0 | 0 | 0 | 0 | 63 | 14 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:14 | 0 | 69 | 4.5042 | 0.4697 | 1.5602 | 0 | 0 |
| transport:chooseOne | 14 | 754.04 | 53.8603 | 111.8631 | 111.8631 | 16.7143 | 0 | 952 | 37 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupRedeployPass | 80 | 707.43 | 8.8429 | 27.8344 | 32.267 | 2.95 | 32 | 0 | 48 | 32 | 15 | 745 | 15 | 0.4376 | 82 | 40 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:40 | 122 | 842 | 54.7518 | 25.8511 | 6.8091 | 0 | 32 |
| coupPacifyUS | 76 | 683.62 | 8.9949 | 14.4974 | 16.72 | 2.8158 | 76 | 0 | 0 | 76 | 0 | 790 | 0 | 0 | 106 | 46 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:46 | 152 | 896 | 65.076 | 27.7812 | 9.0114 | 0 | 76 |
| train | 23 | 648.2 | 28.1826 | 58.6304 | 62.885 | 5.4348 | 23 | 0 | 0 | 23 | 12 | 198 | 12 | 0.5393 | 108 | 20 | agent-guided-completion/production-preview-drive.chooseN/only origin-seat greedy chooseN publication is supported:12; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:4; unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:4 | 124 | 318 | 23.1578 | 7.7323 | 6.8338 | 0 | 23 |
| coupAgitateVC | 69 | 635.46 | 9.2095 | 13.1899 | 18.335 | 2.971 | 52 | 0 | 17 | 52 | 12 | 310 | 12 | 0.7228 | 184 | 92 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:92 | 276 | 506 | 45.0366 | 12.9347 | 14.6143 | 0 | 52 |
| patrol | 1 | 590.29 | 590.2946 | 590.2946 | 590.2946 | 4 | 1 | 0 | 0 | 1 | 0 | 10 | 0 | 0 | 0 | 1 | agent-guided-completion/production-preview-drive.chooseN/only origin-seat greedy chooseN publication is supported:1 | 1 | 10 | 0.3756 | 0.3216 | 0.0041 | 0 | 1 |
| advise | 43 | 514.28 | 11.9601 | 38.1956 | 45.8856 | 11.4186 | 32 | 0 | 11 | 32 | 8 | 461 | 8 | 0.6548 | 164 | 4 | agent-guided-completion/production-preview-drive.chooseN/only origin-seat greedy chooseN publication is supported:3; unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:1 | 167 | 633 | 53.8099 | 18.9 | 12.3288 | 0 | 32 |
| govern:chooseOne | 138 | 487.06 | 3.5294 | 5.1353 | 10.8131 | 2 | 0 | 178 | 178 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate | 37 | 388.16 | 10.4909 | 17.8816 | 19.6134 | 48.4324 | 30 | 0 | 7 | 30 | 16 | 465 | 16 | 0.5082 | 136 | 0 |  | 136 | 617 | 62.2621 | 19.4036 | 9.3067 | 0 | 30 |
| transport | 7 | 363.76 | 51.9658 | 62.2665 | 62.2665 | 11.7143 | 7 | 0 | 0 | 7 | 0 | 56 | 0 | 0 | 0 | 14 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:10; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:4 | 4 | 56 | 3.7151 | 1.9921 | 0.0404 | 0 | 7 |
| coupArvnRedeployMandatory:chooseOne | 13 | 329.11 | 25.3163 | 37.7424 | 37.7424 | 8 | 0 | 1435 | 205 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupPacifyARVN | 31 | 305.09 | 9.8415 | 15.1424 | 15.7811 | 3.7742 | 14 | 0 | 17 | 14 | 30 | 250 | 30 | 1.6508 | 66 | 30 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:28; unsupported-effect/production-preview-drive.effect.popInterruptPhase/unsupported production preview-drive effect popInterruptPhase:2 | 96 | 346 | 23.684 | 10.1584 | 4.4406 | 0 | 14 |
| coupCommitmentPass | 80 | 272.45 | 3.4056 | 5.1553 | 6.2107 | 1.1375 | 9 | 0 | 71 | 9 | 2 | 798 | 2 | 0.1105 | 131 | 0 |  | 131 | 931 | 54.5315 | 27.779 | 9.3288 | 0 | 9 |
| march | 40 | 262.84 | 6.5711 | 11.5785 | 12.8849 | 8.9 | 30 | 0 | 10 | 30 | 66 | 405 | 66 | 1.5937 | 107 | 0 |  | 107 | 578 | 41.171 | 17.6205 | 7.9473 | 0 | 30 |
| assault | 21 | 188.75 | 8.9882 | 11.1422 | 11.875 | 4.8095 | 20 | 0 | 1 | 20 | 3 | 228 | 3 | 0.228 | 80 | 0 |  | 80 | 311 | 24.4935 | 8.7442 | 6.4284 | 0 | 20 |
| coupPacifyPass | 40 | 180.15 | 4.5039 | 6.1651 | 10.7527 | 1.15 | 37 | 0 | 3 | 37 | 2 | 416 | 2 | 0.1087 | 60 | 2 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:2 | 62 | 478 | 32.6291 | 14.7879 | 4.9284 | 0 | 37 |
| coupNvaRedeployTroops | 19 | 177.02 | 9.3171 | 16.4306 | 16.4306 | 3.7368 | 12 | 0 | 7 | 12 | 0 | 235 | 0 | 0 | 14 | 12 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:12 | 26 | 249 | 14.8805 | 7.6498 | 1.0109 | 0 | 12 |
| train:chooseOne | 35 | 174.92 | 4.9977 | 7.7105 | 9.1145 | 2.3143 | 0 | 66 | 99 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc | 12 | 170.24 | 14.1865 | 23.2317 | 23.2317 | 8.1667 | 11 | 0 | 1 | 11 | 0 | 58 | 0 | 0 | 38 | 14 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:14 | 38 | 96 | 7.343 | 2.2791 | 1.9644 | 0 | 11 |
| attack | 14 | 165.25 | 11.8034 | 25.6801 | 25.6801 | 31.6429 | 12 | 0 | 2 | 12 | 0 | 155 | 0 | 0 | 44 | 6 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:6 | 44 | 199 | 16.6156 | 6.052 | 2.4061 | 0 | 12 |
| coupArvnRedeployMandatory | 3 | 128.14 | 42.7129 | 46.4464 | 46.4464 | 11.3333 | 1 | 0 | 2 | 1 | 0 | 24 | 0 | 0 | 4 | 6 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:6 | 10 | 28 | 1.9884 | 0.8924 | 0.3111 | 0 | 1 |
| coupAgitatePass | 20 | 77.9 | 3.8952 | 5.8452 | 7.3043 | 1.25 | 17 | 0 | 3 | 17 | 0 | 120 | 0 | 0 | 50 | 0 |  | 50 | 170 | 12.9765 | 4.354 | 3.4624 | 0 | 17 |
| coupResourcesResolve | 20 | 72.33 | 3.6164 | 4.6781 | 4.8134 | 1 | 3 | 0 | 17 | 3 | 0 | 220 | 0 | 0 | 20 | 0 |  | 20 | 240 | 15.1305 | 7.4619 | 1.6914 | 0 | 3 |
| coupVictoryCheck | 20 | 70.01 | 3.5006 | 4.6823 | 5.0197 | 1 | 20 | 0 | 0 | 20 | 4 | 216 | 4 | 0.2264 | 20 | 0 |  | 20 | 240 | 14.3011 | 7.4503 | 1.8579 | 0 | 20 |
| coupCommitmentResolve | 9 | 43.7 | 4.8555 | 6.2682 | 6.2682 | 2 | 0 | 0 | 9 | 0 | 0 | 99 | 0 | 0 | 18 | 0 |  | 18 | 117 | 5.9494 | 3.4393 | 1.2697 | 0 | 0 |
| ambushNva | 5 | 32.87 | 6.5746 | 10.7848 | 10.7848 | 15.2 | 5 | 0 | 0 | 5 | 0 | 65 | 0 | 0 | 11 | 0 |  | 11 | 76 | 5.4976 | 2.2009 | 0.6933 | 0 | 5 |
| chooseOne:chooseOne | 31 | 22.28 | 0.7186 | 7.7743 | 8.9601 | 5.2903 | 0 | 7 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| resolveHonoluluPacify | 3 | 17.02 | 5.6748 | 6.9332 | 6.9332 | 1 | 3 | 0 | 0 | 3 | 0 | 28 | 0 | 0 | 0 | 4 | unsupported-effect/production-preview-drive.effect.popInterruptPhase/unsupported production preview-drive effect popInterruptPhase:4 | 4 | 28 | 1.5209 | 0.8884 | 0.0113 | 0 | 3 |
| rally:chooseNStep:add | 168 | 13.78 | 0.082 | 0.1336 | 1.0963 | 20.75 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseNStep:confirm | 209 | 7.2 | 0.0345 | 0.0739 | 0.1755 | 14.7943 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseOne | 172 | 5.9 | 0.0343 | 0.0864 | 0.1717 | 1.3547 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseOne | 34 | 5.72 | 0.1683 | 0.6 | 3.7499 | 3.6471 | 0 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:add | 43 | 4.38 | 0.1018 | 0.2599 | 0.7552 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:confirm | 91 | 3.83 | 0.0421 | 0.0732 | 0.1861 | 5.2198 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:add | 57 | 3.53 | 0.0619 | 0.128 | 0.1506 | 11.614 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseOne | 87 | 3.39 | 0.039 | 0.0884 | 0.1189 | 2.4368 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| pass | 1 | 3.29 | 3.2865 | 3.2865 | 3.2865 | 1 | 1 | 0 | 0 | 1 | 0 | 13 | 0 | 0 | 1 | 0 |  | 1 | 14 | 0.7175 | 0.4241 | 0.0761 | 0 | 1 |
| event-decision:chooseNStep:confirm | 89 | 2.86 | 0.0321 | 0.0928 | 0.171 | 6.5169 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:add | 37 | 2.35 | 0.0634 | 0.0751 | 0.6543 | 3.7027 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseOne | 57 | 2.1 | 0.0369 | 0.0728 | 0.1841 | 1.614 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:confirm | 43 | 1.79 | 0.0417 | 0.0688 | 0.1001 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupNvaRedeployTroops:chooseOne | 43 | 1.73 | 0.0402 | 0.0755 | 0.0841 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:confirm | 55 | 1.71 | 0.0311 | 0.0667 | 0.1224 | 4.4909 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:add | 21 | 1.29 | 0.0614 | 0.1014 | 0.1615 | 3.0952 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:confirm | 42 | 1.25 | 0.0298 | 0.0542 | 0.0909 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupCommitmentResolve:chooseNStep:confirm | 36 | 1.12 | 0.0311 | 0.0537 | 0.073 | 9.25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:add | 12 | 0.51 | 0.0422 | 0.0616 | 0.0616 | 3.4167 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| chooseNStep:chooseNStep:confirm | 10 | 0.42 | 0.0416 | 0.0571 | 0.0571 | 18.2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:confirm | 12 | 0.32 | 0.0268 | 0.0735 | 0.0735 | 4.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseOne | 12 | 0.22 | 0.0187 | 0.0335 | 0.0335 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseOne | 4 | 0.18 | 0.0449 | 0.0684 | 0.0684 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseOne | 5 | 0.15 | 0.0306 | 0.0477 | 0.0477 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseNStep:add | 3 | 0.14 | 0.0458 | 0.0483 | 0.0483 | 3.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| patrol:chooseNStep:confirm | 3 | 0.08 | 0.0273 | 0.0319 | 0.0319 | 4.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseNStep:confirm | 3 | 0.07 | 0.0243 | 0.0266 | 0.0266 | 3.6667 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| patrol:chooseNStep:add | 1 | 0.07 | 0.0702 | 0.0702 | 0.0702 | 17 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Top Hot Axes In Slow-Tier Seeds

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.

| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms | Cache hits | Cache misses | Cache compile ms |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | govern:chooseNStep:confirm | continuedDeepening | 33 | 17164.79 | 520.145 | 599.6732 | 10534.0192 | 0 | 0 | 0 |
| 2 | train:chooseNStep:add | continuedDeepening | 14 | 14127.52 | 1009.1088 | 3620.224 | 3620.224 | 0 | 0 | 0 |
| 3 | govern:chooseNStep:add | continuedDeepening | 55 | 12462.18 | 226.5851 | 327.8 | 4233.5943 | 0 | 0 | 0 |
| 4 | event | singlePass | 109 | 8702.27 | 79.8373 | 176.3312 | 3311.3828 | 1046 | 78 | 3.4376 |
| 5 | coupArvnRedeployPolice:chooseOne | continuedDeepening | 58 | 7798.58 | 134.4584 | 327.1553 | 340.4627 | 0 | 0 | 0 |
| 6 | train:chooseNStep:confirm | continuedDeepening | 12 | 6874.44 | 572.8704 | 3383.2985 | 3383.2985 | 0 | 0 | 0 |
| 7 | govern | singlePass | 47 | 3164.52 | 67.3302 | 81.2596 | 649.6852 | 344 | 32 | 1.1145 |
| 8 | coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | 84 | 1770.37 | 21.0758 | 36.4773 | 41.9304 | 0 | 0 | 0 |
| 9 | event-decision:chooseNStep:add | continuedDeepening | 6 | 1664.83 | 277.4716 | 394.2562 | 394.2562 | 0 | 0 | 0 |
| 10 | rally | singlePass | 67 | 1392.94 | 20.7901 | 49.0121 | 52.2802 | 310 | 35 | 1.3347 |

## WASM Timing Buckets

| Microturn class | Route class | Calls | Marshaling ms | Execution ms | Deserialization ms |
|---|---|---:|---:|---:|---:|
| event | scoreRows | 2562 | 227.8232 | 104.2165 | 3.4169 |
| govern:chooseNStep:add | productionPreviewDrive | 2124 | 95.0004 | 11.0462 | 39.3827 |
| train:chooseNStep:add | productionPreviewDrive | 1044 | 43.5231 | 4.903 | 18.3504 |
| govern | scoreRows | 944 | 71.3785 | 33.1634 | 0.7451 |
| coupPacifyUS | scoreRows | 760 | 42.1319 | 25.9816 | 0.5364 |
| rally | scoreRows | 724 | 59.3964 | 27.3446 | 0.7934 |
| coupArvnRedeployOptionalTroops | scoreRows | 704 | 63.928 | 25.8538 | 1.1472 |
| coupArvnRedeployPolice | scoreRows | 688 | 54.6296 | 24.2135 | 1.0374 |
| coupCommitmentPass | scoreRows | 680 | 27.1404 | 22.67 | 0.2819 |
| coupRedeployPass | scoreRows | 680 | 35.0161 | 22.5653 | 0.3405 |
| train:chooseNStep:confirm | productionPreviewDrive | 624 | 20.7076 | 3.0502 | 10.3598 |
| infiltrate | scoreRows | 444 | 34.8563 | 16.6867 | 0.6481 |
| advise | scoreRows | 430 | 23.6004 | 15.1109 | 0.3053 |
| march | scoreRows | 424 | 21.9445 | 15.1225 | 0.3549 |
| rally | productionPreviewDrive | 381 | 39.0347 | 3.3106 | 29.542 |
| coupPacifyPass | scoreRows | 360 | 18.1015 | 12.0119 | 0.1608 |
| coupAgitateVC | scoreRows | 276 | 19.9955 | 10.0754 | 0.2252 |
| coupPacifyARVN | scoreRows | 248 | 13.868 | 8.5884 | 0.1735 |
| coupNvaRedeployTroops | scoreRows | 228 | 12.5805 | 7.3363 | 0.0932 |
| assault | scoreRows | 210 | 10.9079 | 7.3945 | 0.1169 |
| coupResourcesResolve | scoreRows | 200 | 8.0655 | 6.5638 | 0.0813 |
| coupVictoryCheck | scoreRows | 200 | 8.0183 | 6.5076 | 0.1414 |
| coupAgitateVC | productionPreviewDrive | 184 | 19.5445 | 1.0822 | 14.3336 |
| train | scoreRows | 184 | 8.8913 | 6.1849 | 0.0932 |
| advise | productionPreviewDrive | 164 | 21.4707 | 2.0157 | 11.9613 |
| attack | scoreRows | 144 | 9.5383 | 5.339 | 0.108 |
| infiltrate | productionPreviewDrive | 136 | 14.3119 | 1.1005 | 8.5786 |
| coupCommitmentPass | productionPreviewDrive | 131 | 11.5834 | 0.6865 | 8.9204 |
| coupCommitmentPass | previewCandidateFeatureRows | 120 | 15.8077 | 4.4225 | 0.1265 |
| train | productionPreviewDrive | 108 | 11.1103 | 0.5819 | 6.6993 |
| march | productionPreviewDrive | 107 | 11.176 | 0.621 | 7.5238 |
| rally | previewCandidateFeatureRows | 107 | 15.2308 | 4.5388 | 0.1742 |
| coupPacifyUS | productionPreviewDrive | 106 | 12.6787 | 0.665 | 8.4385 |
| coupCommitmentResolve | scoreRows | 90 | 2.6073 | 2.9807 | 0.0313 |
| coupRedeployPass | productionPreviewDrive | 82 | 7.3897 | 0.4278 | 6.3831 |
| assault | productionPreviewDrive | 80 | 8.8428 | 0.5252 | 6.2516 |
| coupAgitatePass | scoreRows | 80 | 3.4563 | 2.6712 | 0.0362 |
| coupRedeployPass | previewCandidateFeatureRows | 80 | 12.346 | 2.858 | 0.0855 |
| event-decision:chooseNStep:add | productionPreviewDrive | 69 | 4.5042 | 0.4697 | 1.5602 |
| coupPacifyARVN | productionPreviewDrive | 66 | 6.2216 | 0.3232 | 4.228 |
| ambushNva | scoreRows | 60 | 3.4048 | 1.932 | 0.0266 |
| coupPacifyPass | productionPreviewDrive | 60 | 5.804 | 0.3239 | 4.7004 |
| coupPacifyPass | previewCandidateFeatureRows | 58 | 8.7236 | 2.4521 | 0.0672 |
| transport | scoreRows | 56 | 3.7151 | 1.9921 | 0.0404 |
| coupAgitatePass | productionPreviewDrive | 50 | 4.9734 | 0.225 | 3.3858 |
| ambushVc | scoreRows | 48 | 3.0834 | 1.7146 | 0.0283 |
| march | previewCandidateFeatureRows | 47 | 8.0505 | 1.877 | 0.0686 |
| coupAgitateVC | previewCandidateFeatureRows | 46 | 5.4966 | 1.7771 | 0.0555 |
| attack | productionPreviewDrive | 44 | 4.1647 | 0.2458 | 2.28 |
| govern | productionPreviewDrive | 42 | 8.1128 | 1.722 | 5.4329 |
| coupAgitatePass | previewCandidateFeatureRows | 40 | 4.5468 | 1.4578 | 0.0404 |
| advise | previewCandidateFeatureRows | 39 | 8.7388 | 1.7734 | 0.0622 |
| ambushVc | productionPreviewDrive | 38 | 3.149 | 0.1803 | 1.925 |
| infiltrate | previewCandidateFeatureRows | 37 | 13.0939 | 1.6164 | 0.08 |
| coupArvnRedeployOptionalTroops | productionPreviewDrive | 36 | 4.3386 | 0.2779 | 2.8413 |
| coupPacifyARVN | previewCandidateFeatureRows | 32 | 3.5944 | 1.2468 | 0.0391 |
| coupPacifyUS | previewCandidateFeatureRows | 30 | 10.2654 | 1.1346 | 0.0365 |
| resolveHonoluluPacify | scoreRows | 28 | 1.5209 | 0.8884 | 0.0113 |
| train | previewCandidateFeatureRows | 26 | 3.1562 | 0.9655 | 0.0413 |
| coupArvnRedeployMandatory | scoreRows | 24 | 1.5603 | 0.8613 | 0.0187 |
| assault | previewCandidateFeatureRows | 21 | 4.7428 | 0.8245 | 0.0599 |
| coupArvnRedeployPolice | productionPreviewDrive | 20 | 2.0698 | 0.1379 | 2.4601 |
| coupResourcesResolve | previewCandidateFeatureRows | 20 | 4.7636 | 0.7597 | 0.0254 |
| coupResourcesResolve | productionPreviewDrive | 20 | 2.3014 | 0.1384 | 1.5847 |
| coupVictoryCheck | previewCandidateFeatureRows | 20 | 4.0523 | 0.8007 | 0.0264 |
| coupVictoryCheck | productionPreviewDrive | 20 | 2.2305 | 0.142 | 1.6901 |
| coupCommitmentResolve | productionPreviewDrive | 18 | 1.8441 | 0.1197 | 1.2257 |
| coupNvaRedeployTroops | productionPreviewDrive | 14 | 1.2009 | 0.07 | 0.8746 |
| pass | scoreRows | 12 | 0.4614 | 0.3812 | 0.0035 |
| ambushNva | productionPreviewDrive | 11 | 1.1348 | 0.0636 | 0.6593 |
| attack | previewCandidateFeatureRows | 11 | 2.9126 | 0.4672 | 0.0181 |
| ambushVc | previewCandidateFeatureRows | 10 | 1.1106 | 0.3842 | 0.0111 |
| patrol | scoreRows | 10 | 0.3756 | 0.3216 | 0.0041 |
| coupCommitmentResolve | previewCandidateFeatureRows | 9 | 1.498 | 0.3389 | 0.0127 |
| coupNvaRedeployTroops | previewCandidateFeatureRows | 7 | 1.0991 | 0.2435 | 0.0431 |
| ambushNva | previewCandidateFeatureRows | 5 | 0.958 | 0.2053 | 0.0074 |
| coupArvnRedeployMandatory | productionPreviewDrive | 4 | 0.4281 | 0.0311 | 0.2924 |
| pass | previewCandidateFeatureRows | 1 | 0.147 | 0.0359 | 0.0008 |
| pass | productionPreviewDrive | 1 | 0.1091 | 0.007 | 0.0718 |

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
| coupNvaRedeployTroops | 11 | 1 | 8.9266 | 3.6924 | 2.4176 |  |
| event-decision:chooseOne | 12 | 6 | 0.344 | 0.146 | 2.3562 |  |
| coupArvnRedeployPolice:chooseOne | 58 | 50 | 134.4584 | 72.2311 | 1.8615 |  |
| train:chooseNStep:confirm | 22 | 17 | 312.5291 | 179.7794 | 1.7384 |  |
| govern:chooseNStep:confirm | 44 | 35 | 390.1317 | 281.6269 | 1.3853 |  |
| advise:chooseOne | 27 | 30 | 0.0481 | 0.0359 | 1.3398 |  |
| event-decision:chooseNStep:add | 48 | 30 | 34.7198 | 26.1771 | 1.3263 |  |
| assault:chooseNStep:add | 8 | 6 | 0.0713 | 0.0557 | 1.2801 |  |
| march:chooseNStep:add | 21 | 22 | 0.071 | 0.0556 | 1.277 |  |
| transport | 4 | 3 | 56.4854 | 45.9396 | 1.2296 |  |
| govern | 47 | 35 | 67.3302 | 56.9531 | 1.1822 |  |
| assault:chooseNStep:confirm | 16 | 12 | 0.0334 | 0.0283 | 1.1802 |  |
| chooseNStep:chooseNStep:confirm | 6 | 3 | 0.0422 | 0.0368 | 1.1467 |  |
| event-decision:chooseNStep:confirm | 47 | 27 | 0.0342 | 0.0299 | 1.1438 |  |
| attack | 4 | 8 | 11.8775 | 10.7768 | 1.1021 |  |
| assault | 8 | 6 | 9.3991 | 8.5386 | 1.1008 |  |
| govern:chooseNStep:add | 55 | 35 | 226.5851 | 206.1289 | 1.0992 |  |
| advise:chooseNStep:add | 13 | 15 | 0.1216 | 0.1118 | 1.0877 |  |
| train:chooseOne | 12 | 11 | 5.3556 | 4.9782 | 1.0758 |  |
| coupRedeployPass | 32 | 24 | 9.2757 | 8.6537 | 1.0719 |  |
| coupPacifyUS | 25 | 26 | 9.2705 | 8.7007 | 1.0655 |  |
| rally:chooseNStep:confirm | 77 | 72 | 0.0364 | 0.0344 | 1.0581 |  |
| govern:chooseOne | 58 | 35 | 3.5678 | 3.4077 | 1.047 |  |
| coupArvnRedeployOptionalTroops:chooseOne | 84 | 60 | 21.0758 | 20.2299 | 1.0418 |  |
| coupCommitmentResolve | 3 | 3 | 4.8866 | 4.6944 | 1.0409 |  |
| advise:chooseNStep:confirm | 13 | 15 | 0.0453 | 0.0438 | 1.0342 |  |
| infiltrate | 16 | 8 | 10.4501 | 10.2448 | 1.02 |  |
| coupCommitmentPass | 32 | 24 | 3.3736 | 3.3416 | 1.0096 |  |
| march | 15 | 13 | 6.1293 | 6.0977 | 1.0052 |  |
| train | 8 | 7 | 31.7536 | 31.5917 | 1.0051 |  |
| coupArvnRedeployPolice | 27 | 32 | 31.586 | 31.5119 | 1.0024 |  |
| coupResourcesResolve | 8 | 6 | 3.5811 | 3.6645 | 0.9772 |  |
| coupArvnRedeployOptionalTroops | 32 | 25 | 41.7715 | 43.2198 | 0.9665 |  |
| coupPacifyARVN | 11 | 8 | 9.8913 | 10.2792 | 0.9623 |  |
| rally:chooseOne | 70 | 57 | 0.0343 | 0.036 | 0.9528 |  |
| coupCommitmentResolve:chooseNStep:confirm | 12 | 12 | 0.0297 | 0.0314 | 0.9459 |  |
| infiltrate:chooseOne | 23 | 13 | 0.0411 | 0.0436 | 0.9427 |  |
| coupVictoryCheck | 8 | 6 | 3.3783 | 3.6261 | 0.9317 |  |
| event | 109 | 77 | 79.8373 | 89.8771 | 0.8883 |  |
| coupAgitatePass | 8 | 6 | 3.693 | 4.2458 | 0.8698 |  |
| ambushVc | 7 | 4 | 13.4041 | 15.5154 | 0.8639 |  |
| march:chooseNStep:confirm | 35 | 29 | 0.0409 | 0.0487 | 0.8398 |  |
| rally | 67 | 54 | 20.7901 | 24.8057 | 0.8381 |  |
| coupPacifyPass | 16 | 12 | 4.0621 | 4.8548 | 0.8367 |  |
| ambushVc:chooseOne | 7 | 4 | 0.0174 | 0.0214 | 0.8131 |  |
| coupAgitateVC | 22 | 25 | 8.351 | 10.34 | 0.8076 |  |
| ambushVc:chooseNStep:add | 7 | 3 | 0.0409 | 0.052 | 0.7865 |  |
| rally:chooseNStep:add | 68 | 56 | 0.0708 | 0.0928 | 0.7629 |  |
| infiltrate:chooseNStep:confirm | 26 | 12 | 0.0311 | 0.0422 | 0.737 |  |
| chooseOne:chooseOne | 13 | 8 | 0.834 | 1.1695 | 0.7131 |  |
| coupNvaRedeployTroops:chooseOne | 25 | 2 | 0.0408 | 0.0591 | 0.6904 |  |
| advise | 13 | 15 | 9.34 | 13.7552 | 0.679 |  |
| train:chooseNStep:add | 14 | 11 | 1009.1088 | 1689.1963 | 0.5974 |  |
| ambushVc:chooseNStep:confirm | 7 | 3 | 0.023 | 0.0408 | 0.5637 |  |
| transport:chooseOne | 8 | 6 | 37.9796 | 75.0346 | 0.5062 |  |
| infiltrate:chooseNStep:add | 16 | 8 | 0.0486 | 0.1199 | 0.4053 |  |

## Notes

- `elapsedMs` is measured around the per-decision `PolicyAgent.chooseDecision` call. It excludes simulator apply/delta work and report rendering.
- Child processes enforce the per-seed timeout. Each child loads the built engine and production FITL GameSpecDoc, using the repo GameDef cache when available.
- WASM timing buckets are emitted only when `POLICY_WASM_TIMING_PROFILE=1` is set before the child process imports the WASM runtime module.
- The script does not modify engine source or production profile data.
