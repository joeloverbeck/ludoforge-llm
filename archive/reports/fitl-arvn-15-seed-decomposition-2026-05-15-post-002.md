# FITL ARVN 15-Seed Per-Microturn-Class Decomposition

**Status**: ✅ EXPLOITED — referenced during spec 174 implementation (archived 2026-05-16).

**Date**: 2026-05-15-post-002
**Status**: Spec 173 post-002 measurement witness.
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 400000 --date 2026-05-15-post-002`
**CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-002.csv`

## Summary

- Seeds completed: 15/15
- Per-decision rows: 3741
- Hot class with slow:fast ratio >3x: yes
- Per-seed timeout: 400000 ms

## Per-Seed Wall Time

| Seed | Status | Stop Reason | Wall ms | Decisions | ms/decision | Error |
|---:|---|---|---:|---:|---:|---|
| 1000 | OK | terminal | 12251.12 | 159 | 77.0511 |  |
| 1001 | OK | terminal | 24289.96 | 194 | 125.206 |  |
| 1002 | OK | terminal | 29877.99 | 288 | 103.743 |  |
| 1003 | OK | terminal | 24660.52 | 226 | 109.1173 |  |
| 1004 | OK | terminal | 35140.14 | 338 | 103.9649 |  |
| 1005 | OK | terminal | 107468.38 | 412 | 260.8456 |  |
| 1006 | OK | terminal | 16307.07 | 228 | 71.5222 |  |
| 1007 | OK | terminal | 12521.42 | 218 | 57.4377 |  |
| 1008 | OK | terminal | 40492.98 | 166 | 243.9336 |  |
| 1009 | OK | terminal | 37864.6 | 303 | 124.9657 |  |
| 1010 | OK | terminal | 27117.7 | 319 | 85.0085 |  |
| 1011 | OK | terminal | 42590.14 | 212 | 200.8969 |  |
| 1012 | OK | terminal | 37704.61 | 213 | 177.0169 |  |
| 1013 | OK | terminal | 38658.2 | 252 | 153.4056 |  |
| 1014 | OK | terminal | 25001.71 | 213 | 117.3789 |  |

## Per-Microturn-Class Rollup

| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | Token index builds | Static rebuilds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| train:chooseNStep:add | 62 | 134938.45 | 2176.4267 | 5301.8661 | 5567.2738 | 18.5 | 0 | 26647 | 56148 | 0 | 0 | 33203 | 0 |
| train:chooseNStep:confirm | 94 | 82409.86 | 876.7006 | 5268.8173 | 5527.9699 | 7.0638 | 0 | 15975 | 34518 | 0 | 0 | 6242 | 0 |
| coupArvnRedeployPolice:chooseOne | 145 | 82321.85 | 567.7369 | 1886.2099 | 2409.9711 | 30.7241 | 0 | 93582 | 3151 | 0 | 0 | 0 | 0 |
| coupArvnRedeployOptionalTroops:chooseOne | 204 | 34291.16 | 168.0939 | 284.8377 | 328.2396 | 8.4118 | 0 | 11928 | 1638 | 0 | 0 | 0 | 0 |
| govern:chooseNStep:add | 115 | 32757.66 | 284.8492 | 467.6225 | 5649.2915 | 6.687 | 0 | 3600 | 5625 | 0 | 0 | 44042 | 0 |
| event | 245 | 27185.67 | 110.9619 | 110.9988 | 6443.6425 | 18.9224 | 245 | 0 | 0 | 245 | 234 | 138761 | 275 |
| govern:chooseNStep:confirm | 102 | 25358.85 | 248.6161 | 383.0247 | 9306.9893 | 6.8824 | 0 | 2336 | 1059 | 0 | 0 | 61105 | 0 |
| govern | 104 | 6255.19 | 60.1461 | 92.9767 | 755.4752 | 10.7115 | 97 | 0 | 7 | 97 | 40 | 6299 | 97 |
| transport:chooseOne | 16 | 5987.72 | 374.2325 | 892.7254 | 892.7254 | 17.6875 | 0 | 1191 | 46 | 0 | 0 | 18203 | 0 |
| assault:chooseNStep:add | 26 | 4883.1 | 187.8116 | 75.1616 | 4806.5938 | 3.1538 | 0 | 18 | 4 | 0 | 0 | 19504 | 0 |
| govern:chooseOne | 117 | 4722.68 | 40.3648 | 59.4504 | 1421.5558 | 2 | 0 | 143 | 143 | 0 | 0 | 12264 | 0 |
| rally | 170 | 4124.26 | 24.2603 | 53.2885 | 150.8293 | 15.8882 | 148 | 0 | 22 | 148 | 101 | 7531 | 148 |
| coupArvnRedeployMandatory:chooseOne | 12 | 2488.84 | 207.4033 | 307.634 | 307.634 | 8 | 0 | 1428 | 204 | 0 | 0 | 0 | 0 |
| train:chooseOne | 58 | 2247.89 | 38.7567 | 76.6752 | 189.3266 | 2.2759 | 0 | 166 | 198 | 0 | 0 | 4461 | 0 |
| coupArvnRedeployOptionalTroops | 87 | 2187.57 | 25.1444 | 28.8032 | 30.1469 | 17.2874 | 70 | 0 | 17 | 70 | 0 | 0 | 70 |
| coupArvnRedeployPolice | 84 | 1917.38 | 22.8259 | 25.4646 | 26.4555 | 11.7262 | 82 | 0 | 2 | 82 | 0 | 0 | 82 |
| event-decision:chooseNStep:add | 93 | 1393.8 | 14.9871 | 84.9225 | 498.9715 | 12.129 | 0 | 112 | 360 | 0 | 0 | 5629 | 0 |
| assault:chooseOne | 10 | 1288.34 | 128.8342 | 1170.745 | 1170.745 | 2 | 0 | 4 | 4 | 0 | 0 | 4936 | 0 |
| train | 33 | 838.86 | 25.42 | 42.7315 | 66.4063 | 7.8485 | 32 | 0 | 1 | 32 | 92 | 11 | 32 |
| coupRedeployPass | 80 | 602.59 | 7.5324 | 22.2021 | 24.2067 | 2.975 | 31 | 0 | 49 | 31 | 15 | 0 | 31 |
| transport | 8 | 523.22 | 65.402 | 104.8995 | 104.8995 | 11.25 | 8 | 0 | 0 | 8 | 0 | 606 | 8 |
| coupPacifyUS | 76 | 497.41 | 6.5448 | 10.0692 | 10.8187 | 2.7763 | 76 | 0 | 0 | 76 | 0 | 0 | 76 |
| advise | 38 | 367.4 | 9.6685 | 15.6379 | 32.8131 | 11.4474 | 28 | 0 | 10 | 28 | 8 | 32 | 28 |
| coupAgitateVC | 60 | 358.48 | 5.9746 | 7.9298 | 9.6768 | 2.95 | 42 | 0 | 18 | 42 | 12 | 0 | 42 |
| infiltrate | 33 | 328.84 | 9.9648 | 12.4939 | 16.891 | 41.5152 | 26 | 0 | 7 | 26 | 15 | 0 | 26 |
| coupPacifyARVN | 31 | 302.1 | 9.7453 | 14.8819 | 15.5142 | 3.9355 | 15 | 0 | 16 | 15 | 10 | 0 | 15 |
| coupCommitmentPass | 80 | 301.99 | 3.7749 | 5.4296 | 9.0519 | 1.15 | 8 | 0 | 72 | 8 | 0 | 0 | 8 |
| march | 40 | 270.63 | 6.7658 | 10.8033 | 13.1181 | 9.125 | 30 | 0 | 10 | 30 | 66 | 0 | 30 |
| assault | 28 | 226.56 | 8.0916 | 10.3322 | 11.4698 | 4.8571 | 27 | 0 | 1 | 27 | 3 | 0 | 27 |
| chooseOne:chooseOne | 28 | 209.93 | 7.4976 | 101.3822 | 104.2636 | 5.6786 | 0 | 7 | 2 | 0 | 0 | 153 | 0 |
| coupPacifyPass | 40 | 195.56 | 4.889 | 7.1994 | 14.4484 | 1.125 | 36 | 0 | 4 | 36 | 0 | 0 | 36 |
| attack | 14 | 159.49 | 11.3924 | 25.1059 | 25.1059 | 34.9286 | 12 | 0 | 2 | 12 | 0 | 8 | 12 |
| ambushVc | 11 | 147.06 | 13.369 | 28.4164 | 28.4164 | 8.1818 | 10 | 0 | 1 | 10 | 0 | 40 | 10 |
| coupNvaRedeployTroops | 16 | 98.37 | 6.1479 | 8.6642 | 8.6642 | 3.875 | 10 | 0 | 6 | 10 | 0 | 0 | 10 |
| coupResourcesResolve | 20 | 88.59 | 4.4294 | 6.4926 | 8.0235 | 1 | 4 | 0 | 16 | 4 | 0 | 0 | 4 |
| coupAgitatePass | 20 | 82.17 | 4.1084 | 5.428 | 5.5876 | 1.25 | 18 | 0 | 2 | 18 | 0 | 0 | 18 |
| coupVictoryCheck | 20 | 77.47 | 3.8733 | 5.1289 | 5.8705 | 1 | 20 | 0 | 0 | 20 | 4 | 0 | 20 |
| coupArvnRedeployMandatory | 2 | 52 | 26.0012 | 26.1967 | 26.1967 | 11.5 | 1 | 0 | 1 | 1 | 0 | 0 | 1 |
| coupCommitmentResolve | 8 | 38.24 | 4.7805 | 6.2936 | 6.2936 | 2 | 0 | 0 | 8 | 0 | 0 | 0 | 0 |
| ambushNva | 5 | 32.18 | 6.4366 | 10.0274 | 10.0274 | 15.2 | 5 | 0 | 0 | 5 | 0 | 0 | 5 |
| event-decision:chooseOne | 36 | 28.72 | 0.7978 | 0.584 | 26.2799 | 3.9444 | 0 | 1 | 1 | 0 | 0 | 22 | 0 |
| rally:chooseNStep:add | 173 | 13.89 | 0.0803 | 0.1285 | 0.7987 | 20.422 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseNStep:confirm | 218 | 8.28 | 0.038 | 0.0744 | 0.1485 | 14.8165 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| pass | 2 | 7.91 | 3.9572 | 3.9988 | 3.9988 | 2.5 | 2 | 0 | 0 | 2 | 0 | 0 | 2 |
| resolveHonoluluPacify | 3 | 7.5 | 2.4995 | 3.16 | 3.16 | 1 | 3 | 0 | 0 | 3 | 0 | 0 | 3 |
| rally:chooseOne | 176 | 6.37 | 0.0362 | 0.0837 | 0.156 | 1.3523 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:add | 38 | 4.1 | 0.108 | 0.7832 | 0.8229 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:confirm | 90 | 3.85 | 0.0427 | 0.0778 | 0.1208 | 5.0778 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:add | 57 | 3.45 | 0.0605 | 0.0942 | 0.1136 | 11.4912 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseOne | 76 | 3.23 | 0.0425 | 0.0673 | 0.1459 | 2.4474 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseNStep:confirm | 83 | 2.98 | 0.0359 | 0.0628 | 0.1645 | 6.253 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:add | 33 | 2.09 | 0.0632 | 0.0706 | 0.6384 | 3.6061 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseOne | 56 | 1.94 | 0.0347 | 0.0602 | 0.1638 | 1.625 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:confirm | 38 | 1.79 | 0.0471 | 0.0827 | 0.083 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupNvaRedeployTroops:chooseOne | 42 | 1.74 | 0.0415 | 0.0561 | 0.0793 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:confirm | 47 | 1.74 | 0.037 | 0.0517 | 0.2569 | 4.4255 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:confirm | 50 | 1.68 | 0.0335 | 0.0936 | 0.1339 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupCommitmentResolve:chooseNStep:confirm | 32 | 0.92 | 0.0288 | 0.0474 | 0.0518 | 9.25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:add | 12 | 0.51 | 0.0423 | 0.0533 | 0.0533 | 3.5833 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| chooseNStep:chooseNStep:confirm | 10 | 0.44 | 0.0436 | 0.0548 | 0.0548 | 22.5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:confirm | 12 | 0.38 | 0.0316 | 0.0463 | 0.0463 | 4.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseOne | 11 | 0.29 | 0.026 | 0.0345 | 0.0345 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseOne | 5 | 0.16 | 0.0317 | 0.0362 | 0.0362 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseNStep:add | 3 | 0.15 | 0.0503 | 0.0597 | 0.0597 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseNStep:confirm | 3 | 0.11 | 0.037 | 0.0488 | 0.0488 | 3.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Top Hot Axes In Slow-Tier Seeds

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.

| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms |
|---:|---|---|---:|---:|---:|---:|---:|
| 1 | train:chooseNStep:add | continuedDeepening | 33 | 83753.19 | 2537.9756 | 5418.4297 | 5567.2738 |
| 2 | train:chooseNStep:confirm | continuedDeepening | 35 | 62357.66 | 1781.6475 | 5386.1846 | 5527.9699 |
| 3 | coupArvnRedeployPolice:chooseOne | continuedDeepening | 52 | 38891.44 | 747.9123 | 2239.7543 | 2409.9711 |
| 4 | govern:chooseNStep:add | continuedDeepening | 35 | 13914.19 | 397.5483 | 527.8247 | 5649.2915 |
| 5 | govern:chooseNStep:confirm | continuedDeepening | 25 | 13146.75 | 525.87 | 337.7766 | 9306.9893 |
| 6 | coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | 72 | 12638.02 | 175.5281 | 309.1744 | 328.2396 |
| 7 | event | singlePass | 95 | 9149.22 | 96.3076 | 164.0879 | 3820.0987 |
| 8 | transport:chooseOne | continuedDeepening | 10 | 2848.04 | 284.8039 | 892.7254 | 892.7254 |
| 9 | coupArvnRedeployMandatory:chooseOne | continuedDeepening | 12 | 2488.84 | 207.4033 | 307.634 | 307.634 |
| 10 | govern:chooseOne | continuedDeepening | 37 | 2404.25 | 64.9798 | 52.7786 | 1421.5558 |

## Fast-Tier vs Slow-Tier Delta

Fast tier: `1000`, `1006`, `1007`, `1010`, `1014`. Rows with ratio greater than `3.0` satisfy the Phase 0 hot-axis criterion.

| Microturn class | Slow decisions | Fast decisions | Slow mean ms | Fast mean ms | Slow:fast ratio | Verdict |
|---|---:|---:|---:|---:|---:|---|
| train:chooseNStep:confirm | 49 | 6 | 1272.645 | 0.0996 | 12777.5602 | hot axis |
| train:chooseNStep:add | 33 | 6 | 2537.9756 | 375.994 | 6.75 | hot axis |
| govern:chooseNStep:confirm | 30 | 35 | 438.2407 | 209.8183 | 2.0887 |  |
| govern:chooseOne | 37 | 35 | 64.9798 | 31.9886 | 2.0313 |  |
| train | 17 | 3 | 27.4475 | 13.5808 | 2.0211 |  |
| coupArvnRedeployPolice:chooseOne | 52 | 50 | 747.9123 | 397.6505 | 1.8808 |  |
| advise:chooseNStep:add | 8 | 15 | 0.1733 | 0.1101 | 1.574 |  |
| govern:chooseNStep:add | 35 | 35 | 397.5483 | 261.3591 | 1.5211 |  |
| advise:chooseOne | 16 | 30 | 0.0554 | 0.0414 | 1.3382 |  |
| coupNvaRedeployTroops | 7 | 1 | 5.9657 | 4.5323 | 1.3163 |  |
| govern | 32 | 35 | 74.3314 | 57.7862 | 1.2863 |  |
| coupPacifyARVN | 8 | 8 | 12.2034 | 9.8398 | 1.2402 |  |
| advise | 8 | 15 | 10.3187 | 8.6595 | 1.1916 |  |
| advise:chooseNStep:confirm | 8 | 15 | 0.0562 | 0.0473 | 1.1882 |  |
| assault | 8 | 9 | 8.6907 | 7.4778 | 1.1622 |  |
| coupCommitmentResolve | 2 | 3 | 5.2773 | 4.5886 | 1.1501 |  |
| chooseNStep:chooseNStep:confirm | 4 | 3 | 0.0451 | 0.0399 | 1.1303 |  |
| coupVictoryCheck | 7 | 6 | 4.2925 | 3.8024 | 1.1289 |  |
| coupRedeployPass | 28 | 24 | 7.7374 | 6.8865 | 1.1236 |  |
| transport | 5 | 3 | 68.1073 | 60.8933 | 1.1185 |  |
| coupResourcesResolve | 7 | 6 | 4.6765 | 4.2041 | 1.1124 |  |
| coupCommitmentResolve:chooseNStep:confirm | 8 | 12 | 0.0303 | 0.0275 | 1.1018 |  |
| march:chooseNStep:add | 21 | 22 | 0.0643 | 0.0586 | 1.0973 |  |
| ambushVc:chooseNStep:confirm | 5 | 3 | 0.0322 | 0.0295 | 1.0915 |  |
| ambushVc:chooseOne | 5 | 4 | 0.0255 | 0.0236 | 1.0805 |  |
| coupPacifyUS | 25 | 26 | 6.9938 | 6.4756 | 1.08 |  |
| rally:chooseNStep:confirm | 73 | 73 | 0.0415 | 0.0387 | 1.0724 |  |
| coupArvnRedeployPolice | 27 | 32 | 23.4412 | 21.9117 | 1.0698 |  |
| assault:chooseNStep:confirm | 16 | 13 | 0.0374 | 0.0351 | 1.0655 |  |
| march | 15 | 13 | 6.6386 | 6.2993 | 1.0539 |  |
| coupArvnRedeployOptionalTroops | 31 | 25 | 25.6584 | 24.5639 | 1.0446 |  |
| rally:chooseOne | 64 | 57 | 0.0384 | 0.0368 | 1.0435 |  |
| coupArvnRedeployOptionalTroops:chooseOne | 72 | 60 | 175.5281 | 168.3264 | 1.0428 |  |
| coupCommitmentPass | 28 | 24 | 3.7782 | 3.6332 | 1.0399 |  |
| coupAgitatePass | 7 | 6 | 4.0761 | 3.9352 | 1.0358 |  |
| attack | 6 | 8 | 11.6045 | 11.2333 | 1.033 |  |
| event-decision:chooseNStep:confirm | 43 | 26 | 0.0352 | 0.0356 | 0.9888 |  |
| pass | 1 | 1 | 3.9155 | 3.9988 | 0.9792 |  |
| coupAgitateVC | 19 | 25 | 5.7867 | 6.1761 | 0.937 |  |
| event | 95 | 78 | 96.3076 | 104.5339 | 0.9213 |  |
| ambushVc:chooseNStep:add | 5 | 3 | 0.0409 | 0.0465 | 0.8796 |  |
| infiltrate | 10 | 8 | 9.1677 | 10.537 | 0.87 |  |
| coupPacifyPass | 14 | 12 | 4.7124 | 5.6936 | 0.8277 |  |
| rally | 62 | 54 | 20.7144 | 25.7481 | 0.8045 |  |
| march:chooseNStep:confirm | 34 | 29 | 0.0414 | 0.0526 | 0.7871 |  |
| infiltrate:chooseOne | 16 | 14 | 0.034 | 0.0432 | 0.787 |  |
| train:chooseOne | 29 | 6 | 35.4784 | 45.9573 | 0.772 |  |
| chooseOne:chooseOne | 11 | 8 | 9.3728 | 13.0852 | 0.7163 |  |
| ambushVc | 5 | 4 | 9.8092 | 13.7805 | 0.7118 |  |
| coupNvaRedeployTroops:chooseOne | 19 | 2 | 0.0411 | 0.0606 | 0.6782 |  |
| rally:chooseNStep:add | 63 | 56 | 0.0676 | 0.1036 | 0.6525 |  |
| infiltrate:chooseNStep:confirm | 15 | 12 | 0.0319 | 0.0579 | 0.5509 |  |
| transport:chooseOne | 10 | 6 | 284.8039 | 523.2802 | 0.5443 |  |
| infiltrate:chooseNStep:add | 10 | 8 | 0.0457 | 0.1203 | 0.3799 |  |
| event-decision:chooseOne | 13 | 6 | 0.0439 | 0.1628 | 0.2697 |  |
| event-decision:chooseNStep:add | 43 | 29 | 0.0924 | 39.805 | 0.0023 |  |
| assault:chooseNStep:add | 8 | 7 | 0.0661 | 686.7017 | 0.0001 |  |
| assault:chooseOne | 2 | 5 | 0.0332 | 250.8496 | 0.0001 |  |

## Notes

- `elapsedMs` is measured around the per-decision `PolicyAgent.chooseDecision` call. It excludes simulator apply/delta work and report rendering.
- Child processes enforce the per-seed timeout. Each child loads the built engine and production FITL GameSpecDoc, using the repo GameDef cache when available.
- The script does not modify engine source or production profile data.
