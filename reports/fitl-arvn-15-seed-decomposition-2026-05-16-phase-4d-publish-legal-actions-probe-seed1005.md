# FITL ARVN 15-Seed Per-Microturn-Class Decomposition

**Date**: 2026-05-16-phase-4d-publish-legal-actions-probe-seed1005
**Status**: Spec 173 measurement witness.
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005 --timeout-ms 400000 --date 2026-05-16-phase-4d-publish-legal-actions-probe-seed1005 --profile-buckets`
**CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4d-publish-legal-actions-probe-seed1005.csv`

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
| 1005 | OK | terminal | 105280.45 | 790 | 133.2664 |  |

## Per-Microturn-Class Rollup

| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | WASM preview-drive routes | WASM preview-drive unsupported | WASM preview-drive unsupported reasons | WASM preview-drive batches | Token index builds | Static rebuilds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|
| coupArvnRedeployPolice:chooseOne | 66 | 42552.79 | 644.7393 | 2103.5002 | 2615.8512 | 26.7121 | 0 | 60935 | 2466 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| train:chooseNStep:add | 11 | 17211.21 | 1564.655 | 3290.5903 | 3290.5903 | 14.4545 | 0 | 6998 | 9498 | 0 | 0 | 2 | 148 | agent-guided-completion/production-deep-choosenstep-continuation.pickInnerDecision/deep preview-drive selected a non-chooseNStep continuation decision:143; unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:5 | 0 | 388 | 0 |
| train:chooseNStep:confirm | 15 | 11288.59 | 752.5726 | 3060.4108 | 3060.4108 | 8.7333 | 0 | 4429 | 5965 | 0 | 0 | 8 | 97 | agent-guided-completion/production-deep-choosenstep-continuation.pickInnerDecision/deep preview-drive selected a non-chooseNStep continuation decision:94; unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:3 | 0 | 386 | 0 |
| govern:chooseNStep:confirm | 6 | 8043.94 | 1340.6569 | 6953.4936 | 6953.4936 | 7.5 | 0 | 159 | 72 | 0 | 0 | 0 | 33 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:33 | 0 | 0 | 0 |
| event | 48 | 4810.76 | 100.2241 | 521.6282 | 1974.4684 | 28.6667 | 48 | 0 | 0 | 48 | 22 | 0 | 50 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:50 | 0 | 0 | 50 |
| govern:chooseNStep:add | 6 | 4237.69 | 706.2811 | 2988.9125 | 2988.9125 | 6.5 | 0 | 228 | 363 | 0 | 0 | 0 | 39 | agent-guided-completion/production-deep-choosenstep-continuation.pickInnerDecision/deep preview-drive selected a non-chooseNStep continuation decision:39 | 0 | 0 | 0 |
| coupArvnRedeployOptionalTroops:chooseOne | 39 | 2317.37 | 59.4196 | 166.6466 | 168.4204 | 8 | 0 | 2681 | 383 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| govern | 9 | 1583.81 | 175.9792 | 711.983 | 711.983 | 10.5556 | 9 | 0 | 0 | 9 | 8 | 0 | 12 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:12 | 3 | 0 | 9 |
| coupArvnRedeployMandatory:chooseOne | 10 | 788.48 | 78.8484 | 142.8488 | 142.8488 | 8 | 0 | 1078 | 154 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally | 18 | 606.68 | 33.7046 | 122.8367 | 122.8367 | 38.9444 | 18 | 0 | 0 | 18 | 4 | 0 | 36 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:36 | 0 | 0 | 18 |
| assault:chooseNStep:add | 6 | 498.74 | 83.1238 | 145.1333 | 145.1333 | 3 | 0 | 66 | 84 | 0 | 0 | 2 | 13 | agent-guided-completion/production-deep-choosenstep-continuation.pickInnerDecision/deep preview-drive selected a non-chooseNStep continuation decision:13 | 0 | 82 | 0 |
| train | 5 | 432.98 | 86.5951 | 184.1003 | 184.1003 | 9.4 | 5 | 0 | 0 | 5 | 0 | 0 | 10 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:10 | 0 | 0 | 5 |
| transport:chooseOne | 6 | 396.05 | 66.0083 | 95.1677 | 95.1677 | 12.3333 | 0 | 239 | 14 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| assault:chooseNStep:confirm | 7 | 312.48 | 44.6401 | 94.7763 | 94.7763 | 3.4286 | 0 | 43 | 38 | 0 | 0 | 0 | 10 | agent-guided-completion/production-deep-choosenstep-continuation.pickInnerDecision/deep preview-drive selected a non-chooseNStep continuation decision:9; unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:1 | 0 | 36 | 0 |
| transport | 3 | 177.71 | 59.2378 | 71.4278 | 71.4278 | 10.6667 | 3 | 0 | 0 | 3 | 0 | 0 | 6 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:6 | 0 | 0 | 3 |
| train:chooseOne | 9 | 67.39 | 7.4876 | 15.3285 | 15.3285 | 2.2222 | 0 | 30 | 34 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| coupArvnRedeployPolice | 26 | 55.19 | 2.1228 | 3.2051 | 3.6685 | 6.1923 | 26 | 0 | 0 | 26 | 0 | 0 | 21 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:21 | 26 | 0 | 26 |
| coupRedeployPass | 20 | 50.35 | 2.5174 | 5.2619 | 6.2072 | 1 | 13 | 0 | 7 | 13 | 0 | 0 | 0 |  | 20 | 0 | 13 |
| ambushVc | 11 | 44.73 | 4.0667 | 6.0598 | 6.0598 | 51 | 10 | 0 | 1 | 10 | 0 | 0 | 0 |  | 11 | 0 | 10 |
| attack | 12 | 41.57 | 3.464 | 9.0946 | 9.0946 | 54.5 | 9 | 0 | 3 | 9 | 0 | 0 | 0 |  | 12 | 0 | 9 |
| assault | 16 | 40.53 | 2.5331 | 4.8749 | 4.8749 | 9 | 14 | 0 | 2 | 14 | 0 | 0 | 11 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:11 | 16 | 0 | 14 |
| coupNvaRedeployTroops | 18 | 36.91 | 2.0507 | 3.7588 | 3.7588 | 3.8333 | 14 | 0 | 4 | 14 | 0 | 0 | 14 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:14 | 18 | 0 | 14 |
| coupCommitmentPass | 20 | 35.81 | 1.7905 | 3.3564 | 3.476 | 1.25 | 0 | 0 | 20 | 0 | 0 | 0 | 0 |  | 20 | 0 | 0 |
| coupArvnRedeployOptionalTroops | 16 | 35.72 | 2.2323 | 4.6678 | 4.6678 | 9.6875 | 12 | 0 | 4 | 12 | 0 | 0 | 12 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:12 | 16 | 0 | 12 |
| ambushNva | 2 | 34.24 | 17.1219 | 27.7422 | 27.7422 | 103.5 | 1 | 0 | 1 | 1 | 0 | 0 | 1 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:1 | 1 | 0 | 1 |
| govern:chooseOne | 9 | 29.27 | 3.2523 | 4.0429 | 4.0429 | 2 | 0 | 9 | 9 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate | 4 | 25.34 | 6.334 | 9.8252 | 9.8252 | 94.25 | 2 | 0 | 2 | 2 | 0 | 0 | 0 |  | 4 | 0 | 2 |
| coupPacifyPass | 10 | 19.66 | 1.9657 | 3.4499 | 3.4499 | 1.3 | 7 | 0 | 3 | 7 | 0 | 0 | 0 |  | 10 | 0 | 7 |
| coupPacifyARVN | 8 | 18.76 | 2.345 | 2.98 | 2.98 | 4.375 | 6 | 0 | 2 | 6 | 0 | 0 | 5 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:5 | 8 | 0 | 6 |
| pass | 6 | 17.02 | 2.8364 | 4.2634 | 4.2634 | 3.6667 | 6 | 0 | 0 | 6 | 0 | 0 | 0 |  | 6 | 0 | 6 |
| march | 5 | 16.49 | 3.2988 | 5.3333 | 5.3333 | 33.4 | 3 | 0 | 2 | 3 | 0 | 0 | 0 |  | 5 | 0 | 3 |
| advise | 5 | 14.86 | 2.9719 | 4.4747 | 4.4747 | 9.6 | 3 | 0 | 2 | 3 | 0 | 0 | 0 |  | 5 | 0 | 3 |
| coupResourcesResolve | 5 | 14.23 | 2.8455 | 3.9141 | 3.9141 | 1 | 0 | 0 | 5 | 0 | 0 | 0 | 0 |  | 5 | 0 | 0 |
| coupVictoryCheck | 5 | 10.61 | 2.1226 | 3.268 | 3.268 | 1 | 5 | 0 | 0 | 5 | 0 | 0 | 0 |  | 5 | 0 | 5 |
| coupAgitatePass | 5 | 9.29 | 1.8574 | 2.4636 | 2.4636 | 6.6 | 0 | 0 | 5 | 0 | 0 | 0 | 0 |  | 5 | 0 | 0 |
| chooseOne:chooseOne | 3 | 6.12 | 2.0402 | 5.327 | 5.327 | 6.3333 | 0 | 3 | 1 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| coupArvnRedeployMandatory | 2 | 6 | 2.9978 | 4.2997 | 4.2997 | 10.5 | 1 | 0 | 1 | 1 | 0 | 0 | 1 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:1 | 2 | 0 | 1 |
| airStrike | 1 | 3.82 | 3.8201 | 3.8201 | 3.8201 | 2 | 1 | 0 | 0 | 1 | 0 | 0 | 0 |  | 1 | 0 | 1 |
| coupNvaRedeployTroops:chooseOne | 68 | 3.62 | 0.0533 | 0.102 | 0.1384 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| advise:chooseNStep:add | 5 | 2.09 | 0.4184 | 1.874 | 1.874 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| event-decision:chooseNStep:add | 39 | 1.63 | 0.0417 | 0.0752 | 0.0768 | 16.1538 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally:chooseNStep:add | 18 | 1 | 0.0554 | 0.097 | 0.097 | 25.6111 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally:chooseNStep:confirm | 29 | 0.95 | 0.0327 | 0.0658 | 0.066 | 22.4828 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| event-decision:chooseNStep:confirm | 28 | 0.86 | 0.0307 | 0.0423 | 0.0444 | 6.9286 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| event-decision:chooseOne | 22 | 0.83 | 0.0376 | 0.0643 | 0.0746 | 3.5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally:chooseOne | 18 | 0.52 | 0.0286 | 0.0486 | 0.0486 | 1.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushVc:chooseNStep:add | 12 | 0.49 | 0.0411 | 0.0513 | 0.0513 | 3.6667 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| advise:chooseOne | 10 | 0.47 | 0.047 | 0.0911 | 0.0911 | 2.4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| march:chooseNStep:confirm | 13 | 0.36 | 0.0279 | 0.0358 | 0.0358 | 4.6923 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| march:chooseNStep:add | 5 | 0.35 | 0.0702 | 0.0771 | 0.0771 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushVc:chooseNStep:confirm | 12 | 0.32 | 0.0271 | 0.0561 | 0.0561 | 4.5833 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushVc:chooseOne | 11 | 0.25 | 0.0224 | 0.0348 | 0.0348 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate:chooseOne | 6 | 0.23 | 0.0378 | 0.054 | 0.054 | 1.5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| advise:chooseNStep:confirm | 5 | 0.21 | 0.0417 | 0.0771 | 0.0771 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate:chooseNStep:add | 4 | 0.18 | 0.0451 | 0.0536 | 0.0536 | 7.25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate:chooseNStep:confirm | 6 | 0.18 | 0.0297 | 0.0432 | 0.0432 | 6.8333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushNva:chooseOne | 2 | 0.07 | 0.034 | 0.0349 | 0.0349 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| chooseNStep:chooseNStep:confirm | 2 | 0.07 | 0.0359 | 0.0384 | 0.0384 | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| airStrike:chooseOne | 1 | 0.04 | 0.0402 | 0.0402 | 0.0402 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| airStrike:chooseNStep:confirm | 1 | 0.03 | 0.0336 | 0.0336 | 0.0336 | 9 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |

## Top Hot Axes In Slow-Tier Seeds

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.

| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms |
|---:|---|---|---:|---:|---:|---:|---:|
| 1 | coupArvnRedeployPolice:chooseOne | continuedDeepening | 66 | 42552.79 | 644.7393 | 2103.5002 | 2615.8512 |
| 2 | train:chooseNStep:add | continuedDeepening | 11 | 17211.21 | 1564.655 | 3290.5903 | 3290.5903 |
| 3 | train:chooseNStep:confirm | continuedDeepening | 12 | 11288.3 | 940.6919 | 3060.4108 | 3060.4108 |
| 4 | govern:chooseNStep:confirm | continuedDeepening | 6 | 8043.94 | 1340.6569 | 6953.4936 | 6953.4936 |
| 5 | event | singlePass | 48 | 4810.76 | 100.2241 | 521.6282 | 1974.4684 |
| 6 | govern:chooseNStep:add | continuedDeepening | 6 | 4237.69 | 706.2811 | 2988.9125 | 2988.9125 |
| 7 | coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | 39 | 2317.37 | 59.4196 | 166.6466 | 168.4204 |
| 8 | govern | singlePass | 6 | 1570.94 | 261.8232 | 711.983 | 711.983 |
| 9 | coupArvnRedeployMandatory:chooseOne | continuedDeepening | 10 | 788.48 | 78.8484 | 142.8488 | 142.8488 |
| 10 | rally | singlePass | 18 | 606.68 | 33.7046 | 122.8367 | 122.8367 |

## Hot-Path Buckets For Top Slow Axes

Captured only when `--profile-buckets` is enabled. Buckets are timing/count diagnostics inside `PolicyAgent.chooseDecision`; they are not correctness assertions.

### coupArvnRedeployPolice:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| policyPreviewInner:chooseOne:loopPublish | 2400 | 37565.88 |
| publish:chooseOne:legalActions | 2400 | 37537.12 |
| publish:isSupportedFrameContinuationMove | 61638 | 37472.3 |
| tokenStateIndex:refreshCachedEntries | 1633342 | 7057.22 |
| evalQuery:countMatchingTokens | 1738266 | 2684.09 |
| policyPreviewInner:chooseOne:loopPickInnerDecision | 2400 | 1736.42 |
| policyPreviewInner:chooseOne:canonicalizeForExit | 1763 | 845.41 |
| policyPreviewInner:chooseOne:loopApply | 2400 | 769.35 |
| policyPreviewInner:chooseOne:resolveRefs | 1763 | 716.17 |
| policyPreviewInner:chooseOne:initialApply | 1763 | 555.53 |
| zobrist:digestDecisionStackFrame | 1052 | 55.62 |
| zobrist:encodeDecisionStackFrame | 1052 | 54.03 |

### train:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 20128 | 3450.02 |
| publish:isSupportedFrameContinuationMove | 4008 | 2487.26 |
| zobrist:encodeDecisionStackFrame | 21059 | 2040.81 |
| publish:chooseOne:legalActions | 762 | 1061.81 |
| tokenStateIndex:refreshCachedEntries | 19885 | 322.19 |
| evalQuery:applyTokenFilter | 8906 | 32.76 |
| evalQuery:countMatchingTokens | 11727 | 22.16 |
| tokenStateIndex:build | 388 | 12.28 |
| publish:chooseOne:rebuildMoveFromFrame | 762 | 4.2 |
| evalQuery:applyTokenFilterCacheHit | 20424 | 0 |
| evalQuery:applyTokenFilterCompiled | 8906 | 0 |
| evalQuery:countMatchingTokensCacheHit | 2010742 | 0 |

### train:chooseNStep:confirm | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 12646 | 2224.44 |
| publish:isSupportedFrameContinuationMove | 3160 | 2021.66 |
| zobrist:encodeDecisionStackFrame | 13628 | 1349.38 |
| publish:chooseOne:legalActions | 607 | 852.13 |
| tokenStateIndex:refreshCachedEntries | 14324 | 221.65 |
| evalQuery:countMatchingTokens | 6232 | 14.99 |
| evalQuery:applyTokenFilter | 4528 | 14.77 |
| tokenStateIndex:build | 386 | 13 |
| publish:chooseOne:rebuildMoveFromFrame | 607 | 3.56 |
| evalQuery:applyTokenFilterCacheHit | 20714 | 0 |
| evalQuery:applyTokenFilterCompiled | 4528 | 0 |
| evalQuery:countMatchingTokensCacheHit | 1690423 | 0 |

### govern:chooseNStep:confirm | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 20945 | 336.05 |
| evalQuery:applyTokenFilter | 170131 | 236.23 |
| publish:isSupportedFrameContinuationMove | 231 | 67.1 |
| publish:chooseOne:legalActions | 66 | 40.74 |
| zobrist:encodeDecisionStackFrame | 264 | 10.86 |
| zobrist:digestDecisionStackFrame | 162 | 8.39 |
| evalQuery:countMatchingTokens | 4146 | 4.52 |
| publish:chooseOne:rebuildMoveFromFrame | 66 | 0.23 |
| evalQuery:applyTokenFilterCacheHit | 10017 | 0 |
| evalQuery:applyTokenFilterCompiled | 170131 | 0 |
| evalQuery:countMatchingTokensCacheHit | 511539 | 0 |
| evalQuery:countMatchingTokensCompiled | 4146 | 0 |

### event | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| publish:isSupportedFrameContinuationMove | 1412 | 562.49 |
| evalQuery:applyTokenFilter | 38842 | 209.85 |
| tokenStateIndex:refreshCachedEntries | 8005 | 140.77 |
| zobrist:digestDecisionStackFrame | 454 | 79.68 |
| evalQuery:countMatchingTokens | 76561 | 77 |
| zobrist:encodeDecisionStackFrame | 454 | 48.94 |
| policyWasmRuntime:encodeBytecodeInput | 512 | 16 |
| evalQuery:applyTokenFilterCacheHit | 4771 | 0 |
| evalQuery:applyTokenFilterCompiled | 18774 | 0 |
| evalQuery:countMatchingTokensCacheHit | 696383 | 0 |
| evalQuery:countMatchingTokensCompiled | 3176 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1550195 | 0 |

### govern:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| publish:isSupportedFrameContinuationMove | 1227 | 345.33 |
| tokenStateIndex:refreshCachedEntries | 8712 | 136.07 |
| evalQuery:applyTokenFilter | 71016 | 97.8 |
| publish:chooseOne:legalActions | 117 | 81.08 |
| zobrist:encodeDecisionStackFrame | 987 | 39.58 |
| zobrist:digestDecisionStackFrame | 792 | 37.23 |
| evalQuery:countMatchingTokens | 2564 | 3.24 |
| publish:chooseOne:rebuildMoveFromFrame | 117 | 0.51 |
| evalQuery:applyTokenFilterCacheHit | 4281 | 0 |
| evalQuery:applyTokenFilterCompiled | 71016 | 0 |
| evalQuery:countMatchingTokensCacheHit | 289927 | 0 |
| evalQuery:countMatchingTokensCompiled | 2564 | 0 |

### coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| policyPreviewInner:chooseOne:loopPublish | 344 | 1547.85 |
| publish:chooseOne:legalActions | 344 | 1545.11 |
| publish:isSupportedFrameContinuationMove | 2752 | 1540.94 |
| tokenStateIndex:refreshCachedEntries | 55920 | 298.77 |
| policyPreviewInner:chooseOne:resolveRefs | 312 | 165.37 |
| policyPreviewInner:chooseOne:canonicalizeForExit | 312 | 154.04 |
| policyPreviewInner:chooseOne:loopApply | 344 | 135.5 |
| policyPreviewInner:chooseOne:initialApply | 312 | 115.09 |
| policyPreviewInner:chooseOne:loopPickInnerDecision | 344 | 114.77 |
| evalQuery:countMatchingTokens | 74344 | 81.7 |
| zobrist:encodeDecisionStackFrame | 96 | 4.41 |
| zobrist:digestDecisionStackFrame | 96 | 3.67 |

### govern | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| publish:isSupportedFrameContinuationMove | 566 | 177.53 |
| evalQuery:applyTokenFilter | 20816 | 46.86 |
| tokenStateIndex:refreshCachedEntries | 2443 | 45.06 |
| zobrist:digestDecisionStackFrame | 158 | 17.17 |
| zobrist:encodeDecisionStackFrame | 158 | 13.51 |
| evalQuery:countMatchingTokens | 4354 | 4.22 |
| policyWasmRuntime:encodeBytecodeInput | 48 | 1.32 |
| evalQuery:applyTokenFilterCacheHit | 4771 | 0 |
| evalQuery:applyTokenFilterCompiled | 15193 | 0 |
| evalQuery:countMatchingTokensCacheHit | 112448 | 0 |
| evalQuery:countMatchingTokensCompiled | 688 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 236416 | 0 |

### coupArvnRedeployMandatory:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| policyPreviewInner:chooseOne:loopPublish | 144 | 582 |
| publish:chooseOne:legalActions | 144 | 580.95 |
| publish:isSupportedFrameContinuationMove | 1152 | 579.41 |
| tokenStateIndex:refreshCachedEntries | 22764 | 121.87 |
| policyPreviewInner:chooseOne:loopApply | 144 | 56.39 |
| policyPreviewInner:chooseOne:loopPickInnerDecision | 144 | 42.8 |
| evalQuery:countMatchingTokens | 32131 | 35.75 |
| policyPreviewInner:chooseOne:resolveRefs | 80 | 34.41 |
| policyPreviewInner:chooseOne:canonicalizeForExit | 80 | 32.13 |
| policyPreviewInner:chooseOne:initialApply | 80 | 22.29 |
| zobrist:encodeDecisionStackFrame | 32 | 1.44 |
| zobrist:digestDecisionStackFrame | 32 | 1.18 |

### rally | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| publish:isSupportedFrameContinuationMove | 154 | 77.64 |
| tokenStateIndex:refreshCachedEntries | 1668 | 26.45 |
| evalQuery:applyTokenFilter | 1385 | 17.99 |
| evalQuery:countMatchingTokens | 8001 | 9.51 |
| zobrist:digestDecisionStackFrame | 100 | 7.26 |
| zobrist:encodeDecisionStackFrame | 100 | 5.33 |
| policyWasmRuntime:encodeBytecodeInput | 72 | 2.83 |
| evalQuery:applyTokenFilterCacheHit | 1519 | 0 |
| evalQuery:applyTokenFilterCompiled | 924 | 0 |
| evalQuery:countMatchingTokensCacheHit | 221528 | 0 |
| evalQuery:countMatchingTokensCompiled | 2102 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 539164 | 0 |


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
