# FITL ARVN 15-Seed Per-Microturn-Class Decomposition

**Date**: 2026-05-16-phase-4f-non-choosenstep-continuation-final
**Status**: Spec 173 measurement witness.
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005 --timeout-ms 400000 --date 2026-05-16-phase-4f-non-choosenstep-continuation-final --profile-buckets`
**CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4f-non-choosenstep-continuation-final.csv`

## Summary

- Seeds completed: 1/1
- Per-decision rows: 790
- Hot class with slow:fast ratio >3x: no
- Per-seed timeout: 400000 ms
- Hot-path buckets: enabled
- WASM production preview-drive route count: 310
- WASM production preview-drive unsupported count: 221
- WASM production preview-drive batch count: 199

## Per-Seed Wall Time

| Seed | Status | Stop Reason | Wall ms | Decisions | ms/decision | Error |
|---:|---|---|---:|---:|---:|---|
| 1005 | OK | terminal | 63872.98 | 790 | 80.8519 |  |

## Per-Microturn-Class Rollup

| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | WASM preview-drive routes | WASM preview-drive unsupported | WASM preview-drive unsupported reasons | WASM preview-drive batches | Token index builds | Static rebuilds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|
| train:chooseNStep:add | 11 | 16401.44 | 1491.0396 | 2987.9312 | 2987.9312 | 14.4545 | 0 | 4458 | 9355 | 0 | 0 | 145 | 5 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:5 | 0 | 1347 | 0 |
| train:chooseNStep:confirm | 15 | 11149.88 | 743.3253 | 2813.9397 | 2813.9397 | 8.7333 | 0 | 2921 | 5871 | 0 | 0 | 102 | 3 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:3 | 0 | 523 | 0 |
| coupArvnRedeployPolice:chooseOne | 66 | 8211.05 | 124.4099 | 271.0541 | 316.0805 | 26.7121 | 0 | 60935 | 2466 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| govern:chooseNStep:confirm | 6 | 7478.71 | 1246.4514 | 6475.0499 | 6475.0499 | 7.5 | 0 | 159 | 72 | 0 | 0 | 0 | 33 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:33 | 0 | 0 | 0 |
| event | 48 | 4112.92 | 85.6859 | 463.6803 | 1802.7317 | 28.6667 | 48 | 0 | 0 | 48 | 22 | 0 | 50 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:50 | 0 | 0 | 50 |
| govern:chooseNStep:add | 6 | 4063.41 | 677.2358 | 3100.8079 | 3100.8079 | 6.5 | 0 | 189 | 324 | 0 | 0 | 39 | 0 |  | 0 | 13347 | 0 |
| govern | 9 | 1316.5 | 146.2782 | 595.6897 | 595.6897 | 10.5556 | 9 | 0 | 0 | 9 | 8 | 0 | 12 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:12 | 3 | 0 | 9 |
| coupArvnRedeployOptionalTroops:chooseOne | 39 | 799.36 | 20.4963 | 36.8445 | 40.6925 | 8 | 0 | 2681 | 383 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally | 18 | 507.47 | 28.1927 | 108.8594 | 108.8594 | 38.9444 | 18 | 0 | 0 | 18 | 4 | 0 | 36 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:36 | 0 | 0 | 18 |
| assault:chooseNStep:add | 6 | 395.52 | 65.9207 | 116.0255 | 116.0255 | 3 | 0 | 53 | 71 | 0 | 0 | 15 | 0 |  | 0 | 449 | 0 |
| train | 5 | 315.14 | 63.0285 | 152.6394 | 152.6394 | 9.4 | 5 | 0 | 0 | 5 | 0 | 0 | 10 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:10 | 0 | 0 | 5 |
| assault:chooseNStep:confirm | 7 | 245.51 | 35.0723 | 75.3368 | 75.3368 | 3.4286 | 0 | 34 | 29 | 0 | 0 | 9 | 1 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:1 | 0 | 278 | 0 |
| coupArvnRedeployMandatory:chooseOne | 10 | 229.74 | 22.9742 | 32.488 | 32.488 | 8 | 0 | 1078 | 154 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| transport:chooseOne | 6 | 214.12 | 35.6872 | 53.701 | 53.701 | 12.3333 | 0 | 239 | 14 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| transport | 3 | 135.07 | 45.0225 | 52.6538 | 52.6538 | 10.6667 | 3 | 0 | 0 | 3 | 0 | 0 | 6 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:6 | 0 | 0 | 3 |
| coupArvnRedeployPolice | 26 | 59.52 | 2.2893 | 3.8789 | 4.1129 | 6.1923 | 26 | 0 | 0 | 26 | 0 | 0 | 21 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:21 | 26 | 0 | 26 |
| train:chooseOne | 9 | 51.52 | 5.7249 | 7.86 | 7.86 | 2.2222 | 0 | 30 | 34 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| attack | 12 | 42.45 | 3.5378 | 9.891 | 9.891 | 54.5 | 9 | 0 | 3 | 9 | 0 | 0 | 0 |  | 12 | 0 | 9 |
| coupRedeployPass | 20 | 38 | 1.9 | 2.6225 | 3.5771 | 1 | 13 | 0 | 7 | 13 | 0 | 0 | 0 |  | 20 | 0 | 13 |
| coupArvnRedeployOptionalTroops | 16 | 36.43 | 2.277 | 3.6829 | 3.6829 | 9.6875 | 12 | 0 | 4 | 12 | 0 | 0 | 12 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:12 | 16 | 0 | 12 |
| ambushVc | 11 | 36.4 | 3.3088 | 4.9772 | 4.9772 | 51 | 10 | 0 | 1 | 10 | 0 | 0 | 0 |  | 11 | 0 | 10 |
| coupNvaRedeployTroops | 18 | 36.22 | 2.0122 | 4.0903 | 4.0903 | 3.8333 | 14 | 0 | 4 | 14 | 0 | 0 | 14 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:14 | 18 | 0 | 14 |
| ambushNva | 2 | 34.7 | 17.352 | 26.0941 | 26.0941 | 103.5 | 1 | 0 | 1 | 1 | 0 | 0 | 1 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:1 | 1 | 0 | 1 |
| assault | 16 | 33.36 | 2.0851 | 4.094 | 4.094 | 9 | 14 | 0 | 2 | 14 | 0 | 0 | 11 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:11 | 16 | 0 | 14 |
| coupCommitmentPass | 20 | 30.82 | 1.5408 | 3.2207 | 3.2449 | 1.25 | 0 | 0 | 20 | 0 | 0 | 0 | 0 |  | 20 | 0 | 0 |
| govern:chooseOne | 9 | 27.53 | 3.0586 | 3.7762 | 3.7762 | 2 | 0 | 9 | 9 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate | 4 | 23.9 | 5.9748 | 8.7395 | 8.7395 | 94.25 | 2 | 0 | 2 | 2 | 0 | 0 | 0 |  | 4 | 0 | 2 |
| coupPacifyARVN | 8 | 19.45 | 2.4312 | 3.679 | 3.679 | 4.375 | 6 | 0 | 2 | 6 | 0 | 0 | 5 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:5 | 8 | 0 | 6 |
| coupPacifyPass | 10 | 18.97 | 1.8973 | 3.37 | 3.37 | 1.3 | 7 | 0 | 3 | 7 | 0 | 0 | 0 |  | 10 | 0 | 7 |
| march | 5 | 17.47 | 3.4938 | 6.142 | 6.142 | 33.4 | 3 | 0 | 2 | 3 | 0 | 0 | 0 |  | 5 | 0 | 3 |
| pass | 6 | 17.37 | 2.8957 | 3.8695 | 3.8695 | 3.6667 | 6 | 0 | 0 | 6 | 0 | 0 | 0 |  | 6 | 0 | 6 |
| advise | 5 | 16.5 | 3.2996 | 5.6089 | 5.6089 | 9.6 | 3 | 0 | 2 | 3 | 0 | 0 | 0 |  | 5 | 0 | 3 |
| coupResourcesResolve | 5 | 12.18 | 2.4364 | 3.5779 | 3.5779 | 1 | 0 | 0 | 5 | 0 | 0 | 0 | 0 |  | 5 | 0 | 0 |
| coupVictoryCheck | 5 | 11.62 | 2.3247 | 3.3679 | 3.3679 | 1 | 5 | 0 | 0 | 5 | 0 | 0 | 0 |  | 5 | 0 | 5 |
| coupAgitatePass | 5 | 10.67 | 2.1349 | 4.2548 | 4.2548 | 6.6 | 0 | 0 | 5 | 0 | 0 | 0 | 0 |  | 5 | 0 | 0 |
| chooseOne:chooseOne | 3 | 5.46 | 1.8205 | 4.8683 | 4.8683 | 6.3333 | 0 | 3 | 1 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| coupArvnRedeployMandatory | 2 | 5.09 | 2.5436 | 3.6565 | 3.6565 | 10.5 | 1 | 0 | 1 | 1 | 0 | 0 | 1 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:1 | 2 | 0 | 1 |
| airStrike | 1 | 2.13 | 2.1316 | 2.1316 | 2.1316 | 2 | 1 | 0 | 0 | 1 | 0 | 0 | 0 |  | 1 | 0 | 1 |
| coupNvaRedeployTroops:chooseOne | 68 | 2.09 | 0.0307 | 0.0443 | 0.0597 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| event-decision:chooseNStep:add | 39 | 1.17 | 0.03 | 0.052 | 0.0574 | 16.1538 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally:chooseNStep:add | 18 | 1 | 0.0554 | 0.0958 | 0.0958 | 25.6111 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally:chooseNStep:confirm | 29 | 0.91 | 0.0312 | 0.0524 | 0.1153 | 22.4828 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| event-decision:chooseNStep:confirm | 28 | 0.64 | 0.023 | 0.0376 | 0.0462 | 6.9286 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| event-decision:chooseOne | 22 | 0.64 | 0.0289 | 0.0537 | 0.058 | 3.5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally:chooseOne | 18 | 0.62 | 0.0346 | 0.1649 | 0.1649 | 1.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushVc:chooseNStep:add | 12 | 0.51 | 0.0421 | 0.0632 | 0.0632 | 3.6667 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| advise:chooseNStep:add | 5 | 0.37 | 0.0732 | 0.1622 | 0.1622 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| march:chooseNStep:add | 5 | 0.34 | 0.0675 | 0.0884 | 0.0884 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| march:chooseNStep:confirm | 13 | 0.34 | 0.0258 | 0.0349 | 0.0349 | 4.6923 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| advise:chooseOne | 10 | 0.29 | 0.0292 | 0.0448 | 0.0448 | 2.4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushVc:chooseNStep:confirm | 12 | 0.28 | 0.0237 | 0.0374 | 0.0374 | 4.5833 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushVc:chooseOne | 11 | 0.2 | 0.0184 | 0.0208 | 0.0208 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate:chooseNStep:add | 4 | 0.2 | 0.0504 | 0.0559 | 0.0559 | 7.25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| advise:chooseNStep:confirm | 5 | 0.17 | 0.0346 | 0.0522 | 0.0522 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate:chooseNStep:confirm | 6 | 0.16 | 0.0267 | 0.0356 | 0.0356 | 6.8333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate:chooseOne | 6 | 0.16 | 0.0269 | 0.0449 | 0.0449 | 1.5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushNva:chooseOne | 2 | 0.06 | 0.032 | 0.0327 | 0.0327 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| chooseNStep:chooseNStep:confirm | 2 | 0.06 | 0.0295 | 0.0301 | 0.0301 | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| airStrike:chooseOne | 1 | 0.04 | 0.0426 | 0.0426 | 0.0426 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| airStrike:chooseNStep:confirm | 1 | 0.03 | 0.0317 | 0.0317 | 0.0317 | 9 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |

## Top Hot Axes In Slow-Tier Seeds

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.

| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms |
|---:|---|---|---:|---:|---:|---:|---:|
| 1 | train:chooseNStep:add | continuedDeepening | 11 | 16401.44 | 1491.0396 | 2987.9312 | 2987.9312 |
| 2 | train:chooseNStep:confirm | continuedDeepening | 12 | 11149.62 | 929.1354 | 2813.9397 | 2813.9397 |
| 3 | coupArvnRedeployPolice:chooseOne | continuedDeepening | 66 | 8211.05 | 124.4099 | 271.0541 | 316.0805 |
| 4 | govern:chooseNStep:confirm | continuedDeepening | 6 | 7478.71 | 1246.4514 | 6475.0499 | 6475.0499 |
| 5 | event | singlePass | 48 | 4112.92 | 85.6859 | 463.6803 | 1802.7317 |
| 6 | govern:chooseNStep:add | continuedDeepening | 6 | 4063.41 | 677.2358 | 3100.8079 | 3100.8079 |
| 7 | govern | singlePass | 6 | 1304.5 | 217.4171 | 595.6897 | 595.6897 |
| 8 | coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | 39 | 799.36 | 20.4963 | 36.8445 | 40.6925 |
| 9 | rally | singlePass | 18 | 507.47 | 28.1927 | 108.8594 | 108.8594 |
| 10 | assault:chooseNStep:add | continuedDeepening | 5 | 395.41 | 79.0818 | 116.0255 | 116.0255 |

## Hot-Path Buckets For Top Slow Axes

Captured only when `--profile-buckets` is enabled. Buckets are timing/count diagnostics inside `PolicyAgent.chooseDecision`; they are not correctness assertions.

### train:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 20128 | 3407.66 |
| zobrist:encodeDecisionStackFrame | 20344 | 1895.33 |
| tokenStateIndex:refreshCachedEntries | 8783 | 144.36 |
| tokenStateIndex:build | 1347 | 42.86 |
| evalQuery:applyTokenFilter | 4636 | 17.03 |
| evalQuery:countMatchingTokens | 7500 | 13.07 |
| evalQuery:applyTokenFilterCacheHit | 8929 | 0 |
| evalQuery:applyTokenFilterCompiled | 4636 | 0 |
| evalQuery:countMatchingTokensCacheHit | 975870 | 0 |
| evalQuery:countMatchingTokensCompiled | 7500 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 2335706 | 0 |
| tokenStateIndex:getCacheHit | 16029 | 0 |

### train:chooseNStep:confirm | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 12646 | 2224.01 |
| zobrist:encodeDecisionStackFrame | 13158 | 1287.08 |
| tokenStateIndex:refreshCachedEntries | 6279 | 103.87 |
| tokenStateIndex:build | 523 | 14.94 |
| evalQuery:countMatchingTokens | 3549 | 7.57 |
| evalQuery:applyTokenFilter | 1718 | 5.34 |
| evalQuery:applyTokenFilterCacheHit | 7183 | 0 |
| evalQuery:applyTokenFilterCompiled | 1718 | 0 |
| evalQuery:countMatchingTokensCacheHit | 678867 | 0 |
| evalQuery:countMatchingTokensCompiled | 3549 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1661752 | 0 |
| tokenStateIndex:getCacheHit | 10831 | 0 |

### coupArvnRedeployPolice:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 151922 | 1498.82 |
| evalQuery:countMatchingTokens | 173662 | 215.29 |
| zobrist:digestDecisionStackFrame | 1052 | 55.35 |
| zobrist:encodeDecisionStackFrame | 1052 | 45.41 |
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
| tokenStateIndex:refreshCachedEntries | 20945 | 322.13 |
| evalQuery:applyTokenFilter | 170131 | 200.23 |
| zobrist:encodeDecisionStackFrame | 264 | 10.19 |
| zobrist:digestDecisionStackFrame | 162 | 8.25 |
| evalQuery:countMatchingTokens | 4146 | 4.7 |
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
| evalQuery:applyTokenFilter | 36802 | 167.57 |
| tokenStateIndex:refreshCachedEntries | 7504 | 139.15 |
| zobrist:digestDecisionStackFrame | 454 | 78.56 |
| evalQuery:countMatchingTokens | 74915 | 61.83 |
| zobrist:encodeDecisionStackFrame | 454 | 48.72 |
| policyWasmRuntime:encodeBytecodeInput | 512 | 14.24 |
| evalQuery:applyTokenFilterCacheHit | 3387 | 0 |
| evalQuery:applyTokenFilterCompiled | 17036 | 0 |
| evalQuery:countMatchingTokensCacheHit | 453345 | 0 |
| evalQuery:countMatchingTokensCompiled | 3034 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1136254 | 0 |
| policyWasmRuntime:encodedInputCacheMiss | 512 | 0 |

### govern:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:build | 13347 | 348.39 |
| evalQuery:applyTokenFilter | 71016 | 92.88 |
| zobrist:digestDecisionStackFrame | 792 | 35.97 |
| zobrist:encodeDecisionStackFrame | 792 | 27.61 |
| tokenStateIndex:refreshCachedEntries | 8712 | 22.82 |
| evalQuery:countMatchingTokens | 2564 | 2.7 |
| evalQuery:applyTokenFilterCacheHit | 4281 | 0 |
| evalQuery:applyTokenFilterCompiled | 71016 | 0 |
| evalQuery:countMatchingTokensCacheHit | 251025 | 0 |
| evalQuery:countMatchingTokensCompiled | 2564 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 532458 | 0 |
| tokenStateIndex:getCacheHit | 15083 | 0 |

### govern | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 2175 | 33.9 |
| evalQuery:applyTokenFilter | 20013 | 29.52 |
| zobrist:digestDecisionStackFrame | 158 | 17.29 |
| zobrist:encodeDecisionStackFrame | 158 | 11.28 |
| evalQuery:countMatchingTokens | 2828 | 2.67 |
| policyWasmRuntime:encodeBytecodeInput | 48 | 1.27 |
| evalQuery:applyTokenFilterCacheHit | 3305 | 0 |
| evalQuery:applyTokenFilterCompiled | 14614 | 0 |
| evalQuery:countMatchingTokensCacheHit | 83034 | 0 |
| evalQuery:countMatchingTokensCompiled | 666 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 182126 | 0 |
| policyWasmRuntime:encodedInputCacheMiss | 48 | 0 |

### coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 10352 | 103.1 |
| evalQuery:countMatchingTokens | 16904 | 15.36 |
| zobrist:digestDecisionStackFrame | 96 | 3.46 |
| zobrist:encodeDecisionStackFrame | 96 | 2.85 |
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
| tokenStateIndex:refreshCachedEntries | 1400 | 19.84 |
| evalQuery:countMatchingTokens | 7907 | 7.78 |
| zobrist:digestDecisionStackFrame | 100 | 7.28 |
| policyWasmRuntime:encodeBytecodeInput | 72 | 5.01 |
| zobrist:encodeDecisionStackFrame | 100 | 4.95 |
| evalQuery:applyTokenFilter | 993 | 3.47 |
| evalQuery:applyTokenFilterCacheHit | 1129 | 0 |
| evalQuery:applyTokenFilterCompiled | 772 | 0 |
| evalQuery:countMatchingTokensCacheHit | 180046 | 0 |
| evalQuery:countMatchingTokensCompiled | 2008 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 439567 | 0 |
| policyWasmRuntime:encodedInputCacheMiss | 72 | 0 |

### assault:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 188 | 28.14 |
| zobrist:encodeDecisionStackFrame | 188 | 14.95 |
| tokenStateIndex:build | 449 | 11.16 |
| tokenStateIndex:refreshCachedEntries | 989 | 6.96 |
| evalQuery:applyTokenFilter | 930 | 5.78 |
| evalQuery:countMatchingTokens | 1879 | 1.47 |
| evalQuery:applyTokenFilterCacheHit | 656 | 0 |
| evalQuery:applyTokenFilterCompiled | 831 | 0 |
| evalQuery:countMatchingTokensCacheHit | 108976 | 0 |
| evalQuery:countMatchingTokensCompiled | 1879 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 267289 | 0 |
| tokenStateIndex:getCacheHit | 12017 | 0 |


## WASM Preview-Drive Unsupported Reasons

| Microturn class | Unsupported class | Unsupported owner | Reason | Count | Class unsupported total | Class route total |
|---|---|---|---|---:|---:|---:|
| event | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 50 | 50 | 0 |
| rally | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 36 | 36 | 0 |
| govern:chooseNStep:confirm | unknown | production-deep-choosenstep-continuation.projectedState | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 33 | 33 | 0 |
| coupArvnRedeployPolice | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 21 | 21 | 0 |
| coupNvaRedeployTroops | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 14 | 14 | 0 |
| coupArvnRedeployOptionalTroops | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 12 | 12 | 0 |
| govern | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 12 | 12 | 0 |
| assault | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 11 | 11 | 0 |
| train | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 10 | 10 | 0 |
| transport | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 6 | 6 | 0 |
| coupPacifyARVN | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 5 | 5 | 0 |
| train:chooseNStep:add | unknown | production-deep-choosenstep-continuation.projectedState | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 5 | 5 | 145 |
| train:chooseNStep:confirm | unknown | production-deep-choosenstep-continuation.projectedState | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 3 | 3 | 102 |
| ambushNva | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 1 | 1 | 0 |
| assault:chooseNStep:confirm | unknown | production-deep-choosenstep-continuation.projectedState | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 1 | 1 | 9 |
| coupArvnRedeployMandatory | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 1 | 1 | 0 |

## Fast-Tier vs Slow-Tier Delta

Fast tier: `1000`, `1006`, `1007`, `1010`, `1014`. Rows with ratio greater than `3.0` satisfy the Phase 0 hot-axis criterion.

| Microturn class | Slow decisions | Fast decisions | Slow mean ms | Fast mean ms | Slow:fast ratio | Verdict |
|---|---:|---:|---:|---:|---:|---|

## Notes

- `elapsedMs` is measured around the per-decision `PolicyAgent.chooseDecision` call. It excludes simulator apply/delta work and report rendering.
- Child processes enforce the per-seed timeout. Each child loads the built engine and production FITL GameSpecDoc, using the repo GameDef cache when available.
- The script does not modify engine source or production profile data.
