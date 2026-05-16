# FITL ARVN 15-Seed Per-Microturn-Class Decomposition

**Status**: ✅ EXPLOITED — referenced during spec 174 implementation (archived 2026-05-16).

**Date**: 2026-05-15-post-005-preview-state-drive
**Status**: Spec 173 measurement witness.
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 400000 --date 2026-05-15-post-005-preview-state-drive --profile-buckets`
**CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-005-preview-state-drive.csv`

## Summary

- Seeds completed: 15/15
- Per-decision rows: 3741
- Hot class with slow:fast ratio >3x: yes
- Per-seed timeout: 400000 ms
- Hot-path buckets: enabled

## Per-Seed Wall Time

| Seed | Status | Stop Reason | Wall ms | Decisions | ms/decision | Error |
|---:|---|---|---:|---:|---:|---|
| 1000 | OK | terminal | 7323.12 | 159 | 46.0574 |  |
| 1001 | OK | terminal | 15728.22 | 194 | 81.0733 |  |
| 1002 | OK | terminal | 20705.42 | 288 | 71.8938 |  |
| 1003 | OK | terminal | 17268.59 | 226 | 76.4097 |  |
| 1004 | OK | terminal | 25632.39 | 338 | 75.8355 |  |
| 1005 | OK | terminal | 72522.37 | 412 | 176.0252 |  |
| 1006 | OK | terminal | 10614.48 | 228 | 46.5547 |  |
| 1007 | OK | terminal | 7798.6 | 218 | 35.7734 |  |
| 1008 | OK | terminal | 26674.81 | 166 | 160.6916 |  |
| 1009 | OK | terminal | 27084.36 | 303 | 89.3873 |  |
| 1010 | OK | terminal | 19183.29 | 319 | 60.1357 |  |
| 1011 | OK | terminal | 26628.02 | 212 | 125.6039 |  |
| 1012 | OK | terminal | 26675.82 | 213 | 125.2386 |  |
| 1013 | OK | terminal | 24302.61 | 252 | 96.4389 |  |
| 1014 | OK | terminal | 18449.26 | 213 | 86.6162 |  |

## Per-Microturn-Class Rollup

| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | Token index builds | Static rebuilds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| train:chooseNStep:add | 62 | 90637.74 | 1461.899 | 3250.9222 | 3433.5328 | 18.5 | 0 | 26647 | 56148 | 0 | 0 | 0 | 0 |
| train:chooseNStep:confirm | 94 | 52745.83 | 561.1259 | 3213.5578 | 3450.3404 | 7.0638 | 0 | 15975 | 34518 | 0 | 0 | 0 | 0 |
| coupArvnRedeployPolice:chooseOne | 145 | 43510.76 | 300.0742 | 1418.2034 | 1984.4611 | 30.7241 | 0 | 93582 | 3151 | 0 | 0 | 0 | 0 |
| govern:chooseNStep:add | 115 | 27036.33 | 235.0985 | 347.7336 | 5301.9311 | 6.687 | 0 | 3600 | 5625 | 0 | 0 | 0 | 0 |
| event | 245 | 24223.56 | 98.8717 | 116.0514 | 5217.0361 | 18.9224 | 245 | 0 | 0 | 245 | 234 | 38 | 275 |
| govern:chooseNStep:confirm | 102 | 23764.04 | 232.9808 | 369.4185 | 8663.8005 | 6.8824 | 0 | 2336 | 1059 | 0 | 0 | 0 | 0 |
| coupArvnRedeployOptionalTroops:chooseOne | 204 | 9860.07 | 48.3337 | 171.0669 | 243.2521 | 8.4118 | 0 | 11928 | 1638 | 0 | 0 | 0 | 0 |
| govern | 104 | 6011.23 | 57.8003 | 88.5122 | 657.5402 | 10.7115 | 97 | 0 | 7 | 97 | 40 | 0 | 97 |
| assault:chooseNStep:add | 26 | 4178.91 | 160.7271 | 81.6367 | 4096.0286 | 3.1538 | 0 | 18 | 4 | 0 | 0 | 0 | 0 |
| rally | 170 | 3933.29 | 23.137 | 54.8928 | 150.0656 | 15.8882 | 148 | 0 | 22 | 148 | 101 | 0 | 148 |
| coupArvnRedeployOptionalTroops | 87 | 2128.54 | 24.466 | 28.4024 | 31.5542 | 17.2874 | 70 | 0 | 17 | 70 | 0 | 0 | 70 |
| transport:chooseOne | 16 | 1920.84 | 120.0528 | 362.7959 | 362.7959 | 17.6875 | 0 | 1191 | 46 | 0 | 0 | 0 | 0 |
| coupArvnRedeployPolice | 84 | 1883.31 | 22.4203 | 25.7983 | 30.0899 | 11.7262 | 82 | 0 | 2 | 82 | 0 | 0 | 82 |
| coupArvnRedeployMandatory:chooseOne | 12 | 1049.92 | 87.4931 | 134.6836 | 134.6836 | 8 | 0 | 1428 | 204 | 0 | 0 | 0 | 0 |
| event-decision:chooseNStep:add | 93 | 1030.64 | 11.0822 | 86.5121 | 312.8104 | 12.129 | 0 | 112 | 360 | 0 | 0 | 0 | 0 |
| train | 33 | 803.72 | 24.3552 | 39.3824 | 63.9245 | 7.8485 | 32 | 0 | 1 | 32 | 92 | 0 | 32 |
| coupRedeployPass | 80 | 563.78 | 7.0473 | 21.7343 | 24.8083 | 2.975 | 31 | 0 | 49 | 31 | 15 | 0 | 31 |
| transport | 8 | 511.8 | 63.9744 | 103.6997 | 103.6997 | 11.25 | 8 | 0 | 0 | 8 | 0 | 0 | 8 |
| coupPacifyUS | 76 | 446.21 | 5.8712 | 9.7391 | 10.3804 | 2.7763 | 76 | 0 | 0 | 76 | 0 | 0 | 76 |
| govern:chooseOne | 117 | 408.08 | 3.4878 | 5.5937 | 10.2582 | 2 | 0 | 143 | 143 | 0 | 0 | 0 | 0 |
| train:chooseOne | 58 | 382.24 | 6.5904 | 11.3313 | 11.9485 | 2.2759 | 0 | 166 | 198 | 0 | 0 | 0 | 0 |
| advise | 38 | 334.08 | 8.7917 | 14.7104 | 26.9987 | 11.4474 | 28 | 0 | 10 | 28 | 8 | 0 | 28 |
| infiltrate | 33 | 317.41 | 9.6186 | 12.1155 | 19.0518 | 41.5152 | 26 | 0 | 7 | 26 | 15 | 0 | 26 |
| coupAgitateVC | 60 | 310.07 | 5.1679 | 6.7393 | 8.5106 | 2.95 | 42 | 0 | 18 | 42 | 12 | 0 | 42 |
| coupPacifyARVN | 31 | 278.52 | 8.9846 | 13.7304 | 16.551 | 3.9355 | 15 | 0 | 16 | 15 | 10 | 0 | 15 |
| march | 40 | 245.89 | 6.1474 | 10.4432 | 11.2067 | 9.125 | 30 | 0 | 10 | 30 | 66 | 0 | 30 |
| coupCommitmentPass | 80 | 238.99 | 2.9874 | 4.4676 | 5.7822 | 1.15 | 8 | 0 | 72 | 8 | 0 | 0 | 8 |
| assault | 28 | 193.82 | 6.922 | 9.4427 | 9.6652 | 4.8571 | 27 | 0 | 1 | 27 | 3 | 0 | 27 |
| coupPacifyPass | 40 | 159.48 | 3.9871 | 5.6916 | 12.7023 | 1.125 | 36 | 0 | 4 | 36 | 0 | 0 | 36 |
| attack | 14 | 156.08 | 11.1487 | 28.3171 | 28.3171 | 34.9286 | 12 | 0 | 2 | 12 | 0 | 0 | 12 |
| ambushVc | 11 | 147.68 | 13.425 | 23.8191 | 23.8191 | 8.1818 | 10 | 0 | 1 | 10 | 0 | 0 | 10 |
| coupNvaRedeployTroops | 16 | 95.35 | 5.9593 | 8.385 | 8.385 | 3.875 | 10 | 0 | 6 | 10 | 0 | 0 | 10 |
| coupAgitatePass | 20 | 69.49 | 3.4744 | 4.3675 | 4.6503 | 1.25 | 18 | 0 | 2 | 18 | 0 | 0 | 18 |
| coupVictoryCheck | 20 | 66.71 | 3.3355 | 4.6329 | 5.4567 | 1 | 20 | 0 | 0 | 20 | 4 | 0 | 20 |
| coupResourcesResolve | 20 | 66.31 | 3.3154 | 4.1563 | 4.2311 | 1 | 4 | 0 | 16 | 4 | 0 | 0 | 4 |
| coupArvnRedeployMandatory | 2 | 55.42 | 27.7083 | 30.4405 | 30.4405 | 11.5 | 1 | 0 | 1 | 1 | 0 | 0 | 1 |
| coupCommitmentResolve | 8 | 32.6 | 4.0755 | 5.3536 | 5.3536 | 2 | 0 | 0 | 8 | 0 | 0 | 0 | 0 |
| ambushNva | 5 | 27.95 | 5.5894 | 8.8527 | 8.8527 | 15.2 | 5 | 0 | 0 | 5 | 0 | 0 | 5 |
| chooseOne:chooseOne | 28 | 18.09 | 0.6461 | 5.8084 | 8.2285 | 5.6786 | 0 | 7 | 2 | 0 | 0 | 0 | 0 |
| assault:chooseOne | 10 | 16.88 | 1.6881 | 5.1591 | 5.1591 | 2 | 0 | 4 | 4 | 0 | 0 | 0 | 0 |
| rally:chooseNStep:add | 173 | 12.28 | 0.071 | 0.1025 | 0.743 | 20.422 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseNStep:confirm | 218 | 8.71 | 0.04 | 0.0627 | 1.4661 | 14.8165 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseOne | 176 | 6.12 | 0.0348 | 0.0798 | 0.1411 | 1.3523 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseOne | 36 | 5.77 | 0.1602 | 0.6753 | 3.4469 | 3.9444 | 0 | 1 | 1 | 0 | 0 | 0 | 0 |
| pass | 2 | 5.28 | 2.6378 | 3.1408 | 3.1408 | 2.5 | 2 | 0 | 0 | 2 | 0 | 0 | 2 |
| resolveHonoluluPacify | 3 | 5.24 | 1.7466 | 1.9449 | 1.9449 | 1 | 3 | 0 | 0 | 3 | 0 | 0 | 3 |
| advise:chooseNStep:add | 38 | 4.01 | 0.1054 | 0.6834 | 0.694 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:confirm | 90 | 3.55 | 0.0394 | 0.0814 | 0.131 | 5.0778 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:add | 57 | 3.26 | 0.0571 | 0.0875 | 0.0905 | 11.4912 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseOne | 76 | 3.03 | 0.0399 | 0.0901 | 0.1554 | 2.4474 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseNStep:confirm | 83 | 2.68 | 0.0323 | 0.0502 | 0.1433 | 6.253 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:add | 33 | 1.99 | 0.0602 | 0.0607 | 0.6344 | 3.6061 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseOne | 56 | 1.95 | 0.0347 | 0.0845 | 0.1456 | 1.625 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupNvaRedeployTroops:chooseOne | 42 | 1.78 | 0.0423 | 0.0582 | 0.1004 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:confirm | 38 | 1.59 | 0.0418 | 0.0712 | 0.0938 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:confirm | 47 | 1.45 | 0.0309 | 0.0558 | 0.0939 | 4.4255 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:confirm | 50 | 1.35 | 0.0271 | 0.0489 | 0.0974 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupCommitmentResolve:chooseNStep:confirm | 32 | 0.95 | 0.0296 | 0.0541 | 0.0942 | 9.25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:add | 12 | 0.63 | 0.0525 | 0.1735 | 0.1735 | 3.5833 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| chooseNStep:chooseNStep:confirm | 10 | 0.43 | 0.0433 | 0.0714 | 0.0714 | 22.5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:confirm | 12 | 0.32 | 0.027 | 0.06 | 0.06 | 4.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseOne | 11 | 0.27 | 0.0244 | 0.0469 | 0.0469 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseNStep:add | 3 | 0.15 | 0.0491 | 0.0679 | 0.0679 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseOne | 5 | 0.14 | 0.0271 | 0.0354 | 0.0354 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseNStep:confirm | 3 | 0.08 | 0.0262 | 0.0319 | 0.0319 | 3.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Top Hot Axes In Slow-Tier Seeds

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.

| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms |
|---:|---|---|---:|---:|---:|---:|---:|
| 1 | train:chooseNStep:add | continuedDeepening | 33 | 53088.24 | 1608.7344 | 3365.7079 | 3433.5328 |
| 2 | train:chooseNStep:confirm | continuedDeepening | 35 | 39081.57 | 1116.6162 | 3277.5934 | 3450.3404 |
| 3 | coupArvnRedeployPolice:chooseOne | continuedDeepening | 52 | 23415.95 | 450.3067 | 1663.988 | 1984.4611 |
| 4 | govern:chooseNStep:confirm | continuedDeepening | 25 | 12287.68 | 491.5072 | 303.4381 | 8663.8005 |
| 5 | govern:chooseNStep:add | continuedDeepening | 35 | 11712.07 | 334.6305 | 410.207 | 5301.9311 |
| 6 | event | singlePass | 95 | 8569.51 | 90.2053 | 168.9576 | 3420.0527 |
| 7 | coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | 72 | 3486.04 | 48.4173 | 184.6427 | 243.2521 |
| 8 | govern | singlePass | 32 | 2219.62 | 69.3633 | 101.1597 | 657.5402 |
| 9 | rally | singlePass | 62 | 1201.95 | 19.3863 | 52.5418 | 66.1784 |
| 10 | coupArvnRedeployMandatory:chooseOne | continuedDeepening | 12 | 1049.92 | 87.4931 | 134.6836 | 134.6836 |

## Hot-Path Buckets For Top Slow Axes

Captured only when `--profile-buckets` is enabled. Buckets are timing/count diagnostics inside `PolicyAgent.chooseDecision`; they are not correctness assertions.

### train:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 75316 | 12761.34 |
| zobrist:encodeDecisionStackFrame | 75706 | 7249.59 |
| tokenStateIndex:refreshCachedEntries | 84351 | 1110.06 |
| evalQuery:applyTokenFilter | 39507 | 144 |
| evalQuery:countMatchingTokens | 49652 | 77.65 |
| evalQuery:applyTokenFilterCacheHit | 77754 | 0 |
| evalQuery:applyTokenFilterCompiled | 38484 | 0 |
| evalQuery:countMatchingTokensCacheHit | 7842090 | 0 |
| evalQuery:countMatchingTokensCompiled | 49652 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 18571784 | 0 |
| tokenStateIndex:getCacheHit | 272536 | 0 |
| zobrist:decisionStackFrameEncodedChars | 1618401923 | 0 |

### train:chooseNStep:confirm | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 54182 | 9448.19 |
| zobrist:encodeDecisionStackFrame | 55108 | 5412.86 |
| tokenStateIndex:refreshCachedEntries | 43507 | 725.23 |
| evalQuery:applyTokenFilter | 16977 | 80.01 |
| evalQuery:countMatchingTokens | 21221 | 46.36 |
| evalQuery:applyTokenFilterCacheHit | 73979 | 0 |
| evalQuery:applyTokenFilterCompiled | 16185 | 0 |
| evalQuery:countMatchingTokensCacheHit | 5992857 | 0 |
| evalQuery:countMatchingTokensCompiled | 21221 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 14379679 | 0 |
| tokenStateIndex:getCacheHit | 175368 | 0 |
| zobrist:decisionStackFrameEncodedChars | 1200075746 | 0 |

### coupArvnRedeployPolice:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 840820 | 4310.7 |
| evalQuery:countMatchingTokens | 930152 | 1268.11 |
| zobrist:digestDecisionStackFrame | 368 | 18.65 |
| zobrist:encodeDecisionStackFrame | 368 | 17.25 |
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
| tokenStateIndex:refreshCachedEntries | 31003 | 557.26 |
| evalQuery:applyTokenFilter | 200968 | 344.86 |
| zobrist:encodeDecisionStackFrame | 1104 | 46.73 |
| zobrist:digestDecisionStackFrame | 678 | 34.38 |
| evalQuery:countMatchingTokens | 25207 | 27.63 |
| evalQuery:applyTokenFilterCacheHit | 12656 | 0 |
| evalQuery:applyTokenFilterCompiled | 200098 | 0 |
| evalQuery:countMatchingTokensCacheHit | 1633944 | 0 |
| evalQuery:countMatchingTokensCompiled | 7347 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 3595677 | 0 |
| tokenStateIndex:getCacheHit | 212463 | 0 |
| zobrist:decisionStackFrameEncodedChars | 4309456 | 0 |

### govern:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 26725 | 420.56 |
| evalQuery:applyTokenFilter | 122852 | 214.66 |
| zobrist:digestDecisionStackFrame | 4378 | 199.24 |
| zobrist:encodeDecisionStackFrame | 4472 | 164.48 |
| evalQuery:countMatchingTokens | 23502 | 30.93 |
| evalQuery:applyTokenFilterCacheHit | 10806 | 0 |
| evalQuery:applyTokenFilterCompiled | 122243 | 0 |
| evalQuery:countMatchingTokensCacheHit | 1862728 | 0 |
| evalQuery:countMatchingTokensCompiled | 11000 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 4404723 | 0 |
| tokenStateIndex:getCacheHit | 155803 | 0 |
| zobrist:decisionStackFrameEncodedChars | 24876319 | 0 |

### event | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 67740 | 815.83 |
| evalQuery:applyTokenFilter | 104207 | 254.99 |
| zobrist:digestDecisionStackFrame | 870 | 166.48 |
| zobrist:encodeDecisionStackFrame | 870 | 101.99 |
| evalQuery:countMatchingTokens | 53299 | 54.6 |
| policyWasmRuntime:encodeBytecodeInput | 988 | 32.1 |
| tokenStateIndex:build | 18 | 0.67 |
| evalQuery:applyTokenFilterCacheHit | 18014 | 0 |
| evalQuery:applyTokenFilterCompiled | 102599 | 0 |
| evalQuery:countMatchingTokensCacheHit | 1520691 | 0 |
| evalQuery:countMatchingTokensCompiled | 34477 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 3108106 | 0 |

### coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 90320 | 466.72 |
| evalQuery:countMatchingTokens | 113580 | 125.97 |
| zobrist:digestDecisionStackFrame | 128 | 5.77 |
| zobrist:encodeDecisionStackFrame | 128 | 5.61 |
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
| tokenStateIndex:refreshCachedEntries | 4319 | 68.43 |
| evalQuery:applyTokenFilter | 16255 | 61.86 |
| zobrist:digestDecisionStackFrame | 454 | 53.02 |
| zobrist:encodeDecisionStackFrame | 454 | 36.39 |
| evalQuery:countMatchingTokens | 12073 | 16.3 |
| policyWasmRuntime:encodeBytecodeInput | 282 | 11.79 |
| evalQuery:applyTokenFilterCacheHit | 11829 | 0 |
| evalQuery:applyTokenFilterCompiled | 15656 | 0 |
| evalQuery:countMatchingTokensCacheHit | 658489 | 0 |
| evalQuery:countMatchingTokensCompiled | 3143 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1295657 | 0 |
| policyWasmRuntime:encodedInputCacheMiss | 282 | 0 |

### rally | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 6793 | 76.77 |
| evalQuery:applyTokenFilter | 5063 | 47.25 |
| zobrist:digestDecisionStackFrame | 180 | 12.53 |
| policyWasmRuntime:encodeBytecodeInput | 335 | 12.17 |
| zobrist:encodeDecisionStackFrame | 180 | 11.48 |
| evalQuery:countMatchingTokens | 6103 | 6.71 |
| evalQuery:applyTokenFilterCacheHit | 3004 | 0 |
| evalQuery:applyTokenFilterCompiled | 4286 | 0 |
| evalQuery:countMatchingTokensCacheHit | 554744 | 0 |
| evalQuery:countMatchingTokensCompiled | 6103 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1342116 | 0 |
| policyWasmRuntime:encodedInputCacheMiss | 335 | 0 |

### coupArvnRedeployMandatory:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 32392 | 158.88 |
| evalQuery:countMatchingTokens | 46348 | 48.21 |
| zobrist:encodeDecisionStackFrame | 64 | 2.5 |
| zobrist:digestDecisionStackFrame | 64 | 2.3 |
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
| train:chooseNStep:confirm | 49 | 6 | 797.6204 | 0.0854 | 9339.8173 | hot axis |
| train:chooseNStep:add | 33 | 6 | 1608.7344 | 354.207 | 4.5418 | hot axis |
| coupArvnRedeployPolice:chooseOne | 52 | 50 | 450.3067 | 156.6449 | 2.8747 |  |
| govern:chooseNStep:confirm | 30 | 35 | 409.6042 | 197.8209 | 2.0706 |  |
| coupNvaRedeployTroops | 7 | 1 | 6.3193 | 3.188 | 1.9822 |  |
| train | 17 | 3 | 25.9886 | 13.1118 | 1.9821 |  |
| govern:chooseNStep:add | 35 | 35 | 334.6305 | 212.1151 | 1.5776 |  |
| advise:chooseNStep:add | 8 | 15 | 0.1536 | 0.0987 | 1.5562 |  |
| pass | 1 | 1 | 3.1408 | 2.1347 | 1.4713 |  |
| advise:chooseOne | 16 | 30 | 0.0514 | 0.0384 | 1.3385 |  |
| train:chooseOne | 29 | 6 | 6.5789 | 5.1462 | 1.2784 |  |
| transport | 5 | 3 | 69.5485 | 54.6844 | 1.2718 |  |
| coupPacifyARVN | 8 | 8 | 11.0316 | 8.7889 | 1.2552 |  |
| govern | 32 | 35 | 69.3633 | 55.7534 | 1.2441 |  |
| advise | 8 | 15 | 9.6825 | 7.7894 | 1.243 |  |
| coupCommitmentResolve:chooseNStep:confirm | 8 | 12 | 0.0309 | 0.026 | 1.1885 |  |
| march:chooseNStep:add | 21 | 22 | 0.0614 | 0.0534 | 1.1498 |  |
| govern:chooseOne | 37 | 35 | 3.558 | 3.1861 | 1.1167 |  |
| coupRedeployPass | 28 | 24 | 7.2127 | 6.4904 | 1.1113 |  |
| coupArvnRedeployPolice | 27 | 32 | 23.2561 | 21.2933 | 1.0922 |  |
| assault | 8 | 9 | 7.166 | 6.6563 | 1.0766 |  |
| coupCommitmentPass | 28 | 24 | 3.0918 | 2.9042 | 1.0646 |  |
| advise:chooseNStep:confirm | 8 | 15 | 0.0445 | 0.0419 | 1.0621 |  |
| coupAgitatePass | 7 | 6 | 3.5496 | 3.4235 | 1.0368 |  |
| coupArvnRedeployOptionalTroops | 31 | 25 | 24.679 | 23.8496 | 1.0348 |  |
| coupPacifyUS | 25 | 26 | 5.9535 | 5.7896 | 1.0283 |  |
| march | 15 | 13 | 6.0105 | 5.8544 | 1.0267 |  |
| rally:chooseNStep:confirm | 73 | 73 | 0.0343 | 0.034 | 1.0088 |  |
| event-decision:chooseNStep:confirm | 43 | 26 | 0.0328 | 0.0326 | 1.0061 |  |
| infiltrate:chooseOne | 16 | 14 | 0.0371 | 0.0369 | 1.0054 |  |
| event | 95 | 78 | 90.2053 | 90.6207 | 0.9954 |  |
| coupResourcesResolve | 7 | 6 | 3.2575 | 3.2728 | 0.9953 |  |
| attack | 6 | 8 | 11.0082 | 11.254 | 0.9782 |  |
| assault:chooseNStep:confirm | 16 | 13 | 0.0273 | 0.0282 | 0.9681 |  |
| coupArvnRedeployOptionalTroops:chooseOne | 72 | 60 | 48.4173 | 50.6507 | 0.9559 |  |
| chooseNStep:chooseNStep:confirm | 4 | 3 | 0.0425 | 0.0446 | 0.9529 |  |
| coupCommitmentResolve | 2 | 3 | 3.8182 | 4.0331 | 0.9467 |  |
| coupAgitateVC | 19 | 25 | 4.7397 | 5.216 | 0.9087 |  |
| infiltrate | 10 | 8 | 8.76 | 9.6986 | 0.9032 |  |
| rally:chooseOne | 64 | 57 | 0.0332 | 0.0374 | 0.8877 |  |
| coupVictoryCheck | 7 | 6 | 3.0617 | 3.6378 | 0.8416 |  |
| coupPacifyPass | 14 | 12 | 3.7054 | 4.4509 | 0.8325 |  |
| rally:chooseNStep:add | 63 | 56 | 0.064 | 0.0805 | 0.795 |  |
| rally | 62 | 54 | 19.3863 | 24.6091 | 0.7878 |  |
| infiltrate:chooseNStep:confirm | 15 | 12 | 0.0301 | 0.039 | 0.7718 |  |
| ambushVc | 5 | 4 | 10.7183 | 13.9684 | 0.7673 |  |
| march:chooseNStep:confirm | 34 | 29 | 0.0369 | 0.0482 | 0.7656 |  |
| ambushVc:chooseOne | 5 | 4 | 0.0207 | 0.0314 | 0.6592 |  |
| coupNvaRedeployTroops:chooseOne | 19 | 2 | 0.0393 | 0.0624 | 0.6298 |  |
| ambushVc:chooseNStep:confirm | 5 | 3 | 0.0232 | 0.0369 | 0.6287 |  |
| chooseOne:chooseOne | 11 | 8 | 0.6725 | 1.0793 | 0.6231 |  |
| transport:chooseOne | 10 | 6 | 95.278 | 161.3441 | 0.5905 |  |
| ambushVc:chooseNStep:add | 5 | 3 | 0.0375 | 0.0874 | 0.4291 |  |
| infiltrate:chooseNStep:add | 10 | 8 | 0.0428 | 0.1143 | 0.3745 |  |
| event-decision:chooseOne | 13 | 6 | 0.0394 | 0.178 | 0.2213 |  |
| assault:chooseOne | 2 | 5 | 0.0343 | 2.3158 | 0.0148 |  |
| event-decision:chooseNStep:add | 43 | 29 | 0.0508 | 28.6262 | 0.0018 |  |
| assault:chooseNStep:add | 8 | 7 | 0.054 | 585.1927 | 0.0001 |  |

## Notes

- `elapsedMs` is measured around the per-decision `PolicyAgent.chooseDecision` call. It excludes simulator apply/delta work and report rendering.
- Child processes enforce the per-seed timeout. Each child loads the built engine and production FITL GameSpecDoc, using the repo GameDef cache when available.
- The script does not modify engine source or production profile data.
