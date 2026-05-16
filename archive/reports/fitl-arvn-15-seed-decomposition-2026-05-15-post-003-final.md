# FITL ARVN 15-Seed Per-Microturn-Class Decomposition

**Status**: ✅ EXPLOITED — referenced during spec 174 implementation (archived 2026-05-16).

**Date**: 2026-05-15-post-003-final
**Status**: Spec 173 measurement witness.
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 400000 --date 2026-05-15-post-003-final`
**CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-003-final.csv`

## Summary

- Seeds completed: 15/15
- Per-decision rows: 3741
- Hot class with slow:fast ratio >3x: yes
- Per-seed timeout: 400000 ms

## Per-Seed Wall Time

| Seed | Status | Stop Reason | Wall ms | Decisions | ms/decision | Error |
|---:|---|---|---:|---:|---:|---|
| 1000 | OK | terminal | 12741.14 | 159 | 80.133 |  |
| 1001 | OK | terminal | 24858.35 | 194 | 128.1358 |  |
| 1002 | OK | terminal | 31489.6 | 288 | 109.3389 |  |
| 1003 | OK | terminal | 26538.45 | 226 | 117.4268 |  |
| 1004 | OK | terminal | 36420.13 | 338 | 107.7519 |  |
| 1005 | OK | terminal | 104515.38 | 412 | 253.6781 |  |
| 1006 | OK | terminal | 15797.37 | 228 | 69.2867 |  |
| 1007 | OK | terminal | 12560.48 | 218 | 57.6169 |  |
| 1008 | OK | terminal | 38510.9 | 166 | 231.9934 |  |
| 1009 | OK | terminal | 38122.74 | 303 | 125.8176 |  |
| 1010 | OK | terminal | 26571.55 | 319 | 83.2964 |  |
| 1011 | OK | terminal | 41509.35 | 212 | 195.7988 |  |
| 1012 | OK | terminal | 36022.43 | 213 | 169.1194 |  |
| 1013 | OK | terminal | 37289.42 | 252 | 147.9739 |  |
| 1014 | OK | terminal | 24234.22 | 213 | 113.7757 |  |

## Per-Microturn-Class Rollup

| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | Token index builds | Static rebuilds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| train:chooseNStep:add | 62 | 132392.87 | 2135.3689 | 5109.2084 | 5459.8052 | 18.5 | 0 | 26647 | 56148 | 0 | 0 | 0 | 0 |
| coupArvnRedeployPolice:chooseOne | 145 | 90277.95 | 622.6066 | 1982.3934 | 2619.9975 | 30.7241 | 0 | 93582 | 3151 | 0 | 0 | 0 | 0 |
| train:chooseNStep:confirm | 94 | 79718.13 | 848.0653 | 4904.7742 | 5207.3176 | 7.0638 | 0 | 15975 | 34518 | 0 | 0 | 0 | 0 |
| coupArvnRedeployOptionalTroops:chooseOne | 204 | 36049.77 | 176.7146 | 287.1454 | 347.5672 | 8.4118 | 0 | 11928 | 1638 | 0 | 0 | 0 | 0 |
| govern:chooseNStep:add | 115 | 31548.87 | 274.338 | 441.1267 | 5113.6092 | 6.687 | 0 | 3600 | 5625 | 0 | 0 | 0 | 0 |
| event | 245 | 25130.83 | 102.5748 | 101.9231 | 5793.8528 | 18.9224 | 245 | 0 | 0 | 245 | 234 | 38 | 275 |
| govern:chooseNStep:confirm | 102 | 24373.67 | 238.9575 | 376.5384 | 8403.2517 | 6.8824 | 0 | 2336 | 1059 | 0 | 0 | 0 | 0 |
| govern | 104 | 6013.22 | 57.8194 | 86.8608 | 634.6093 | 10.7115 | 97 | 0 | 7 | 97 | 40 | 0 | 97 |
| transport:chooseOne | 16 | 5500.79 | 343.7994 | 777.9284 | 777.9284 | 17.6875 | 0 | 1191 | 46 | 0 | 0 | 0 | 0 |
| govern:chooseOne | 117 | 4438.98 | 37.94 | 56.6288 | 1147.5883 | 2 | 0 | 143 | 143 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:add | 26 | 4364.26 | 167.8562 | 82.1733 | 4280.883 | 3.1538 | 0 | 18 | 4 | 0 | 0 | 0 | 0 |
| rally | 170 | 3944.51 | 23.203 | 50.4567 | 147.5486 | 15.8882 | 148 | 0 | 22 | 148 | 101 | 0 | 148 |
| coupArvnRedeployMandatory:chooseOne | 12 | 2733.68 | 227.8069 | 331.5352 | 331.5352 | 8 | 0 | 1428 | 204 | 0 | 0 | 0 | 0 |
| train:chooseOne | 58 | 2277.3 | 39.2637 | 74.5967 | 199.6241 | 2.2759 | 0 | 166 | 198 | 0 | 0 | 0 | 0 |
| coupArvnRedeployOptionalTroops | 87 | 2098.81 | 24.1242 | 28.3462 | 29.2211 | 17.2874 | 70 | 0 | 17 | 70 | 0 | 0 | 70 |
| coupArvnRedeployPolice | 84 | 1882.56 | 22.4115 | 25.5076 | 26.8828 | 11.7262 | 82 | 0 | 2 | 82 | 0 | 0 | 82 |
| event-decision:chooseNStep:add | 93 | 1355.86 | 14.5792 | 91.453 | 476.6134 | 12.129 | 0 | 112 | 360 | 0 | 0 | 0 | 0 |
| assault:chooseOne | 10 | 1188.34 | 118.8341 | 1065.2512 | 1065.2512 | 2 | 0 | 4 | 4 | 0 | 0 | 0 | 0 |
| train | 33 | 825.13 | 25.0039 | 41.5643 | 66.7776 | 7.8485 | 32 | 0 | 1 | 32 | 92 | 0 | 32 |
| coupRedeployPass | 80 | 602.91 | 7.5363 | 22.7458 | 24.6622 | 2.975 | 31 | 0 | 49 | 31 | 15 | 0 | 31 |
| transport | 8 | 505.29 | 63.1609 | 99.7442 | 99.7442 | 11.25 | 8 | 0 | 0 | 8 | 0 | 0 | 8 |
| coupPacifyUS | 76 | 483.09 | 6.3565 | 9.3577 | 13.9733 | 2.7763 | 76 | 0 | 0 | 76 | 0 | 0 | 76 |
| advise | 38 | 373.3 | 9.8236 | 15.1992 | 32.5593 | 11.4474 | 28 | 0 | 10 | 28 | 8 | 0 | 28 |
| coupAgitateVC | 60 | 356.19 | 5.9365 | 7.7306 | 10.5165 | 2.95 | 42 | 0 | 18 | 42 | 12 | 0 | 42 |
| infiltrate | 33 | 322.02 | 9.7582 | 17.2169 | 17.2272 | 41.5152 | 26 | 0 | 7 | 26 | 15 | 0 | 26 |
| coupPacifyARVN | 31 | 295.59 | 9.5352 | 14.4706 | 14.9278 | 3.9355 | 15 | 0 | 16 | 15 | 10 | 0 | 15 |
| coupCommitmentPass | 80 | 281.81 | 3.5226 | 5.1879 | 5.8843 | 1.15 | 8 | 0 | 72 | 8 | 0 | 0 | 8 |
| march | 40 | 270.43 | 6.7608 | 11.6224 | 11.8511 | 9.125 | 30 | 0 | 10 | 30 | 66 | 0 | 30 |
| assault | 28 | 212.07 | 7.5738 | 10.4239 | 10.5657 | 4.8571 | 27 | 0 | 1 | 27 | 3 | 0 | 27 |
| chooseOne:chooseOne | 28 | 207.06 | 7.395 | 99.9579 | 102.8804 | 5.6786 | 0 | 7 | 2 | 0 | 0 | 0 | 0 |
| coupPacifyPass | 40 | 183.24 | 4.581 | 6.267 | 12.2856 | 1.125 | 36 | 0 | 4 | 36 | 0 | 0 | 36 |
| attack | 14 | 157.4 | 11.2426 | 27.8102 | 27.8102 | 34.9286 | 12 | 0 | 2 | 12 | 0 | 0 | 12 |
| ambushVc | 11 | 145.46 | 13.2239 | 26.5843 | 26.5843 | 8.1818 | 10 | 0 | 1 | 10 | 0 | 0 | 10 |
| coupNvaRedeployTroops | 16 | 97.8 | 6.1124 | 8.3316 | 8.3316 | 3.875 | 10 | 0 | 6 | 10 | 0 | 0 | 10 |
| coupResourcesResolve | 20 | 83.22 | 4.1611 | 5.3748 | 5.7718 | 1 | 4 | 0 | 16 | 4 | 0 | 0 | 4 |
| coupAgitatePass | 20 | 78.13 | 3.9067 | 4.955 | 5.3663 | 1.25 | 18 | 0 | 2 | 18 | 0 | 0 | 18 |
| coupVictoryCheck | 20 | 76.48 | 3.8242 | 4.7523 | 5.958 | 1 | 20 | 0 | 0 | 20 | 4 | 0 | 20 |
| coupArvnRedeployMandatory | 2 | 49.86 | 24.9297 | 25.2313 | 25.2313 | 11.5 | 1 | 0 | 1 | 1 | 0 | 0 | 1 |
| coupCommitmentResolve | 8 | 36.91 | 4.6133 | 6.623 | 6.623 | 2 | 0 | 0 | 8 | 0 | 0 | 0 | 0 |
| ambushNva | 5 | 31.31 | 6.2617 | 10.3433 | 10.3433 | 15.2 | 5 | 0 | 0 | 5 | 0 | 0 | 5 |
| event-decision:chooseOne | 36 | 29.66 | 0.8239 | 0.6155 | 27.3448 | 3.9444 | 0 | 1 | 1 | 0 | 0 | 0 | 0 |
| rally:chooseNStep:add | 173 | 12.41 | 0.0717 | 0.1045 | 0.7748 | 20.422 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseNStep:confirm | 218 | 7.72 | 0.0354 | 0.0621 | 0.1425 | 14.8165 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| resolveHonoluluPacify | 3 | 6.66 | 2.2185 | 2.3437 | 2.3437 | 1 | 3 | 0 | 0 | 3 | 0 | 0 | 3 |
| pass | 2 | 6.24 | 3.1182 | 3.49 | 3.49 | 2.5 | 2 | 0 | 0 | 2 | 0 | 0 | 2 |
| rally:chooseOne | 176 | 6.14 | 0.0349 | 0.0787 | 0.1362 | 1.3523 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:add | 38 | 3.96 | 0.1041 | 0.6771 | 0.8001 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:confirm | 90 | 3.44 | 0.0382 | 0.0608 | 0.1042 | 5.0778 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseOne | 76 | 3.33 | 0.0438 | 0.0997 | 0.1409 | 2.4474 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:add | 57 | 3.28 | 0.0576 | 0.0869 | 0.1014 | 11.4912 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseNStep:confirm | 83 | 2.69 | 0.0325 | 0.0562 | 0.1469 | 6.253 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:add | 33 | 2.04 | 0.062 | 0.0576 | 0.6299 | 3.6061 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseOne | 56 | 1.86 | 0.0333 | 0.0528 | 0.1618 | 1.625 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:confirm | 38 | 1.82 | 0.0479 | 0.0889 | 0.1031 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupNvaRedeployTroops:chooseOne | 42 | 1.68 | 0.0399 | 0.0557 | 0.0837 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:confirm | 47 | 1.64 | 0.0348 | 0.0534 | 0.1288 | 4.4255 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:confirm | 50 | 1.58 | 0.0315 | 0.063 | 0.1316 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupCommitmentResolve:chooseNStep:confirm | 32 | 0.99 | 0.0308 | 0.0558 | 0.0851 | 9.25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:add | 12 | 0.5 | 0.0418 | 0.0625 | 0.0625 | 3.5833 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| chooseNStep:chooseNStep:confirm | 10 | 0.4 | 0.0403 | 0.052 | 0.052 | 22.5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:confirm | 12 | 0.38 | 0.0316 | 0.0408 | 0.0408 | 4.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseOne | 11 | 0.27 | 0.0245 | 0.0354 | 0.0354 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseOne | 5 | 0.19 | 0.0389 | 0.0677 | 0.0677 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseNStep:add | 3 | 0.14 | 0.047 | 0.0569 | 0.0569 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseNStep:confirm | 3 | 0.09 | 0.0291 | 0.034 | 0.034 | 3.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Top Hot Axes In Slow-Tier Seeds

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.

| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms |
|---:|---|---|---:|---:|---:|---:|---:|
| 1 | train:chooseNStep:add | continuedDeepening | 33 | 80484.94 | 2438.9376 | 5250.7561 | 5459.8052 |
| 2 | train:chooseNStep:confirm | continuedDeepening | 35 | 59446.74 | 1698.4784 | 5119.6386 | 5207.3176 |
| 3 | coupArvnRedeployPolice:chooseOne | continuedDeepening | 52 | 42338.06 | 814.1934 | 2438.2981 | 2619.9975 |
| 4 | govern:chooseNStep:add | continuedDeepening | 35 | 12887.13 | 368.2038 | 511.9242 | 5113.6092 |
| 5 | coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | 72 | 12741.94 | 176.9714 | 315.6939 | 347.5672 |
| 6 | govern:chooseNStep:confirm | continuedDeepening | 25 | 12140.9 | 485.636 | 315.8068 | 8403.2517 |
| 7 | event | singlePass | 95 | 8435.17 | 88.7913 | 168.9705 | 3405.4598 |
| 8 | coupArvnRedeployMandatory:chooseOne | continuedDeepening | 12 | 2733.68 | 227.8069 | 331.5352 | 331.5352 |
| 9 | transport:chooseOne | continuedDeepening | 10 | 2623.62 | 262.3618 | 777.9284 | 777.9284 |
| 10 | govern | singlePass | 32 | 2186.17 | 68.3177 | 100.9624 | 634.6093 |

## Fast-Tier vs Slow-Tier Delta

Fast tier: `1000`, `1006`, `1007`, `1010`, `1014`. Rows with ratio greater than `3.0` satisfy the Phase 0 hot-axis criterion.

| Microturn class | Slow decisions | Fast decisions | Slow mean ms | Fast mean ms | Slow:fast ratio | Verdict |
|---|---:|---:|---:|---:|---:|---|
| train:chooseNStep:confirm | 49 | 6 | 1213.2324 | 0.0857 | 14156.7375 | hot axis |
| train:chooseNStep:add | 33 | 6 | 2438.9376 | 363.5864 | 6.708 | hot axis |
| train | 17 | 3 | 26.3214 | 13.1579 | 2.0004 |  |
| govern:chooseNStep:confirm | 30 | 35 | 404.7117 | 207.986 | 1.9459 |  |
| coupArvnRedeployPolice:chooseOne | 52 | 50 | 814.1934 | 432.2939 | 1.8834 |  |
| govern:chooseOne | 37 | 35 | 55.9674 | 32.3787 | 1.7285 |  |
| coupNvaRedeployTroops | 7 | 1 | 6.4844 | 3.8926 | 1.6658 |  |
| advise:chooseNStep:add | 8 | 15 | 0.1614 | 0.1028 | 1.57 |  |
| govern:chooseNStep:add | 35 | 35 | 368.2038 | 254.783 | 1.4452 |  |
| advise:chooseOne | 16 | 30 | 0.0522 | 0.0407 | 1.2826 |  |
| pass | 1 | 1 | 3.49 | 2.7464 | 1.2708 |  |
| coupResourcesResolve | 7 | 6 | 4.7579 | 3.8306 | 1.2421 |  |
| govern | 32 | 35 | 68.3177 | 56.0619 | 1.2186 |  |
| transport | 5 | 3 | 67.299 | 56.2642 | 1.1961 |  |
| advise | 8 | 15 | 10.3283 | 8.6347 | 1.1961 |  |
| coupCommitmentResolve | 2 | 3 | 5.3911 | 4.5096 | 1.1955 |  |
| advise:chooseNStep:confirm | 8 | 15 | 0.0502 | 0.0428 | 1.1729 |  |
| assault | 8 | 9 | 8.1145 | 6.9605 | 1.1658 |  |
| coupRedeployPass | 28 | 24 | 7.9041 | 6.8856 | 1.1479 |  |
| coupPacifyARVN | 8 | 8 | 10.6209 | 9.493 | 1.1188 |  |
| chooseNStep:chooseNStep:confirm | 4 | 3 | 0.041 | 0.037 | 1.1081 |  |
| coupVictoryCheck | 7 | 6 | 4.1019 | 3.773 | 1.0872 |  |
| march:chooseNStep:add | 21 | 22 | 0.0595 | 0.0556 | 1.0701 |  |
| coupCommitmentPass | 28 | 24 | 3.6203 | 3.4718 | 1.0428 |  |
| march | 15 | 13 | 6.4972 | 6.2486 | 1.0398 |  |
| rally:chooseNStep:confirm | 73 | 73 | 0.0369 | 0.0358 | 1.0307 |  |
| coupArvnRedeployOptionalTroops | 31 | 25 | 23.9805 | 23.4749 | 1.0215 |  |
| coupArvnRedeployPolice | 27 | 32 | 22.423 | 21.9584 | 1.0212 |  |
| coupArvnRedeployOptionalTroops:chooseOne | 72 | 60 | 176.9714 | 176.8325 | 1.0008 |  |
| coupAgitatePass | 7 | 6 | 3.9984 | 3.9962 | 1.0006 |  |
| ambushVc:chooseNStep:confirm | 5 | 3 | 0.0316 | 0.0324 | 0.9753 |  |
| coupCommitmentResolve:chooseNStep:confirm | 8 | 12 | 0.0318 | 0.0329 | 0.9666 |  |
| coupPacifyUS | 25 | 26 | 6.287 | 6.5481 | 0.9601 |  |
| attack | 6 | 8 | 10.9615 | 11.4535 | 0.957 |  |
| rally:chooseOne | 64 | 57 | 0.0341 | 0.0362 | 0.942 |  |
| event | 95 | 78 | 88.7913 | 95.3097 | 0.9316 |  |
| ambushVc:chooseOne | 5 | 4 | 0.0237 | 0.0262 | 0.9046 |  |
| coupPacifyPass | 14 | 12 | 4.3204 | 4.828 | 0.8949 |  |
| coupAgitateVC | 19 | 25 | 5.2852 | 6.1669 | 0.857 |  |
| event-decision:chooseNStep:confirm | 43 | 26 | 0.0305 | 0.036 | 0.8472 |  |
| assault:chooseNStep:confirm | 16 | 13 | 0.0316 | 0.0388 | 0.8144 |  |
| infiltrate | 10 | 8 | 8.3108 | 10.2384 | 0.8117 |  |
| rally | 62 | 54 | 19.5673 | 24.4716 | 0.7996 |  |
| ambushVc:chooseNStep:add | 5 | 3 | 0.0393 | 0.0492 | 0.7988 |  |
| rally:chooseNStep:add | 63 | 56 | 0.0655 | 0.0822 | 0.7968 |  |
| infiltrate:chooseOne | 16 | 14 | 0.0321 | 0.0407 | 0.7887 |  |
| march:chooseNStep:confirm | 34 | 29 | 0.0343 | 0.0451 | 0.7605 |  |
| chooseOne:chooseOne | 11 | 8 | 9.2387 | 12.9119 | 0.7155 |  |
| train:chooseOne | 29 | 6 | 33.6225 | 48.7744 | 0.6893 |  |
| ambushVc | 5 | 4 | 9.6126 | 14.0178 | 0.6857 |  |
| infiltrate:chooseNStep:confirm | 15 | 12 | 0.0304 | 0.0473 | 0.6427 |  |
| coupNvaRedeployTroops:chooseOne | 19 | 2 | 0.0402 | 0.0639 | 0.6291 |  |
| transport:chooseOne | 10 | 6 | 262.3618 | 479.5285 | 0.5471 |  |
| infiltrate:chooseNStep:add | 10 | 8 | 0.042 | 0.1173 | 0.3581 |  |
| event-decision:chooseOne | 13 | 6 | 0.0394 | 0.1528 | 0.2579 |  |
| event-decision:chooseNStep:add | 43 | 29 | 0.0478 | 39.3454 | 0.0012 |  |
| assault:chooseOne | 2 | 5 | 0.0624 | 230.6746 | 0.0003 |  |
| assault:chooseNStep:add | 8 | 7 | 0.0531 | 611.601 | 0.0001 |  |

## Notes

- `elapsedMs` is measured around the per-decision `PolicyAgent.chooseDecision` call. It excludes simulator apply/delta work and report rendering.
- Child processes enforce the per-seed timeout. Each child loads the built engine and production FITL GameSpecDoc, using the repo GameDef cache when available.
- The script does not modify engine source or production profile data.
