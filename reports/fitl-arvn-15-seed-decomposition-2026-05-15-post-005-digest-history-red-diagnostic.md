# FITL ARVN 15-Seed Per-Microturn-Class Decomposition

**Date**: 2026-05-15-post-005-digest-history-red-diagnostic
**Status**: Red diagnostic witness for a reverted Spec 173 digest-history candidate; not a closeout artifact.
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 400000 --date 2026-05-15-post-005`
**CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-005-digest-history-red-diagnostic.csv`

## Summary

- Seeds completed: 15/15
- Per-decision rows: 3741
- Hot class with slow:fast ratio >3x: yes
- Per-seed timeout: 400000 ms

## Per-Seed Wall Time

| Seed | Status | Stop Reason | Wall ms | Decisions | ms/decision | Error |
|---:|---|---|---:|---:|---:|---|
| 1000 | OK | terminal | 12194.65 | 159 | 76.6959 |  |
| 1001 | OK | terminal | 20662.32 | 194 | 106.5068 |  |
| 1002 | OK | terminal | 26766.68 | 288 | 92.9399 |  |
| 1003 | OK | terminal | 21857.97 | 226 | 96.7167 |  |
| 1004 | OK | terminal | 31199.09 | 338 | 92.305 |  |
| 1005 | OK | terminal | 83653.7 | 412 | 203.043 |  |
| 1006 | OK | terminal | 15741.58 | 228 | 69.042 |  |
| 1007 | OK | terminal | 12432.8 | 218 | 57.0312 |  |
| 1008 | OK | terminal | 32691.05 | 166 | 196.934 |  |
| 1009 | OK | terminal | 34293.95 | 303 | 113.1814 |  |
| 1010 | OK | terminal | 27219.14 | 319 | 85.3265 |  |
| 1011 | OK | terminal | 32005.42 | 212 | 150.969 |  |
| 1012 | OK | terminal | 31839.99 | 213 | 149.4835 |  |
| 1013 | OK | terminal | 30942.19 | 252 | 122.7865 |  |
| 1014 | OK | terminal | 22872.97 | 213 | 107.3848 |  |

## Per-Microturn-Class Rollup

| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | Token index builds | Static rebuilds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| train:chooseNStep:add | 62 | 93793.52 | 1512.7988 | 3404.0089 | 3596.4373 | 18.5 | 0 | 26647 | 56148 | 0 | 0 | 0 | 0 |
| coupArvnRedeployPolice:chooseOne | 145 | 87944.96 | 606.517 | 1818.0213 | 2425.3395 | 30.7241 | 0 | 93582 | 3151 | 0 | 0 | 0 | 0 |
| train:chooseNStep:confirm | 94 | 54653.63 | 581.4216 | 3294.9456 | 3491.6957 | 7.0638 | 0 | 15975 | 34518 | 0 | 0 | 0 | 0 |
| coupArvnRedeployOptionalTroops:chooseOne | 204 | 35849.96 | 175.7351 | 279.8833 | 364.1556 | 8.4118 | 0 | 11928 | 1638 | 0 | 0 | 0 | 0 |
| govern:chooseNStep:add | 115 | 27302.2 | 237.4104 | 391.0739 | 4986.0973 | 6.687 | 0 | 3600 | 5625 | 0 | 0 | 0 | 0 |
| event | 245 | 25701.62 | 104.9046 | 100.461 | 5573.0737 | 18.9224 | 245 | 0 | 0 | 245 | 234 | 38 | 275 |
| govern:chooseNStep:confirm | 102 | 23152.42 | 226.9845 | 368.1642 | 7879.8027 | 6.8824 | 0 | 2336 | 1059 | 0 | 0 | 0 | 0 |
| govern | 104 | 6357.13 | 61.1262 | 95.6906 | 860.1069 | 10.7115 | 97 | 0 | 7 | 97 | 40 | 0 | 97 |
| transport:chooseOne | 16 | 5562.98 | 347.686 | 798.2761 | 798.2761 | 17.6875 | 0 | 1191 | 46 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:add | 26 | 4535.63 | 174.4472 | 84.2147 | 4450.1406 | 3.1538 | 0 | 18 | 4 | 0 | 0 | 0 | 0 |
| govern:chooseOne | 117 | 4384.28 | 37.4725 | 59.0479 | 1158.6954 | 2 | 0 | 143 | 143 | 0 | 0 | 0 | 0 |
| rally | 170 | 3938.29 | 23.1664 | 51.3374 | 154.4447 | 15.8882 | 148 | 0 | 22 | 148 | 101 | 0 | 148 |
| coupArvnRedeployMandatory:chooseOne | 12 | 2453.18 | 204.4318 | 304.2676 | 304.2676 | 8 | 0 | 1428 | 204 | 0 | 0 | 0 | 0 |
| train:chooseOne | 58 | 2215.94 | 38.2059 | 73.6935 | 200.661 | 2.2759 | 0 | 166 | 198 | 0 | 0 | 0 | 0 |
| coupArvnRedeployOptionalTroops | 87 | 2110.02 | 24.2531 | 28.2207 | 33.8993 | 17.2874 | 70 | 0 | 17 | 70 | 0 | 0 | 70 |
| coupArvnRedeployPolice | 84 | 1862.53 | 22.173 | 25.7232 | 29.8069 | 11.7262 | 82 | 0 | 2 | 82 | 0 | 0 | 82 |
| assault:chooseOne | 10 | 1302.58 | 130.2579 | 1178.5779 | 1178.5779 | 2 | 0 | 4 | 4 | 0 | 0 | 0 | 0 |
| event-decision:chooseNStep:add | 93 | 1012.79 | 10.8902 | 85.4182 | 317.6878 | 12.129 | 0 | 112 | 360 | 0 | 0 | 0 | 0 |
| train | 33 | 809.3 | 24.5241 | 38.9459 | 65.2705 | 7.8485 | 32 | 0 | 1 | 32 | 92 | 0 | 32 |
| coupRedeployPass | 80 | 551.18 | 6.8897 | 21.4605 | 23.8461 | 2.975 | 31 | 0 | 49 | 31 | 15 | 0 | 31 |
| transport | 8 | 487.93 | 60.9911 | 97.2277 | 97.2277 | 11.25 | 8 | 0 | 0 | 8 | 0 | 0 | 8 |
| coupPacifyUS | 76 | 449.57 | 5.9155 | 9.234 | 11.8098 | 2.7763 | 76 | 0 | 0 | 76 | 0 | 0 | 76 |
| advise | 38 | 348.61 | 9.1739 | 14.1063 | 29.465 | 11.4474 | 28 | 0 | 10 | 28 | 8 | 0 | 28 |
| coupAgitateVC | 60 | 313.09 | 5.2182 | 6.8738 | 8.2809 | 2.95 | 42 | 0 | 18 | 42 | 12 | 0 | 42 |
| infiltrate | 33 | 298.52 | 9.0459 | 12.1251 | 17.6781 | 41.5152 | 26 | 0 | 7 | 26 | 15 | 0 | 26 |
| coupPacifyARVN | 31 | 276.14 | 8.9078 | 13.5578 | 13.9826 | 3.9355 | 15 | 0 | 16 | 15 | 10 | 0 | 15 |
| march | 40 | 241.57 | 6.0392 | 10.0417 | 12.0639 | 9.125 | 30 | 0 | 10 | 30 | 66 | 0 | 30 |
| coupCommitmentPass | 80 | 238.15 | 2.9769 | 4.4352 | 5.0788 | 1.15 | 8 | 0 | 72 | 8 | 0 | 0 | 8 |
| assault | 28 | 202.02 | 7.2149 | 9.6467 | 9.7153 | 4.8571 | 27 | 0 | 1 | 27 | 3 | 0 | 27 |
| chooseOne:chooseOne | 28 | 197.59 | 7.0568 | 88.8311 | 104.5046 | 5.6786 | 0 | 7 | 2 | 0 | 0 | 0 | 0 |
| coupPacifyPass | 40 | 163.69 | 4.0922 | 5.618 | 13.4842 | 1.125 | 36 | 0 | 4 | 36 | 0 | 0 | 36 |
| attack | 14 | 162.85 | 11.632 | 25.8084 | 25.8084 | 34.9286 | 12 | 0 | 2 | 12 | 0 | 0 | 12 |
| ambushVc | 11 | 147.73 | 13.4304 | 25.009 | 25.009 | 8.1818 | 10 | 0 | 1 | 10 | 0 | 0 | 10 |
| coupNvaRedeployTroops | 16 | 93.96 | 5.8722 | 9.0021 | 9.0021 | 3.875 | 10 | 0 | 6 | 10 | 0 | 0 | 10 |
| coupResourcesResolve | 20 | 69.7 | 3.4848 | 4.5024 | 5.2111 | 1 | 4 | 0 | 16 | 4 | 0 | 0 | 4 |
| coupAgitatePass | 20 | 64.57 | 3.2285 | 4.4148 | 4.4175 | 1.25 | 18 | 0 | 2 | 18 | 0 | 0 | 18 |
| coupVictoryCheck | 20 | 63.99 | 3.1997 | 4.4281 | 4.7436 | 1 | 20 | 0 | 0 | 20 | 4 | 0 | 20 |
| coupArvnRedeployMandatory | 2 | 53.1 | 26.5512 | 28.1168 | 28.1168 | 11.5 | 1 | 0 | 1 | 1 | 0 | 0 | 1 |
| coupCommitmentResolve | 8 | 30.66 | 3.8331 | 4.7753 | 4.7753 | 2 | 0 | 0 | 8 | 0 | 0 | 0 | 0 |
| ambushNva | 5 | 30.23 | 6.0454 | 11.0144 | 11.0144 | 15.2 | 5 | 0 | 0 | 5 | 0 | 0 | 5 |
| event-decision:chooseOne | 36 | 27.48 | 0.7634 | 0.5542 | 25.1985 | 3.9444 | 0 | 1 | 1 | 0 | 0 | 0 | 0 |
| rally:chooseNStep:add | 173 | 12.92 | 0.0747 | 0.1146 | 0.7968 | 20.422 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseNStep:confirm | 218 | 7.77 | 0.0356 | 0.0707 | 0.1697 | 14.8165 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseOne | 176 | 6.9 | 0.0392 | 0.0969 | 0.2769 | 1.3523 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| resolveHonoluluPacify | 3 | 6.48 | 2.1613 | 3.0701 | 3.0701 | 1 | 3 | 0 | 0 | 3 | 0 | 0 | 3 |
| pass | 2 | 5.58 | 2.7899 | 3.3613 | 3.3613 | 2.5 | 2 | 0 | 0 | 2 | 0 | 0 | 2 |
| advise:chooseNStep:add | 38 | 4.09 | 0.1075 | 0.7323 | 0.9325 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:confirm | 90 | 3.73 | 0.0415 | 0.08 | 0.1136 | 5.0778 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:add | 57 | 3.55 | 0.0623 | 0.1179 | 0.2296 | 11.4912 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseOne | 76 | 3.19 | 0.0419 | 0.0766 | 0.1261 | 2.4474 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseNStep:confirm | 83 | 3.08 | 0.0371 | 0.0579 | 0.1437 | 6.253 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:add | 33 | 2.08 | 0.0631 | 0.0619 | 0.6296 | 3.6061 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseOne | 56 | 2.01 | 0.0359 | 0.0599 | 0.1662 | 1.625 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupNvaRedeployTroops:chooseOne | 42 | 1.76 | 0.042 | 0.0721 | 0.083 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:confirm | 12 | 1.71 | 0.1428 | 1.3964 | 1.3964 | 4.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:confirm | 38 | 1.7 | 0.0448 | 0.0834 | 0.0841 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:confirm | 47 | 1.52 | 0.0323 | 0.0551 | 0.0984 | 4.4255 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:confirm | 50 | 1.48 | 0.0296 | 0.0516 | 0.1217 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupCommitmentResolve:chooseNStep:confirm | 32 | 1.02 | 0.0318 | 0.0616 | 0.0677 | 9.25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:add | 12 | 0.53 | 0.0441 | 0.0717 | 0.0717 | 3.5833 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| chooseNStep:chooseNStep:confirm | 10 | 0.45 | 0.0455 | 0.0716 | 0.0716 | 22.5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseOne | 11 | 0.26 | 0.0236 | 0.0338 | 0.0338 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseOne | 5 | 0.17 | 0.0332 | 0.0419 | 0.0419 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseNStep:add | 3 | 0.15 | 0.0493 | 0.0551 | 0.0551 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseNStep:confirm | 3 | 0.09 | 0.0306 | 0.036 | 0.036 | 3.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Top Hot Axes In Slow-Tier Seeds

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.

| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms |
|---:|---|---|---:|---:|---:|---:|---:|
| 1 | train:chooseNStep:add | continuedDeepening | 33 | 55111.91 | 1670.0579 | 3456.9339 | 3596.4373 |
| 2 | coupArvnRedeployPolice:chooseOne | continuedDeepening | 52 | 41456.89 | 797.248 | 2256.7988 | 2425.3395 |
| 3 | train:chooseNStep:confirm | continuedDeepening | 35 | 40242.46 | 1149.7846 | 3402.3162 | 3491.6957 |
| 4 | coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | 72 | 12621.81 | 175.3029 | 290.767 | 364.1556 |
| 5 | govern:chooseNStep:add | continuedDeepening | 35 | 11598.24 | 331.3783 | 402.482 | 4986.0973 |
| 6 | govern:chooseNStep:confirm | continuedDeepening | 25 | 11428.92 | 457.1568 | 294.3541 | 7879.8027 |
| 7 | event | singlePass | 95 | 9347.03 | 98.3897 | 176.2306 | 4176.1964 |
| 8 | transport:chooseOne | continuedDeepening | 10 | 2623.27 | 262.3272 | 798.2761 | 798.2761 |
| 9 | govern | singlePass | 32 | 2473.93 | 77.3102 | 105.7383 | 860.1069 |
| 10 | coupArvnRedeployMandatory:chooseOne | continuedDeepening | 12 | 2453.18 | 204.4318 | 304.2676 | 304.2676 |

## Fast-Tier vs Slow-Tier Delta

Fast tier: `1000`, `1006`, `1007`, `1010`, `1014`. Rows with ratio greater than `3.0` satisfy the Phase 0 hot-axis criterion.

| Microturn class | Slow decisions | Fast decisions | Slow mean ms | Fast mean ms | Slow:fast ratio | Verdict |
|---|---:|---:|---:|---:|---:|---|
| train:chooseNStep:confirm | 49 | 6 | 821.3104 | 0.0887 | 9259.4183 | hot axis |
| train:chooseNStep:add | 33 | 6 | 1670.0579 | 359.2152 | 4.6492 | hot axis |
| train | 17 | 3 | 26.2948 | 12.8245 | 2.0504 |  |
| govern:chooseNStep:confirm | 30 | 35 | 380.9796 | 200.9511 | 1.8959 |  |
| coupArvnRedeployPolice:chooseOne | 52 | 50 | 797.248 | 424.1336 | 1.8797 |  |
| govern:chooseOne | 37 | 35 | 56.6913 | 32.0423 | 1.7693 |  |
| coupNvaRedeployTroops | 7 | 1 | 6.627 | 3.8897 | 1.7037 |  |
| govern:chooseNStep:add | 35 | 35 | 331.3783 | 217.5371 | 1.5233 |  |
| pass | 1 | 1 | 3.3613 | 2.2184 | 1.5152 |  |
| govern | 32 | 35 | 77.3102 | 58.3367 | 1.3252 |  |
| advise:chooseNStep:add | 8 | 15 | 0.1559 | 0.1195 | 1.3046 |  |
| coupCommitmentResolve:chooseNStep:confirm | 8 | 12 | 0.0361 | 0.0283 | 1.2756 |  |
| advise:chooseNStep:confirm | 8 | 15 | 0.0537 | 0.0425 | 1.2635 |  |
| advise:chooseOne | 16 | 30 | 0.0503 | 0.0406 | 1.2389 |  |
| assault | 8 | 9 | 7.7478 | 6.5665 | 1.1799 |  |
| advise | 8 | 15 | 9.5953 | 8.2029 | 1.1697 |  |
| coupVictoryCheck | 7 | 6 | 3.602 | 3.1113 | 1.1577 |  |
| ambushVc:chooseNStep:confirm | 5 | 3 | 0.032 | 0.0279 | 1.147 |  |
| coupPacifyARVN | 8 | 8 | 10.3112 | 8.9925 | 1.1466 |  |
| coupRedeployPass | 28 | 24 | 7.2166 | 6.3049 | 1.1446 |  |
| transport | 5 | 3 | 63.6224 | 56.6055 | 1.124 |  |
| coupPacifyUS | 25 | 26 | 6.2265 | 5.6819 | 1.0958 |  |
| coupArvnRedeployPolice | 27 | 32 | 22.7755 | 21.3813 | 1.0652 |  |
| event | 95 | 78 | 98.3897 | 94.7042 | 1.0389 |  |
| rally:chooseNStep:confirm | 73 | 73 | 0.0378 | 0.037 | 1.0216 |  |
| march:chooseNStep:add | 21 | 22 | 0.0633 | 0.0626 | 1.0112 |  |
| coupCommitmentPass | 28 | 24 | 3.01 | 2.9796 | 1.0102 |  |
| coupArvnRedeployOptionalTroops | 31 | 25 | 24.0986 | 24 | 1.0041 |  |
| march | 15 | 13 | 5.6954 | 5.8479 | 0.9739 |  |
| coupArvnRedeployOptionalTroops:chooseOne | 72 | 60 | 175.3029 | 180.4249 | 0.9716 |  |
| chooseNStep:chooseNStep:confirm | 4 | 3 | 0.0444 | 0.046 | 0.9652 |  |
| coupResourcesResolve | 7 | 6 | 3.2372 | 3.3641 | 0.9623 |  |
| event-decision:chooseNStep:confirm | 43 | 26 | 0.0371 | 0.0396 | 0.9369 |  |
| coupCommitmentResolve | 2 | 3 | 3.7485 | 4.0773 | 0.9194 |  |
| coupAgitateVC | 19 | 25 | 4.8553 | 5.3202 | 0.9126 |  |
| coupAgitatePass | 7 | 6 | 3.109 | 3.4259 | 0.9075 |  |
| ambushVc:chooseOne | 5 | 4 | 0.0229 | 0.0262 | 0.874 |  |
| assault:chooseNStep:confirm | 16 | 13 | 0.029 | 0.0335 | 0.8657 |  |
| rally:chooseOne | 64 | 57 | 0.0375 | 0.0437 | 0.8581 |  |
| infiltrate:chooseOne | 16 | 14 | 0.0368 | 0.0433 | 0.8499 |  |
| infiltrate | 10 | 8 | 8.1593 | 9.6066 | 0.8493 |  |
| coupPacifyPass | 14 | 12 | 3.8854 | 4.5807 | 0.8482 |  |
| attack | 6 | 8 | 10.5243 | 12.4628 | 0.8445 |  |
| infiltrate:chooseNStep:confirm | 15 | 12 | 0.0325 | 0.0399 | 0.8145 |  |
| ambushVc:chooseNStep:add | 5 | 3 | 0.0443 | 0.0555 | 0.7982 |  |
| rally | 62 | 54 | 19.7647 | 24.8671 | 0.7948 |  |
| rally:chooseNStep:add | 63 | 56 | 0.0687 | 0.0878 | 0.7825 |  |
| march:chooseNStep:confirm | 34 | 29 | 0.038 | 0.0498 | 0.7631 |  |
| train:chooseOne | 29 | 6 | 33.2201 | 46.635 | 0.7123 |  |
| ambushVc | 5 | 4 | 9.9252 | 15.0606 | 0.659 |  |
| coupNvaRedeployTroops:chooseOne | 19 | 2 | 0.0403 | 0.0636 | 0.6336 |  |
| chooseOne:chooseOne | 11 | 8 | 8.2283 | 13.1297 | 0.6267 |  |
| transport:chooseOne | 10 | 6 | 262.3272 | 489.9506 | 0.5354 |  |
| infiltrate:chooseNStep:add | 10 | 8 | 0.0463 | 0.1189 | 0.3894 |  |
| event-decision:chooseOne | 13 | 6 | 0.0537 | 0.1476 | 0.3638 |  |
| event-decision:chooseNStep:add | 43 | 29 | 0.0548 | 28.2917 | 0.0019 |  |
| assault:chooseOne | 2 | 5 | 0.0464 | 253.47 | 0.0002 |  |
| assault:chooseNStep:add | 8 | 7 | 0.0566 | 635.7808 | 0.0001 |  |

## Notes

- `elapsedMs` is measured around the per-decision `PolicyAgent.chooseDecision` call. It excludes simulator apply/delta work and report rendering.
- Child processes enforce the per-seed timeout. Each child loads the built engine and production FITL GameSpecDoc, using the repo GameDef cache when available.
- The script does not modify engine source or production profile data.
