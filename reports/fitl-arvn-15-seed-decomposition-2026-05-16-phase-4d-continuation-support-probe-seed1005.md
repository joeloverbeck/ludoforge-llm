# FITL ARVN 15-Seed Per-Microturn-Class Decomposition

**Date**: 2026-05-16-phase-4d-continuation-support-probe-seed1005
**Status**: Spec 173 measurement witness.
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005 --timeout-ms 400000 --date 2026-05-16-phase-4d-continuation-support-probe-seed1005 --profile-buckets`
**CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4d-continuation-support-probe-seed1005.csv`

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
| 1005 | OK | terminal | 104352.54 | 790 | 132.0918 |  |

## Per-Microturn-Class Rollup

| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | WASM preview-drive routes | WASM preview-drive unsupported | WASM preview-drive unsupported reasons | WASM preview-drive batches | Token index builds | Static rebuilds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|
| coupArvnRedeployPolice:chooseOne | 66 | 42057.09 | 637.2286 | 2181.6016 | 2641.2643 | 26.7121 | 0 | 60935 | 2466 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| train:chooseNStep:add | 11 | 17626.11 | 1602.3734 | 3369.9636 | 3369.9636 | 14.4545 | 0 | 6998 | 9498 | 0 | 0 | 2 | 148 | agent-guided-completion/production-deep-choosenstep-continuation.pickInnerDecision/deep preview-drive selected a non-chooseNStep continuation decision:143; unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:5 | 0 | 388 | 0 |
| train:chooseNStep:confirm | 15 | 11910.09 | 794.0059 | 3067.2193 | 3067.2193 | 8.7333 | 0 | 4429 | 5965 | 0 | 0 | 8 | 97 | agent-guided-completion/production-deep-choosenstep-continuation.pickInnerDecision/deep preview-drive selected a non-chooseNStep continuation decision:94; unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:3 | 0 | 386 | 0 |
| govern:chooseNStep:confirm | 6 | 7579.78 | 1263.297 | 6533.9028 | 6533.9028 | 7.5 | 0 | 159 | 72 | 0 | 0 | 0 | 33 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:33 | 0 | 0 | 0 |
| event | 48 | 4672.51 | 97.3439 | 513.4914 | 1874.1086 | 28.6667 | 48 | 0 | 0 | 48 | 22 | 0 | 50 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:50 | 0 | 0 | 50 |
| govern:chooseNStep:add | 6 | 4033.82 | 672.3027 | 2864.0104 | 2864.0104 | 6.5 | 0 | 228 | 363 | 0 | 0 | 0 | 39 | agent-guided-completion/production-deep-choosenstep-continuation.pickInnerDecision/deep preview-drive selected a non-chooseNStep continuation decision:39 | 0 | 0 | 0 |
| coupArvnRedeployOptionalTroops:chooseOne | 39 | 2198.78 | 56.3789 | 156.7185 | 159.3589 | 8 | 0 | 2681 | 383 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| govern | 9 | 1476.33 | 164.0369 | 604.8253 | 604.8253 | 10.5556 | 9 | 0 | 0 | 9 | 8 | 0 | 12 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:12 | 3 | 0 | 9 |
| coupArvnRedeployMandatory:chooseOne | 10 | 718.83 | 71.8835 | 127.8538 | 127.8538 | 8 | 0 | 1078 | 154 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally | 18 | 575.21 | 31.956 | 120.1502 | 120.1502 | 38.9444 | 18 | 0 | 0 | 18 | 4 | 0 | 36 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:36 | 0 | 0 | 18 |
| assault:chooseNStep:add | 6 | 508.39 | 84.7324 | 148.7608 | 148.7608 | 3 | 0 | 66 | 84 | 0 | 0 | 2 | 13 | agent-guided-completion/production-deep-choosenstep-continuation.pickInnerDecision/deep preview-drive selected a non-chooseNStep continuation decision:13 | 0 | 82 | 0 |
| train | 5 | 420.04 | 84.0082 | 188.4811 | 188.4811 | 9.4 | 5 | 0 | 0 | 5 | 0 | 0 | 10 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:10 | 0 | 0 | 5 |
| transport:chooseOne | 6 | 388.91 | 64.8175 | 97.3856 | 97.3856 | 12.3333 | 0 | 239 | 14 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| assault:chooseNStep:confirm | 7 | 307.5 | 43.9293 | 92.9291 | 92.9291 | 3.4286 | 0 | 43 | 38 | 0 | 0 | 0 | 10 | agent-guided-completion/production-deep-choosenstep-continuation.pickInnerDecision/deep preview-drive selected a non-chooseNStep continuation decision:9; unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:1 | 0 | 36 | 0 |
| transport | 3 | 168.62 | 56.2075 | 69.441 | 69.441 | 10.6667 | 3 | 0 | 0 | 3 | 0 | 0 | 6 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:6 | 0 | 0 | 3 |
| train:chooseOne | 9 | 67.46 | 7.4951 | 12.6773 | 12.6773 | 2.2222 | 0 | 30 | 34 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| coupArvnRedeployPolice | 26 | 55.67 | 2.1411 | 3.5891 | 4.7238 | 6.1923 | 26 | 0 | 0 | 26 | 0 | 0 | 21 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:21 | 26 | 0 | 26 |
| coupRedeployPass | 20 | 47.58 | 2.3788 | 3.903 | 4.7155 | 1 | 13 | 0 | 7 | 13 | 0 | 0 | 0 |  | 20 | 0 | 13 |
| attack | 12 | 42.43 | 3.5357 | 7.9395 | 7.9395 | 54.5 | 9 | 0 | 3 | 9 | 0 | 0 | 0 |  | 12 | 0 | 9 |
| ambushVc | 11 | 39.17 | 3.5609 | 4.7159 | 4.7159 | 51 | 10 | 0 | 1 | 10 | 0 | 0 | 0 |  | 11 | 0 | 10 |
| assault | 16 | 37.63 | 2.3518 | 4.5707 | 4.5707 | 9 | 14 | 0 | 2 | 14 | 0 | 0 | 11 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:11 | 16 | 0 | 14 |
| coupNvaRedeployTroops | 18 | 35.12 | 1.9509 | 4.0114 | 4.0114 | 3.8333 | 14 | 0 | 4 | 14 | 0 | 0 | 14 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:14 | 18 | 0 | 14 |
| ambushNva | 2 | 34.78 | 17.3891 | 28.3438 | 28.3438 | 103.5 | 1 | 0 | 1 | 1 | 0 | 0 | 1 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:1 | 1 | 0 | 1 |
| coupArvnRedeployOptionalTroops | 16 | 33.07 | 2.0671 | 3.2971 | 3.2971 | 9.6875 | 12 | 0 | 4 | 12 | 0 | 0 | 12 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:12 | 16 | 0 | 12 |
| coupCommitmentPass | 20 | 30.6 | 1.5299 | 2.7107 | 2.8709 | 1.25 | 0 | 0 | 20 | 0 | 0 | 0 | 0 |  | 20 | 0 | 0 |
| govern:chooseOne | 9 | 30.33 | 3.3696 | 4.6183 | 4.6183 | 2 | 0 | 9 | 9 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate | 4 | 27.45 | 6.8635 | 10.0669 | 10.0669 | 94.25 | 2 | 0 | 2 | 2 | 0 | 0 | 0 |  | 4 | 0 | 2 |
| coupPacifyPass | 10 | 26.35 | 2.6346 | 4.252 | 4.252 | 1.3 | 7 | 0 | 3 | 7 | 0 | 0 | 0 |  | 10 | 0 | 7 |
| pass | 6 | 21.49 | 3.5819 | 5.269 | 5.269 | 3.6667 | 6 | 0 | 0 | 6 | 0 | 0 | 0 |  | 6 | 0 | 6 |
| coupPacifyARVN | 8 | 16.67 | 2.0841 | 2.8105 | 2.8105 | 4.375 | 6 | 0 | 2 | 6 | 0 | 0 | 5 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:5 | 8 | 0 | 6 |
| march | 5 | 16.5 | 3.2996 | 5.5529 | 5.5529 | 33.4 | 3 | 0 | 2 | 3 | 0 | 0 | 0 |  | 5 | 0 | 3 |
| advise | 5 | 14.16 | 2.8322 | 3.8635 | 3.8635 | 9.6 | 3 | 0 | 2 | 3 | 0 | 0 | 0 |  | 5 | 0 | 3 |
| coupVictoryCheck | 5 | 12.86 | 2.5718 | 3.6465 | 3.6465 | 1 | 5 | 0 | 0 | 5 | 0 | 0 | 0 |  | 5 | 0 | 5 |
| coupResourcesResolve | 5 | 9.83 | 1.9651 | 2.3657 | 2.3657 | 1 | 0 | 0 | 5 | 0 | 0 | 0 | 0 |  | 5 | 0 | 0 |
| coupAgitatePass | 5 | 7.9 | 1.5796 | 1.6846 | 1.6846 | 6.6 | 0 | 0 | 5 | 0 | 0 | 0 | 0 |  | 5 | 0 | 0 |
| chooseOne:chooseOne | 3 | 6.84 | 2.2797 | 6.258 | 6.258 | 6.3333 | 0 | 3 | 1 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| coupArvnRedeployMandatory | 2 | 4.02 | 2.0101 | 2.5945 | 2.5945 | 10.5 | 1 | 0 | 1 | 1 | 0 | 0 | 1 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:1 | 2 | 0 | 1 |
| coupNvaRedeployTroops:chooseOne | 68 | 2.52 | 0.037 | 0.0524 | 0.0681 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| airStrike | 1 | 2.35 | 2.3501 | 2.3501 | 2.3501 | 2 | 1 | 0 | 0 | 1 | 0 | 0 | 0 |  | 1 | 0 | 1 |
| event-decision:chooseNStep:add | 39 | 1.67 | 0.0429 | 0.081 | 0.1194 | 16.1538 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| event-decision:chooseNStep:confirm | 28 | 1.01 | 0.0362 | 0.0607 | 0.0622 | 6.9286 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally:chooseNStep:add | 18 | 0.99 | 0.0551 | 0.0955 | 0.0955 | 25.6111 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally:chooseNStep:confirm | 29 | 0.93 | 0.032 | 0.0558 | 0.0648 | 22.4828 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| event-decision:chooseOne | 22 | 0.85 | 0.0388 | 0.0621 | 0.0684 | 3.5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally:chooseOne | 18 | 0.5 | 0.0279 | 0.0435 | 0.0435 | 1.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushVc:chooseNStep:add | 12 | 0.48 | 0.04 | 0.0482 | 0.0482 | 3.6667 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| advise:chooseOne | 10 | 0.4 | 0.0401 | 0.0741 | 0.0741 | 2.4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushVc:chooseNStep:confirm | 12 | 0.38 | 0.0315 | 0.0546 | 0.0546 | 4.5833 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| march:chooseNStep:confirm | 13 | 0.38 | 0.0291 | 0.0454 | 0.0454 | 4.6923 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| advise:chooseNStep:add | 5 | 0.36 | 0.0717 | 0.1295 | 0.1295 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| march:chooseNStep:add | 5 | 0.32 | 0.0643 | 0.0699 | 0.0699 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushVc:chooseOne | 11 | 0.24 | 0.022 | 0.0318 | 0.0318 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| advise:chooseNStep:confirm | 5 | 0.2 | 0.0407 | 0.0532 | 0.0532 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate:chooseNStep:confirm | 6 | 0.2 | 0.0339 | 0.0468 | 0.0468 | 6.8333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate:chooseOne | 6 | 0.19 | 0.0316 | 0.0575 | 0.0575 | 1.5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate:chooseNStep:add | 4 | 0.18 | 0.0442 | 0.0533 | 0.0533 | 7.25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| chooseNStep:chooseNStep:confirm | 2 | 0.08 | 0.0415 | 0.0493 | 0.0493 | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushNva:chooseOne | 2 | 0.06 | 0.0322 | 0.0346 | 0.0346 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| airStrike:chooseNStep:confirm | 1 | 0.04 | 0.0363 | 0.0363 | 0.0363 | 9 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| airStrike:chooseOne | 1 | 0.04 | 0.0397 | 0.0397 | 0.0397 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |

## Top Hot Axes In Slow-Tier Seeds

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.

| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms |
|---:|---|---|---:|---:|---:|---:|---:|
| 1 | coupArvnRedeployPolice:chooseOne | continuedDeepening | 66 | 42057.09 | 637.2286 | 2181.6016 | 2641.2643 |
| 2 | train:chooseNStep:add | continuedDeepening | 11 | 17626.11 | 1602.3734 | 3369.9636 | 3369.9636 |
| 3 | train:chooseNStep:confirm | continuedDeepening | 12 | 11909.77 | 992.4806 | 3067.2193 | 3067.2193 |
| 4 | govern:chooseNStep:confirm | continuedDeepening | 6 | 7579.78 | 1263.297 | 6533.9028 | 6533.9028 |
| 5 | event | singlePass | 48 | 4672.51 | 97.3439 | 513.4914 | 1874.1086 |
| 6 | govern:chooseNStep:add | continuedDeepening | 6 | 4033.82 | 672.3027 | 2864.0104 | 2864.0104 |
| 7 | coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | 39 | 2198.78 | 56.3789 | 156.7185 | 159.3589 |
| 8 | govern | singlePass | 6 | 1464.33 | 244.0545 | 604.8253 | 604.8253 |
| 9 | coupArvnRedeployMandatory:chooseOne | continuedDeepening | 10 | 718.83 | 71.8835 | 127.8538 | 127.8538 |
| 10 | rally | singlePass | 18 | 575.21 | 31.956 | 120.1502 | 120.1502 |

## Hot-Path Buckets For Top Slow Axes

Captured only when `--profile-buckets` is enabled. Buckets are timing/count diagnostics inside `PolicyAgent.chooseDecision`; they are not correctness assertions.

### coupArvnRedeployPolice:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| policyPreviewInner:chooseOne:loopPublish | 2400 | 37193.94 |
| publish:chooseOne:legalActions | 2400 | 37169 |
| publish:isSupportedFrameContinuationMove | 61638 | 37106.96 |
| publish:isSupportedContinuationResult:probeMoveViability | 61638 | 32644.45 |
| tokenStateIndex:refreshCachedEntries | 1633342 | 6766.59 |
| publish:isSupportedFrameContinuationMove:resumeSuspendedEffectFrame | 61638 | 4173.54 |
| evalQuery:countMatchingTokens | 1738266 | 2771.35 |
| policyPreviewInner:chooseOne:loopPickInnerDecision | 2400 | 1715.39 |
| policyPreviewInner:chooseOne:canonicalizeForExit | 1763 | 815.21 |
| policyPreviewInner:chooseOne:loopApply | 2400 | 730.01 |
| policyPreviewInner:chooseOne:resolveRefs | 1763 | 700.82 |
| policyPreviewInner:chooseOne:initialApply | 1763 | 540.78 |

### train:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 20128 | 3512.32 |
| publish:isSupportedFrameContinuationMove | 4008 | 2566.51 |
| zobrist:encodeDecisionStackFrame | 21059 | 2081.05 |
| publish:isSupportedContinuationResult:probeMoveViability | 7422 | 1911.66 |
| publish:chooseOne:legalActions | 762 | 1095.32 |
| publish:isSupportedContinuationResult:isBridgeableNextDecision | 4327 | 557.67 |
| tokenStateIndex:refreshCachedEntries | 19885 | 374.21 |
| publish:isSupportedFrameContinuationMove:resumeSuspendedEffectFrame | 4008 | 277.54 |
| evalQuery:applyTokenFilter | 8906 | 29.54 |
| evalQuery:countMatchingTokens | 11727 | 27.71 |
| tokenStateIndex:build | 388 | 15.62 |
| publish:chooseOne:rebuildMoveFromFrame | 762 | 4.63 |

### train:chooseNStep:confirm | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 12646 | 2287.2 |
| publish:isSupportedFrameContinuationMove | 3160 | 2135.3 |
| publish:isSupportedContinuationResult:probeMoveViability | 6802 | 1656.5 |
| zobrist:encodeDecisionStackFrame | 13628 | 1385.55 |
| publish:chooseOne:legalActions | 607 | 902.2 |
| publish:isSupportedContinuationResult:isBridgeableNextDecision | 3254 | 388.58 |
| tokenStateIndex:refreshCachedEntries | 14324 | 227.11 |
| publish:isSupportedFrameContinuationMove:resumeSuspendedEffectFrame | 3160 | 212.73 |
| tokenStateIndex:build | 386 | 14.09 |
| evalQuery:countMatchingTokens | 6232 | 13.5 |
| evalQuery:applyTokenFilter | 4528 | 12.97 |
| publish:chooseOne:rebuildMoveFromFrame | 607 | 3.84 |

### govern:chooseNStep:confirm | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 20945 | 318.51 |
| evalQuery:applyTokenFilter | 170131 | 206.96 |
| publish:isSupportedContinuationResult:probeMoveViability | 1686 | 151.66 |
| publish:isSupportedFrameContinuationMove | 231 | 63.47 |
| publish:chooseOne:legalActions | 66 | 41.27 |
| zobrist:encodeDecisionStackFrame | 264 | 10.31 |
| publish:isSupportedFrameContinuationMove:resumeSuspendedEffectFrame | 231 | 9.56 |
| zobrist:digestDecisionStackFrame | 162 | 8.31 |
| publish:isSupportedContinuationResult:isBridgeableNextDecision | 633 | 5.73 |
| evalQuery:countMatchingTokens | 4146 | 4.49 |
| publish:isSupportedContinuationResult:isPublishedMoveAdmitted | 1686 | 0.31 |
| publish:chooseOne:rebuildMoveFromFrame | 66 | 0.22 |

### event | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| publish:isSupportedContinuationResult:probeMoveViability | 2788 | 615.96 |
| publish:isSupportedFrameContinuationMove | 1412 | 600.51 |
| evalQuery:applyTokenFilter | 38842 | 187.43 |
| tokenStateIndex:refreshCachedEntries | 8005 | 134.83 |
| publish:isSupportedFrameContinuationMove:resumeSuspendedEffectFrame | 1412 | 108.32 |
| publish:isSupportedContinuationResult:isBridgeableNextDecision | 1528 | 79.36 |
| zobrist:digestDecisionStackFrame | 454 | 78.62 |
| evalQuery:countMatchingTokens | 76561 | 65.61 |
| zobrist:encodeDecisionStackFrame | 454 | 47.9 |
| policyWasmRuntime:encodeBytecodeInput | 512 | 13.6 |
| publish:isSupportedContinuationResult:isPublishedMoveAdmitted | 2788 | 3.5 |
| evalQuery:applyTokenFilterCacheHit | 4771 | 0 |

### govern:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| publish:isSupportedFrameContinuationMove | 1227 | 324.84 |
| publish:isSupportedContinuationResult:probeMoveViability | 1792 | 296.45 |
| tokenStateIndex:refreshCachedEntries | 8712 | 131.86 |
| evalQuery:applyTokenFilter | 71016 | 89.95 |
| publish:chooseOne:legalActions | 117 | 77.04 |
| publish:isSupportedFrameContinuationMove:resumeSuspendedEffectFrame | 1227 | 46.91 |
| zobrist:encodeDecisionStackFrame | 987 | 36.86 |
| publish:isSupportedContinuationResult:isBridgeableNextDecision | 1333 | 36.67 |
| zobrist:digestDecisionStackFrame | 792 | 36.64 |
| evalQuery:countMatchingTokens | 2564 | 2.58 |
| publish:chooseOne:rebuildMoveFromFrame | 117 | 0.44 |
| publish:isSupportedContinuationResult:isPublishedMoveAdmitted | 1792 | 0.28 |

### coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| policyPreviewInner:chooseOne:loopPublish | 344 | 1518.55 |
| publish:chooseOne:legalActions | 344 | 1516.06 |
| publish:isSupportedFrameContinuationMove | 2752 | 1512.11 |
| publish:isSupportedContinuationResult:probeMoveViability | 2752 | 1331.92 |
| tokenStateIndex:refreshCachedEntries | 55920 | 302.47 |
| publish:isSupportedFrameContinuationMove:resumeSuspendedEffectFrame | 2752 | 167.91 |
| policyPreviewInner:chooseOne:resolveRefs | 312 | 145.97 |
| policyPreviewInner:chooseOne:canonicalizeForExit | 312 | 133.84 |
| policyPreviewInner:chooseOne:loopApply | 344 | 126.3 |
| policyPreviewInner:chooseOne:initialApply | 312 | 106.71 |
| policyPreviewInner:chooseOne:loopPickInnerDecision | 344 | 98.6 |
| evalQuery:countMatchingTokens | 74344 | 85.45 |

### govern | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| publish:isSupportedContinuationResult:probeMoveViability | 631 | 266.57 |
| publish:isSupportedFrameContinuationMove | 566 | 164.29 |
| evalQuery:applyTokenFilter | 20816 | 42.16 |
| tokenStateIndex:refreshCachedEntries | 2443 | 35.56 |
| publish:isSupportedFrameContinuationMove:resumeSuspendedEffectFrame | 566 | 25.75 |
| zobrist:digestDecisionStackFrame | 158 | 17.31 |
| publish:isSupportedContinuationResult:isBridgeableNextDecision | 573 | 11.86 |
| zobrist:encodeDecisionStackFrame | 158 | 11.5 |
| evalQuery:countMatchingTokens | 4354 | 5.16 |
| policyWasmRuntime:encodeBytecodeInput | 48 | 4.04 |
| publish:isSupportedContinuationResult:isPublishedMoveAdmitted | 631 | 0.08 |
| evalQuery:applyTokenFilterCacheHit | 4771 | 0 |

### coupArvnRedeployMandatory:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| policyPreviewInner:chooseOne:loopPublish | 144 | 534.6 |
| publish:chooseOne:legalActions | 144 | 533.74 |
| publish:isSupportedFrameContinuationMove | 1152 | 532.42 |
| publish:isSupportedContinuationResult:probeMoveViability | 1152 | 464.83 |
| tokenStateIndex:refreshCachedEntries | 22764 | 99.47 |
| publish:isSupportedFrameContinuationMove:resumeSuspendedEffectFrame | 1152 | 61.71 |
| policyPreviewInner:chooseOne:loopApply | 144 | 49 |
| policyPreviewInner:chooseOne:loopPickInnerDecision | 144 | 37.69 |
| policyPreviewInner:chooseOne:resolveRefs | 80 | 32.88 |
| evalQuery:countMatchingTokens | 32131 | 32.72 |
| policyPreviewInner:chooseOne:canonicalizeForExit | 80 | 29.16 |
| policyPreviewInner:chooseOne:initialApply | 80 | 20.01 |

### rally | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| publish:isSupportedContinuationResult:probeMoveViability | 855 | 105.34 |
| publish:isSupportedFrameContinuationMove | 154 | 72.12 |
| tokenStateIndex:refreshCachedEntries | 1668 | 26.07 |
| evalQuery:applyTokenFilter | 1385 | 14.7 |
| publish:isSupportedContinuationResult:isBridgeableNextDecision | 185 | 11.13 |
| publish:isSupportedFrameContinuationMove:resumeSuspendedEffectFrame | 154 | 9.32 |
| evalQuery:countMatchingTokens | 8001 | 8.39 |
| zobrist:digestDecisionStackFrame | 100 | 7.57 |
| zobrist:encodeDecisionStackFrame | 100 | 5.62 |
| policyWasmRuntime:encodeBytecodeInput | 72 | 2.83 |
| publish:isSupportedContinuationResult:isPublishedMoveAdmitted | 855 | 0.13 |
| evalQuery:applyTokenFilterCacheHit | 1519 | 0 |


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
