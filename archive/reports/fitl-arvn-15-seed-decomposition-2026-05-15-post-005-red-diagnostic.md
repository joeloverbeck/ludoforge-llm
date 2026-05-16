# FITL ARVN 15-Seed Per-Microturn-Class Decomposition

**Status**: ✅ EXPLOITED — referenced during spec 174 implementation (archived 2026-05-16).

**Date**: 2026-05-15-post-005-red-diagnostic
**Status**: Red diagnostic witness for a reverted Spec 173 candidate; not a closeout artifact.
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 400000 --date 2026-05-15-post-005`
**CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-005-red-diagnostic.csv`

## Summary

- Seeds completed: 15/15
- Per-decision rows: 3741
- Hot class with slow:fast ratio >3x: yes
- Per-seed timeout: 400000 ms

## Per-Seed Wall Time

| Seed | Status | Stop Reason | Wall ms | Decisions | ms/decision | Error |
|---:|---|---|---:|---:|---:|---|
| 1000 | OK | terminal | 12016.7 | 159 | 75.5767 |  |
| 1001 | OK | terminal | 19873.99 | 194 | 102.4432 |  |
| 1002 | OK | terminal | 26013.94 | 288 | 90.3262 |  |
| 1003 | OK | terminal | 21076.31 | 226 | 93.258 |  |
| 1004 | OK | terminal | 31143.8 | 338 | 92.1414 |  |
| 1005 | OK | terminal | 85744.44 | 412 | 208.1176 |  |
| 1006 | OK | terminal | 15291.25 | 228 | 67.0669 |  |
| 1007 | OK | terminal | 12365.65 | 218 | 56.7232 |  |
| 1008 | OK | terminal | 31886.21 | 166 | 192.0856 |  |
| 1009 | OK | terminal | 33179.75 | 303 | 109.5041 |  |
| 1010 | OK | terminal | 25754.6 | 319 | 80.7354 |  |
| 1011 | OK | terminal | 30358.73 | 212 | 143.2016 |  |
| 1012 | OK | terminal | 30388.11 | 213 | 142.6672 |  |
| 1013 | OK | terminal | 28778.56 | 252 | 114.2006 |  |
| 1014 | OK | terminal | 22291.67 | 213 | 104.6557 |  |

## Per-Microturn-Class Rollup

| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | Token index builds | Static rebuilds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| train:chooseNStep:add | 62 | 91063.31 | 1468.763 | 3235.8207 | 3517.9186 | 18.5 | 0 | 26647 | 56148 | 0 | 0 | 0 | 0 |
| coupArvnRedeployPolice:chooseOne | 145 | 85959.72 | 592.8257 | 1811.02 | 2578.0483 | 30.7241 | 0 | 93582 | 3151 | 0 | 0 | 0 | 0 |
| train:chooseNStep:confirm | 94 | 53620.55 | 570.4314 | 3250.4187 | 3511.4181 | 7.0638 | 0 | 15975 | 34518 | 0 | 0 | 0 | 0 |
| coupArvnRedeployOptionalTroops:chooseOne | 204 | 34375.73 | 168.5085 | 255.0172 | 331.3557 | 8.4118 | 0 | 11928 | 1638 | 0 | 0 | 0 | 0 |
| govern:chooseNStep:add | 115 | 26510.54 | 230.5264 | 356.1679 | 4952.1132 | 6.687 | 0 | 3600 | 5625 | 0 | 0 | 0 | 0 |
| event | 245 | 24182.23 | 98.703 | 112.4605 | 5089.465 | 18.9224 | 245 | 0 | 0 | 245 | 234 | 38 | 275 |
| govern:chooseNStep:confirm | 102 | 23709.49 | 232.446 | 374.7906 | 8576.0426 | 6.8824 | 0 | 2336 | 1059 | 0 | 0 | 0 | 0 |
| govern | 104 | 6111.96 | 58.7689 | 95.7048 | 702.471 | 10.7115 | 97 | 0 | 7 | 97 | 40 | 0 | 97 |
| transport:chooseOne | 16 | 5682.23 | 355.1395 | 852.7061 | 852.7061 | 17.6875 | 0 | 1191 | 46 | 0 | 0 | 0 | 0 |
| govern:chooseOne | 117 | 4328.55 | 36.9962 | 55.1605 | 1233.2299 | 2 | 0 | 143 | 143 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:add | 26 | 4184.03 | 160.9243 | 77.1099 | 4105.6559 | 3.1538 | 0 | 18 | 4 | 0 | 0 | 0 | 0 |
| rally | 170 | 3887.9 | 22.87 | 50.1464 | 151.422 | 15.8882 | 148 | 0 | 22 | 148 | 101 | 0 | 148 |
| coupArvnRedeployMandatory:chooseOne | 12 | 2482.71 | 206.8924 | 322.1494 | 322.1494 | 8 | 0 | 1428 | 204 | 0 | 0 | 0 | 0 |
| train:chooseOne | 58 | 2120.08 | 36.5531 | 72.4351 | 208.9591 | 2.2759 | 0 | 166 | 198 | 0 | 0 | 0 | 0 |
| coupArvnRedeployOptionalTroops | 87 | 2111.85 | 24.2742 | 28.2006 | 31.9472 | 17.2874 | 70 | 0 | 17 | 70 | 0 | 0 | 70 |
| coupArvnRedeployPolice | 84 | 1855.23 | 22.086 | 25.5803 | 26.7506 | 11.7262 | 82 | 0 | 2 | 82 | 0 | 0 | 82 |
| assault:chooseOne | 10 | 1147.73 | 114.7726 | 1036.4037 | 1036.4037 | 2 | 0 | 4 | 4 | 0 | 0 | 0 | 0 |
| event-decision:chooseNStep:add | 93 | 1004.94 | 10.8058 | 87.1389 | 307.8763 | 12.129 | 0 | 112 | 360 | 0 | 0 | 0 | 0 |
| train | 33 | 813.17 | 24.6416 | 41.5061 | 65.7321 | 7.8485 | 32 | 0 | 1 | 32 | 92 | 0 | 32 |
| coupRedeployPass | 80 | 572.6 | 7.1575 | 22.1163 | 28.4512 | 2.975 | 31 | 0 | 49 | 31 | 15 | 0 | 31 |
| transport | 8 | 506.56 | 63.3195 | 104.2113 | 104.2113 | 11.25 | 8 | 0 | 0 | 8 | 0 | 0 | 8 |
| coupPacifyUS | 76 | 447.98 | 5.8945 | 9.1903 | 13.8454 | 2.7763 | 76 | 0 | 0 | 76 | 0 | 0 | 76 |
| advise | 38 | 337.26 | 8.8752 | 16.4185 | 30.1113 | 11.4474 | 28 | 0 | 10 | 28 | 8 | 0 | 28 |
| infiltrate | 33 | 302.77 | 9.175 | 13.4426 | 16.4002 | 41.5152 | 26 | 0 | 7 | 26 | 15 | 0 | 26 |
| coupAgitateVC | 60 | 299.7 | 4.995 | 6.6019 | 8.1 | 2.95 | 42 | 0 | 18 | 42 | 12 | 0 | 42 |
| coupPacifyARVN | 31 | 271.64 | 8.7625 | 13.7694 | 13.9051 | 3.9355 | 15 | 0 | 16 | 15 | 10 | 0 | 15 |
| march | 40 | 241.91 | 6.0478 | 9.6225 | 10.6076 | 9.125 | 30 | 0 | 10 | 30 | 66 | 0 | 30 |
| coupCommitmentPass | 80 | 236.18 | 2.9523 | 4.5818 | 4.9248 | 1.15 | 8 | 0 | 72 | 8 | 0 | 0 | 8 |
| assault | 28 | 201.84 | 7.2086 | 9.2059 | 9.5418 | 4.8571 | 27 | 0 | 1 | 27 | 3 | 0 | 27 |
| chooseOne:chooseOne | 28 | 196.17 | 7.006 | 95.7662 | 96.2512 | 5.6786 | 0 | 7 | 2 | 0 | 0 | 0 | 0 |
| coupPacifyPass | 40 | 161.74 | 4.0436 | 5.7631 | 12.5296 | 1.125 | 36 | 0 | 4 | 36 | 0 | 0 | 36 |
| attack | 14 | 145.49 | 10.3921 | 26.6475 | 26.6475 | 34.9286 | 12 | 0 | 2 | 12 | 0 | 0 | 12 |
| ambushVc | 11 | 141.72 | 12.8838 | 26.2651 | 26.2651 | 8.1818 | 10 | 0 | 1 | 10 | 0 | 0 | 10 |
| coupNvaRedeployTroops | 16 | 87.71 | 5.4818 | 7.7308 | 7.7308 | 3.875 | 10 | 0 | 6 | 10 | 0 | 0 | 10 |
| coupVictoryCheck | 20 | 72.94 | 3.6468 | 6.7494 | 9.4462 | 1 | 20 | 0 | 0 | 20 | 4 | 0 | 20 |
| coupResourcesResolve | 20 | 70.58 | 3.5289 | 4.0311 | 5.1591 | 1 | 4 | 0 | 16 | 4 | 0 | 0 | 4 |
| coupAgitatePass | 20 | 67.53 | 3.3763 | 4.4173 | 5.2496 | 1.25 | 18 | 0 | 2 | 18 | 0 | 0 | 18 |
| coupArvnRedeployMandatory | 2 | 56.92 | 28.4617 | 29.3395 | 29.3395 | 11.5 | 1 | 0 | 1 | 1 | 0 | 0 | 1 |
| event-decision:chooseOne | 36 | 38.34 | 1.0649 | 0.6295 | 35.9546 | 3.9444 | 0 | 1 | 1 | 0 | 0 | 0 | 0 |
| coupCommitmentResolve | 8 | 33.3 | 4.1631 | 5.372 | 5.372 | 2 | 0 | 0 | 8 | 0 | 0 | 0 | 0 |
| ambushNva | 5 | 28.37 | 5.6733 | 9.4369 | 9.4369 | 15.2 | 5 | 0 | 0 | 5 | 0 | 0 | 5 |
| rally:chooseNStep:add | 173 | 13.7 | 0.0792 | 0.1236 | 1.0426 | 20.422 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseNStep:confirm | 218 | 7.76 | 0.0356 | 0.0652 | 0.1344 | 14.8165 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseOne | 176 | 6.25 | 0.0355 | 0.0821 | 0.1257 | 1.3523 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| pass | 2 | 5.47 | 2.7359 | 3.1853 | 3.1853 | 2.5 | 2 | 0 | 0 | 2 | 0 | 0 | 2 |
| resolveHonoluluPacify | 3 | 5.06 | 1.687 | 1.8165 | 1.8165 | 1 | 3 | 0 | 0 | 3 | 0 | 0 | 3 |
| advise:chooseNStep:add | 38 | 3.9 | 0.1027 | 0.7158 | 0.7531 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:add | 57 | 3.52 | 0.0618 | 0.1125 | 0.1628 | 11.4912 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:confirm | 90 | 3.52 | 0.0391 | 0.0605 | 0.1321 | 5.0778 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseOne | 76 | 3.23 | 0.0425 | 0.0841 | 0.1336 | 2.4474 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseNStep:confirm | 83 | 2.84 | 0.0342 | 0.0556 | 0.1713 | 6.253 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:add | 33 | 2.05 | 0.0621 | 0.0661 | 0.6189 | 3.6061 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseOne | 56 | 1.87 | 0.0333 | 0.054 | 0.1473 | 1.625 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupNvaRedeployTroops:chooseOne | 42 | 1.79 | 0.0427 | 0.0603 | 0.1435 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:confirm | 38 | 1.77 | 0.0466 | 0.0847 | 0.0977 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:confirm | 47 | 1.52 | 0.0323 | 0.0584 | 0.146 | 4.4255 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:confirm | 50 | 1.36 | 0.0273 | 0.0397 | 0.0993 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupCommitmentResolve:chooseNStep:confirm | 32 | 0.98 | 0.0305 | 0.0496 | 0.0692 | 9.25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:add | 12 | 0.54 | 0.0452 | 0.0828 | 0.0828 | 3.5833 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| chooseNStep:chooseNStep:confirm | 10 | 0.42 | 0.0425 | 0.0528 | 0.0528 | 22.5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:confirm | 12 | 0.31 | 0.026 | 0.0363 | 0.0363 | 4.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseOne | 11 | 0.25 | 0.0224 | 0.0338 | 0.0338 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseNStep:add | 3 | 0.14 | 0.0462 | 0.0582 | 0.0582 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseOne | 5 | 0.14 | 0.0281 | 0.0374 | 0.0374 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseNStep:confirm | 3 | 0.08 | 0.0276 | 0.0308 | 0.0308 | 3.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Top Hot Axes In Slow-Tier Seeds

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.

| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms |
|---:|---|---|---:|---:|---:|---:|---:|
| 1 | train:chooseNStep:add | continuedDeepening | 33 | 53408.45 | 1618.4378 | 3427.396 | 3517.9186 |
| 2 | coupArvnRedeployPolice:chooseOne | continuedDeepening | 52 | 40548.75 | 779.7836 | 2216.1375 | 2578.0483 |
| 3 | train:chooseNStep:confirm | continuedDeepening | 35 | 39765.43 | 1136.1552 | 3372.4339 | 3511.4181 |
| 4 | coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | 72 | 12214.7 | 169.6486 | 255.0172 | 331.3557 |
| 5 | govern:chooseNStep:confirm | continuedDeepening | 25 | 12188.8 | 487.552 | 304.4375 | 8576.0426 |
| 6 | govern:chooseNStep:add | continuedDeepening | 35 | 11389.61 | 325.4174 | 402.0179 | 4952.1132 |
| 7 | event | singlePass | 95 | 8608.06 | 90.6111 | 174.6532 | 3413.9255 |
| 8 | transport:chooseOne | continuedDeepening | 10 | 2757.14 | 275.7139 | 852.7061 | 852.7061 |
| 9 | coupArvnRedeployMandatory:chooseOne | continuedDeepening | 12 | 2482.71 | 206.8924 | 322.1494 | 322.1494 |
| 10 | govern | singlePass | 32 | 2291.62 | 71.6133 | 103.5253 | 702.471 |

## Fast-Tier vs Slow-Tier Delta

Fast tier: `1000`, `1006`, `1007`, `1010`, `1014`. Rows with ratio greater than `3.0` satisfy the Phase 0 hot-axis criterion.

| Microturn class | Slow decisions | Fast decisions | Slow mean ms | Fast mean ms | Slow:fast ratio | Verdict |
|---|---:|---:|---:|---:|---:|---|
| train:chooseNStep:confirm | 49 | 6 | 811.578 | 0.0893 | 9088.2195 | hot axis |
| train:chooseNStep:add | 33 | 6 | 1618.4378 | 361.6311 | 4.4754 | hot axis |
| train | 17 | 3 | 26.0313 | 12.8483 | 2.0261 |  |
| govern:chooseNStep:confirm | 30 | 35 | 406.3081 | 200.5867 | 2.0256 |  |
| coupArvnRedeployPolice:chooseOne | 52 | 50 | 779.7836 | 414.1245 | 1.883 |  |
| govern:chooseOne | 37 | 35 | 57.8574 | 30.9588 | 1.8689 |  |
| coupNvaRedeployTroops | 7 | 1 | 5.5836 | 3.165 | 1.7642 |  |
| advise:chooseNStep:add | 8 | 15 | 0.1603 | 0.1033 | 1.5518 |  |
| govern:chooseNStep:add | 35 | 35 | 325.4174 | 212.0464 | 1.5347 |  |
| pass | 1 | 1 | 3.1853 | 2.2864 | 1.3932 |  |
| coupCommitmentResolve:chooseNStep:confirm | 8 | 12 | 0.0374 | 0.0273 | 1.37 |  |
| advise:chooseOne | 16 | 30 | 0.0541 | 0.041 | 1.3195 |  |
| govern | 32 | 35 | 71.6133 | 56.3234 | 1.2715 |  |
| advise:chooseNStep:confirm | 8 | 15 | 0.0551 | 0.0444 | 1.241 |  |
| coupRedeployPass | 28 | 24 | 7.4731 | 6.3169 | 1.183 |  |
| transport | 5 | 3 | 67.0352 | 57.1266 | 1.1734 |  |
| coupPacifyARVN | 8 | 8 | 10.1845 | 8.7661 | 1.1618 |  |
| assault | 8 | 9 | 7.666 | 6.6795 | 1.1477 |  |
| advise | 8 | 15 | 9.2382 | 8.2397 | 1.1212 |  |
| march:chooseNStep:add | 21 | 22 | 0.0623 | 0.0569 | 1.0949 |  |
| attack | 6 | 8 | 10.7436 | 10.1285 | 1.0607 |  |
| coupArvnRedeployPolice | 27 | 32 | 22.6061 | 21.447 | 1.054 |  |
| chooseNStep:chooseNStep:confirm | 4 | 3 | 0.0431 | 0.0414 | 1.0411 |  |
| coupArvnRedeployOptionalTroops | 31 | 25 | 24.5173 | 24.044 | 1.0197 |  |
| coupCommitmentPass | 28 | 24 | 2.972 | 2.9306 | 1.0141 |  |
| coupArvnRedeployOptionalTroops:chooseOne | 72 | 60 | 169.6486 | 170.0945 | 0.9974 |  |
| event | 95 | 78 | 90.6111 | 91.0593 | 0.9951 |  |
| coupResourcesResolve | 7 | 6 | 3.6226 | 3.6505 | 0.9924 |  |
| rally:chooseOne | 64 | 57 | 0.0355 | 0.0359 | 0.9889 |  |
| rally:chooseNStep:confirm | 73 | 73 | 0.0363 | 0.0368 | 0.9864 |  |
| event-decision:chooseNStep:confirm | 43 | 26 | 0.0343 | 0.0349 | 0.9828 |  |
| coupPacifyUS | 25 | 26 | 5.6794 | 5.809 | 0.9777 |  |
| march | 15 | 13 | 5.5221 | 5.9933 | 0.9214 |  |
| ambushVc:chooseNStep:confirm | 5 | 3 | 0.0267 | 0.029 | 0.9207 |  |
| coupAgitatePass | 7 | 6 | 3.1217 | 3.434 | 0.9091 |  |
| coupCommitmentResolve | 2 | 3 | 4.1633 | 4.5869 | 0.9077 |  |
| coupAgitateVC | 19 | 25 | 4.6139 | 5.1636 | 0.8935 |  |
| infiltrate | 10 | 8 | 8.4427 | 9.4912 | 0.8895 |  |
| assault:chooseNStep:confirm | 16 | 13 | 0.0266 | 0.03 | 0.8867 |  |
| coupPacifyPass | 14 | 12 | 3.9073 | 4.4104 | 0.8859 |  |
| ambushVc:chooseOne | 5 | 4 | 0.0211 | 0.0251 | 0.8406 |  |
| rally | 62 | 54 | 19.4609 | 24.201 | 0.8041 |  |
| march:chooseNStep:confirm | 34 | 29 | 0.0363 | 0.0462 | 0.7857 |  |
| coupVictoryCheck | 7 | 6 | 3.4913 | 4.5962 | 0.7596 |  |
| infiltrate:chooseOne | 16 | 14 | 0.031 | 0.041 | 0.7561 |  |
| chooseOne:chooseOne | 11 | 8 | 8.8517 | 12.0832 | 0.7326 |  |
| ambushVc | 5 | 4 | 9.668 | 13.3063 | 0.7266 |  |
| train:chooseOne | 29 | 6 | 31.9853 | 45.5013 | 0.703 |  |
| infiltrate:chooseNStep:confirm | 15 | 12 | 0.0307 | 0.0447 | 0.6868 |  |
| ambushVc:chooseNStep:add | 5 | 3 | 0.0405 | 0.0601 | 0.6739 |  |
| rally:chooseNStep:add | 63 | 56 | 0.0651 | 0.1048 | 0.6212 |  |
| coupNvaRedeployTroops:chooseOne | 19 | 2 | 0.0362 | 0.06 | 0.6033 |  |
| transport:chooseOne | 10 | 6 | 275.7139 | 487.5156 | 0.5655 |  |
| infiltrate:chooseNStep:add | 10 | 8 | 0.0443 | 0.1152 | 0.3845 |  |
| event-decision:chooseOne | 13 | 6 | 0.042 | 0.1615 | 0.2601 |  |
| event-decision:chooseNStep:add | 43 | 29 | 0.0496 | 27.7984 | 0.0018 |  |
| assault:chooseOne | 2 | 5 | 0.0362 | 222.897 | 0.0002 |  |
| assault:chooseNStep:add | 8 | 7 | 0.0594 | 586.5638 | 0.0001 |  |

## Notes

- `elapsedMs` is measured around the per-decision `PolicyAgent.chooseDecision` call. It excludes simulator apply/delta work and report rendering.
- Child processes enforce the per-seed timeout. Each child loads the built engine and production FITL GameSpecDoc, using the repo GameDef cache when available.
- The script does not modify engine source or production profile data.
