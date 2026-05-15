# FITL ARVN 15-Seed Per-Microturn-Class Decomposition

**Date**: 2026-05-15-post-005-token-entry-seed1005-smoke
**Status**: Spec 173 measurement witness.
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005 --timeout-ms 400000 --date 2026-05-15-post-005-token-entry-seed1005-smoke --profile-buckets`
**CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-005-token-entry-seed1005-smoke.csv`

## Summary

- Seeds completed: 1/1
- Per-decision rows: 412
- Hot class with slow:fast ratio >3x: no
- Per-seed timeout: 400000 ms
- Hot-path buckets: enabled

## Per-Seed Wall Time

| Seed | Status | Stop Reason | Wall ms | Decisions | ms/decision | Error |
|---:|---|---|---:|---:|---:|---|
| 1005 | OK | terminal | 87528.35 | 412 | 212.4475 |  |

## Per-Microturn-Class Rollup

| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | Token index builds | Static rebuilds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| coupArvnRedeployPolice:chooseOne | 16 | 19308.7 | 1206.794 | 2692.1784 | 2692.1784 | 30.5 | 0 | 19852 | 680 | 0 | 0 | 0 | 0 |
| train:chooseNStep:add | 13 | 19308.55 | 1485.2727 | 3433.7611 | 3433.7611 | 13.4615 | 0 | 5541 | 12351 | 0 | 0 | 0 | 0 |
| train:chooseNStep:confirm | 15 | 16426.72 | 1095.1144 | 3470.3825 | 3470.3825 | 10.6 | 0 | 4574 | 9720 | 0 | 0 | 0 | 0 |
| govern:chooseNStep:confirm | 5 | 9093.73 | 1818.7461 | 8458.3786 | 8458.3786 | 7.2 | 0 | 125 | 57 | 0 | 0 | 0 | 0 |
| govern:chooseNStep:add | 5 | 5869.14 | 1173.8285 | 5049.3826 | 5049.3826 | 6.2 | 0 | 150 | 289 | 0 | 0 | 0 | 0 |
| coupArvnRedeployMandatory:chooseOne | 12 | 2558.46 | 213.2047 | 311.8595 | 311.8595 | 8 | 0 | 1428 | 204 | 0 | 0 | 0 | 0 |
| transport:chooseOne | 8 | 2470.57 | 308.8209 | 920.2973 | 920.2973 | 12.75 | 0 | 362 | 22 | 0 | 0 | 0 | 0 |
| coupArvnRedeployOptionalTroops:chooseOne | 12 | 1992.95 | 166.0791 | 223.2204 | 223.2204 | 8 | 0 | 420 | 60 | 0 | 0 | 0 | 0 |
| event | 29 | 1883.52 | 64.949 | 103.6065 | 638.5485 | 21.0345 | 29 | 0 | 0 | 29 | 10 | 0 | 31 |
| govern:chooseOne | 7 | 1409.27 | 201.3244 | 1216.8398 | 1216.8398 | 2 | 0 | 7 | 7 | 0 | 0 | 0 | 0 |
| govern | 7 | 1019.41 | 145.6301 | 677.1097 | 677.1097 | 10.5714 | 7 | 0 | 0 | 7 | 0 | 0 | 7 |
| train:chooseOne | 9 | 330.46 | 36.7174 | 51.2492 | 51.2492 | 2.3333 | 0 | 24 | 29 | 0 | 0 | 0 | 0 |
| rally | 19 | 324.83 | 17.0966 | 55.3188 | 55.3188 | 25.6316 | 15 | 0 | 4 | 15 | 4 | 0 | 15 |
| transport | 4 | 310.83 | 77.7084 | 106.2572 | 106.2572 | 11 | 4 | 0 | 0 | 4 | 0 | 0 | 4 |
| train | 5 | 165.11 | 33.0214 | 38.6188 | 38.6188 | 11.4 | 5 | 0 | 0 | 5 | 10 | 0 | 5 |
| coupArvnRedeployOptionalTroops | 6 | 151.81 | 25.3018 | 28.7077 | 28.7077 | 17.5 | 5 | 0 | 1 | 5 | 0 | 0 | 5 |
| coupArvnRedeployPolice | 6 | 145.16 | 24.1939 | 26.3224 | 26.3224 | 11.6667 | 6 | 0 | 0 | 6 | 0 | 0 | 6 |
| chooseOne:chooseOne | 3 | 100.68 | 33.5599 | 100.0347 | 100.0347 | 6.6667 | 0 | 4 | 1 | 0 | 0 | 0 | 0 |
| coupRedeployPass | 8 | 61.64 | 7.7053 | 22.5257 | 22.5257 | 3 | 4 | 0 | 4 | 4 | 13 | 0 | 4 |
| coupArvnRedeployMandatory | 2 | 51.86 | 25.9322 | 26.2011 | 26.2011 | 11.5 | 1 | 0 | 1 | 1 | 0 | 0 | 1 |
| coupNvaRedeployTroops | 6 | 41.12 | 6.8541 | 8.0352 | 8.0352 | 4.5 | 5 | 0 | 1 | 5 | 0 | 0 | 5 |
| attack | 3 | 33.88 | 11.2945 | 11.9415 | 11.9415 | 53 | 3 | 0 | 0 | 3 | 0 | 0 | 3 |
| coupPacifyUS | 5 | 32.56 | 6.5115 | 10.2178 | 10.2178 | 2.8 | 5 | 0 | 0 | 5 | 0 | 0 | 5 |
| coupCommitmentPass | 8 | 22.53 | 2.8167 | 4.3988 | 4.3988 | 1 | 2 | 0 | 6 | 2 | 0 | 0 | 2 |
| march | 3 | 16.22 | 5.4083 | 6.1522 | 6.1522 | 3 | 1 | 0 | 2 | 1 | 0 | 0 | 1 |
| coupPacifyPass | 4 | 14.87 | 3.718 | 4.4608 | 4.4608 | 1 | 3 | 0 | 1 | 3 | 0 | 0 | 3 |
| coupAgitateVC | 3 | 14.13 | 4.7109 | 5.6529 | 5.6529 | 2.3333 | 1 | 0 | 2 | 1 | 2 | 0 | 1 |
| infiltrate | 2 | 13.84 | 6.9202 | 10.8882 | 10.8882 | 30.5 | 1 | 0 | 1 | 1 | 0 | 0 | 1 |
| coupPacifyARVN | 1 | 13.38 | 13.3822 | 13.3822 | 13.3822 | 6 | 0 | 0 | 1 | 0 | 0 | 0 | 0 |
| coupVictoryCheck | 2 | 11.05 | 5.5252 | 6.9399 | 6.9399 | 1 | 2 | 0 | 0 | 2 | 0 | 0 | 2 |
| coupAgitatePass | 2 | 10.95 | 5.4771 | 5.7873 | 5.7873 | 1.5 | 2 | 0 | 0 | 2 | 0 | 0 | 2 |
| assault | 1 | 9.66 | 9.664 | 9.664 | 9.664 | 4 | 1 | 0 | 0 | 1 | 1 | 0 | 1 |
| coupCommitmentResolve | 2 | 7.59 | 3.7952 | 3.853 | 3.853 | 2 | 0 | 0 | 2 | 0 | 0 | 0 | 0 |
| advise | 1 | 7.03 | 7.0323 | 7.0323 | 7.0323 | 12 | 1 | 0 | 0 | 1 | 0 | 0 | 1 |
| coupResourcesResolve | 2 | 6.63 | 3.3173 | 3.4471 | 3.4471 | 1 | 1 | 0 | 1 | 1 | 0 | 0 | 1 |
| event-decision:chooseNStep:add | 26 | 1.39 | 0.0536 | 0.0951 | 0.1142 | 11.5385 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseNStep:add | 19 | 1.09 | 0.0572 | 0.0713 | 0.0713 | 22.1053 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseNStep:confirm | 28 | 0.93 | 0.0332 | 0.0513 | 0.0617 | 18.5357 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseNStep:confirm | 23 | 0.66 | 0.0285 | 0.0324 | 0.0658 | 3.8696 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupNvaRedeployTroops:chooseOne | 17 | 0.62 | 0.0366 | 0.0496 | 0.0496 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseOne | 19 | 0.6 | 0.0317 | 0.0511 | 0.0511 | 1.3158 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseOne | 7 | 0.27 | 0.0383 | 0.0542 | 0.0542 | 3.1429 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:confirm | 8 | 0.25 | 0.031 | 0.0406 | 0.0406 | 3.875 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupCommitmentResolve:chooseNStep:confirm | 8 | 0.24 | 0.0306 | 0.0442 | 0.0442 | 9.25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:add | 3 | 0.22 | 0.075 | 0.078 | 0.078 | 23 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| chooseNStep:chooseNStep:confirm | 3 | 0.12 | 0.0411 | 0.05 | 0.05 | 19.6667 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseOne | 3 | 0.12 | 0.0394 | 0.0485 | 0.0485 | 1.6667 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:add | 1 | 0.11 | 0.1107 | 0.1107 | 0.1107 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:confirm | 3 | 0.11 | 0.0362 | 0.047 | 0.047 | 4.6667 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseOne | 2 | 0.1 | 0.0478 | 0.0652 | 0.0652 | 2.5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:confirm | 2 | 0.09 | 0.0427 | 0.0492 | 0.0492 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:add | 2 | 0.09 | 0.0429 | 0.0454 | 0.0454 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:add | 1 | 0.05 | 0.0538 | 0.0538 | 0.0538 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:confirm | 1 | 0.04 | 0.0356 | 0.0356 | 0.0356 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Top Hot Axes In Slow-Tier Seeds

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.

| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms |
|---:|---|---|---:|---:|---:|---:|---:|
| 1 | coupArvnRedeployPolice:chooseOne | continuedDeepening | 16 | 19308.7 | 1206.794 | 2692.1784 | 2692.1784 |
| 2 | train:chooseNStep:add | continuedDeepening | 13 | 19308.55 | 1485.2727 | 3433.7611 | 3433.7611 |
| 3 | train:chooseNStep:confirm | continuedDeepening | 10 | 16426.22 | 1642.6219 | 3470.3825 | 3470.3825 |
| 4 | govern:chooseNStep:confirm | continuedDeepening | 5 | 9093.73 | 1818.7461 | 8458.3786 | 8458.3786 |
| 5 | govern:chooseNStep:add | continuedDeepening | 5 | 5869.14 | 1173.8285 | 5049.3826 | 5049.3826 |
| 6 | coupArvnRedeployMandatory:chooseOne | continuedDeepening | 12 | 2558.46 | 213.2047 | 311.8595 | 311.8595 |
| 7 | transport:chooseOne | continuedDeepening | 8 | 2470.57 | 308.8209 | 920.2973 | 920.2973 |
| 8 | coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | 12 | 1992.95 | 166.0791 | 223.2204 | 223.2204 |
| 9 | event | singlePass | 29 | 1883.52 | 64.949 | 103.6065 | 638.5485 |
| 10 | govern:chooseOne | continuedDeepening | 7 | 1409.27 | 201.3244 | 1216.8398 | 1216.8398 |

## Hot-Path Buckets For Top Slow Axes

Captured only when `--profile-buckets` is enabled. Buckets are timing/count diagnostics inside `PolicyAgent.chooseDecision`; they are not correctness assertions.

### coupArvnRedeployPolice:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 296268 | 3104.61 |
| evalQuery:countMatchingTokens | 623336 | 999.01 |
| zobrist:digestDecisionStackFrame | 1536 | 75.9 |
| zobrist:encodeDecisionStackFrame | 1568 | 67.52 |
| evalQuery:applyTokenFilter | 110 | 0.42 |
| evalQuery:applyTokenFilterCacheHit | 88636 | 0 |
| evalQuery:applyTokenFilterCompiled | 110 | 0 |
| evalQuery:countMatchingTokensCacheHit | 17410496 | 0 |
| evalQuery:countMatchingTokensCompiled | 623336 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 58606051 | 0 |
| tokenStateIndex:getCacheHit | 592536 | 0 |
| tokenStateIndex:updateEntry | 296268 | 0 |

### train:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 26406 | 4546.61 |
| zobrist:encodeDecisionStackFrame | 26512 | 2689.16 |
| tokenStateIndex:refreshCachedEntries | 20993 | 305.2 |
| evalQuery:applyTokenFilter | 12246 | 79.12 |
| evalQuery:countMatchingTokens | 14869 | 24.65 |
| evalQuery:applyTokenFilterCacheHit | 27613 | 0 |
| evalQuery:applyTokenFilterCompiled | 11223 | 0 |
| evalQuery:countMatchingTokensCacheHit | 2568038 | 0 |
| evalQuery:countMatchingTokensCompiled | 14869 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 6799838 | 0 |
| tokenStateIndex:getCacheHit | 172010 | 0 |
| tokenStateIndex:updateEntry | 4408 | 0 |

### train:chooseNStep:confirm | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 20860 | 3716.26 |
| zobrist:encodeDecisionStackFrame | 21222 | 2277.95 |
| tokenStateIndex:refreshCachedEntries | 14717 | 249.6 |
| evalQuery:applyTokenFilter | 7304 | 60.54 |
| evalQuery:countMatchingTokens | 8283 | 22.72 |
| evalQuery:applyTokenFilterCacheHit | 29518 | 0 |
| evalQuery:applyTokenFilterCompiled | 6512 | 0 |
| evalQuery:countMatchingTokensCacheHit | 2442375 | 0 |
| evalQuery:countMatchingTokensCompiled | 8283 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 6521800 | 0 |
| tokenStateIndex:getCacheHit | 129276 | 0 |
| tokenStateIndex:updateEntry | 1969 | 0 |

### govern:chooseNStep:confirm | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 19436 | 415.94 |
| evalQuery:applyTokenFilter | 193534 | 276.45 |
| zobrist:encodeDecisionStackFrame | 208 | 8.31 |
| evalQuery:countMatchingTokens | 4881 | 7.96 |
| zobrist:digestDecisionStackFrame | 126 | 6.66 |
| evalQuery:applyTokenFilterCacheHit | 7006 | 0 |
| evalQuery:applyTokenFilterCompiled | 193360 | 0 |
| evalQuery:countMatchingTokensCacheHit | 305975 | 0 |
| evalQuery:countMatchingTokensCompiled | 1309 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 738163 | 0 |
| tokenStateIndex:getCacheHit | 103146 | 0 |
| tokenStateIndex:updateEntry | 64 | 0 |

### govern:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 11222 | 221.86 |
| evalQuery:applyTokenFilter | 110751 | 170.71 |
| zobrist:digestDecisionStackFrame | 692 | 32.63 |
| zobrist:encodeDecisionStackFrame | 692 | 27.38 |
| evalQuery:countMatchingTokens | 4830 | 5.28 |
| evalQuery:applyTokenFilterCacheHit | 4089 | 0 |
| evalQuery:applyTokenFilterCompiled | 110577 | 0 |
| evalQuery:countMatchingTokensCacheHit | 241151 | 0 |
| evalQuery:countMatchingTokensCompiled | 1258 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 606474 | 0 |
| tokenStateIndex:getCacheHit | 72844 | 0 |
| tokenStateIndex:updateEntry | 51 | 0 |

### coupArvnRedeployMandatory:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 30721 | 301.71 |
| evalQuery:countMatchingTokens | 75112 | 87.26 |
| zobrist:encodeDecisionStackFrame | 448 | 15.52 |
| zobrist:digestDecisionStackFrame | 412 | 14.03 |
| evalQuery:applyTokenFilter | 96 | 0.41 |
| evalQuery:applyTokenFilterCacheHit | 12032 | 0 |
| evalQuery:applyTokenFilterCompiled | 96 | 0 |
| evalQuery:countMatchingTokensCacheHit | 2251157 | 0 |
| evalQuery:countMatchingTokensCompiled | 75112 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 6633577 | 0 |
| tokenStateIndex:getCacheHit | 61442 | 0 |
| tokenStateIndex:updateEntry | 30721 | 0 |

### transport:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 17384 | 222.86 |
| evalQuery:applyTokenFilter | 18372 | 116.41 |
| evalQuery:countMatchingTokens | 25249 | 25.83 |
| zobrist:digestDecisionStackFrame | 28 | 4.18 |
| zobrist:encodeDecisionStackFrame | 28 | 2.78 |
| evalQuery:applyTokenFilterCacheHit | 71688 | 0 |
| evalQuery:applyTokenFilterCompiled | 17547 | 0 |
| evalQuery:countMatchingTokensCacheHit | 945717 | 0 |
| evalQuery:countMatchingTokensCompiled | 25249 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1996238 | 0 |
| tokenStateIndex:getCacheHit | 139040 | 0 |
| tokenStateIndex:updateEntry | 3456 | 0 |

### coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 14394 | 225.41 |
| evalQuery:countMatchingTokens | 22504 | 20.51 |
| zobrist:encodeDecisionStackFrame | 96 | 3.33 |
| zobrist:digestDecisionStackFrame | 96 | 2.56 |
| evalQuery:applyTokenFilter | 280 | 0.79 |
| evalQuery:applyTokenFilterCacheHit | 18872 | 0 |
| evalQuery:applyTokenFilterCompiled | 280 | 0 |
| evalQuery:countMatchingTokensCacheHit | 2096753 | 0 |
| evalQuery:countMatchingTokensCompiled | 22504 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 4859476 | 0 |
| tokenStateIndex:getCacheHit | 28788 | 0 |
| tokenStateIndex:updateEntry | 14394 | 0 |

### event | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| evalQuery:applyTokenFilter | 17906 | 74.84 |
| tokenStateIndex:refreshCachedEntries | 3708 | 72.85 |
| zobrist:digestDecisionStackFrame | 272 | 52.38 |
| zobrist:encodeDecisionStackFrame | 272 | 30.76 |
| policyWasmRuntime:encodeBytecodeInput | 304 | 11.64 |
| evalQuery:countMatchingTokens | 8185 | 9.73 |
| evalQuery:applyTokenFilterCacheHit | 4293 | 0 |
| evalQuery:applyTokenFilterCompiled | 17153 | 0 |
| evalQuery:countMatchingTokensCacheHit | 510787 | 0 |
| evalQuery:countMatchingTokensCompiled | 3101 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1068799 | 0 |
| policyWasmRuntime:encodedInputCacheMiss | 304 | 0 |

### govern:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 3108 | 63.21 |
| evalQuery:applyTokenFilter | 28112 | 56.15 |
| evalQuery:countMatchingTokens | 5667 | 5.63 |
| evalQuery:applyTokenFilterCacheHit | 1348 | 0 |
| evalQuery:applyTokenFilterCompiled | 27938 | 0 |
| evalQuery:countMatchingTokensCacheHit | 74389 | 0 |
| evalQuery:countMatchingTokensCompiled | 951 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 202896 | 0 |
| tokenStateIndex:getCacheHit | 42191 | 0 |
| tokenStateIndex:updateEntry | 79 | 0 |
| zobrist:decisionStackFrameWeakCacheHit | 84 | 0 |


## Fast-Tier vs Slow-Tier Delta

Fast tier: `1000`, `1006`, `1007`, `1010`, `1014`. Rows with ratio greater than `3.0` satisfy the Phase 0 hot-axis criterion.

| Microturn class | Slow decisions | Fast decisions | Slow mean ms | Fast mean ms | Slow:fast ratio | Verdict |
|---|---:|---:|---:|---:|---:|---|

## Notes

- `elapsedMs` is measured around the per-decision `PolicyAgent.chooseDecision` call. It excludes simulator apply/delta work and report rendering.
- Child processes enforce the per-seed timeout. Each child loads the built engine and production FITL GameSpecDoc, using the repo GameDef cache when available.
- The script does not modify engine source or production profile data.
