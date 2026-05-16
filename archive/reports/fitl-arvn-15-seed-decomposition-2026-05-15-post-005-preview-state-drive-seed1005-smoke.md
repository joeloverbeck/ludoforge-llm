# FITL ARVN 15-Seed Per-Microturn-Class Decomposition

**Status**: ✅ EXPLOITED — referenced during spec 174 implementation (archived 2026-05-16).

**Date**: 2026-05-15-post-005-preview-state-drive-seed1005-smoke
**Status**: Spec 173 measurement witness.
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005 --timeout-ms 400000 --date 2026-05-15-post-005-preview-state-drive-seed1005-smoke --profile-buckets`
**CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-005-preview-state-drive-seed1005-smoke.csv`

## Summary

- Seeds completed: 1/1
- Per-decision rows: 412
- Hot class with slow:fast ratio >3x: no
- Per-seed timeout: 400000 ms
- Hot-path buckets: enabled

## Per-Seed Wall Time

| Seed | Status | Stop Reason | Wall ms | Decisions | ms/decision | Error |
|---:|---|---|---:|---:|---:|---|
| 1005 | OK | terminal | 69610.75 | 412 | 168.9581 |  |

## Per-Microturn-Class Rollup

| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | Token index builds | Static rebuilds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| train:chooseNStep:add | 13 | 18555.37 | 1427.336 | 3314.0027 | 3314.0027 | 13.4615 | 0 | 5541 | 12351 | 0 | 0 | 0 | 0 |
| train:chooseNStep:confirm | 15 | 15652.68 | 1043.5119 | 3310.4778 | 3310.4778 | 10.6 | 0 | 4574 | 9720 | 0 | 0 | 0 | 0 |
| coupArvnRedeployPolice:chooseOne | 16 | 11284.44 | 705.2772 | 1854.5528 | 1854.5528 | 30.5 | 0 | 19852 | 680 | 0 | 0 | 0 | 0 |
| govern:chooseNStep:confirm | 5 | 8434.96 | 1686.9917 | 7870.009 | 7870.009 | 7.2 | 0 | 125 | 57 | 0 | 0 | 0 | 0 |
| govern:chooseNStep:add | 5 | 5387.18 | 1077.4367 | 4644.3713 | 4644.3713 | 6.2 | 0 | 150 | 289 | 0 | 0 | 0 | 0 |
| event | 29 | 1848.77 | 63.7506 | 97.0709 | 624.6912 | 21.0345 | 29 | 0 | 0 | 29 | 10 | 0 | 31 |
| coupArvnRedeployMandatory:chooseOne | 12 | 1025.62 | 85.4687 | 134.9114 | 134.9114 | 8 | 0 | 1428 | 204 | 0 | 0 | 0 | 0 |
| govern | 7 | 931.23 | 133.0328 | 617.9489 | 617.9489 | 10.5714 | 7 | 0 | 0 | 7 | 0 | 0 | 7 |
| transport:chooseOne | 8 | 593.29 | 74.161 | 109.6662 | 109.6662 | 12.75 | 0 | 362 | 22 | 0 | 0 | 0 | 0 |
| transport | 4 | 306.71 | 76.6784 | 104.4163 | 104.4163 | 11 | 4 | 0 | 0 | 4 | 0 | 0 | 4 |
| rally | 19 | 304.54 | 16.0286 | 55.3759 | 55.3759 | 25.6316 | 15 | 0 | 4 | 15 | 4 | 0 | 15 |
| coupArvnRedeployOptionalTroops:chooseOne | 12 | 283.24 | 23.6035 | 40.0798 | 40.0798 | 8 | 0 | 420 | 60 | 0 | 0 | 0 | 0 |
| train | 5 | 162.39 | 32.4786 | 39.249 | 39.249 | 11.4 | 5 | 0 | 0 | 5 | 10 | 0 | 5 |
| coupArvnRedeployOptionalTroops | 6 | 142.57 | 23.7622 | 27.1522 | 27.1522 | 17.5 | 5 | 0 | 1 | 5 | 0 | 0 | 5 |
| coupArvnRedeployPolice | 6 | 128.92 | 21.4873 | 23.3728 | 23.3728 | 11.6667 | 6 | 0 | 0 | 6 | 0 | 0 | 6 |
| train:chooseOne | 9 | 60.25 | 6.6945 | 10.7984 | 10.7984 | 2.3333 | 0 | 24 | 29 | 0 | 0 | 0 | 0 |
| coupRedeployPass | 8 | 53.47 | 6.6838 | 19.2946 | 19.2946 | 3 | 4 | 0 | 4 | 4 | 13 | 0 | 4 |
| coupArvnRedeployMandatory | 2 | 50.24 | 25.1211 | 25.7012 | 25.7012 | 11.5 | 1 | 0 | 1 | 1 | 0 | 0 | 1 |
| coupNvaRedeployTroops | 6 | 39.53 | 6.5885 | 7.5098 | 7.5098 | 4.5 | 5 | 0 | 1 | 5 | 0 | 0 | 5 |
| attack | 3 | 30.32 | 10.1074 | 11.1696 | 11.1696 | 53 | 3 | 0 | 0 | 3 | 0 | 0 | 3 |
| coupPacifyUS | 5 | 28.9 | 5.78 | 9.0393 | 9.0393 | 2.8 | 5 | 0 | 0 | 5 | 0 | 0 | 5 |
| coupCommitmentPass | 8 | 23.64 | 2.9545 | 4.6307 | 4.6307 | 1 | 2 | 0 | 6 | 2 | 0 | 0 | 2 |
| govern:chooseOne | 7 | 23.16 | 3.3086 | 5.498 | 5.498 | 2 | 0 | 7 | 7 | 0 | 0 | 0 | 0 |
| march | 3 | 17.42 | 5.8071 | 6.3384 | 6.3384 | 3 | 1 | 0 | 2 | 1 | 0 | 0 | 1 |
| coupAgitateVC | 3 | 15.53 | 5.1773 | 5.4003 | 5.4003 | 2.3333 | 1 | 0 | 2 | 1 | 2 | 0 | 1 |
| coupPacifyPass | 4 | 15.26 | 3.8157 | 5.6981 | 5.6981 | 1 | 3 | 0 | 1 | 3 | 0 | 0 | 3 |
| infiltrate | 2 | 14.08 | 7.042 | 10.9727 | 10.9727 | 30.5 | 1 | 0 | 1 | 1 | 0 | 0 | 1 |
| coupPacifyARVN | 1 | 12.27 | 12.2714 | 12.2714 | 12.2714 | 6 | 0 | 0 | 1 | 0 | 0 | 0 | 0 |
| coupAgitatePass | 2 | 9.65 | 4.8262 | 5.3614 | 5.3614 | 1.5 | 2 | 0 | 0 | 2 | 0 | 0 | 2 |
| assault | 1 | 8.44 | 8.4367 | 8.4367 | 8.4367 | 4 | 1 | 0 | 0 | 1 | 1 | 0 | 1 |
| coupCommitmentResolve | 2 | 8.34 | 4.171 | 4.6618 | 4.6618 | 2 | 0 | 0 | 2 | 0 | 0 | 0 | 0 |
| advise | 1 | 7.92 | 7.9198 | 7.9198 | 7.9198 | 12 | 1 | 0 | 0 | 1 | 0 | 0 | 1 |
| coupResourcesResolve | 2 | 6.61 | 3.3034 | 3.3839 | 3.3839 | 1 | 1 | 0 | 1 | 1 | 0 | 0 | 1 |
| coupVictoryCheck | 2 | 6.59 | 3.2931 | 3.6536 | 3.6536 | 1 | 2 | 0 | 0 | 2 | 0 | 0 | 2 |
| chooseOne:chooseOne | 3 | 6.35 | 2.1177 | 5.7082 | 5.7082 | 6.6667 | 0 | 4 | 1 | 0 | 0 | 0 | 0 |
| event-decision:chooseNStep:add | 26 | 1.4 | 0.0539 | 0.0747 | 0.0977 | 11.5385 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseNStep:add | 19 | 1.07 | 0.0561 | 0.0719 | 0.0719 | 22.1053 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseNStep:confirm | 28 | 0.87 | 0.031 | 0.0386 | 0.0424 | 18.5357 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseNStep:confirm | 23 | 0.72 | 0.0314 | 0.0483 | 0.0523 | 3.8696 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupNvaRedeployTroops:chooseOne | 17 | 0.66 | 0.0387 | 0.073 | 0.073 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseOne | 19 | 0.57 | 0.03 | 0.0511 | 0.0511 | 1.3158 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseOne | 7 | 0.26 | 0.0372 | 0.0682 | 0.0682 | 3.1429 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:confirm | 8 | 0.26 | 0.0321 | 0.0516 | 0.0516 | 3.875 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupCommitmentResolve:chooseNStep:confirm | 8 | 0.25 | 0.0315 | 0.044 | 0.044 | 9.25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:add | 3 | 0.21 | 0.0686 | 0.07 | 0.07 | 23 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| chooseNStep:chooseNStep:confirm | 3 | 0.13 | 0.0429 | 0.0549 | 0.0549 | 19.6667 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseOne | 3 | 0.12 | 0.0404 | 0.0485 | 0.0485 | 1.6667 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:confirm | 3 | 0.1 | 0.0325 | 0.0419 | 0.0419 | 4.6667 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:add | 1 | 0.09 | 0.0874 | 0.0874 | 0.0874 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:add | 2 | 0.09 | 0.0444 | 0.0478 | 0.0478 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:confirm | 2 | 0.07 | 0.0337 | 0.0388 | 0.0388 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseOne | 2 | 0.06 | 0.0284 | 0.0298 | 0.0298 | 2.5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:add | 1 | 0.05 | 0.0513 | 0.0513 | 0.0513 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:confirm | 1 | 0.03 | 0.0316 | 0.0316 | 0.0316 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Top Hot Axes In Slow-Tier Seeds

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.

| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms |
|---:|---|---|---:|---:|---:|---:|---:|
| 1 | train:chooseNStep:add | continuedDeepening | 13 | 18555.37 | 1427.336 | 3314.0027 | 3314.0027 |
| 2 | train:chooseNStep:confirm | continuedDeepening | 10 | 15652.25 | 1565.2253 | 3310.4778 | 3310.4778 |
| 3 | coupArvnRedeployPolice:chooseOne | continuedDeepening | 16 | 11284.44 | 705.2772 | 1854.5528 | 1854.5528 |
| 4 | govern:chooseNStep:confirm | continuedDeepening | 5 | 8434.96 | 1686.9917 | 7870.009 | 7870.009 |
| 5 | govern:chooseNStep:add | continuedDeepening | 5 | 5387.18 | 1077.4367 | 4644.3713 | 4644.3713 |
| 6 | event | singlePass | 29 | 1848.77 | 63.7506 | 97.0709 | 624.6912 |
| 7 | coupArvnRedeployMandatory:chooseOne | continuedDeepening | 12 | 1025.62 | 85.4687 | 134.9114 | 134.9114 |
| 8 | govern | singlePass | 7 | 931.23 | 133.0328 | 617.9489 | 617.9489 |
| 9 | transport:chooseOne | continuedDeepening | 8 | 593.29 | 74.161 | 109.6662 | 109.6662 |
| 10 | transport | singlePass | 4 | 306.71 | 76.6784 | 104.4163 | 104.4163 |

## Hot-Path Buckets For Top Slow Axes

Captured only when `--profile-buckets` is enabled. Buckets are timing/count diagnostics inside `PolicyAgent.chooseDecision`; they are not correctness assertions.

### train:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 26406 | 4481.64 |
| zobrist:encodeDecisionStackFrame | 26512 | 2592.21 |
| tokenStateIndex:refreshCachedEntries | 25401 | 321.5 |
| evalQuery:applyTokenFilter | 12246 | 71.25 |
| evalQuery:countMatchingTokens | 14869 | 25.75 |
| evalQuery:applyTokenFilterCacheHit | 27613 | 0 |
| evalQuery:applyTokenFilterCompiled | 11223 | 0 |
| evalQuery:countMatchingTokensCacheHit | 2568038 | 0 |
| evalQuery:countMatchingTokensCompiled | 14869 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 6799838 | 0 |
| tokenStateIndex:getCacheHit | 172010 | 0 |
| zobrist:decisionStackFrameEncodedChars | 567518101 | 0 |

### train:chooseNStep:confirm | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 20860 | 3657.87 |
| zobrist:encodeDecisionStackFrame | 21222 | 2113.4 |
| tokenStateIndex:refreshCachedEntries | 16686 | 284.98 |
| evalQuery:applyTokenFilter | 7303 | 48.27 |
| evalQuery:countMatchingTokens | 8283 | 19.41 |
| evalQuery:applyTokenFilterCacheHit | 29519 | 0 |
| evalQuery:applyTokenFilterCompiled | 6511 | 0 |
| evalQuery:countMatchingTokensCacheHit | 2442375 | 0 |
| evalQuery:countMatchingTokensCompiled | 8283 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 6521800 | 0 |
| tokenStateIndex:getCacheHit | 129276 | 0 |
| zobrist:decisionStackFrameEncodedChars | 461522958 | 0 |

### coupArvnRedeployPolice:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 439530 | 1983.96 |
| evalQuery:countMatchingTokens | 487922 | 713.94 |
| zobrist:digestDecisionStackFrame | 240 | 12.45 |
| zobrist:encodeDecisionStackFrame | 240 | 10.98 |
| evalQuery:applyTokenFilterCacheHit | 40824 | 0 |
| evalQuery:countMatchingTokensCacheHit | 11142622 | 0 |
| evalQuery:countMatchingTokensCompiled | 487922 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 39775860 | 0 |
| tokenStateIndex:getCacheHit | 439530 | 0 |
| zobrist:decisionStackFrameEncodedChars | 1505720 | 0 |
| zobrist:decisionStackFrameRunLocalCacheMiss | 240 | 0 |

### govern:chooseNStep:confirm | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 19500 | 362.68 |
| evalQuery:applyTokenFilter | 193534 | 250.72 |
| evalQuery:countMatchingTokens | 4881 | 9.05 |
| zobrist:encodeDecisionStackFrame | 208 | 7.97 |
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
| tokenStateIndex:refreshCachedEntries | 11273 | 201.8 |
| evalQuery:applyTokenFilter | 110751 | 150.49 |
| zobrist:digestDecisionStackFrame | 692 | 31.6 |
| zobrist:encodeDecisionStackFrame | 692 | 24.68 |
| evalQuery:countMatchingTokens | 4830 | 5.25 |
| evalQuery:applyTokenFilterCacheHit | 4089 | 0 |
| evalQuery:applyTokenFilterCompiled | 110577 | 0 |
| evalQuery:countMatchingTokensCacheHit | 241151 | 0 |
| evalQuery:countMatchingTokensCompiled | 1258 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 606474 | 0 |
| tokenStateIndex:getCacheHit | 72844 | 0 |
| zobrist:decisionStackFrameEncodedChars | 3934792 | 0 |

### event | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| evalQuery:applyTokenFilter | 17906 | 73.52 |
| tokenStateIndex:refreshCachedEntries | 4060 | 68.71 |
| zobrist:digestDecisionStackFrame | 272 | 52.55 |
| zobrist:encodeDecisionStackFrame | 272 | 32.66 |
| evalQuery:countMatchingTokens | 8152 | 8.13 |
| policyWasmRuntime:encodeBytecodeInput | 304 | 7.35 |
| evalQuery:applyTokenFilterCacheHit | 4293 | 0 |
| evalQuery:applyTokenFilterCompiled | 17153 | 0 |
| evalQuery:countMatchingTokensCacheHit | 510820 | 0 |
| evalQuery:countMatchingTokensCompiled | 3068 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1068799 | 0 |
| policyWasmRuntime:encodedInputCacheMiss | 304 | 0 |

### coupArvnRedeployMandatory:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 32392 | 153.37 |
| evalQuery:countMatchingTokens | 46348 | 43.63 |
| zobrist:encodeDecisionStackFrame | 64 | 2.57 |
| zobrist:digestDecisionStackFrame | 64 | 2.3 |
| evalQuery:applyTokenFilterCacheHit | 3200 | 0 |
| evalQuery:countMatchingTokensCacheHit | 1030656 | 0 |
| evalQuery:countMatchingTokensCompiled | 46348 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 2913754 | 0 |
| tokenStateIndex:getCacheHit | 32392 | 0 |
| zobrist:decisionStackFrameEncodedChars | 275288 | 0 |
| zobrist:decisionStackFrameRunLocalCacheMiss | 64 | 0 |

### govern | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| evalQuery:applyTokenFilter | 14325 | 38.15 |
| tokenStateIndex:refreshCachedEntries | 1767 | 25.9 |
| zobrist:digestDecisionStackFrame | 112 | 12.46 |
| zobrist:encodeDecisionStackFrame | 112 | 8.03 |
| evalQuery:countMatchingTokens | 5121 | 6.26 |
| policyWasmRuntime:encodeBytecodeInput | 62 | 1.42 |
| evalQuery:applyTokenFilterCacheHit | 3017 | 0 |
| evalQuery:applyTokenFilterCompiled | 14025 | 0 |
| evalQuery:countMatchingTokensCacheHit | 136144 | 0 |
| evalQuery:countMatchingTokensCompiled | 609 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 326565 | 0 |
| policyWasmRuntime:encodedInputCacheMiss | 62 | 0 |

### transport:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 8316 | 59.11 |
| evalQuery:applyTokenFilter | 2304 | 4.23 |
| evalQuery:countMatchingTokens | 3960 | 1.88 |
| evalQuery:applyTokenFilterCacheHit | 52992 | 0 |
| evalQuery:applyTokenFilterCompiled | 2304 | 0 |
| evalQuery:countMatchingTokensCacheHit | 452300 | 0 |
| evalQuery:countMatchingTokensCompiled | 3960 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 642569 | 0 |
| tokenStateIndex:getCacheHit | 18036 | 0 |

### transport | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| evalQuery:applyTokenFilter | 1390 | 28.79 |
| zobrist:digestDecisionStackFrame | 108 | 13.01 |
| tokenStateIndex:refreshCachedEntries | 843 | 9.36 |
| zobrist:encodeDecisionStackFrame | 108 | 8.1 |
| policyWasmRuntime:encodeBytecodeInput | 32 | 0.8 |
| evalQuery:countMatchingTokens | 487 | 0.44 |
| evalQuery:applyTokenFilterCacheHit | 3324 | 0 |
| evalQuery:applyTokenFilterCompiled | 937 | 0 |
| evalQuery:countMatchingTokensCacheHit | 81122 | 0 |
| evalQuery:countMatchingTokensCompiled | 487 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 164726 | 0 |
| policyWasmRuntime:encodedInputCacheMiss | 32 | 0 |


## Fast-Tier vs Slow-Tier Delta

Fast tier: `1000`, `1006`, `1007`, `1010`, `1014`. Rows with ratio greater than `3.0` satisfy the Phase 0 hot-axis criterion.

| Microturn class | Slow decisions | Fast decisions | Slow mean ms | Fast mean ms | Slow:fast ratio | Verdict |
|---|---:|---:|---:|---:|---:|---|

## Notes

- `elapsedMs` is measured around the per-decision `PolicyAgent.chooseDecision` call. It excludes simulator apply/delta work and report rendering.
- Child processes enforce the per-seed timeout. Each child loads the built engine and production FITL GameSpecDoc, using the repo GameDef cache when available.
- The script does not modify engine source or production profile data.
