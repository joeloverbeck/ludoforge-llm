# FITL ARVN 15-Seed Per-Microturn-Class Decomposition

**Status**: ✅ EXPLOITED — referenced during spec 174 implementation (archived 2026-05-16).

**Date**: 2026-05-15
**Status**: Phase 0 measurement witness for Spec 173.
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 400000`
**CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-15.csv`

## Summary

- Seeds completed: 15/15
- Per-decision rows: 3741
- Hot class with slow:fast ratio >3x: yes
- Per-seed timeout: 400000 ms

## Per-Seed Wall Time

| Seed | Status | Stop Reason | Wall ms | Decisions | ms/decision | Error |
|---:|---|---|---:|---:|---:|---|
| 1000 | OK | terminal | 12261.86 | 159 | 77.1186 |  |
| 1001 | OK | terminal | 40951.77 | 194 | 211.0916 |  |
| 1002 | OK | terminal | 50429.21 | 288 | 175.1014 |  |
| 1003 | OK | terminal | 43240.53 | 226 | 191.3298 |  |
| 1004 | OK | terminal | 54369.9 | 338 | 160.8577 |  |
| 1005 | OK | terminal | 183274.3 | 412 | 444.8405 |  |
| 1006 | OK | terminal | 16420.82 | 228 | 72.0211 |  |
| 1007 | OK | terminal | 14392.7 | 218 | 66.0216 |  |
| 1008 | OK | terminal | 76735.12 | 166 | 462.2598 |  |
| 1009 | OK | terminal | 56639.43 | 303 | 186.9288 |  |
| 1010 | OK | terminal | 28671.05 | 319 | 89.8779 |  |
| 1011 | OK | terminal | 80134.16 | 212 | 377.9913 |  |
| 1012 | OK | terminal | 57154.17 | 213 | 268.3294 |  |
| 1013 | OK | terminal | 65270.85 | 252 | 259.0113 |  |
| 1014 | OK | terminal | 25176.07 | 213 | 118.1975 |  |

## Per-Microturn-Class Rollup

| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | Token index builds | Static rebuilds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| train:chooseNStep:add | 62 | 277604.67 | 4477.4947 | 11803.3952 | 12592.4469 | 18.5 | 55707 | 26647 | 441 | 55707 | 0 | 33203 | 55707 |
| train:chooseNStep:confirm | 94 | 185963.45 | 1978.3346 | 11537.6058 | 12164.0062 | 7.0638 | 33651 | 15975 | 867 | 33651 | 0 | 6242 | 33651 |
| coupArvnRedeployPolice:chooseOne | 145 | 95324.3 | 657.4089 | 2182.401 | 2898.5515 | 30.7241 | 3053 | 93582 | 98 | 3053 | 0 | 0 | 3053 |
| govern:chooseNStep:add | 115 | 46412.98 | 403.5911 | 698.7558 | 6481.5012 | 6.687 | 5599 | 3600 | 26 | 5599 | 0 | 44042 | 5599 |
| coupArvnRedeployOptionalTroops:chooseOne | 204 | 39468.87 | 193.4748 | 344.9022 | 445.6747 | 8.4118 | 1464 | 11928 | 174 | 1464 | 0 | 0 | 1464 |
| govern:chooseNStep:confirm | 102 | 30107.52 | 295.1718 | 415.6811 | 10898.2826 | 6.8824 | 881 | 2336 | 178 | 881 | 0 | 61105 | 881 |
| event | 245 | 29715.63 | 121.2883 | 115.3663 | 7729.2633 | 18.9224 | 245 | 0 | 0 | 245 | 234 | 138761 | 275 |
| govern | 104 | 6748.96 | 64.8938 | 110.0562 | 833.23 | 10.7115 | 104 | 0 | 0 | 104 | 40 | 6299 | 104 |
| transport:chooseOne | 16 | 6275.16 | 392.1974 | 1055.4234 | 1055.4234 | 17.6875 | 38 | 1191 | 8 | 38 | 0 | 18203 | 38 |
| govern:chooseOne | 117 | 5363.6 | 45.8428 | 67.4686 | 1521.6765 | 2 | 104 | 143 | 39 | 104 | 0 | 12264 | 104 |
| assault:chooseNStep:add | 26 | 4988.48 | 191.8647 | 97.0014 | 4890.2113 | 3.1538 | 4 | 18 | 0 | 4 | 0 | 19504 | 4 |
| rally | 170 | 4433.99 | 26.0823 | 54.172 | 149.4931 | 15.8882 | 170 | 0 | 0 | 170 | 101 | 7531 | 170 |
| coupArvnRedeployMandatory:chooseOne | 12 | 3196.76 | 266.3965 | 399.4902 | 399.4902 | 8 | 180 | 1428 | 24 | 180 | 0 | 0 | 180 |
| train:chooseOne | 58 | 3008.09 | 51.8636 | 88.834 | 217.5741 | 2.2759 | 114 | 166 | 84 | 114 | 0 | 4461 | 114 |
| coupArvnRedeployOptionalTroops | 87 | 2338.47 | 26.879 | 33.0754 | 35.2915 | 17.2874 | 87 | 0 | 0 | 87 | 0 | 0 | 87 |
| coupArvnRedeployPolice | 84 | 2050.46 | 24.4103 | 28.9984 | 31.5964 | 11.7262 | 84 | 0 | 0 | 84 | 0 | 0 | 84 |
| event-decision:chooseNStep:add | 93 | 1879.07 | 20.2051 | 85.3828 | 742.5343 | 12.129 | 338 | 112 | 22 | 338 | 0 | 5629 | 338 |
| assault:chooseOne | 10 | 1323.68 | 132.368 | 1190.8309 | 1190.8309 | 2 | 2 | 4 | 2 | 2 | 0 | 4936 | 2 |
| train | 33 | 909.18 | 27.5509 | 42.1382 | 64.89 | 7.8485 | 33 | 0 | 0 | 33 | 92 | 11 | 33 |
| coupRedeployPass | 80 | 716.55 | 8.9569 | 25.2863 | 28.6943 | 2.975 | 80 | 0 | 0 | 80 | 15 | 0 | 80 |
| coupPacifyUS | 76 | 574.94 | 7.565 | 11.5053 | 69.7235 | 2.7763 | 76 | 0 | 0 | 76 | 0 | 0 | 76 |
| transport | 8 | 545.17 | 68.1464 | 123.5633 | 123.5633 | 11.25 | 8 | 0 | 0 | 8 | 0 | 606 | 8 |
| advise | 38 | 402.99 | 10.6049 | 15.7412 | 30.3783 | 11.4474 | 38 | 0 | 0 | 38 | 8 | 32 | 38 |
| coupAgitateVC | 60 | 396.21 | 6.6036 | 10.3471 | 12.1102 | 2.95 | 60 | 0 | 0 | 60 | 12 | 0 | 60 |
| infiltrate | 33 | 374.63 | 11.3523 | 17.7199 | 18.3355 | 41.5152 | 33 | 0 | 0 | 33 | 15 | 0 | 33 |
| coupCommitmentPass | 80 | 365.18 | 4.5648 | 7.3636 | 8.2327 | 1.15 | 80 | 0 | 0 | 80 | 0 | 0 | 80 |
| coupPacifyARVN | 31 | 333.79 | 10.7675 | 18.139 | 19.1328 | 3.9355 | 31 | 0 | 0 | 31 | 10 | 0 | 31 |
| march | 40 | 299.98 | 7.4994 | 12.215 | 12.5973 | 9.125 | 40 | 0 | 0 | 40 | 66 | 0 | 40 |
| assault | 28 | 237.05 | 8.4662 | 11.1872 | 12.1199 | 4.8571 | 28 | 0 | 0 | 28 | 3 | 0 | 28 |
| chooseOne:chooseOne | 28 | 220.32 | 7.8687 | 101.2068 | 114.8609 | 5.6786 | 2 | 7 | 0 | 2 | 0 | 153 | 2 |
| coupPacifyPass | 40 | 204.98 | 5.1244 | 7.9206 | 13.9258 | 1.125 | 40 | 0 | 0 | 40 | 0 | 0 | 40 |
| attack | 14 | 168.44 | 12.0312 | 25.0089 | 25.0089 | 34.9286 | 14 | 0 | 0 | 14 | 0 | 8 | 14 |
| ambushVc | 11 | 167.96 | 15.2693 | 30.9483 | 30.9483 | 8.1818 | 11 | 0 | 0 | 11 | 0 | 40 | 11 |
| coupNvaRedeployTroops | 16 | 144.4 | 9.0249 | 29.7456 | 29.7456 | 3.875 | 16 | 0 | 0 | 16 | 0 | 0 | 16 |
| coupResourcesResolve | 20 | 110.64 | 5.5322 | 7.7973 | 12.5522 | 1 | 20 | 0 | 0 | 20 | 0 | 0 | 20 |
| coupVictoryCheck | 20 | 92.08 | 4.6038 | 7.7998 | 12.6432 | 1 | 20 | 0 | 0 | 20 | 4 | 0 | 20 |
| coupAgitatePass | 20 | 85.4 | 4.2702 | 6.1334 | 8.5596 | 1.25 | 20 | 0 | 0 | 20 | 0 | 0 | 20 |
| coupArvnRedeployMandatory | 2 | 64.72 | 32.3583 | 34.7993 | 34.7993 | 11.5 | 2 | 0 | 0 | 2 | 0 | 0 | 2 |
| coupCommitmentResolve | 8 | 48.35 | 6.0441 | 7.9431 | 7.9431 | 2 | 8 | 0 | 0 | 8 | 0 | 0 | 8 |
| ambushNva | 5 | 31.84 | 6.3682 | 10.0752 | 10.0752 | 15.2 | 5 | 0 | 0 | 5 | 0 | 0 | 5 |
| event-decision:chooseOne | 36 | 30.76 | 0.8544 | 0.5801 | 28.5367 | 3.9444 | 0 | 1 | 1 | 0 | 0 | 22 | 0 |
| rally:chooseNStep:add | 173 | 12.56 | 0.0726 | 0.1128 | 0.7446 | 20.422 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| pass | 2 | 10.68 | 5.3377 | 5.8688 | 5.8688 | 2.5 | 2 | 0 | 0 | 2 | 0 | 0 | 2 |
| resolveHonoluluPacify | 3 | 9.5 | 3.1653 | 5.1205 | 5.1205 | 1 | 3 | 0 | 0 | 3 | 0 | 0 | 3 |
| rally:chooseNStep:confirm | 218 | 7.85 | 0.036 | 0.0613 | 0.1329 | 14.8165 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseOne | 176 | 6.22 | 0.0353 | 0.0861 | 0.1774 | 1.3523 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:add | 38 | 3.78 | 0.0994 | 0.6626 | 0.6957 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:confirm | 90 | 3.75 | 0.0417 | 0.0735 | 0.1181 | 5.0778 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:add | 57 | 3.4 | 0.0596 | 0.1019 | 0.1065 | 11.4912 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseOne | 76 | 3.32 | 0.0436 | 0.0907 | 0.1372 | 2.4474 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseNStep:confirm | 83 | 2.86 | 0.0345 | 0.0568 | 0.1652 | 6.253 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:add | 33 | 2.01 | 0.0609 | 0.051 | 0.5947 | 3.6061 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseOne | 56 | 1.97 | 0.0352 | 0.0613 | 0.1405 | 1.625 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupNvaRedeployTroops:chooseOne | 42 | 1.81 | 0.043 | 0.0703 | 0.0814 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:confirm | 38 | 1.78 | 0.047 | 0.0823 | 0.0955 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:confirm | 47 | 1.54 | 0.0328 | 0.0525 | 0.1053 | 4.4255 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:confirm | 50 | 1.53 | 0.0306 | 0.0523 | 0.1389 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupCommitmentResolve:chooseNStep:confirm | 32 | 0.89 | 0.028 | 0.0456 | 0.0496 | 9.25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:add | 12 | 0.49 | 0.0406 | 0.0529 | 0.0529 | 3.5833 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| chooseNStep:chooseNStep:confirm | 10 | 0.46 | 0.0461 | 0.0719 | 0.0719 | 22.5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:confirm | 12 | 0.33 | 0.0279 | 0.0325 | 0.0325 | 4.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseOne | 11 | 0.24 | 0.022 | 0.0309 | 0.0309 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseOne | 5 | 0.14 | 0.0274 | 0.0335 | 0.0335 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseNStep:add | 3 | 0.13 | 0.0448 | 0.0511 | 0.0511 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseNStep:confirm | 3 | 0.09 | 0.0315 | 0.0329 | 0.0329 | 3.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Top Hot Axes In Slow-Tier Seeds

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.

| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms |
|---:|---|---|---:|---:|---:|---:|---:|
| 1 | train:chooseNStep:add | continuedDeepening | 33 | 177493.48 | 5378.5904 | 12545.6464 | 12592.4469 |
| 2 | train:chooseNStep:confirm | continuedDeepening | 35 | 140314.59 | 4008.9884 | 11882.3888 | 12164.0062 |
| 3 | coupArvnRedeployPolice:chooseOne | continuedDeepening | 52 | 46053.84 | 885.6508 | 2666.0498 | 2898.5515 |
| 4 | govern:chooseNStep:add | continuedDeepening | 35 | 19239.93 | 549.7122 | 836.4194 | 6481.5012 |
| 5 | govern:chooseNStep:confirm | continuedDeepening | 25 | 15860.5 | 634.4198 | 386.7389 | 10898.2826 |
| 6 | coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | 72 | 14482.22 | 201.1419 | 356.9162 | 419.0658 |
| 7 | event | singlePass | 95 | 10563.66 | 111.1964 | 170.5396 | 4800.9216 |
| 8 | transport:chooseOne | continuedDeepening | 10 | 3279.91 | 327.9912 | 1055.4234 | 1055.4234 |
| 9 | coupArvnRedeployMandatory:chooseOne | continuedDeepening | 12 | 3196.76 | 266.3965 | 399.4902 | 399.4902 |
| 10 | govern:chooseOne | continuedDeepening | 37 | 2709.93 | 73.2413 | 62.5126 | 1521.6765 |

## Fast-Tier vs Slow-Tier Delta

Fast tier: `1000`, `1006`, `1007`, `1010`, `1014`. Rows with ratio greater than `3.0` satisfy the Phase 0 hot-axis criterion.

| Microturn class | Slow decisions | Fast decisions | Slow mean ms | Fast mean ms | Slow:fast ratio | Verdict |
|---|---:|---:|---:|---:|---:|---|
| train:chooseNStep:confirm | 49 | 6 | 2863.6001 | 0.0941 | 30431.457 | hot axis |
| train:chooseNStep:add | 33 | 6 | 5378.5904 | 436.5793 | 12.3198 | hot axis |
| govern:chooseNStep:confirm | 30 | 35 | 528.6975 | 226.4801 | 2.3344 |  |
| govern:chooseOne | 37 | 35 | 73.2413 | 33.0907 | 2.2133 |  |
| coupArvnRedeployPolice:chooseOne | 52 | 50 | 885.6508 | 408.5909 | 2.1676 |  |
| train | 17 | 3 | 29.7971 | 13.9119 | 2.1418 |  |
| govern:chooseNStep:add | 35 | 35 | 549.7122 | 338.5893 | 1.6235 |  |
| coupNvaRedeployTroops | 7 | 1 | 7.4502 | 4.8636 | 1.5318 |  |
| coupCommitmentResolve | 2 | 3 | 7.8207 | 5.1812 | 1.5094 |  |
| advise:chooseNStep:add | 8 | 15 | 0.1509 | 0.1003 | 1.5045 |  |
| coupPacifyUS | 25 | 26 | 9.2415 | 6.2904 | 1.4691 |  |
| govern | 32 | 35 | 82.3056 | 56.5361 | 1.4558 |  |
| coupResourcesResolve | 7 | 6 | 6.7676 | 4.7782 | 1.4163 |  |
| coupVictoryCheck | 7 | 6 | 5.1515 | 3.7656 | 1.368 |  |
| advise:chooseNStep:confirm | 8 | 15 | 0.0596 | 0.0437 | 1.3638 |  |
| transport | 5 | 3 | 75.216 | 56.3636 | 1.3345 |  |
| advise | 8 | 15 | 11.4745 | 9.0327 | 1.2703 |  |
| coupPacifyARVN | 8 | 8 | 12.4064 | 9.8529 | 1.2592 |  |
| coupRedeployPass | 28 | 24 | 9.3602 | 7.5825 | 1.2344 |  |
| coupArvnRedeployPolice | 27 | 32 | 25.9426 | 21.2129 | 1.223 |  |
| pass | 1 | 1 | 5.8688 | 4.8066 | 1.221 |  |
| chooseNStep:chooseNStep:confirm | 4 | 3 | 0.0463 | 0.0385 | 1.2026 |  |
| coupArvnRedeployOptionalTroops | 31 | 25 | 28.2365 | 23.5422 | 1.1994 |  |
| advise:chooseOne | 16 | 30 | 0.0534 | 0.0446 | 1.1973 |  |
| coupCommitmentResolve:chooseNStep:confirm | 8 | 12 | 0.0315 | 0.0265 | 1.1887 |  |
| coupCommitmentPass | 28 | 24 | 4.6508 | 3.9202 | 1.1864 |  |
| march:chooseNStep:add | 21 | 22 | 0.0629 | 0.0536 | 1.1735 |  |
| assault | 8 | 9 | 8.5264 | 7.316 | 1.1654 |  |
| attack | 6 | 8 | 13.0348 | 11.2785 | 1.1557 |  |
| coupArvnRedeployOptionalTroops:chooseOne | 72 | 60 | 201.1419 | 175.9755 | 1.143 |  |
| event | 95 | 78 | 111.1964 | 97.7584 | 1.1375 |  |
| march | 15 | 13 | 6.9524 | 6.3249 | 1.0992 |  |
| infiltrate | 10 | 8 | 10.8472 | 10.0937 | 1.0747 |  |
| coupAgitatePass | 7 | 6 | 4.4126 | 4.1513 | 1.0629 |  |
| rally:chooseNStep:confirm | 73 | 73 | 0.0382 | 0.0361 | 1.0582 |  |
| coupAgitateVC | 19 | 25 | 6.4117 | 6.0692 | 1.0564 |  |
| coupPacifyPass | 14 | 12 | 5.2358 | 5.0106 | 1.0449 |  |
| rally:chooseOne | 64 | 57 | 0.036 | 0.0348 | 1.0345 |  |
| ambushVc:chooseNStep:confirm | 5 | 3 | 0.0282 | 0.0278 | 1.0144 |  |
| event-decision:chooseNStep:confirm | 43 | 26 | 0.0344 | 0.0349 | 0.9857 |  |
| ambushVc:chooseOne | 5 | 4 | 0.0217 | 0.0227 | 0.9559 |  |
| train:chooseOne | 29 | 6 | 48.6114 | 53.1407 | 0.9148 |  |
| march:chooseNStep:confirm | 34 | 29 | 0.0415 | 0.0456 | 0.9101 |  |
| rally | 62 | 54 | 22.8617 | 25.3665 | 0.9013 |  |
| infiltrate:chooseOne | 16 | 14 | 0.0342 | 0.039 | 0.8769 |  |
| ambushVc:chooseNStep:add | 5 | 3 | 0.0384 | 0.0457 | 0.8403 |  |
| chooseOne:chooseOne | 11 | 8 | 10.5998 | 12.7017 | 0.8345 |  |
| ambushVc | 5 | 4 | 12.0517 | 14.8236 | 0.813 |  |
| rally:chooseNStep:add | 63 | 56 | 0.067 | 0.0838 | 0.7995 |  |
| assault:chooseNStep:confirm | 16 | 13 | 0.0288 | 0.0369 | 0.7805 |  |
| infiltrate:chooseNStep:confirm | 15 | 12 | 0.0301 | 0.0411 | 0.7324 |  |
| transport:chooseOne | 10 | 6 | 327.9912 | 499.2077 | 0.657 |  |
| coupNvaRedeployTroops:chooseOne | 19 | 2 | 0.0366 | 0.0625 | 0.5856 |  |
| infiltrate:chooseNStep:add | 10 | 8 | 0.044 | 0.1127 | 0.3904 |  |
| event-decision:chooseOne | 13 | 6 | 0.0437 | 0.1581 | 0.2764 |  |
| event-decision:chooseNStep:add | 43 | 29 | 0.0525 | 54.9466 | 0.001 |  |
| assault:chooseNStep:add | 8 | 7 | 0.0567 | 698.6494 | 0.0001 |  |
| assault:chooseOne | 2 | 5 | 0.0316 | 256.084 | 0.0001 |  |

## Notes

- `elapsedMs` is measured around the per-decision `PolicyAgent.chooseDecision` call. It excludes simulator apply/delta work and report rendering.
- Child processes enforce the per-seed timeout. Each child loads the built engine and production FITL GameSpecDoc, using the repo GameDef cache when available.
- The script does not modify engine source or production profile data.
