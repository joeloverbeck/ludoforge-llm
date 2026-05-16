# FITL ARVN 15-Seed Per-Microturn-Class Decomposition

**Status**: ✅ EXPLOITED — referenced during spec 174 implementation (archived 2026-05-16).

**Date**: 2026-05-15-post-004-final
**Status**: Spec 173 measurement witness.
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 400000 --date 2026-05-15-post-004-final`
**CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-004-final.csv`

## Summary

- Seeds completed: 15/15
- Per-decision rows: 3741
- Hot class with slow:fast ratio >3x: yes
- Per-seed timeout: 400000 ms

## Per-Seed Wall Time

| Seed | Status | Stop Reason | Wall ms | Decisions | ms/decision | Error |
|---:|---|---|---:|---:|---:|---|
| 1000 | OK | terminal | 12161.94 | 159 | 76.4902 |  |
| 1001 | OK | terminal | 19948.4 | 194 | 102.8268 |  |
| 1002 | OK | terminal | 25732.71 | 288 | 89.3497 |  |
| 1003 | OK | terminal | 20423.12 | 226 | 90.3678 |  |
| 1004 | OK | terminal | 30389.51 | 338 | 89.9098 |  |
| 1005 | OK | terminal | 80502.7 | 412 | 195.3949 |  |
| 1006 | OK | terminal | 14600.14 | 228 | 64.0357 |  |
| 1007 | OK | terminal | 11665.02 | 218 | 53.5093 |  |
| 1008 | OK | terminal | 29396.75 | 166 | 177.0889 |  |
| 1009 | OK | terminal | 31792.05 | 303 | 104.9243 |  |
| 1010 | OK | terminal | 25347.03 | 319 | 79.4578 |  |
| 1011 | OK | terminal | 29871.83 | 212 | 140.9049 |  |
| 1012 | OK | terminal | 30394.39 | 213 | 142.6967 |  |
| 1013 | OK | terminal | 27810.26 | 252 | 110.3582 |  |
| 1014 | OK | terminal | 21879.19 | 213 | 102.7192 |  |

## Per-Microturn-Class Rollup

| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | Token index builds | Static rebuilds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| train:chooseNStep:add | 62 | 88116.11 | 1421.2276 | 3184.5233 | 3303.2465 | 18.5 | 0 | 26647 | 56148 | 0 | 0 | 0 | 0 |
| coupArvnRedeployPolice:chooseOne | 145 | 84036.1 | 579.5593 | 1752.3912 | 2529.8617 | 30.7241 | 0 | 93582 | 3151 | 0 | 0 | 0 | 0 |
| train:chooseNStep:confirm | 94 | 51394.95 | 546.7548 | 3109.5457 | 3266.8809 | 7.0638 | 0 | 15975 | 34518 | 0 | 0 | 0 | 0 |
| coupArvnRedeployOptionalTroops:chooseOne | 204 | 34296.12 | 168.1182 | 260.2525 | 334.559 | 8.4118 | 0 | 11928 | 1638 | 0 | 0 | 0 | 0 |
| govern:chooseNStep:add | 115 | 25467.56 | 221.457 | 347.1728 | 4507.8911 | 6.687 | 0 | 3600 | 5625 | 0 | 0 | 0 | 0 |
| event | 245 | 23082.07 | 94.2125 | 102.4489 | 4956.2433 | 18.9224 | 245 | 0 | 0 | 245 | 234 | 38 | 275 |
| govern:chooseNStep:confirm | 102 | 22292.04 | 218.5494 | 347.904 | 7739.7132 | 6.8824 | 0 | 2336 | 1059 | 0 | 0 | 0 | 0 |
| govern | 104 | 5790.57 | 55.6786 | 86.5 | 610.8451 | 10.7115 | 97 | 0 | 7 | 97 | 40 | 0 | 97 |
| transport:chooseOne | 16 | 5517.22 | 344.8264 | 808.5942 | 808.5942 | 17.6875 | 0 | 1191 | 46 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:add | 26 | 4200.64 | 161.563 | 71.8912 | 4127.6558 | 3.1538 | 0 | 18 | 4 | 0 | 0 | 0 | 0 |
| govern:chooseOne | 117 | 4123.06 | 35.2398 | 56.6845 | 1108.69 | 2 | 0 | 143 | 143 | 0 | 0 | 0 | 0 |
| rally | 170 | 3726.61 | 21.9213 | 48.9047 | 152.6731 | 15.8882 | 148 | 0 | 22 | 148 | 101 | 0 | 148 |
| coupArvnRedeployMandatory:chooseOne | 12 | 2358.6 | 196.5499 | 282.9982 | 282.9982 | 8 | 0 | 1428 | 204 | 0 | 0 | 0 | 0 |
| train:chooseOne | 58 | 2108.71 | 36.3572 | 70.0267 | 214.0939 | 2.2759 | 0 | 166 | 198 | 0 | 0 | 0 | 0 |
| coupArvnRedeployOptionalTroops | 87 | 2048.77 | 23.5491 | 28.3796 | 33.0579 | 17.2874 | 70 | 0 | 17 | 70 | 0 | 0 | 70 |
| coupArvnRedeployPolice | 84 | 1805.59 | 21.4951 | 24.3625 | 25.3979 | 11.7262 | 82 | 0 | 2 | 82 | 0 | 0 | 82 |
| assault:chooseOne | 10 | 1107.96 | 110.7956 | 998.9174 | 998.9174 | 2 | 0 | 4 | 4 | 0 | 0 | 0 | 0 |
| event-decision:chooseNStep:add | 93 | 991.43 | 10.6605 | 84.0373 | 306.3952 | 12.129 | 0 | 112 | 360 | 0 | 0 | 0 | 0 |
| train | 33 | 784.56 | 23.7747 | 40.7561 | 61.7047 | 7.8485 | 32 | 0 | 1 | 32 | 92 | 0 | 32 |
| coupRedeployPass | 80 | 535.83 | 6.6979 | 20.8877 | 24.1527 | 2.975 | 31 | 0 | 49 | 31 | 15 | 0 | 31 |
| transport | 8 | 491.43 | 61.4291 | 102.8198 | 102.8198 | 11.25 | 8 | 0 | 0 | 8 | 0 | 0 | 8 |
| coupPacifyUS | 76 | 432.08 | 5.6853 | 9.1948 | 9.9213 | 2.7763 | 76 | 0 | 0 | 76 | 0 | 0 | 76 |
| advise | 38 | 322.25 | 8.4803 | 14.7103 | 29.3779 | 11.4474 | 28 | 0 | 10 | 28 | 8 | 0 | 28 |
| coupAgitateVC | 60 | 293.99 | 4.8998 | 7.1753 | 8.9765 | 2.95 | 42 | 0 | 18 | 42 | 12 | 0 | 42 |
| infiltrate | 33 | 287.54 | 8.7133 | 11.4204 | 17.6939 | 41.5152 | 26 | 0 | 7 | 26 | 15 | 0 | 26 |
| coupPacifyARVN | 31 | 262.55 | 8.4695 | 13.034 | 13.3074 | 3.9355 | 15 | 0 | 16 | 15 | 10 | 0 | 15 |
| march | 40 | 240.11 | 6.0028 | 9.8858 | 11.8263 | 9.125 | 30 | 0 | 10 | 30 | 66 | 0 | 30 |
| coupCommitmentPass | 80 | 225.95 | 2.8243 | 4.1998 | 5.0087 | 1.15 | 8 | 0 | 72 | 8 | 0 | 0 | 8 |
| assault | 28 | 190.88 | 6.8173 | 8.5008 | 8.9538 | 4.8571 | 27 | 0 | 1 | 27 | 3 | 0 | 27 |
| chooseOne:chooseOne | 28 | 186.99 | 6.6782 | 88.8447 | 93.9926 | 5.6786 | 0 | 7 | 2 | 0 | 0 | 0 | 0 |
| coupPacifyPass | 40 | 156.51 | 3.9127 | 5.0842 | 12.5382 | 1.125 | 36 | 0 | 4 | 36 | 0 | 0 | 36 |
| attack | 14 | 143.99 | 10.2852 | 26.6322 | 26.6322 | 34.9286 | 12 | 0 | 2 | 12 | 0 | 0 | 12 |
| ambushVc | 11 | 141.17 | 12.8332 | 26.7843 | 26.7843 | 8.1818 | 10 | 0 | 1 | 10 | 0 | 0 | 10 |
| coupNvaRedeployTroops | 16 | 90.78 | 5.6737 | 7.7235 | 7.7235 | 3.875 | 10 | 0 | 6 | 10 | 0 | 0 | 10 |
| coupVictoryCheck | 20 | 67.48 | 3.3739 | 5.6896 | 5.8507 | 1 | 20 | 0 | 0 | 20 | 4 | 0 | 20 |
| coupAgitatePass | 20 | 67.11 | 3.3556 | 4.401 | 4.546 | 1.25 | 18 | 0 | 2 | 18 | 0 | 0 | 18 |
| coupResourcesResolve | 20 | 64.05 | 3.2025 | 3.817 | 4.4081 | 1 | 4 | 0 | 16 | 4 | 0 | 0 | 4 |
| coupArvnRedeployMandatory | 2 | 49.95 | 24.975 | 25.797 | 25.797 | 11.5 | 1 | 0 | 1 | 1 | 0 | 0 | 1 |
| ambushNva | 5 | 29.82 | 5.9633 | 9.61 | 9.61 | 15.2 | 5 | 0 | 0 | 5 | 0 | 0 | 5 |
| coupCommitmentResolve | 8 | 28.77 | 3.5966 | 3.9351 | 3.9351 | 2 | 0 | 0 | 8 | 0 | 0 | 0 | 0 |
| event-decision:chooseOne | 36 | 27.29 | 0.758 | 0.5622 | 25.3172 | 3.9444 | 0 | 1 | 1 | 0 | 0 | 0 | 0 |
| rally:chooseNStep:add | 173 | 11.84 | 0.0685 | 0.0995 | 0.7285 | 20.422 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseNStep:confirm | 218 | 7.15 | 0.0328 | 0.0629 | 0.1259 | 14.8165 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseOne | 176 | 6.39 | 0.0363 | 0.0809 | 0.662 | 1.3523 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| pass | 2 | 5.33 | 2.6656 | 3.1065 | 3.1065 | 2.5 | 2 | 0 | 0 | 2 | 0 | 0 | 2 |
| resolveHonoluluPacify | 3 | 4.98 | 1.6585 | 1.8627 | 1.8627 | 1 | 3 | 0 | 0 | 3 | 0 | 0 | 3 |
| advise:chooseNStep:add | 38 | 3.7 | 0.0975 | 0.6503 | 0.6969 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:confirm | 38 | 3.45 | 0.0907 | 0.9017 | 1.0327 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:confirm | 90 | 3.25 | 0.0361 | 0.0556 | 0.1171 | 5.0778 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:add | 57 | 3.03 | 0.0532 | 0.092 | 0.1027 | 11.4912 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseOne | 76 | 2.93 | 0.0386 | 0.0703 | 0.1377 | 2.4474 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseNStep:confirm | 83 | 2.7 | 0.0325 | 0.0605 | 0.142 | 6.253 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:add | 33 | 2.19 | 0.0665 | 0.0667 | 0.8616 | 3.6061 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseOne | 56 | 1.72 | 0.0308 | 0.0411 | 0.1724 | 1.625 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupNvaRedeployTroops:chooseOne | 42 | 1.52 | 0.0361 | 0.0488 | 0.0755 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:confirm | 47 | 1.31 | 0.0279 | 0.052 | 0.1034 | 4.4255 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:confirm | 50 | 1.28 | 0.0255 | 0.0363 | 0.1158 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupCommitmentResolve:chooseNStep:confirm | 32 | 0.92 | 0.0288 | 0.0478 | 0.0534 | 9.25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:add | 12 | 0.46 | 0.0384 | 0.0526 | 0.0526 | 3.5833 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| chooseNStep:chooseNStep:confirm | 10 | 0.42 | 0.0418 | 0.0508 | 0.0508 | 22.5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:confirm | 12 | 0.29 | 0.0243 | 0.03 | 0.03 | 4.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseOne | 11 | 0.26 | 0.0236 | 0.042 | 0.042 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseNStep:add | 3 | 0.12 | 0.0409 | 0.047 | 0.047 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseOne | 5 | 0.12 | 0.0248 | 0.0346 | 0.0346 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseNStep:confirm | 3 | 0.08 | 0.0263 | 0.0289 | 0.0289 | 3.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Top Hot Axes In Slow-Tier Seeds

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.

| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms |
|---:|---|---|---:|---:|---:|---:|---:|
| 1 | train:chooseNStep:add | continuedDeepening | 33 | 51470.36 | 1559.7078 | 3260.2773 | 3303.2465 |
| 2 | coupArvnRedeployPolice:chooseOne | continuedDeepening | 52 | 38938.6 | 748.8192 | 2182.4392 | 2529.8617 |
| 3 | train:chooseNStep:confirm | continuedDeepening | 35 | 37975.07 | 1085.0019 | 3256.0501 | 3266.8809 |
| 4 | coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | 72 | 11909.04 | 165.4033 | 270.0317 | 314.8531 |
| 5 | govern:chooseNStep:confirm | continuedDeepening | 25 | 11074.94 | 442.9974 | 285.6467 | 7739.7132 |
| 6 | govern:chooseNStep:add | continuedDeepening | 35 | 10541.55 | 301.1871 | 365.7268 | 4507.8911 |
| 7 | event | singlePass | 95 | 7919.8 | 83.3663 | 163.3119 | 3107.7461 |
| 8 | transport:chooseOne | continuedDeepening | 10 | 2543.42 | 254.3418 | 767.136 | 767.136 |
| 9 | coupArvnRedeployMandatory:chooseOne | continuedDeepening | 12 | 2358.6 | 196.5499 | 282.9982 | 282.9982 |
| 10 | govern | singlePass | 32 | 2098.74 | 65.5856 | 92.9117 | 610.8451 |

## Fast-Tier vs Slow-Tier Delta

Fast tier: `1000`, `1006`, `1007`, `1010`, `1014`. Rows with ratio greater than `3.0` satisfy the Phase 0 hot-axis criterion.

| Microturn class | Slow decisions | Fast decisions | Slow mean ms | Fast mean ms | Slow:fast ratio | Verdict |
|---|---:|---:|---:|---:|---:|---|
| train:chooseNStep:confirm | 49 | 6 | 775.0357 | 0.0888 | 8727.8795 | hot axis |
| train:chooseNStep:add | 33 | 6 | 1559.7078 | 351.0835 | 4.4426 | hot axis |
| train | 17 | 3 | 25.2737 | 12.465 | 2.0276 |  |
| coupNvaRedeployTroops | 7 | 1 | 6.2478 | 3.1918 | 1.9575 |  |
| govern:chooseNStep:confirm | 30 | 35 | 369.1793 | 191.0147 | 1.9327 |  |
| coupArvnRedeployPolice:chooseOne | 52 | 50 | 748.8192 | 408.5609 | 1.8328 |  |
| govern:chooseOne | 37 | 35 | 53.1695 | 30.3234 | 1.7534 |  |
| advise:chooseNStep:add | 8 | 15 | 0.1545 | 0.0948 | 1.6297 |  |
| govern:chooseNStep:add | 35 | 35 | 301.1871 | 206.5485 | 1.4582 |  |
| pass | 1 | 1 | 3.1065 | 2.2247 | 1.3964 |  |
| assault | 8 | 9 | 7.5083 | 5.9409 | 1.2638 |  |
| coupVictoryCheck | 7 | 6 | 3.664 | 2.9324 | 1.2495 |  |
| govern | 32 | 35 | 65.5856 | 54.0632 | 1.2131 |  |
| advise:chooseOne | 16 | 30 | 0.0444 | 0.038 | 1.1684 |  |
| advise | 8 | 15 | 8.6671 | 7.4482 | 1.1637 |  |
| coupPacifyARVN | 8 | 8 | 9.6654 | 8.3762 | 1.1539 |  |
| coupRedeployPass | 28 | 24 | 6.8407 | 6.0447 | 1.1317 |  |
| transport | 5 | 3 | 63.8509 | 57.3926 | 1.1125 |  |
| march:chooseNStep:add | 21 | 22 | 0.0567 | 0.0511 | 1.1096 |  |
| coupCommitmentResolve:chooseNStep:confirm | 8 | 12 | 0.0312 | 0.0289 | 1.0796 |  |
| march | 15 | 13 | 5.7186 | 5.3879 | 1.0614 |  |
| coupArvnRedeployPolice | 27 | 32 | 21.7867 | 20.6233 | 1.0564 |  |
| ambushVc:chooseNStep:confirm | 5 | 3 | 0.0251 | 0.0238 | 1.0546 |  |
| coupCommitmentResolve | 2 | 3 | 3.7685 | 3.5965 | 1.0478 |  |
| coupArvnRedeployOptionalTroops | 31 | 25 | 23.5501 | 22.6337 | 1.0405 |  |
| coupPacifyUS | 25 | 26 | 5.7469 | 5.5563 | 1.0343 |  |
| ambushVc:chooseOne | 5 | 4 | 0.0246 | 0.024 | 1.025 |  |
| rally:chooseNStep:confirm | 73 | 73 | 0.0336 | 0.0339 | 0.9912 |  |
| chooseNStep:chooseNStep:confirm | 4 | 3 | 0.0419 | 0.0424 | 0.9882 |  |
| coupArvnRedeployOptionalTroops:chooseOne | 72 | 60 | 165.4033 | 167.7234 | 0.9862 |  |
| attack | 6 | 8 | 10.1829 | 10.3619 | 0.9827 |  |
| coupCommitmentPass | 28 | 24 | 2.7924 | 2.8732 | 0.9719 |  |
| coupAgitatePass | 7 | 6 | 3.2757 | 3.4371 | 0.953 |  |
| event | 95 | 78 | 83.3663 | 88.6415 | 0.9405 |  |
| coupResourcesResolve | 7 | 6 | 3.1173 | 3.4635 | 0.9 |  |
| infiltrate | 10 | 8 | 7.8623 | 8.7466 | 0.8989 |  |
| ambushVc:chooseNStep:add | 5 | 3 | 0.0378 | 0.0439 | 0.861 |  |
| coupPacifyPass | 14 | 12 | 3.7241 | 4.3367 | 0.8587 |  |
| event-decision:chooseNStep:confirm | 43 | 26 | 0.0305 | 0.0361 | 0.8449 |  |
| coupAgitateVC | 19 | 25 | 4.2132 | 5.0062 | 0.8416 |  |
| infiltrate:chooseOne | 16 | 14 | 0.03 | 0.0372 | 0.8065 |  |
| march:chooseNStep:confirm | 34 | 29 | 0.0333 | 0.0426 | 0.7817 |  |
| assault:chooseNStep:confirm | 16 | 13 | 0.0233 | 0.0301 | 0.7741 |  |
| rally:chooseNStep:add | 63 | 56 | 0.0608 | 0.0791 | 0.7686 |  |
| rally | 62 | 54 | 17.9161 | 23.5702 | 0.7601 |  |
| rally:chooseOne | 64 | 57 | 0.0322 | 0.0452 | 0.7124 |  |
| infiltrate:chooseNStep:confirm | 15 | 12 | 0.0249 | 0.0357 | 0.6975 |  |
| chooseOne:chooseOne | 11 | 8 | 8.2207 | 11.7955 | 0.6969 |  |
| train:chooseOne | 29 | 6 | 30.5817 | 45.4766 | 0.6725 |  |
| ambushVc | 5 | 4 | 8.861 | 13.9602 | 0.6347 |  |
| coupNvaRedeployTroops:chooseOne | 19 | 2 | 0.0343 | 0.0622 | 0.5514 |  |
| transport:chooseOne | 10 | 6 | 254.3418 | 495.6341 | 0.5132 |  |
| advise:chooseNStep:confirm | 8 | 15 | 0.0449 | 0.1001 | 0.4486 |  |
| infiltrate:chooseNStep:add | 10 | 8 | 0.0434 | 0.1395 | 0.3111 |  |
| event-decision:chooseOne | 13 | 6 | 0.0357 | 0.137 | 0.2606 |  |
| event-decision:chooseNStep:add | 43 | 29 | 0.0444 | 27.4677 | 0.0016 |  |
| assault:chooseNStep:add | 8 | 7 | 0.0493 | 589.7019 | 0.0001 |  |
| assault:chooseOne | 2 | 5 | 0.0298 | 215.1471 | 0.0001 |  |

## Notes

- `elapsedMs` is measured around the per-decision `PolicyAgent.chooseDecision` call. It excludes simulator apply/delta work and report rendering.
- Child processes enforce the per-seed timeout. Each child loads the built engine and production FITL GameSpecDoc, using the repo GameDef cache when available.
- The script does not modify engine source or production profile data.
