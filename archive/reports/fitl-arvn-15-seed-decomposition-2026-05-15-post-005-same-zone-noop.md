# FITL ARVN 15-Seed Per-Microturn-Class Decomposition

**Status**: ✅ EXPLOITED — referenced during spec 174 implementation (archived 2026-05-16).

**Date**: 2026-05-15-post-005-same-zone-noop
**Status**: Spec 173 measurement witness.
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 400000 --date 2026-05-15-post-005-same-zone-noop --profile-buckets`
**CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-005-same-zone-noop.csv`

## Summary

- Seeds completed: 15/15
- Per-decision rows: 3741
- Hot class with slow:fast ratio >3x: yes
- Per-seed timeout: 400000 ms
- Hot-path buckets: enabled

## Per-Seed Wall Time

| Seed | Status | Stop Reason | Wall ms | Decisions | ms/decision | Error |
|---:|---|---|---:|---:|---:|---|
| 1000 | OK | terminal | 12570.56 | 159 | 79.0601 |  |
| 1001 | OK | terminal | 20508.78 | 194 | 105.7154 |  |
| 1002 | OK | terminal | 26628.56 | 288 | 92.4603 |  |
| 1003 | OK | terminal | 21688.57 | 226 | 95.9671 |  |
| 1004 | OK | terminal | 31749.13 | 338 | 93.9323 |  |
| 1005 | OK | terminal | 86599.99 | 412 | 210.1942 |  |
| 1006 | OK | terminal | 16135.17 | 228 | 70.7683 |  |
| 1007 | OK | terminal | 12581.24 | 218 | 57.7121 |  |
| 1008 | OK | terminal | 31504.03 | 166 | 189.7833 |  |
| 1009 | OK | terminal | 34382.43 | 303 | 113.4734 |  |
| 1010 | OK | terminal | 26162.53 | 319 | 82.0142 |  |
| 1011 | OK | terminal | 32258.07 | 212 | 152.1607 |  |
| 1012 | OK | terminal | 32630.05 | 213 | 153.1927 |  |
| 1013 | OK | terminal | 30079.92 | 252 | 119.3648 |  |
| 1014 | OK | terminal | 23875.87 | 213 | 112.0933 |  |

## Per-Microturn-Class Rollup

| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | Token index builds | Static rebuilds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| train:chooseNStep:add | 62 | 92386.42 | 1490.1035 | 3359.6552 | 3485.2397 | 18.5 | 0 | 26647 | 56148 | 0 | 0 | 0 | 0 |
| coupArvnRedeployPolice:chooseOne | 145 | 90272 | 622.5655 | 1983.7472 | 2643.6561 | 30.7241 | 0 | 93582 | 3151 | 0 | 0 | 0 | 0 |
| train:chooseNStep:confirm | 94 | 54358.03 | 578.2769 | 3303.8874 | 3534.8846 | 7.0638 | 0 | 15975 | 34518 | 0 | 0 | 0 | 0 |
| coupArvnRedeployOptionalTroops:chooseOne | 204 | 36756.47 | 180.1788 | 282.7481 | 342.1535 | 8.4118 | 0 | 11928 | 1638 | 0 | 0 | 0 | 0 |
| govern:chooseNStep:add | 115 | 27418.99 | 238.426 | 355.7285 | 5066.8554 | 6.687 | 0 | 3600 | 5625 | 0 | 0 | 0 | 0 |
| event | 245 | 24957.12 | 101.8658 | 115.608 | 5322.2415 | 18.9224 | 245 | 0 | 0 | 245 | 234 | 38 | 275 |
| govern:chooseNStep:confirm | 102 | 24147.52 | 236.7404 | 378.826 | 8492.2771 | 6.8824 | 0 | 2336 | 1059 | 0 | 0 | 0 | 0 |
| govern | 104 | 6314.79 | 60.7192 | 95.4461 | 661.8394 | 10.7115 | 97 | 0 | 7 | 97 | 40 | 0 | 97 |
| transport:chooseOne | 16 | 5879.8 | 367.4876 | 862.3886 | 862.3886 | 17.6875 | 0 | 1191 | 46 | 0 | 0 | 0 | 0 |
| govern:chooseOne | 117 | 4485.86 | 38.3407 | 63.5084 | 1192.4823 | 2 | 0 | 143 | 143 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:add | 26 | 4233.57 | 162.8298 | 77.031 | 4155.2129 | 3.1538 | 0 | 18 | 4 | 0 | 0 | 0 | 0 |
| rally | 170 | 3942.17 | 23.1892 | 53.5667 | 154.9882 | 15.8882 | 148 | 0 | 22 | 148 | 101 | 0 | 148 |
| coupArvnRedeployMandatory:chooseOne | 12 | 2660.75 | 221.729 | 318.8182 | 318.8182 | 8 | 0 | 1428 | 204 | 0 | 0 | 0 | 0 |
| train:chooseOne | 58 | 2211.92 | 38.1365 | 76.2169 | 208.6097 | 2.2759 | 0 | 166 | 198 | 0 | 0 | 0 | 0 |
| coupArvnRedeployOptionalTroops | 87 | 2133.33 | 24.521 | 28.4886 | 29.9166 | 17.2874 | 70 | 0 | 17 | 70 | 0 | 0 | 70 |
| coupArvnRedeployPolice | 84 | 1868.93 | 22.2492 | 25.4732 | 26.7375 | 11.7262 | 82 | 0 | 2 | 82 | 0 | 0 | 82 |
| assault:chooseOne | 10 | 1147.46 | 114.746 | 1035.5231 | 1035.5231 | 2 | 0 | 4 | 4 | 0 | 0 | 0 | 0 |
| event-decision:chooseNStep:add | 93 | 1029.3 | 11.0677 | 86.9224 | 305.7129 | 12.129 | 0 | 112 | 360 | 0 | 0 | 0 | 0 |
| train | 33 | 840.23 | 25.4614 | 40.2774 | 62.5293 | 7.8485 | 32 | 0 | 1 | 32 | 92 | 0 | 32 |
| coupRedeployPass | 80 | 560.6 | 7.0074 | 22.0967 | 23.3071 | 2.975 | 31 | 0 | 49 | 31 | 15 | 0 | 31 |
| transport | 8 | 508.42 | 63.5524 | 98.9843 | 98.9843 | 11.25 | 8 | 0 | 0 | 8 | 0 | 0 | 8 |
| coupPacifyUS | 76 | 462.15 | 6.0809 | 9.7508 | 11.3278 | 2.7763 | 76 | 0 | 0 | 76 | 0 | 0 | 76 |
| advise | 38 | 356.47 | 9.3807 | 16.8512 | 30.8332 | 11.4474 | 28 | 0 | 10 | 28 | 8 | 0 | 28 |
| coupAgitateVC | 60 | 312.43 | 5.2072 | 7.4106 | 7.8586 | 2.95 | 42 | 0 | 18 | 42 | 12 | 0 | 42 |
| infiltrate | 33 | 304.83 | 9.2372 | 13.3698 | 17.3643 | 41.5152 | 26 | 0 | 7 | 26 | 15 | 0 | 26 |
| coupPacifyARVN | 31 | 280.65 | 9.0533 | 14.4064 | 14.9401 | 3.9355 | 15 | 0 | 16 | 15 | 10 | 0 | 15 |
| march | 40 | 251.91 | 6.2976 | 10.9288 | 11.4134 | 9.125 | 30 | 0 | 10 | 30 | 66 | 0 | 30 |
| coupCommitmentPass | 80 | 238.25 | 2.9781 | 4.6516 | 5.7974 | 1.15 | 8 | 0 | 72 | 8 | 0 | 0 | 8 |
| chooseOne:chooseOne | 28 | 209.98 | 7.4993 | 100.007 | 105.8532 | 5.6786 | 0 | 7 | 2 | 0 | 0 | 0 | 0 |
| assault | 28 | 209.07 | 7.4667 | 9.9355 | 10.2756 | 4.8571 | 27 | 0 | 1 | 27 | 3 | 0 | 27 |
| coupPacifyPass | 40 | 165.36 | 4.1341 | 6.4501 | 12.424 | 1.125 | 36 | 0 | 4 | 36 | 0 | 0 | 36 |
| attack | 14 | 151.07 | 10.7907 | 29.0925 | 29.0925 | 34.9286 | 12 | 0 | 2 | 12 | 0 | 0 | 12 |
| ambushVc | 11 | 148.08 | 13.462 | 24.8465 | 24.8465 | 8.1818 | 10 | 0 | 1 | 10 | 0 | 0 | 10 |
| coupNvaRedeployTroops | 16 | 84.12 | 5.2576 | 7.8176 | 7.8176 | 3.875 | 10 | 0 | 6 | 10 | 0 | 0 | 10 |
| coupAgitatePass | 20 | 75.23 | 3.7614 | 4.48 | 8.7194 | 1.25 | 18 | 0 | 2 | 18 | 0 | 0 | 18 |
| coupResourcesResolve | 20 | 74.69 | 3.7346 | 5.434 | 5.4658 | 1 | 4 | 0 | 16 | 4 | 0 | 0 | 4 |
| coupVictoryCheck | 20 | 70.27 | 3.5136 | 5.2572 | 5.7622 | 1 | 20 | 0 | 0 | 20 | 4 | 0 | 20 |
| coupArvnRedeployMandatory | 2 | 51.84 | 25.9216 | 26.2 | 26.2 | 11.5 | 1 | 0 | 1 | 1 | 0 | 0 | 1 |
| coupCommitmentResolve | 8 | 33.07 | 4.1342 | 5.6639 | 5.6639 | 2 | 0 | 0 | 8 | 0 | 0 | 0 | 0 |
| ambushNva | 5 | 30.39 | 6.0783 | 9.8614 | 9.8614 | 15.2 | 5 | 0 | 0 | 5 | 0 | 0 | 5 |
| event-decision:chooseOne | 36 | 29.26 | 0.8128 | 0.6194 | 26.8304 | 3.9444 | 0 | 1 | 1 | 0 | 0 | 0 | 0 |
| rally:chooseNStep:add | 173 | 14.41 | 0.0833 | 0.1247 | 1.8427 | 20.422 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseNStep:confirm | 218 | 10.17 | 0.0467 | 0.0656 | 1.5134 | 14.8165 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| pass | 2 | 7.49 | 3.7454 | 5.3301 | 5.3301 | 2.5 | 2 | 0 | 0 | 2 | 0 | 0 | 2 |
| rally:chooseOne | 176 | 6.77 | 0.0385 | 0.0873 | 0.1999 | 1.3523 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| resolveHonoluluPacify | 3 | 5.96 | 1.987 | 2.6528 | 2.6528 | 1 | 3 | 0 | 0 | 3 | 0 | 0 | 3 |
| advise:chooseNStep:add | 38 | 4.39 | 0.1156 | 0.7421 | 0.7456 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:confirm | 90 | 3.9 | 0.0433 | 0.086 | 0.111 | 5.0778 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseOne | 76 | 3.56 | 0.0468 | 0.0857 | 0.2716 | 2.4474 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:add | 57 | 3.48 | 0.0611 | 0.102 | 0.1183 | 11.4912 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseNStep:confirm | 83 | 2.89 | 0.0348 | 0.0548 | 0.1729 | 6.253 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseOne | 56 | 2.07 | 0.0369 | 0.0782 | 0.1906 | 1.625 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:add | 33 | 2.05 | 0.062 | 0.0884 | 0.5918 | 3.6061 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:confirm | 38 | 1.8 | 0.0475 | 0.0769 | 0.078 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:confirm | 50 | 1.63 | 0.0326 | 0.079 | 0.1247 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupNvaRedeployTroops:chooseOne | 42 | 1.63 | 0.0389 | 0.0534 | 0.0785 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:confirm | 47 | 1.63 | 0.0346 | 0.07 | 0.0955 | 4.4255 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupCommitmentResolve:chooseNStep:confirm | 32 | 0.94 | 0.0295 | 0.044 | 0.0452 | 9.25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:add | 12 | 0.54 | 0.045 | 0.067 | 0.067 | 3.5833 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| chooseNStep:chooseNStep:confirm | 10 | 0.46 | 0.0456 | 0.0598 | 0.0598 | 22.5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:confirm | 12 | 0.35 | 0.029 | 0.0523 | 0.0523 | 4.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseOne | 11 | 0.31 | 0.0281 | 0.0411 | 0.0411 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseNStep:add | 3 | 0.15 | 0.0495 | 0.0543 | 0.0543 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseOne | 5 | 0.14 | 0.0272 | 0.0336 | 0.0336 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseNStep:confirm | 3 | 0.08 | 0.0274 | 0.0305 | 0.0305 | 3.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Top Hot Axes In Slow-Tier Seeds

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.

| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms |
|---:|---|---|---:|---:|---:|---:|---:|
| 1 | train:chooseNStep:add | continuedDeepening | 33 | 54119.72 | 1639.9916 | 3434.1938 | 3485.2397 |
| 2 | coupArvnRedeployPolice:chooseOne | continuedDeepening | 52 | 42038.5 | 808.4326 | 2360.4195 | 2643.6561 |
| 3 | train:chooseNStep:confirm | continuedDeepening | 35 | 40170.09 | 1147.7167 | 3531.8751 | 3534.8846 |
| 4 | coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | 72 | 12906.47 | 179.2565 | 286.6627 | 342.1535 |
| 5 | govern:chooseNStep:confirm | continuedDeepening | 25 | 12328.11 | 493.1244 | 298.271 | 8492.2771 |
| 6 | govern:chooseNStep:add | continuedDeepening | 35 | 11881.91 | 339.4833 | 423.5547 | 5066.8554 |
| 7 | event | singlePass | 95 | 8798.42 | 92.6149 | 180.066 | 3428.201 |
| 8 | transport:chooseOne | continuedDeepening | 10 | 2798.12 | 279.812 | 838.019 | 838.019 |
| 9 | coupArvnRedeployMandatory:chooseOne | continuedDeepening | 12 | 2660.75 | 221.729 | 318.8182 | 318.8182 |
| 10 | govern | singlePass | 32 | 2354.32 | 73.5724 | 132.6558 | 661.8394 |

## Hot-Path Buckets For Top Slow Axes

Captured only when `--profile-buckets` is enabled. Buckets are timing/count diagnostics inside `PolicyAgent.chooseDecision`; they are not correctness assertions.

### train:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 75316 | 12823.79 |
| zobrist:encodeDecisionStackFrame | 75706 | 7329.14 |
| tokenStateIndex:refreshCachedEntries | 84032 | 1136.13 |
| evalQuery:applyTokenFilter | 39473 | 147.11 |
| evalQuery:countMatchingTokens | 49547 | 85.99 |
| evalQuery:applyTokenFilterCacheHit | 77788 | 0 |
| evalQuery:applyTokenFilterCompiled | 38450 | 0 |
| evalQuery:countMatchingTokensCacheHit | 7842195 | 0 |
| evalQuery:countMatchingTokensCompiled | 49547 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 18571784 | 0 |
| moveToken:sameZoneNoop | 319 | 0 |
| tokenStateIndex:getCacheHit | 272536 | 0 |

### coupArvnRedeployPolice:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 1174541 | 6324.45 |
| evalQuery:countMatchingTokens | 1177315 | 1601.68 |
| zobrist:digestDecisionStackFrame | 3208 | 148.13 |
| zobrist:encodeDecisionStackFrame | 3264 | 144.62 |
| evalQuery:applyTokenFilter | 434 | 2.59 |
| evalQuery:applyTokenFilterCacheHit | 262336 | 0 |
| evalQuery:applyTokenFilterCompiled | 434 | 0 |
| evalQuery:countMatchingTokensCacheHit | 39603781 | 0 |
| evalQuery:countMatchingTokensCompiled | 1177315 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 122112957 | 0 |
| moveToken:sameZoneNoop | 2053 | 0 |
| tokenStateIndex:getCacheHit | 1176594 | 0 |

### train:chooseNStep:confirm | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 54182 | 9504.59 |
| zobrist:encodeDecisionStackFrame | 55108 | 5517.04 |
| tokenStateIndex:refreshCachedEntries | 43206 | 717.92 |
| evalQuery:applyTokenFilter | 16948 | 81.4 |
| evalQuery:countMatchingTokens | 21122 | 44.97 |
| evalQuery:applyTokenFilterCacheHit | 74008 | 0 |
| evalQuery:applyTokenFilterCompiled | 16156 | 0 |
| evalQuery:countMatchingTokensCacheHit | 5992956 | 0 |
| evalQuery:countMatchingTokensCompiled | 21122 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 14379679 | 0 |
| moveToken:sameZoneNoop | 301 | 0 |
| tokenStateIndex:getCacheHit | 175368 | 0 |

### coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 233560 | 1456.77 |
| evalQuery:countMatchingTokens | 218407 | 217.05 |
| zobrist:encodeDecisionStackFrame | 1112 | 41.36 |
| zobrist:digestDecisionStackFrame | 1058 | 36.84 |
| evalQuery:applyTokenFilter | 1513 | 4.08 |
| evalQuery:applyTokenFilterCacheHit | 106515 | 0 |
| evalQuery:applyTokenFilterCompiled | 1513 | 0 |
| evalQuery:countMatchingTokensCacheHit | 14220286 | 0 |
| evalQuery:countMatchingTokensCompiled | 218407 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 32991181 | 0 |
| moveToken:sameZoneNoop | 8 | 0 |
| tokenStateIndex:getCacheHit | 233568 | 0 |

### govern:chooseNStep:confirm | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 31003 | 587.01 |
| evalQuery:applyTokenFilter | 200968 | 346.24 |
| zobrist:encodeDecisionStackFrame | 1104 | 46.78 |
| zobrist:digestDecisionStackFrame | 678 | 34.84 |
| evalQuery:countMatchingTokens | 25207 | 34.78 |
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
| tokenStateIndex:refreshCachedEntries | 26725 | 430.2 |
| evalQuery:applyTokenFilter | 122852 | 229.37 |
| zobrist:digestDecisionStackFrame | 4378 | 203.92 |
| zobrist:encodeDecisionStackFrame | 4472 | 178.25 |
| evalQuery:countMatchingTokens | 23502 | 29.6 |
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
| tokenStateIndex:refreshCachedEntries | 66802 | 882.79 |
| evalQuery:applyTokenFilter | 104206 | 284.97 |
| zobrist:digestDecisionStackFrame | 870 | 166.99 |
| zobrist:encodeDecisionStackFrame | 870 | 112.17 |
| evalQuery:countMatchingTokens | 53330 | 59.45 |
| policyWasmRuntime:encodeBytecodeInput | 988 | 29.3 |
| tokenStateIndex:build | 18 | 0.73 |
| evalQuery:applyTokenFilterCacheHit | 18015 | 0 |
| evalQuery:applyTokenFilterCompiled | 102598 | 0 |
| evalQuery:countMatchingTokensCacheHit | 1520660 | 0 |
| evalQuery:countMatchingTokensCompiled | 34508 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 3108106 | 0 |

### transport:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 24787 | 277.44 |
| evalQuery:applyTokenFilter | 19583 | 109.18 |
| evalQuery:countMatchingTokens | 28119 | 22.41 |
| zobrist:digestDecisionStackFrame | 34 | 5.08 |
| zobrist:encodeDecisionStackFrame | 34 | 3.44 |
| evalQuery:applyTokenFilterCacheHit | 97360 | 0 |
| evalQuery:applyTokenFilterCompiled | 18758 | 0 |
| evalQuery:countMatchingTokensCacheHit | 1242158 | 0 |
| evalQuery:countMatchingTokensCompiled | 28119 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 2427045 | 0 |
| moveToken:sameZoneNoop | 25 | 0 |
| tokenStateIndex:getCacheHit | 148172 | 0 |

### coupArvnRedeployMandatory:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 61442 | 315.97 |
| evalQuery:countMatchingTokens | 75112 | 82.8 |
| zobrist:encodeDecisionStackFrame | 448 | 17.14 |
| zobrist:digestDecisionStackFrame | 412 | 13.93 |
| evalQuery:applyTokenFilter | 96 | 0.51 |
| evalQuery:applyTokenFilterCacheHit | 12032 | 0 |
| evalQuery:applyTokenFilterCompiled | 96 | 0 |
| evalQuery:countMatchingTokensCacheHit | 2251157 | 0 |
| evalQuery:countMatchingTokensCompiled | 75112 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 6633577 | 0 |
| tokenStateIndex:getCacheHit | 61442 | 0 |
| zobrist:decisionStackFrameEncodedChars | 1676869 | 0 |

### govern | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 4319 | 66.14 |
| evalQuery:applyTokenFilter | 16255 | 66.13 |
| zobrist:digestDecisionStackFrame | 454 | 53.66 |
| zobrist:encodeDecisionStackFrame | 454 | 38.97 |
| evalQuery:countMatchingTokens | 12073 | 15.78 |
| policyWasmRuntime:encodeBytecodeInput | 282 | 8.68 |
| evalQuery:applyTokenFilterCacheHit | 11829 | 0 |
| evalQuery:applyTokenFilterCompiled | 15656 | 0 |
| evalQuery:countMatchingTokensCacheHit | 658489 | 0 |
| evalQuery:countMatchingTokensCompiled | 3143 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1295657 | 0 |
| policyWasmRuntime:encodedInputCacheMiss | 282 | 0 |


## Fast-Tier vs Slow-Tier Delta

Fast tier: `1000`, `1006`, `1007`, `1010`, `1014`. Rows with ratio greater than `3.0` satisfy the Phase 0 hot-axis criterion.

| Microturn class | Slow decisions | Fast decisions | Slow mean ms | Fast mean ms | Slow:fast ratio | Verdict |
|---|---:|---:|---:|---:|---:|---|
| train:chooseNStep:confirm | 49 | 6 | 819.8355 | 0.088 | 9316.3125 | hot axis |
| train:chooseNStep:add | 33 | 6 | 1639.9916 | 360.3978 | 4.5505 | hot axis |
| pass | 1 | 1 | 5.3301 | 2.1607 | 2.4668 |  |
| govern:chooseNStep:confirm | 30 | 35 | 410.9523 | 204.8185 | 2.0064 |  |
| train | 17 | 3 | 27.803 | 14.1924 | 1.959 |  |
| coupArvnRedeployPolice:chooseOne | 52 | 50 | 808.4326 | 442.7441 | 1.826 |  |
| govern:chooseOne | 37 | 35 | 58.8595 | 32.5076 | 1.8106 |  |
| coupNvaRedeployTroops | 7 | 1 | 5.4008 | 3.2296 | 1.6723 |  |
| advise:chooseNStep:add | 8 | 15 | 0.1719 | 0.1054 | 1.6309 |  |
| advise:chooseOne | 16 | 30 | 0.0663 | 0.0412 | 1.6092 |  |
| govern:chooseNStep:add | 35 | 35 | 339.4833 | 216.4251 | 1.5686 |  |
| ambushVc:chooseOne | 5 | 4 | 0.0337 | 0.0247 | 1.3644 |  |
| coupCommitmentResolve | 2 | 3 | 4.7078 | 3.6733 | 1.2816 |  |
| govern | 32 | 35 | 73.5724 | 59.4893 | 1.2367 |  |
| advise | 8 | 15 | 9.9236 | 8.0365 | 1.2348 |  |
| coupPacifyARVN | 8 | 8 | 10.8202 | 8.9659 | 1.2068 |  |
| ambushVc:chooseNStep:confirm | 5 | 3 | 0.0334 | 0.0277 | 1.2058 |  |
| march:chooseNStep:add | 21 | 22 | 0.0677 | 0.0579 | 1.1693 |  |
| assault | 8 | 9 | 7.6222 | 6.5287 | 1.1675 |  |
| transport | 5 | 3 | 66.9341 | 57.9163 | 1.1557 |  |
| coupResourcesResolve | 7 | 6 | 4.0207 | 3.5205 | 1.1421 |  |
| coupVictoryCheck | 7 | 6 | 3.5569 | 3.235 | 1.0995 |  |
| advise:chooseNStep:confirm | 8 | 15 | 0.0511 | 0.047 | 1.0872 |  |
| coupRedeployPass | 28 | 24 | 7.0574 | 6.5914 | 1.0707 |  |
| coupCommitmentResolve:chooseNStep:confirm | 8 | 12 | 0.0314 | 0.0299 | 1.0502 |  |
| infiltrate:chooseOne | 16 | 14 | 0.0441 | 0.0422 | 1.045 |  |
| march | 15 | 13 | 5.9675 | 5.7998 | 1.0289 |  |
| coupArvnRedeployPolice | 27 | 32 | 22.2799 | 21.896 | 1.0175 |  |
| coupArvnRedeployOptionalTroops | 31 | 25 | 24.3355 | 23.9524 | 1.016 |  |
| coupPacifyUS | 25 | 26 | 6.0759 | 6.0113 | 1.0107 |  |
| ambushVc:chooseNStep:add | 5 | 3 | 0.0463 | 0.0459 | 1.0087 |  |
| attack | 6 | 8 | 10.8317 | 10.76 | 1.0067 |  |
| coupArvnRedeployOptionalTroops:chooseOne | 72 | 60 | 179.2565 | 179.9623 | 0.9961 |  |
| coupCommitmentPass | 28 | 24 | 2.9834 | 3.0368 | 0.9824 |  |
| event | 95 | 78 | 92.6149 | 95.2271 | 0.9726 |  |
| event-decision:chooseNStep:confirm | 43 | 26 | 0.035 | 0.036 | 0.9722 |  |
| chooseNStep:chooseNStep:confirm | 4 | 3 | 0.0444 | 0.0467 | 0.9507 |  |
| march:chooseNStep:confirm | 34 | 29 | 0.0463 | 0.0501 | 0.9242 |  |
| infiltrate | 10 | 8 | 8.7382 | 9.5194 | 0.9179 |  |
| coupPacifyPass | 14 | 12 | 3.9243 | 4.5085 | 0.8704 |  |
| coupAgitateVC | 19 | 25 | 4.5789 | 5.3897 | 0.8496 |  |
| infiltrate:chooseNStep:confirm | 15 | 12 | 0.0364 | 0.0436 | 0.8349 |  |
| rally:chooseOne | 64 | 57 | 0.036 | 0.0436 | 0.8257 |  |
| rally | 62 | 54 | 19.6467 | 24.7937 | 0.7924 |  |
| chooseOne:chooseOne | 11 | 8 | 9.779 | 12.5509 | 0.7791 |  |
| rally:chooseNStep:add | 63 | 56 | 0.065 | 0.0849 | 0.7656 |  |
| coupAgitatePass | 7 | 6 | 3.3618 | 4.6106 | 0.7291 |  |
| ambushVc | 5 | 4 | 10.3943 | 14.2891 | 0.7274 |  |
| assault:chooseNStep:confirm | 16 | 13 | 0.0294 | 0.0412 | 0.7136 |  |
| rally:chooseNStep:confirm | 73 | 73 | 0.036 | 0.0505 | 0.7129 |  |
| train:chooseOne | 29 | 6 | 32.7687 | 47.5398 | 0.6893 |  |
| coupNvaRedeployTroops:chooseOne | 19 | 2 | 0.0355 | 0.063 | 0.5635 |  |
| transport:chooseOne | 10 | 6 | 279.812 | 513.6137 | 0.5448 |  |
| infiltrate:chooseNStep:add | 10 | 8 | 0.0458 | 0.1179 | 0.3885 |  |
| event-decision:chooseOne | 13 | 6 | 0.0495 | 0.1708 | 0.2898 |  |
| event-decision:chooseNStep:add | 43 | 29 | 0.0529 | 28.1988 | 0.0019 |  |
| assault:chooseNStep:add | 8 | 7 | 0.0604 | 593.6504 | 0.0001 |  |
| assault:chooseOne | 2 | 5 | 0.0333 | 223.1568 | 0.0001 |  |

## Notes

- `elapsedMs` is measured around the per-decision `PolicyAgent.chooseDecision` call. It excludes simulator apply/delta work and report rendering.
- Child processes enforce the per-seed timeout. Each child loads the built engine and production FITL GameSpecDoc, using the repo GameDef cache when available.
- The script does not modify engine source or production profile data.
