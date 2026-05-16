# FITL ARVN 15-Seed Per-Microturn-Class Decomposition

**Status**: ✅ EXPLOITED — referenced during spec 174 implementation (archived 2026-05-16).

**Date**: 2026-05-15-post-005-zone-scan-seed1005-smoke
**Status**: Spec 173 measurement witness.
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005 --timeout-ms 400000 --date 2026-05-15-post-005-zone-scan-seed1005-smoke --profile-buckets`
**CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-005-zone-scan-seed1005-smoke.csv`

## Summary

- Seeds completed: 1/1
- Per-decision rows: 412
- Hot class with slow:fast ratio >3x: no
- Per-seed timeout: 400000 ms
- Hot-path buckets: enabled

## Per-Seed Wall Time

| Seed | Status | Stop Reason | Wall ms | Decisions | ms/decision | Error |
|---:|---|---|---:|---:|---:|---|
| 1005 | OK | terminal | 84338.28 | 412 | 204.7046 |  |

## Per-Microturn-Class Rollup

| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | Token index builds | Static rebuilds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| train:chooseNStep:add | 13 | 19052.62 | 1465.586 | 3424.4536 | 3424.4536 | 13.4615 | 0 | 5541 | 12351 | 0 | 0 | 0 | 0 |
| coupArvnRedeployPolice:chooseOne | 16 | 18376.18 | 1148.5112 | 2505.6724 | 2505.6724 | 30.5 | 0 | 19852 | 680 | 0 | 0 | 0 | 0 |
| train:chooseNStep:confirm | 15 | 15774.33 | 1051.6222 | 3416.5773 | 3416.5773 | 10.6 | 0 | 4574 | 9720 | 0 | 0 | 0 | 0 |
| govern:chooseNStep:confirm | 5 | 8566.7 | 1713.3408 | 8009.7495 | 8009.7495 | 7.2 | 0 | 125 | 57 | 0 | 0 | 0 | 0 |
| govern:chooseNStep:add | 5 | 5625.26 | 1125.0517 | 4856.0105 | 4856.0105 | 6.2 | 0 | 150 | 289 | 0 | 0 | 0 | 0 |
| coupArvnRedeployMandatory:chooseOne | 12 | 2625.92 | 218.8263 | 315.7593 | 315.7593 | 8 | 0 | 1428 | 204 | 0 | 0 | 0 | 0 |
| transport:chooseOne | 8 | 2230.33 | 278.7914 | 784.8365 | 784.8365 | 12.75 | 0 | 362 | 22 | 0 | 0 | 0 | 0 |
| coupArvnRedeployOptionalTroops:chooseOne | 12 | 1950.64 | 162.5534 | 220.3367 | 220.3367 | 8 | 0 | 420 | 60 | 0 | 0 | 0 | 0 |
| event | 29 | 1795.69 | 61.9203 | 95.9945 | 619.3453 | 21.0345 | 29 | 0 | 0 | 29 | 10 | 0 | 31 |
| govern:chooseOne | 7 | 1344.09 | 192.0123 | 1160.9014 | 1160.9014 | 2 | 0 | 7 | 7 | 0 | 0 | 0 | 0 |
| govern | 7 | 976.88 | 139.5546 | 649.4588 | 649.4588 | 10.5714 | 7 | 0 | 0 | 7 | 0 | 0 | 7 |
| rally | 19 | 309.27 | 16.2772 | 57.6634 | 57.6634 | 25.6316 | 15 | 0 | 4 | 15 | 4 | 0 | 15 |
| train:chooseOne | 9 | 304.98 | 33.8864 | 46.1833 | 46.1833 | 2.3333 | 0 | 24 | 29 | 0 | 0 | 0 | 0 |
| transport | 4 | 290.45 | 72.6122 | 99.731 | 99.731 | 11 | 4 | 0 | 0 | 4 | 0 | 0 | 4 |
| train | 5 | 161.81 | 32.3629 | 39.088 | 39.088 | 11.4 | 5 | 0 | 0 | 5 | 10 | 0 | 5 |
| coupArvnRedeployOptionalTroops | 6 | 152.37 | 25.3953 | 27.9133 | 27.9133 | 17.5 | 5 | 0 | 1 | 5 | 0 | 0 | 5 |
| coupArvnRedeployPolice | 6 | 139.16 | 23.1925 | 25.8277 | 25.8277 | 11.6667 | 6 | 0 | 0 | 6 | 0 | 0 | 6 |
| chooseOne:chooseOne | 3 | 100.76 | 33.5871 | 100.1536 | 100.1536 | 6.6667 | 0 | 4 | 1 | 0 | 0 | 0 | 0 |
| coupRedeployPass | 8 | 56.67 | 7.0834 | 22.2839 | 22.2839 | 3 | 4 | 0 | 4 | 4 | 13 | 0 | 4 |
| coupArvnRedeployMandatory | 2 | 53.84 | 26.9189 | 27.5054 | 27.5054 | 11.5 | 1 | 0 | 1 | 1 | 0 | 0 | 1 |
| coupNvaRedeployTroops | 6 | 37.13 | 6.1876 | 7.6117 | 7.6117 | 4.5 | 5 | 0 | 1 | 5 | 0 | 0 | 5 |
| attack | 3 | 34.04 | 11.3452 | 13.4246 | 13.4246 | 53 | 3 | 0 | 0 | 3 | 0 | 0 | 3 |
| coupPacifyUS | 5 | 29.82 | 5.965 | 9.0301 | 9.0301 | 2.8 | 5 | 0 | 0 | 5 | 0 | 0 | 5 |
| coupCommitmentPass | 8 | 23.14 | 2.8929 | 3.8021 | 3.8021 | 1 | 2 | 0 | 6 | 2 | 0 | 0 | 2 |
| march | 3 | 19.79 | 6.5961 | 8.3745 | 8.3745 | 3 | 1 | 0 | 2 | 1 | 0 | 0 | 1 |
| coupPacifyPass | 4 | 14.96 | 3.7399 | 5.5245 | 5.5245 | 1 | 3 | 0 | 1 | 3 | 0 | 0 | 3 |
| infiltrate | 2 | 13.82 | 6.9109 | 10.9695 | 10.9695 | 30.5 | 1 | 0 | 1 | 1 | 0 | 0 | 1 |
| coupAgitateVC | 3 | 13.44 | 4.4798 | 5.4915 | 5.4915 | 2.3333 | 1 | 0 | 2 | 1 | 2 | 0 | 1 |
| coupPacifyARVN | 1 | 12.43 | 12.4259 | 12.4259 | 12.4259 | 6 | 0 | 0 | 1 | 0 | 0 | 0 | 0 |
| coupCommitmentResolve | 2 | 9.38 | 4.6918 | 5.4416 | 5.4416 | 2 | 0 | 0 | 2 | 0 | 0 | 0 | 0 |
| coupAgitatePass | 2 | 8.47 | 4.235 | 5.3507 | 5.3507 | 1.5 | 2 | 0 | 0 | 2 | 0 | 0 | 2 |
| assault | 1 | 8.06 | 8.0647 | 8.0647 | 8.0647 | 4 | 1 | 0 | 0 | 1 | 1 | 0 | 1 |
| coupResourcesResolve | 2 | 7.16 | 3.5786 | 3.9287 | 3.9287 | 1 | 1 | 0 | 1 | 1 | 0 | 0 | 1 |
| advise | 1 | 6.64 | 6.6432 | 6.6432 | 6.6432 | 12 | 1 | 0 | 0 | 1 | 0 | 0 | 1 |
| coupVictoryCheck | 2 | 6.45 | 3.2249 | 3.8348 | 3.8348 | 1 | 2 | 0 | 0 | 2 | 0 | 0 | 2 |
| event-decision:chooseNStep:add | 26 | 1.32 | 0.0509 | 0.0699 | 0.1003 | 11.5385 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseNStep:add | 19 | 1.03 | 0.0542 | 0.0708 | 0.0708 | 22.1053 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseNStep:confirm | 28 | 0.91 | 0.0325 | 0.0549 | 0.0679 | 18.5357 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupNvaRedeployTroops:chooseOne | 17 | 0.73 | 0.0427 | 0.0627 | 0.0627 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseNStep:confirm | 23 | 0.67 | 0.0292 | 0.044 | 0.0496 | 3.8696 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseOne | 19 | 0.64 | 0.0339 | 0.0822 | 0.0822 | 1.3158 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:confirm | 8 | 0.36 | 0.0446 | 0.0657 | 0.0657 | 3.875 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseOne | 7 | 0.28 | 0.0396 | 0.0753 | 0.0753 | 3.1429 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupCommitmentResolve:chooseNStep:confirm | 8 | 0.26 | 0.032 | 0.0632 | 0.0632 | 9.25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:add | 3 | 0.25 | 0.082 | 0.0941 | 0.0941 | 23 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| chooseNStep:chooseNStep:confirm | 3 | 0.13 | 0.0425 | 0.0567 | 0.0567 | 19.6667 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:confirm | 2 | 0.12 | 0.0587 | 0.0772 | 0.0772 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseOne | 3 | 0.11 | 0.0353 | 0.0475 | 0.0475 | 1.6667 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:add | 1 | 0.1 | 0.0989 | 0.0989 | 0.0989 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:add | 2 | 0.1 | 0.0505 | 0.0615 | 0.0615 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:confirm | 3 | 0.1 | 0.0334 | 0.0419 | 0.0419 | 4.6667 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseOne | 2 | 0.06 | 0.0297 | 0.0325 | 0.0325 | 2.5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:add | 1 | 0.05 | 0.0497 | 0.0497 | 0.0497 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:confirm | 1 | 0.03 | 0.0343 | 0.0343 | 0.0343 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Top Hot Axes In Slow-Tier Seeds

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.

| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms |
|---:|---|---|---:|---:|---:|---:|---:|
| 1 | train:chooseNStep:add | continuedDeepening | 13 | 19052.62 | 1465.586 | 3424.4536 | 3424.4536 |
| 2 | coupArvnRedeployPolice:chooseOne | continuedDeepening | 16 | 18376.18 | 1148.5112 | 2505.6724 | 2505.6724 |
| 3 | train:chooseNStep:confirm | continuedDeepening | 10 | 15773.86 | 1577.3859 | 3416.5773 | 3416.5773 |
| 4 | govern:chooseNStep:confirm | continuedDeepening | 5 | 8566.7 | 1713.3408 | 8009.7495 | 8009.7495 |
| 5 | govern:chooseNStep:add | continuedDeepening | 5 | 5625.26 | 1125.0517 | 4856.0105 | 4856.0105 |
| 6 | coupArvnRedeployMandatory:chooseOne | continuedDeepening | 12 | 2625.92 | 218.8263 | 315.7593 | 315.7593 |
| 7 | transport:chooseOne | continuedDeepening | 8 | 2230.33 | 278.7914 | 784.8365 | 784.8365 |
| 8 | coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | 12 | 1950.64 | 162.5534 | 220.3367 | 220.3367 |
| 9 | event | singlePass | 29 | 1795.69 | 61.9203 | 95.9945 | 619.3453 |
| 10 | govern:chooseOne | continuedDeepening | 7 | 1344.09 | 192.0123 | 1160.9014 | 1160.9014 |

## Hot-Path Buckets For Top Slow Axes

Captured only when `--profile-buckets` is enabled. Buckets are timing/count diagnostics inside `PolicyAgent.chooseDecision`; they are not correctness assertions.

### train:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 26406 | 4536.43 |
| zobrist:encodeDecisionStackFrame | 26512 | 2685.9 |
| tokenStateIndex:refreshCachedEntries | 25401 | 304.27 |
| evalQuery:applyTokenFilter | 12246 | 85.12 |
| evalQuery:countMatchingTokens | 14869 | 23 |
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
| tokenStateIndex:refreshCachedEntries | 592536 | 2603.14 |
| evalQuery:countMatchingTokens | 623336 | 964.5 |
| zobrist:digestDecisionStackFrame | 1536 | 75.06 |
| zobrist:encodeDecisionStackFrame | 1568 | 71.34 |
| evalQuery:applyTokenFilter | 110 | 0.44 |
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
| zobrist:digestDecisionStackFrame | 20860 | 3674.63 |
| zobrist:encodeDecisionStackFrame | 21222 | 2232.97 |
| tokenStateIndex:refreshCachedEntries | 16686 | 229.8 |
| evalQuery:applyTokenFilter | 7304 | 53.06 |
| evalQuery:countMatchingTokens | 8283 | 18.17 |
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
| tokenStateIndex:refreshCachedEntries | 19500 | 360.11 |
| evalQuery:applyTokenFilter | 193534 | 260.29 |
| zobrist:encodeDecisionStackFrame | 208 | 8.41 |
| zobrist:digestDecisionStackFrame | 126 | 6.44 |
| evalQuery:countMatchingTokens | 4881 | 5.69 |
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
| tokenStateIndex:refreshCachedEntries | 11273 | 207.55 |
| evalQuery:applyTokenFilter | 110751 | 162.31 |
| zobrist:digestDecisionStackFrame | 692 | 32.43 |
| zobrist:encodeDecisionStackFrame | 692 | 25.38 |
| evalQuery:countMatchingTokens | 4830 | 5.31 |
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
| tokenStateIndex:refreshCachedEntries | 61442 | 287.55 |
| evalQuery:countMatchingTokens | 75112 | 89.82 |
| zobrist:encodeDecisionStackFrame | 448 | 17.49 |
| zobrist:digestDecisionStackFrame | 412 | 14.19 |
| evalQuery:applyTokenFilter | 96 | 0.44 |
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
| tokenStateIndex:refreshCachedEntries | 20840 | 176.24 |
| evalQuery:applyTokenFilter | 18372 | 113.21 |
| evalQuery:countMatchingTokens | 25249 | 20.49 |
| zobrist:digestDecisionStackFrame | 28 | 4.03 |
| zobrist:encodeDecisionStackFrame | 28 | 2.75 |
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
| tokenStateIndex:refreshCachedEntries | 28788 | 209.13 |
| evalQuery:countMatchingTokens | 22504 | 19.89 |
| zobrist:encodeDecisionStackFrame | 96 | 3.29 |
| zobrist:digestDecisionStackFrame | 96 | 2.58 |
| evalQuery:applyTokenFilter | 280 | 0.79 |
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
| evalQuery:applyTokenFilter | 17906 | 73.02 |
| tokenStateIndex:refreshCachedEntries | 4060 | 55.64 |
| zobrist:digestDecisionStackFrame | 272 | 51.67 |
| zobrist:encodeDecisionStackFrame | 272 | 33.32 |
| evalQuery:countMatchingTokens | 8185 | 11.81 |
| policyWasmRuntime:encodeBytecodeInput | 304 | 9.17 |
| evalQuery:applyTokenFilterCacheHit | 4293 | 0 |
| evalQuery:applyTokenFilterCompiled | 17153 | 0 |
| evalQuery:countMatchingTokensCacheHit | 510787 | 0 |
| evalQuery:countMatchingTokensCompiled | 3101 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1068799 | 0 |
| policyWasmRuntime:encodedInputCacheMiss | 304 | 0 |

### govern:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 3187 | 60.38 |
| evalQuery:applyTokenFilter | 28112 | 45.65 |
| evalQuery:countMatchingTokens | 5667 | 8.58 |
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
