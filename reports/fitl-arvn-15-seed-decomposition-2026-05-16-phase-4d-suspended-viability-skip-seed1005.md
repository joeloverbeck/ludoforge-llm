# FITL ARVN 15-Seed Per-Microturn-Class Decomposition

**Date**: 2026-05-16-phase-4d-suspended-viability-skip-seed1005
**Status**: Spec 173 measurement witness.
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005 --timeout-ms 400000 --date 2026-05-16-phase-4d-suspended-viability-skip-seed1005 --profile-buckets`
**CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4d-suspended-viability-skip-seed1005.csv`

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
| 1005 | OK | terminal | 66089.91 | 790 | 83.6581 |  |

## Per-Microturn-Class Rollup

| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | WASM preview-drive routes | WASM preview-drive unsupported | WASM preview-drive unsupported reasons | WASM preview-drive batches | Token index builds | Static rebuilds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|
| train:chooseNStep:add | 11 | 16128.61 | 1466.2373 | 3175.2443 | 3175.2443 | 14.4545 | 0 | 6998 | 9498 | 0 | 0 | 2 | 148 | agent-guided-completion/production-deep-choosenstep-continuation.pickInnerDecision/deep preview-drive selected a non-chooseNStep continuation decision:143; unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:5 | 0 | 28 | 0 |
| train:chooseNStep:confirm | 15 | 10714.25 | 714.2835 | 2753.2945 | 2753.2945 | 8.7333 | 0 | 4429 | 5965 | 0 | 0 | 8 | 97 | agent-guided-completion/production-deep-choosenstep-continuation.pickInnerDecision/deep preview-drive selected a non-chooseNStep continuation decision:94; unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:3 | 0 | 82 | 0 |
| coupArvnRedeployPolice:chooseOne | 66 | 8828.85 | 133.7704 | 287.5755 | 298.9031 | 26.7121 | 0 | 60935 | 2466 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| govern:chooseNStep:confirm | 6 | 8224.51 | 1370.7514 | 7096.4149 | 7096.4149 | 7.5 | 0 | 159 | 72 | 0 | 0 | 0 | 33 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:33 | 0 | 0 | 0 |
| event | 48 | 4397.79 | 91.6207 | 523.6068 | 1886.709 | 28.6667 | 48 | 0 | 0 | 48 | 22 | 0 | 50 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:50 | 0 | 0 | 50 |
| govern:chooseNStep:add | 6 | 3979.17 | 663.1954 | 2979.6923 | 2979.6923 | 6.5 | 0 | 228 | 363 | 0 | 0 | 0 | 39 | agent-guided-completion/production-deep-choosenstep-continuation.pickInnerDecision/deep preview-drive selected a non-chooseNStep continuation decision:39 | 0 | 0 | 0 |
| govern | 9 | 1487.97 | 165.33 | 665.5526 | 665.5526 | 10.5556 | 9 | 0 | 0 | 9 | 8 | 0 | 12 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:12 | 3 | 0 | 9 |
| coupArvnRedeployOptionalTroops:chooseOne | 39 | 906.94 | 23.2548 | 41.3756 | 43.021 | 8 | 0 | 2681 | 383 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally | 18 | 702.61 | 39.0341 | 256.6553 | 256.6553 | 38.9444 | 18 | 0 | 0 | 18 | 4 | 0 | 36 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:36 | 0 | 0 | 18 |
| assault:chooseNStep:add | 6 | 437.8 | 72.9661 | 128.8627 | 128.8627 | 3 | 0 | 66 | 84 | 0 | 0 | 2 | 13 | agent-guided-completion/production-deep-choosenstep-continuation.pickInnerDecision/deep preview-drive selected a non-chooseNStep continuation decision:13 | 0 | 30 | 0 |
| train | 5 | 347.18 | 69.4365 | 178.629 | 178.629 | 9.4 | 5 | 0 | 0 | 5 | 0 | 0 | 10 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:10 | 0 | 0 | 5 |
| assault:chooseNStep:confirm | 7 | 286.5 | 40.9287 | 82.5742 | 82.5742 | 3.4286 | 0 | 43 | 38 | 0 | 0 | 0 | 10 | agent-guided-completion/production-deep-choosenstep-continuation.pickInnerDecision/deep preview-drive selected a non-chooseNStep continuation decision:9; unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:1 | 0 | 0 | 0 |
| coupArvnRedeployMandatory:chooseOne | 10 | 264.86 | 26.4864 | 37.6557 | 37.6557 | 8 | 0 | 1078 | 154 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| transport:chooseOne | 6 | 228.64 | 38.1071 | 59.5633 | 59.5633 | 12.3333 | 0 | 239 | 14 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| transport | 3 | 131.66 | 43.886 | 48.9992 | 48.9992 | 10.6667 | 3 | 0 | 0 | 3 | 0 | 0 | 6 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:6 | 0 | 0 | 3 |
| coupArvnRedeployPolice | 26 | 58.61 | 2.2541 | 3.7486 | 4.7743 | 6.1923 | 26 | 0 | 0 | 26 | 0 | 0 | 21 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:21 | 26 | 0 | 26 |
| coupRedeployPass | 20 | 53.48 | 2.674 | 4.0618 | 12.3036 | 1 | 13 | 0 | 7 | 13 | 0 | 0 | 0 |  | 20 | 0 | 13 |
| train:chooseOne | 9 | 51.84 | 5.76 | 6.9436 | 6.9436 | 2.2222 | 0 | 30 | 34 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| attack | 12 | 47.36 | 3.947 | 10.5071 | 10.5071 | 54.5 | 9 | 0 | 3 | 9 | 0 | 0 | 0 |  | 12 | 0 | 9 |
| coupNvaRedeployTroops | 18 | 43.36 | 2.4087 | 8.4127 | 8.4127 | 3.8333 | 14 | 0 | 4 | 14 | 0 | 0 | 14 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:14 | 18 | 0 | 14 |
| coupArvnRedeployOptionalTroops | 16 | 42.75 | 2.672 | 6.6419 | 6.6419 | 9.6875 | 12 | 0 | 4 | 12 | 0 | 0 | 12 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:12 | 16 | 0 | 12 |
| ambushVc | 11 | 42.13 | 3.83 | 5.815 | 5.815 | 51 | 10 | 0 | 1 | 10 | 0 | 0 | 0 |  | 11 | 0 | 10 |
| assault | 16 | 37.82 | 2.3635 | 4.8841 | 4.8841 | 9 | 14 | 0 | 2 | 14 | 0 | 0 | 11 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:11 | 16 | 0 | 14 |
| coupCommitmentPass | 20 | 37.81 | 1.8903 | 2.9197 | 4.4953 | 1.25 | 0 | 0 | 20 | 0 | 0 | 0 | 0 |  | 20 | 0 | 0 |
| ambushNva | 2 | 35.44 | 17.7177 | 28.7172 | 28.7172 | 103.5 | 1 | 0 | 1 | 1 | 0 | 0 | 1 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:1 | 1 | 0 | 1 |
| govern:chooseOne | 9 | 32.39 | 3.599 | 5.172 | 5.172 | 2 | 0 | 9 | 9 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate | 4 | 24.12 | 6.0309 | 8.0871 | 8.0871 | 94.25 | 2 | 0 | 2 | 2 | 0 | 0 | 0 |  | 4 | 0 | 2 |
| pass | 6 | 23.59 | 3.9321 | 4.6853 | 4.6853 | 3.6667 | 6 | 0 | 0 | 6 | 0 | 0 | 0 |  | 6 | 0 | 6 |
| coupPacifyPass | 10 | 21.43 | 2.1425 | 4.2127 | 4.2127 | 1.3 | 7 | 0 | 3 | 7 | 0 | 0 | 0 |  | 10 | 0 | 7 |
| march | 5 | 21.24 | 4.248 | 7.7173 | 7.7173 | 33.4 | 3 | 0 | 2 | 3 | 0 | 0 | 0 |  | 5 | 0 | 3 |
| coupPacifyARVN | 8 | 18.25 | 2.2814 | 3.7242 | 3.7242 | 4.375 | 6 | 0 | 2 | 6 | 0 | 0 | 5 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:5 | 8 | 0 | 6 |
| advise | 5 | 17.89 | 3.5772 | 6.7318 | 6.7318 | 9.6 | 3 | 0 | 2 | 3 | 0 | 0 | 0 |  | 5 | 0 | 3 |
| coupResourcesResolve | 5 | 12.14 | 2.4282 | 3.0304 | 3.0304 | 1 | 0 | 0 | 5 | 0 | 0 | 0 | 0 |  | 5 | 0 | 0 |
| coupVictoryCheck | 5 | 11.05 | 2.2107 | 2.7683 | 2.7683 | 1 | 5 | 0 | 0 | 5 | 0 | 0 | 0 |  | 5 | 0 | 5 |
| coupAgitatePass | 5 | 8.13 | 1.6263 | 1.8623 | 1.8623 | 6.6 | 0 | 0 | 5 | 0 | 0 | 0 | 0 |  | 5 | 0 | 0 |
| coupArvnRedeployMandatory | 2 | 6.48 | 3.239 | 3.7964 | 3.7964 | 10.5 | 1 | 0 | 1 | 1 | 0 | 0 | 1 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:1 | 2 | 0 | 1 |
| chooseOne:chooseOne | 3 | 5.95 | 1.9839 | 5.3432 | 5.3432 | 6.3333 | 0 | 3 | 1 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| coupNvaRedeployTroops:chooseOne | 68 | 2.63 | 0.0386 | 0.0658 | 0.0989 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| airStrike | 1 | 2.57 | 2.5709 | 2.5709 | 2.5709 | 2 | 1 | 0 | 0 | 1 | 0 | 0 | 0 |  | 1 | 0 | 1 |
| event-decision:chooseNStep:add | 39 | 1.44 | 0.037 | 0.1071 | 0.1813 | 16.1538 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally:chooseNStep:add | 18 | 1.14 | 0.0631 | 0.0966 | 0.0966 | 25.6111 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally:chooseNStep:confirm | 29 | 1.09 | 0.0377 | 0.0723 | 0.0876 | 22.4828 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| event-decision:chooseOne | 22 | 0.78 | 0.0357 | 0.0592 | 0.1096 | 3.5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| event-decision:chooseNStep:confirm | 28 | 0.72 | 0.0258 | 0.0504 | 0.0551 | 6.9286 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally:chooseOne | 18 | 0.63 | 0.0349 | 0.0776 | 0.0776 | 1.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushVc:chooseNStep:add | 12 | 0.54 | 0.0447 | 0.0718 | 0.0718 | 3.6667 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| advise:chooseNStep:add | 5 | 0.37 | 0.0735 | 0.1221 | 0.1221 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| advise:chooseOne | 10 | 0.37 | 0.0366 | 0.0732 | 0.0732 | 2.4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| march:chooseNStep:add | 5 | 0.37 | 0.0731 | 0.0803 | 0.0803 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| march:chooseNStep:confirm | 13 | 0.35 | 0.0269 | 0.0336 | 0.0336 | 4.6923 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate:chooseOne | 6 | 0.3 | 0.0495 | 0.1248 | 0.1248 | 1.5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushVc:chooseNStep:confirm | 12 | 0.29 | 0.0243 | 0.0312 | 0.0312 | 4.5833 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| advise:chooseNStep:confirm | 5 | 0.22 | 0.0434 | 0.0598 | 0.0598 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushVc:chooseOne | 11 | 0.22 | 0.0204 | 0.0358 | 0.0358 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate:chooseNStep:confirm | 6 | 0.2 | 0.0331 | 0.0477 | 0.0477 | 6.8333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate:chooseNStep:add | 4 | 0.17 | 0.0437 | 0.0457 | 0.0457 | 7.25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushNva:chooseOne | 2 | 0.07 | 0.0341 | 0.0348 | 0.0348 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| chooseNStep:chooseNStep:confirm | 2 | 0.07 | 0.0342 | 0.0348 | 0.0348 | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| airStrike:chooseNStep:confirm | 1 | 0.04 | 0.0386 | 0.0386 | 0.0386 | 9 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| airStrike:chooseOne | 1 | 0.04 | 0.0397 | 0.0397 | 0.0397 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |

## Top Hot Axes In Slow-Tier Seeds

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.

| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms |
|---:|---|---|---:|---:|---:|---:|---:|
| 1 | train:chooseNStep:add | continuedDeepening | 11 | 16128.61 | 1466.2373 | 3175.2443 | 3175.2443 |
| 2 | train:chooseNStep:confirm | continuedDeepening | 12 | 10713.98 | 892.8315 | 2753.2945 | 2753.2945 |
| 3 | coupArvnRedeployPolice:chooseOne | continuedDeepening | 66 | 8828.85 | 133.7704 | 287.5755 | 298.9031 |
| 4 | govern:chooseNStep:confirm | continuedDeepening | 6 | 8224.51 | 1370.7514 | 7096.4149 | 7096.4149 |
| 5 | event | singlePass | 48 | 4397.79 | 91.6207 | 523.6068 | 1886.709 |
| 6 | govern:chooseNStep:add | continuedDeepening | 6 | 3979.17 | 663.1954 | 2979.6923 | 2979.6923 |
| 7 | govern | singlePass | 6 | 1475.49 | 245.9142 | 665.5526 | 665.5526 |
| 8 | coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | 39 | 906.94 | 23.2548 | 41.3756 | 43.021 |
| 9 | rally | singlePass | 18 | 702.61 | 39.0341 | 256.6553 | 256.6553 |
| 10 | assault:chooseNStep:add | continuedDeepening | 5 | 437.68 | 87.5363 | 128.8627 | 128.8627 |

## Hot-Path Buckets For Top Slow Axes

Captured only when `--profile-buckets` is enabled. Buckets are timing/count diagnostics inside `PolicyAgent.chooseDecision`; they are not correctness assertions.

### train:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 20128 | 3536.49 |
| zobrist:encodeDecisionStackFrame | 21059 | 2066.72 |
| tokenStateIndex:refreshCachedEntries | 7741 | 200.52 |
| evalQuery:countMatchingTokens | 7451 | 20.46 |
| evalQuery:applyTokenFilter | 4636 | 18.71 |
| tokenStateIndex:build | 28 | 0.88 |
| evalQuery:applyTokenFilterCacheHit | 8290 | 0 |
| evalQuery:applyTokenFilterCompiled | 4636 | 0 |
| evalQuery:countMatchingTokensCacheHit | 953476 | 0 |
| evalQuery:countMatchingTokensCompiled | 7451 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 2282033 | 0 |
| tokenStateIndex:getCacheHit | 17816 | 0 |

### train:chooseNStep:confirm | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 12646 | 2301.66 |
| zobrist:encodeDecisionStackFrame | 13628 | 1432.75 |
| tokenStateIndex:refreshCachedEntries | 5338 | 105.23 |
| evalQuery:countMatchingTokens | 3526 | 8.44 |
| evalQuery:applyTokenFilter | 1718 | 5.99 |
| tokenStateIndex:build | 82 | 2.82 |
| evalQuery:applyTokenFilterCacheHit | 6614 | 0 |
| evalQuery:applyTokenFilterCompiled | 1718 | 0 |
| evalQuery:countMatchingTokensCacheHit | 659075 | 0 |
| evalQuery:countMatchingTokensCompiled | 3526 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1614252 | 0 |
| tokenStateIndex:getCacheHit | 11459 | 0 |

### coupArvnRedeployPolice:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 151922 | 1572.76 |
| evalQuery:countMatchingTokens | 173662 | 226.5 |
| zobrist:digestDecisionStackFrame | 1052 | 56.71 |
| zobrist:encodeDecisionStackFrame | 1052 | 50.82 |
| evalQuery:applyTokenFilterCacheHit | 2474 | 0 |
| evalQuery:countMatchingTokensCacheHit | 4062471 | 0 |
| evalQuery:countMatchingTokensCompiled | 173662 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 11150107 | 0 |
| tokenStateIndex:getCacheHit | 151922 | 0 |
| zobrist:decisionStackFrameEncodedChars | 6708311 | 0 |
| zobrist:decisionStackFrameRunLocalCacheMiss | 1052 | 0 |

### govern:chooseNStep:confirm | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 20945 | 350.48 |
| evalQuery:applyTokenFilter | 170131 | 244.05 |
| zobrist:encodeDecisionStackFrame | 264 | 11.55 |
| zobrist:digestDecisionStackFrame | 162 | 8.56 |
| evalQuery:countMatchingTokens | 4146 | 5.19 |
| evalQuery:applyTokenFilterCacheHit | 10017 | 0 |
| evalQuery:applyTokenFilterCompiled | 170131 | 0 |
| evalQuery:countMatchingTokensCacheHit | 504135 | 0 |
| evalQuery:countMatchingTokensCompiled | 4146 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1073956 | 0 |
| tokenStateIndex:getCacheHit | 67568 | 0 |
| zobrist:decisionStackFrameEncodedChars | 1026030 | 0 |

### event | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| evalQuery:applyTokenFilter | 36802 | 186.59 |
| tokenStateIndex:refreshCachedEntries | 7504 | 139.16 |
| zobrist:digestDecisionStackFrame | 454 | 79.59 |
| evalQuery:countMatchingTokens | 74915 | 68.06 |
| zobrist:encodeDecisionStackFrame | 454 | 49.32 |
| policyWasmRuntime:encodeBytecodeInput | 512 | 15.66 |
| evalQuery:applyTokenFilterCacheHit | 3387 | 0 |
| evalQuery:applyTokenFilterCompiled | 17036 | 0 |
| evalQuery:countMatchingTokensCacheHit | 453345 | 0 |
| evalQuery:countMatchingTokensCompiled | 3034 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1136254 | 0 |
| policyWasmRuntime:encodedInputCacheMiss | 512 | 0 |

### govern:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 8712 | 136.84 |
| evalQuery:applyTokenFilter | 71016 | 95.69 |
| zobrist:encodeDecisionStackFrame | 987 | 37.18 |
| zobrist:digestDecisionStackFrame | 792 | 36.59 |
| evalQuery:countMatchingTokens | 2564 | 3.15 |
| evalQuery:applyTokenFilterCacheHit | 4281 | 0 |
| evalQuery:applyTokenFilterCompiled | 71016 | 0 |
| evalQuery:countMatchingTokensCacheHit | 250947 | 0 |
| evalQuery:countMatchingTokensCompiled | 2564 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 531648 | 0 |
| tokenStateIndex:getCacheHit | 28547 | 0 |
| zobrist:decisionStackFrameEncodedChars | 4446700 | 0 |

### govern | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| evalQuery:applyTokenFilter | 20013 | 35.08 |
| tokenStateIndex:refreshCachedEntries | 2175 | 34.87 |
| zobrist:digestDecisionStackFrame | 158 | 17.77 |
| zobrist:encodeDecisionStackFrame | 158 | 11.95 |
| evalQuery:countMatchingTokens | 2828 | 3.73 |
| policyWasmRuntime:encodeBytecodeInput | 48 | 1.29 |
| evalQuery:applyTokenFilterCacheHit | 3305 | 0 |
| evalQuery:applyTokenFilterCompiled | 14614 | 0 |
| evalQuery:countMatchingTokensCacheHit | 83034 | 0 |
| evalQuery:countMatchingTokensCompiled | 666 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 182126 | 0 |
| policyWasmRuntime:encodedInputCacheMiss | 48 | 0 |

### coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 10352 | 109.21 |
| evalQuery:countMatchingTokens | 16904 | 17.06 |
| zobrist:encodeDecisionStackFrame | 96 | 5.24 |
| zobrist:digestDecisionStackFrame | 96 | 3.76 |
| evalQuery:applyTokenFilterCacheHit | 528 | 0 |
| evalQuery:countMatchingTokensCacheHit | 506116 | 0 |
| evalQuery:countMatchingTokensCompiled | 16904 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1174554 | 0 |
| tokenStateIndex:getCacheHit | 10352 | 0 |
| zobrist:decisionStackFrameEncodedChars | 432036 | 0 |
| zobrist:decisionStackFrameRunLocalCacheMiss | 96 | 0 |

### rally | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| evalQuery:countMatchingTokens | 7907 | 21.58 |
| tokenStateIndex:refreshCachedEntries | 1400 | 20.42 |
| zobrist:digestDecisionStackFrame | 100 | 7.56 |
| evalQuery:applyTokenFilter | 993 | 7.01 |
| zobrist:encodeDecisionStackFrame | 100 | 5.88 |
| policyWasmRuntime:encodeBytecodeInput | 72 | 3.31 |
| evalQuery:applyTokenFilterCacheHit | 1129 | 0 |
| evalQuery:applyTokenFilterCompiled | 772 | 0 |
| evalQuery:countMatchingTokensCacheHit | 180046 | 0 |
| evalQuery:countMatchingTokensCompiled | 2008 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 439567 | 0 |
| policyWasmRuntime:encodedInputCacheMiss | 72 | 0 |

### assault:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 188 | 28.95 |
| zobrist:encodeDecisionStackFrame | 253 | 23.29 |
| tokenStateIndex:refreshCachedEntries | 989 | 13.34 |
| evalQuery:applyTokenFilter | 930 | 7.34 |
| evalQuery:countMatchingTokens | 1879 | 1.66 |
| tokenStateIndex:build | 30 | 0.95 |
| evalQuery:applyTokenFilterCacheHit | 656 | 0 |
| evalQuery:applyTokenFilterCompiled | 831 | 0 |
| evalQuery:countMatchingTokensCacheHit | 109214 | 0 |
| evalQuery:countMatchingTokensCompiled | 1879 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 267963 | 0 |
| tokenStateIndex:getCacheHit | 12471 | 0 |


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
