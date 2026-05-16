# FITL ARVN 15-Seed Per-Microturn-Class Decomposition

**Date**: 2026-05-16-phase-4d-structural-count-cache-seed1005
**Status**: Spec 173 measurement witness.
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005 --timeout-ms 400000 --date 2026-05-16-phase-4d-structural-count-cache-seed1005 --profile-buckets`
**CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4d-structural-count-cache-seed1005.csv`

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
| 1005 | OK | terminal | 103349.93 | 790 | 130.8227 |  |

## Per-Microturn-Class Rollup

| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | WASM preview-drive routes | WASM preview-drive unsupported | WASM preview-drive unsupported reasons | WASM preview-drive batches | Token index builds | Static rebuilds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|
| coupArvnRedeployPolice:chooseOne | 66 | 43018.87 | 651.8011 | 2184.7083 | 2706.0845 | 26.7121 | 0 | 60935 | 2466 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| train:chooseNStep:add | 11 | 16908.91 | 1537.1735 | 3182.0015 | 3182.0015 | 14.4545 | 0 | 6998 | 9498 | 0 | 0 | 2 | 148 | agent-guided-completion/production-deep-choosenstep-continuation.pickInnerDecision/deep preview-drive selected a non-chooseNStep continuation decision:143; unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:5 | 0 | 388 | 0 |
| train:chooseNStep:confirm | 15 | 11528.15 | 768.5436 | 2905.5992 | 2905.5992 | 8.7333 | 0 | 4429 | 5965 | 0 | 0 | 8 | 97 | agent-guided-completion/production-deep-choosenstep-continuation.pickInnerDecision/deep preview-drive selected a non-chooseNStep continuation decision:94; unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:3 | 0 | 386 | 0 |
| govern:chooseNStep:confirm | 6 | 7459.2 | 1243.1992 | 6439.6529 | 6439.6529 | 7.5 | 0 | 159 | 72 | 0 | 0 | 0 | 33 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:33 | 0 | 0 | 0 |
| event | 48 | 4394.75 | 91.5573 | 485.0165 | 1706.1284 | 28.6667 | 48 | 0 | 0 | 48 | 22 | 0 | 50 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:50 | 0 | 0 | 50 |
| govern:chooseNStep:add | 6 | 3910.8 | 651.8002 | 2773.321 | 2773.321 | 6.5 | 0 | 228 | 363 | 0 | 0 | 0 | 39 | agent-guided-completion/production-deep-choosenstep-continuation.pickInnerDecision/deep preview-drive selected a non-chooseNStep continuation decision:39 | 0 | 0 | 0 |
| coupArvnRedeployOptionalTroops:chooseOne | 39 | 2152.86 | 55.2015 | 152.8039 | 157.0187 | 8 | 0 | 2681 | 383 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| govern | 9 | 1424.13 | 158.2371 | 588.7349 | 588.7349 | 10.5556 | 9 | 0 | 0 | 9 | 8 | 0 | 12 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:12 | 3 | 0 | 9 |
| coupArvnRedeployMandatory:chooseOne | 10 | 763.43 | 76.343 | 136.0925 | 136.0925 | 8 | 0 | 1078 | 154 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally | 18 | 563.41 | 31.3006 | 120.7716 | 120.7716 | 38.9444 | 18 | 0 | 0 | 18 | 4 | 0 | 36 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:36 | 0 | 0 | 18 |
| assault:chooseNStep:add | 6 | 472.29 | 78.7156 | 137.6333 | 137.6333 | 3 | 0 | 66 | 84 | 0 | 0 | 2 | 13 | agent-guided-completion/production-deep-choosenstep-continuation.pickInnerDecision/deep preview-drive selected a non-chooseNStep continuation decision:13 | 0 | 82 | 0 |
| train | 5 | 416.16 | 83.2311 | 187.7422 | 187.7422 | 9.4 | 5 | 0 | 0 | 5 | 0 | 0 | 10 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:10 | 0 | 0 | 5 |
| transport:chooseOne | 6 | 369.43 | 61.5718 | 87.6584 | 87.6584 | 12.3333 | 0 | 239 | 14 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| assault:chooseNStep:confirm | 7 | 288.39 | 41.198 | 88.1534 | 88.1534 | 3.4286 | 0 | 43 | 38 | 0 | 0 | 0 | 10 | agent-guided-completion/production-deep-choosenstep-continuation.pickInnerDecision/deep preview-drive selected a non-chooseNStep continuation decision:9; unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:1 | 0 | 36 | 0 |
| transport | 3 | 170.61 | 56.8684 | 65.8327 | 65.8327 | 10.6667 | 3 | 0 | 0 | 3 | 0 | 0 | 6 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:6 | 0 | 0 | 3 |
| train:chooseOne | 9 | 77.53 | 8.6149 | 14.4075 | 14.4075 | 2.2222 | 0 | 30 | 34 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| coupArvnRedeployPolice | 26 | 55.39 | 2.1305 | 3.2496 | 3.6429 | 6.1923 | 26 | 0 | 0 | 26 | 0 | 0 | 21 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:21 | 26 | 0 | 26 |
| attack | 12 | 46.49 | 3.8745 | 9.4483 | 9.4483 | 54.5 | 9 | 0 | 3 | 9 | 0 | 0 | 0 |  | 12 | 0 | 9 |
| coupRedeployPass | 20 | 38.41 | 1.9204 | 2.4482 | 3.1682 | 1 | 13 | 0 | 7 | 13 | 0 | 0 | 0 |  | 20 | 0 | 13 |
| coupNvaRedeployTroops | 18 | 37.53 | 2.0852 | 3.8383 | 3.8383 | 3.8333 | 14 | 0 | 4 | 14 | 0 | 0 | 14 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:14 | 18 | 0 | 14 |
| ambushVc | 11 | 36.49 | 3.3169 | 4.1533 | 4.1533 | 51 | 10 | 0 | 1 | 10 | 0 | 0 | 0 |  | 11 | 0 | 10 |
| assault | 16 | 36.22 | 2.2639 | 4.8268 | 4.8268 | 9 | 14 | 0 | 2 | 14 | 0 | 0 | 11 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:11 | 16 | 0 | 14 |
| ambushNva | 2 | 36.18 | 18.0909 | 30.0508 | 30.0508 | 103.5 | 1 | 0 | 1 | 1 | 0 | 0 | 1 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:1 | 1 | 0 | 1 |
| coupArvnRedeployOptionalTroops | 16 | 34.26 | 2.1413 | 3.3816 | 3.3816 | 9.6875 | 12 | 0 | 4 | 12 | 0 | 0 | 12 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:12 | 16 | 0 | 12 |
| coupCommitmentPass | 20 | 30.05 | 1.5027 | 2.592 | 2.7214 | 1.25 | 0 | 0 | 20 | 0 | 0 | 0 | 0 |  | 20 | 0 | 0 |
| govern:chooseOne | 9 | 29.91 | 3.3234 | 5.2613 | 5.2613 | 2 | 0 | 9 | 9 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate | 4 | 26.03 | 6.5081 | 9.9171 | 9.9171 | 94.25 | 2 | 0 | 2 | 2 | 0 | 0 | 0 |  | 4 | 0 | 2 |
| pass | 6 | 18.92 | 3.1537 | 4.6827 | 4.6827 | 3.6667 | 6 | 0 | 0 | 6 | 0 | 0 | 0 |  | 6 | 0 | 6 |
| coupPacifyPass | 10 | 18.76 | 1.8758 | 3.2779 | 3.2779 | 1.3 | 7 | 0 | 3 | 7 | 0 | 0 | 0 |  | 10 | 0 | 7 |
| coupPacifyARVN | 8 | 17.22 | 2.1528 | 2.7688 | 2.7688 | 4.375 | 6 | 0 | 2 | 6 | 0 | 0 | 5 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:5 | 8 | 0 | 6 |
| march | 5 | 16.96 | 3.3921 | 5.9559 | 5.9559 | 33.4 | 3 | 0 | 2 | 3 | 0 | 0 | 0 |  | 5 | 0 | 3 |
| advise | 5 | 13.89 | 2.7781 | 4.051 | 4.051 | 9.6 | 3 | 0 | 2 | 3 | 0 | 0 | 0 |  | 5 | 0 | 3 |
| coupVictoryCheck | 5 | 11.41 | 2.2823 | 3.3112 | 3.3112 | 1 | 5 | 0 | 0 | 5 | 0 | 0 | 0 |  | 5 | 0 | 5 |
| coupResourcesResolve | 5 | 11.28 | 2.2564 | 3.083 | 3.083 | 1 | 0 | 0 | 5 | 0 | 0 | 0 | 0 |  | 5 | 0 | 0 |
| coupAgitatePass | 5 | 8.22 | 1.6447 | 2.6144 | 2.6144 | 6.6 | 0 | 0 | 5 | 0 | 0 | 0 | 0 |  | 5 | 0 | 0 |
| chooseOne:chooseOne | 3 | 6.86 | 2.2876 | 6.2091 | 6.2091 | 6.3333 | 0 | 3 | 1 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| coupArvnRedeployMandatory | 2 | 5.07 | 2.5367 | 3.6403 | 3.6403 | 10.5 | 1 | 0 | 1 | 1 | 0 | 0 | 1 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:1 | 2 | 0 | 1 |
| coupNvaRedeployTroops:chooseOne | 68 | 2.32 | 0.0341 | 0.0477 | 0.0514 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| airStrike | 1 | 2.24 | 2.2357 | 2.2357 | 2.2357 | 2 | 1 | 0 | 0 | 1 | 0 | 0 | 0 |  | 1 | 0 | 1 |
| event-decision:chooseNStep:add | 39 | 1.29 | 0.0331 | 0.0595 | 0.0625 | 16.1538 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally:chooseNStep:add | 18 | 0.93 | 0.0516 | 0.0912 | 0.0912 | 25.6111 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally:chooseNStep:confirm | 29 | 0.88 | 0.0305 | 0.0549 | 0.0595 | 22.4828 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| event-decision:chooseNStep:confirm | 28 | 0.77 | 0.0276 | 0.0504 | 0.0536 | 6.9286 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| event-decision:chooseOne | 22 | 0.77 | 0.0349 | 0.0515 | 0.0642 | 3.5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushVc:chooseNStep:add | 12 | 0.5 | 0.0417 | 0.077 | 0.077 | 3.6667 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally:chooseOne | 18 | 0.48 | 0.0265 | 0.042 | 0.042 | 1.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| march:chooseNStep:add | 5 | 0.36 | 0.0725 | 0.0976 | 0.0976 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| march:chooseNStep:confirm | 13 | 0.33 | 0.0256 | 0.0305 | 0.0305 | 4.6923 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| advise:chooseNStep:add | 5 | 0.32 | 0.0646 | 0.1245 | 0.1245 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| advise:chooseOne | 10 | 0.3 | 0.0303 | 0.038 | 0.038 | 2.4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushVc:chooseNStep:confirm | 12 | 0.28 | 0.0237 | 0.0316 | 0.0316 | 4.5833 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushVc:chooseOne | 11 | 0.22 | 0.0204 | 0.026 | 0.026 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate:chooseNStep:add | 4 | 0.18 | 0.0438 | 0.0514 | 0.0514 | 7.25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate:chooseNStep:confirm | 6 | 0.18 | 0.03 | 0.0403 | 0.0403 | 6.8333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| advise:chooseNStep:confirm | 5 | 0.17 | 0.034 | 0.0407 | 0.0407 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate:chooseOne | 6 | 0.17 | 0.0287 | 0.0492 | 0.0492 | 1.5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushNva:chooseOne | 2 | 0.08 | 0.0422 | 0.0499 | 0.0499 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| chooseNStep:chooseNStep:confirm | 2 | 0.06 | 0.0306 | 0.0315 | 0.0315 | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| airStrike:chooseNStep:confirm | 1 | 0.03 | 0.0307 | 0.0307 | 0.0307 | 9 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| airStrike:chooseOne | 1 | 0.03 | 0.0331 | 0.0331 | 0.0331 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |

## Top Hot Axes In Slow-Tier Seeds

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.

| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms |
|---:|---|---|---:|---:|---:|---:|---:|
| 1 | coupArvnRedeployPolice:chooseOne | continuedDeepening | 66 | 43018.87 | 651.8011 | 2184.7083 | 2706.0845 |
| 2 | train:chooseNStep:add | continuedDeepening | 11 | 16908.91 | 1537.1735 | 3182.0015 | 3182.0015 |
| 3 | train:chooseNStep:confirm | continuedDeepening | 12 | 11527.9 | 960.6581 | 2905.5992 | 2905.5992 |
| 4 | govern:chooseNStep:confirm | continuedDeepening | 6 | 7459.2 | 1243.1992 | 6439.6529 | 6439.6529 |
| 5 | event | singlePass | 48 | 4394.75 | 91.5573 | 485.0165 | 1706.1284 |
| 6 | govern:chooseNStep:add | continuedDeepening | 6 | 3910.8 | 651.8002 | 2773.321 | 2773.321 |
| 7 | coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | 39 | 2152.86 | 55.2015 | 152.8039 | 157.0187 |
| 8 | govern | singlePass | 6 | 1412.06 | 235.3428 | 588.7349 | 588.7349 |
| 9 | coupArvnRedeployMandatory:chooseOne | continuedDeepening | 10 | 763.43 | 76.343 | 136.0925 | 136.0925 |
| 10 | rally | singlePass | 18 | 563.41 | 31.3006 | 120.7716 | 120.7716 |

## Hot-Path Buckets For Top Slow Axes

Captured only when `--profile-buckets` is enabled. Buckets are timing/count diagnostics inside `PolicyAgent.chooseDecision`; they are not correctness assertions.

### coupArvnRedeployPolice:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 1633342 | 6732.48 |
| zobrist:digestDecisionStackFrame | 1052 | 54.58 |
| zobrist:encodeDecisionStackFrame | 1052 | 47.09 |
| evalQuery:countMatchingTokens | 5552 | 12.96 |
| evalQuery:applyTokenFilterCacheHit | 125750 | 0 |
| evalQuery:countMatchingTokensCacheHit | 41188829 | 0 |
| evalQuery:countMatchingTokensCompiled | 5552 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 125757475 | 0 |
| evalQuery:countMatchingTokensStructuralCacheHit | 1732714 | 0 |
| tokenStateIndex:getCacheHit | 1633342 | 0 |
| zobrist:decisionStackFrameEncodedChars | 6708311 | 0 |
| zobrist:decisionStackFrameRunLocalCacheMiss | 1052 | 0 |

### train:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 20128 | 3414.31 |
| zobrist:encodeDecisionStackFrame | 21059 | 1973.68 |
| tokenStateIndex:refreshCachedEntries | 19885 | 406.95 |
| evalQuery:applyTokenFilter | 8906 | 32.16 |
| tokenStateIndex:build | 388 | 14.29 |
| evalQuery:countMatchingTokens | 1129 | 3.08 |
| evalQuery:applyTokenFilterCacheHit | 20424 | 0 |
| evalQuery:applyTokenFilterCompiled | 8906 | 0 |
| evalQuery:countMatchingTokensCacheHit | 2010742 | 0 |
| evalQuery:countMatchingTokensCompiled | 1129 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 5421379 | 0 |
| evalQuery:countMatchingTokensStructuralCacheHit | 10598 | 0 |

### train:chooseNStep:confirm | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 12646 | 2218.63 |
| zobrist:encodeDecisionStackFrame | 13628 | 1319.8 |
| tokenStateIndex:refreshCachedEntries | 14324 | 264.75 |
| tokenStateIndex:build | 386 | 16.06 |
| evalQuery:applyTokenFilter | 4528 | 13.1 |
| evalQuery:countMatchingTokens | 137 | 0.5 |
| evalQuery:applyTokenFilterCacheHit | 20714 | 0 |
| evalQuery:applyTokenFilterCompiled | 4528 | 0 |
| evalQuery:countMatchingTokensCacheHit | 1690423 | 0 |
| evalQuery:countMatchingTokensCompiled | 137 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 4573840 | 0 |
| evalQuery:countMatchingTokensStructuralCacheHit | 6095 | 0 |

### govern:chooseNStep:confirm | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 20945 | 309.52 |
| evalQuery:applyTokenFilter | 170131 | 204.69 |
| zobrist:encodeDecisionStackFrame | 264 | 10.13 |
| zobrist:digestDecisionStackFrame | 162 | 8.12 |
| evalQuery:applyTokenFilterCacheHit | 10017 | 0 |
| evalQuery:applyTokenFilterCompiled | 170131 | 0 |
| evalQuery:countMatchingTokensCacheHit | 511539 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1094788 | 0 |
| evalQuery:countMatchingTokensStructuralCacheHit | 4146 | 0 |
| tokenStateIndex:getCacheHit | 67568 | 0 |
| zobrist:decisionStackFrameEncodedChars | 1026030 | 0 |
| zobrist:decisionStackFrameRunLocalCacheHit | 102 | 0 |

### event | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| evalQuery:applyTokenFilter | 38842 | 161.73 |
| tokenStateIndex:refreshCachedEntries | 8005 | 144.85 |
| zobrist:digestDecisionStackFrame | 454 | 77.4 |
| evalQuery:countMatchingTokens | 74272 | 65.71 |
| zobrist:encodeDecisionStackFrame | 454 | 46.9 |
| policyWasmRuntime:encodeBytecodeInput | 512 | 12.32 |
| evalQuery:applyTokenFilterCacheHit | 4771 | 0 |
| evalQuery:applyTokenFilterCompiled | 18774 | 0 |
| evalQuery:countMatchingTokensCacheHit | 696383 | 0 |
| evalQuery:countMatchingTokensCompiled | 887 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1550195 | 0 |
| evalQuery:countMatchingTokensStructuralCacheHit | 2289 | 0 |

### govern:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 8712 | 128.17 |
| evalQuery:applyTokenFilter | 71016 | 85.82 |
| zobrist:digestDecisionStackFrame | 792 | 35.96 |
| zobrist:encodeDecisionStackFrame | 987 | 35.55 |
| evalQuery:countMatchingTokens | 476 | 1.2 |
| evalQuery:applyTokenFilterCacheHit | 4281 | 0 |
| evalQuery:applyTokenFilterCompiled | 71016 | 0 |
| evalQuery:countMatchingTokensCacheHit | 289927 | 0 |
| evalQuery:countMatchingTokensCompiled | 476 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 643772 | 0 |
| evalQuery:countMatchingTokensStructuralCacheHit | 2088 | 0 |
| tokenStateIndex:getCacheHit | 28547 | 0 |

### coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 55920 | 266.29 |
| evalQuery:countMatchingTokens | 2364 | 4.84 |
| zobrist:encodeDecisionStackFrame | 96 | 3.64 |
| zobrist:digestDecisionStackFrame | 96 | 3.62 |
| evalQuery:applyTokenFilterCacheHit | 6032 | 0 |
| evalQuery:countMatchingTokensCacheHit | 2537060 | 0 |
| evalQuery:countMatchingTokensCompiled | 2364 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 5932122 | 0 |
| evalQuery:countMatchingTokensStructuralCacheHit | 71980 | 0 |
| tokenStateIndex:getCacheHit | 55920 | 0 |
| zobrist:decisionStackFrameEncodedChars | 432036 | 0 |
| zobrist:decisionStackFrameRunLocalCacheMiss | 96 | 0 |

### govern | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| evalQuery:applyTokenFilter | 20816 | 39.21 |
| tokenStateIndex:refreshCachedEntries | 2443 | 38.76 |
| zobrist:digestDecisionStackFrame | 158 | 16.84 |
| zobrist:encodeDecisionStackFrame | 158 | 11.03 |
| evalQuery:countMatchingTokens | 3805 | 4.77 |
| policyWasmRuntime:encodeBytecodeInput | 48 | 1.29 |
| evalQuery:applyTokenFilterCacheHit | 4771 | 0 |
| evalQuery:applyTokenFilterCompiled | 15193 | 0 |
| evalQuery:countMatchingTokensCacheHit | 112448 | 0 |
| evalQuery:countMatchingTokensCompiled | 139 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 236416 | 0 |
| evalQuery:countMatchingTokensStructuralCacheHit | 549 | 0 |

### coupArvnRedeployMandatory:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 22764 | 109.77 |
| evalQuery:countMatchingTokens | 922 | 1.97 |
| zobrist:encodeDecisionStackFrame | 32 | 1.18 |
| zobrist:digestDecisionStackFrame | 32 | 1.13 |
| evalQuery:applyTokenFilterCacheHit | 2432 | 0 |
| evalQuery:countMatchingTokensCacheHit | 728298 | 0 |
| evalQuery:countMatchingTokensCompiled | 922 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1864477 | 0 |
| evalQuery:countMatchingTokensStructuralCacheHit | 31209 | 0 |
| tokenStateIndex:getCacheHit | 22764 | 0 |
| zobrist:decisionStackFrameEncodedChars | 137372 | 0 |
| zobrist:decisionStackFrameRunLocalCacheMiss | 32 | 0 |

### rally | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 1668 | 27.11 |
| evalQuery:applyTokenFilter | 1385 | 12.68 |
| zobrist:digestDecisionStackFrame | 100 | 7.13 |
| zobrist:encodeDecisionStackFrame | 100 | 4.98 |
| evalQuery:countMatchingTokens | 6041 | 3.89 |
| policyWasmRuntime:encodeBytecodeInput | 72 | 2.76 |
| evalQuery:applyTokenFilterCacheHit | 1519 | 0 |
| evalQuery:applyTokenFilterCompiled | 924 | 0 |
| evalQuery:countMatchingTokensCacheHit | 221528 | 0 |
| evalQuery:countMatchingTokensCompiled | 142 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 539164 | 0 |
| evalQuery:countMatchingTokensStructuralCacheHit | 1960 | 0 |


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
