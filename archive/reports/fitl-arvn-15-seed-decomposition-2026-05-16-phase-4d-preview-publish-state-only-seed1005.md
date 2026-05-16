# FITL ARVN 15-Seed Per-Microturn-Class Decomposition

**Status**: ✅ EXPLOITED — referenced during spec 174 implementation (archived 2026-05-16).

**Date**: 2026-05-16-phase-4d-preview-publish-state-only-seed1005
**Status**: Spec 173 measurement witness.
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005 --timeout-ms 400000 --date 2026-05-16-phase-4d-preview-publish-state-only-seed1005 --profile-buckets`
**CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4d-preview-publish-state-only-seed1005.csv`

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
| 1005 | OK | terminal | 99047.62 | 790 | 125.3767 |  |

## Per-Microturn-Class Rollup

| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | WASM preview-drive routes | WASM preview-drive unsupported | WASM preview-drive unsupported reasons | WASM preview-drive batches | Token index builds | Static rebuilds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|
| coupArvnRedeployPolice:chooseOne | 66 | 39805.08 | 603.1073 | 1959.3767 | 2521.5342 | 26.7121 | 0 | 60935 | 2466 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| train:chooseNStep:add | 11 | 16338.26 | 1485.2961 | 3088.8625 | 3088.8625 | 14.4545 | 0 | 6998 | 9498 | 0 | 0 | 2 | 148 | agent-guided-completion/production-deep-choosenstep-continuation.pickInnerDecision/deep preview-drive selected a non-chooseNStep continuation decision:143; unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:5 | 0 | 388 | 0 |
| train:chooseNStep:confirm | 15 | 11225.77 | 748.3844 | 2987.5333 | 2987.5333 | 8.7333 | 0 | 4429 | 5965 | 0 | 0 | 8 | 97 | agent-guided-completion/production-deep-choosenstep-continuation.pickInnerDecision/deep preview-drive selected a non-chooseNStep continuation decision:94; unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:3 | 0 | 386 | 0 |
| govern:chooseNStep:confirm | 6 | 7597.31 | 1266.2178 | 6579.8993 | 6579.8993 | 7.5 | 0 | 159 | 72 | 0 | 0 | 0 | 33 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:33 | 0 | 0 | 0 |
| event | 48 | 4437.07 | 92.439 | 477.0197 | 1767.5646 | 28.6667 | 48 | 0 | 0 | 48 | 22 | 0 | 50 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:50 | 0 | 0 | 50 |
| govern:chooseNStep:add | 6 | 3943.59 | 657.2652 | 2789.1889 | 2789.1889 | 6.5 | 0 | 228 | 363 | 0 | 0 | 0 | 39 | agent-guided-completion/production-deep-choosenstep-continuation.pickInnerDecision/deep preview-drive selected a non-chooseNStep continuation decision:39 | 0 | 0 | 0 |
| coupArvnRedeployOptionalTroops:chooseOne | 39 | 2052.63 | 52.6315 | 146.0469 | 148.5718 | 8 | 0 | 2681 | 383 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| govern | 9 | 1387.56 | 154.1739 | 603.8083 | 603.8083 | 10.5556 | 9 | 0 | 0 | 9 | 8 | 0 | 12 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:12 | 3 | 0 | 9 |
| coupArvnRedeployMandatory:chooseOne | 10 | 727.85 | 72.7849 | 128.8273 | 128.8273 | 8 | 0 | 1078 | 154 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally | 18 | 557.53 | 30.9737 | 116.5815 | 116.5815 | 38.9444 | 18 | 0 | 0 | 18 | 4 | 0 | 36 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:36 | 0 | 0 | 18 |
| assault:chooseNStep:add | 6 | 495.51 | 82.5852 | 143.8175 | 143.8175 | 3 | 0 | 66 | 84 | 0 | 0 | 2 | 13 | agent-guided-completion/production-deep-choosenstep-continuation.pickInnerDecision/deep preview-drive selected a non-chooseNStep continuation decision:13 | 0 | 82 | 0 |
| train | 5 | 386.7 | 77.3405 | 176.0338 | 176.0338 | 9.4 | 5 | 0 | 0 | 5 | 0 | 0 | 10 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:10 | 0 | 0 | 5 |
| transport:chooseOne | 6 | 379.07 | 63.179 | 92.1517 | 92.1517 | 12.3333 | 0 | 239 | 14 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| assault:chooseNStep:confirm | 7 | 300.04 | 42.8629 | 92.2202 | 92.2202 | 3.4286 | 0 | 43 | 38 | 0 | 0 | 0 | 10 | agent-guided-completion/production-deep-choosenstep-continuation.pickInnerDecision/deep preview-drive selected a non-chooseNStep continuation decision:9; unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:1 | 0 | 36 | 0 |
| transport | 3 | 171.58 | 57.193 | 66.277 | 66.277 | 10.6667 | 3 | 0 | 0 | 3 | 0 | 0 | 6 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:6 | 0 | 0 | 3 |
| train:chooseOne | 9 | 63.2 | 7.0225 | 11.3984 | 11.3984 | 2.2222 | 0 | 30 | 34 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| coupArvnRedeployPolice | 26 | 54.22 | 2.0853 | 2.8394 | 2.8686 | 6.1923 | 26 | 0 | 0 | 26 | 0 | 0 | 21 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:21 | 26 | 0 | 26 |
| attack | 12 | 47.5 | 3.9585 | 9.2817 | 9.2817 | 54.5 | 9 | 0 | 3 | 9 | 0 | 0 | 0 |  | 12 | 0 | 9 |
| coupRedeployPass | 20 | 38.37 | 1.9187 | 3.1827 | 3.2142 | 1 | 13 | 0 | 7 | 13 | 0 | 0 | 0 |  | 20 | 0 | 13 |
| coupArvnRedeployOptionalTroops | 16 | 37.15 | 2.3219 | 4.3056 | 4.3056 | 9.6875 | 12 | 0 | 4 | 12 | 0 | 0 | 12 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:12 | 16 | 0 | 12 |
| ambushVc | 11 | 34.66 | 3.1511 | 4.1334 | 4.1334 | 51 | 10 | 0 | 1 | 10 | 0 | 0 | 0 |  | 11 | 0 | 10 |
| coupNvaRedeployTroops | 18 | 33.92 | 1.8846 | 3.5061 | 3.5061 | 3.8333 | 14 | 0 | 4 | 14 | 0 | 0 | 14 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:14 | 18 | 0 | 14 |
| ambushNva | 2 | 33.48 | 16.7403 | 25.4053 | 25.4053 | 103.5 | 1 | 0 | 1 | 1 | 0 | 0 | 1 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:1 | 1 | 0 | 1 |
| coupCommitmentPass | 20 | 33.32 | 1.666 | 2.5514 | 3.7685 | 1.25 | 0 | 0 | 20 | 0 | 0 | 0 | 0 |  | 20 | 0 | 0 |
| assault | 16 | 33.07 | 2.0669 | 3.834 | 3.834 | 9 | 14 | 0 | 2 | 14 | 0 | 0 | 11 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:11 | 16 | 0 | 14 |
| govern:chooseOne | 9 | 29.89 | 3.3207 | 4.0715 | 4.0715 | 2 | 0 | 9 | 9 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate | 4 | 26.25 | 6.5621 | 9.1466 | 9.1466 | 94.25 | 2 | 0 | 2 | 2 | 0 | 0 | 0 |  | 4 | 0 | 2 |
| pass | 6 | 21.6 | 3.6006 | 4.6046 | 4.6046 | 3.6667 | 6 | 0 | 0 | 6 | 0 | 0 | 0 |  | 6 | 0 | 6 |
| coupPacifyPass | 10 | 20.82 | 2.0818 | 3.6334 | 3.6334 | 1.3 | 7 | 0 | 3 | 7 | 0 | 0 | 0 |  | 10 | 0 | 7 |
| coupPacifyARVN | 8 | 18.88 | 2.3604 | 3.4859 | 3.4859 | 4.375 | 6 | 0 | 2 | 6 | 0 | 0 | 5 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:5 | 8 | 0 | 6 |
| march | 5 | 16.73 | 3.3467 | 5.0913 | 5.0913 | 33.4 | 3 | 0 | 2 | 3 | 0 | 0 | 0 |  | 5 | 0 | 3 |
| advise | 5 | 11.87 | 2.3746 | 2.7632 | 2.7632 | 9.6 | 3 | 0 | 2 | 3 | 0 | 0 | 0 |  | 5 | 0 | 3 |
| coupVictoryCheck | 5 | 11.27 | 2.2533 | 3.053 | 3.053 | 1 | 5 | 0 | 0 | 5 | 0 | 0 | 0 |  | 5 | 0 | 5 |
| coupResourcesResolve | 5 | 10.99 | 2.1972 | 3.2083 | 3.2083 | 1 | 0 | 0 | 5 | 0 | 0 | 0 | 0 |  | 5 | 0 | 0 |
| coupAgitatePass | 5 | 7.88 | 1.5765 | 1.8011 | 1.8011 | 6.6 | 0 | 0 | 5 | 0 | 0 | 0 | 0 |  | 5 | 0 | 0 |
| chooseOne:chooseOne | 3 | 6.81 | 2.2708 | 6.1777 | 6.1777 | 6.3333 | 0 | 3 | 1 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| coupArvnRedeployMandatory | 2 | 4.31 | 2.1541 | 2.7872 | 2.7872 | 10.5 | 1 | 0 | 1 | 1 | 0 | 0 | 1 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:1 | 2 | 0 | 1 |
| airStrike | 1 | 3.89 | 3.8937 | 3.8937 | 3.8937 | 2 | 1 | 0 | 0 | 1 | 0 | 0 | 0 |  | 1 | 0 | 1 |
| coupNvaRedeployTroops:chooseOne | 68 | 2.46 | 0.0362 | 0.0519 | 0.0606 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| event-decision:chooseNStep:add | 39 | 1.41 | 0.0361 | 0.0574 | 0.0617 | 16.1538 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally:chooseNStep:add | 18 | 1.16 | 0.0642 | 0.2337 | 0.2337 | 25.6111 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally:chooseNStep:confirm | 29 | 0.97 | 0.0335 | 0.0592 | 0.0895 | 22.4828 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| event-decision:chooseNStep:confirm | 28 | 0.73 | 0.0261 | 0.0357 | 0.0454 | 6.9286 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| event-decision:chooseOne | 22 | 0.72 | 0.0327 | 0.0466 | 0.0512 | 3.5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally:chooseOne | 18 | 0.49 | 0.0272 | 0.0555 | 0.0555 | 1.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushVc:chooseNStep:add | 12 | 0.47 | 0.039 | 0.0472 | 0.0472 | 3.6667 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| march:chooseNStep:confirm | 13 | 0.37 | 0.0283 | 0.0382 | 0.0382 | 4.6923 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| advise:chooseOne | 10 | 0.33 | 0.0326 | 0.0453 | 0.0453 | 2.4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| march:chooseNStep:add | 5 | 0.33 | 0.0664 | 0.0675 | 0.0675 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushVc:chooseNStep:confirm | 12 | 0.32 | 0.0264 | 0.0442 | 0.0442 | 4.5833 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| advise:chooseNStep:add | 5 | 0.29 | 0.0581 | 0.0817 | 0.0817 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushVc:chooseOne | 11 | 0.22 | 0.0204 | 0.0222 | 0.0222 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| advise:chooseNStep:confirm | 5 | 0.17 | 0.033 | 0.0424 | 0.0424 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate:chooseNStep:add | 4 | 0.17 | 0.0417 | 0.0426 | 0.0426 | 7.25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate:chooseNStep:confirm | 6 | 0.17 | 0.0278 | 0.0431 | 0.0431 | 6.8333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate:chooseOne | 6 | 0.16 | 0.0274 | 0.045 | 0.045 | 1.5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushNva:chooseOne | 2 | 0.06 | 0.0305 | 0.0323 | 0.0323 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| chooseNStep:chooseNStep:confirm | 2 | 0.06 | 0.0323 | 0.0337 | 0.0337 | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| airStrike:chooseOne | 1 | 0.04 | 0.0369 | 0.0369 | 0.0369 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| airStrike:chooseNStep:confirm | 1 | 0.03 | 0.0307 | 0.0307 | 0.0307 | 9 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |

## Top Hot Axes In Slow-Tier Seeds

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.

| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms |
|---:|---|---|---:|---:|---:|---:|---:|
| 1 | coupArvnRedeployPolice:chooseOne | continuedDeepening | 66 | 39805.08 | 603.1073 | 1959.3767 | 2521.5342 |
| 2 | train:chooseNStep:add | continuedDeepening | 11 | 16338.26 | 1485.2961 | 3088.8625 | 3088.8625 |
| 3 | train:chooseNStep:confirm | continuedDeepening | 12 | 11225.5 | 935.4579 | 2987.5333 | 2987.5333 |
| 4 | govern:chooseNStep:confirm | continuedDeepening | 6 | 7597.31 | 1266.2178 | 6579.8993 | 6579.8993 |
| 5 | event | singlePass | 48 | 4437.07 | 92.439 | 477.0197 | 1767.5646 |
| 6 | govern:chooseNStep:add | continuedDeepening | 6 | 3943.59 | 657.2652 | 2789.1889 | 2789.1889 |
| 7 | coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | 39 | 2052.63 | 52.6315 | 146.0469 | 148.5718 |
| 8 | govern | singlePass | 6 | 1375.29 | 229.2148 | 603.8083 | 603.8083 |
| 9 | coupArvnRedeployMandatory:chooseOne | continuedDeepening | 10 | 727.85 | 72.7849 | 128.8273 | 128.8273 |
| 10 | rally | singlePass | 18 | 557.53 | 30.9737 | 116.5815 | 116.5815 |

## Hot-Path Buckets For Top Slow Axes

Captured only when `--profile-buckets` is enabled. Buckets are timing/count diagnostics inside `PolicyAgent.chooseDecision`; they are not correctness assertions.

### coupArvnRedeployPolice:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 1633342 | 6410.68 |
| evalQuery:countMatchingTokens | 1738266 | 2497.73 |
| zobrist:digestDecisionStackFrame | 1052 | 55.52 |
| zobrist:encodeDecisionStackFrame | 1052 | 50.07 |
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
| zobrist:digestDecisionStackFrame | 20128 | 3410.71 |
| zobrist:encodeDecisionStackFrame | 21059 | 1946.57 |
| tokenStateIndex:refreshCachedEntries | 19885 | 307.68 |
| evalQuery:applyTokenFilter | 8906 | 24.5 |
| evalQuery:countMatchingTokens | 11727 | 18.88 |
| tokenStateIndex:build | 388 | 11.85 |
| evalQuery:applyTokenFilterCacheHit | 20424 | 0 |
| evalQuery:applyTokenFilterCompiled | 8906 | 0 |
| evalQuery:countMatchingTokensCacheHit | 2010742 | 0 |
| evalQuery:countMatchingTokensCompiled | 11727 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 5421379 | 0 |
| tokenStateIndex:getCacheHit | 29600 | 0 |

### train:chooseNStep:confirm | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 12646 | 2222.02 |
| zobrist:encodeDecisionStackFrame | 13628 | 1330.51 |
| tokenStateIndex:refreshCachedEntries | 14324 | 219.2 |
| evalQuery:applyTokenFilter | 4528 | 13.56 |
| tokenStateIndex:build | 386 | 11.72 |
| evalQuery:countMatchingTokens | 6232 | 11.36 |
| evalQuery:applyTokenFilterCacheHit | 20714 | 0 |
| evalQuery:applyTokenFilterCompiled | 4528 | 0 |
| evalQuery:countMatchingTokensCacheHit | 1690423 | 0 |
| evalQuery:countMatchingTokensCompiled | 6232 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 4573840 | 0 |
| tokenStateIndex:getCacheHit | 20141 | 0 |

### govern:chooseNStep:confirm | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 20945 | 325.08 |
| evalQuery:applyTokenFilter | 170131 | 212.69 |
| zobrist:encodeDecisionStackFrame | 264 | 11.27 |
| zobrist:digestDecisionStackFrame | 162 | 8.24 |
| evalQuery:countMatchingTokens | 4146 | 4.26 |
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
| evalQuery:applyTokenFilter | 38842 | 186.61 |
| tokenStateIndex:refreshCachedEntries | 8005 | 142.07 |
| zobrist:digestDecisionStackFrame | 454 | 78.07 |
| evalQuery:countMatchingTokens | 76561 | 66.38 |
| zobrist:encodeDecisionStackFrame | 454 | 48.28 |
| policyWasmRuntime:encodeBytecodeInput | 512 | 12.27 |
| evalQuery:applyTokenFilterCacheHit | 4771 | 0 |
| evalQuery:applyTokenFilterCompiled | 18774 | 0 |
| evalQuery:countMatchingTokensCacheHit | 696383 | 0 |
| evalQuery:countMatchingTokensCompiled | 3176 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1550195 | 0 |
| policyWasmRuntime:encodedInputCacheMiss | 512 | 0 |

### govern:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 8712 | 128.69 |
| evalQuery:applyTokenFilter | 71016 | 84.31 |
| zobrist:encodeDecisionStackFrame | 987 | 38.25 |
| zobrist:digestDecisionStackFrame | 792 | 36.58 |
| evalQuery:countMatchingTokens | 2564 | 2.57 |
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
| tokenStateIndex:refreshCachedEntries | 55920 | 276.12 |
| evalQuery:countMatchingTokens | 74344 | 72.81 |
| zobrist:encodeDecisionStackFrame | 96 | 3.91 |
| zobrist:digestDecisionStackFrame | 96 | 3.59 |
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
| evalQuery:applyTokenFilter | 20816 | 43.36 |
| tokenStateIndex:refreshCachedEntries | 2443 | 38.71 |
| zobrist:digestDecisionStackFrame | 158 | 17.02 |
| zobrist:encodeDecisionStackFrame | 158 | 11.2 |
| evalQuery:countMatchingTokens | 4354 | 6.02 |
| policyWasmRuntime:encodeBytecodeInput | 48 | 1.36 |
| evalQuery:applyTokenFilterCacheHit | 4771 | 0 |
| evalQuery:applyTokenFilterCompiled | 15193 | 0 |
| evalQuery:countMatchingTokensCacheHit | 112448 | 0 |
| evalQuery:countMatchingTokensCompiled | 688 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 236416 | 0 |
| policyWasmRuntime:encodedInputCacheMiss | 48 | 0 |

### coupArvnRedeployMandatory:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 22764 | 105.6 |
| evalQuery:countMatchingTokens | 32131 | 32.16 |
| zobrist:encodeDecisionStackFrame | 32 | 1.27 |
| zobrist:digestDecisionStackFrame | 32 | 1.17 |
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
| tokenStateIndex:refreshCachedEntries | 1668 | 23.04 |
| evalQuery:applyTokenFilter | 1385 | 17.4 |
| zobrist:digestDecisionStackFrame | 100 | 7.18 |
| evalQuery:countMatchingTokens | 8001 | 6.98 |
| zobrist:encodeDecisionStackFrame | 100 | 5.06 |
| policyWasmRuntime:encodeBytecodeInput | 72 | 2.64 |
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
