# FITL ARVN 15-Seed Per-Microturn-Class Decomposition

**Status**: ✅ EXPLOITED — referenced during spec 174 implementation (archived 2026-05-16).

**Date**: 2026-05-15-post-006-choosen-preview-no-entry-hash
**Status**: Spec 173 measurement witness.
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 400000 --date 2026-05-15-post-006-choosen-preview-no-entry-hash --profile-buckets`
**CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-006-choosen-preview-no-entry-hash.csv`

## Summary

- Seeds completed: 15/15
- Per-decision rows: 3741
- Hot class with slow:fast ratio >3x: yes
- Per-seed timeout: 400000 ms
- Hot-path buckets: enabled

## Per-Seed Wall Time

| Seed | Status | Stop Reason | Wall ms | Decisions | ms/decision | Error |
|---:|---|---|---:|---:|---:|---|
| 1000 | OK | terminal | 7145.13 | 159 | 44.9379 |  |
| 1001 | OK | terminal | 15598 | 194 | 80.4021 |  |
| 1002 | OK | terminal | 19981.86 | 288 | 69.3815 |  |
| 1003 | OK | terminal | 16533.79 | 226 | 73.1584 |  |
| 1004 | OK | terminal | 25528.7 | 338 | 75.5287 |  |
| 1005 | OK | terminal | 72072.03 | 412 | 174.9321 |  |
| 1006 | OK | terminal | 10994.19 | 228 | 48.2201 |  |
| 1007 | OK | terminal | 8138.07 | 218 | 37.3306 |  |
| 1008 | OK | terminal | 28711.42 | 166 | 172.9604 |  |
| 1009 | OK | terminal | 27998.14 | 303 | 92.4031 |  |
| 1010 | OK | terminal | 19958.94 | 319 | 62.5672 |  |
| 1011 | OK | terminal | 27807.5 | 212 | 131.1675 |  |
| 1012 | OK | terminal | 28578.5 | 213 | 134.1714 |  |
| 1013 | OK | terminal | 24238.72 | 252 | 96.1854 |  |
| 1014 | OK | terminal | 19580.59 | 213 | 91.9277 |  |

## Per-Microturn-Class Rollup

| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | Token index builds | Static rebuilds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| train:chooseNStep:add | 62 | 90138.62 | 1453.8488 | 3268.1445 | 3898.1237 | 18.5 | 0 | 26647 | 56148 | 0 | 0 | 0 | 0 |
| train:chooseNStep:confirm | 94 | 52152.84 | 554.8174 | 3178.8854 | 3599.7936 | 7.0638 | 0 | 15975 | 34518 | 0 | 0 | 0 | 0 |
| coupArvnRedeployPolice:chooseOne | 145 | 44721.24 | 308.4223 | 1370.8734 | 1957.6535 | 30.7241 | 0 | 93582 | 3151 | 0 | 0 | 0 | 0 |
| govern:chooseNStep:add | 115 | 26556.04 | 230.9221 | 343.3159 | 5068.0091 | 6.687 | 0 | 3600 | 5625 | 0 | 0 | 0 | 0 |
| event | 245 | 26062.79 | 106.3787 | 118.8857 | 5958.3561 | 18.9224 | 245 | 0 | 0 | 245 | 234 | 38 | 275 |
| govern:chooseNStep:confirm | 102 | 23834.39 | 233.6704 | 377.6893 | 8514.068 | 6.8824 | 0 | 2336 | 1059 | 0 | 0 | 0 | 0 |
| coupArvnRedeployOptionalTroops:chooseOne | 204 | 10055.45 | 49.2914 | 175.5317 | 234.2801 | 8.4118 | 0 | 11928 | 1638 | 0 | 0 | 0 | 0 |
| govern | 104 | 6186.37 | 59.4843 | 96.3147 | 664.7534 | 10.7115 | 97 | 0 | 7 | 97 | 40 | 0 | 97 |
| assault:chooseNStep:add | 26 | 4534.71 | 174.4119 | 73.2737 | 4460.2088 | 3.1538 | 0 | 18 | 4 | 0 | 0 | 0 | 0 |
| rally | 170 | 4063.16 | 23.9009 | 53.5654 | 166.3566 | 15.8882 | 148 | 0 | 22 | 148 | 101 | 0 | 148 |
| coupArvnRedeployOptionalTroops | 87 | 2178.15 | 25.0363 | 28.7612 | 30.3574 | 17.2874 | 70 | 0 | 17 | 70 | 0 | 0 | 70 |
| transport:chooseOne | 16 | 2074.79 | 129.6742 | 374.238 | 374.238 | 17.6875 | 0 | 1191 | 46 | 0 | 0 | 0 | 0 |
| coupArvnRedeployPolice | 84 | 1931.86 | 22.9983 | 25.6833 | 26.3497 | 11.7262 | 82 | 0 | 2 | 82 | 0 | 0 | 82 |
| coupArvnRedeployMandatory:chooseOne | 12 | 1100.45 | 91.7038 | 142.8696 | 142.8696 | 8 | 0 | 1428 | 204 | 0 | 0 | 0 | 0 |
| event-decision:chooseNStep:add | 93 | 1036.49 | 11.1451 | 89.6999 | 326.2973 | 12.129 | 0 | 112 | 360 | 0 | 0 | 0 | 0 |
| train | 33 | 829.66 | 25.1413 | 40.5751 | 68.4567 | 7.8485 | 32 | 0 | 1 | 32 | 92 | 0 | 32 |
| coupRedeployPass | 80 | 581.62 | 7.2703 | 23.1057 | 25.5156 | 2.975 | 31 | 0 | 49 | 31 | 15 | 0 | 31 |
| transport | 8 | 532.24 | 66.5304 | 114.8102 | 114.8102 | 11.25 | 8 | 0 | 0 | 8 | 0 | 0 | 8 |
| coupPacifyUS | 76 | 466.33 | 6.136 | 9.8272 | 12.9276 | 2.7763 | 76 | 0 | 0 | 76 | 0 | 0 | 76 |
| govern:chooseOne | 117 | 425.2 | 3.6342 | 5.6941 | 9.6282 | 2 | 0 | 143 | 143 | 0 | 0 | 0 | 0 |
| train:chooseOne | 58 | 409.48 | 7.06 | 11.2301 | 12.035 | 2.2759 | 0 | 166 | 198 | 0 | 0 | 0 | 0 |
| advise | 38 | 345.9 | 9.1027 | 16.3467 | 31.9362 | 11.4474 | 28 | 0 | 10 | 28 | 8 | 0 | 28 |
| infiltrate | 33 | 317.98 | 9.6356 | 16.3277 | 16.5534 | 41.5152 | 26 | 0 | 7 | 26 | 15 | 0 | 26 |
| coupAgitateVC | 60 | 317.85 | 5.2974 | 6.8922 | 7.4723 | 2.95 | 42 | 0 | 18 | 42 | 12 | 0 | 42 |
| coupPacifyARVN | 31 | 284.19 | 9.1673 | 14.4505 | 15.4129 | 3.9355 | 15 | 0 | 16 | 15 | 10 | 0 | 15 |
| march | 40 | 259.48 | 6.487 | 11.4685 | 15.5451 | 9.125 | 30 | 0 | 10 | 30 | 66 | 0 | 30 |
| coupCommitmentPass | 80 | 241.22 | 3.0152 | 4.2696 | 4.7485 | 1.15 | 8 | 0 | 72 | 8 | 0 | 0 | 8 |
| assault | 28 | 213.85 | 7.6376 | 10.1174 | 11.1046 | 4.8571 | 27 | 0 | 1 | 27 | 3 | 0 | 27 |
| coupPacifyPass | 40 | 166.53 | 4.1632 | 5.5969 | 12.3675 | 1.125 | 36 | 0 | 4 | 36 | 0 | 0 | 36 |
| attack | 14 | 155.07 | 11.0763 | 29.086 | 29.086 | 34.9286 | 12 | 0 | 2 | 12 | 0 | 0 | 12 |
| ambushVc | 11 | 149.68 | 13.607 | 24.9602 | 24.9602 | 8.1818 | 10 | 0 | 1 | 10 | 0 | 0 | 10 |
| coupNvaRedeployTroops | 16 | 91.42 | 5.714 | 8.1098 | 8.1098 | 3.875 | 10 | 0 | 6 | 10 | 0 | 0 | 10 |
| coupResourcesResolve | 20 | 78.21 | 3.9107 | 5.9327 | 6.2067 | 1 | 4 | 0 | 16 | 4 | 0 | 0 | 4 |
| coupAgitatePass | 20 | 73.44 | 3.672 | 4.8196 | 5.1706 | 1.25 | 18 | 0 | 2 | 18 | 0 | 0 | 18 |
| coupVictoryCheck | 20 | 68.95 | 3.4473 | 4.9549 | 5.3987 | 1 | 20 | 0 | 0 | 20 | 4 | 0 | 20 |
| coupArvnRedeployMandatory | 2 | 52.43 | 26.2152 | 26.5367 | 26.5367 | 11.5 | 1 | 0 | 1 | 1 | 0 | 0 | 1 |
| ambushNva | 5 | 30.51 | 6.1015 | 10.5857 | 10.5857 | 15.2 | 5 | 0 | 0 | 5 | 0 | 0 | 5 |
| coupCommitmentResolve | 8 | 30.3 | 3.7878 | 4.128 | 4.128 | 2 | 0 | 0 | 8 | 0 | 0 | 0 | 0 |
| chooseOne:chooseOne | 28 | 19.76 | 0.7057 | 7.2623 | 8.248 | 5.6786 | 0 | 7 | 2 | 0 | 0 | 0 | 0 |
| assault:chooseOne | 10 | 16.44 | 1.6443 | 5.8499 | 5.8499 | 2 | 0 | 4 | 4 | 0 | 0 | 0 | 0 |
| rally:chooseNStep:add | 173 | 12.91 | 0.0747 | 0.1421 | 0.7543 | 20.422 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseNStep:confirm | 218 | 7.83 | 0.0359 | 0.0671 | 0.1513 | 14.8165 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseOne | 176 | 6.61 | 0.0375 | 0.0874 | 0.1584 | 1.3523 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| pass | 2 | 6.59 | 3.2959 | 3.4647 | 3.4647 | 2.5 | 2 | 0 | 0 | 2 | 0 | 0 | 2 |
| resolveHonoluluPacify | 3 | 5.99 | 1.9959 | 2.2372 | 2.2372 | 1 | 3 | 0 | 0 | 3 | 0 | 0 | 3 |
| event-decision:chooseOne | 36 | 5.71 | 0.1585 | 0.6624 | 3.3949 | 3.9444 | 0 | 1 | 1 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:add | 38 | 4.07 | 0.107 | 0.7031 | 0.7184 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:confirm | 90 | 3.73 | 0.0415 | 0.0732 | 0.107 | 5.0778 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseOne | 76 | 3.42 | 0.045 | 0.1073 | 0.1457 | 2.4474 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:add | 57 | 3.31 | 0.0581 | 0.0888 | 0.1106 | 11.4912 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseNStep:confirm | 83 | 3.19 | 0.0384 | 0.0554 | 0.181 | 6.253 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:confirm | 38 | 3.13 | 0.0825 | 0.1025 | 1.4277 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseOne | 56 | 2.1 | 0.0375 | 0.0675 | 0.1476 | 1.625 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:add | 33 | 2.07 | 0.0628 | 0.0865 | 0.6522 | 3.6061 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupNvaRedeployTroops:chooseOne | 42 | 1.61 | 0.0383 | 0.048 | 0.0812 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:confirm | 50 | 1.54 | 0.0309 | 0.0599 | 0.1014 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:confirm | 47 | 1.54 | 0.0328 | 0.0587 | 0.0698 | 4.4255 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupCommitmentResolve:chooseNStep:confirm | 32 | 0.92 | 0.0287 | 0.045 | 0.0473 | 9.25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:add | 12 | 0.52 | 0.0436 | 0.0558 | 0.0558 | 3.5833 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| chooseNStep:chooseNStep:confirm | 10 | 0.42 | 0.0423 | 0.0517 | 0.0517 | 22.5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:confirm | 12 | 0.38 | 0.0316 | 0.0589 | 0.0589 | 4.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseOne | 11 | 0.29 | 0.0262 | 0.0332 | 0.0332 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseOne | 5 | 0.18 | 0.0358 | 0.0466 | 0.0466 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseNStep:add | 3 | 0.14 | 0.0482 | 0.0527 | 0.0527 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseNStep:confirm | 3 | 0.12 | 0.0413 | 0.0568 | 0.0568 | 3.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Top Hot Axes In Slow-Tier Seeds

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.

| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms |
|---:|---|---|---:|---:|---:|---:|---:|
| 1 | train:chooseNStep:add | continuedDeepening | 33 | 53889.91 | 1633.0276 | 3487.7507 | 3898.1237 |
| 2 | train:chooseNStep:confirm | continuedDeepening | 35 | 39129.56 | 1117.9875 | 3385.1822 | 3599.7936 |
| 3 | coupArvnRedeployPolice:chooseOne | continuedDeepening | 52 | 23911.86 | 459.8435 | 1816.2089 | 1957.6535 |
| 4 | govern:chooseNStep:confirm | continuedDeepening | 25 | 12248.86 | 489.9544 | 298.3113 | 8514.068 |
| 5 | govern:chooseNStep:add | continuedDeepening | 35 | 11425.57 | 326.4449 | 395.1935 | 5068.0091 |
| 6 | event | singlePass | 95 | 9240.37 | 97.267 | 170.2458 | 3855.6015 |
| 7 | coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | 72 | 3588.51 | 49.8404 | 184.8691 | 234.2801 |
| 8 | govern | singlePass | 32 | 2289.63 | 71.5508 | 115.3974 | 664.7534 |
| 9 | rally | singlePass | 62 | 1248.35 | 20.1346 | 52.2966 | 68.1664 |
| 10 | coupArvnRedeployMandatory:chooseOne | continuedDeepening | 12 | 1100.45 | 91.7038 | 142.8696 | 142.8696 |

## Hot-Path Buckets For Top Slow Axes

Captured only when `--profile-buckets` is enabled. Buckets are timing/count diagnostics inside `PolicyAgent.chooseDecision`; they are not correctness assertions.

### train:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 70760 | 12221.8 |
| zobrist:encodeDecisionStackFrame | 71162 | 7148.9 |
| tokenStateIndex:refreshCachedEntries | 84351 | 1170.14 |
| evalQuery:applyTokenFilter | 39507 | 160.25 |
| evalQuery:countMatchingTokens | 49652 | 84.9 |
| evalQuery:applyTokenFilterCacheHit | 77754 | 0 |
| evalQuery:applyTokenFilterCompiled | 38484 | 0 |
| evalQuery:countMatchingTokensCacheHit | 7842090 | 0 |
| evalQuery:countMatchingTokensCompiled | 49652 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 18571784 | 0 |
| tokenStateIndex:getCacheHit | 272536 | 0 |
| zobrist:decisionStackFrameEncodedChars | 1501626611 | 0 |

### train:chooseNStep:confirm | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 49878 | 8878.48 |
| zobrist:encodeDecisionStackFrame | 51210 | 5268.33 |
| tokenStateIndex:refreshCachedEntries | 43507 | 733.44 |
| evalQuery:applyTokenFilter | 16977 | 87.6 |
| evalQuery:countMatchingTokens | 21221 | 45.08 |
| evalQuery:applyTokenFilterCacheHit | 73979 | 0 |
| evalQuery:applyTokenFilterCompiled | 16185 | 0 |
| evalQuery:countMatchingTokensCacheHit | 5992857 | 0 |
| evalQuery:countMatchingTokensCompiled | 21221 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 14379679 | 0 |
| tokenStateIndex:getCacheHit | 175368 | 0 |
| zobrist:decisionStackFrameEncodedChars | 1086468642 | 0 |

### coupArvnRedeployPolice:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 840820 | 4412.21 |
| evalQuery:countMatchingTokens | 930152 | 1294.74 |
| zobrist:digestDecisionStackFrame | 368 | 18.94 |
| zobrist:encodeDecisionStackFrame | 368 | 18.03 |
| evalQuery:applyTokenFilterCacheHit | 92152 | 0 |
| evalQuery:countMatchingTokensCacheHit | 21514532 | 0 |
| evalQuery:countMatchingTokensCompiled | 930152 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 72703314 | 0 |
| tokenStateIndex:getCacheHit | 840820 | 0 |
| zobrist:decisionStackFrameEncodedChars | 2278236 | 0 |
| zobrist:decisionStackFrameRunLocalCacheMiss | 368 | 0 |

### govern:chooseNStep:confirm | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 31003 | 539.31 |
| evalQuery:applyTokenFilter | 200968 | 357.31 |
| zobrist:encodeDecisionStackFrame | 828 | 39.15 |
| evalQuery:countMatchingTokens | 25207 | 33.28 |
| zobrist:digestDecisionStackFrame | 452 | 25.26 |
| evalQuery:applyTokenFilterCacheHit | 12656 | 0 |
| evalQuery:applyTokenFilterCompiled | 200098 | 0 |
| evalQuery:countMatchingTokensCacheHit | 1633944 | 0 |
| evalQuery:countMatchingTokensCompiled | 7347 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 3595677 | 0 |
| tokenStateIndex:getCacheHit | 212463 | 0 |
| zobrist:decisionStackFrameEncodedChars | 3049083 | 0 |

### govern:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 26725 | 399.05 |
| evalQuery:applyTokenFilter | 122852 | 222.71 |
| zobrist:digestDecisionStackFrame | 3924 | 184.01 |
| zobrist:encodeDecisionStackFrame | 4008 | 162.45 |
| evalQuery:countMatchingTokens | 23502 | 32.72 |
| evalQuery:applyTokenFilterCacheHit | 10806 | 0 |
| evalQuery:applyTokenFilterCompiled | 122243 | 0 |
| evalQuery:countMatchingTokensCacheHit | 1862728 | 0 |
| evalQuery:countMatchingTokensCompiled | 11000 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 4404723 | 0 |
| tokenStateIndex:getCacheHit | 155803 | 0 |
| zobrist:decisionStackFrameEncodedChars | 22358508 | 0 |

### event | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 67740 | 934.35 |
| evalQuery:applyTokenFilter | 104207 | 300.38 |
| zobrist:digestDecisionStackFrame | 870 | 169.24 |
| zobrist:encodeDecisionStackFrame | 870 | 108.79 |
| evalQuery:countMatchingTokens | 53299 | 63.25 |
| policyWasmRuntime:encodeBytecodeInput | 988 | 29.29 |
| tokenStateIndex:build | 18 | 0.75 |
| evalQuery:applyTokenFilterCacheHit | 18014 | 0 |
| evalQuery:applyTokenFilterCompiled | 102599 | 0 |
| evalQuery:countMatchingTokensCacheHit | 1520691 | 0 |
| evalQuery:countMatchingTokensCompiled | 34477 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 3108106 | 0 |

### coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 90320 | 473.24 |
| evalQuery:countMatchingTokens | 113580 | 117.38 |
| zobrist:digestDecisionStackFrame | 128 | 6.08 |
| zobrist:encodeDecisionStackFrame | 128 | 5.68 |
| evalQuery:applyTokenFilterCacheHit | 9160 | 0 |
| evalQuery:countMatchingTokensCacheHit | 3979377 | 0 |
| evalQuery:countMatchingTokensCompiled | 113580 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 8296248 | 0 |
| tokenStateIndex:getCacheHit | 90320 | 0 |
| zobrist:decisionStackFrameEncodedChars | 697624 | 0 |
| zobrist:decisionStackFrameRunLocalCacheMiss | 128 | 0 |

### govern | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 4319 | 64.05 |
| evalQuery:applyTokenFilter | 16255 | 63.89 |
| zobrist:digestDecisionStackFrame | 454 | 53.86 |
| zobrist:encodeDecisionStackFrame | 454 | 37.98 |
| evalQuery:countMatchingTokens | 12073 | 18.29 |
| policyWasmRuntime:encodeBytecodeInput | 282 | 8.96 |
| evalQuery:applyTokenFilterCacheHit | 11829 | 0 |
| evalQuery:applyTokenFilterCompiled | 15656 | 0 |
| evalQuery:countMatchingTokensCacheHit | 658489 | 0 |
| evalQuery:countMatchingTokensCompiled | 3143 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1295657 | 0 |
| policyWasmRuntime:encodedInputCacheMiss | 282 | 0 |

### rally | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 6793 | 73.14 |
| evalQuery:applyTokenFilter | 5063 | 50.94 |
| zobrist:digestDecisionStackFrame | 180 | 12.92 |
| policyWasmRuntime:encodeBytecodeInput | 335 | 12.42 |
| zobrist:encodeDecisionStackFrame | 180 | 10.6 |
| evalQuery:countMatchingTokens | 6103 | 8.19 |
| evalQuery:applyTokenFilterCacheHit | 3004 | 0 |
| evalQuery:applyTokenFilterCompiled | 4286 | 0 |
| evalQuery:countMatchingTokensCacheHit | 554744 | 0 |
| evalQuery:countMatchingTokensCompiled | 6103 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1342116 | 0 |
| policyWasmRuntime:encodedInputCacheMiss | 335 | 0 |

### coupArvnRedeployMandatory:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 32392 | 162.58 |
| evalQuery:countMatchingTokens | 46348 | 55.33 |
| zobrist:encodeDecisionStackFrame | 64 | 2.58 |
| zobrist:digestDecisionStackFrame | 64 | 2.38 |
| evalQuery:applyTokenFilterCacheHit | 3200 | 0 |
| evalQuery:countMatchingTokensCacheHit | 1030656 | 0 |
| evalQuery:countMatchingTokensCompiled | 46348 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 2913754 | 0 |
| tokenStateIndex:getCacheHit | 32392 | 0 |
| zobrist:decisionStackFrameEncodedChars | 275288 | 0 |
| zobrist:decisionStackFrameRunLocalCacheMiss | 64 | 0 |


## Fast-Tier vs Slow-Tier Delta

Fast tier: `1000`, `1006`, `1007`, `1010`, `1014`. Rows with ratio greater than `3.0` satisfy the Phase 0 hot-axis criterion.

| Microturn class | Slow decisions | Fast decisions | Slow mean ms | Fast mean ms | Slow:fast ratio | Verdict |
|---|---:|---:|---:|---:|---:|---|
| train:chooseNStep:confirm | 49 | 6 | 798.5996 | 0.0832 | 9598.5529 | hot axis |
| train:chooseNStep:add | 33 | 6 | 1633.0276 | 349.5518 | 4.6718 | hot axis |
| coupArvnRedeployPolice:chooseOne | 52 | 50 | 459.8435 | 161.6252 | 2.8451 |  |
| train | 17 | 3 | 26.975 | 12.5889 | 2.1428 |  |
| govern:chooseNStep:confirm | 30 | 35 | 408.3107 | 201.6598 | 2.0248 |  |
| advise:chooseNStep:add | 8 | 15 | 0.1629 | 0.1004 | 1.6225 |  |
| govern:chooseNStep:add | 35 | 35 | 326.4449 | 209.511 | 1.5581 |  |
| coupNvaRedeployTroops | 7 | 1 | 6.0422 | 4.0113 | 1.5063 |  |
| advise:chooseOne | 16 | 30 | 0.0621 | 0.0418 | 1.4856 |  |
| train:chooseOne | 29 | 6 | 7.0642 | 5.3437 | 1.322 |  |
| advise | 8 | 15 | 10.2613 | 7.8541 | 1.3065 |  |
| assault | 8 | 9 | 8.9166 | 6.857 | 1.3004 |  |
| ambushVc:chooseNStep:confirm | 5 | 3 | 0.0369 | 0.0284 | 1.2993 |  |
| govern | 32 | 35 | 71.5508 | 56.9921 | 1.2555 |  |
| march:chooseNStep:add | 21 | 22 | 0.0656 | 0.0524 | 1.2519 |  |
| coupResourcesResolve | 7 | 6 | 4.5699 | 3.6818 | 1.2412 |  |
| transport | 5 | 3 | 71.7198 | 57.8814 | 1.2391 |  |
| chooseNStep:chooseNStep:confirm | 4 | 3 | 0.0448 | 0.0376 | 1.1915 |  |
| march | 15 | 13 | 6.7157 | 5.6674 | 1.185 |  |
| advise:chooseNStep:confirm | 8 | 15 | 0.0542 | 0.0458 | 1.1834 |  |
| coupRedeployPass | 28 | 24 | 7.6759 | 6.5529 | 1.1714 |  |
| coupPacifyARVN | 8 | 8 | 10.7319 | 9.2103 | 1.1652 |  |
| coupPacifyUS | 25 | 26 | 6.7408 | 5.9016 | 1.1422 |  |
| govern:chooseOne | 37 | 35 | 3.8102 | 3.4318 | 1.1103 |  |
| coupVictoryCheck | 7 | 6 | 3.7766 | 3.4733 | 1.0873 |  |
| rally:chooseNStep:confirm | 73 | 73 | 0.0394 | 0.0364 | 1.0824 |  |
| coupArvnRedeployPolice | 27 | 32 | 23.6179 | 22.0084 | 1.0731 |  |
| ambushVc:chooseOne | 5 | 4 | 0.027 | 0.0252 | 1.0714 |  |
| coupArvnRedeployOptionalTroops | 31 | 25 | 25.4901 | 24.4623 | 1.042 |  |
| coupCommitmentResolve:chooseNStep:confirm | 8 | 12 | 0.03 | 0.0288 | 1.0417 |  |
| event | 95 | 78 | 97.267 | 95.5056 | 1.0184 |  |
| rally:chooseOne | 64 | 57 | 0.0388 | 0.0383 | 1.0131 |  |
| event-decision:chooseNStep:confirm | 43 | 26 | 0.0388 | 0.0386 | 1.0052 |  |
| assault:chooseNStep:confirm | 16 | 13 | 0.0332 | 0.0334 | 0.994 |  |
| infiltrate:chooseOne | 16 | 14 | 0.0417 | 0.042 | 0.9929 |  |
| coupCommitmentPass | 28 | 24 | 3.0603 | 3.0864 | 0.9915 |  |
| coupCommitmentResolve | 2 | 3 | 3.7838 | 3.8221 | 0.99 |  |
| infiltrate | 10 | 8 | 9.2576 | 9.543 | 0.9701 |  |
| coupAgitatePass | 7 | 6 | 3.59 | 3.7016 | 0.9699 |  |
| ambushVc:chooseNStep:add | 5 | 3 | 0.0451 | 0.0474 | 0.9515 |  |
| coupArvnRedeployOptionalTroops:chooseOne | 72 | 60 | 49.8404 | 52.9327 | 0.9416 |  |
| attack | 6 | 8 | 10.5788 | 11.4493 | 0.924 |  |
| infiltrate:chooseNStep:confirm | 15 | 12 | 0.034 | 0.0369 | 0.9214 |  |
| pass | 1 | 1 | 3.1271 | 3.4647 | 0.9026 |  |
| coupAgitateVC | 19 | 25 | 4.973 | 5.5693 | 0.8929 |  |
| rally:chooseNStep:add | 63 | 56 | 0.0726 | 0.0833 | 0.8715 |  |
| march:chooseNStep:confirm | 34 | 29 | 0.043 | 0.0498 | 0.8635 |  |
| coupPacifyPass | 14 | 12 | 3.9383 | 4.7245 | 0.8336 |  |
| rally | 62 | 54 | 20.1346 | 25.4036 | 0.7926 |  |
| chooseOne:chooseOne | 11 | 8 | 0.8163 | 1.083 | 0.7537 |  |
| ambushVc | 5 | 4 | 9.8253 | 14.7956 | 0.6641 |  |
| coupNvaRedeployTroops:chooseOne | 19 | 2 | 0.0393 | 0.0635 | 0.6189 |  |
| transport:chooseOne | 10 | 6 | 101.8651 | 176.0227 | 0.5787 |  |
| infiltrate:chooseNStep:add | 10 | 8 | 0.0445 | 0.1235 | 0.3603 |  |
| event-decision:chooseOne | 13 | 6 | 0.0509 | 0.1591 | 0.3199 |  |
| assault:chooseOne | 2 | 5 | 0.0652 | 2.583 | 0.0252 |  |
| event-decision:chooseNStep:add | 43 | 29 | 0.0583 | 28.76 | 0.002 |  |
| assault:chooseNStep:add | 8 | 7 | 0.0565 | 637.2152 | 0.0001 |  |

## Notes

- `elapsedMs` is measured around the per-decision `PolicyAgent.chooseDecision` call. It excludes simulator apply/delta work and report rendering.
- Child processes enforce the per-seed timeout. Each child loads the built engine and production FITL GameSpecDoc, using the repo GameDef cache when available.
- The script does not modify engine source or production profile data.
