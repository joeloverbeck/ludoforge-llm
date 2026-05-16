# FITL ARVN 15-Seed Per-Microturn-Class Decomposition

**Status**: ✅ EXPLOITED — referenced during spec 174 implementation (archived 2026-05-16).

**Date**: 2026-05-16-post-174-011
**Status**: Spec 173 measurement witness.
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 400000 --date 2026-05-16-post-174-011 --profile-buckets`
**CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-post-174-011.csv`

## Summary

- Seeds completed: 15/15
- Per-decision rows: 6381
- Hot class with slow:fast ratio >3x: yes
- Per-seed timeout: 400000 ms
- Hot-path buckets: enabled
- WASM production preview-drive route count: 181
- WASM production preview-drive unsupported count: 3394
- WASM production preview-drive batch count: 1712

## Per-Seed Wall Time

| Seed | Status | Stop Reason | Wall ms | Decisions | ms/decision | Error |
|---:|---|---|---:|---:|---:|---|
| 1000 | OK | terminal | 68941.29 | 427 | 161.455 |  |
| 1001 | OK | terminal | 7519.59 | 177 | 42.4836 |  |
| 1002 | OK | terminal | 14224.44 | 299 | 47.5734 |  |
| 1003 | OK | terminal | 8314.48 | 210 | 39.5928 |  |
| 1004 | OK | terminal | 18887.95 | 476 | 39.6806 |  |
| 1005 | OK | terminal | 105568.95 | 790 | 133.6316 |  |
| 1006 | OK | noLegalMoves | 7993.99 | 231 | 34.606 |  |
| 1007 | OK | terminal | 13929.42 | 290 | 48.0325 |  |
| 1008 | OK | terminal | 62042.2 | 679 | 91.3729 |  |
| 1009 | OK | terminal | 15191.22 | 296 | 51.3217 |  |
| 1010 | OK | terminal | 38306.47 | 582 | 65.8187 |  |
| 1011 | OK | terminal | 73940.56 | 473 | 156.3225 |  |
| 1012 | OK | terminal | 103296.1 | 823 | 125.5117 |  |
| 1013 | OK | terminal | 9894.41 | 265 | 37.3374 |  |
| 1014 | OK | noLegalMoves | 46435.88 | 363 | 127.9225 |  |

## Per-Microturn-Class Rollup

| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | WASM preview-drive routes | WASM preview-drive unsupported | WASM preview-drive batches | Token index builds | Static rebuilds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| coupArvnRedeployPolice:chooseOne | 617 | 275891.21 | 447.1494 | 2224.7731 | 3029.5032 | 29.3906 | 0 | 427381 | 15311 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| govern:chooseNStep:add | 133 | 41476.26 | 311.8516 | 600.7179 | 4488.9377 | 6.0376 | 0 | 4329 | 6126 | 0 | 0 | 0 | 759 | 0 | 0 | 0 |
| govern:chooseNStep:confirm | 111 | 39709.11 | 357.7398 | 448.1075 | 7486.4068 | 6.3784 | 0 | 2231 | 1017 | 0 | 0 | 0 | 464 | 0 | 0 | 0 |
| event | 404 | 36986.63 | 91.5511 | 167.9989 | 3949.5028 | 24.2327 | 404 | 0 | 0 | 404 | 354 | 0 | 457 | 0 | 39 | 434 |
| coupArvnRedeployOptionalTroops:chooseOne | 405 | 33752.67 | 83.3399 | 212.0322 | 289.6378 | 8.2667 | 0 | 37399 | 5200 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| train:chooseNStep:add | 15 | 27902.19 | 1860.1463 | 3541.6615 | 3541.6615 | 16.0667 | 0 | 11519 | 15743 | 0 | 0 | 2 | 227 | 0 | 572 | 0 |
| train:chooseNStep:confirm | 21 | 18507.09 | 881.2901 | 3159.9722 | 3574.858 | 9.2857 | 0 | 7263 | 9876 | 0 | 0 | 12 | 147 | 0 | 536 | 0 |
| govern | 118 | 9815.43 | 83.1816 | 198.052 | 2266.7404 | 10.2797 | 115 | 0 | 3 | 115 | 104 | 0 | 176 | 30 | 0 | 115 |
| rally | 183 | 5731.85 | 31.3216 | 55.4485 | 531.536 | 22.3443 | 174 | 0 | 9 | 174 | 52 | 0 | 338 | 14 | 10 | 174 |
| assault:chooseNStep:add | 59 | 4114.93 | 69.7446 | 259.0072 | 941.7495 | 2.4576 | 0 | 284 | 222 | 0 | 0 | 16 | 57 | 0 | 479 | 0 |
| chooseNStep:chooseNStep:add | 6 | 3856.08 | 642.6796 | 973.0434 | 973.0434 | 22 | 0 | 254 | 928 | 0 | 0 | 44 | 42 | 0 | 1701 | 0 |
| coupArvnRedeployMandatory:chooseOne | 49 | 3824.45 | 78.0501 | 137.5867 | 152.8133 | 8 | 0 | 5271 | 753 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseNStep:add | 157 | 3136.3 | 19.9764 | 231.6332 | 486.4473 | 17.4713 | 0 | 294 | 1341 | 0 | 0 | 81 | 9 | 0 | 2001 | 0 |
| transport:chooseOne | 34 | 3049.31 | 89.6856 | 173.4385 | 348.8879 | 15.2941 | 0 | 1898 | 81 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| sweep:chooseNStep:confirm | 3 | 3028.88 | 1009.6264 | 1891.4084 | 1891.4084 | 7.6667 | 0 | 557 | 346 | 0 | 0 | 19 | 0 | 0 | 1369 | 0 |
| assault:chooseNStep:confirm | 93 | 2306.35 | 24.7995 | 62.7615 | 1242.8834 | 2.3226 | 0 | 100 | 75 | 0 | 0 | 0 | 30 | 0 | 36 | 0 |
| sweep:chooseNStep:add | 1 | 1480.25 | 1480.2502 | 1480.2502 | 1480.2502 | 7 | 0 | 328 | 162 | 0 | 0 | 7 | 0 | 0 | 1040 | 0 |
| transport | 17 | 1450.12 | 85.3009 | 508.1213 | 508.1213 | 10.4118 | 17 | 0 | 0 | 17 | 0 | 0 | 34 | 0 | 0 | 17 |
| coupArvnRedeployPolice | 369 | 731.18 | 1.9815 | 2.8865 | 3.6719 | 6.832 | 369 | 0 | 0 | 369 | 0 | 0 | 330 | 369 | 0 | 369 |
| train | 7 | 509.18 | 72.7398 | 180.4857 | 180.4857 | 8.8571 | 7 | 0 | 0 | 7 | 0 | 0 | 14 | 0 | 0 | 7 |
| govern:chooseOne | 140 | 483.27 | 3.4519 | 5.1726 | 10.0414 | 2 | 0 | 184 | 184 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupArvnRedeployOptionalTroops | 125 | 334.63 | 2.6771 | 3.7436 | 4.8469 | 15.016 | 94 | 0 | 31 | 94 | 0 | 0 | 88 | 125 | 0 | 94 |
| assault | 131 | 318.48 | 2.4311 | 3.7702 | 8.726 | 8.5649 | 112 | 0 | 19 | 112 | 0 | 0 | 71 | 131 | 0 | 112 |
| coupRedeployPass | 156 | 287.58 | 1.8435 | 2.8187 | 3.9857 | 1 | 85 | 0 | 71 | 85 | 0 | 0 | 0 | 156 | 0 | 85 |
| infiltrate | 54 | 268.3 | 4.9685 | 8.2086 | 10.462 | 51.6481 | 35 | 0 | 19 | 35 | 0 | 0 | 0 | 54 | 0 | 35 |
| coupPacifyARVN | 122 | 267.28 | 2.1908 | 3.1247 | 5.4899 | 4.541 | 94 | 0 | 28 | 94 | 0 | 0 | 84 | 122 | 0 | 94 |
| ambushVc | 76 | 261.44 | 3.4399 | 6.3685 | 8.7471 | 40.5263 | 65 | 0 | 11 | 65 | 0 | 0 | 0 | 76 | 0 | 65 |
| coupCommitmentPass | 156 | 234.12 | 1.5007 | 2.3596 | 3.2947 | 1.25 | 0 | 0 | 156 | 0 | 0 | 0 | 0 | 156 | 0 | 0 |
| march | 65 | 218.22 | 3.3572 | 4.9314 | 6.6914 | 21.4462 | 52 | 0 | 13 | 52 | 0 | 0 | 0 | 65 | 0 | 52 |
| advise | 57 | 181.95 | 3.1922 | 6.896 | 7.8041 | 11.0877 | 47 | 0 | 10 | 47 | 0 | 0 | 0 | 57 | 0 | 47 |
| coupPacifyPass | 78 | 179.83 | 2.3055 | 3.5299 | 3.7766 | 1.5769 | 67 | 0 | 11 | 67 | 0 | 0 | 0 | 78 | 0 | 67 |
| coupNvaRedeployTroops | 72 | 147.21 | 2.0447 | 3.876 | 5.1481 | 3.7222 | 50 | 0 | 22 | 50 | 0 | 0 | 50 | 72 | 0 | 50 |
| train:chooseOne | 13 | 105.99 | 8.1527 | 13.1189 | 13.1189 | 2.2308 | 0 | 44 | 49 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupVictoryCheck | 41 | 94.49 | 2.3046 | 3.431 | 4.061 | 1 | 41 | 0 | 0 | 41 | 0 | 0 | 0 | 41 | 0 | 41 |
| attack | 30 | 93.79 | 3.1264 | 5.912 | 8.3925 | 32.8667 | 23 | 0 | 7 | 23 | 0 | 0 | 0 | 30 | 0 | 23 |
| assault:chooseOne | 27 | 85.19 | 3.1551 | 7.4265 | 19.1421 | 2 | 0 | 18 | 20 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupResourcesResolve | 39 | 84.49 | 2.1664 | 3.2946 | 3.93 | 1 | 0 | 0 | 39 | 0 | 0 | 0 | 0 | 39 | 0 | 0 |
| pass | 23 | 64.81 | 2.818 | 4.7693 | 4.8206 | 3.8261 | 21 | 0 | 2 | 21 | 0 | 0 | 4 | 23 | 0 | 21 |
| coupAgitatePass | 39 | 63.97 | 1.6403 | 2.4092 | 2.7621 | 4.641 | 0 | 0 | 39 | 0 | 0 | 0 | 0 | 39 | 0 | 0 |
| ambushNva | 7 | 55.69 | 7.9558 | 27.7135 | 27.7135 | 60.2857 | 5 | 0 | 2 | 5 | 0 | 0 | 1 | 6 | 0 | 5 |
| bombard | 6 | 43.85 | 7.3079 | 8.841 | 8.841 | 122.3333 | 6 | 0 | 0 | 6 | 0 | 0 | 0 | 6 | 0 | 6 |
| coupArvnRedeployMandatory | 11 | 24.81 | 2.2558 | 3.5677 | 3.5677 | 10.2727 | 3 | 0 | 8 | 3 | 0 | 0 | 3 | 11 | 0 | 3 |
| chooseOne:chooseOne | 32 | 23.85 | 0.7453 | 6.3686 | 7.8699 | 5.75 | 0 | 9 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| nvaTransferResources | 4 | 13.17 | 3.2931 | 4.0145 | 4.0145 | 47 | 4 | 0 | 0 | 4 | 0 | 0 | 4 | 4 | 0 | 4 |
| rally:chooseNStep:add | 186 | 11.03 | 0.0593 | 0.0795 | 0.6101 | 22.129 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupNvaRedeployTroops:chooseOne | 263 | 9.94 | 0.0378 | 0.057 | 0.0899 | 3.981 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseNStep:confirm | 251 | 9.51 | 0.0379 | 0.0601 | 1.1772 | 17.243 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| resolveHonoluluPacify | 5 | 8.44 | 1.6886 | 1.8058 | 1.8058 | 1 | 5 | 0 | 0 | 5 | 0 | 0 | 5 | 5 | 0 | 5 |
| airStrike | 2 | 6.35 | 3.1739 | 4.142 | 4.142 | 2 | 2 | 0 | 0 | 2 | 0 | 0 | 0 | 2 | 0 | 2 |
| rally:chooseOne | 190 | 6.11 | 0.0322 | 0.078 | 0.1513 | 1.3474 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseOne | 105 | 5.34 | 0.0509 | 0.0763 | 0.8641 | 3.8381 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:add | 73 | 5.1 | 0.0699 | 0.1936 | 0.8842 | 3.6849 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:confirm | 149 | 4.96 | 0.0333 | 0.0576 | 0.1352 | 5.5436 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:add | 57 | 4.91 | 0.0862 | 0.2228 | 0.7203 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:add | 82 | 4.66 | 0.0568 | 0.0895 | 0.0985 | 15.6098 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseNStep:confirm | 129 | 4.6 | 0.0357 | 0.0592 | 0.1666 | 7.7519 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseOne | 115 | 4.39 | 0.0382 | 0.0665 | 0.1463 | 2.4522 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:add | 54 | 2.88 | 0.0533 | 0.0651 | 0.591 | 3.9259 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseOne | 84 | 2.58 | 0.0307 | 0.0459 | 0.1536 | 1.5833 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:confirm | 57 | 2.38 | 0.0417 | 0.0791 | 0.093 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:confirm | 81 | 2.26 | 0.0279 | 0.0435 | 0.0623 | 4.6173 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:confirm | 73 | 2.13 | 0.0292 | 0.0557 | 0.1049 | 4.6438 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseOne | 76 | 2.07 | 0.0273 | 0.0837 | 0.1127 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| sweep | 1 | 2.03 | 2.0319 | 2.0319 | 2.0319 | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 1 | 0 | 0 |
| chooseNStep:chooseNStep:confirm | 16 | 0.68 | 0.0427 | 0.0737 | 0.0737 | 15.125 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseOne | 7 | 0.22 | 0.0316 | 0.039 | 0.039 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| bombard:chooseNStep:add | 4 | 0.17 | 0.0432 | 0.0469 | 0.0469 | 7.75 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| bombard:chooseOne | 5 | 0.15 | 0.0298 | 0.0321 | 0.0321 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| airStrike:chooseOne | 2 | 0.11 | 0.0537 | 0.0749 | 0.0749 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| airStrike:chooseNStep:confirm | 2 | 0.09 | 0.0433 | 0.0547 | 0.0547 | 12.5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| bombard:chooseNStep:confirm | 4 | 0.09 | 0.0232 | 0.027 | 0.027 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseNStep:add | 1 | 0.04 | 0.0408 | 0.0408 | 0.0408 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseNStep:confirm | 1 | 0.02 | 0.0235 | 0.0235 | 0.0235 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Top Hot Axes In Slow-Tier Seeds

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.

| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms |
|---:|---|---|---:|---:|---:|---:|---:|
| 1 | coupArvnRedeployPolice:chooseOne | continuedDeepening | 236 | 130063.31 | 551.1157 | 2382.5592 | 2910.2224 |
| 2 | govern:chooseNStep:confirm | continuedDeepening | 27 | 19231.9 | 712.2928 | 6648.1511 | 7486.4068 |
| 3 | train:chooseNStep:add | continuedDeepening | 11 | 17483.3 | 1589.3912 | 3506.4049 | 3506.4049 |
| 4 | event | singlePass | 161 | 14733.27 | 91.511 | 327.6127 | 3140.0466 |
| 5 | coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | 158 | 14092.57 | 89.1935 | 212.0322 | 256.5972 |
| 6 | govern:chooseNStep:add | continuedDeepening | 45 | 13958.69 | 310.1931 | 373.1553 | 3138.6036 |
| 7 | train:chooseNStep:confirm | continuedDeepening | 12 | 11656.03 | 971.3355 | 3125.762 | 3125.762 |
| 8 | govern | singlePass | 31 | 3397.06 | 109.5826 | 553.9789 | 614.4303 |
| 9 | rally | singlePass | 62 | 2450.16 | 39.5188 | 68.1328 | 531.536 |
| 10 | event-decision:chooseNStep:add | continuedDeepening | 8 | 2142.66 | 267.8323 | 486.4473 | 486.4473 |

## Hot-Path Buckets For Top Slow Axes

Captured only when `--profile-buckets` is enabled. Buckets are timing/count diagnostics inside `PolicyAgent.chooseDecision`; they are not correctness assertions.

### coupArvnRedeployPolice:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 5033698 | 23349.84 |
| evalQuery:countMatchingTokens | 5438222 | 8623.86 |
| zobrist:digestDecisionStackFrame | 2760 | 152.06 |
| zobrist:encodeDecisionStackFrame | 2760 | 139.06 |
| evalQuery:applyTokenFilterCacheHit | 396588 | 0 |
| evalQuery:countMatchingTokensCacheHit | 127279270 | 0 |
| evalQuery:countMatchingTokensCompiled | 5438222 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 388864129 | 0 |
| tokenStateIndex:getCacheHit | 5033698 | 0 |
| zobrist:decisionStackFrameEncodedChars | 18395142 | 0 |
| zobrist:decisionStackFrameRunLocalCacheMiss | 2760 | 0 |

### govern:chooseNStep:confirm | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 55244 | 876.73 |
| evalQuery:applyTokenFilter | 375925 | 680.67 |
| evalQuery:countMatchingTokens | 58858 | 56.41 |
| zobrist:encodeDecisionStackFrame | 1240 | 49.82 |
| zobrist:digestDecisionStackFrame | 768 | 39.29 |
| evalQuery:applyTokenFilterCacheHit | 24750 | 0 |
| evalQuery:applyTokenFilterCompiled | 374035 | 0 |
| evalQuery:countMatchingTokensCacheHit | 2328454 | 0 |
| evalQuery:countMatchingTokensCompiled | 15430 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 5335342 | 0 |
| tokenStateIndex:getCacheHit | 396340 | 0 |
| zobrist:decisionStackFrameEncodedChars | 4871612 | 0 |

### train:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 20128 | 3520.64 |
| zobrist:encodeDecisionStackFrame | 21059 | 2063.21 |
| tokenStateIndex:refreshCachedEntries | 19885 | 373.98 |
| evalQuery:applyTokenFilter | 8906 | 29.35 |
| evalQuery:countMatchingTokens | 11727 | 23.76 |
| tokenStateIndex:build | 388 | 12.87 |
| evalQuery:applyTokenFilterCacheHit | 20424 | 0 |
| evalQuery:applyTokenFilterCompiled | 8906 | 0 |
| evalQuery:countMatchingTokensCacheHit | 2010742 | 0 |
| evalQuery:countMatchingTokensCompiled | 11727 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 5421379 | 0 |
| tokenStateIndex:getCacheHit | 29600 | 0 |

### event | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 67396 | 899.02 |
| evalQuery:applyTokenFilter | 153416 | 464.38 |
| zobrist:digestDecisionStackFrame | 1616 | 290.64 |
| zobrist:encodeDecisionStackFrame | 1616 | 183.54 |
| evalQuery:countMatchingTokens | 192736 | 138.13 |
| policyWasmRuntime:encodeBytecodeInput | 1664 | 49.89 |
| tokenStateIndex:build | 19 | 0.69 |
| evalQuery:applyTokenFilterCacheHit | 26415 | 0 |
| evalQuery:applyTokenFilterCompiled | 117635 | 0 |
| evalQuery:countMatchingTokensCacheHit | 2402280 | 0 |
| evalQuery:countMatchingTokensCompiled | 38640 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 5043580 | 0 |

### coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 449214 | 2126.16 |
| evalQuery:countMatchingTokens | 564266 | 691.17 |
| zobrist:digestDecisionStackFrame | 848 | 37.36 |
| zobrist:encodeDecisionStackFrame | 848 | 35.85 |
| evalQuery:applyTokenFilterCacheHit | 33368 | 0 |
| evalQuery:countMatchingTokensCacheHit | 17719717 | 0 |
| evalQuery:countMatchingTokensCompiled | 564266 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 40968401 | 0 |
| tokenStateIndex:getCacheHit | 449214 | 0 |
| zobrist:decisionStackFrameEncodedChars | 4511286 | 0 |
| zobrist:decisionStackFrameRunLocalCacheMiss | 848 | 0 |

### govern:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 33053 | 491.34 |
| evalQuery:applyTokenFilter | 163743 | 298.72 |
| zobrist:encodeDecisionStackFrame | 5880 | 220.16 |
| zobrist:digestDecisionStackFrame | 4640 | 212.79 |
| evalQuery:countMatchingTokens | 32009 | 32.01 |
| evalQuery:applyTokenFilterCacheHit | 14334 | 0 |
| evalQuery:applyTokenFilterCompiled | 163023 | 0 |
| evalQuery:countMatchingTokensCacheHit | 2099635 | 0 |
| evalQuery:countMatchingTokensCompiled | 15465 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 4815503 | 0 |
| tokenStateIndex:getCacheHit | 173890 | 0 |
| zobrist:decisionStackFrameEncodedChars | 26183445 | 0 |

### train:chooseNStep:confirm | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 12646 | 2275.78 |
| zobrist:encodeDecisionStackFrame | 13628 | 1381.12 |
| tokenStateIndex:refreshCachedEntries | 14324 | 286.85 |
| evalQuery:applyTokenFilter | 4528 | 17.01 |
| evalQuery:countMatchingTokens | 6232 | 13.83 |
| tokenStateIndex:build | 386 | 13.02 |
| evalQuery:applyTokenFilterCacheHit | 20714 | 0 |
| evalQuery:applyTokenFilterCompiled | 4528 | 0 |
| evalQuery:countMatchingTokensCacheHit | 1690423 | 0 |
| evalQuery:countMatchingTokensCompiled | 6232 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 4573840 | 0 |
| tokenStateIndex:getCacheHit | 20141 | 0 |

### govern | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 6313 | 115.92 |
| evalQuery:applyTokenFilter | 36038 | 105.13 |
| zobrist:digestDecisionStackFrame | 708 | 76.29 |
| zobrist:encodeDecisionStackFrame | 708 | 51.89 |
| evalQuery:countMatchingTokens | 12416 | 12.7 |
| policyWasmRuntime:encodeBytecodeInput | 248 | 6.41 |
| evalQuery:applyTokenFilterCacheHit | 17709 | 0 |
| evalQuery:applyTokenFilterCompiled | 30088 | 0 |
| evalQuery:countMatchingTokensCacheHit | 626069 | 0 |
| evalQuery:countMatchingTokensCompiled | 2452 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1117084 | 0 |
| policyWasmRuntime:encodedInputCacheMiss | 248 | 0 |

### rally | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 9833 | 130.23 |
| evalQuery:applyTokenFilter | 20386 | 75.08 |
| evalQuery:countMatchingTokens | 26990 | 29.52 |
| zobrist:digestDecisionStackFrame | 352 | 26.47 |
| zobrist:encodeDecisionStackFrame | 352 | 19.46 |
| policyWasmRuntime:encodeBytecodeInput | 248 | 14.34 |
| tokenStateIndex:build | 4 | 0.1 |
| evalQuery:applyTokenFilterCacheHit | 6016 | 0 |
| evalQuery:applyTokenFilterCompiled | 19224 | 0 |
| evalQuery:countMatchingTokensCacheHit | 922763 | 0 |
| evalQuery:countMatchingTokensCompiled | 9458 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 2159203 | 0 |

### event-decision:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 19257 | 200.78 |
| zobrist:digestDecisionStackFrame | 1936 | 56.93 |
| zobrist:encodeDecisionStackFrame | 2132 | 43.38 |
| tokenStateIndex:build | 1409 | 33.85 |
| evalQuery:applyTokenFilter | 4650 | 16.27 |
| evalQuery:countMatchingTokens | 4081 | 3.22 |
| evalQuery:applyTokenFilterCacheHit | 1728 | 0 |
| evalQuery:applyTokenFilterCompiled | 4650 | 0 |
| evalQuery:countMatchingTokensCacheHit | 1306625 | 0 |
| evalQuery:countMatchingTokensCompiled | 4081 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 2551266 | 0 |
| tokenStateIndex:getCacheHit | 35657 | 0 |


## Fast-Tier vs Slow-Tier Delta

Fast tier: `1000`, `1006`, `1007`, `1010`, `1014`. Rows with ratio greater than `3.0` satisfy the Phase 0 hot-axis criterion.

| Microturn class | Slow decisions | Fast decisions | Slow mean ms | Fast mean ms | Slow:fast ratio | Verdict |
|---|---:|---:|---:|---:|---:|---|
| assault:chooseNStep:confirm | 27 | 27 | 60.8276 | 5.825 | 10.4425 | hot axis |
| ambushNva | 2 | 4 | 17.7453 | 3.951 | 4.4913 | hot axis |
| airStrike:chooseOne | 1 | 1 | 0.0749 | 0.0325 | 2.3046 |  |
| assault:chooseNStep:add | 15 | 16 | 103.0729 | 46.9772 | 2.1941 |  |
| bombard | 4 | 1 | 8.2553 | 4.0512 | 2.0377 |  |
| govern:chooseNStep:confirm | 36 | 32 | 534.2412 | 269.3875 | 1.9832 |  |
| airStrike | 1 | 1 | 4.142 | 2.2058 | 1.8778 |  |
| airStrike:chooseNStep:confirm | 1 | 1 | 0.0547 | 0.0319 | 1.7147 |  |
| attack | 20 | 4 | 3.4488 | 2.1772 | 1.5841 |  |
| rally:chooseNStep:confirm | 84 | 85 | 0.05 | 0.0324 | 1.5432 |  |
| advise | 19 | 21 | 3.5005 | 2.9179 | 1.1997 |  |
| rally | 68 | 60 | 36.286 | 30.6322 | 1.1846 |  |
| nvaTransferResources | 1 | 1 | 2.8528 | 2.4368 | 1.1707 |  |
| coupArvnRedeployPolice:chooseOne | 236 | 197 | 551.1157 | 479.076 | 1.1504 |  |
| advise:chooseNStep:add | 19 | 21 | 0.0998 | 0.087 | 1.1471 |  |
| advise:chooseOne | 38 | 43 | 0.0423 | 0.0373 | 1.134 |  |
| march:chooseNStep:add | 27 | 31 | 0.0603 | 0.0541 | 1.1146 |  |
| event-decision:chooseNStep:add | 84 | 43 | 25.5405 | 23.0104 | 1.11 |  |
| event | 161 | 121 | 91.511 | 82.8045 | 1.1051 |  |
| coupResourcesResolve | 15 | 12 | 2.3219 | 2.1052 | 1.1029 |  |
| govern | 41 | 32 | 83.7948 | 76.2122 | 1.0995 |  |
| coupVictoryCheck | 15 | 14 | 2.4185 | 2.2016 | 1.0985 |  |
| govern:chooseOne | 50 | 33 | 3.488 | 3.2418 | 1.0759 |  |
| march | 21 | 22 | 3.3893 | 3.1659 | 1.0706 |  |
| coupArvnRedeployOptionalTroops:chooseOne | 158 | 117 | 89.1935 | 84.2907 | 1.0582 |  |
| advise:chooseNStep:confirm | 19 | 21 | 0.0438 | 0.0414 | 1.058 |  |
| rally:chooseOne | 71 | 63 | 0.0342 | 0.0331 | 1.0332 |  |
| event-decision:chooseNStep:confirm | 57 | 41 | 0.0375 | 0.0363 | 1.0331 |  |
| coupRedeployPass | 60 | 48 | 1.8822 | 1.882 | 1.0001 |  |
| infiltrate | 24 | 18 | 5.2929 | 5.3458 | 0.9901 |  |
| pass | 10 | 6 | 2.7356 | 2.7656 | 0.9892 |  |
| coupPacifyPass | 30 | 24 | 2.3332 | 2.3716 | 0.9838 |  |
| coupArvnRedeployPolice | 127 | 118 | 1.9741 | 2.0091 | 0.9826 |  |
| ambushVc:chooseNStep:confirm | 33 | 19 | 0.0272 | 0.0279 | 0.9749 |  |
| coupPacifyARVN | 44 | 38 | 2.1456 | 2.2188 | 0.967 |  |
| chooseNStep:chooseNStep:confirm | 7 | 4 | 0.0418 | 0.0435 | 0.9609 |  |
| resolveHonoluluPacify | 1 | 2 | 1.6203 | 1.6988 | 0.9538 |  |
| rally:chooseNStep:add | 69 | 62 | 0.0617 | 0.0647 | 0.9536 |  |
| ambushNva:chooseOne | 2 | 4 | 0.0305 | 0.032 | 0.9531 |  |
| coupCommitmentPass | 60 | 48 | 1.4641 | 1.5493 | 0.945 |  |
| march:chooseNStep:confirm | 48 | 49 | 0.0342 | 0.0366 | 0.9344 |  |
| coupNvaRedeployTroops:chooseOne | 138 | 17 | 0.0394 | 0.0422 | 0.9336 |  |
| coupAgitatePass | 15 | 12 | 1.574 | 1.7033 | 0.9241 |  |
| coupArvnRedeployOptionalTroops | 46 | 36 | 2.5539 | 2.7687 | 0.9224 |  |
| infiltrate:chooseNStep:confirm | 38 | 24 | 0.0271 | 0.0296 | 0.9155 |  |
| assault | 52 | 42 | 2.3203 | 2.5475 | 0.9108 |  |
| ambushVc | 33 | 22 | 3.2559 | 3.5763 | 0.9104 |  |
| infiltrate:chooseOne | 36 | 31 | 0.0296 | 0.0326 | 0.908 |  |
| transport | 6 | 8 | 54.2397 | 61.0773 | 0.8881 |  |
| coupNvaRedeployTroops | 39 | 6 | 2.0384 | 2.303 | 0.8851 |  |
| ambushVc:chooseOne | 33 | 22 | 0.024 | 0.0279 | 0.8602 |  |
| coupArvnRedeployMandatory:chooseOne | 11 | 26 | 69.1366 | 84.1589 | 0.8215 |  |
| event-decision:chooseOne | 58 | 24 | 0.0493 | 0.0611 | 0.8069 |  |
| coupArvnRedeployMandatory | 3 | 5 | 2.0444 | 2.5715 | 0.795 |  |
| transport:chooseOne | 12 | 16 | 74.2505 | 94.6379 | 0.7846 |  |
| govern:chooseNStep:add | 45 | 33 | 310.1931 | 420.7092 | 0.7373 |  |
| chooseOne:chooseOne | 12 | 9 | 0.6705 | 0.921 | 0.728 |  |
| infiltrate:chooseNStep:add | 24 | 18 | 0.0427 | 0.0752 | 0.5678 |  |
| assault:chooseOne | 7 | 11 | 1.9882 | 4.4417 | 0.4476 |  |
| ambushVc:chooseNStep:add | 33 | 19 | 0.0402 | 0.1202 | 0.3344 |  |

## Notes

- `elapsedMs` is measured around the per-decision `PolicyAgent.chooseDecision` call. It excludes simulator apply/delta work and report rendering.
- Child processes enforce the per-seed timeout. Each child loads the built engine and production FITL GameSpecDoc, using the repo GameDef cache when available.
- The script does not modify engine source or production profile data.
