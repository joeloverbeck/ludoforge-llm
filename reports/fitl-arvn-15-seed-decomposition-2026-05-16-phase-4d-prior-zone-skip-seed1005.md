# FITL ARVN 15-Seed Per-Microturn-Class Decomposition

**Date**: 2026-05-16-phase-4d-prior-zone-skip-seed1005
**Status**: Spec 173 measurement witness.
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005 --timeout-ms 400000 --date 2026-05-16-phase-4d-prior-zone-skip-seed1005 --profile-buckets`
**CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4d-prior-zone-skip-seed1005.csv`

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
| 1005 | OK | terminal | 103081.91 | 790 | 130.4834 |  |

## Per-Microturn-Class Rollup

| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | WASM preview-drive routes | WASM preview-drive unsupported | WASM preview-drive unsupported reasons | WASM preview-drive batches | Token index builds | Static rebuilds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|
| coupArvnRedeployPolice:chooseOne | 66 | 41340.25 | 626.3674 | 1981.997 | 2674.7166 | 26.7121 | 0 | 60935 | 2466 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| train:chooseNStep:add | 11 | 17152.83 | 1559.3484 | 3228.3311 | 3228.3311 | 14.4545 | 0 | 6998 | 9498 | 0 | 0 | 2 | 148 | agent-guided-completion/production-deep-choosenstep-continuation.pickInnerDecision/deep preview-drive selected a non-chooseNStep continuation decision:143; unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:5 | 0 | 388 | 0 |
| train:chooseNStep:confirm | 15 | 11766.56 | 784.4375 | 3130.4633 | 3130.4633 | 8.7333 | 0 | 4429 | 5965 | 0 | 0 | 8 | 97 | agent-guided-completion/production-deep-choosenstep-continuation.pickInnerDecision/deep preview-drive selected a non-chooseNStep continuation decision:94; unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:3 | 0 | 386 | 0 |
| govern:chooseNStep:confirm | 6 | 7570.29 | 1261.7145 | 6536.7944 | 6536.7944 | 7.5 | 0 | 159 | 72 | 0 | 0 | 0 | 33 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:33 | 0 | 0 | 0 |
| event | 48 | 4593.95 | 95.7073 | 494.3002 | 1820.7992 | 28.6667 | 48 | 0 | 0 | 48 | 22 | 0 | 50 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:50 | 0 | 0 | 50 |
| govern:chooseNStep:add | 6 | 4049.19 | 674.8658 | 2872.738 | 2872.738 | 6.5 | 0 | 228 | 363 | 0 | 0 | 0 | 39 | agent-guided-completion/production-deep-choosenstep-continuation.pickInnerDecision/deep preview-drive selected a non-chooseNStep continuation decision:39 | 0 | 0 | 0 |
| coupArvnRedeployOptionalTroops:chooseOne | 39 | 2226.07 | 57.0788 | 162.3125 | 163.3767 | 8 | 0 | 2681 | 383 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| govern | 9 | 1467.62 | 163.0685 | 609.7211 | 609.7211 | 10.5556 | 9 | 0 | 0 | 9 | 8 | 0 | 12 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:12 | 3 | 0 | 9 |
| coupArvnRedeployMandatory:chooseOne | 10 | 809.21 | 80.9212 | 139.4974 | 139.4974 | 8 | 0 | 1078 | 154 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally | 18 | 578.76 | 32.1531 | 129.077 | 129.077 | 38.9444 | 18 | 0 | 0 | 18 | 4 | 0 | 36 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:36 | 0 | 0 | 18 |
| assault:chooseNStep:add | 6 | 500.5 | 83.4164 | 153.1954 | 153.1954 | 3 | 0 | 66 | 84 | 0 | 0 | 2 | 13 | agent-guided-completion/production-deep-choosenstep-continuation.pickInnerDecision/deep preview-drive selected a non-chooseNStep continuation decision:13 | 0 | 82 | 0 |
| train | 5 | 424.75 | 84.9507 | 192.7432 | 192.7432 | 9.4 | 5 | 0 | 0 | 5 | 0 | 0 | 10 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:10 | 0 | 0 | 5 |
| transport:chooseOne | 6 | 386.95 | 64.4923 | 98.557 | 98.557 | 12.3333 | 0 | 239 | 14 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| assault:chooseNStep:confirm | 7 | 319.58 | 45.6539 | 112.2618 | 112.2618 | 3.4286 | 0 | 43 | 38 | 0 | 0 | 0 | 10 | agent-guided-completion/production-deep-choosenstep-continuation.pickInnerDecision/deep preview-drive selected a non-chooseNStep continuation decision:9; unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:1 | 0 | 36 | 0 |
| transport | 3 | 183.9 | 61.301 | 78.9303 | 78.9303 | 10.6667 | 3 | 0 | 0 | 3 | 0 | 0 | 6 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:6 | 0 | 0 | 3 |
| train:chooseOne | 9 | 71.01 | 7.8902 | 12.019 | 12.019 | 2.2222 | 0 | 30 | 34 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| coupArvnRedeployPolice | 26 | 59.96 | 2.3062 | 3.3737 | 5.1549 | 6.1923 | 26 | 0 | 0 | 26 | 0 | 0 | 21 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:21 | 26 | 0 | 26 |
| attack | 12 | 50.17 | 4.1812 | 9.6399 | 9.6399 | 54.5 | 9 | 0 | 3 | 9 | 0 | 0 | 0 |  | 12 | 0 | 9 |
| ambushVc | 11 | 41.28 | 3.7528 | 5.1485 | 5.1485 | 51 | 10 | 0 | 1 | 10 | 0 | 0 | 0 |  | 11 | 0 | 10 |
| coupRedeployPass | 20 | 37.36 | 1.8682 | 2.3653 | 2.841 | 1 | 13 | 0 | 7 | 13 | 0 | 0 | 0 |  | 20 | 0 | 13 |
| coupNvaRedeployTroops | 18 | 35.77 | 1.9874 | 3.6164 | 3.6164 | 3.8333 | 14 | 0 | 4 | 14 | 0 | 0 | 14 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:14 | 18 | 0 | 14 |
| ambushNva | 2 | 35.6 | 17.8018 | 28.6104 | 28.6104 | 103.5 | 1 | 0 | 1 | 1 | 0 | 0 | 1 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:1 | 1 | 0 | 1 |
| assault | 16 | 34.1 | 2.1311 | 4.112 | 4.112 | 9 | 14 | 0 | 2 | 14 | 0 | 0 | 11 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:11 | 16 | 0 | 14 |
| coupArvnRedeployOptionalTroops | 16 | 33.09 | 2.0682 | 4.3787 | 4.3787 | 9.6875 | 12 | 0 | 4 | 12 | 0 | 0 | 12 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:12 | 16 | 0 | 12 |
| govern:chooseOne | 9 | 31.48 | 3.4975 | 4.8324 | 4.8324 | 2 | 0 | 9 | 9 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| coupCommitmentPass | 20 | 29.96 | 1.4978 | 1.7956 | 3.6703 | 1.25 | 0 | 0 | 20 | 0 | 0 | 0 | 0 |  | 20 | 0 | 0 |
| infiltrate | 4 | 25.3 | 6.3242 | 9.9973 | 9.9973 | 94.25 | 2 | 0 | 2 | 2 | 0 | 0 | 0 |  | 4 | 0 | 2 |
| coupPacifyPass | 10 | 23.57 | 2.3572 | 4.0927 | 4.0927 | 1.3 | 7 | 0 | 3 | 7 | 0 | 0 | 0 |  | 10 | 0 | 7 |
| pass | 6 | 19.49 | 3.2482 | 4.729 | 4.729 | 3.6667 | 6 | 0 | 0 | 6 | 0 | 0 | 0 |  | 6 | 0 | 6 |
| march | 5 | 19.15 | 3.8304 | 6.8593 | 6.8593 | 33.4 | 3 | 0 | 2 | 3 | 0 | 0 | 0 |  | 5 | 0 | 3 |
| coupPacifyARVN | 8 | 18.39 | 2.299 | 3.6578 | 3.6578 | 4.375 | 6 | 0 | 2 | 6 | 0 | 0 | 5 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:5 | 8 | 0 | 6 |
| advise | 5 | 14.25 | 2.85 | 3.8408 | 3.8408 | 9.6 | 3 | 0 | 2 | 3 | 0 | 0 | 0 |  | 5 | 0 | 3 |
| coupResourcesResolve | 5 | 10.73 | 2.1459 | 2.7077 | 2.7077 | 1 | 0 | 0 | 5 | 0 | 0 | 0 | 0 |  | 5 | 0 | 0 |
| coupVictoryCheck | 5 | 10.27 | 2.0539 | 2.8165 | 2.8165 | 1 | 5 | 0 | 0 | 5 | 0 | 0 | 0 |  | 5 | 0 | 5 |
| coupAgitatePass | 5 | 8.07 | 1.6141 | 1.826 | 1.826 | 6.6 | 0 | 0 | 5 | 0 | 0 | 0 | 0 |  | 5 | 0 | 0 |
| chooseOne:chooseOne | 3 | 5.63 | 1.877 | 4.9704 | 4.9704 | 6.3333 | 0 | 3 | 1 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| coupArvnRedeployMandatory | 2 | 4.67 | 2.3364 | 3.0039 | 3.0039 | 10.5 | 1 | 0 | 1 | 1 | 0 | 0 | 1 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:1 | 2 | 0 | 1 |
| airStrike | 1 | 2.43 | 2.4268 | 2.4268 | 2.4268 | 2 | 1 | 0 | 0 | 1 | 0 | 0 | 0 |  | 1 | 0 | 1 |
| coupNvaRedeployTroops:chooseOne | 68 | 2.43 | 0.0358 | 0.0507 | 0.054 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| event-decision:chooseNStep:add | 39 | 1.73 | 0.0443 | 0.0773 | 0.1766 | 16.1538 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally:chooseNStep:add | 18 | 1.02 | 0.0568 | 0.0979 | 0.0979 | 25.6111 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally:chooseNStep:confirm | 29 | 0.92 | 0.0316 | 0.0599 | 0.0615 | 22.4828 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| event-decision:chooseNStep:confirm | 28 | 0.9 | 0.0321 | 0.0471 | 0.0687 | 6.9286 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| event-decision:chooseOne | 22 | 0.78 | 0.0354 | 0.0503 | 0.0528 | 3.5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushVc:chooseNStep:add | 12 | 0.5 | 0.0413 | 0.0497 | 0.0497 | 3.6667 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally:chooseOne | 18 | 0.5 | 0.0277 | 0.0462 | 0.0462 | 1.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| march:chooseNStep:confirm | 13 | 0.43 | 0.0332 | 0.0429 | 0.0429 | 4.6923 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| march:chooseNStep:add | 5 | 0.41 | 0.0816 | 0.0979 | 0.0979 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| advise:chooseNStep:add | 5 | 0.39 | 0.0774 | 0.1786 | 0.1786 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| advise:chooseOne | 10 | 0.36 | 0.0356 | 0.046 | 0.046 | 2.4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushVc:chooseNStep:confirm | 12 | 0.3 | 0.0253 | 0.0309 | 0.0309 | 4.5833 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushVc:chooseOne | 11 | 0.25 | 0.0223 | 0.0284 | 0.0284 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate:chooseNStep:confirm | 6 | 0.19 | 0.031 | 0.0471 | 0.0471 | 6.8333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate:chooseOne | 6 | 0.19 | 0.0309 | 0.0605 | 0.0605 | 1.5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| advise:chooseNStep:confirm | 5 | 0.18 | 0.0362 | 0.0443 | 0.0443 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate:chooseNStep:add | 4 | 0.18 | 0.0447 | 0.0461 | 0.0461 | 7.25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushNva:chooseOne | 2 | 0.07 | 0.0349 | 0.0364 | 0.0364 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| chooseNStep:chooseNStep:confirm | 2 | 0.07 | 0.0356 | 0.0362 | 0.0362 | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| airStrike:chooseOne | 1 | 0.04 | 0.0362 | 0.0362 | 0.0362 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| airStrike:chooseNStep:confirm | 1 | 0.03 | 0.0314 | 0.0314 | 0.0314 | 9 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |

## Top Hot Axes In Slow-Tier Seeds

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.

| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms |
|---:|---|---|---:|---:|---:|---:|---:|
| 1 | coupArvnRedeployPolice:chooseOne | continuedDeepening | 66 | 41340.25 | 626.3674 | 1981.997 | 2674.7166 |
| 2 | train:chooseNStep:add | continuedDeepening | 11 | 17152.83 | 1559.3484 | 3228.3311 | 3228.3311 |
| 3 | train:chooseNStep:confirm | continuedDeepening | 12 | 11766.29 | 980.5241 | 3130.4633 | 3130.4633 |
| 4 | govern:chooseNStep:confirm | continuedDeepening | 6 | 7570.29 | 1261.7145 | 6536.7944 | 6536.7944 |
| 5 | event | singlePass | 48 | 4593.95 | 95.7073 | 494.3002 | 1820.7992 |
| 6 | govern:chooseNStep:add | continuedDeepening | 6 | 4049.19 | 674.8658 | 2872.738 | 2872.738 |
| 7 | coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | 39 | 2226.07 | 57.0788 | 162.3125 | 163.3767 |
| 8 | govern | singlePass | 6 | 1454.38 | 242.3964 | 609.7211 | 609.7211 |
| 9 | coupArvnRedeployMandatory:chooseOne | continuedDeepening | 10 | 809.21 | 80.9212 | 139.4974 | 139.4974 |
| 10 | rally | singlePass | 18 | 578.76 | 32.1531 | 129.077 | 129.077 |

## Hot-Path Buckets For Top Slow Axes

Captured only when `--profile-buckets` is enabled. Buckets are timing/count diagnostics inside `PolicyAgent.chooseDecision`; they are not correctness assertions.

### coupArvnRedeployPolice:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 1633342 | 6915.18 |
| evalQuery:countMatchingTokens | 1738266 | 2592.42 |
| zobrist:digestDecisionStackFrame | 1052 | 55.76 |
| zobrist:encodeDecisionStackFrame | 1052 | 50.53 |
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
| zobrist:digestDecisionStackFrame | 20128 | 3468.07 |
| zobrist:encodeDecisionStackFrame | 21059 | 2007.79 |
| tokenStateIndex:refreshCachedEntries | 19885 | 363.15 |
| evalQuery:applyTokenFilter | 8906 | 29.06 |
| evalQuery:countMatchingTokens | 11727 | 23.36 |
| tokenStateIndex:build | 388 | 11.01 |
| evalQuery:applyTokenFilterCacheHit | 20424 | 0 |
| evalQuery:applyTokenFilterCompiled | 8906 | 0 |
| evalQuery:countMatchingTokensCacheHit | 2010742 | 0 |
| evalQuery:countMatchingTokensCompiled | 11727 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 5421379 | 0 |
| tokenStateIndex:getCacheHit | 29600 | 0 |

### train:chooseNStep:confirm | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 12646 | 2270.45 |
| zobrist:encodeDecisionStackFrame | 13628 | 1402.22 |
| tokenStateIndex:refreshCachedEntries | 14324 | 242.95 |
| evalQuery:applyTokenFilter | 4528 | 17.92 |
| tokenStateIndex:build | 386 | 13 |
| evalQuery:countMatchingTokens | 6232 | 12.81 |
| evalQuery:applyTokenFilterCacheHit | 20714 | 0 |
| evalQuery:applyTokenFilterCompiled | 4528 | 0 |
| evalQuery:countMatchingTokensCacheHit | 1690423 | 0 |
| evalQuery:countMatchingTokensCompiled | 6232 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 4573840 | 0 |
| tokenStateIndex:getCacheHit | 20141 | 0 |

### govern:chooseNStep:confirm | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 20945 | 325.89 |
| evalQuery:applyTokenFilter | 170131 | 202.32 |
| zobrist:encodeDecisionStackFrame | 264 | 10.32 |
| zobrist:digestDecisionStackFrame | 162 | 8.33 |
| evalQuery:countMatchingTokens | 4146 | 4.62 |
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
| evalQuery:applyTokenFilter | 38842 | 198.03 |
| tokenStateIndex:refreshCachedEntries | 8005 | 157.71 |
| zobrist:digestDecisionStackFrame | 454 | 79.26 |
| evalQuery:countMatchingTokens | 76561 | 76.03 |
| zobrist:encodeDecisionStackFrame | 454 | 49.11 |
| policyWasmRuntime:encodeBytecodeInput | 512 | 16.17 |
| evalQuery:applyTokenFilterCacheHit | 4771 | 0 |
| evalQuery:applyTokenFilterCompiled | 18774 | 0 |
| evalQuery:countMatchingTokensCacheHit | 696383 | 0 |
| evalQuery:countMatchingTokensCompiled | 3176 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1550195 | 0 |
| policyWasmRuntime:encodedInputCacheMiss | 512 | 0 |

### govern:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 8712 | 144.77 |
| evalQuery:applyTokenFilter | 71016 | 86.05 |
| zobrist:encodeDecisionStackFrame | 987 | 36.58 |
| zobrist:digestDecisionStackFrame | 792 | 36.45 |
| evalQuery:countMatchingTokens | 2564 | 2.77 |
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
| tokenStateIndex:refreshCachedEntries | 55920 | 319.18 |
| evalQuery:countMatchingTokens | 74344 | 87.39 |
| zobrist:encodeDecisionStackFrame | 96 | 4.06 |
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
| evalQuery:applyTokenFilter | 20816 | 45.32 |
| tokenStateIndex:refreshCachedEntries | 2443 | 39.76 |
| zobrist:digestDecisionStackFrame | 158 | 17.21 |
| zobrist:encodeDecisionStackFrame | 158 | 12.41 |
| evalQuery:countMatchingTokens | 4354 | 4.23 |
| policyWasmRuntime:encodeBytecodeInput | 48 | 2.74 |
| evalQuery:applyTokenFilterCacheHit | 4771 | 0 |
| evalQuery:applyTokenFilterCompiled | 15193 | 0 |
| evalQuery:countMatchingTokensCacheHit | 112448 | 0 |
| evalQuery:countMatchingTokensCompiled | 688 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 236416 | 0 |
| policyWasmRuntime:encodedInputCacheMiss | 48 | 0 |

### coupArvnRedeployMandatory:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 22764 | 122.39 |
| evalQuery:countMatchingTokens | 32131 | 37.17 |
| zobrist:encodeDecisionStackFrame | 32 | 1.58 |
| zobrist:digestDecisionStackFrame | 32 | 1.18 |
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
| tokenStateIndex:refreshCachedEntries | 1668 | 31.77 |
| evalQuery:applyTokenFilter | 1385 | 16.21 |
| evalQuery:countMatchingTokens | 8001 | 7.69 |
| zobrist:digestDecisionStackFrame | 100 | 7.32 |
| zobrist:encodeDecisionStackFrame | 100 | 5.08 |
| policyWasmRuntime:encodeBytecodeInput | 72 | 4.24 |
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
