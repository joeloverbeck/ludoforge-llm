# FITL ARVN 15-Seed Per-Microturn-Class Decomposition

**Date**: 2026-05-16-phase-4g-decision-stack-digest-cost-final
**Status**: Spec 173 measurement witness.
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005 --timeout-ms 400000 --date 2026-05-16-phase-4g-decision-stack-digest-cost-final --profile-buckets`
**CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4g-decision-stack-digest-cost-final.csv`

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
| 1005 | OK | terminal | 59610.96 | 790 | 75.4569 |  |

## Per-Microturn-Class Rollup

| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | WASM preview-drive routes | WASM preview-drive unsupported | WASM preview-drive unsupported reasons | WASM preview-drive batches | Token index builds | Static rebuilds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|
| train:chooseNStep:add | 11 | 15115.11 | 1374.1006 | 2814.9944 | 2814.9944 | 14.4545 | 0 | 4458 | 9355 | 0 | 0 | 145 | 5 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:5 | 0 | 0 | 0 |
| train:chooseNStep:confirm | 15 | 9993.24 | 666.2161 | 2578.7723 | 2578.7723 | 8.7333 | 0 | 2921 | 5871 | 0 | 0 | 102 | 3 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:3 | 0 | 0 | 0 |
| coupArvnRedeployPolice:chooseOne | 66 | 7720.47 | 116.9768 | 262.4963 | 270.9433 | 26.7121 | 0 | 60935 | 2466 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| govern:chooseNStep:confirm | 6 | 7346.83 | 1224.4718 | 6344.5525 | 6344.5525 | 7.5 | 0 | 159 | 72 | 0 | 0 | 0 | 33 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:33 | 0 | 0 | 0 |
| event | 48 | 3892.21 | 81.0876 | 444.1872 | 1660.9391 | 28.6667 | 48 | 0 | 0 | 48 | 22 | 0 | 50 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:50 | 0 | 0 | 50 |
| govern:chooseNStep:add | 6 | 3664.88 | 610.8134 | 2764.281 | 2764.281 | 6.5 | 0 | 189 | 324 | 0 | 0 | 39 | 0 |  | 0 | 0 | 0 |
| govern | 9 | 1248.02 | 138.6685 | 587.7212 | 587.7212 | 10.5556 | 9 | 0 | 0 | 9 | 8 | 0 | 12 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:12 | 3 | 0 | 9 |
| coupArvnRedeployOptionalTroops:chooseOne | 39 | 766.9 | 19.664 | 35.273 | 36.0946 | 8 | 0 | 2681 | 383 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally | 18 | 493.29 | 27.405 | 114.9263 | 114.9263 | 38.9444 | 18 | 0 | 0 | 18 | 4 | 0 | 36 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:36 | 0 | 0 | 18 |
| assault:chooseNStep:add | 6 | 366.64 | 61.1072 | 109.3632 | 109.3632 | 3 | 0 | 53 | 71 | 0 | 0 | 15 | 0 |  | 0 | 0 | 0 |
| train | 5 | 308.16 | 61.6328 | 152.284 | 152.284 | 9.4 | 5 | 0 | 0 | 5 | 0 | 0 | 10 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:10 | 0 | 0 | 5 |
| coupArvnRedeployMandatory:chooseOne | 10 | 237.18 | 23.718 | 33.1844 | 33.1844 | 8 | 0 | 1078 | 154 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| assault:chooseNStep:confirm | 7 | 220.41 | 31.4871 | 65.8369 | 65.8369 | 3.4286 | 0 | 34 | 29 | 0 | 0 | 9 | 1 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:1 | 0 | 0 | 0 |
| transport:chooseOne | 6 | 215.45 | 35.9089 | 55.8372 | 55.8372 | 12.3333 | 0 | 239 | 14 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| transport | 3 | 125.01 | 41.6707 | 46.1716 | 46.1716 | 10.6667 | 3 | 0 | 0 | 3 | 0 | 0 | 6 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:6 | 0 | 0 | 3 |
| coupArvnRedeployPolice | 26 | 54.65 | 2.1018 | 3.0506 | 5.0062 | 6.1923 | 26 | 0 | 0 | 26 | 0 | 0 | 21 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:21 | 26 | 0 | 26 |
| train:chooseOne | 9 | 45.84 | 5.093 | 8.5259 | 8.5259 | 2.2222 | 0 | 30 | 34 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| attack | 12 | 44.38 | 3.6981 | 7.7264 | 7.7264 | 54.5 | 9 | 0 | 3 | 9 | 0 | 0 | 0 |  | 12 | 0 | 9 |
| coupRedeployPass | 20 | 39.21 | 1.9603 | 3.2231 | 3.4756 | 1 | 13 | 0 | 7 | 13 | 0 | 0 | 0 |  | 20 | 0 | 13 |
| ambushVc | 11 | 37.94 | 3.4487 | 4.6136 | 4.6136 | 51 | 10 | 0 | 1 | 10 | 0 | 0 | 0 |  | 11 | 0 | 10 |
| assault | 16 | 34.76 | 2.1725 | 3.7823 | 3.7823 | 9 | 14 | 0 | 2 | 14 | 0 | 0 | 11 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:11 | 16 | 0 | 14 |
| coupArvnRedeployOptionalTroops | 16 | 33.81 | 2.113 | 4.3628 | 4.3628 | 9.6875 | 12 | 0 | 4 | 12 | 0 | 0 | 12 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:12 | 16 | 0 | 12 |
| coupNvaRedeployTroops | 18 | 32.8 | 1.8224 | 2.9386 | 2.9386 | 3.8333 | 14 | 0 | 4 | 14 | 0 | 0 | 14 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:14 | 18 | 0 | 14 |
| ambushNva | 2 | 30.86 | 15.4302 | 23.7864 | 23.7864 | 103.5 | 1 | 0 | 1 | 1 | 0 | 0 | 1 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:1 | 1 | 0 | 1 |
| coupCommitmentPass | 20 | 29 | 1.4498 | 2.0606 | 3.4423 | 1.25 | 0 | 0 | 20 | 0 | 0 | 0 | 0 |  | 20 | 0 | 0 |
| govern:chooseOne | 9 | 28.78 | 3.1975 | 4.404 | 4.404 | 2 | 0 | 9 | 9 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate | 4 | 25.6 | 6.4009 | 10.1454 | 10.1454 | 94.25 | 2 | 0 | 2 | 2 | 0 | 0 | 0 |  | 4 | 0 | 2 |
| coupPacifyPass | 10 | 23.53 | 2.3528 | 4.5993 | 4.5993 | 1.3 | 7 | 0 | 3 | 7 | 0 | 0 | 0 |  | 10 | 0 | 7 |
| march | 5 | 17.73 | 3.5463 | 6.962 | 6.962 | 33.4 | 3 | 0 | 2 | 3 | 0 | 0 | 0 |  | 5 | 0 | 3 |
| pass | 6 | 16.35 | 2.7256 | 3.9996 | 3.9996 | 3.6667 | 6 | 0 | 0 | 6 | 0 | 0 | 0 |  | 6 | 0 | 6 |
| coupPacifyARVN | 8 | 16 | 1.9998 | 2.5524 | 2.5524 | 4.375 | 6 | 0 | 2 | 6 | 0 | 0 | 5 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:5 | 8 | 0 | 6 |
| advise | 5 | 14.98 | 2.9957 | 4.7099 | 4.7099 | 9.6 | 3 | 0 | 2 | 3 | 0 | 0 | 0 |  | 5 | 0 | 3 |
| coupVictoryCheck | 5 | 11.1 | 2.2192 | 3.6422 | 3.6422 | 1 | 5 | 0 | 0 | 5 | 0 | 0 | 0 |  | 5 | 0 | 5 |
| coupResourcesResolve | 5 | 9.06 | 1.8125 | 2.3183 | 2.3183 | 1 | 0 | 0 | 5 | 0 | 0 | 0 | 0 |  | 5 | 0 | 0 |
| coupAgitatePass | 5 | 7.8 | 1.5608 | 2.0624 | 2.0624 | 6.6 | 0 | 0 | 5 | 0 | 0 | 0 | 0 |  | 5 | 0 | 0 |
| chooseOne:chooseOne | 3 | 5.64 | 1.8801 | 5.0604 | 5.0604 | 6.3333 | 0 | 3 | 1 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| airStrike | 1 | 4.99 | 4.9903 | 4.9903 | 4.9903 | 2 | 1 | 0 | 0 | 1 | 0 | 0 | 0 |  | 1 | 0 | 1 |
| coupArvnRedeployMandatory | 2 | 4.27 | 2.136 | 2.817 | 2.817 | 10.5 | 1 | 0 | 1 | 1 | 0 | 0 | 1 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:1 | 2 | 0 | 1 |
| coupNvaRedeployTroops:chooseOne | 68 | 1.88 | 0.0276 | 0.0408 | 0.0469 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| event-decision:chooseNStep:add | 39 | 1.17 | 0.0299 | 0.0538 | 0.067 | 16.1538 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally:chooseNStep:add | 18 | 0.91 | 0.0505 | 0.0934 | 0.0934 | 25.6111 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally:chooseNStep:confirm | 29 | 0.77 | 0.0266 | 0.0537 | 0.0546 | 22.4828 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| event-decision:chooseNStep:confirm | 28 | 0.61 | 0.0218 | 0.0348 | 0.0421 | 6.9286 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| event-decision:chooseOne | 22 | 0.58 | 0.0263 | 0.0404 | 0.0434 | 3.5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushVc:chooseNStep:add | 12 | 0.46 | 0.0382 | 0.0515 | 0.0515 | 3.6667 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally:chooseOne | 18 | 0.42 | 0.0231 | 0.0391 | 0.0391 | 1.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| advise:chooseNStep:add | 5 | 0.36 | 0.0724 | 0.1506 | 0.1506 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| march:chooseNStep:confirm | 13 | 0.31 | 0.0238 | 0.0311 | 0.0311 | 4.6923 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushVc:chooseNStep:confirm | 12 | 0.3 | 0.0246 | 0.0474 | 0.0474 | 4.5833 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| march:chooseNStep:add | 5 | 0.29 | 0.058 | 0.0642 | 0.0642 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| advise:chooseOne | 10 | 0.27 | 0.0267 | 0.0399 | 0.0399 | 2.4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushVc:chooseOne | 11 | 0.2 | 0.018 | 0.0243 | 0.0243 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate:chooseNStep:add | 4 | 0.17 | 0.0424 | 0.0462 | 0.0462 | 7.25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| advise:chooseNStep:confirm | 5 | 0.16 | 0.0325 | 0.0405 | 0.0405 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate:chooseOne | 6 | 0.16 | 0.0261 | 0.0416 | 0.0416 | 1.5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate:chooseNStep:confirm | 6 | 0.15 | 0.0247 | 0.0395 | 0.0395 | 6.8333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| chooseNStep:chooseNStep:confirm | 2 | 0.06 | 0.0277 | 0.03 | 0.03 | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushNva:chooseOne | 2 | 0.05 | 0.0262 | 0.0264 | 0.0264 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| airStrike:chooseOne | 1 | 0.04 | 0.0367 | 0.0367 | 0.0367 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| airStrike:chooseNStep:confirm | 1 | 0.03 | 0.0345 | 0.0345 | 0.0345 | 9 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |

## Top Hot Axes In Slow-Tier Seeds

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.

| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms |
|---:|---|---|---:|---:|---:|---:|---:|
| 1 | train:chooseNStep:add | continuedDeepening | 11 | 15115.11 | 1374.1006 | 2814.9944 | 2814.9944 |
| 2 | train:chooseNStep:confirm | continuedDeepening | 12 | 9992.99 | 832.7493 | 2578.7723 | 2578.7723 |
| 3 | coupArvnRedeployPolice:chooseOne | continuedDeepening | 66 | 7720.47 | 116.9768 | 262.4963 | 270.9433 |
| 4 | govern:chooseNStep:confirm | continuedDeepening | 6 | 7346.83 | 1224.4718 | 6344.5525 | 6344.5525 |
| 5 | event | singlePass | 48 | 3892.21 | 81.0876 | 444.1872 | 1660.9391 |
| 6 | govern:chooseNStep:add | continuedDeepening | 6 | 3664.88 | 610.8134 | 2764.281 | 2764.281 |
| 7 | govern | singlePass | 6 | 1234.5 | 205.7493 | 587.7212 | 587.7212 |
| 8 | coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | 39 | 766.9 | 19.664 | 35.273 | 36.0946 |
| 9 | rally | singlePass | 18 | 493.29 | 27.405 | 114.9263 | 114.9263 |
| 10 | assault:chooseNStep:add | continuedDeepening | 5 | 366.54 | 73.3073 | 109.3632 | 109.3632 |

## Hot-Path Buckets For Top Slow Axes

Captured only when `--profile-buckets` is enabled. Buckets are timing/count diagnostics inside `PolicyAgent.chooseDecision`; they are not correctness assertions.

### train:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 20128 | 3385.16 |
| zobrist:encodeDecisionStackFrame | 20344 | 1832.19 |
| tokenStateIndex:refreshCachedEntries | 8783 | 175.59 |
| evalQuery:applyTokenFilter | 4636 | 14.88 |
| evalQuery:countMatchingTokens | 7500 | 11.01 |
| evalQuery:applyTokenFilterCacheHit | 8929 | 0 |
| evalQuery:applyTokenFilterCompiled | 4636 | 0 |
| evalQuery:countMatchingTokensCacheHit | 975870 | 0 |
| evalQuery:countMatchingTokensCompiled | 7500 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 2335706 | 0 |
| policyWasmStatePatch:reuseAppliedStateHash | 1432 | 0 |
| tokenStateIndex:getCacheHit | 17459 | 0 |

### train:chooseNStep:confirm | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 12646 | 2208.62 |
| zobrist:encodeDecisionStackFrame | 13158 | 1229.91 |
| tokenStateIndex:refreshCachedEntries | 6279 | 124.57 |
| evalQuery:countMatchingTokens | 3549 | 6.88 |
| evalQuery:applyTokenFilter | 1718 | 4.45 |
| evalQuery:applyTokenFilterCacheHit | 7183 | 0 |
| evalQuery:applyTokenFilterCompiled | 1718 | 0 |
| evalQuery:countMatchingTokensCacheHit | 678867 | 0 |
| evalQuery:countMatchingTokensCompiled | 3549 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1661752 | 0 |
| policyWasmStatePatch:reuseAppliedStateHash | 1144 | 0 |
| tokenStateIndex:getCacheHit | 11358 | 0 |

### coupArvnRedeployPolice:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 151922 | 1402.41 |
| evalQuery:countMatchingTokens | 173662 | 209.73 |
| zobrist:digestDecisionStackFrame | 1052 | 54.04 |
| zobrist:encodeDecisionStackFrame | 1052 | 41.26 |
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
| tokenStateIndex:refreshCachedEntries | 20945 | 315.24 |
| evalQuery:applyTokenFilter | 170131 | 199.74 |
| zobrist:encodeDecisionStackFrame | 264 | 10.83 |
| zobrist:digestDecisionStackFrame | 162 | 8.38 |
| evalQuery:countMatchingTokens | 4146 | 4.4 |
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
| evalQuery:applyTokenFilter | 36802 | 147.99 |
| tokenStateIndex:refreshCachedEntries | 7504 | 114.04 |
| zobrist:digestDecisionStackFrame | 454 | 77.45 |
| evalQuery:countMatchingTokens | 74915 | 57.78 |
| zobrist:encodeDecisionStackFrame | 454 | 46.91 |
| policyWasmRuntime:encodeBytecodeInput | 512 | 12.33 |
| evalQuery:applyTokenFilterCacheHit | 3387 | 0 |
| evalQuery:applyTokenFilterCompiled | 17036 | 0 |
| evalQuery:countMatchingTokensCacheHit | 453345 | 0 |
| evalQuery:countMatchingTokensCompiled | 3034 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1136254 | 0 |
| policyWasmRuntime:encodedInputCacheMiss | 512 | 0 |

### govern:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 8712 | 135.21 |
| evalQuery:applyTokenFilter | 71016 | 82.92 |
| zobrist:digestDecisionStackFrame | 792 | 36.58 |
| zobrist:encodeDecisionStackFrame | 792 | 26.96 |
| evalQuery:countMatchingTokens | 2564 | 2.7 |
| evalQuery:applyTokenFilterCacheHit | 4281 | 0 |
| evalQuery:applyTokenFilterCompiled | 71016 | 0 |
| evalQuery:countMatchingTokensCacheHit | 251025 | 0 |
| evalQuery:countMatchingTokensCompiled | 2564 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 532458 | 0 |
| policyWasmStatePatch:reuseAppliedStateHash | 117 | 0 |
| tokenStateIndex:getCacheHit | 28430 | 0 |

### govern | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 2175 | 32.03 |
| evalQuery:applyTokenFilter | 20013 | 28.7 |
| zobrist:digestDecisionStackFrame | 158 | 16.86 |
| zobrist:encodeDecisionStackFrame | 158 | 10.73 |
| evalQuery:countMatchingTokens | 2828 | 2.41 |
| policyWasmRuntime:encodeBytecodeInput | 48 | 1.31 |
| evalQuery:applyTokenFilterCacheHit | 3305 | 0 |
| evalQuery:applyTokenFilterCompiled | 14614 | 0 |
| evalQuery:countMatchingTokensCacheHit | 83034 | 0 |
| evalQuery:countMatchingTokensCompiled | 666 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 182126 | 0 |
| policyWasmRuntime:encodedInputCacheMiss | 48 | 0 |

### coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 10352 | 91.36 |
| evalQuery:countMatchingTokens | 16904 | 15.16 |
| zobrist:digestDecisionStackFrame | 96 | 3.61 |
| zobrist:encodeDecisionStackFrame | 96 | 2.84 |
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
| tokenStateIndex:refreshCachedEntries | 1400 | 16.65 |
| zobrist:digestDecisionStackFrame | 100 | 7.17 |
| evalQuery:countMatchingTokens | 7907 | 4.94 |
| policyWasmRuntime:encodeBytecodeInput | 72 | 4.84 |
| zobrist:encodeDecisionStackFrame | 100 | 4.77 |
| evalQuery:applyTokenFilter | 993 | 4.67 |
| evalQuery:applyTokenFilterCacheHit | 1129 | 0 |
| evalQuery:applyTokenFilterCompiled | 772 | 0 |
| evalQuery:countMatchingTokensCacheHit | 180046 | 0 |
| evalQuery:countMatchingTokensCompiled | 2008 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 439567 | 0 |
| policyWasmRuntime:encodedInputCacheMiss | 72 | 0 |

### assault:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 188 | 28.22 |
| zobrist:encodeDecisionStackFrame | 188 | 14.71 |
| tokenStateIndex:refreshCachedEntries | 989 | 12.41 |
| evalQuery:applyTokenFilter | 930 | 5.95 |
| evalQuery:countMatchingTokens | 1879 | 1.46 |
| evalQuery:applyTokenFilterCacheHit | 656 | 0 |
| evalQuery:applyTokenFilterCompiled | 831 | 0 |
| evalQuery:countMatchingTokensCacheHit | 108976 | 0 |
| evalQuery:countMatchingTokensCompiled | 1879 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 267289 | 0 |
| policyWasmStatePatch:reuseAppliedStateHash | 28 | 0 |
| tokenStateIndex:getCacheHit | 12475 | 0 |


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
