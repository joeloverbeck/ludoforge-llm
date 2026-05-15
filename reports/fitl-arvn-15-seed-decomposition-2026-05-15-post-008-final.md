# FITL ARVN 15-Seed Per-Microturn-Class Decomposition

**Date**: 2026-05-15-post-008-final
**Status**: Spec 173 measurement witness.
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 400000 --date 2026-05-15-post-008-final --profile-buckets`
**CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-008-final.csv`

## Summary

- Seeds completed: 15/15
- Per-decision rows: 3741
- Hot class with slow:fast ratio >3x: yes
- Per-seed timeout: 400000 ms
- Hot-path buckets: enabled

## Per-Seed Wall Time

| Seed | Status | Stop Reason | Wall ms | Decisions | ms/decision | Error |
|---:|---|---|---:|---:|---:|---|
| 1000 | OK | terminal | 7140.76 | 159 | 44.9104 |  |
| 1001 | OK | terminal | 17012.51 | 194 | 87.6934 |  |
| 1002 | OK | terminal | 21416.22 | 288 | 74.3619 |  |
| 1003 | OK | terminal | 17937.84 | 226 | 79.371 |  |
| 1004 | OK | terminal | 27262.81 | 338 | 80.6592 |  |
| 1005 | OK | terminal | 75311.43 | 412 | 182.7947 |  |
| 1006 | OK | terminal | 10653.18 | 228 | 46.7245 |  |
| 1007 | OK | terminal | 7740.5 | 218 | 35.5069 |  |
| 1008 | OK | terminal | 27181 | 166 | 163.741 |  |
| 1009 | OK | terminal | 27211.75 | 303 | 89.8078 |  |
| 1010 | OK | terminal | 19649.33 | 319 | 61.5966 |  |
| 1011 | OK | terminal | 27575.25 | 212 | 130.0719 |  |
| 1012 | OK | terminal | 25801.48 | 213 | 121.1337 |  |
| 1013 | OK | terminal | 24326.57 | 252 | 96.534 |  |
| 1014 | OK | terminal | 18781 | 213 | 88.1737 |  |

## Per-Microturn-Class Rollup

| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | Token index builds | Static rebuilds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| train:chooseNStep:add | 62 | 93369.62 | 1505.9616 | 3370.6704 | 3792.5421 | 18.5 | 0 | 26647 | 56148 | 0 | 0 | 0 | 0 |
| train:chooseNStep:confirm | 94 | 53994.26 | 574.407 | 3267.3358 | 3409.2803 | 7.0638 | 0 | 15975 | 34518 | 0 | 0 | 0 | 0 |
| coupArvnRedeployPolice:chooseOne | 145 | 44666.73 | 308.0464 | 1477.3501 | 2088.258 | 30.7241 | 0 | 93582 | 3151 | 0 | 0 | 0 | 0 |
| govern:chooseNStep:add | 115 | 27351.74 | 237.8412 | 356.4314 | 5327.8123 | 6.687 | 0 | 3600 | 5625 | 0 | 0 | 0 | 0 |
| govern:chooseNStep:confirm | 102 | 24576.84 | 240.9494 | 392.8745 | 9155.5851 | 6.8824 | 0 | 2336 | 1059 | 0 | 0 | 0 | 0 |
| event | 245 | 24515.1 | 100.0616 | 110.8334 | 5090.6617 | 18.9224 | 245 | 0 | 0 | 245 | 234 | 38 | 275 |
| coupArvnRedeployOptionalTroops:chooseOne | 204 | 9983.53 | 48.9389 | 180.1945 | 230.3425 | 8.4118 | 0 | 11928 | 1638 | 0 | 0 | 0 | 0 |
| govern | 104 | 6180.28 | 59.4258 | 92.15 | 726.8417 | 10.7115 | 97 | 0 | 7 | 97 | 40 | 0 | 97 |
| assault:chooseNStep:add | 26 | 4454.38 | 171.3223 | 80.0777 | 4372.9996 | 3.1538 | 0 | 18 | 4 | 0 | 0 | 0 | 0 |
| rally | 170 | 4032.31 | 23.7195 | 50.8009 | 175.9402 | 15.8882 | 148 | 0 | 22 | 148 | 101 | 0 | 148 |
| coupArvnRedeployOptionalTroops | 87 | 2141.99 | 24.6205 | 28.1312 | 35.7803 | 17.2874 | 70 | 0 | 17 | 70 | 0 | 0 | 70 |
| transport:chooseOne | 16 | 1959.51 | 122.4697 | 357.3537 | 357.3537 | 17.6875 | 0 | 1191 | 46 | 0 | 0 | 0 | 0 |
| coupArvnRedeployPolice | 84 | 1910.59 | 22.7451 | 26.0242 | 30.439 | 11.7262 | 82 | 0 | 2 | 82 | 0 | 0 | 82 |
| coupArvnRedeployMandatory:chooseOne | 12 | 1237.34 | 103.1118 | 163.0058 | 163.0058 | 8 | 0 | 1428 | 204 | 0 | 0 | 0 | 0 |
| event-decision:chooseNStep:add | 93 | 1019.79 | 10.9655 | 87.3358 | 314.5439 | 12.129 | 0 | 112 | 360 | 0 | 0 | 0 | 0 |
| train | 33 | 832.14 | 25.2164 | 41.8831 | 62.7943 | 7.8485 | 32 | 0 | 1 | 32 | 92 | 0 | 32 |
| coupRedeployPass | 80 | 577.49 | 7.2187 | 23.6713 | 24.713 | 2.975 | 31 | 0 | 49 | 31 | 15 | 0 | 31 |
| transport | 8 | 510.31 | 63.7883 | 99.4517 | 99.4517 | 11.25 | 8 | 0 | 0 | 8 | 0 | 0 | 8 |
| coupPacifyUS | 76 | 451.59 | 5.942 | 8.6251 | 9.6851 | 2.7763 | 76 | 0 | 0 | 76 | 0 | 0 | 76 |
| govern:chooseOne | 117 | 425.19 | 3.6341 | 5.7004 | 9.3334 | 2 | 0 | 143 | 143 | 0 | 0 | 0 | 0 |
| train:chooseOne | 58 | 402.93 | 6.9471 | 11.6406 | 13.7631 | 2.2759 | 0 | 166 | 198 | 0 | 0 | 0 | 0 |
| advise | 38 | 358.71 | 9.4399 | 15.5864 | 27.7856 | 11.4474 | 28 | 0 | 10 | 28 | 8 | 0 | 28 |
| coupAgitateVC | 60 | 309.76 | 5.1627 | 6.9892 | 9.5859 | 2.95 | 42 | 0 | 18 | 42 | 12 | 0 | 42 |
| infiltrate | 33 | 302.4 | 9.1635 | 12.4799 | 15.743 | 41.5152 | 26 | 0 | 7 | 26 | 15 | 0 | 26 |
| coupPacifyARVN | 31 | 278.21 | 8.9746 | 13.6541 | 13.99 | 3.9355 | 15 | 0 | 16 | 15 | 10 | 0 | 15 |
| march | 40 | 254.72 | 6.3681 | 11.6979 | 12.3034 | 9.125 | 30 | 0 | 10 | 30 | 66 | 0 | 30 |
| coupCommitmentPass | 80 | 240.77 | 3.0097 | 4.3552 | 5.494 | 1.15 | 8 | 0 | 72 | 8 | 0 | 0 | 8 |
| assault | 28 | 199.76 | 7.1343 | 9.7915 | 9.8893 | 4.8571 | 27 | 0 | 1 | 27 | 3 | 0 | 27 |
| coupPacifyPass | 40 | 169.37 | 4.2342 | 5.5698 | 12.3036 | 1.125 | 36 | 0 | 4 | 36 | 0 | 0 | 36 |
| attack | 14 | 154.14 | 11.0101 | 28.0575 | 28.0575 | 34.9286 | 12 | 0 | 2 | 12 | 0 | 0 | 12 |
| ambushVc | 11 | 139.12 | 12.6473 | 25.7494 | 25.7494 | 8.1818 | 10 | 0 | 1 | 10 | 0 | 0 | 10 |
| coupNvaRedeployTroops | 16 | 94.52 | 5.9077 | 8.045 | 8.045 | 3.875 | 10 | 0 | 6 | 10 | 0 | 0 | 10 |
| coupVictoryCheck | 20 | 72.58 | 3.6292 | 4.7308 | 4.8799 | 1 | 20 | 0 | 0 | 20 | 4 | 0 | 20 |
| coupResourcesResolve | 20 | 70.12 | 3.5062 | 4.6041 | 6.7757 | 1 | 4 | 0 | 16 | 4 | 0 | 0 | 4 |
| coupAgitatePass | 20 | 68.73 | 3.4366 | 5.0247 | 5.3897 | 1.25 | 18 | 0 | 2 | 18 | 0 | 0 | 18 |
| coupArvnRedeployMandatory | 2 | 56.15 | 28.0757 | 28.2424 | 28.2424 | 11.5 | 1 | 0 | 1 | 1 | 0 | 0 | 1 |
| coupCommitmentResolve | 8 | 35.94 | 4.4928 | 5.9734 | 5.9734 | 2 | 0 | 0 | 8 | 0 | 0 | 0 | 0 |
| ambushNva | 5 | 30.6 | 6.1194 | 10.0054 | 10.0054 | 15.2 | 5 | 0 | 0 | 5 | 0 | 0 | 5 |
| chooseOne:chooseOne | 28 | 19.17 | 0.6845 | 7.4866 | 7.5801 | 5.6786 | 0 | 7 | 2 | 0 | 0 | 0 | 0 |
| assault:chooseOne | 10 | 15.2 | 1.52 | 4.9704 | 4.9704 | 2 | 0 | 4 | 4 | 0 | 0 | 0 | 0 |
| rally:chooseNStep:add | 173 | 12.51 | 0.0723 | 0.0956 | 0.7177 | 20.422 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseNStep:confirm | 218 | 7.93 | 0.0364 | 0.0582 | 0.4039 | 14.8165 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseOne | 176 | 6.53 | 0.0371 | 0.0926 | 0.2075 | 1.3523 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseOne | 36 | 5.89 | 0.1635 | 0.5587 | 3.6454 | 3.9444 | 0 | 1 | 1 | 0 | 0 | 0 | 0 |
| resolveHonoluluPacify | 3 | 5.67 | 1.8898 | 1.9404 | 1.9404 | 1 | 3 | 0 | 0 | 3 | 0 | 0 | 3 |
| pass | 2 | 5.5 | 2.7492 | 3.3119 | 3.3119 | 2.5 | 2 | 0 | 0 | 2 | 0 | 0 | 2 |
| advise:chooseNStep:add | 38 | 3.77 | 0.0993 | 0.6942 | 0.7137 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:confirm | 90 | 3.57 | 0.0397 | 0.0655 | 0.1449 | 5.0778 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:add | 57 | 3.28 | 0.0575 | 0.0984 | 0.1076 | 11.4912 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseOne | 76 | 3.14 | 0.0414 | 0.0737 | 0.1349 | 2.4474 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseNStep:confirm | 83 | 2.84 | 0.0342 | 0.0569 | 0.1371 | 6.253 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:add | 33 | 2.09 | 0.0635 | 0.0847 | 0.629 | 3.6061 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseOne | 56 | 1.99 | 0.0355 | 0.0574 | 0.1787 | 1.625 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupNvaRedeployTroops:chooseOne | 42 | 1.74 | 0.0414 | 0.0621 | 0.0825 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:confirm | 38 | 1.71 | 0.0451 | 0.0906 | 0.1182 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:confirm | 47 | 1.46 | 0.0311 | 0.06 | 0.0889 | 4.4255 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:confirm | 50 | 1.43 | 0.0285 | 0.0446 | 0.1176 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupCommitmentResolve:chooseNStep:confirm | 32 | 0.96 | 0.03 | 0.0476 | 0.0693 | 9.25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:add | 12 | 0.48 | 0.0402 | 0.0538 | 0.0538 | 3.5833 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| chooseNStep:chooseNStep:confirm | 10 | 0.43 | 0.0433 | 0.0589 | 0.0589 | 22.5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:confirm | 12 | 0.3 | 0.0248 | 0.0341 | 0.0341 | 4.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseOne | 11 | 0.24 | 0.022 | 0.0319 | 0.0319 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseNStep:add | 3 | 0.15 | 0.0512 | 0.0604 | 0.0604 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseOne | 5 | 0.14 | 0.0288 | 0.0335 | 0.0335 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseNStep:confirm | 3 | 0.09 | 0.0316 | 0.0386 | 0.0386 | 3.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Top Hot Axes In Slow-Tier Seeds

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.

| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms |
|---:|---|---|---:|---:|---:|---:|---:|
| 1 | train:chooseNStep:add | continuedDeepening | 33 | 54546.24 | 1652.9165 | 3449.7672 | 3792.5421 |
| 2 | train:chooseNStep:confirm | continuedDeepening | 35 | 39527.73 | 1129.3637 | 3370.4528 | 3409.2803 |
| 3 | coupArvnRedeployPolice:chooseOne | continuedDeepening | 52 | 24104.97 | 463.557 | 1771.8768 | 2088.258 |
| 4 | govern:chooseNStep:confirm | continuedDeepening | 25 | 12791.11 | 511.6444 | 315.1305 | 9155.5851 |
| 5 | govern:chooseNStep:add | continuedDeepening | 35 | 11820.45 | 337.7271 | 386.8877 | 5327.8123 |
| 6 | event | singlePass | 95 | 8682.01 | 91.3896 | 176.5599 | 3441.9689 |
| 7 | coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | 72 | 3470.33 | 48.199 | 180.1945 | 230.3425 |
| 8 | govern | singlePass | 32 | 2312.95 | 72.2798 | 122.6882 | 726.8417 |
| 9 | coupArvnRedeployMandatory:chooseOne | continuedDeepening | 12 | 1237.34 | 103.1118 | 163.0058 | 163.0058 |
| 10 | rally | singlePass | 62 | 1208.33 | 19.4892 | 50.8009 | 74.1508 |

## Hot-Path Buckets For Top Slow Axes

Captured only when `--profile-buckets` is enabled. Buckets are timing/count diagnostics inside `PolicyAgent.chooseDecision`; they are not correctness assertions.

### train:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 75316 | 12939.72 |
| zobrist:encodeDecisionStackFrame | 75706 | 7390.49 |
| tokenStateIndex:refreshCachedEntries | 84351 | 1140.82 |
| evalQuery:applyTokenFilter | 39507 | 153.78 |
| evalQuery:countMatchingTokens | 49652 | 85.43 |
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
| zobrist:digestDecisionStackFrame | 54182 | 9531.22 |
| zobrist:encodeDecisionStackFrame | 55108 | 5457.64 |
| tokenStateIndex:refreshCachedEntries | 43507 | 747.18 |
| evalQuery:applyTokenFilter | 16977 | 75.7 |
| evalQuery:countMatchingTokens | 21221 | 43.09 |
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
| tokenStateIndex:refreshCachedEntries | 840820 | 4519.79 |
| evalQuery:countMatchingTokens | 930152 | 1315.2 |
| zobrist:encodeDecisionStackFrame | 368 | 19.12 |
| zobrist:digestDecisionStackFrame | 368 | 18.92 |
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
| tokenStateIndex:refreshCachedEntries | 31003 | 620.1 |
| evalQuery:applyTokenFilter | 200968 | 381.75 |
| zobrist:encodeDecisionStackFrame | 1104 | 44.59 |
| zobrist:digestDecisionStackFrame | 678 | 34.85 |
| evalQuery:countMatchingTokens | 25207 | 29.54 |
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
| tokenStateIndex:refreshCachedEntries | 26725 | 422.98 |
| evalQuery:applyTokenFilter | 122852 | 233.57 |
| zobrist:digestDecisionStackFrame | 4378 | 200.61 |
| zobrist:encodeDecisionStackFrame | 4472 | 167.64 |
| evalQuery:countMatchingTokens | 23502 | 36.84 |
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
| tokenStateIndex:refreshCachedEntries | 67740 | 854.42 |
| evalQuery:applyTokenFilter | 104207 | 275.86 |
| zobrist:digestDecisionStackFrame | 870 | 166.29 |
| zobrist:encodeDecisionStackFrame | 870 | 103.31 |
| evalQuery:countMatchingTokens | 53299 | 62.54 |
| policyWasmRuntime:encodeBytecodeInput | 988 | 32.06 |
| tokenStateIndex:build | 18 | 0.93 |
| evalQuery:applyTokenFilterCacheHit | 18014 | 0 |
| evalQuery:applyTokenFilterCompiled | 102599 | 0 |
| evalQuery:countMatchingTokensCacheHit | 1520691 | 0 |
| evalQuery:countMatchingTokensCompiled | 34477 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 3108106 | 0 |

### coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 90320 | 466.84 |
| evalQuery:countMatchingTokens | 113580 | 122.65 |
| zobrist:digestDecisionStackFrame | 128 | 5.64 |
| zobrist:encodeDecisionStackFrame | 128 | 5.27 |
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
| tokenStateIndex:refreshCachedEntries | 4319 | 72.49 |
| evalQuery:applyTokenFilter | 16255 | 66.71 |
| zobrist:digestDecisionStackFrame | 454 | 53.51 |
| zobrist:encodeDecisionStackFrame | 454 | 37.52 |
| evalQuery:countMatchingTokens | 12073 | 17.31 |
| policyWasmRuntime:encodeBytecodeInput | 282 | 7.97 |
| evalQuery:applyTokenFilterCacheHit | 11829 | 0 |
| evalQuery:applyTokenFilterCompiled | 15656 | 0 |
| evalQuery:countMatchingTokensCacheHit | 658489 | 0 |
| evalQuery:countMatchingTokensCompiled | 3143 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1295657 | 0 |
| policyWasmRuntime:encodedInputCacheMiss | 282 | 0 |

### coupArvnRedeployMandatory:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 32392 | 219.64 |
| evalQuery:countMatchingTokens | 46348 | 58.06 |
| zobrist:encodeDecisionStackFrame | 64 | 3.27 |
| zobrist:digestDecisionStackFrame | 64 | 2.3 |
| evalQuery:applyTokenFilterCacheHit | 3200 | 0 |
| evalQuery:countMatchingTokensCacheHit | 1030656 | 0 |
| evalQuery:countMatchingTokensCompiled | 46348 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 2913754 | 0 |
| tokenStateIndex:getCacheHit | 32392 | 0 |
| zobrist:decisionStackFrameEncodedChars | 275288 | 0 |
| zobrist:decisionStackFrameRunLocalCacheMiss | 64 | 0 |

### rally | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 6793 | 68.93 |
| evalQuery:applyTokenFilter | 5063 | 54.74 |
| policyWasmRuntime:encodeBytecodeInput | 335 | 12.83 |
| zobrist:digestDecisionStackFrame | 180 | 12.4 |
| zobrist:encodeDecisionStackFrame | 180 | 10.49 |
| evalQuery:countMatchingTokens | 6103 | 6.44 |
| evalQuery:applyTokenFilterCacheHit | 3004 | 0 |
| evalQuery:applyTokenFilterCompiled | 4286 | 0 |
| evalQuery:countMatchingTokensCacheHit | 554744 | 0 |
| evalQuery:countMatchingTokensCompiled | 6103 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1342116 | 0 |
| policyWasmRuntime:encodedInputCacheMiss | 335 | 0 |


## Fast-Tier vs Slow-Tier Delta

Fast tier: `1000`, `1006`, `1007`, `1010`, `1014`. Rows with ratio greater than `3.0` satisfy the Phase 0 hot-axis criterion.

| Microturn class | Slow decisions | Fast decisions | Slow mean ms | Fast mean ms | Slow:fast ratio | Verdict |
|---|---:|---:|---:|---:|---:|---|
| train:chooseNStep:confirm | 49 | 6 | 806.725 | 0.0823 | 9802.2479 | hot axis |
| train:chooseNStep:add | 33 | 6 | 1652.9165 | 348.7802 | 4.7391 | hot axis |
| coupArvnRedeployPolice:chooseOne | 52 | 50 | 463.557 | 153.8958 | 3.0121 | hot axis |
| train | 17 | 3 | 27.0803 | 12.3512 | 2.1925 |  |
| govern:chooseNStep:confirm | 30 | 35 | 426.3862 | 199.6025 | 2.1362 |  |
| coupNvaRedeployTroops | 7 | 1 | 6.424 | 3.4974 | 1.8368 |  |
| govern:chooseNStep:add | 35 | 35 | 337.7271 | 212.9665 | 1.5858 |  |
| advise:chooseNStep:add | 8 | 15 | 0.1559 | 0.0996 | 1.5653 |  |
| pass | 1 | 1 | 3.3119 | 2.1865 | 1.5147 |  |
| advise | 8 | 15 | 11.1499 | 8.1026 | 1.3761 |  |
| train:chooseOne | 29 | 6 | 6.9949 | 5.2129 | 1.3418 |  |
| advise:chooseNStep:confirm | 8 | 15 | 0.0523 | 0.0397 | 1.3174 |  |
| advise:chooseOne | 16 | 30 | 0.0488 | 0.0377 | 1.2944 |  |
| govern | 32 | 35 | 72.2798 | 56.3882 | 1.2818 |  |
| march:chooseNStep:add | 21 | 22 | 0.0643 | 0.0509 | 1.2633 |  |
| transport | 5 | 3 | 68.8 | 55.4354 | 1.2411 |  |
| assault | 8 | 9 | 7.7532 | 6.2725 | 1.2361 |  |
| chooseNStep:chooseNStep:confirm | 4 | 3 | 0.0437 | 0.0373 | 1.1716 |  |
| coupCommitmentResolve:chooseNStep:confirm | 8 | 12 | 0.0316 | 0.0282 | 1.1206 |  |
| coupRedeployPass | 28 | 24 | 7.4258 | 6.7269 | 1.1039 |  |
| coupPacifyARVN | 8 | 8 | 10.162 | 9.2463 | 1.099 |  |
| coupArvnRedeployPolice | 27 | 32 | 23.2398 | 21.3524 | 1.0884 |  |
| coupAgitatePass | 7 | 6 | 3.6162 | 3.3345 | 1.0845 |  |
| coupVictoryCheck | 7 | 6 | 3.7044 | 3.4309 | 1.0797 |  |
| govern:chooseOne | 37 | 35 | 3.688 | 3.4604 | 1.0658 |  |
| coupPacifyUS | 25 | 26 | 6.1509 | 5.7864 | 1.063 |  |
| rally:chooseOne | 64 | 57 | 0.0382 | 0.036 | 1.0611 |  |
| coupResourcesResolve | 7 | 6 | 3.7881 | 3.575 | 1.0596 |  |
| coupCommitmentResolve | 2 | 3 | 4.8374 | 4.5662 | 1.0594 |  |
| coupArvnRedeployOptionalTroops | 31 | 25 | 25.0915 | 23.7056 | 1.0585 |  |
| march | 15 | 13 | 6.0411 | 5.7441 | 1.0517 |  |
| coupCommitmentPass | 28 | 24 | 3.0705 | 2.9646 | 1.0357 |  |
| ambushVc:chooseNStep:confirm | 5 | 3 | 0.0252 | 0.0245 | 1.0286 |  |
| rally:chooseNStep:confirm | 73 | 73 | 0.0375 | 0.0377 | 0.9947 |  |
| event-decision:chooseNStep:confirm | 43 | 26 | 0.0345 | 0.0351 | 0.9829 |  |
| event | 95 | 78 | 91.3896 | 93.8762 | 0.9735 |  |
| attack | 6 | 8 | 10.679 | 11.2583 | 0.9485 |  |
| coupArvnRedeployOptionalTroops:chooseOne | 72 | 60 | 48.199 | 51.4342 | 0.9371 |  |
| ambushVc:chooseOne | 5 | 4 | 0.0214 | 0.0229 | 0.9345 |  |
| coupAgitateVC | 19 | 25 | 4.6604 | 5.2965 | 0.8799 |  |
| chooseOne:chooseOne | 11 | 8 | 0.8433 | 0.9861 | 0.8552 |  |
| coupPacifyPass | 14 | 12 | 3.942 | 4.6112 | 0.8549 |  |
| infiltrate | 10 | 8 | 8.0905 | 9.5258 | 0.8493 |  |
| rally:chooseNStep:add | 63 | 56 | 0.0677 | 0.0801 | 0.8452 |  |
| assault:chooseNStep:confirm | 16 | 13 | 0.0266 | 0.0315 | 0.8444 |  |
| ambushVc:chooseNStep:add | 5 | 3 | 0.0393 | 0.0466 | 0.8433 |  |
| march:chooseNStep:confirm | 34 | 29 | 0.0376 | 0.0457 | 0.8228 |  |
| rally | 62 | 54 | 19.4892 | 25.3484 | 0.7689 |  |
| infiltrate:chooseNStep:confirm | 15 | 12 | 0.03 | 0.0404 | 0.7426 |  |
| infiltrate:chooseOne | 16 | 14 | 0.0322 | 0.0438 | 0.7352 |  |
| coupNvaRedeployTroops:chooseOne | 19 | 2 | 0.0403 | 0.063 | 0.6397 |  |
| ambushVc | 5 | 4 | 8.675 | 13.8662 | 0.6256 |  |
| transport:chooseOne | 10 | 6 | 98.6049 | 162.2443 | 0.6078 |  |
| infiltrate:chooseNStep:add | 10 | 8 | 0.0517 | 0.1157 | 0.4468 |  |
| event-decision:chooseOne | 13 | 6 | 0.0448 | 0.1439 | 0.3113 |  |
| assault:chooseOne | 2 | 5 | 0.0329 | 2.3519 | 0.014 |  |
| event-decision:chooseNStep:add | 43 | 29 | 0.0498 | 27.7127 | 0.0018 |  |
| assault:chooseNStep:add | 8 | 7 | 0.0564 | 624.7619 | 0.0001 |  |

## Notes

- `elapsedMs` is measured around the per-decision `PolicyAgent.chooseDecision` call. It excludes simulator apply/delta work and report rendering.
- Child processes enforce the per-seed timeout. Each child loads the built engine and production FITL GameSpecDoc, using the repo GameDef cache when available.
- The script does not modify engine source or production profile data.
