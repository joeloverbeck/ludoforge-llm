# FITL ARVN 15-Seed Per-Microturn-Class Decomposition

**Status**: ✅ EXPLOITED — referenced during spec 174 implementation (archived 2026-05-16).

**Date**: 2026-05-15-post-005
**Status**: Spec 173 measurement witness.
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 400000 --date 2026-05-15-post-005`
**CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-005.csv`

## Summary

- Seeds completed: 15/15
- Per-decision rows: 3741
- Hot class with slow:fast ratio >3x: yes
- Per-seed timeout: 400000 ms
- Hot-path buckets: disabled

## Per-Seed Wall Time

| Seed | Status | Stop Reason | Wall ms | Decisions | ms/decision | Error |
|---:|---|---|---:|---:|---:|---|
| 1000 | OK | terminal | 12312.79 | 159 | 77.4389 |  |
| 1001 | OK | terminal | 20039.33 | 194 | 103.2955 |  |
| 1002 | OK | terminal | 26127.98 | 288 | 90.7222 |  |
| 1003 | OK | terminal | 20922.44 | 226 | 92.5772 |  |
| 1004 | OK | terminal | 31111.02 | 338 | 92.0444 |  |
| 1005 | OK | terminal | 83998.79 | 412 | 203.8806 |  |
| 1006 | OK | terminal | 15035.41 | 228 | 65.9448 |  |
| 1007 | OK | terminal | 12106.98 | 218 | 55.5366 |  |
| 1008 | OK | terminal | 31148.43 | 166 | 187.6411 |  |
| 1009 | OK | terminal | 33470.61 | 303 | 110.4641 |  |
| 1010 | OK | terminal | 26658.51 | 319 | 83.569 |  |
| 1011 | OK | terminal | 31240.35 | 212 | 147.3601 |  |
| 1012 | OK | terminal | 31126.47 | 213 | 146.1337 |  |
| 1013 | OK | terminal | 28267.5 | 252 | 112.1726 |  |
| 1014 | OK | terminal | 22628.05 | 213 | 106.235 |  |

## Per-Microturn-Class Rollup

| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | Token index builds | Static rebuilds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| train:chooseNStep:add | 62 | 90613.77 | 1461.5125 | 3314.1993 | 3399.2261 | 18.5 | 0 | 26647 | 56148 | 0 | 0 | 0 | 0 |
| coupArvnRedeployPolice:chooseOne | 145 | 87297.14 | 602.0492 | 1870.1907 | 2518.6232 | 30.7241 | 0 | 93582 | 3151 | 0 | 0 | 0 | 0 |
| train:chooseNStep:confirm | 94 | 52658.62 | 560.1981 | 3211.0518 | 3371.3041 | 7.0638 | 0 | 15975 | 34518 | 0 | 0 | 0 | 0 |
| coupArvnRedeployOptionalTroops:chooseOne | 204 | 35334.5 | 173.2084 | 269.2184 | 330.0447 | 8.4118 | 0 | 11928 | 1638 | 0 | 0 | 0 | 0 |
| govern:chooseNStep:add | 115 | 26455.93 | 230.0516 | 346.8772 | 4836.2098 | 6.687 | 0 | 3600 | 5625 | 0 | 0 | 0 | 0 |
| event | 245 | 24251.93 | 98.9875 | 107.4249 | 5304.2257 | 18.9224 | 245 | 0 | 0 | 245 | 234 | 38 | 275 |
| govern:chooseNStep:confirm | 102 | 23315.32 | 228.5815 | 363.7388 | 8209.6753 | 6.8824 | 0 | 2336 | 1059 | 0 | 0 | 0 | 0 |
| govern | 104 | 6043.98 | 58.1152 | 93.6539 | 633.0877 | 10.7115 | 97 | 0 | 7 | 97 | 40 | 0 | 97 |
| transport:chooseOne | 16 | 5562.67 | 347.6668 | 805.7999 | 805.7999 | 17.6875 | 0 | 1191 | 46 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:add | 26 | 4396.89 | 169.1111 | 76.5402 | 4319.0137 | 3.1538 | 0 | 18 | 4 | 0 | 0 | 0 | 0 |
| govern:chooseOne | 117 | 4374.15 | 37.3859 | 53.738 | 1212.9736 | 2 | 0 | 143 | 143 | 0 | 0 | 0 | 0 |
| rally | 170 | 3890.5 | 22.8853 | 48.9905 | 167.2527 | 15.8882 | 148 | 0 | 22 | 148 | 101 | 0 | 148 |
| coupArvnRedeployMandatory:chooseOne | 12 | 2527.63 | 210.6356 | 301.1156 | 301.1156 | 8 | 0 | 1428 | 204 | 0 | 0 | 0 | 0 |
| train:chooseOne | 58 | 2150.05 | 37.0699 | 69.5945 | 208.6604 | 2.2759 | 0 | 166 | 198 | 0 | 0 | 0 | 0 |
| coupArvnRedeployOptionalTroops | 87 | 2107.04 | 24.2189 | 28.9831 | 35.6418 | 17.2874 | 70 | 0 | 17 | 70 | 0 | 0 | 70 |
| coupArvnRedeployPolice | 84 | 1838.67 | 21.8889 | 24.1743 | 25.3273 | 11.7262 | 82 | 0 | 2 | 82 | 0 | 0 | 82 |
| assault:chooseOne | 10 | 1201.69 | 120.1694 | 1082.1654 | 1082.1654 | 2 | 0 | 4 | 4 | 0 | 0 | 0 | 0 |
| event-decision:chooseNStep:add | 93 | 1037.16 | 11.1522 | 85.1648 | 315.8343 | 12.129 | 0 | 112 | 360 | 0 | 0 | 0 | 0 |
| train | 33 | 801.67 | 24.2931 | 39.8791 | 61.3635 | 7.8485 | 32 | 0 | 1 | 32 | 92 | 0 | 32 |
| coupRedeployPass | 80 | 551.71 | 6.8964 | 21.6535 | 23.634 | 2.975 | 31 | 0 | 49 | 31 | 15 | 0 | 31 |
| transport | 8 | 508.07 | 63.5092 | 109.3039 | 109.3039 | 11.25 | 8 | 0 | 0 | 8 | 0 | 0 | 8 |
| coupPacifyUS | 76 | 438.65 | 5.7718 | 9.8734 | 11.3034 | 2.7763 | 76 | 0 | 0 | 76 | 0 | 0 | 76 |
| advise | 38 | 337.97 | 8.8938 | 14.3275 | 28.8044 | 11.4474 | 28 | 0 | 10 | 28 | 8 | 0 | 28 |
| coupAgitateVC | 60 | 305.53 | 5.0922 | 6.5372 | 7.6653 | 2.95 | 42 | 0 | 18 | 42 | 12 | 0 | 42 |
| infiltrate | 33 | 302.83 | 9.1767 | 13.0362 | 16.4938 | 41.5152 | 26 | 0 | 7 | 26 | 15 | 0 | 26 |
| coupPacifyARVN | 31 | 269.46 | 8.6922 | 14.255 | 15.1694 | 3.9355 | 15 | 0 | 16 | 15 | 10 | 0 | 15 |
| march | 40 | 248.4 | 6.2099 | 10.3466 | 13.5125 | 9.125 | 30 | 0 | 10 | 30 | 66 | 0 | 30 |
| coupCommitmentPass | 80 | 237.77 | 2.9721 | 4.4816 | 5.0121 | 1.15 | 8 | 0 | 72 | 8 | 0 | 0 | 8 |
| assault | 28 | 200.32 | 7.1544 | 8.7948 | 10.2131 | 4.8571 | 27 | 0 | 1 | 27 | 3 | 0 | 27 |
| chooseOne:chooseOne | 28 | 192.83 | 6.8868 | 90.4682 | 97.928 | 5.6786 | 0 | 7 | 2 | 0 | 0 | 0 | 0 |
| coupPacifyPass | 40 | 156.43 | 3.9107 | 5.3802 | 12.7535 | 1.125 | 36 | 0 | 4 | 36 | 0 | 0 | 36 |
| attack | 14 | 154.81 | 11.0577 | 27.9255 | 27.9255 | 34.9286 | 12 | 0 | 2 | 12 | 0 | 0 | 12 |
| ambushVc | 11 | 151.93 | 13.8115 | 29.3571 | 29.3571 | 8.1818 | 10 | 0 | 1 | 10 | 0 | 0 | 10 |
| coupNvaRedeployTroops | 16 | 93.91 | 5.8695 | 8.903 | 8.903 | 3.875 | 10 | 0 | 6 | 10 | 0 | 0 | 10 |
| coupVictoryCheck | 20 | 68.27 | 3.4134 | 4.973 | 5.7402 | 1 | 20 | 0 | 0 | 20 | 4 | 0 | 20 |
| coupAgitatePass | 20 | 67.18 | 3.3588 | 4.4249 | 5.1806 | 1.25 | 18 | 0 | 2 | 18 | 0 | 0 | 18 |
| coupResourcesResolve | 20 | 64.92 | 3.2458 | 3.9766 | 4.219 | 1 | 4 | 0 | 16 | 4 | 0 | 0 | 4 |
| coupArvnRedeployMandatory | 2 | 56.33 | 28.1659 | 29.3722 | 29.3722 | 11.5 | 1 | 0 | 1 | 1 | 0 | 0 | 1 |
| coupCommitmentResolve | 8 | 33.04 | 4.1294 | 6.357 | 6.357 | 2 | 0 | 0 | 8 | 0 | 0 | 0 | 0 |
| event-decision:chooseOne | 36 | 31.55 | 0.8764 | 0.6203 | 29.1925 | 3.9444 | 0 | 1 | 1 | 0 | 0 | 0 | 0 |
| ambushNva | 5 | 27.76 | 5.5518 | 8.8251 | 8.8251 | 15.2 | 5 | 0 | 0 | 5 | 0 | 0 | 5 |
| rally:chooseNStep:add | 173 | 12.69 | 0.0733 | 0.1023 | 0.8476 | 20.422 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseNStep:confirm | 218 | 7.62 | 0.0349 | 0.0717 | 0.1332 | 14.8165 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| pass | 2 | 6.51 | 3.2561 | 4.3369 | 4.3369 | 2.5 | 2 | 0 | 0 | 2 | 0 | 0 | 2 |
| rally:chooseOne | 176 | 6.51 | 0.037 | 0.0814 | 0.1824 | 1.3523 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| resolveHonoluluPacify | 3 | 5.91 | 1.9697 | 2.5741 | 2.5741 | 1 | 3 | 0 | 0 | 3 | 0 | 0 | 3 |
| advise:chooseNStep:add | 38 | 4 | 0.1052 | 0.7091 | 0.8249 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:confirm | 90 | 3.66 | 0.0406 | 0.072 | 0.1103 | 5.0778 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:add | 57 | 3.4 | 0.0597 | 0.1099 | 0.1425 | 11.4912 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseOne | 76 | 3.25 | 0.0427 | 0.0926 | 0.1406 | 2.4474 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseNStep:confirm | 83 | 2.99 | 0.0361 | 0.055 | 0.1783 | 6.253 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:confirm | 38 | 2.61 | 0.0686 | 0.0945 | 0.8946 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:add | 33 | 2.05 | 0.0621 | 0.055 | 0.6259 | 3.6061 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseOne | 56 | 1.96 | 0.0349 | 0.06 | 0.1577 | 1.625 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupNvaRedeployTroops:chooseOne | 42 | 1.86 | 0.0443 | 0.0633 | 0.0824 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:confirm | 50 | 1.59 | 0.0318 | 0.0519 | 0.1243 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:confirm | 47 | 1.48 | 0.0316 | 0.0645 | 0.1013 | 4.4255 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupCommitmentResolve:chooseNStep:confirm | 32 | 1.01 | 0.0316 | 0.0506 | 0.0563 | 9.25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:add | 12 | 0.52 | 0.043 | 0.0568 | 0.0568 | 3.5833 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| chooseNStep:chooseNStep:confirm | 10 | 0.42 | 0.0424 | 0.0542 | 0.0542 | 22.5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:confirm | 12 | 0.35 | 0.0291 | 0.0546 | 0.0546 | 4.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseOne | 11 | 0.3 | 0.027 | 0.0618 | 0.0618 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseOne | 5 | 0.16 | 0.0325 | 0.0445 | 0.0445 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseNStep:add | 3 | 0.14 | 0.0469 | 0.0569 | 0.0569 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseNStep:confirm | 3 | 0.08 | 0.0275 | 0.0323 | 0.0323 | 3.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Top Hot Axes In Slow-Tier Seeds

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.

| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms |
|---:|---|---|---:|---:|---:|---:|---:|
| 1 | train:chooseNStep:add | continuedDeepening | 33 | 53036.93 | 1607.1797 | 3353.0615 | 3399.2261 |
| 2 | coupArvnRedeployPolice:chooseOne | continuedDeepening | 52 | 40956.73 | 787.6295 | 2313.0726 | 2518.6232 |
| 3 | train:chooseNStep:confirm | continuedDeepening | 35 | 39043.38 | 1115.5251 | 3352.4164 | 3371.3041 |
| 4 | coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | 72 | 12450.59 | 172.9248 | 270.7884 | 330.0447 |
| 5 | govern:chooseNStep:confirm | continuedDeepening | 25 | 11686.55 | 467.462 | 283.9179 | 8209.6753 |
| 6 | govern:chooseNStep:add | continuedDeepening | 35 | 11106.81 | 317.3374 | 378.6647 | 4836.2098 |
| 7 | event | singlePass | 95 | 8484.02 | 89.3055 | 163.5323 | 3391.481 |
| 8 | transport:chooseOne | continuedDeepening | 10 | 2643.13 | 264.3132 | 805.7999 | 805.7999 |
| 9 | coupArvnRedeployMandatory:chooseOne | continuedDeepening | 12 | 2527.63 | 210.6356 | 301.1156 | 301.1156 |
| 10 | govern | singlePass | 32 | 2225.16 | 69.5364 | 108.5166 | 633.0877 |

## Fast-Tier vs Slow-Tier Delta

Fast tier: `1000`, `1006`, `1007`, `1010`, `1014`. Rows with ratio greater than `3.0` satisfy the Phase 0 hot-axis criterion.

| Microturn class | Slow decisions | Fast decisions | Slow mean ms | Fast mean ms | Slow:fast ratio | Verdict |
|---|---:|---:|---:|---:|---:|---|
| train:chooseNStep:confirm | 49 | 6 | 796.8409 | 0.0938 | 8495.1055 | hot axis |
| train:chooseNStep:add | 33 | 6 | 1607.1797 | 350.314 | 4.5878 | hot axis |
| advise:chooseNStep:confirm | 8 | 15 | 0.1559 | 0.0447 | 3.4877 | hot axis |
| train | 17 | 3 | 26.1244 | 12.384 | 2.1095 |  |
| pass | 1 | 1 | 4.3369 | 2.1752 | 1.9938 |  |
| govern:chooseNStep:confirm | 30 | 35 | 389.5665 | 202.2474 | 1.9262 |  |
| coupArvnRedeployPolice:chooseOne | 52 | 50 | 787.6295 | 424.6555 | 1.8547 |  |
| govern:chooseOne | 37 | 35 | 57.4498 | 32.225 | 1.7828 |  |
| coupNvaRedeployTroops | 7 | 1 | 5.7991 | 3.2743 | 1.7711 |  |
| advise:chooseNStep:add | 8 | 15 | 0.1682 | 0.1062 | 1.5838 |  |
| govern:chooseNStep:add | 35 | 35 | 317.3374 | 214.9964 | 1.476 |  |
| advise:chooseOne | 16 | 30 | 0.0557 | 0.0393 | 1.4173 |  |
| ambushVc:chooseNStep:confirm | 5 | 3 | 0.0347 | 0.0255 | 1.3608 |  |
| coupCommitmentResolve | 2 | 3 | 5.0293 | 3.7423 | 1.3439 |  |
| assault | 8 | 9 | 8.0004 | 6.2192 | 1.2864 |  |
| transport | 5 | 3 | 68.6273 | 54.9792 | 1.2482 |  |
| advise | 8 | 15 | 9.5927 | 7.7634 | 1.2356 |  |
| govern | 32 | 35 | 69.5364 | 56.5237 | 1.2302 |  |
| coupPacifyARVN | 8 | 8 | 10.3392 | 8.531 | 1.212 |  |
| chooseNStep:chooseNStep:confirm | 4 | 3 | 0.0442 | 0.0378 | 1.1693 |  |
| ambushVc:chooseOne | 5 | 4 | 0.0297 | 0.0256 | 1.1602 |  |
| coupRedeployPass | 28 | 24 | 7.1622 | 6.2564 | 1.1448 |  |
| march:chooseNStep:add | 21 | 22 | 0.0638 | 0.0561 | 1.1373 |  |
| coupCommitmentResolve:chooseNStep:confirm | 8 | 12 | 0.0333 | 0.0308 | 1.0812 |  |
| coupResourcesResolve | 7 | 6 | 3.4271 | 3.2303 | 1.0609 |  |
| coupCommitmentPass | 28 | 24 | 3.0174 | 2.8455 | 1.0604 |  |
| coupArvnRedeployPolice | 27 | 32 | 22.4218 | 21.3264 | 1.0514 |  |
| coupVictoryCheck | 7 | 6 | 3.3233 | 3.2823 | 1.0125 |  |
| coupArvnRedeployOptionalTroops | 31 | 25 | 23.9898 | 23.7016 | 1.0122 |  |
| attack | 6 | 8 | 11.0831 | 11.0387 | 1.004 |  |
| coupArvnRedeployOptionalTroops:chooseOne | 72 | 60 | 172.9248 | 173.6119 | 0.996 |  |
| march | 15 | 13 | 5.8877 | 5.9233 | 0.994 |  |
| coupPacifyUS | 25 | 26 | 5.7859 | 5.8632 | 0.9868 |  |
| event-decision:chooseNStep:confirm | 43 | 26 | 0.0365 | 0.0371 | 0.9838 |  |
| event | 95 | 78 | 89.3055 | 91.1164 | 0.9801 |  |
| rally:chooseNStep:confirm | 73 | 73 | 0.036 | 0.0377 | 0.9549 |  |
| rally:chooseOne | 64 | 57 | 0.0376 | 0.0396 | 0.9495 |  |
| coupAgitatePass | 7 | 6 | 3.2702 | 3.5838 | 0.9125 |  |
| infiltrate | 10 | 8 | 8.4976 | 9.4925 | 0.8952 |  |
| ambushVc:chooseNStep:add | 5 | 3 | 0.0428 | 0.0507 | 0.8442 |  |
| coupAgitateVC | 19 | 25 | 4.5354 | 5.3806 | 0.8429 |  |
| assault:chooseNStep:confirm | 16 | 13 | 0.0297 | 0.0359 | 0.8273 |  |
| march:chooseNStep:confirm | 34 | 29 | 0.0384 | 0.0473 | 0.8118 |  |
| infiltrate:chooseOne | 16 | 14 | 0.0328 | 0.041 | 0.8 |  |
| rally | 62 | 54 | 19.4408 | 24.3702 | 0.7977 |  |
| coupPacifyPass | 14 | 12 | 3.5408 | 4.5062 | 0.7858 |  |
| rally:chooseNStep:add | 63 | 56 | 0.065 | 0.0847 | 0.7674 |  |
| infiltrate:chooseNStep:confirm | 15 | 12 | 0.0297 | 0.0415 | 0.7157 |  |
| train:chooseOne | 29 | 6 | 32.1961 | 45.9869 | 0.7001 |  |
| chooseOne:chooseOne | 11 | 8 | 8.372 | 12.2957 | 0.6809 |  |
| ambushVc | 5 | 4 | 9.8391 | 16.154 | 0.6091 |  |
| coupNvaRedeployTroops:chooseOne | 19 | 2 | 0.0377 | 0.0649 | 0.5809 |  |
| transport:chooseOne | 10 | 6 | 264.3132 | 486.5895 | 0.5432 |  |
| infiltrate:chooseNStep:add | 10 | 8 | 0.045 | 0.1174 | 0.3833 |  |
| event-decision:chooseOne | 13 | 6 | 0.0476 | 0.1602 | 0.2971 |  |
| event-decision:chooseNStep:add | 43 | 29 | 0.0546 | 27.9467 | 0.002 |  |
| assault:chooseOne | 2 | 5 | 0.0456 | 233.6987 | 0.0002 |  |
| assault:chooseNStep:add | 8 | 7 | 0.061 | 617.0465 | 0.0001 |  |

## Notes

- `elapsedMs` is measured around the per-decision `PolicyAgent.chooseDecision` call. It excludes simulator apply/delta work and report rendering.
- Child processes enforce the per-seed timeout. Each child loads the built engine and production FITL GameSpecDoc, using the repo GameDef cache when available.
- The script does not modify engine source or production profile data.
