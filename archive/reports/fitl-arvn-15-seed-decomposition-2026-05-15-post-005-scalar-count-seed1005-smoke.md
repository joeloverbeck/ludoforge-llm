# FITL ARVN 15-Seed Per-Microturn-Class Decomposition

**Status**: ✅ EXPLOITED — referenced during spec 174 implementation (archived 2026-05-16).

**Date**: 2026-05-15-post-005-scalar-count-seed1005-smoke
**Status**: Spec 173 measurement witness.
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005 --timeout-ms 400000 --date 2026-05-15-post-005-scalar-count-seed1005-smoke --profile-buckets`
**CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-005-scalar-count-seed1005-smoke.csv`

## Summary

- Seeds completed: 1/1
- Per-decision rows: 412
- Hot class with slow:fast ratio >3x: no
- Per-seed timeout: 400000 ms
- Hot-path buckets: enabled

## Per-Seed Wall Time

| Seed | Status | Stop Reason | Wall ms | Decisions | ms/decision | Error |
|---:|---|---|---:|---:|---:|---|
| 1005 | OK | terminal | 83043.7 | 412 | 201.5624 |  |

## Per-Microturn-Class Rollup

| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | Token index builds | Static rebuilds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| train:chooseNStep:add | 13 | 18452.02 | 1419.3862 | 3377.3906 | 3377.3906 | 13.4615 | 0 | 5541 | 12351 | 0 | 0 | 0 | 0 |
| coupArvnRedeployPolice:chooseOne | 16 | 17656.08 | 1103.5053 | 2459.5818 | 2459.5818 | 30.5 | 0 | 19852 | 680 | 0 | 0 | 0 | 0 |
| train:chooseNStep:confirm | 15 | 15481.41 | 1032.0938 | 3324.8045 | 3324.8045 | 10.6 | 0 | 4574 | 9720 | 0 | 0 | 0 | 0 |
| govern:chooseNStep:confirm | 5 | 8828.47 | 1765.6948 | 8253.6497 | 8253.6497 | 7.2 | 0 | 125 | 57 | 0 | 0 | 0 | 0 |
| govern:chooseNStep:add | 5 | 5905.75 | 1181.1504 | 5100.2883 | 5100.2883 | 6.2 | 0 | 150 | 289 | 0 | 0 | 0 | 0 |
| coupArvnRedeployMandatory:chooseOne | 12 | 2594.05 | 216.171 | 305.8846 | 305.8846 | 8 | 0 | 1428 | 204 | 0 | 0 | 0 | 0 |
| transport:chooseOne | 8 | 2258.62 | 282.3275 | 798.1216 | 798.1216 | 12.75 | 0 | 362 | 22 | 0 | 0 | 0 | 0 |
| coupArvnRedeployOptionalTroops:chooseOne | 12 | 1834.97 | 152.9142 | 215.9998 | 215.9998 | 8 | 0 | 420 | 60 | 0 | 0 | 0 | 0 |
| event | 29 | 1815.36 | 62.5985 | 91.9264 | 626.3154 | 21.0345 | 29 | 0 | 0 | 29 | 10 | 0 | 31 |
| govern:chooseOne | 7 | 1310.41 | 187.2013 | 1126.7641 | 1126.7641 | 2 | 0 | 7 | 7 | 0 | 0 | 0 | 0 |
| govern | 7 | 982.03 | 140.2906 | 653.4524 | 653.4524 | 10.5714 | 7 | 0 | 0 | 7 | 0 | 0 | 7 |
| train:chooseOne | 9 | 306.06 | 34.0068 | 50.0662 | 50.0662 | 2.3333 | 0 | 24 | 29 | 0 | 0 | 0 | 0 |
| rally | 19 | 303.4 | 15.9686 | 59.0369 | 59.0369 | 25.6316 | 15 | 0 | 4 | 15 | 4 | 0 | 15 |
| transport | 4 | 289.64 | 72.4107 | 96.5696 | 96.5696 | 11 | 4 | 0 | 0 | 4 | 0 | 0 | 4 |
| train | 5 | 160.6 | 32.1198 | 38.42 | 38.42 | 11.4 | 5 | 0 | 0 | 5 | 10 | 0 | 5 |
| coupArvnRedeployOptionalTroops | 6 | 142.55 | 23.7589 | 27.19 | 27.19 | 17.5 | 5 | 0 | 1 | 5 | 0 | 0 | 5 |
| coupArvnRedeployPolice | 6 | 128.7 | 21.4494 | 25.5143 | 25.5143 | 11.6667 | 6 | 0 | 0 | 6 | 0 | 0 | 6 |
| chooseOne:chooseOne | 3 | 119.17 | 39.7242 | 118.5559 | 118.5559 | 6.6667 | 0 | 4 | 1 | 0 | 0 | 0 | 0 |
| coupRedeployPass | 8 | 55.63 | 6.9536 | 21.8904 | 21.8904 | 3 | 4 | 0 | 4 | 4 | 13 | 0 | 4 |
| coupArvnRedeployMandatory | 2 | 51.87 | 25.9349 | 26.2021 | 26.2021 | 11.5 | 1 | 0 | 1 | 1 | 0 | 0 | 1 |
| coupNvaRedeployTroops | 6 | 34.36 | 5.7273 | 7.3116 | 7.3116 | 4.5 | 5 | 0 | 1 | 5 | 0 | 0 | 5 |
| attack | 3 | 30.83 | 10.2757 | 11.0242 | 11.0242 | 53 | 3 | 0 | 0 | 3 | 0 | 0 | 3 |
| coupPacifyUS | 5 | 30.43 | 6.0867 | 9.7021 | 9.7021 | 2.8 | 5 | 0 | 0 | 5 | 0 | 0 | 5 |
| coupCommitmentPass | 8 | 23.93 | 2.9913 | 3.4504 | 3.4504 | 1 | 2 | 0 | 6 | 2 | 0 | 0 | 2 |
| march | 3 | 18.22 | 6.0722 | 6.9868 | 6.9868 | 3 | 1 | 0 | 2 | 1 | 0 | 0 | 1 |
| infiltrate | 2 | 15.16 | 7.5821 | 12.1205 | 12.1205 | 30.5 | 1 | 0 | 1 | 1 | 0 | 0 | 1 |
| coupPacifyPass | 4 | 14.63 | 3.6571 | 4.4015 | 4.4015 | 1 | 3 | 0 | 1 | 3 | 0 | 0 | 3 |
| coupPacifyARVN | 1 | 12.49 | 12.488 | 12.488 | 12.488 | 6 | 0 | 0 | 1 | 0 | 0 | 0 | 0 |
| coupAgitateVC | 3 | 11.61 | 3.8686 | 4.0746 | 4.0746 | 2.3333 | 1 | 0 | 2 | 1 | 2 | 0 | 1 |
| advise | 1 | 8.11 | 8.1077 | 8.1077 | 8.1077 | 12 | 1 | 0 | 0 | 1 | 0 | 0 | 1 |
| coupCommitmentResolve | 2 | 7.73 | 3.8649 | 3.9704 | 3.9704 | 2 | 0 | 0 | 2 | 0 | 0 | 0 | 0 |
| assault | 1 | 7.19 | 7.1887 | 7.1887 | 7.1887 | 4 | 1 | 0 | 0 | 1 | 1 | 0 | 1 |
| coupResourcesResolve | 2 | 7.05 | 3.5272 | 4.039 | 4.039 | 1 | 1 | 0 | 1 | 1 | 0 | 0 | 1 |
| coupVictoryCheck | 2 | 6.56 | 3.2824 | 3.8973 | 3.8973 | 1 | 2 | 0 | 0 | 2 | 0 | 0 | 2 |
| coupAgitatePass | 2 | 6.37 | 3.184 | 3.3709 | 3.3709 | 1.5 | 2 | 0 | 0 | 2 | 0 | 0 | 2 |
| event-decision:chooseNStep:confirm | 23 | 2.3 | 0.1 | 0.0468 | 1.5996 | 3.8696 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseNStep:add | 26 | 1.46 | 0.0563 | 0.083 | 0.122 | 11.5385 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseNStep:add | 19 | 1.03 | 0.0545 | 0.0679 | 0.0679 | 22.1053 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseNStep:confirm | 28 | 0.87 | 0.0311 | 0.0434 | 0.0488 | 18.5357 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupNvaRedeployTroops:chooseOne | 17 | 0.61 | 0.0358 | 0.0508 | 0.0508 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseOne | 19 | 0.53 | 0.028 | 0.0411 | 0.0411 | 1.3158 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupCommitmentResolve:chooseNStep:confirm | 8 | 0.27 | 0.0332 | 0.058 | 0.058 | 9.25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseOne | 7 | 0.27 | 0.0392 | 0.0527 | 0.0527 | 3.1429 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:confirm | 8 | 0.24 | 0.03 | 0.0364 | 0.0364 | 3.875 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:add | 3 | 0.2 | 0.068 | 0.0743 | 0.0743 | 23 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseOne | 3 | 0.13 | 0.0441 | 0.0563 | 0.0563 | 1.6667 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:add | 1 | 0.12 | 0.1248 | 0.1248 | 0.1248 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| chooseNStep:chooseNStep:confirm | 3 | 0.12 | 0.0411 | 0.0484 | 0.0484 | 19.6667 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:add | 2 | 0.11 | 0.0534 | 0.0573 | 0.0573 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:confirm | 3 | 0.1 | 0.0339 | 0.0434 | 0.0434 | 4.6667 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:confirm | 2 | 0.08 | 0.0407 | 0.045 | 0.045 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseOne | 2 | 0.07 | 0.0339 | 0.038 | 0.038 | 2.5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:add | 1 | 0.05 | 0.0528 | 0.0528 | 0.0528 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:confirm | 1 | 0.04 | 0.0389 | 0.0389 | 0.0389 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Top Hot Axes In Slow-Tier Seeds

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.

| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms |
|---:|---|---|---:|---:|---:|---:|---:|
| 1 | train:chooseNStep:add | continuedDeepening | 13 | 18452.02 | 1419.3862 | 3377.3906 | 3377.3906 |
| 2 | coupArvnRedeployPolice:chooseOne | continuedDeepening | 16 | 17656.08 | 1103.5053 | 2459.5818 | 2459.5818 |
| 3 | train:chooseNStep:confirm | continuedDeepening | 10 | 15480.92 | 1548.0925 | 3324.8045 | 3324.8045 |
| 4 | govern:chooseNStep:confirm | continuedDeepening | 5 | 8828.47 | 1765.6948 | 8253.6497 | 8253.6497 |
| 5 | govern:chooseNStep:add | continuedDeepening | 5 | 5905.75 | 1181.1504 | 5100.2883 | 5100.2883 |
| 6 | coupArvnRedeployMandatory:chooseOne | continuedDeepening | 12 | 2594.05 | 216.171 | 305.8846 | 305.8846 |
| 7 | transport:chooseOne | continuedDeepening | 8 | 2258.62 | 282.3275 | 798.1216 | 798.1216 |
| 8 | coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | 12 | 1834.97 | 152.9142 | 215.9998 | 215.9998 |
| 9 | event | singlePass | 29 | 1815.36 | 62.5985 | 91.9264 | 626.3154 |
| 10 | govern:chooseOne | continuedDeepening | 7 | 1310.41 | 187.2013 | 1126.7641 | 1126.7641 |

## Hot-Path Buckets For Top Slow Axes

Captured only when `--profile-buckets` is enabled. Buckets are timing/count diagnostics inside `PolicyAgent.chooseDecision`; they are not correctness assertions.

### train:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 26406 | 4490.79 |
| zobrist:encodeDecisionStackFrame | 26512 | 2572.45 |
| tokenStateIndex:refreshCachedEntries | 25401 | 318.4 |
| evalQuery:applyTokenFilter | 12246 | 79.8 |
| evalQuery:countMatchingTokens | 8235 | 19.11 |
| evalQuery:countMatchingTokensScalarIndex | 5098 | 2.37 |
| evalQuery:applyTokenFilterCacheHit | 27613 | 0 |
| evalQuery:applyTokenFilterCompiled | 11223 | 0 |
| evalQuery:countMatchingTokensCacheHit | 2568038 | 0 |
| evalQuery:countMatchingTokensCompiled | 8235 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 6799838 | 0 |
| evalQuery:countMatchingTokensScalarIndexBuild | 5098 | 0 |

### coupArvnRedeployPolice:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 592536 | 2870.31 |
| evalQuery:countMatchingTokensScalarIndex | 306279 | 148.18 |
| zobrist:digestDecisionStackFrame | 1536 | 74.11 |
| zobrist:encodeDecisionStackFrame | 1568 | 68.6 |
| evalQuery:countMatchingTokens | 4674 | 8.6 |
| evalQuery:applyTokenFilter | 110 | 0.39 |
| evalQuery:applyTokenFilterCacheHit | 88636 | 0 |
| evalQuery:applyTokenFilterCompiled | 110 | 0 |
| evalQuery:countMatchingTokensCacheHit | 17410496 | 0 |
| evalQuery:countMatchingTokensCompiled | 4674 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 58606051 | 0 |
| evalQuery:countMatchingTokensScalarIndexBuild | 306279 | 0 |

### train:chooseNStep:confirm | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 20860 | 3645.71 |
| zobrist:encodeDecisionStackFrame | 21222 | 2118.43 |
| tokenStateIndex:refreshCachedEntries | 16686 | 261.93 |
| evalQuery:applyTokenFilter | 7304 | 63.47 |
| evalQuery:countMatchingTokens | 5724 | 14.67 |
| evalQuery:countMatchingTokensScalarIndex | 2229 | 1 |
| evalQuery:applyTokenFilterCacheHit | 29518 | 0 |
| evalQuery:applyTokenFilterCompiled | 6512 | 0 |
| evalQuery:countMatchingTokensCacheHit | 2442375 | 0 |
| evalQuery:countMatchingTokensCompiled | 5724 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 6521800 | 0 |
| evalQuery:countMatchingTokensScalarIndexBuild | 2229 | 0 |

### govern:chooseNStep:confirm | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 19500 | 382.65 |
| evalQuery:applyTokenFilter | 193534 | 265.79 |
| zobrist:encodeDecisionStackFrame | 208 | 8.59 |
| zobrist:digestDecisionStackFrame | 126 | 6.48 |
| evalQuery:countMatchingTokens | 4770 | 6.38 |
| evalQuery:countMatchingTokensScalarIndex | 111 | 0.11 |
| evalQuery:applyTokenFilterCacheHit | 7006 | 0 |
| evalQuery:applyTokenFilterCompiled | 193360 | 0 |
| evalQuery:countMatchingTokensCacheHit | 305975 | 0 |
| evalQuery:countMatchingTokensCompiled | 1198 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 738163 | 0 |
| evalQuery:countMatchingTokensScalarIndexBuild | 111 | 0 |

### govern:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 11273 | 230.16 |
| evalQuery:applyTokenFilter | 110751 | 176.89 |
| zobrist:digestDecisionStackFrame | 692 | 32.59 |
| zobrist:encodeDecisionStackFrame | 692 | 28.23 |
| evalQuery:countMatchingTokens | 4604 | 7.18 |
| evalQuery:countMatchingTokensScalarIndex | 73 | 0.08 |
| evalQuery:applyTokenFilterCacheHit | 4089 | 0 |
| evalQuery:applyTokenFilterCompiled | 110577 | 0 |
| evalQuery:countMatchingTokensCacheHit | 241151 | 0 |
| evalQuery:countMatchingTokensCompiled | 1032 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 606474 | 0 |
| evalQuery:countMatchingTokensScalarIndexBuild | 73 | 0 |

### coupArvnRedeployMandatory:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 61442 | 328.44 |
| evalQuery:countMatchingTokens | 20350 | 26.2 |
| zobrist:encodeDecisionStackFrame | 448 | 17.62 |
| zobrist:digestDecisionStackFrame | 412 | 13.89 |
| evalQuery:countMatchingTokensScalarIndex | 26557 | 10.55 |
| evalQuery:applyTokenFilter | 96 | 0.35 |
| evalQuery:applyTokenFilterCacheHit | 12032 | 0 |
| evalQuery:applyTokenFilterCompiled | 96 | 0 |
| evalQuery:countMatchingTokensCacheHit | 2251157 | 0 |
| evalQuery:countMatchingTokensCompiled | 20350 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 6633577 | 0 |
| evalQuery:countMatchingTokensScalarIndexBuild | 26557 | 0 |

### transport:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 20840 | 211.23 |
| evalQuery:applyTokenFilter | 18372 | 105.09 |
| evalQuery:countMatchingTokens | 5048 | 4.99 |
| zobrist:digestDecisionStackFrame | 28 | 4.15 |
| zobrist:encodeDecisionStackFrame | 28 | 2.73 |
| evalQuery:countMatchingTokensScalarIndex | 4476 | 1.87 |
| evalQuery:applyTokenFilterCacheHit | 71688 | 0 |
| evalQuery:applyTokenFilterCompiled | 17547 | 0 |
| evalQuery:countMatchingTokensCacheHit | 945717 | 0 |
| evalQuery:countMatchingTokensCompiled | 5048 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1996238 | 0 |
| evalQuery:countMatchingTokensScalarIndexBuild | 4476 | 0 |

### coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 28788 | 199.1 |
| zobrist:encodeDecisionStackFrame | 96 | 3.26 |
| evalQuery:countMatchingTokensScalarIndex | 9408 | 3.06 |
| zobrist:digestDecisionStackFrame | 96 | 2.49 |
| evalQuery:countMatchingTokens | 1250 | 2.04 |
| evalQuery:applyTokenFilter | 280 | 0.8 |
| evalQuery:applyTokenFilterCacheHit | 18872 | 0 |
| evalQuery:applyTokenFilterCompiled | 280 | 0 |
| evalQuery:countMatchingTokensCacheHit | 2096753 | 0 |
| evalQuery:countMatchingTokensCompiled | 1250 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 4859476 | 0 |
| evalQuery:countMatchingTokensScalarIndexBuild | 9408 | 0 |

### event | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 4060 | 66.45 |
| evalQuery:applyTokenFilter | 17906 | 63.25 |
| zobrist:digestDecisionStackFrame | 272 | 52.28 |
| zobrist:encodeDecisionStackFrame | 272 | 30.93 |
| policyWasmRuntime:encodeBytecodeInput | 304 | 9.08 |
| evalQuery:countMatchingTokens | 6076 | 8.11 |
| evalQuery:countMatchingTokensScalarIndex | 632 | 0.32 |
| evalQuery:applyTokenFilterCacheHit | 4293 | 0 |
| evalQuery:applyTokenFilterCompiled | 17153 | 0 |
| evalQuery:countMatchingTokensCacheHit | 510787 | 0 |
| evalQuery:countMatchingTokensCompiled | 992 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1068799 | 0 |

### govern:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 3187 | 61.89 |
| evalQuery:applyTokenFilter | 28112 | 42.9 |
| evalQuery:countMatchingTokens | 5187 | 5.32 |
| evalQuery:countMatchingTokensScalarIndex | 106 | 0.08 |
| evalQuery:applyTokenFilterCacheHit | 1348 | 0 |
| evalQuery:applyTokenFilterCompiled | 27938 | 0 |
| evalQuery:countMatchingTokensCacheHit | 74389 | 0 |
| evalQuery:countMatchingTokensCompiled | 471 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 202896 | 0 |
| evalQuery:countMatchingTokensScalarIndexBuild | 106 | 0 |
| evalQuery:countMatchingTokensScalarIndexBuildItems | 548 | 0 |
| evalQuery:countMatchingTokensScalarIndexCount | 480 | 0 |


## Fast-Tier vs Slow-Tier Delta

Fast tier: `1000`, `1006`, `1007`, `1010`, `1014`. Rows with ratio greater than `3.0` satisfy the Phase 0 hot-axis criterion.

| Microturn class | Slow decisions | Fast decisions | Slow mean ms | Fast mean ms | Slow:fast ratio | Verdict |
|---|---:|---:|---:|---:|---:|---|

## Notes

- `elapsedMs` is measured around the per-decision `PolicyAgent.chooseDecision` call. It excludes simulator apply/delta work and report rendering.
- Child processes enforce the per-seed timeout. Each child loads the built engine and production FITL GameSpecDoc, using the repo GameDef cache when available.
- The script does not modify engine source or production profile data.
