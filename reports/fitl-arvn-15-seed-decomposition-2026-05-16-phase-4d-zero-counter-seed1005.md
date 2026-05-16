# FITL ARVN 15-Seed Per-Microturn-Class Decomposition

**Date**: 2026-05-16-phase-4d-zero-counter-seed1005
**Status**: Spec 173 measurement witness.
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005 --timeout-ms 400000 --date 2026-05-16-phase-4d-zero-counter-seed1005 --profile-buckets`
**CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4d-zero-counter-seed1005.csv`

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
| 1005 | OK | terminal | 137795.87 | 790 | 174.4252 |  |

## Per-Microturn-Class Rollup

| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | WASM preview-drive routes | WASM preview-drive unsupported | WASM preview-drive unsupported reasons | WASM preview-drive batches | Token index builds | Static rebuilds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|
| coupArvnRedeployPolice:chooseOne | 66 | 71070.51 | 1076.8259 | 3922.918 | 4791.5072 | 26.7121 | 0 | 60935 | 2466 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| train:chooseNStep:add | 11 | 18981.7 | 1725.6088 | 3545.7214 | 3545.7214 | 14.4545 | 0 | 6998 | 9498 | 0 | 0 | 2 | 148 | agent-guided-completion/production-deep-choosenstep-continuation.pickInnerDecision/deep preview-drive selected a non-chooseNStep continuation decision:143; unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:5 | 0 | 388 | 0 |
| train:chooseNStep:confirm | 15 | 13018.19 | 867.8795 | 3229.4758 | 3229.4758 | 8.7333 | 0 | 4429 | 5965 | 0 | 0 | 8 | 97 | agent-guided-completion/production-deep-choosenstep-continuation.pickInnerDecision/deep preview-drive selected a non-chooseNStep continuation decision:94; unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:3 | 0 | 386 | 0 |
| govern:chooseNStep:confirm | 6 | 8220.16 | 1370.0269 | 7094.7612 | 7094.7612 | 7.5 | 0 | 159 | 72 | 0 | 0 | 0 | 33 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:33 | 0 | 0 | 0 |
| event | 48 | 4670.05 | 97.2926 | 522.5398 | 1792.8138 | 28.6667 | 48 | 0 | 0 | 48 | 22 | 0 | 50 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:50 | 0 | 0 | 50 |
| govern:chooseNStep:add | 6 | 4167.13 | 694.5221 | 2968.6614 | 2968.6614 | 6.5 | 0 | 228 | 363 | 0 | 0 | 0 | 39 | agent-guided-completion/production-deep-choosenstep-continuation.pickInnerDecision/deep preview-drive selected a non-chooseNStep continuation decision:39 | 0 | 0 | 0 |
| coupArvnRedeployOptionalTroops:chooseOne | 39 | 2502.7 | 64.1718 | 181.9077 | 206.1691 | 8 | 0 | 2681 | 383 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| govern | 9 | 1527.61 | 169.7347 | 621.5327 | 621.5327 | 10.5556 | 9 | 0 | 0 | 9 | 8 | 0 | 12 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:12 | 3 | 0 | 9 |
| coupArvnRedeployMandatory:chooseOne | 10 | 919.32 | 91.9324 | 175.5013 | 175.5013 | 8 | 0 | 1078 | 154 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally | 18 | 586.96 | 32.6089 | 120.1418 | 120.1418 | 38.9444 | 18 | 0 | 0 | 18 | 4 | 0 | 36 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:36 | 0 | 0 | 18 |
| transport:chooseOne | 6 | 502.97 | 83.8288 | 159.3977 | 159.3977 | 12.3333 | 0 | 239 | 14 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| assault:chooseNStep:add | 6 | 489.99 | 81.6643 | 145.4561 | 145.4561 | 3 | 0 | 66 | 84 | 0 | 0 | 2 | 13 | agent-guided-completion/production-deep-choosenstep-continuation.pickInnerDecision/deep preview-drive selected a non-chooseNStep continuation decision:13 | 0 | 82 | 0 |
| train | 5 | 423.96 | 84.7918 | 182.4535 | 182.4535 | 9.4 | 5 | 0 | 0 | 5 | 0 | 0 | 10 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:10 | 0 | 0 | 5 |
| assault:chooseNStep:confirm | 7 | 305.1 | 43.5863 | 94.0074 | 94.0074 | 3.4286 | 0 | 43 | 38 | 0 | 0 | 0 | 10 | agent-guided-completion/production-deep-choosenstep-continuation.pickInnerDecision/deep preview-drive selected a non-chooseNStep continuation decision:9; unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:1 | 0 | 36 | 0 |
| transport | 3 | 188.52 | 62.8395 | 78.0868 | 78.0868 | 10.6667 | 3 | 0 | 0 | 3 | 0 | 0 | 6 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:6 | 0 | 0 | 3 |
| train:chooseOne | 9 | 109.44 | 12.1605 | 37.0884 | 37.0884 | 2.2222 | 0 | 30 | 34 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| coupArvnRedeployPolice | 26 | 59.53 | 2.2895 | 4.2519 | 6.2755 | 6.1923 | 26 | 0 | 0 | 26 | 0 | 0 | 21 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:21 | 26 | 0 | 26 |
| attack | 12 | 44.32 | 3.6932 | 10.2932 | 10.2932 | 54.5 | 9 | 0 | 3 | 9 | 0 | 0 | 0 |  | 12 | 0 | 9 |
| ambushVc | 11 | 42.06 | 3.8237 | 5.0404 | 5.0404 | 51 | 10 | 0 | 1 | 10 | 0 | 0 | 0 |  | 11 | 0 | 10 |
| coupRedeployPass | 20 | 39.49 | 1.9747 | 3.1525 | 3.1912 | 1 | 13 | 0 | 7 | 13 | 0 | 0 | 0 |  | 20 | 0 | 13 |
| ambushNva | 2 | 37.48 | 18.7388 | 29.6697 | 29.6697 | 103.5 | 1 | 0 | 1 | 1 | 0 | 0 | 1 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:1 | 1 | 0 | 1 |
| assault | 16 | 36.55 | 2.2846 | 3.7564 | 3.7564 | 9 | 14 | 0 | 2 | 14 | 0 | 0 | 11 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:11 | 16 | 0 | 14 |
| coupArvnRedeployOptionalTroops | 16 | 36.07 | 2.2544 | 4.8814 | 4.8814 | 9.6875 | 12 | 0 | 4 | 12 | 0 | 0 | 12 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:12 | 16 | 0 | 12 |
| govern:chooseOne | 9 | 35.07 | 3.897 | 6.9131 | 6.9131 | 2 | 0 | 9 | 9 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| coupNvaRedeployTroops | 18 | 34.05 | 1.8918 | 2.9363 | 2.9363 | 3.8333 | 14 | 0 | 4 | 14 | 0 | 0 | 14 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:14 | 18 | 0 | 14 |
| coupCommitmentPass | 20 | 33.51 | 1.6757 | 3.2976 | 3.3601 | 1.25 | 0 | 0 | 20 | 0 | 0 | 0 | 0 |  | 20 | 0 | 0 |
| infiltrate | 4 | 29.18 | 7.2948 | 10.3173 | 10.3173 | 94.25 | 2 | 0 | 2 | 2 | 0 | 0 | 0 |  | 4 | 0 | 2 |
| coupPacifyARVN | 8 | 20.1 | 2.5128 | 5.2651 | 5.2651 | 4.375 | 6 | 0 | 2 | 6 | 0 | 0 | 5 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:5 | 8 | 0 | 6 |
| coupPacifyPass | 10 | 20.1 | 2.0103 | 3.4731 | 3.4731 | 1.3 | 7 | 0 | 3 | 7 | 0 | 0 | 0 |  | 10 | 0 | 7 |
| march | 5 | 18.5 | 3.7003 | 6.8715 | 6.8715 | 33.4 | 3 | 0 | 2 | 3 | 0 | 0 | 0 |  | 5 | 0 | 3 |
| pass | 6 | 16.04 | 2.6729 | 3.6016 | 3.6016 | 3.6667 | 6 | 0 | 0 | 6 | 0 | 0 | 0 |  | 6 | 0 | 6 |
| advise | 5 | 14.51 | 2.902 | 4.927 | 4.927 | 9.6 | 3 | 0 | 2 | 3 | 0 | 0 | 0 |  | 5 | 0 | 3 |
| coupResourcesResolve | 5 | 11.26 | 2.2525 | 3.6442 | 3.6442 | 1 | 0 | 0 | 5 | 0 | 0 | 0 | 0 |  | 5 | 0 | 0 |
| coupVictoryCheck | 5 | 10.48 | 2.0967 | 2.795 | 2.795 | 1 | 5 | 0 | 0 | 5 | 0 | 0 | 0 |  | 5 | 0 | 5 |
| coupAgitatePass | 5 | 7.63 | 1.5253 | 1.587 | 1.587 | 6.6 | 0 | 0 | 5 | 0 | 0 | 0 | 0 |  | 5 | 0 | 0 |
| chooseOne:chooseOne | 3 | 6.85 | 2.2843 | 6.2076 | 6.2076 | 6.3333 | 0 | 3 | 1 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| coupArvnRedeployMandatory | 2 | 5.4 | 2.6994 | 2.966 | 2.966 | 10.5 | 1 | 0 | 1 | 1 | 0 | 0 | 1 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:1 | 2 | 0 | 1 |
| airStrike | 1 | 3.46 | 3.4592 | 3.4592 | 3.4592 | 2 | 1 | 0 | 0 | 1 | 0 | 0 | 0 |  | 1 | 0 | 1 |
| coupNvaRedeployTroops:chooseOne | 68 | 2.85 | 0.042 | 0.0599 | 0.0719 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| event-decision:chooseNStep:add | 39 | 1.61 | 0.0414 | 0.0716 | 0.0781 | 16.1538 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally:chooseNStep:add | 18 | 0.99 | 0.0552 | 0.104 | 0.104 | 25.6111 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally:chooseNStep:confirm | 29 | 0.9 | 0.0309 | 0.0563 | 0.0648 | 22.4828 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| event-decision:chooseNStep:confirm | 28 | 0.88 | 0.0315 | 0.0455 | 0.0481 | 6.9286 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| event-decision:chooseOne | 22 | 0.88 | 0.0401 | 0.0625 | 0.0666 | 3.5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally:chooseOne | 18 | 0.51 | 0.0284 | 0.0456 | 0.0456 | 1.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushVc:chooseNStep:add | 12 | 0.5 | 0.0413 | 0.0471 | 0.0471 | 3.6667 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| advise:chooseNStep:add | 5 | 0.39 | 0.0779 | 0.1865 | 0.1865 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| march:chooseNStep:confirm | 13 | 0.37 | 0.0285 | 0.0434 | 0.0434 | 4.6923 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| advise:chooseOne | 10 | 0.35 | 0.035 | 0.0517 | 0.0517 | 2.4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushVc:chooseNStep:confirm | 12 | 0.31 | 0.0258 | 0.0303 | 0.0303 | 4.5833 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| march:chooseNStep:add | 5 | 0.31 | 0.0629 | 0.0664 | 0.0664 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushVc:chooseOne | 11 | 0.24 | 0.0219 | 0.0302 | 0.0302 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| advise:chooseNStep:confirm | 5 | 0.19 | 0.039 | 0.0483 | 0.0483 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate:chooseNStep:confirm | 6 | 0.18 | 0.0293 | 0.0405 | 0.0405 | 6.8333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate:chooseNStep:add | 4 | 0.17 | 0.0423 | 0.0442 | 0.0442 | 7.25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate:chooseOne | 6 | 0.17 | 0.0291 | 0.0478 | 0.0478 | 1.5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushNva:chooseOne | 2 | 0.07 | 0.0341 | 0.0347 | 0.0347 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| chooseNStep:chooseNStep:confirm | 2 | 0.07 | 0.0368 | 0.0374 | 0.0374 | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| airStrike:chooseNStep:confirm | 1 | 0.03 | 0.0281 | 0.0281 | 0.0281 | 9 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| airStrike:chooseOne | 1 | 0.03 | 0.0329 | 0.0329 | 0.0329 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |

## Top Hot Axes In Slow-Tier Seeds

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.

| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms |
|---:|---|---|---:|---:|---:|---:|---:|
| 1 | coupArvnRedeployPolice:chooseOne | continuedDeepening | 66 | 71070.51 | 1076.8259 | 3922.918 | 4791.5072 |
| 2 | train:chooseNStep:add | continuedDeepening | 11 | 18981.7 | 1725.6088 | 3545.7214 | 3545.7214 |
| 3 | train:chooseNStep:confirm | continuedDeepening | 12 | 13017.92 | 1084.8264 | 3229.4758 | 3229.4758 |
| 4 | govern:chooseNStep:confirm | continuedDeepening | 6 | 8220.16 | 1370.0269 | 7094.7612 | 7094.7612 |
| 5 | event | singlePass | 48 | 4670.05 | 97.2926 | 522.5398 | 1792.8138 |
| 6 | govern:chooseNStep:add | continuedDeepening | 6 | 4167.13 | 694.5221 | 2968.6614 | 2968.6614 |
| 7 | coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | 39 | 2502.7 | 64.1718 | 181.9077 | 206.1691 |
| 8 | govern | singlePass | 6 | 1515.88 | 252.6468 | 621.5327 | 621.5327 |
| 9 | coupArvnRedeployMandatory:chooseOne | continuedDeepening | 10 | 919.32 | 91.9324 | 175.5013 | 175.5013 |
| 10 | rally | singlePass | 18 | 586.96 | 32.6089 | 120.1418 | 120.1418 |

## Hot-Path Buckets For Top Slow Axes

Captured only when `--profile-buckets` is enabled. Buckets are timing/count diagnostics inside `PolicyAgent.chooseDecision`; they are not correctness assertions.

### coupArvnRedeployPolice:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 1633342 | 34373.39 |
| evalQuery:countMatchingTokens | 1738266 | 2640.28 |
| zobrist:encodeDecisionStackFrame | 1052 | 85.73 |
| zobrist:digestDecisionStackFrame | 1052 | 56.22 |
| evalQuery:applyTokenFilterCacheHit | 125750 | 0 |
| evalQuery:countMatchingTokensCacheHit | 41188829 | 0 |
| evalQuery:countMatchingTokensCompiled | 1738266 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 125757475 | 0 |
| tokenStateIndex:getCacheHit | 1633342 | 0 |
| tokenStateIndex:refreshCachedEntriesPriorIndexHit | 4228667 | 0 |
| zobrist:decisionStackFrameEncodedChars | 6708311 | 0 |
| zobrist:decisionStackFrameRunLocalCacheMiss | 1052 | 0 |

### train:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 20128 | 3488.25 |
| zobrist:encodeDecisionStackFrame | 21059 | 2094.41 |
| tokenStateIndex:refreshCachedEntries | 19885 | 1840.28 |
| tokenStateIndex:build | 388 | 37.06 |
| evalQuery:applyTokenFilter | 8906 | 29.99 |
| evalQuery:countMatchingTokens | 11727 | 22.9 |
| evalQuery:applyTokenFilterCacheHit | 20424 | 0 |
| evalQuery:applyTokenFilterCompiled | 8906 | 0 |
| evalQuery:countMatchingTokensCacheHit | 2010742 | 0 |
| evalQuery:countMatchingTokensCompiled | 11727 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 5421379 | 0 |
| tokenStateIndex:getCacheHit | 29600 | 0 |

### train:chooseNStep:confirm | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 12646 | 2269.08 |
| tokenStateIndex:refreshCachedEntries | 14324 | 1558.61 |
| zobrist:encodeDecisionStackFrame | 13628 | 1399.92 |
| tokenStateIndex:build | 386 | 34.35 |
| evalQuery:applyTokenFilter | 4528 | 14.67 |
| evalQuery:countMatchingTokens | 6232 | 12.13 |
| evalQuery:applyTokenFilterCacheHit | 20714 | 0 |
| evalQuery:applyTokenFilterCompiled | 4528 | 0 |
| evalQuery:countMatchingTokensCacheHit | 1690423 | 0 |
| evalQuery:countMatchingTokensCompiled | 6232 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 4573840 | 0 |
| tokenStateIndex:getCacheHit | 20141 | 0 |

### govern:chooseNStep:confirm | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 20945 | 475.85 |
| evalQuery:applyTokenFilter | 170131 | 234.51 |
| zobrist:encodeDecisionStackFrame | 264 | 10.9 |
| zobrist:digestDecisionStackFrame | 162 | 8.33 |
| evalQuery:countMatchingTokens | 4146 | 4.23 |
| evalQuery:applyTokenFilterCacheHit | 10017 | 0 |
| evalQuery:applyTokenFilterCompiled | 170131 | 0 |
| evalQuery:countMatchingTokensCacheHit | 511539 | 0 |
| evalQuery:countMatchingTokensCompiled | 4146 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1094788 | 0 |
| tokenStateIndex:getCacheHit | 67568 | 0 |
| tokenStateIndex:refreshCachedEntriesPriorIndexHit | 814 | 0 |

### event | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 8005 | 221.08 |
| evalQuery:applyTokenFilter | 38842 | 187.78 |
| zobrist:digestDecisionStackFrame | 454 | 79.35 |
| evalQuery:countMatchingTokens | 76561 | 70.29 |
| zobrist:encodeDecisionStackFrame | 454 | 49.32 |
| policyWasmRuntime:encodeBytecodeInput | 512 | 12.72 |
| evalQuery:applyTokenFilterCacheHit | 4771 | 0 |
| evalQuery:applyTokenFilterCompiled | 18774 | 0 |
| evalQuery:countMatchingTokensCacheHit | 696383 | 0 |
| evalQuery:countMatchingTokensCompiled | 3176 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1550195 | 0 |
| policyWasmRuntime:encodedInputCacheMiss | 512 | 0 |

### govern:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 8712 | 203.38 |
| evalQuery:applyTokenFilter | 71016 | 88.54 |
| zobrist:encodeDecisionStackFrame | 987 | 37.69 |
| zobrist:digestDecisionStackFrame | 792 | 36.66 |
| evalQuery:countMatchingTokens | 2564 | 2.65 |
| evalQuery:applyTokenFilterCacheHit | 4281 | 0 |
| evalQuery:applyTokenFilterCompiled | 71016 | 0 |
| evalQuery:countMatchingTokensCacheHit | 289927 | 0 |
| evalQuery:countMatchingTokensCompiled | 2564 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 643772 | 0 |
| tokenStateIndex:getCacheHit | 28547 | 0 |
| tokenStateIndex:refreshCachedEntriesPriorIndexHit | 335 | 0 |

### coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 55920 | 482.77 |
| evalQuery:countMatchingTokens | 74344 | 82.71 |
| zobrist:encodeDecisionStackFrame | 96 | 5.97 |
| zobrist:digestDecisionStackFrame | 96 | 3.68 |
| evalQuery:applyTokenFilterCacheHit | 6032 | 0 |
| evalQuery:countMatchingTokensCacheHit | 2537060 | 0 |
| evalQuery:countMatchingTokensCompiled | 74344 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 5932122 | 0 |
| tokenStateIndex:getCacheHit | 55920 | 0 |
| tokenStateIndex:refreshCachedEntriesPriorIndexHit | 84650 | 0 |
| zobrist:decisionStackFrameEncodedChars | 432036 | 0 |
| zobrist:decisionStackFrameRunLocalCacheMiss | 96 | 0 |

### govern | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 2443 | 56.99 |
| evalQuery:applyTokenFilter | 20816 | 44.57 |
| zobrist:digestDecisionStackFrame | 158 | 17.58 |
| zobrist:encodeDecisionStackFrame | 158 | 11.9 |
| evalQuery:countMatchingTokens | 4354 | 5.45 |
| policyWasmRuntime:encodeBytecodeInput | 48 | 1.76 |
| evalQuery:applyTokenFilterCacheHit | 4771 | 0 |
| evalQuery:applyTokenFilterCompiled | 15193 | 0 |
| evalQuery:countMatchingTokensCacheHit | 112448 | 0 |
| evalQuery:countMatchingTokensCompiled | 688 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 236416 | 0 |
| policyWasmRuntime:encodedInputCacheMiss | 48 | 0 |

### coupArvnRedeployMandatory:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 22764 | 203.02 |
| evalQuery:countMatchingTokens | 32131 | 35.8 |
| zobrist:encodeDecisionStackFrame | 32 | 1.82 |
| zobrist:digestDecisionStackFrame | 32 | 1.21 |
| evalQuery:applyTokenFilterCacheHit | 2432 | 0 |
| evalQuery:countMatchingTokensCacheHit | 728298 | 0 |
| evalQuery:countMatchingTokensCompiled | 32131 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1864477 | 0 |
| tokenStateIndex:getCacheHit | 22764 | 0 |
| tokenStateIndex:refreshCachedEntriesPriorIndexHit | 11382 | 0 |
| zobrist:decisionStackFrameEncodedChars | 137372 | 0 |
| zobrist:decisionStackFrameRunLocalCacheMiss | 32 | 0 |

### rally | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 1668 | 37.51 |
| evalQuery:applyTokenFilter | 1385 | 16.84 |
| zobrist:digestDecisionStackFrame | 100 | 7.43 |
| zobrist:encodeDecisionStackFrame | 100 | 5.44 |
| evalQuery:countMatchingTokens | 8001 | 5.2 |
| policyWasmRuntime:encodeBytecodeInput | 72 | 4.04 |
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
