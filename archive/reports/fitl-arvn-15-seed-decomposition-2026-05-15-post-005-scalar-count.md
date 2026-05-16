# FITL ARVN 15-Seed Per-Microturn-Class Decomposition

**Status**: ✅ EXPLOITED — referenced during spec 174 implementation (archived 2026-05-16).

**Date**: 2026-05-15-post-005-scalar-count
**Status**: Spec 173 measurement witness.
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 400000 --date 2026-05-15-post-005-scalar-count`
**CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-005-scalar-count.csv`

## Summary

- Seeds completed: 15/15
- Per-decision rows: 3741
- Hot class with slow:fast ratio >3x: yes
- Per-seed timeout: 400000 ms
- Hot-path buckets: disabled

## Per-Seed Wall Time

| Seed | Status | Stop Reason | Wall ms | Decisions | ms/decision | Error |
|---:|---|---|---:|---:|---:|---|
| 1000 | OK | terminal | 12663.01 | 159 | 79.6416 |  |
| 1001 | OK | terminal | 20602.3 | 194 | 106.1974 |  |
| 1002 | OK | terminal | 26444.44 | 288 | 91.821 |  |
| 1003 | OK | terminal | 21913.31 | 226 | 96.9615 |  |
| 1004 | OK | terminal | 30718.96 | 338 | 90.8845 |  |
| 1005 | OK | terminal | 84321.08 | 412 | 204.6628 |  |
| 1006 | OK | terminal | 15703.76 | 228 | 68.8761 |  |
| 1007 | OK | terminal | 12434.64 | 218 | 57.0396 |  |
| 1008 | OK | terminal | 31505.03 | 166 | 189.7893 |  |
| 1009 | OK | terminal | 34355.64 | 303 | 113.385 |  |
| 1010 | OK | terminal | 26884.79 | 319 | 84.2783 |  |
| 1011 | OK | terminal | 31825.26 | 212 | 150.1192 |  |
| 1012 | OK | terminal | 32201.94 | 213 | 151.1828 |  |
| 1013 | OK | terminal | 29047.54 | 252 | 115.268 |  |
| 1014 | OK | terminal | 23559.94 | 213 | 110.61 |  |

## Per-Microturn-Class Rollup

| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | Token index builds | Static rebuilds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| train:chooseNStep:add | 62 | 91936.87 | 1482.8528 | 3286.3332 | 3495.9322 | 18.5 | 0 | 26647 | 56148 | 0 | 0 | 0 | 0 |
| coupArvnRedeployPolice:chooseOne | 145 | 87844.39 | 605.8234 | 2016.6496 | 2449.2723 | 30.7241 | 0 | 93582 | 3151 | 0 | 0 | 0 | 0 |
| train:chooseNStep:confirm | 94 | 53530.9 | 569.4777 | 3215.9554 | 3462.4704 | 7.0638 | 0 | 15975 | 34518 | 0 | 0 | 0 | 0 |
| coupArvnRedeployOptionalTroops:chooseOne | 204 | 36077.02 | 176.8481 | 276.0743 | 325.1294 | 8.4118 | 0 | 11928 | 1638 | 0 | 0 | 0 | 0 |
| govern:chooseNStep:add | 115 | 27173.29 | 236.2895 | 346.5873 | 4915.6911 | 6.687 | 0 | 3600 | 5625 | 0 | 0 | 0 | 0 |
| event | 245 | 24690.66 | 100.7782 | 106.1918 | 5291.9222 | 18.9224 | 245 | 0 | 0 | 245 | 234 | 38 | 275 |
| govern:chooseNStep:confirm | 102 | 23802.25 | 233.3554 | 376.6978 | 8338.7296 | 6.8824 | 0 | 2336 | 1059 | 0 | 0 | 0 | 0 |
| govern | 104 | 6097.11 | 58.626 | 93.6367 | 642.961 | 10.7115 | 97 | 0 | 7 | 97 | 40 | 0 | 97 |
| transport:chooseOne | 16 | 5732.37 | 358.2729 | 813.5922 | 813.5922 | 17.6875 | 0 | 1191 | 46 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:add | 26 | 4545.53 | 174.8281 | 80.5192 | 4463.5928 | 3.1538 | 0 | 18 | 4 | 0 | 0 | 0 | 0 |
| govern:chooseOne | 117 | 4472.79 | 38.2289 | 68.7208 | 1185.6681 | 2 | 0 | 143 | 143 | 0 | 0 | 0 | 0 |
| rally | 170 | 4000.58 | 23.5328 | 52.2263 | 160.5213 | 15.8882 | 148 | 0 | 22 | 148 | 101 | 0 | 148 |
| coupArvnRedeployMandatory:chooseOne | 12 | 2901.85 | 241.8207 | 384.5941 | 384.5941 | 8 | 0 | 1428 | 204 | 0 | 0 | 0 | 0 |
| train:chooseOne | 58 | 2181.9 | 37.619 | 74.0882 | 188.6977 | 2.2759 | 0 | 166 | 198 | 0 | 0 | 0 | 0 |
| coupArvnRedeployOptionalTroops | 87 | 2145.87 | 24.6652 | 28.4716 | 38.8279 | 17.2874 | 70 | 0 | 17 | 70 | 0 | 0 | 70 |
| coupArvnRedeployPolice | 84 | 1841.37 | 21.9211 | 25.1849 | 28.5644 | 11.7262 | 82 | 0 | 2 | 82 | 0 | 0 | 82 |
| assault:chooseOne | 10 | 1187.92 | 118.7917 | 1062.7733 | 1062.7733 | 2 | 0 | 4 | 4 | 0 | 0 | 0 | 0 |
| event-decision:chooseNStep:add | 93 | 1043.57 | 11.2212 | 92.022 | 319.0159 | 12.129 | 0 | 112 | 360 | 0 | 0 | 0 | 0 |
| train | 33 | 812.31 | 24.6155 | 40.6381 | 62.8755 | 7.8485 | 32 | 0 | 1 | 32 | 92 | 0 | 32 |
| coupRedeployPass | 80 | 551.11 | 6.8889 | 21.1486 | 25.4956 | 2.975 | 31 | 0 | 49 | 31 | 15 | 0 | 31 |
| transport | 8 | 519.62 | 64.9531 | 104.6445 | 104.6445 | 11.25 | 8 | 0 | 0 | 8 | 0 | 0 | 8 |
| coupPacifyUS | 76 | 449.56 | 5.9153 | 9.7689 | 11.1222 | 2.7763 | 76 | 0 | 0 | 76 | 0 | 0 | 76 |
| advise | 38 | 348.42 | 9.169 | 14.6167 | 30.3591 | 11.4474 | 28 | 0 | 10 | 28 | 8 | 0 | 28 |
| coupAgitateVC | 60 | 313.24 | 5.2207 | 6.9959 | 8.9901 | 2.95 | 42 | 0 | 18 | 42 | 12 | 0 | 42 |
| infiltrate | 33 | 310.78 | 9.4175 | 13.7801 | 19.1589 | 41.5152 | 26 | 0 | 7 | 26 | 15 | 0 | 26 |
| coupPacifyARVN | 31 | 277.73 | 8.959 | 13.8283 | 14.363 | 3.9355 | 15 | 0 | 16 | 15 | 10 | 0 | 15 |
| march | 40 | 247.79 | 6.1948 | 11.3866 | 11.6548 | 9.125 | 30 | 0 | 10 | 30 | 66 | 0 | 30 |
| coupCommitmentPass | 80 | 237.73 | 2.9717 | 4.318 | 4.9983 | 1.15 | 8 | 0 | 72 | 8 | 0 | 0 | 8 |
| assault | 28 | 217.57 | 7.7704 | 10.7347 | 13.9222 | 4.8571 | 27 | 0 | 1 | 27 | 3 | 0 | 27 |
| chooseOne:chooseOne | 28 | 202.81 | 7.2432 | 91.0894 | 107.5074 | 5.6786 | 0 | 7 | 2 | 0 | 0 | 0 | 0 |
| coupPacifyPass | 40 | 162.44 | 4.0609 | 5.9391 | 12.7399 | 1.125 | 36 | 0 | 4 | 36 | 0 | 0 | 36 |
| attack | 14 | 155.1 | 11.0787 | 29.3141 | 29.3141 | 34.9286 | 12 | 0 | 2 | 12 | 0 | 0 | 12 |
| ambushVc | 11 | 147.71 | 13.4278 | 24.7265 | 24.7265 | 8.1818 | 10 | 0 | 1 | 10 | 0 | 0 | 10 |
| coupNvaRedeployTroops | 16 | 89.36 | 5.5849 | 8.0216 | 8.0216 | 3.875 | 10 | 0 | 6 | 10 | 0 | 0 | 10 |
| coupResourcesResolve | 20 | 71.14 | 3.557 | 5.0321 | 5.0651 | 1 | 4 | 0 | 16 | 4 | 0 | 0 | 4 |
| coupVictoryCheck | 20 | 68.75 | 3.4374 | 5.0279 | 5.4604 | 1 | 20 | 0 | 0 | 20 | 4 | 0 | 20 |
| coupAgitatePass | 20 | 67.04 | 3.3518 | 4.1984 | 5.4679 | 1.25 | 18 | 0 | 2 | 18 | 0 | 0 | 18 |
| coupArvnRedeployMandatory | 2 | 57.8 | 28.8979 | 32.1144 | 32.1144 | 11.5 | 1 | 0 | 1 | 1 | 0 | 0 | 1 |
| event-decision:chooseOne | 36 | 33.91 | 0.942 | 0.6417 | 31.5563 | 3.9444 | 0 | 1 | 1 | 0 | 0 | 0 | 0 |
| coupCommitmentResolve | 8 | 33.31 | 4.1631 | 5.229 | 5.229 | 2 | 0 | 0 | 8 | 0 | 0 | 0 | 0 |
| ambushNva | 5 | 32.82 | 6.5636 | 9.846 | 9.846 | 15.2 | 5 | 0 | 0 | 5 | 0 | 0 | 5 |
| rally:chooseNStep:add | 173 | 14.5 | 0.0838 | 0.1232 | 1.3361 | 20.422 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseNStep:confirm | 218 | 7.85 | 0.036 | 0.0704 | 0.1539 | 14.8165 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseOne | 176 | 6.76 | 0.0384 | 0.1069 | 0.1915 | 1.3523 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| resolveHonoluluPacify | 3 | 6.38 | 2.1253 | 2.9825 | 2.9825 | 1 | 3 | 0 | 0 | 3 | 0 | 0 | 3 |
| pass | 2 | 5.57 | 2.787 | 3.1333 | 3.1333 | 2.5 | 2 | 0 | 0 | 2 | 0 | 0 | 2 |
| advise:chooseNStep:add | 38 | 5.2 | 0.1368 | 0.8305 | 1.1576 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:confirm | 90 | 3.64 | 0.0405 | 0.0641 | 0.1248 | 5.0778 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:add | 57 | 3.48 | 0.0611 | 0.1066 | 0.1251 | 11.4912 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseOne | 76 | 3.35 | 0.0441 | 0.0864 | 0.1356 | 2.4474 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseNStep:confirm | 83 | 2.9 | 0.035 | 0.0554 | 0.1677 | 6.253 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:add | 33 | 2.46 | 0.0746 | 0.0608 | 1.0015 | 3.6061 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseOne | 56 | 2.05 | 0.0367 | 0.0569 | 0.1786 | 1.625 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:confirm | 38 | 1.82 | 0.048 | 0.085 | 0.0964 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:confirm | 50 | 1.68 | 0.0335 | 0.0944 | 0.1015 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupNvaRedeployTroops:chooseOne | 42 | 1.62 | 0.0385 | 0.0525 | 0.0854 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:confirm | 47 | 1.55 | 0.033 | 0.0617 | 0.1047 | 4.4255 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupCommitmentResolve:chooseNStep:confirm | 32 | 0.92 | 0.0286 | 0.0435 | 0.0565 | 9.25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:add | 12 | 0.5 | 0.042 | 0.0612 | 0.0612 | 3.5833 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| chooseNStep:chooseNStep:confirm | 10 | 0.42 | 0.0422 | 0.051 | 0.051 | 22.5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:confirm | 12 | 0.31 | 0.0258 | 0.0319 | 0.0319 | 4.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseOne | 11 | 0.25 | 0.0227 | 0.0347 | 0.0347 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseOne | 5 | 0.14 | 0.0277 | 0.0427 | 0.0427 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseNStep:add | 3 | 0.13 | 0.0433 | 0.0472 | 0.0472 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseNStep:confirm | 3 | 0.08 | 0.0258 | 0.0276 | 0.0276 | 3.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Top Hot Axes In Slow-Tier Seeds

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.

| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms |
|---:|---|---|---:|---:|---:|---:|---:|
| 1 | train:chooseNStep:add | continuedDeepening | 33 | 53644 | 1625.5758 | 3325.309 | 3495.9322 |
| 2 | coupArvnRedeployPolice:chooseOne | continuedDeepening | 52 | 41235.54 | 792.9911 | 2233.287 | 2449.2723 |
| 3 | train:chooseNStep:confirm | continuedDeepening | 35 | 39422.41 | 1126.3547 | 3352.7222 | 3462.4704 |
| 4 | coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | 72 | 12669.56 | 175.9661 | 276.0743 | 325.1294 |
| 5 | govern:chooseNStep:confirm | continuedDeepening | 25 | 11908.62 | 476.3448 | 288.4448 | 8338.7296 |
| 6 | govern:chooseNStep:add | continuedDeepening | 35 | 11382.41 | 325.2117 | 389.6491 | 4915.6911 |
| 7 | event | singlePass | 95 | 8637.41 | 90.9201 | 172.1362 | 3448.9444 |
| 8 | coupArvnRedeployMandatory:chooseOne | continuedDeepening | 12 | 2901.85 | 241.8207 | 384.5941 | 384.5941 |
| 9 | transport:chooseOne | continuedDeepening | 10 | 2653.62 | 265.3622 | 785.5757 | 785.5757 |
| 10 | govern | singlePass | 32 | 2211.99 | 69.1246 | 99.9543 | 642.961 |

## Fast-Tier vs Slow-Tier Delta

Fast tier: `1000`, `1006`, `1007`, `1010`, `1014`. Rows with ratio greater than `3.0` satisfy the Phase 0 hot-axis criterion.

| Microturn class | Slow decisions | Fast decisions | Slow mean ms | Fast mean ms | Slow:fast ratio | Verdict |
|---|---:|---:|---:|---:|---:|---|
| train:chooseNStep:confirm | 49 | 6 | 804.5756 | 0.0852 | 9443.3756 | hot axis |
| train:chooseNStep:add | 33 | 6 | 1625.5758 | 354.3129 | 4.588 | hot axis |
| train | 17 | 3 | 26.3235 | 12.6578 | 2.0796 |  |
| govern:chooseNStep:confirm | 30 | 35 | 396.9694 | 205.6758 | 1.9301 |  |
| coupArvnRedeployPolice:chooseOne | 52 | 50 | 792.9911 | 432.9259 | 1.8317 |  |
| govern:chooseOne | 37 | 35 | 57.0982 | 33.1368 | 1.7231 |  |
| advise:chooseNStep:add | 8 | 15 | 0.1719 | 0.1097 | 1.567 |  |
| govern:chooseNStep:add | 35 | 35 | 325.2117 | 221.7692 | 1.4664 |  |
| coupNvaRedeployTroops | 7 | 1 | 6.0975 | 4.3765 | 1.3932 |  |
| pass | 1 | 1 | 3.1333 | 2.4407 | 1.2838 |  |
| advise | 8 | 15 | 9.94 | 8.2509 | 1.2047 |  |
| advise:chooseOne | 16 | 30 | 0.0514 | 0.043 | 1.1953 |  |
| govern | 32 | 35 | 69.1246 | 58.2102 | 1.1875 |  |
| transport | 5 | 3 | 68.2219 | 59.505 | 1.1465 |  |
| coupRedeployPass | 28 | 24 | 7.2096 | 6.312 | 1.1422 |  |
| advise:chooseNStep:confirm | 8 | 15 | 0.0531 | 0.0478 | 1.1109 |  |
| coupPacifyARVN | 8 | 8 | 10.306 | 9.284 | 1.1101 |  |
| assault | 8 | 9 | 8.3027 | 7.6144 | 1.0904 |  |
| march:chooseNStep:add | 21 | 22 | 0.0629 | 0.0605 | 1.0397 |  |
| coupArvnRedeployOptionalTroops | 31 | 25 | 24.5489 | 23.6756 | 1.0369 |  |
| chooseNStep:chooseNStep:confirm | 4 | 3 | 0.0427 | 0.0412 | 1.0364 |  |
| coupVictoryCheck | 7 | 6 | 3.4376 | 3.3347 | 1.0309 |  |
| coupArvnRedeployPolice | 27 | 32 | 22.0788 | 21.5674 | 1.0237 |  |
| march | 15 | 13 | 5.9348 | 5.8717 | 1.0107 |  |
| attack | 6 | 8 | 11.1451 | 11.0289 | 1.0105 |  |
| coupCommitmentPass | 28 | 24 | 3.0446 | 3.0318 | 1.0042 |  |
| coupCommitmentResolve:chooseNStep:confirm | 8 | 12 | 0.0296 | 0.0297 | 0.9966 |  |
| coupArvnRedeployOptionalTroops:chooseOne | 72 | 60 | 175.9661 | 176.9988 | 0.9942 |  |
| coupResourcesResolve | 7 | 6 | 3.4762 | 3.5 | 0.9932 |  |
| coupPacifyUS | 25 | 26 | 5.8339 | 5.885 | 0.9913 |  |
| coupCommitmentResolve | 2 | 3 | 4.4586 | 4.5177 | 0.9869 |  |
| event | 95 | 78 | 90.9201 | 94.242 | 0.9648 |  |
| ambushVc:chooseNStep:confirm | 5 | 3 | 0.026 | 0.0275 | 0.9455 |  |
| rally:chooseNStep:confirm | 73 | 73 | 0.0362 | 0.0386 | 0.9378 |  |
| rally:chooseOne | 64 | 57 | 0.0377 | 0.0406 | 0.9286 |  |
| event-decision:chooseNStep:confirm | 43 | 26 | 0.034 | 0.0368 | 0.9239 |  |
| infiltrate | 10 | 8 | 8.7135 | 9.686 | 0.8996 |  |
| coupAgitatePass | 7 | 6 | 3.1735 | 3.637 | 0.8726 |  |
| ambushVc:chooseOne | 5 | 4 | 0.0217 | 0.0249 | 0.8715 |  |
| ambushVc:chooseNStep:add | 5 | 3 | 0.0424 | 0.0499 | 0.8497 |  |
| coupAgitateVC | 19 | 25 | 4.609 | 5.5267 | 0.834 |  |
| infiltrate:chooseOne | 16 | 14 | 0.0361 | 0.0441 | 0.8186 |  |
| assault:chooseNStep:confirm | 16 | 13 | 0.0332 | 0.0409 | 0.8117 |  |
| coupPacifyPass | 14 | 12 | 3.634 | 4.6348 | 0.7841 |  |
| infiltrate:chooseNStep:confirm | 15 | 12 | 0.0328 | 0.0427 | 0.7681 |  |
| rally | 62 | 54 | 19.4003 | 25.6924 | 0.7551 |  |
| march:chooseNStep:confirm | 34 | 29 | 0.0365 | 0.0504 | 0.7242 |  |
| train:chooseOne | 29 | 6 | 32.7523 | 45.279 | 0.7233 |  |
| rally:chooseNStep:add | 63 | 56 | 0.0662 | 0.0922 | 0.718 |  |
| ambushVc | 5 | 4 | 9.9522 | 15.0683 | 0.6605 |  |
| chooseOne:chooseOne | 11 | 8 | 8.4347 | 13.4912 | 0.6252 |  |
| coupNvaRedeployTroops:chooseOne | 19 | 2 | 0.0375 | 0.0694 | 0.5403 |  |
| transport:chooseOne | 10 | 6 | 265.3622 | 513.1241 | 0.5172 |  |
| infiltrate:chooseNStep:add | 10 | 8 | 0.0459 | 0.1649 | 0.2784 |  |
| event-decision:chooseOne | 13 | 6 | 0.0404 | 0.1656 | 0.244 |  |
| event-decision:chooseNStep:add | 43 | 29 | 0.0489 | 28.876 | 0.0017 |  |
| assault:chooseOne | 2 | 5 | 0.0603 | 230.7512 | 0.0003 |  |
| assault:chooseNStep:add | 8 | 7 | 0.0651 | 637.7058 | 0.0001 |  |

## Notes

- `elapsedMs` is measured around the per-decision `PolicyAgent.chooseDecision` call. It excludes simulator apply/delta work and report rendering.
- Child processes enforce the per-seed timeout. Each child loads the built engine and production FITL GameSpecDoc, using the repo GameDef cache when available.
- The script does not modify engine source or production profile data.
