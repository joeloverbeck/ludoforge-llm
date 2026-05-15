# FITL ARVN 15-Seed Per-Microturn-Class Decomposition

**Date**: 2026-05-15-post-005-profile-buckets-seed1005
**Status**: Diagnostic witness for Spec 173 profile-bucket attribution on seed 1005; not a closeout artifact.
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005 --timeout-ms 400000 --date 2026-05-15-post-005-profile-buckets-seed1005 --profile-buckets`
**CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-005-profile-buckets-seed1005.csv`

## Summary

- Seeds completed: 1/1
- Per-decision rows: 412
- Hot class with slow:fast ratio >3x: no
- Per-seed timeout: 400000 ms
- Hot-path buckets: enabled

## Per-Seed Wall Time

| Seed | Status | Stop Reason | Wall ms | Decisions | ms/decision | Error |
|---:|---|---|---:|---:|---:|---|
| 1005 | OK | terminal | 85247.82 | 412 | 206.9122 |  |

## Per-Microturn-Class Rollup

| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | Token index builds | Static rebuilds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| train:chooseNStep:add | 13 | 19136.85 | 1472.0653 | 3454.3876 | 3454.3876 | 13.4615 | 0 | 5541 | 12351 | 0 | 0 | 0 | 0 |
| coupArvnRedeployPolice:chooseOne | 16 | 18380.85 | 1148.8032 | 2564.4529 | 2564.4529 | 30.5 | 0 | 19852 | 680 | 0 | 0 | 0 | 0 |
| train:chooseNStep:confirm | 15 | 16060.83 | 1070.7217 | 3426.9275 | 3426.9275 | 10.6 | 0 | 4574 | 9720 | 0 | 0 | 0 | 0 |
| govern:chooseNStep:confirm | 5 | 8627.59 | 1725.5182 | 8078.5251 | 8078.5251 | 7.2 | 0 | 125 | 57 | 0 | 0 | 0 | 0 |
| govern:chooseNStep:add | 5 | 5689.4 | 1137.8801 | 4921.3749 | 4921.3749 | 6.2 | 0 | 150 | 289 | 0 | 0 | 0 | 0 |
| coupArvnRedeployMandatory:chooseOne | 12 | 2602.25 | 216.854 | 329.3058 | 329.3058 | 8 | 0 | 1428 | 204 | 0 | 0 | 0 | 0 |
| transport:chooseOne | 8 | 2446.01 | 305.7514 | 887.5922 | 887.5922 | 12.75 | 0 | 362 | 22 | 0 | 0 | 0 | 0 |
| coupArvnRedeployOptionalTroops:chooseOne | 12 | 1989.23 | 165.7695 | 223.3357 | 223.3357 | 8 | 0 | 420 | 60 | 0 | 0 | 0 | 0 |
| event | 29 | 1863.63 | 64.2631 | 101.1692 | 661.8005 | 21.0345 | 29 | 0 | 0 | 29 | 10 | 0 | 31 |
| govern:chooseOne | 7 | 1355.82 | 193.6883 | 1161.4836 | 1161.4836 | 2 | 0 | 7 | 7 | 0 | 0 | 0 | 0 |
| govern | 7 | 944.61 | 134.9436 | 620.0353 | 620.0353 | 10.5714 | 7 | 0 | 0 | 7 | 0 | 0 | 7 |
| train:chooseOne | 9 | 316.61 | 35.1787 | 52.5144 | 52.5144 | 2.3333 | 0 | 24 | 29 | 0 | 0 | 0 | 0 |
| transport | 4 | 316.16 | 79.0393 | 110.6277 | 110.6277 | 11 | 4 | 0 | 0 | 4 | 0 | 0 | 4 |
| rally | 19 | 314.79 | 16.5676 | 55.7354 | 55.7354 | 25.6316 | 15 | 0 | 4 | 15 | 4 | 0 | 15 |
| train | 5 | 159.81 | 31.9616 | 38.9089 | 38.9089 | 11.4 | 5 | 0 | 0 | 5 | 10 | 0 | 5 |
| coupArvnRedeployOptionalTroops | 6 | 150.35 | 25.0576 | 28.244 | 28.244 | 17.5 | 5 | 0 | 1 | 5 | 0 | 0 | 5 |
| coupArvnRedeployPolice | 6 | 134.06 | 22.3441 | 23.9301 | 23.9301 | 11.6667 | 6 | 0 | 0 | 6 | 0 | 0 | 6 |
| chooseOne:chooseOne | 3 | 93.04 | 31.0146 | 92.404 | 92.404 | 6.6667 | 0 | 4 | 1 | 0 | 0 | 0 | 0 |
| coupRedeployPass | 8 | 59.06 | 7.3829 | 21.737 | 21.737 | 3 | 4 | 0 | 4 | 4 | 13 | 0 | 4 |
| coupArvnRedeployMandatory | 2 | 57.55 | 28.7767 | 30.3583 | 30.3583 | 11.5 | 1 | 0 | 1 | 1 | 0 | 0 | 1 |
| coupNvaRedeployTroops | 6 | 38.43 | 6.4049 | 7.6878 | 7.6878 | 4.5 | 5 | 0 | 1 | 5 | 0 | 0 | 5 |
| attack | 3 | 34 | 11.3321 | 12.7199 | 12.7199 | 53 | 3 | 0 | 0 | 3 | 0 | 0 | 3 |
| coupPacifyUS | 5 | 31.43 | 6.2867 | 8.5604 | 8.5604 | 2.8 | 5 | 0 | 0 | 5 | 0 | 0 | 5 |
| coupCommitmentPass | 8 | 21.82 | 2.7272 | 4.1052 | 4.1052 | 1 | 2 | 0 | 6 | 2 | 0 | 0 | 2 |
| march | 3 | 18.59 | 6.1953 | 8.9563 | 8.9563 | 3 | 1 | 0 | 2 | 1 | 0 | 0 | 1 |
| coupPacifyPass | 4 | 16.26 | 4.0656 | 5.6837 | 5.6837 | 1 | 3 | 0 | 1 | 3 | 0 | 0 | 3 |
| coupAgitateVC | 3 | 14.84 | 4.9454 | 5.6506 | 5.6506 | 2.3333 | 1 | 0 | 2 | 1 | 2 | 0 | 1 |
| coupPacifyARVN | 1 | 13.31 | 13.3132 | 13.3132 | 13.3132 | 6 | 0 | 0 | 1 | 0 | 0 | 0 | 0 |
| infiltrate | 2 | 12.45 | 6.2231 | 9.2892 | 9.2892 | 30.5 | 1 | 0 | 1 | 1 | 0 | 0 | 1 |
| coupVictoryCheck | 2 | 7.92 | 3.9591 | 4.9012 | 4.9012 | 1 | 2 | 0 | 0 | 2 | 0 | 0 | 2 |
| advise | 1 | 7.82 | 7.8243 | 7.8243 | 7.8243 | 12 | 1 | 0 | 0 | 1 | 0 | 0 | 1 |
| coupCommitmentResolve | 2 | 7.58 | 3.7877 | 3.9451 | 3.9451 | 2 | 0 | 0 | 2 | 0 | 0 | 0 | 0 |
| assault | 1 | 7.57 | 7.5685 | 7.5685 | 7.5685 | 4 | 1 | 0 | 0 | 1 | 1 | 0 | 1 |
| coupResourcesResolve | 2 | 7.32 | 3.6619 | 4.1115 | 4.1115 | 1 | 1 | 0 | 1 | 1 | 0 | 0 | 1 |
| coupAgitatePass | 2 | 6.66 | 3.3304 | 3.5481 | 3.5481 | 1.5 | 2 | 0 | 0 | 2 | 0 | 0 | 2 |
| event-decision:chooseNStep:add | 26 | 1.66 | 0.0637 | 0.0969 | 0.1412 | 11.5385 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseNStep:add | 19 | 1.11 | 0.0586 | 0.0783 | 0.0783 | 22.1053 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseNStep:confirm | 23 | 0.9 | 0.0392 | 0.0558 | 0.0823 | 3.8696 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseNStep:confirm | 28 | 0.9 | 0.0323 | 0.0441 | 0.0464 | 18.5357 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseOne | 19 | 0.6 | 0.0314 | 0.0465 | 0.0465 | 1.3158 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupNvaRedeployTroops:chooseOne | 17 | 0.59 | 0.0345 | 0.0486 | 0.0486 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseOne | 7 | 0.27 | 0.0392 | 0.0537 | 0.0537 | 3.1429 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:confirm | 8 | 0.26 | 0.033 | 0.0452 | 0.0452 | 3.875 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupCommitmentResolve:chooseNStep:confirm | 8 | 0.25 | 0.0315 | 0.0515 | 0.0515 | 9.25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:add | 3 | 0.23 | 0.0761 | 0.0879 | 0.0879 | 23 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| chooseNStep:chooseNStep:confirm | 3 | 0.14 | 0.0451 | 0.0526 | 0.0526 | 19.6667 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:confirm | 3 | 0.13 | 0.0419 | 0.0522 | 0.0522 | 4.6667 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseOne | 3 | 0.12 | 0.0384 | 0.0609 | 0.0609 | 1.6667 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:add | 2 | 0.1 | 0.0495 | 0.056 | 0.056 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:add | 1 | 0.09 | 0.0945 | 0.0945 | 0.0945 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:confirm | 2 | 0.07 | 0.0347 | 0.0373 | 0.0373 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseOne | 2 | 0.06 | 0.03 | 0.0315 | 0.0315 | 2.5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:add | 1 | 0.05 | 0.0536 | 0.0536 | 0.0536 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:confirm | 1 | 0.03 | 0.0334 | 0.0334 | 0.0334 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Top Hot Axes In Slow-Tier Seeds

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.

| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms |
|---:|---|---|---:|---:|---:|---:|---:|
| 1 | train:chooseNStep:add | continuedDeepening | 13 | 19136.85 | 1472.0653 | 3454.3876 | 3454.3876 |
| 2 | coupArvnRedeployPolice:chooseOne | continuedDeepening | 16 | 18380.85 | 1148.8032 | 2564.4529 | 2564.4529 |
| 3 | train:chooseNStep:confirm | continuedDeepening | 10 | 16060.36 | 1606.0359 | 3426.9275 | 3426.9275 |
| 4 | govern:chooseNStep:confirm | continuedDeepening | 5 | 8627.59 | 1725.5182 | 8078.5251 | 8078.5251 |
| 5 | govern:chooseNStep:add | continuedDeepening | 5 | 5689.4 | 1137.8801 | 4921.3749 | 4921.3749 |
| 6 | coupArvnRedeployMandatory:chooseOne | continuedDeepening | 12 | 2602.25 | 216.854 | 329.3058 | 329.3058 |
| 7 | transport:chooseOne | continuedDeepening | 8 | 2446.01 | 305.7514 | 887.5922 | 887.5922 |
| 8 | coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | 12 | 1989.23 | 165.7695 | 223.3357 | 223.3357 |
| 9 | event | singlePass | 29 | 1863.63 | 64.2631 | 101.1692 | 661.8005 |
| 10 | govern:chooseOne | continuedDeepening | 7 | 1355.82 | 193.6883 | 1161.4836 | 1161.4836 |

## Hot-Path Buckets For Top Slow Axes

Captured only when `--profile-buckets` is enabled. Buckets are timing/count diagnostics inside `PolicyAgent.chooseDecision`; they are not correctness assertions.

### train:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 26406 | 4506.19 |
| zobrist:encodeDecisionStackFrame | 26512 | 2731.61 |
| tokenStateIndex:refreshCachedEntries | 25401 | 349.98 |
| evalQuery:applyTokenFilter | 12246 | 80.04 |
| evalQuery:countMatchingTokens | 14869 | 25.03 |
| evalQuery:applyTokenFilterCacheHit | 27613 | 0 |
| evalQuery:applyTokenFilterCompiled | 11223 | 0 |
| evalQuery:countMatchingTokensCacheHit | 2568038 | 0 |
| evalQuery:countMatchingTokensCompiled | 14869 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 6799838 | 0 |
| tokenStateIndex:getCacheHit | 172010 | 0 |
| zobrist:decisionStackFrameEncodedChars | 567518101 | 0 |

### coupArvnRedeployPolice:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 592536 | 2972.42 |
| evalQuery:countMatchingTokens | 623336 | 960.82 |
| zobrist:digestDecisionStackFrame | 1536 | 74.34 |
| zobrist:encodeDecisionStackFrame | 1568 | 72.66 |
| evalQuery:applyTokenFilter | 110 | 0.29 |
| evalQuery:applyTokenFilterCacheHit | 88636 | 0 |
| evalQuery:applyTokenFilterCompiled | 110 | 0 |
| evalQuery:countMatchingTokensCacheHit | 17410496 | 0 |
| evalQuery:countMatchingTokensCompiled | 623336 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 58606051 | 0 |
| tokenStateIndex:getCacheHit | 592536 | 0 |
| zobrist:decisionStackFrameEncodedChars | 9048324 | 0 |

### train:chooseNStep:confirm | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 20860 | 3658.38 |
| zobrist:encodeDecisionStackFrame | 21222 | 2286.08 |
| tokenStateIndex:refreshCachedEntries | 16686 | 267.14 |
| evalQuery:applyTokenFilter | 7304 | 62.77 |
| evalQuery:countMatchingTokens | 8283 | 18.76 |
| evalQuery:applyTokenFilterCacheHit | 29518 | 0 |
| evalQuery:applyTokenFilterCompiled | 6512 | 0 |
| evalQuery:countMatchingTokensCacheHit | 2442375 | 0 |
| evalQuery:countMatchingTokensCompiled | 8283 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 6521800 | 0 |
| tokenStateIndex:getCacheHit | 129276 | 0 |
| zobrist:decisionStackFrameEncodedChars | 461522958 | 0 |

### govern:chooseNStep:confirm | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 19500 | 379.34 |
| evalQuery:applyTokenFilter | 193534 | 255.18 |
| zobrist:encodeDecisionStackFrame | 208 | 8.57 |
| evalQuery:countMatchingTokens | 4881 | 7.62 |
| zobrist:digestDecisionStackFrame | 126 | 6.42 |
| evalQuery:applyTokenFilterCacheHit | 7006 | 0 |
| evalQuery:applyTokenFilterCompiled | 193360 | 0 |
| evalQuery:countMatchingTokensCacheHit | 305975 | 0 |
| evalQuery:countMatchingTokensCompiled | 1309 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 738163 | 0 |
| tokenStateIndex:getCacheHit | 103146 | 0 |
| zobrist:decisionStackFrameEncodedChars | 803387 | 0 |

### govern:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 11273 | 217.3 |
| evalQuery:applyTokenFilter | 110751 | 157 |
| zobrist:digestDecisionStackFrame | 692 | 31.84 |
| zobrist:encodeDecisionStackFrame | 692 | 26.3 |
| evalQuery:countMatchingTokens | 4830 | 5.41 |
| evalQuery:applyTokenFilterCacheHit | 4089 | 0 |
| evalQuery:applyTokenFilterCompiled | 110577 | 0 |
| evalQuery:countMatchingTokensCacheHit | 241151 | 0 |
| evalQuery:countMatchingTokensCompiled | 1258 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 606474 | 0 |
| tokenStateIndex:getCacheHit | 72844 | 0 |
| zobrist:decisionStackFrameEncodedChars | 3934792 | 0 |

### coupArvnRedeployMandatory:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 61442 | 316.1 |
| evalQuery:countMatchingTokens | 75112 | 93.44 |
| zobrist:encodeDecisionStackFrame | 448 | 17.13 |
| zobrist:digestDecisionStackFrame | 412 | 14.2 |
| evalQuery:applyTokenFilter | 96 | 1.66 |
| evalQuery:applyTokenFilterCacheHit | 12032 | 0 |
| evalQuery:applyTokenFilterCompiled | 96 | 0 |
| evalQuery:countMatchingTokensCacheHit | 2251157 | 0 |
| evalQuery:countMatchingTokensCompiled | 75112 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 6633577 | 0 |
| tokenStateIndex:getCacheHit | 61442 | 0 |
| zobrist:decisionStackFrameEncodedChars | 1676869 | 0 |

### transport:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 20840 | 239.72 |
| evalQuery:applyTokenFilter | 18372 | 113.5 |
| evalQuery:countMatchingTokens | 25249 | 22.84 |
| zobrist:digestDecisionStackFrame | 28 | 4.1 |
| zobrist:encodeDecisionStackFrame | 28 | 2.86 |
| evalQuery:applyTokenFilterCacheHit | 71688 | 0 |
| evalQuery:applyTokenFilterCompiled | 17547 | 0 |
| evalQuery:countMatchingTokensCacheHit | 945717 | 0 |
| evalQuery:countMatchingTokensCompiled | 25249 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1996238 | 0 |
| tokenStateIndex:getCacheHit | 139040 | 0 |
| zobrist:decisionStackFrameEncodedChars | 515839 | 0 |

### coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 28788 | 221.79 |
| evalQuery:countMatchingTokens | 22504 | 22.32 |
| zobrist:encodeDecisionStackFrame | 96 | 3.44 |
| zobrist:digestDecisionStackFrame | 96 | 2.59 |
| evalQuery:applyTokenFilter | 280 | 0.68 |
| evalQuery:applyTokenFilterCacheHit | 18872 | 0 |
| evalQuery:applyTokenFilterCompiled | 280 | 0 |
| evalQuery:countMatchingTokensCacheHit | 2096753 | 0 |
| evalQuery:countMatchingTokensCompiled | 22504 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 4859476 | 0 |
| tokenStateIndex:getCacheHit | 28788 | 0 |
| zobrist:decisionStackFrameEncodedChars | 304884 | 0 |

### event | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| evalQuery:applyTokenFilter | 17906 | 77.35 |
| tokenStateIndex:refreshCachedEntries | 4060 | 76.24 |
| zobrist:digestDecisionStackFrame | 272 | 52.37 |
| zobrist:encodeDecisionStackFrame | 272 | 30.79 |
| evalQuery:countMatchingTokens | 8185 | 9.77 |
| policyWasmRuntime:encodeBytecodeInput | 304 | 9.09 |
| evalQuery:applyTokenFilterCacheHit | 4293 | 0 |
| evalQuery:applyTokenFilterCompiled | 17153 | 0 |
| evalQuery:countMatchingTokensCacheHit | 510787 | 0 |
| evalQuery:countMatchingTokensCompiled | 3101 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1068799 | 0 |
| policyWasmRuntime:encodedInputCacheMiss | 304 | 0 |

### govern:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 3187 | 58.14 |
| evalQuery:applyTokenFilter | 28112 | 49.08 |
| evalQuery:countMatchingTokens | 5667 | 9.34 |
| evalQuery:applyTokenFilterCacheHit | 1348 | 0 |
| evalQuery:applyTokenFilterCompiled | 27938 | 0 |
| evalQuery:countMatchingTokensCacheHit | 74389 | 0 |
| evalQuery:countMatchingTokensCompiled | 951 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 202896 | 0 |
| tokenStateIndex:getCacheHit | 42191 | 0 |
| zobrist:decisionStackFrameWeakCacheHit | 84 | 0 |


## Fast-Tier vs Slow-Tier Delta

Fast tier: `1000`, `1006`, `1007`, `1010`, `1014`. Rows with ratio greater than `3.0` satisfy the Phase 0 hot-axis criterion.

| Microturn class | Slow decisions | Fast decisions | Slow mean ms | Fast mean ms | Slow:fast ratio | Verdict |
|---|---:|---:|---:|---:|---:|---|

## Notes

- `elapsedMs` is measured around the per-decision `PolicyAgent.chooseDecision` call. It excludes simulator apply/delta work and report rendering.
- Child processes enforce the per-seed timeout. Each child loads the built engine and production FITL GameSpecDoc, using the repo GameDef cache when available.
- The script does not modify engine source or production profile data.
