# FITL ARVN 15-Seed Per-Microturn-Class Decomposition

**Date**: 2026-05-15-post-005-same-zone-noop-seed1005-smoke
**Status**: Spec 173 measurement witness.
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005 --timeout-ms 400000 --date 2026-05-15-post-005-same-zone-noop-seed1005-smoke --profile-buckets`
**CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-005-same-zone-noop-seed1005-smoke.csv`

## Summary

- Seeds completed: 1/1
- Per-decision rows: 412
- Hot class with slow:fast ratio >3x: no
- Per-seed timeout: 400000 ms
- Hot-path buckets: enabled

## Per-Seed Wall Time

| Seed | Status | Stop Reason | Wall ms | Decisions | ms/decision | Error |
|---:|---|---|---:|---:|---:|---|
| 1005 | OK | terminal | 85922.4 | 412 | 208.5495 |  |

## Per-Microturn-Class Rollup

| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | Token index builds | Static rebuilds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| train:chooseNStep:add | 13 | 19063.01 | 1466.3851 | 3350.4878 | 3350.4878 | 13.4615 | 0 | 5541 | 12351 | 0 | 0 | 0 | 0 |
| coupArvnRedeployPolice:chooseOne | 16 | 18371.17 | 1148.1984 | 2536.6413 | 2536.6413 | 30.5 | 0 | 19852 | 680 | 0 | 0 | 0 | 0 |
| train:chooseNStep:confirm | 15 | 15925.53 | 1061.7019 | 3374.0094 | 3374.0094 | 10.6 | 0 | 4574 | 9720 | 0 | 0 | 0 | 0 |
| govern:chooseNStep:confirm | 5 | 9315.26 | 1863.052 | 8714.552 | 8714.552 | 7.2 | 0 | 125 | 57 | 0 | 0 | 0 | 0 |
| govern:chooseNStep:add | 5 | 6004.43 | 1200.8851 | 5212.6228 | 5212.6228 | 6.2 | 0 | 150 | 289 | 0 | 0 | 0 | 0 |
| coupArvnRedeployMandatory:chooseOne | 12 | 2498.64 | 208.2199 | 306.9366 | 306.9366 | 8 | 0 | 1428 | 204 | 0 | 0 | 0 | 0 |
| transport:chooseOne | 8 | 2351.54 | 293.9431 | 818.461 | 818.461 | 12.75 | 0 | 362 | 22 | 0 | 0 | 0 | 0 |
| coupArvnRedeployOptionalTroops:chooseOne | 12 | 1953.59 | 162.7996 | 233.8971 | 233.8971 | 8 | 0 | 420 | 60 | 0 | 0 | 0 | 0 |
| event | 29 | 1841.96 | 63.5159 | 93.1129 | 649.223 | 21.0345 | 29 | 0 | 0 | 29 | 10 | 0 | 31 |
| govern:chooseOne | 7 | 1364.24 | 194.8917 | 1180.7751 | 1180.7751 | 2 | 0 | 7 | 7 | 0 | 0 | 0 | 0 |
| govern | 7 | 1043.4 | 149.0573 | 709.7712 | 709.7712 | 10.5714 | 7 | 0 | 0 | 7 | 0 | 0 | 7 |
| train:chooseOne | 9 | 326.81 | 36.3118 | 51.0385 | 51.0385 | 2.3333 | 0 | 24 | 29 | 0 | 0 | 0 | 0 |
| transport | 4 | 317.47 | 79.3666 | 102.6488 | 102.6488 | 11 | 4 | 0 | 0 | 4 | 0 | 0 | 4 |
| rally | 19 | 312.22 | 16.4324 | 55.1638 | 55.1638 | 25.6316 | 15 | 0 | 4 | 15 | 4 | 0 | 15 |
| train | 5 | 164.1 | 32.8206 | 41.7545 | 41.7545 | 11.4 | 5 | 0 | 0 | 5 | 10 | 0 | 5 |
| coupArvnRedeployOptionalTroops | 6 | 147.31 | 24.5522 | 29.2287 | 29.2287 | 17.5 | 5 | 0 | 1 | 5 | 0 | 0 | 5 |
| coupArvnRedeployPolice | 6 | 139.33 | 23.2218 | 25.4952 | 25.4952 | 11.6667 | 6 | 0 | 0 | 6 | 0 | 0 | 6 |
| chooseOne:chooseOne | 3 | 102.64 | 34.2126 | 102.0317 | 102.0317 | 6.6667 | 0 | 4 | 1 | 0 | 0 | 0 | 0 |
| coupRedeployPass | 8 | 64.62 | 8.0777 | 23.7067 | 23.7067 | 3 | 4 | 0 | 4 | 4 | 13 | 0 | 4 |
| coupArvnRedeployMandatory | 2 | 57.81 | 28.9034 | 29.1484 | 29.1484 | 11.5 | 1 | 0 | 1 | 1 | 0 | 0 | 1 |
| coupNvaRedeployTroops | 6 | 35.16 | 5.8601 | 8.2902 | 8.2902 | 4.5 | 5 | 0 | 1 | 5 | 0 | 0 | 5 |
| coupPacifyUS | 5 | 31.62 | 6.3239 | 8.2017 | 8.2017 | 2.8 | 5 | 0 | 0 | 5 | 0 | 0 | 5 |
| attack | 3 | 28.22 | 9.4073 | 10.4502 | 10.4502 | 53 | 3 | 0 | 0 | 3 | 0 | 0 | 3 |
| coupCommitmentPass | 8 | 26.11 | 3.2632 | 4.8955 | 4.8955 | 1 | 2 | 0 | 6 | 2 | 0 | 0 | 2 |
| march | 3 | 18.34 | 6.1136 | 6.8535 | 6.8535 | 3 | 1 | 0 | 2 | 1 | 0 | 0 | 1 |
| coupPacifyPass | 4 | 16.98 | 4.2456 | 5.8356 | 5.8356 | 1 | 3 | 0 | 1 | 3 | 0 | 0 | 3 |
| coupAgitateVC | 3 | 14.99 | 4.996 | 5.6377 | 5.6377 | 2.3333 | 1 | 0 | 2 | 1 | 2 | 0 | 1 |
| infiltrate | 2 | 14.17 | 7.0857 | 11.3973 | 11.3973 | 30.5 | 1 | 0 | 1 | 1 | 0 | 0 | 1 |
| coupPacifyARVN | 1 | 13.5 | 13.4992 | 13.4992 | 13.4992 | 6 | 0 | 0 | 1 | 0 | 0 | 0 | 0 |
| coupCommitmentResolve | 2 | 10.46 | 5.2324 | 6.053 | 6.053 | 2 | 0 | 0 | 2 | 0 | 0 | 0 | 0 |
| assault | 1 | 9.39 | 9.3868 | 9.3868 | 9.3868 | 4 | 1 | 0 | 0 | 1 | 1 | 0 | 1 |
| coupResourcesResolve | 2 | 8.76 | 4.3824 | 5.0265 | 5.0265 | 1 | 1 | 0 | 1 | 1 | 0 | 0 | 1 |
| coupAgitatePass | 2 | 6.81 | 3.407 | 3.5755 | 3.5755 | 1.5 | 2 | 0 | 0 | 2 | 0 | 0 | 2 |
| coupVictoryCheck | 2 | 6.68 | 3.3401 | 4.0732 | 4.0732 | 1 | 2 | 0 | 0 | 2 | 0 | 0 | 2 |
| advise | 1 | 6.64 | 6.6448 | 6.6448 | 6.6448 | 12 | 1 | 0 | 0 | 1 | 0 | 0 | 1 |
| event-decision:chooseNStep:add | 26 | 1.35 | 0.0521 | 0.0811 | 0.1142 | 11.5385 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseNStep:add | 19 | 1.09 | 0.0575 | 0.0973 | 0.0973 | 22.1053 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseNStep:confirm | 28 | 0.87 | 0.0312 | 0.0448 | 0.054 | 18.5357 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupNvaRedeployTroops:chooseOne | 17 | 0.65 | 0.0383 | 0.0488 | 0.0488 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseNStep:confirm | 23 | 0.64 | 0.0277 | 0.0335 | 0.0515 | 3.8696 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseOne | 19 | 0.62 | 0.0324 | 0.0901 | 0.0901 | 1.3158 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupCommitmentResolve:chooseNStep:confirm | 8 | 0.26 | 0.0322 | 0.0567 | 0.0567 | 9.25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:confirm | 8 | 0.26 | 0.0325 | 0.0469 | 0.0469 | 3.875 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseOne | 7 | 0.25 | 0.0362 | 0.0514 | 0.0514 | 3.1429 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:add | 3 | 0.21 | 0.0689 | 0.0714 | 0.0714 | 23 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| chooseNStep:chooseNStep:confirm | 3 | 0.12 | 0.0401 | 0.0493 | 0.0493 | 19.6667 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:confirm | 3 | 0.1 | 0.0326 | 0.0409 | 0.0409 | 4.6667 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseOne | 3 | 0.1 | 0.0323 | 0.0467 | 0.0467 | 1.6667 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:confirm | 1 | 0.09 | 0.0875 | 0.0875 | 0.0875 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:add | 1 | 0.09 | 0.0935 | 0.0935 | 0.0935 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:add | 2 | 0.09 | 0.044 | 0.0475 | 0.0475 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseOne | 2 | 0.08 | 0.0379 | 0.0452 | 0.0452 | 2.5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:confirm | 2 | 0.07 | 0.034 | 0.039 | 0.039 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:add | 1 | 0.06 | 0.0583 | 0.0583 | 0.0583 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Top Hot Axes In Slow-Tier Seeds

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.

| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms |
|---:|---|---|---:|---:|---:|---:|---:|
| 1 | train:chooseNStep:add | continuedDeepening | 13 | 19063.01 | 1466.3851 | 3350.4878 | 3350.4878 |
| 2 | coupArvnRedeployPolice:chooseOne | continuedDeepening | 16 | 18371.17 | 1148.1984 | 2536.6413 | 2536.6413 |
| 3 | train:chooseNStep:confirm | continuedDeepening | 10 | 15925.03 | 1592.5028 | 3374.0094 | 3374.0094 |
| 4 | govern:chooseNStep:confirm | continuedDeepening | 5 | 9315.26 | 1863.052 | 8714.552 | 8714.552 |
| 5 | govern:chooseNStep:add | continuedDeepening | 5 | 6004.43 | 1200.8851 | 5212.6228 | 5212.6228 |
| 6 | coupArvnRedeployMandatory:chooseOne | continuedDeepening | 12 | 2498.64 | 208.2199 | 306.9366 | 306.9366 |
| 7 | transport:chooseOne | continuedDeepening | 8 | 2351.54 | 293.9431 | 818.461 | 818.461 |
| 8 | coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | 12 | 1953.59 | 162.7996 | 233.8971 | 233.8971 |
| 9 | event | singlePass | 29 | 1841.96 | 63.5159 | 93.1129 | 649.223 |
| 10 | govern:chooseOne | continuedDeepening | 7 | 1364.24 | 194.8917 | 1180.7751 | 1180.7751 |

## Hot-Path Buckets For Top Slow Axes

Captured only when `--profile-buckets` is enabled. Buckets are timing/count diagnostics inside `PolicyAgent.chooseDecision`; they are not correctness assertions.

### train:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 26406 | 4496.02 |
| zobrist:encodeDecisionStackFrame | 26512 | 2684.5 |
| tokenStateIndex:refreshCachedEntries | 25164 | 350.45 |
| evalQuery:applyTokenFilter | 12215 | 70.12 |
| evalQuery:countMatchingTokens | 14773 | 25.04 |
| evalQuery:applyTokenFilterCacheHit | 27644 | 0 |
| evalQuery:applyTokenFilterCompiled | 11192 | 0 |
| evalQuery:countMatchingTokensCacheHit | 2568134 | 0 |
| evalQuery:countMatchingTokensCompiled | 14773 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 6799838 | 0 |
| moveToken:sameZoneNoop | 237 | 0 |
| tokenStateIndex:getCacheHit | 172010 | 0 |

### coupArvnRedeployPolice:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 592062 | 3059.29 |
| evalQuery:countMatchingTokens | 623336 | 961.31 |
| zobrist:digestDecisionStackFrame | 1536 | 73.65 |
| zobrist:encodeDecisionStackFrame | 1568 | 71.11 |
| evalQuery:applyTokenFilter | 110 | 0.41 |
| evalQuery:applyTokenFilterCacheHit | 88636 | 0 |
| evalQuery:applyTokenFilterCompiled | 110 | 0 |
| evalQuery:countMatchingTokensCacheHit | 17410496 | 0 |
| evalQuery:countMatchingTokensCompiled | 623336 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 58606051 | 0 |
| moveToken:sameZoneNoop | 474 | 0 |
| tokenStateIndex:getCacheHit | 592536 | 0 |

### train:chooseNStep:confirm | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 20860 | 3646.17 |
| zobrist:encodeDecisionStackFrame | 21222 | 2214.35 |
| tokenStateIndex:refreshCachedEntries | 16461 | 266.37 |
| evalQuery:applyTokenFilter | 7274 | 56.7 |
| evalQuery:countMatchingTokens | 8193 | 17.11 |
| evalQuery:applyTokenFilterCacheHit | 29548 | 0 |
| evalQuery:applyTokenFilterCompiled | 6482 | 0 |
| evalQuery:countMatchingTokensCacheHit | 2442465 | 0 |
| evalQuery:countMatchingTokensCompiled | 8193 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 6521800 | 0 |
| moveToken:sameZoneNoop | 225 | 0 |
| tokenStateIndex:getCacheHit | 129276 | 0 |

### govern:chooseNStep:confirm | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 19500 | 442.77 |
| evalQuery:applyTokenFilter | 193534 | 287.38 |
| zobrist:encodeDecisionStackFrame | 208 | 8.62 |
| evalQuery:countMatchingTokens | 4881 | 7.13 |
| zobrist:digestDecisionStackFrame | 126 | 6.39 |
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
| tokenStateIndex:refreshCachedEntries | 11273 | 235.86 |
| evalQuery:applyTokenFilter | 110751 | 173.73 |
| zobrist:digestDecisionStackFrame | 692 | 31.87 |
| zobrist:encodeDecisionStackFrame | 692 | 26.39 |
| evalQuery:countMatchingTokens | 4830 | 10.14 |
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
| tokenStateIndex:refreshCachedEntries | 61442 | 302.71 |
| evalQuery:countMatchingTokens | 75112 | 84.6 |
| zobrist:encodeDecisionStackFrame | 448 | 14.94 |
| zobrist:digestDecisionStackFrame | 412 | 13.52 |
| evalQuery:applyTokenFilter | 96 | 0.4 |
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
| tokenStateIndex:refreshCachedEntries | 20815 | 216.56 |
| evalQuery:applyTokenFilter | 18372 | 109.82 |
| evalQuery:countMatchingTokens | 25249 | 19.78 |
| zobrist:digestDecisionStackFrame | 28 | 4.17 |
| zobrist:encodeDecisionStackFrame | 28 | 2.74 |
| evalQuery:applyTokenFilterCacheHit | 71688 | 0 |
| evalQuery:applyTokenFilterCompiled | 17547 | 0 |
| evalQuery:countMatchingTokensCacheHit | 945717 | 0 |
| evalQuery:countMatchingTokensCompiled | 25249 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1996238 | 0 |
| moveToken:sameZoneNoop | 25 | 0 |
| tokenStateIndex:getCacheHit | 139040 | 0 |

### coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 28788 | 230.27 |
| evalQuery:countMatchingTokens | 22504 | 20.81 |
| zobrist:encodeDecisionStackFrame | 96 | 3.24 |
| zobrist:digestDecisionStackFrame | 96 | 2.58 |
| evalQuery:applyTokenFilter | 280 | 0.74 |
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
| evalQuery:applyTokenFilter | 17906 | 74.2 |
| tokenStateIndex:refreshCachedEntries | 4058 | 70.76 |
| zobrist:digestDecisionStackFrame | 272 | 52.19 |
| zobrist:encodeDecisionStackFrame | 272 | 33.27 |
| evalQuery:countMatchingTokens | 8185 | 10.32 |
| policyWasmRuntime:encodeBytecodeInput | 304 | 7.14 |
| evalQuery:applyTokenFilterCacheHit | 4293 | 0 |
| evalQuery:applyTokenFilterCompiled | 17153 | 0 |
| evalQuery:countMatchingTokensCacheHit | 510787 | 0 |
| evalQuery:countMatchingTokensCompiled | 3101 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1068799 | 0 |
| moveToken:sameZoneNoop | 2 | 0 |

### govern:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 3187 | 60.69 |
| evalQuery:applyTokenFilter | 28112 | 46.25 |
| evalQuery:countMatchingTokens | 5667 | 9.71 |
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
