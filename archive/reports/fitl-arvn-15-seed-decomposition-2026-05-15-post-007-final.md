# FITL ARVN 15-Seed Per-Microturn-Class Decomposition

**Status**: ✅ EXPLOITED — referenced during spec 174 implementation (archived 2026-05-16).

**Date**: 2026-05-15-post-007-final
**Status**: Spec 173 measurement witness.
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 400000 --date 2026-05-15-post-007-final --profile-buckets`
**CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-007-final.csv`

## Summary

- Seeds completed: 15/15
- Per-decision rows: 3741
- Hot class with slow:fast ratio >3x: yes
- Per-seed timeout: 400000 ms
- Hot-path buckets: enabled

## Per-Seed Wall Time

| Seed | Status | Stop Reason | Wall ms | Decisions | ms/decision | Error |
|---:|---|---|---:|---:|---:|---|
| 1000 | OK | terminal | 7667.93 | 159 | 48.226 |  |
| 1001 | OK | terminal | 16934.55 | 194 | 87.2915 |  |
| 1002 | OK | terminal | 21424.34 | 288 | 74.3901 |  |
| 1003 | OK | terminal | 17721.82 | 226 | 78.4151 |  |
| 1004 | OK | terminal | 26732.94 | 338 | 79.0915 |  |
| 1005 | OK | terminal | 74562.87 | 412 | 180.9778 |  |
| 1006 | OK | terminal | 10766.23 | 228 | 47.2203 |  |
| 1007 | OK | terminal | 8001.61 | 218 | 36.7046 |  |
| 1008 | OK | terminal | 27168.85 | 166 | 163.6678 |  |
| 1009 | OK | terminal | 29434.86 | 303 | 97.1448 |  |
| 1010 | OK | terminal | 20265.3 | 319 | 63.5276 |  |
| 1011 | OK | terminal | 27011.68 | 212 | 127.4136 |  |
| 1012 | OK | terminal | 26357.73 | 213 | 123.7452 |  |
| 1013 | OK | terminal | 24817.9 | 252 | 98.4837 |  |
| 1014 | OK | terminal | 19429.54 | 213 | 91.2185 |  |

## Per-Microturn-Class Rollup

| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | Token index builds | Static rebuilds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| train:chooseNStep:add | 62 | 93620.49 | 1510.0079 | 3313.0457 | 3462.9793 | 18.5 | 0 | 26647 | 56148 | 0 | 0 | 0 | 0 |
| train:chooseNStep:confirm | 94 | 54360.64 | 578.3046 | 3255.9506 | 3488.0114 | 7.0638 | 0 | 15975 | 34518 | 0 | 0 | 0 | 0 |
| coupArvnRedeployPolice:chooseOne | 145 | 45390.86 | 313.0404 | 1450.6818 | 2024.1637 | 30.7241 | 0 | 93582 | 3151 | 0 | 0 | 0 | 0 |
| govern:chooseNStep:add | 115 | 27770.28 | 241.4807 | 363.6852 | 5271.8505 | 6.687 | 0 | 3600 | 5625 | 0 | 0 | 0 | 0 |
| event | 245 | 24836.53 | 101.3736 | 110.5236 | 5241.1135 | 18.9224 | 245 | 0 | 0 | 245 | 234 | 38 | 275 |
| govern:chooseNStep:confirm | 102 | 24619.72 | 241.3698 | 389.982 | 8747.0329 | 6.8824 | 0 | 2336 | 1059 | 0 | 0 | 0 | 0 |
| coupArvnRedeployOptionalTroops:chooseOne | 204 | 10088.88 | 49.4553 | 180.3257 | 240.4385 | 8.4118 | 0 | 11928 | 1638 | 0 | 0 | 0 | 0 |
| govern | 104 | 6225.96 | 59.865 | 92.3447 | 695.6916 | 10.7115 | 97 | 0 | 7 | 97 | 40 | 0 | 97 |
| assault:chooseNStep:add | 26 | 4421.23 | 170.0475 | 77.264 | 4342.6642 | 3.1538 | 0 | 18 | 4 | 0 | 0 | 0 | 0 |
| rally | 170 | 4067.64 | 23.9273 | 50.9863 | 164.0273 | 15.8882 | 148 | 0 | 22 | 148 | 101 | 0 | 148 |
| coupArvnRedeployOptionalTroops | 87 | 2182.27 | 25.0836 | 30.0852 | 35.3134 | 17.2874 | 70 | 0 | 17 | 70 | 0 | 0 | 70 |
| transport:chooseOne | 16 | 2008.83 | 125.5519 | 385.3651 | 385.3651 | 17.6875 | 0 | 1191 | 46 | 0 | 0 | 0 | 0 |
| coupArvnRedeployPolice | 84 | 1911.63 | 22.7575 | 25.4791 | 26.8144 | 11.7262 | 82 | 0 | 2 | 82 | 0 | 0 | 82 |
| coupArvnRedeployMandatory:chooseOne | 12 | 1171.34 | 97.6119 | 151.5767 | 151.5767 | 8 | 0 | 1428 | 204 | 0 | 0 | 0 | 0 |
| event-decision:chooseNStep:add | 93 | 1060.22 | 11.4002 | 89.9047 | 322.3657 | 12.129 | 0 | 112 | 360 | 0 | 0 | 0 | 0 |
| train | 33 | 835.63 | 25.322 | 41.0228 | 61.7019 | 7.8485 | 32 | 0 | 1 | 32 | 92 | 0 | 32 |
| coupRedeployPass | 80 | 579.16 | 7.2395 | 22.5852 | 25.4515 | 2.975 | 31 | 0 | 49 | 31 | 15 | 0 | 31 |
| transport | 8 | 513.51 | 64.1887 | 99.6185 | 99.6185 | 11.25 | 8 | 0 | 0 | 8 | 0 | 0 | 8 |
| coupPacifyUS | 76 | 477.55 | 6.2836 | 9.4593 | 13.6228 | 2.7763 | 76 | 0 | 0 | 76 | 0 | 0 | 76 |
| govern:chooseOne | 117 | 435.03 | 3.7182 | 6.0065 | 10.5519 | 2 | 0 | 143 | 143 | 0 | 0 | 0 | 0 |
| train:chooseOne | 58 | 408.33 | 7.0401 | 11.3132 | 11.8445 | 2.2759 | 0 | 166 | 198 | 0 | 0 | 0 | 0 |
| advise | 38 | 352.26 | 9.2699 | 16.517 | 33.4001 | 11.4474 | 28 | 0 | 10 | 28 | 8 | 0 | 28 |
| coupAgitateVC | 60 | 326.71 | 5.4451 | 7.6362 | 10.0418 | 2.95 | 42 | 0 | 18 | 42 | 12 | 0 | 42 |
| infiltrate | 33 | 309.82 | 9.3884 | 13.0403 | 17.37 | 41.5152 | 26 | 0 | 7 | 26 | 15 | 0 | 26 |
| coupPacifyARVN | 31 | 284.49 | 9.1771 | 13.9949 | 17.0022 | 3.9355 | 15 | 0 | 16 | 15 | 10 | 0 | 15 |
| march | 40 | 256.15 | 6.4038 | 10.8953 | 12.8767 | 9.125 | 30 | 0 | 10 | 30 | 66 | 0 | 30 |
| coupCommitmentPass | 80 | 246.5 | 3.0813 | 4.4533 | 6.2121 | 1.15 | 8 | 0 | 72 | 8 | 0 | 0 | 8 |
| assault | 28 | 205.57 | 7.3418 | 9.8218 | 10.6389 | 4.8571 | 27 | 0 | 1 | 27 | 3 | 0 | 27 |
| coupPacifyPass | 40 | 173.84 | 4.3459 | 6.7203 | 11.9283 | 1.125 | 36 | 0 | 4 | 36 | 0 | 0 | 36 |
| attack | 14 | 150.79 | 10.7708 | 28.5642 | 28.5642 | 34.9286 | 12 | 0 | 2 | 12 | 0 | 0 | 12 |
| ambushVc | 11 | 146.26 | 13.2967 | 24.8069 | 24.8069 | 8.1818 | 10 | 0 | 1 | 10 | 0 | 0 | 10 |
| coupNvaRedeployTroops | 16 | 92.1 | 5.7563 | 8.0193 | 8.0193 | 3.875 | 10 | 0 | 6 | 10 | 0 | 0 | 10 |
| coupAgitatePass | 20 | 75.36 | 3.7682 | 5.2396 | 5.751 | 1.25 | 18 | 0 | 2 | 18 | 0 | 0 | 18 |
| coupResourcesResolve | 20 | 72.27 | 3.6135 | 5.3869 | 5.4101 | 1 | 4 | 0 | 16 | 4 | 0 | 0 | 4 |
| coupVictoryCheck | 20 | 69.26 | 3.4632 | 4.9376 | 5.4614 | 1 | 20 | 0 | 0 | 20 | 4 | 0 | 20 |
| coupArvnRedeployMandatory | 2 | 53.73 | 26.8638 | 27.274 | 27.274 | 11.5 | 1 | 0 | 1 | 1 | 0 | 0 | 1 |
| coupCommitmentResolve | 8 | 31.83 | 3.9785 | 4.293 | 4.293 | 2 | 0 | 0 | 8 | 0 | 0 | 0 | 0 |
| ambushNva | 5 | 30.7 | 6.139 | 9.255 | 9.255 | 15.2 | 5 | 0 | 0 | 5 | 0 | 0 | 5 |
| chooseOne:chooseOne | 28 | 19.56 | 0.6986 | 7.35 | 8.0048 | 5.6786 | 0 | 7 | 2 | 0 | 0 | 0 | 0 |
| assault:chooseOne | 10 | 15.27 | 1.5271 | 4.7483 | 4.7483 | 2 | 0 | 4 | 4 | 0 | 0 | 0 | 0 |
| rally:chooseNStep:add | 173 | 12.92 | 0.0747 | 0.1041 | 0.7519 | 20.422 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseNStep:confirm | 218 | 8.7 | 0.0399 | 0.0743 | 1.0175 | 14.8165 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseOne | 36 | 7.05 | 0.1958 | 0.5982 | 4.8109 | 3.9444 | 0 | 1 | 1 | 0 | 0 | 0 | 0 |
| rally:chooseOne | 176 | 6.54 | 0.0371 | 0.1002 | 0.1568 | 1.3523 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| pass | 2 | 5.24 | 2.6175 | 3.0624 | 3.0624 | 2.5 | 2 | 0 | 0 | 2 | 0 | 0 | 2 |
| resolveHonoluluPacify | 3 | 5.17 | 1.723 | 1.8522 | 1.8522 | 1 | 3 | 0 | 0 | 3 | 0 | 0 | 3 |
| advise:chooseNStep:add | 38 | 4 | 0.1053 | 0.7093 | 0.729 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:confirm | 90 | 3.88 | 0.0431 | 0.0784 | 0.1098 | 5.0778 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:add | 57 | 3.54 | 0.0621 | 0.0966 | 0.1194 | 11.4912 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseOne | 76 | 3.42 | 0.045 | 0.098 | 0.1412 | 2.4474 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseNStep:confirm | 83 | 2.98 | 0.0359 | 0.0836 | 0.1706 | 6.253 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:add | 33 | 2.35 | 0.0711 | 0.2393 | 0.6521 | 3.6061 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseOne | 56 | 1.93 | 0.0345 | 0.0596 | 0.1451 | 1.625 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:confirm | 38 | 1.83 | 0.0483 | 0.0833 | 0.0971 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupNvaRedeployTroops:chooseOne | 42 | 1.79 | 0.0425 | 0.0565 | 0.0967 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:confirm | 47 | 1.66 | 0.0352 | 0.0649 | 0.1115 | 4.4255 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:confirm | 50 | 1.51 | 0.0303 | 0.0632 | 0.1054 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupCommitmentResolve:chooseNStep:confirm | 32 | 1.01 | 0.0316 | 0.0494 | 0.0525 | 9.25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:add | 12 | 0.52 | 0.0434 | 0.0574 | 0.0574 | 3.5833 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| chooseNStep:chooseNStep:confirm | 10 | 0.44 | 0.0435 | 0.0537 | 0.0537 | 22.5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:confirm | 12 | 0.33 | 0.0275 | 0.0374 | 0.0374 | 4.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseOne | 11 | 0.26 | 0.0235 | 0.0304 | 0.0304 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseOne | 5 | 0.15 | 0.0299 | 0.0402 | 0.0402 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseNStep:add | 3 | 0.13 | 0.0449 | 0.0504 | 0.0504 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseNStep:confirm | 3 | 0.11 | 0.0356 | 0.0494 | 0.0494 | 3.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Top Hot Axes In Slow-Tier Seeds

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.

| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms |
|---:|---|---|---:|---:|---:|---:|---:|
| 1 | train:chooseNStep:add | continuedDeepening | 33 | 54468.25 | 1650.5531 | 3389.7181 | 3462.9793 |
| 2 | train:chooseNStep:confirm | continuedDeepening | 35 | 40155.09 | 1147.2882 | 3468.1342 | 3488.0114 |
| 3 | coupArvnRedeployPolice:chooseOne | continuedDeepening | 52 | 24683.69 | 474.6863 | 1819.1139 | 2024.1637 |
| 4 | govern:chooseNStep:confirm | continuedDeepening | 25 | 12557.7 | 502.308 | 309.9095 | 8747.0329 |
| 5 | govern:chooseNStep:add | continuedDeepening | 35 | 11984.53 | 342.4151 | 406.133 | 5271.8505 |
| 6 | event | singlePass | 95 | 8712.94 | 91.7151 | 174.7225 | 3357.7507 |
| 7 | coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | 72 | 3536.4 | 49.1167 | 186.2865 | 240.4385 |
| 8 | govern | singlePass | 32 | 2318.14 | 72.4419 | 102.8766 | 695.6916 |
| 9 | rally | singlePass | 62 | 1261.21 | 20.3422 | 50.1695 | 69.0473 |
| 10 | coupArvnRedeployMandatory:chooseOne | continuedDeepening | 12 | 1171.34 | 97.6119 | 151.5767 | 151.5767 |

## Hot-Path Buckets For Top Slow Axes

Captured only when `--profile-buckets` is enabled. Buckets are timing/count diagnostics inside `PolicyAgent.chooseDecision`; they are not correctness assertions.

### train:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 75316 | 12976.23 |
| zobrist:encodeDecisionStackFrame | 75706 | 7422.42 |
| tokenStateIndex:refreshCachedEntries | 84351 | 1160.67 |
| evalQuery:applyTokenFilter | 39507 | 143.78 |
| evalQuery:countMatchingTokens | 49652 | 80.96 |
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
| zobrist:digestDecisionStackFrame | 54182 | 9597.13 |
| zobrist:encodeDecisionStackFrame | 55108 | 5568.09 |
| tokenStateIndex:refreshCachedEntries | 43507 | 732.7 |
| evalQuery:applyTokenFilter | 16977 | 90.8 |
| evalQuery:countMatchingTokens | 21221 | 43.71 |
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
| tokenStateIndex:refreshCachedEntries | 840820 | 4661.9 |
| evalQuery:countMatchingTokens | 930152 | 1297.74 |
| zobrist:digestDecisionStackFrame | 368 | 19.19 |
| zobrist:encodeDecisionStackFrame | 368 | 18.14 |
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
| tokenStateIndex:refreshCachedEntries | 31003 | 603.71 |
| evalQuery:applyTokenFilter | 200968 | 327.11 |
| zobrist:encodeDecisionStackFrame | 1104 | 46.65 |
| zobrist:digestDecisionStackFrame | 678 | 34.7 |
| evalQuery:countMatchingTokens | 25207 | 34.26 |
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
| tokenStateIndex:refreshCachedEntries | 26725 | 443.91 |
| evalQuery:applyTokenFilter | 122852 | 219.09 |
| zobrist:digestDecisionStackFrame | 4378 | 202.91 |
| zobrist:encodeDecisionStackFrame | 4472 | 178.64 |
| evalQuery:countMatchingTokens | 23502 | 29.06 |
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
| tokenStateIndex:refreshCachedEntries | 67740 | 846.08 |
| evalQuery:applyTokenFilter | 104207 | 264.46 |
| zobrist:digestDecisionStackFrame | 870 | 168.5 |
| zobrist:encodeDecisionStackFrame | 870 | 106.24 |
| evalQuery:countMatchingTokens | 53299 | 52.31 |
| policyWasmRuntime:encodeBytecodeInput | 988 | 28.08 |
| tokenStateIndex:build | 18 | 0.71 |
| evalQuery:applyTokenFilterCacheHit | 18014 | 0 |
| evalQuery:applyTokenFilterCompiled | 102599 | 0 |
| evalQuery:countMatchingTokensCacheHit | 1520691 | 0 |
| evalQuery:countMatchingTokensCompiled | 34477 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 3108106 | 0 |

### coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 90320 | 487.09 |
| evalQuery:countMatchingTokens | 113580 | 123.13 |
| zobrist:digestDecisionStackFrame | 128 | 5.79 |
| zobrist:encodeDecisionStackFrame | 128 | 5.72 |
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
| evalQuery:applyTokenFilter | 16255 | 64.04 |
| tokenStateIndex:refreshCachedEntries | 4319 | 60.2 |
| zobrist:digestDecisionStackFrame | 454 | 53.26 |
| zobrist:encodeDecisionStackFrame | 454 | 38.36 |
| evalQuery:countMatchingTokens | 12073 | 16.08 |
| policyWasmRuntime:encodeBytecodeInput | 282 | 7.18 |
| evalQuery:applyTokenFilterCacheHit | 11829 | 0 |
| evalQuery:applyTokenFilterCompiled | 15656 | 0 |
| evalQuery:countMatchingTokensCacheHit | 658489 | 0 |
| evalQuery:countMatchingTokensCompiled | 3143 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1295657 | 0 |
| policyWasmRuntime:encodedInputCacheMiss | 282 | 0 |

### rally | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 6793 | 78.42 |
| evalQuery:applyTokenFilter | 5063 | 52.38 |
| policyWasmRuntime:encodeBytecodeInput | 335 | 15.3 |
| zobrist:digestDecisionStackFrame | 180 | 12.52 |
| zobrist:encodeDecisionStackFrame | 180 | 9.79 |
| evalQuery:countMatchingTokens | 6103 | 7.56 |
| evalQuery:applyTokenFilterCacheHit | 3004 | 0 |
| evalQuery:applyTokenFilterCompiled | 4286 | 0 |
| evalQuery:countMatchingTokensCacheHit | 554744 | 0 |
| evalQuery:countMatchingTokensCompiled | 6103 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1342116 | 0 |
| policyWasmRuntime:encodedInputCacheMiss | 335 | 0 |

### coupArvnRedeployMandatory:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 32392 | 185.77 |
| evalQuery:countMatchingTokens | 46348 | 60.24 |
| zobrist:encodeDecisionStackFrame | 64 | 2.93 |
| zobrist:digestDecisionStackFrame | 64 | 2.37 |
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
| train:chooseNStep:confirm | 49 | 6 | 819.5283 | 0.0847 | 9675.6588 | hot axis |
| train:chooseNStep:add | 33 | 6 | 1650.5531 | 360.6736 | 4.5763 | hot axis |
| coupArvnRedeployPolice:chooseOne | 52 | 50 | 474.6863 | 162.6832 | 2.9179 |  |
| train | 17 | 3 | 27.1019 | 13.1978 | 2.0535 |  |
| govern:chooseNStep:confirm | 30 | 35 | 418.6051 | 208.9246 | 2.0036 |  |
| coupNvaRedeployTroops | 7 | 1 | 6.4426 | 3.2265 | 1.9968 |  |
| advise:chooseNStep:add | 8 | 15 | 0.1678 | 0.1025 | 1.6371 |  |
| govern:chooseNStep:add | 35 | 35 | 342.4151 | 221.8808 | 1.5432 |  |
| pass | 1 | 1 | 3.0624 | 2.1726 | 1.4096 |  |
| train:chooseOne | 29 | 6 | 7.1227 | 5.322 | 1.3384 |  |
| advise:chooseOne | 16 | 30 | 0.0561 | 0.042 | 1.3357 |  |
| advise:chooseNStep:confirm | 8 | 15 | 0.0567 | 0.0436 | 1.3005 |  |
| advise | 8 | 15 | 10.0497 | 8.0556 | 1.2475 |  |
| govern | 32 | 35 | 72.4419 | 58.7724 | 1.2326 |  |
| assault | 8 | 9 | 7.9748 | 6.5815 | 1.2117 |  |
| march:chooseNStep:add | 21 | 22 | 0.0672 | 0.0558 | 1.2043 |  |
| coupPacifyARVN | 8 | 8 | 11.0915 | 9.3347 | 1.1882 |  |
| transport | 5 | 3 | 67.6123 | 58.4826 | 1.1561 |  |
| coupRedeployPass | 28 | 24 | 7.5981 | 6.5977 | 1.1516 |  |
| chooseNStep:chooseNStep:confirm | 4 | 3 | 0.0455 | 0.0398 | 1.1432 |  |
| march | 15 | 13 | 6.4535 | 5.6727 | 1.1376 |  |
| coupVictoryCheck | 7 | 6 | 3.5726 | 3.1734 | 1.1258 |  |
| coupAgitatePass | 7 | 6 | 4.1667 | 3.8202 | 1.0907 |  |
| govern:chooseOne | 37 | 35 | 3.8588 | 3.5437 | 1.0889 |  |
| coupCommitmentResolve:chooseNStep:confirm | 8 | 12 | 0.0326 | 0.0302 | 1.0795 |  |
| coupPacifyUS | 25 | 26 | 6.6667 | 6.1831 | 1.0782 |  |
| coupArvnRedeployPolice | 27 | 32 | 23.3598 | 22.2539 | 1.0497 |  |
| coupArvnRedeployOptionalTroops | 31 | 25 | 25.4054 | 24.7488 | 1.0265 |  |
| rally:chooseNStep:confirm | 73 | 73 | 0.0364 | 0.036 | 1.0111 |  |
| rally:chooseOne | 64 | 57 | 0.0373 | 0.0371 | 1.0054 |  |
| coupCommitmentResolve | 2 | 3 | 4.0228 | 4.0354 | 0.9969 |  |
| coupCommitmentPass | 28 | 24 | 3.0404 | 3.061 | 0.9933 |  |
| ambushVc:chooseNStep:confirm | 5 | 3 | 0.0268 | 0.027 | 0.9926 |  |
| attack | 6 | 8 | 10.7105 | 10.8161 | 0.9902 |  |
| event | 95 | 78 | 91.7151 | 95.0276 | 0.9651 |  |
| infiltrate:chooseOne | 16 | 14 | 0.0369 | 0.0385 | 0.9584 |  |
| event-decision:chooseNStep:confirm | 43 | 26 | 0.0358 | 0.0376 | 0.9521 |  |
| coupPacifyPass | 14 | 12 | 4.3902 | 4.6185 | 0.9506 |  |
| coupResourcesResolve | 7 | 6 | 3.4991 | 3.7403 | 0.9355 |  |
| coupAgitateVC | 19 | 25 | 5.1941 | 5.6023 | 0.9271 |  |
| coupArvnRedeployOptionalTroops:chooseOne | 72 | 60 | 49.1167 | 53.4653 | 0.9187 |  |
| chooseOne:chooseOne | 11 | 8 | 0.8826 | 0.9708 | 0.9091 |  |
| ambushVc:chooseOne | 5 | 4 | 0.0221 | 0.0244 | 0.9057 |  |
| infiltrate | 10 | 8 | 8.7002 | 9.7674 | 0.8907 |  |
| assault:chooseNStep:confirm | 16 | 13 | 0.0309 | 0.0352 | 0.8778 |  |
| ambushVc:chooseNStep:add | 5 | 3 | 0.0429 | 0.0496 | 0.8649 |  |
| infiltrate:chooseNStep:confirm | 15 | 12 | 0.0352 | 0.0438 | 0.8037 |  |
| march:chooseNStep:confirm | 34 | 29 | 0.0407 | 0.0511 | 0.7965 |  |
| rally:chooseNStep:add | 63 | 56 | 0.0675 | 0.0848 | 0.796 |  |
| rally | 62 | 54 | 20.3422 | 25.6117 | 0.7943 |  |
| ambushVc | 5 | 4 | 9.4656 | 15.0083 | 0.6307 |  |
| transport:chooseOne | 10 | 6 | 99.0047 | 169.7972 | 0.5831 |  |
| coupNvaRedeployTroops:chooseOne | 19 | 2 | 0.0388 | 0.0733 | 0.5293 |  |
| infiltrate:chooseNStep:add | 10 | 8 | 0.0486 | 0.1432 | 0.3394 |  |
| event-decision:chooseOne | 13 | 6 | 0.0415 | 0.1456 | 0.285 |  |
| assault:chooseOne | 2 | 5 | 0.0579 | 2.3741 | 0.0244 |  |
| event-decision:chooseNStep:add | 43 | 29 | 0.0479 | 29.1306 | 0.0016 |  |
| assault:chooseNStep:add | 8 | 7 | 0.0648 | 620.4224 | 0.0001 |  |

## Notes

- `elapsedMs` is measured around the per-decision `PolicyAgent.chooseDecision` call. It excludes simulator apply/delta work and report rendering.
- Child processes enforce the per-seed timeout. Each child loads the built engine and production FITL GameSpecDoc, using the repo GameDef cache when available.
- The script does not modify engine source or production profile data.
