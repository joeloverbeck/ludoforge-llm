# FITL ARVN 15-Seed Per-Microturn-Class Decomposition

**Date**: 2026-05-16-phase-4d-zone-occurrence-reuse-seed1005
**Status**: Spec 173 measurement witness.
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005 --timeout-ms 400000 --date 2026-05-16-phase-4d-zone-occurrence-reuse-seed1005 --profile-buckets`
**CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4d-zone-occurrence-reuse-seed1005.csv`

## Summary

- Seeds completed: 1/1
- Per-decision rows: 790
- Hot class with slow:fast ratio >3x: no
- Per-seed timeout: 400000 ms
- Hot-path buckets: enabled
- WASM production preview-drive route count: 12
- WASM production preview-drive unsupported count: 519
- WASM production preview-drive batch count: 199

## Per-Seed Wall Time

| Seed | Status | Stop Reason | Wall ms | Decisions | ms/decision | Error |
|---:|---|---|---:|---:|---:|---|
| 1005 | OK | terminal | 101758.6 | 790 | 128.8084 |  |

## Per-Microturn-Class Rollup

| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | WASM preview-drive routes | WASM preview-drive unsupported | WASM preview-drive unsupported reasons | WASM preview-drive batches | Token index builds | Static rebuilds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|
| coupArvnRedeployPolice:chooseOne | 66 | 40590.39 | 615.0059 | 1990.5551 | 2503.0747 | 26.7121 | 0 | 60935 | 2466 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| train:chooseNStep:add | 11 | 17193.66 | 1563.0596 | 3125.3029 | 3125.3029 | 14.4545 | 0 | 6998 | 9498 | 0 | 0 | 2 | 148 | agent-guided-completion/production-deep-choosenstep-continuation.pickInnerDecision/deep preview-drive selected a non-chooseNStep continuation decision:143; unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:5 | 0 | 388 | 0 |
| train:chooseNStep:confirm | 15 | 11476.3 | 765.0866 | 2907.6907 | 2907.6907 | 8.7333 | 0 | 4429 | 5965 | 0 | 0 | 8 | 97 | agent-guided-completion/production-deep-choosenstep-continuation.pickInnerDecision/deep preview-drive selected a non-chooseNStep continuation decision:94; unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:3 | 0 | 386 | 0 |
| govern:chooseNStep:confirm | 6 | 7756.8 | 1292.8002 | 6707.8476 | 6707.8476 | 7.5 | 0 | 159 | 72 | 0 | 0 | 0 | 33 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:33 | 0 | 0 | 0 |
| event | 48 | 4553.19 | 94.858 | 495.3332 | 1804.8099 | 28.6667 | 48 | 0 | 0 | 48 | 22 | 0 | 50 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:50 | 0 | 0 | 50 |
| govern:chooseNStep:add | 6 | 4080.97 | 680.1617 | 2912.1526 | 2912.1526 | 6.5 | 0 | 228 | 363 | 0 | 0 | 0 | 39 | agent-guided-completion/production-deep-choosenstep-continuation.pickInnerDecision/deep preview-drive selected a non-chooseNStep continuation decision:39 | 0 | 0 | 0 |
| coupArvnRedeployOptionalTroops:chooseOne | 39 | 2097.91 | 53.7926 | 145.9038 | 158.715 | 8 | 0 | 2681 | 383 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| govern | 9 | 1467.88 | 163.098 | 620.7101 | 620.7101 | 10.5556 | 9 | 0 | 0 | 9 | 8 | 0 | 12 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:12 | 3 | 0 | 9 |
| coupArvnRedeployMandatory:chooseOne | 10 | 732.24 | 73.2242 | 127.9212 | 127.9212 | 8 | 0 | 1078 | 154 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally | 18 | 556.82 | 30.9345 | 115.9145 | 115.9145 | 38.9444 | 18 | 0 | 0 | 18 | 4 | 0 | 36 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:36 | 0 | 0 | 18 |
| assault:chooseNStep:add | 6 | 467.12 | 77.853 | 135.7209 | 135.7209 | 3 | 0 | 66 | 84 | 0 | 0 | 2 | 13 | agent-guided-completion/production-deep-choosenstep-continuation.pickInnerDecision/deep preview-drive selected a non-chooseNStep continuation decision:13 | 0 | 82 | 0 |
| train | 5 | 409.22 | 81.8431 | 180.9608 | 180.9608 | 9.4 | 5 | 0 | 0 | 5 | 0 | 0 | 10 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:10 | 0 | 0 | 5 |
| transport:chooseOne | 6 | 381.16 | 63.5263 | 89.0816 | 89.0816 | 12.3333 | 0 | 239 | 14 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| assault:chooseNStep:confirm | 7 | 299.18 | 42.7399 | 92.5165 | 92.5165 | 3.4286 | 0 | 43 | 38 | 0 | 0 | 0 | 10 | agent-guided-completion/production-deep-choosenstep-continuation.pickInnerDecision/deep preview-drive selected a non-chooseNStep continuation decision:9; unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:1 | 0 | 36 | 0 |
| transport | 3 | 175.92 | 58.6394 | 68.4327 | 68.4327 | 10.6667 | 3 | 0 | 0 | 3 | 0 | 0 | 6 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:6 | 0 | 0 | 3 |
| train:chooseOne | 9 | 70.85 | 7.8721 | 14.9112 | 14.9112 | 2.2222 | 0 | 30 | 34 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| coupArvnRedeployPolice | 26 | 53.77 | 2.0682 | 3.7339 | 4.2235 | 6.1923 | 26 | 0 | 0 | 26 | 0 | 0 | 21 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:21 | 26 | 0 | 26 |
| attack | 12 | 46.21 | 3.851 | 9.5331 | 9.5331 | 54.5 | 9 | 0 | 3 | 9 | 0 | 0 | 0 |  | 12 | 0 | 9 |
| coupRedeployPass | 20 | 37.47 | 1.8735 | 2.3485 | 2.425 | 1 | 13 | 0 | 7 | 13 | 0 | 0 | 0 |  | 20 | 0 | 13 |
| ambushVc | 11 | 36.19 | 3.29 | 4.5926 | 4.5926 | 51 | 10 | 0 | 1 | 10 | 0 | 0 | 0 |  | 11 | 0 | 10 |
| assault | 16 | 34.98 | 2.1865 | 3.9978 | 3.9978 | 9 | 14 | 0 | 2 | 14 | 0 | 0 | 11 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:11 | 16 | 0 | 14 |
| coupArvnRedeployOptionalTroops | 16 | 34.88 | 2.18 | 3.5254 | 3.5254 | 9.6875 | 12 | 0 | 4 | 12 | 0 | 0 | 12 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:12 | 16 | 0 | 12 |
| coupNvaRedeployTroops | 18 | 33.54 | 1.8636 | 4.3873 | 4.3873 | 3.8333 | 14 | 0 | 4 | 14 | 0 | 0 | 14 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:14 | 18 | 0 | 14 |
| ambushNva | 2 | 32.83 | 16.414 | 26.544 | 26.544 | 103.5 | 1 | 0 | 1 | 1 | 0 | 0 | 1 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:1 | 1 | 0 | 1 |
| govern:chooseOne | 9 | 31.41 | 3.4903 | 4.8853 | 4.8853 | 2 | 0 | 9 | 9 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| coupCommitmentPass | 20 | 29.53 | 1.4764 | 2.556 | 2.7067 | 1.25 | 0 | 0 | 20 | 0 | 0 | 0 | 0 |  | 20 | 0 | 0 |
| infiltrate | 4 | 26.59 | 6.6483 | 10.6842 | 10.6842 | 94.25 | 2 | 0 | 2 | 2 | 0 | 0 | 0 |  | 4 | 0 | 2 |
| coupPacifyPass | 10 | 21.62 | 2.162 | 4.5991 | 4.5991 | 1.3 | 7 | 0 | 3 | 7 | 0 | 0 | 0 |  | 10 | 0 | 7 |
| pass | 6 | 19.9 | 3.3167 | 5.0011 | 5.0011 | 3.6667 | 6 | 0 | 0 | 6 | 0 | 0 | 0 |  | 6 | 0 | 6 |
| coupPacifyARVN | 8 | 18.02 | 2.2522 | 2.9977 | 2.9977 | 4.375 | 6 | 0 | 2 | 6 | 0 | 0 | 5 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:5 | 8 | 0 | 6 |
| march | 5 | 16 | 3.1991 | 5.0733 | 5.0733 | 33.4 | 3 | 0 | 2 | 3 | 0 | 0 | 0 |  | 5 | 0 | 3 |
| coupVictoryCheck | 5 | 14.7 | 2.9393 | 3.681 | 3.681 | 1 | 5 | 0 | 0 | 5 | 0 | 0 | 0 |  | 5 | 0 | 5 |
| advise | 5 | 13.98 | 2.795 | 3.6542 | 3.6542 | 9.6 | 3 | 0 | 2 | 3 | 0 | 0 | 0 |  | 5 | 0 | 3 |
| coupResourcesResolve | 5 | 11.44 | 2.2889 | 3.3643 | 3.3643 | 1 | 0 | 0 | 5 | 0 | 0 | 0 | 0 |  | 5 | 0 | 0 |
| coupAgitatePass | 5 | 8.23 | 1.6456 | 2.2442 | 2.2442 | 6.6 | 0 | 0 | 5 | 0 | 0 | 0 | 0 |  | 5 | 0 | 0 |
| chooseOne:chooseOne | 3 | 7.33 | 2.4422 | 6.6806 | 6.6806 | 6.3333 | 0 | 3 | 1 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| coupArvnRedeployMandatory | 2 | 5.11 | 2.5553 | 3.15 | 3.15 | 10.5 | 1 | 0 | 1 | 1 | 0 | 0 | 1 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:1 | 2 | 0 | 1 |
| coupNvaRedeployTroops:chooseOne | 68 | 2.55 | 0.0375 | 0.0541 | 0.0649 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| airStrike | 1 | 2.47 | 2.4676 | 2.4676 | 2.4676 | 2 | 1 | 0 | 0 | 1 | 0 | 0 | 0 |  | 1 | 0 | 1 |
| event-decision:chooseNStep:add | 39 | 1.48 | 0.0379 | 0.0685 | 0.1164 | 16.1538 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally:chooseOne | 18 | 1.41 | 0.0785 | 0.9399 | 0.9399 | 1.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally:chooseNStep:add | 18 | 0.98 | 0.0543 | 0.0914 | 0.0914 | 25.6111 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally:chooseNStep:confirm | 29 | 0.91 | 0.0314 | 0.0541 | 0.065 | 22.4828 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| event-decision:chooseNStep:confirm | 28 | 0.88 | 0.0313 | 0.0476 | 0.0714 | 6.9286 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| event-decision:chooseOne | 22 | 0.8 | 0.0364 | 0.0535 | 0.0647 | 3.5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushVc:chooseNStep:add | 12 | 0.49 | 0.0412 | 0.0484 | 0.0484 | 3.6667 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| advise:chooseNStep:add | 5 | 0.48 | 0.0951 | 0.2604 | 0.2604 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| march:chooseNStep:confirm | 13 | 0.39 | 0.0301 | 0.0388 | 0.0388 | 4.6923 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| march:chooseNStep:add | 5 | 0.36 | 0.071 | 0.077 | 0.077 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| advise:chooseOne | 10 | 0.35 | 0.0353 | 0.0506 | 0.0506 | 2.4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushVc:chooseNStep:confirm | 12 | 0.31 | 0.0261 | 0.044 | 0.044 | 4.5833 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushVc:chooseOne | 11 | 0.24 | 0.0215 | 0.0294 | 0.0294 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate:chooseOne | 6 | 0.21 | 0.0357 | 0.0508 | 0.0508 | 1.5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate:chooseNStep:confirm | 6 | 0.2 | 0.0325 | 0.0454 | 0.0454 | 6.8333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| advise:chooseNStep:confirm | 5 | 0.19 | 0.0385 | 0.0588 | 0.0588 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate:chooseNStep:add | 4 | 0.18 | 0.0451 | 0.0474 | 0.0474 | 7.25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushNva:chooseOne | 2 | 0.07 | 0.034 | 0.0356 | 0.0356 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| chooseNStep:chooseNStep:confirm | 2 | 0.07 | 0.0334 | 0.0338 | 0.0338 | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| airStrike:chooseOne | 1 | 0.05 | 0.0456 | 0.0456 | 0.0456 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| airStrike:chooseNStep:confirm | 1 | 0.04 | 0.0395 | 0.0395 | 0.0395 | 9 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |

## Top Hot Axes In Slow-Tier Seeds

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.

| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms |
|---:|---|---|---:|---:|---:|---:|---:|
| 1 | coupArvnRedeployPolice:chooseOne | continuedDeepening | 66 | 40590.39 | 615.0059 | 1990.5551 | 2503.0747 |
| 2 | train:chooseNStep:add | continuedDeepening | 11 | 17193.66 | 1563.0596 | 3125.3029 | 3125.3029 |
| 3 | train:chooseNStep:confirm | continuedDeepening | 12 | 11476.01 | 956.334 | 2907.6907 | 2907.6907 |
| 4 | govern:chooseNStep:confirm | continuedDeepening | 6 | 7756.8 | 1292.8002 | 6707.8476 | 6707.8476 |
| 5 | event | singlePass | 48 | 4553.19 | 94.858 | 495.3332 | 1804.8099 |
| 6 | govern:chooseNStep:add | continuedDeepening | 6 | 4080.97 | 680.1617 | 2912.1526 | 2912.1526 |
| 7 | coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | 39 | 2097.91 | 53.7926 | 145.9038 | 158.715 |
| 8 | govern | singlePass | 6 | 1456.17 | 242.6942 | 620.7101 | 620.7101 |
| 9 | coupArvnRedeployMandatory:chooseOne | continuedDeepening | 10 | 732.24 | 73.2242 | 127.9212 | 127.9212 |
| 10 | rally | singlePass | 18 | 556.82 | 30.9345 | 115.9145 | 115.9145 |

## Hot-Path Buckets For Top Slow Axes

Captured only when `--profile-buckets` is enabled. Buckets are timing/count diagnostics inside `PolicyAgent.chooseDecision`; they are not correctness assertions.

### coupArvnRedeployPolice:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 1633342 | 6551.81 |
| evalQuery:countMatchingTokens | 1738266 | 2651.23 |
| zobrist:digestDecisionStackFrame | 1052 | 55.7 |
| zobrist:encodeDecisionStackFrame | 1052 | 50.18 |
| evalQuery:applyTokenFilterCacheHit | 125750 | 0 |
| evalQuery:countMatchingTokensCacheHit | 41188829 | 0 |
| evalQuery:countMatchingTokensCompiled | 1738266 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 125757475 | 0 |
| tokenStateIndex:getCacheHit | 1633342 | 0 |
| zobrist:decisionStackFrameEncodedChars | 6708311 | 0 |
| zobrist:decisionStackFrameRunLocalCacheMiss | 1052 | 0 |

### train:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 20128 | 3466.53 |
| zobrist:encodeDecisionStackFrame | 21059 | 1994.94 |
| tokenStateIndex:refreshCachedEntries | 19885 | 341.42 |
| evalQuery:applyTokenFilter | 8906 | 31.02 |
| evalQuery:countMatchingTokens | 11727 | 21.74 |
| tokenStateIndex:build | 388 | 13.7 |
| evalQuery:applyTokenFilterCacheHit | 20424 | 0 |
| evalQuery:applyTokenFilterCompiled | 8906 | 0 |
| evalQuery:countMatchingTokensCacheHit | 2010742 | 0 |
| evalQuery:countMatchingTokensCompiled | 11727 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 5421379 | 0 |
| tokenStateIndex:getCacheHit | 29600 | 0 |

### train:chooseNStep:confirm | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 12646 | 2272.68 |
| zobrist:encodeDecisionStackFrame | 13628 | 1355.55 |
| tokenStateIndex:refreshCachedEntries | 14324 | 201.66 |
| evalQuery:applyTokenFilter | 4528 | 12.54 |
| evalQuery:countMatchingTokens | 6232 | 12.17 |
| tokenStateIndex:build | 386 | 11.2 |
| evalQuery:applyTokenFilterCacheHit | 20714 | 0 |
| evalQuery:applyTokenFilterCompiled | 4528 | 0 |
| evalQuery:countMatchingTokensCacheHit | 1690423 | 0 |
| evalQuery:countMatchingTokensCompiled | 6232 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 4573840 | 0 |
| tokenStateIndex:getCacheHit | 20141 | 0 |

### govern:chooseNStep:confirm | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 20945 | 320.4 |
| evalQuery:applyTokenFilter | 170131 | 211.89 |
| zobrist:encodeDecisionStackFrame | 264 | 10.92 |
| zobrist:digestDecisionStackFrame | 162 | 8.39 |
| evalQuery:countMatchingTokens | 4146 | 4.18 |
| evalQuery:applyTokenFilterCacheHit | 10017 | 0 |
| evalQuery:applyTokenFilterCompiled | 170131 | 0 |
| evalQuery:countMatchingTokensCacheHit | 511539 | 0 |
| evalQuery:countMatchingTokensCompiled | 4146 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1094788 | 0 |
| tokenStateIndex:getCacheHit | 67568 | 0 |
| zobrist:decisionStackFrameEncodedChars | 1026030 | 0 |

### event | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| evalQuery:applyTokenFilter | 38842 | 197.52 |
| tokenStateIndex:refreshCachedEntries | 8005 | 136.59 |
| zobrist:digestDecisionStackFrame | 454 | 78.2 |
| evalQuery:countMatchingTokens | 76561 | 67.55 |
| zobrist:encodeDecisionStackFrame | 454 | 48.57 |
| policyWasmRuntime:encodeBytecodeInput | 512 | 12.42 |
| evalQuery:applyTokenFilterCacheHit | 4771 | 0 |
| evalQuery:applyTokenFilterCompiled | 18774 | 0 |
| evalQuery:countMatchingTokensCacheHit | 696383 | 0 |
| evalQuery:countMatchingTokensCompiled | 3176 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1550195 | 0 |
| policyWasmRuntime:encodedInputCacheMiss | 512 | 0 |

### govern:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 8712 | 137.46 |
| evalQuery:applyTokenFilter | 71016 | 88.52 |
| zobrist:encodeDecisionStackFrame | 987 | 38.54 |
| zobrist:digestDecisionStackFrame | 792 | 36.44 |
| evalQuery:countMatchingTokens | 2564 | 2.73 |
| evalQuery:applyTokenFilterCacheHit | 4281 | 0 |
| evalQuery:applyTokenFilterCompiled | 71016 | 0 |
| evalQuery:countMatchingTokensCacheHit | 289927 | 0 |
| evalQuery:countMatchingTokensCompiled | 2564 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 643772 | 0 |
| tokenStateIndex:getCacheHit | 28547 | 0 |
| zobrist:decisionStackFrameEncodedChars | 4446700 | 0 |

### coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 55920 | 285.68 |
| evalQuery:countMatchingTokens | 74344 | 82.72 |
| zobrist:encodeDecisionStackFrame | 96 | 3.79 |
| zobrist:digestDecisionStackFrame | 96 | 3.62 |
| evalQuery:applyTokenFilterCacheHit | 6032 | 0 |
| evalQuery:countMatchingTokensCacheHit | 2537060 | 0 |
| evalQuery:countMatchingTokensCompiled | 74344 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 5932122 | 0 |
| tokenStateIndex:getCacheHit | 55920 | 0 |
| zobrist:decisionStackFrameEncodedChars | 432036 | 0 |
| zobrist:decisionStackFrameRunLocalCacheMiss | 96 | 0 |

### govern | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| evalQuery:applyTokenFilter | 20816 | 46.83 |
| tokenStateIndex:refreshCachedEntries | 2443 | 38.62 |
| zobrist:digestDecisionStackFrame | 158 | 17.24 |
| zobrist:encodeDecisionStackFrame | 158 | 12.64 |
| evalQuery:countMatchingTokens | 4354 | 5.38 |
| policyWasmRuntime:encodeBytecodeInput | 48 | 1.29 |
| evalQuery:applyTokenFilterCacheHit | 4771 | 0 |
| evalQuery:applyTokenFilterCompiled | 15193 | 0 |
| evalQuery:countMatchingTokensCacheHit | 112448 | 0 |
| evalQuery:countMatchingTokensCompiled | 688 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 236416 | 0 |
| policyWasmRuntime:encodedInputCacheMiss | 48 | 0 |

### coupArvnRedeployMandatory:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 22764 | 100 |
| evalQuery:countMatchingTokens | 32131 | 29.84 |
| zobrist:encodeDecisionStackFrame | 32 | 1.27 |
| zobrist:digestDecisionStackFrame | 32 | 1.12 |
| evalQuery:applyTokenFilterCacheHit | 2432 | 0 |
| evalQuery:countMatchingTokensCacheHit | 728298 | 0 |
| evalQuery:countMatchingTokensCompiled | 32131 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1864477 | 0 |
| tokenStateIndex:getCacheHit | 22764 | 0 |
| zobrist:decisionStackFrameEncodedChars | 137372 | 0 |
| zobrist:decisionStackFrameRunLocalCacheMiss | 32 | 0 |

### rally | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 1668 | 26.41 |
| evalQuery:applyTokenFilter | 1385 | 16.53 |
| zobrist:encodeDecisionStackFrame | 100 | 7.78 |
| zobrist:digestDecisionStackFrame | 100 | 7.28 |
| evalQuery:countMatchingTokens | 8001 | 5.11 |
| policyWasmRuntime:encodeBytecodeInput | 72 | 2.74 |
| evalQuery:applyTokenFilterCacheHit | 1519 | 0 |
| evalQuery:applyTokenFilterCompiled | 924 | 0 |
| evalQuery:countMatchingTokensCacheHit | 221528 | 0 |
| evalQuery:countMatchingTokensCompiled | 2102 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 539164 | 0 |
| policyWasmRuntime:encodedInputCacheMiss | 72 | 0 |


## WASM Preview-Drive Unsupported Reasons

| Microturn class | Unsupported class | Unsupported owner | Reason | Count | Class unsupported total | Class route total |
|---|---|---|---|---:|---:|---:|
| train:chooseNStep:add | agent-guided-completion | production-deep-choosenstep-continuation.pickInnerDecision | deep preview-drive selected a non-chooseNStep continuation decision | 143 | 148 | 2 |
| train:chooseNStep:confirm | agent-guided-completion | production-deep-choosenstep-continuation.pickInnerDecision | deep preview-drive selected a non-chooseNStep continuation decision | 94 | 97 | 8 |
| event | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 50 | 50 | 0 |
| govern:chooseNStep:add | agent-guided-completion | production-deep-choosenstep-continuation.pickInnerDecision | deep preview-drive selected a non-chooseNStep continuation decision | 39 | 39 | 0 |
| rally | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 36 | 36 | 0 |
| govern:chooseNStep:confirm | unknown | production-deep-choosenstep-continuation.projectedState | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 33 | 33 | 0 |
| coupArvnRedeployPolice | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 21 | 21 | 0 |
| coupNvaRedeployTroops | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 14 | 14 | 0 |
| assault:chooseNStep:add | agent-guided-completion | production-deep-choosenstep-continuation.pickInnerDecision | deep preview-drive selected a non-chooseNStep continuation decision | 13 | 13 | 2 |
| coupArvnRedeployOptionalTroops | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 12 | 12 | 0 |
| govern | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 12 | 12 | 0 |
| assault | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 11 | 11 | 0 |
| train | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 10 | 10 | 0 |
| assault:chooseNStep:confirm | agent-guided-completion | production-deep-choosenstep-continuation.pickInnerDecision | deep preview-drive selected a non-chooseNStep continuation decision | 9 | 10 | 0 |
| transport | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 6 | 6 | 0 |
| coupPacifyARVN | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 5 | 5 | 0 |
| train:chooseNStep:add | unknown | production-deep-choosenstep-continuation.projectedState | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 5 | 148 | 2 |
| train:chooseNStep:confirm | unknown | production-deep-choosenstep-continuation.projectedState | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 3 | 97 | 8 |
| ambushNva | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 1 | 1 | 0 |
| assault:chooseNStep:confirm | unknown | production-deep-choosenstep-continuation.projectedState | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 1 | 10 | 0 |
| coupArvnRedeployMandatory | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 1 | 1 | 0 |

## Fast-Tier vs Slow-Tier Delta

Fast tier: `1000`, `1006`, `1007`, `1010`, `1014`. Rows with ratio greater than `3.0` satisfy the Phase 0 hot-axis criterion.

| Microturn class | Slow decisions | Fast decisions | Slow mean ms | Fast mean ms | Slow:fast ratio | Verdict |
|---|---:|---:|---:|---:|---:|---|

## Notes

- `elapsedMs` is measured around the per-decision `PolicyAgent.chooseDecision` call. It excludes simulator apply/delta work and report rendering.
- Child processes enforce the per-seed timeout. Each child loads the built engine and production FITL GameSpecDoc, using the repo GameDef cache when available.
- The script does not modify engine source or production profile data.
