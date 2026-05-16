# FITL ARVN 15-Seed Per-Microturn-Class Decomposition

**Status**: ✅ EXPLOITED — referenced during spec 174 implementation (archived 2026-05-16).

**Date**: 2026-05-16-phase-4e-train-choosenstep-baseline
**Status**: Spec 173 measurement witness.
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005 --timeout-ms 400000 --date 2026-05-16-phase-4e-train-choosenstep-baseline --profile-buckets`
**CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4e-train-choosenstep-baseline.csv`

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
| 1005 | OK | terminal | 62297.98 | 790 | 78.8582 |  |

## Per-Microturn-Class Rollup

| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | WASM preview-drive routes | WASM preview-drive unsupported | WASM preview-drive unsupported reasons | WASM preview-drive batches | Token index builds | Static rebuilds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|
| train:chooseNStep:add | 11 | 15159.23 | 1378.1122 | 2871.9355 | 2871.9355 | 14.4545 | 0 | 6998 | 9498 | 0 | 0 | 2 | 148 | agent-guided-completion/production-deep-choosenstep-continuation.pickInnerDecision/deep preview-drive selected a non-chooseNStep continuation decision:143; unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:5 | 0 | 28 | 0 |
| train:chooseNStep:confirm | 15 | 10001.11 | 666.7407 | 2669.4456 | 2669.4456 | 8.7333 | 0 | 4429 | 5965 | 0 | 0 | 8 | 97 | agent-guided-completion/production-deep-choosenstep-continuation.pickInnerDecision/deep preview-drive selected a non-chooseNStep continuation decision:94; unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:3 | 0 | 82 | 0 |
| coupArvnRedeployPolice:chooseOne | 66 | 8390.28 | 127.1255 | 282.7698 | 298.0004 | 26.7121 | 0 | 60935 | 2466 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| govern:chooseNStep:confirm | 6 | 7866.21 | 1311.0347 | 6822.6099 | 6822.6099 | 7.5 | 0 | 159 | 72 | 0 | 0 | 0 | 33 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:33 | 0 | 0 | 0 |
| event | 48 | 4160.84 | 86.6841 | 468.7363 | 1774.0028 | 28.6667 | 48 | 0 | 0 | 48 | 22 | 0 | 50 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:50 | 0 | 0 | 50 |
| govern:chooseNStep:add | 6 | 3911.71 | 651.9525 | 2935.9896 | 2935.9896 | 6.5 | 0 | 228 | 363 | 0 | 0 | 0 | 39 | agent-guided-completion/production-deep-choosenstep-continuation.pickInnerDecision/deep preview-drive selected a non-chooseNStep continuation decision:39 | 0 | 0 | 0 |
| govern | 9 | 1371.64 | 152.4044 | 628.2079 | 628.2079 | 10.5556 | 9 | 0 | 0 | 9 | 8 | 0 | 12 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:12 | 3 | 0 | 9 |
| coupArvnRedeployOptionalTroops:chooseOne | 39 | 838.62 | 21.5032 | 39.0722 | 40.1859 | 8 | 0 | 2681 | 383 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally | 18 | 513.87 | 28.5481 | 113.373 | 113.373 | 38.9444 | 18 | 0 | 0 | 18 | 4 | 0 | 36 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:36 | 0 | 0 | 18 |
| assault:chooseNStep:add | 6 | 431.15 | 71.8585 | 126.7901 | 126.7901 | 3 | 0 | 66 | 84 | 0 | 0 | 2 | 13 | agent-guided-completion/production-deep-choosenstep-continuation.pickInnerDecision/deep preview-drive selected a non-chooseNStep continuation decision:13 | 0 | 30 | 0 |
| train | 5 | 322.45 | 64.4896 | 160.715 | 160.715 | 9.4 | 5 | 0 | 0 | 5 | 0 | 0 | 10 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:10 | 0 | 0 | 5 |
| assault:chooseNStep:confirm | 7 | 273.48 | 39.0682 | 81.3137 | 81.3137 | 3.4286 | 0 | 43 | 38 | 0 | 0 | 0 | 10 | agent-guided-completion/production-deep-choosenstep-continuation.pickInnerDecision/deep preview-drive selected a non-chooseNStep continuation decision:9; unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:1 | 0 | 0 | 0 |
| coupArvnRedeployMandatory:chooseOne | 10 | 261.9 | 26.1905 | 37.215 | 37.215 | 8 | 0 | 1078 | 154 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| transport:chooseOne | 6 | 223.75 | 37.2914 | 58.9918 | 58.9918 | 12.3333 | 0 | 239 | 14 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| transport | 3 | 144.69 | 48.2292 | 52.7985 | 52.7985 | 10.6667 | 3 | 0 | 0 | 3 | 0 | 0 | 6 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:6 | 0 | 0 | 3 |
| coupArvnRedeployPolice | 26 | 59.58 | 2.2917 | 4.0394 | 4.3619 | 6.1923 | 26 | 0 | 0 | 26 | 0 | 0 | 21 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:21 | 26 | 0 | 26 |
| attack | 12 | 53.34 | 4.4447 | 9.5302 | 9.5302 | 54.5 | 9 | 0 | 3 | 9 | 0 | 0 | 0 |  | 12 | 0 | 9 |
| train:chooseOne | 9 | 47.18 | 5.2423 | 7.493 | 7.493 | 2.2222 | 0 | 30 | 34 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushVc | 11 | 40.52 | 3.6839 | 4.6009 | 4.6009 | 51 | 10 | 0 | 1 | 10 | 0 | 0 | 0 |  | 11 | 0 | 10 |
| coupRedeployPass | 20 | 40.35 | 2.0177 | 3.3409 | 3.976 | 1 | 13 | 0 | 7 | 13 | 0 | 0 | 0 |  | 20 | 0 | 13 |
| coupNvaRedeployTroops | 18 | 35.47 | 1.9704 | 4.4871 | 4.4871 | 3.8333 | 14 | 0 | 4 | 14 | 0 | 0 | 14 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:14 | 18 | 0 | 14 |
| assault | 16 | 35 | 2.1874 | 4.5199 | 4.5199 | 9 | 14 | 0 | 2 | 14 | 0 | 0 | 11 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:11 | 16 | 0 | 14 |
| coupArvnRedeployOptionalTroops | 16 | 33.13 | 2.0706 | 4.1111 | 4.1111 | 9.6875 | 12 | 0 | 4 | 12 | 0 | 0 | 12 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:12 | 16 | 0 | 12 |
| govern:chooseOne | 9 | 32.35 | 3.5948 | 4.5798 | 4.5798 | 2 | 0 | 9 | 9 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushNva | 2 | 32.15 | 16.073 | 25.4203 | 25.4203 | 103.5 | 1 | 0 | 1 | 1 | 0 | 0 | 1 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:1 | 1 | 0 | 1 |
| coupCommitmentPass | 20 | 27.49 | 1.3746 | 1.5815 | 1.6413 | 1.25 | 0 | 0 | 20 | 0 | 0 | 0 | 0 |  | 20 | 0 | 0 |
| infiltrate | 4 | 27.48 | 6.8705 | 10.2006 | 10.2006 | 94.25 | 2 | 0 | 2 | 2 | 0 | 0 | 0 |  | 4 | 0 | 2 |
| pass | 6 | 20.86 | 3.4769 | 5.5293 | 5.5293 | 3.6667 | 6 | 0 | 0 | 6 | 0 | 0 | 0 |  | 6 | 0 | 6 |
| march | 5 | 20.29 | 4.0571 | 7.2673 | 7.2673 | 33.4 | 3 | 0 | 2 | 3 | 0 | 0 | 0 |  | 5 | 0 | 3 |
| coupPacifyPass | 10 | 19.26 | 1.9258 | 3.33 | 3.33 | 1.3 | 7 | 0 | 3 | 7 | 0 | 0 | 0 |  | 10 | 0 | 7 |
| coupPacifyARVN | 8 | 17.11 | 2.1382 | 2.8971 | 2.8971 | 4.375 | 6 | 0 | 2 | 6 | 0 | 0 | 5 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:5 | 8 | 0 | 6 |
| advise | 5 | 13.99 | 2.7972 | 4.4367 | 4.4367 | 9.6 | 3 | 0 | 2 | 3 | 0 | 0 | 0 |  | 5 | 0 | 3 |
| coupResourcesResolve | 5 | 11.56 | 2.3128 | 3.6612 | 3.6612 | 1 | 0 | 0 | 5 | 0 | 0 | 0 | 0 |  | 5 | 0 | 0 |
| coupVictoryCheck | 5 | 10.42 | 2.0837 | 2.7679 | 2.7679 | 1 | 5 | 0 | 0 | 5 | 0 | 0 | 0 |  | 5 | 0 | 5 |
| coupAgitatePass | 5 | 8.88 | 1.7762 | 2.6196 | 2.6196 | 6.6 | 0 | 0 | 5 | 0 | 0 | 0 | 0 |  | 5 | 0 | 0 |
| chooseOne:chooseOne | 3 | 6.08 | 2.0263 | 5.4375 | 5.4375 | 6.3333 | 0 | 3 | 1 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| coupArvnRedeployMandatory | 2 | 5.52 | 2.761 | 2.769 | 2.769 | 10.5 | 1 | 0 | 1 | 1 | 0 | 0 | 1 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:1 | 2 | 0 | 1 |
| airStrike | 1 | 2.25 | 2.2455 | 2.2455 | 2.2455 | 2 | 1 | 0 | 0 | 1 | 0 | 0 | 0 |  | 1 | 0 | 1 |
| coupNvaRedeployTroops:chooseOne | 68 | 2.11 | 0.0311 | 0.0476 | 0.0546 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| event-decision:chooseNStep:add | 39 | 1.23 | 0.0314 | 0.0581 | 0.0632 | 16.1538 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally:chooseNStep:add | 18 | 1.07 | 0.0597 | 0.0948 | 0.0948 | 25.6111 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally:chooseNStep:confirm | 29 | 0.92 | 0.0318 | 0.0572 | 0.0641 | 22.4828 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| event-decision:chooseOne | 22 | 0.67 | 0.0302 | 0.0508 | 0.0582 | 3.5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| event-decision:chooseNStep:confirm | 28 | 0.65 | 0.0232 | 0.0431 | 0.0457 | 6.9286 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushVc:chooseNStep:add | 12 | 0.53 | 0.0438 | 0.093 | 0.093 | 3.6667 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally:chooseOne | 18 | 0.49 | 0.0273 | 0.0621 | 0.0621 | 1.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| advise:chooseNStep:add | 5 | 0.38 | 0.0752 | 0.1588 | 0.1588 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| march:chooseNStep:confirm | 13 | 0.35 | 0.0273 | 0.0372 | 0.0372 | 4.6923 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| march:chooseNStep:add | 5 | 0.33 | 0.0657 | 0.0711 | 0.0711 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| advise:chooseOne | 10 | 0.29 | 0.0289 | 0.0459 | 0.0459 | 2.4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushVc:chooseNStep:confirm | 12 | 0.29 | 0.0239 | 0.0302 | 0.0302 | 4.5833 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushVc:chooseOne | 11 | 0.2 | 0.0182 | 0.0232 | 0.0232 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate:chooseNStep:add | 4 | 0.19 | 0.047 | 0.057 | 0.057 | 7.25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate:chooseNStep:confirm | 6 | 0.16 | 0.0271 | 0.0434 | 0.0434 | 6.8333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| advise:chooseNStep:confirm | 5 | 0.15 | 0.0304 | 0.0315 | 0.0315 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate:chooseOne | 6 | 0.15 | 0.0257 | 0.0418 | 0.0418 | 1.5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushNva:chooseOne | 2 | 0.06 | 0.03 | 0.0305 | 0.0305 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| chooseNStep:chooseNStep:confirm | 2 | 0.06 | 0.0311 | 0.0325 | 0.0325 | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| airStrike:chooseNStep:confirm | 1 | 0.03 | 0.0303 | 0.0303 | 0.0303 | 9 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| airStrike:chooseOne | 1 | 0.03 | 0.0347 | 0.0347 | 0.0347 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |

## Top Hot Axes In Slow-Tier Seeds

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.

| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms |
|---:|---|---|---:|---:|---:|---:|---:|
| 1 | train:chooseNStep:add | continuedDeepening | 11 | 15159.23 | 1378.1122 | 2871.9355 | 2871.9355 |
| 2 | train:chooseNStep:confirm | continuedDeepening | 12 | 10000.84 | 833.4031 | 2669.4456 | 2669.4456 |
| 3 | coupArvnRedeployPolice:chooseOne | continuedDeepening | 66 | 8390.28 | 127.1255 | 282.7698 | 298.0004 |
| 4 | govern:chooseNStep:confirm | continuedDeepening | 6 | 7866.21 | 1311.0347 | 6822.6099 | 6822.6099 |
| 5 | event | singlePass | 48 | 4160.84 | 86.6841 | 468.7363 | 1774.0028 |
| 6 | govern:chooseNStep:add | continuedDeepening | 6 | 3911.71 | 651.9525 | 2935.9896 | 2935.9896 |
| 7 | govern | singlePass | 6 | 1358.87 | 226.4779 | 628.2079 | 628.2079 |
| 8 | coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | 39 | 838.62 | 21.5032 | 39.0722 | 40.1859 |
| 9 | rally | singlePass | 18 | 513.87 | 28.5481 | 113.373 | 113.373 |
| 10 | assault:chooseNStep:add | continuedDeepening | 5 | 431.01 | 86.2025 | 126.7901 | 126.7901 |

## Hot-Path Buckets For Top Slow Axes

Captured only when `--profile-buckets` is enabled. Buckets are timing/count diagnostics inside `PolicyAgent.chooseDecision`; they are not correctness assertions.

### train:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 20128 | 3450.39 |
| zobrist:encodeDecisionStackFrame | 21059 | 1989.96 |
| tokenStateIndex:refreshCachedEntries | 7741 | 156.75 |
| evalQuery:applyTokenFilter | 4636 | 15.13 |
| evalQuery:countMatchingTokens | 7451 | 13.48 |
| tokenStateIndex:build | 28 | 0.79 |
| evalQuery:applyTokenFilterCacheHit | 8290 | 0 |
| evalQuery:applyTokenFilterCompiled | 4636 | 0 |
| evalQuery:countMatchingTokensCacheHit | 953476 | 0 |
| evalQuery:countMatchingTokensCompiled | 7451 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 2282033 | 0 |
| tokenStateIndex:getCacheHit | 17816 | 0 |

### train:chooseNStep:confirm | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 12646 | 2248.93 |
| zobrist:encodeDecisionStackFrame | 13628 | 1361.42 |
| tokenStateIndex:refreshCachedEntries | 5338 | 115.62 |
| evalQuery:countMatchingTokens | 3526 | 8.3 |
| evalQuery:applyTokenFilter | 1718 | 5.26 |
| tokenStateIndex:build | 82 | 2.88 |
| evalQuery:applyTokenFilterCacheHit | 6614 | 0 |
| evalQuery:applyTokenFilterCompiled | 1718 | 0 |
| evalQuery:countMatchingTokensCacheHit | 659075 | 0 |
| evalQuery:countMatchingTokensCompiled | 3526 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1614252 | 0 |
| tokenStateIndex:getCacheHit | 11459 | 0 |

### coupArvnRedeployPolice:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 151922 | 1544.5 |
| evalQuery:countMatchingTokens | 173662 | 219.16 |
| zobrist:digestDecisionStackFrame | 1052 | 55.87 |
| zobrist:encodeDecisionStackFrame | 1052 | 45.22 |
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
| tokenStateIndex:refreshCachedEntries | 20945 | 323.89 |
| evalQuery:applyTokenFilter | 170131 | 220.15 |
| zobrist:encodeDecisionStackFrame | 264 | 10.32 |
| zobrist:digestDecisionStackFrame | 162 | 8.53 |
| evalQuery:countMatchingTokens | 4146 | 4.42 |
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
| evalQuery:applyTokenFilter | 36802 | 175.16 |
| tokenStateIndex:refreshCachedEntries | 7504 | 123.09 |
| zobrist:digestDecisionStackFrame | 454 | 78.54 |
| evalQuery:countMatchingTokens | 74915 | 59.05 |
| zobrist:encodeDecisionStackFrame | 454 | 49.72 |
| policyWasmRuntime:encodeBytecodeInput | 512 | 14.3 |
| evalQuery:applyTokenFilterCacheHit | 3387 | 0 |
| evalQuery:applyTokenFilterCompiled | 17036 | 0 |
| evalQuery:countMatchingTokensCacheHit | 453345 | 0 |
| evalQuery:countMatchingTokensCompiled | 3034 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1136254 | 0 |
| policyWasmRuntime:encodedInputCacheMiss | 512 | 0 |

### govern:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 8712 | 135.33 |
| evalQuery:applyTokenFilter | 71016 | 94.25 |
| zobrist:encodeDecisionStackFrame | 987 | 36.6 |
| zobrist:digestDecisionStackFrame | 792 | 36.51 |
| evalQuery:countMatchingTokens | 2564 | 2.89 |
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
| tokenStateIndex:refreshCachedEntries | 2175 | 37.97 |
| evalQuery:applyTokenFilter | 20013 | 32.66 |
| zobrist:digestDecisionStackFrame | 158 | 17.6 |
| zobrist:encodeDecisionStackFrame | 158 | 12.48 |
| evalQuery:countMatchingTokens | 2828 | 2.77 |
| policyWasmRuntime:encodeBytecodeInput | 48 | 2.72 |
| evalQuery:applyTokenFilterCacheHit | 3305 | 0 |
| evalQuery:applyTokenFilterCompiled | 14614 | 0 |
| evalQuery:countMatchingTokensCacheHit | 83034 | 0 |
| evalQuery:countMatchingTokensCompiled | 666 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 182126 | 0 |
| policyWasmRuntime:encodedInputCacheMiss | 48 | 0 |

### coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 10352 | 110.28 |
| evalQuery:countMatchingTokens | 16904 | 14.11 |
| zobrist:digestDecisionStackFrame | 96 | 3.63 |
| zobrist:encodeDecisionStackFrame | 96 | 3.45 |
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
| tokenStateIndex:refreshCachedEntries | 1400 | 18.79 |
| evalQuery:countMatchingTokens | 7907 | 9.02 |
| zobrist:digestDecisionStackFrame | 100 | 7.26 |
| policyWasmRuntime:encodeBytecodeInput | 72 | 6.49 |
| evalQuery:applyTokenFilter | 993 | 5.4 |
| zobrist:encodeDecisionStackFrame | 100 | 4.96 |
| evalQuery:applyTokenFilterCacheHit | 1129 | 0 |
| evalQuery:applyTokenFilterCompiled | 772 | 0 |
| evalQuery:countMatchingTokensCacheHit | 180046 | 0 |
| evalQuery:countMatchingTokensCompiled | 2008 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 439567 | 0 |
| policyWasmRuntime:encodedInputCacheMiss | 72 | 0 |

### assault:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 188 | 28.83 |
| zobrist:encodeDecisionStackFrame | 253 | 25.73 |
| tokenStateIndex:refreshCachedEntries | 989 | 13.93 |
| evalQuery:applyTokenFilter | 930 | 7.2 |
| evalQuery:countMatchingTokens | 1879 | 1.59 |
| tokenStateIndex:build | 30 | 1.01 |
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
