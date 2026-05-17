# FITL ARVN 15-Seed Per-Microturn-Class Decomposition

**Date**: 2026-05-17-spec-178-phase-4-publish-microturn-optimization
**Status**: FITL ARVN measurement witness.
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005,1011,1008,1013,1009 --timeout-ms 600000 --date 2026-05-17-spec-178-phase-4-publish-microturn-optimization --profile-buckets`
**CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-17-spec-178-phase-4-publish-microturn-optimization.csv`

## Summary

- Seeds completed: 5/5
- Per-decision rows: 1500
- Hot class with slow:fast ratio >3x: no
- Per-seed timeout: 600000 ms
- Hot-path buckets: enabled
- WASM mode: enabled
- WASM timing profile: disabled
- WASM production preview-drive route count: 1299
- WASM production preview-drive unsupported count: 751
- WASM production preview-drive batch count: 1027
- WASM timing call count: 0
- WASM serialized input bytes: 0
- Bytecode input cache write bytes: 0

## Per-Seed Wall Time

| Seed | Status | Stop Reason | Wall ms | Decisions | ms/decision | Error |
|---:|---|---|---:|---:|---:|---|
| 1005 | OK | terminal | 44265.54 | 398 | 111.2199 |  |
| 1011 | OK | terminal | 7145.08 | 206 | 34.6849 |  |
| 1008 | OK | terminal | 18266.93 | 346 | 52.7946 |  |
| 1013 | OK | terminal | 7269.51 | 258 | 28.1764 |  |
| 1009 | OK | terminal | 11355.53 | 292 | 38.8888 |  |

## Per-Microturn-Class Rollup

| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | Cache hits | Cache misses | Cache compile ms | WASM preview-drive routes | WASM preview-drive unsupported | WASM preview-drive unsupported reasons | WASM preview-drive batches | WASM timing calls | Marshaling ms | Execution ms | Deserialization ms | Bytes serialized | Cache write ms | Cache write bytes | Cache write count | Token index builds | Static rebuilds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| govern:chooseNStep:confirm | 44 | 16574.82 | 376.7005 | 469.7863 | 10124.7183 | 6.3864 | 0 | 877 | 397 | 0 | 0 | 0 | 0 | 0 | 0 | 182 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state/expected-terminal-boundary/seat-or-turn-boundary:182 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| train:chooseNStep:add | 14 | 13229.32 | 944.9514 | 3402.2681 | 3402.2681 | 17.5 | 0 | 3443 | 6438 | 0 | 0 | 0 | 0 | 0 | 180 | 5 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state/expected-terminal-boundary/seat-or-turn-boundary:5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| govern:chooseNStep:add | 55 | 12194.81 | 221.7238 | 300.5656 | 4217.7609 | 5.7818 | 0 | 1425 | 2217 | 0 | 0 | 0 | 0 | 0 | 261 | 35 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state/expected-terminal-boundary/seat-or-turn-boundary:35 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event | 109 | 8189.55 | 75.1335 | 165.3195 | 3037.2518 | 21.3119 | 109 | 0 | 0 | 109 | 78 | 0 | 0 | 0 | 0 | 122 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:122 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 18 | 119 |
| train:chooseNStep:confirm | 22 | 6630.03 | 301.3648 | 3093.4014 | 3174.3353 | 4.5 | 0 | 1747 | 3733 | 0 | 0 | 0 | 0 | 0 | 58 | 5 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state/expected-terminal-boundary/seat-or-turn-boundary:5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupArvnRedeployPolice:chooseOne | 58 | 4220.5 | 72.7672 | 138.1953 | 149.1483 | 30.5862 | 0 | 57816 | 1954 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| govern | 47 | 3082.86 | 65.5927 | 82.9181 | 642.9323 | 11.1064 | 45 | 0 | 2 | 45 | 32 | 0 | 0 | 0 | 16 | 94 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:50; unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:44 | 66 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 45 |
| event-decision:chooseNStep:add | 48 | 1585.81 | 33.0377 | 275.0324 | 393.174 | 9.6458 | 0 | 164 | 706 | 0 | 0 | 0 | 0 | 0 | 39 | 14 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state/expected-terminal-boundary/seat-or-turn-boundary:14 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupArvnRedeployOptionalTroops:chooseOne | 84 | 1418.62 | 16.8883 | 23.4136 | 33.938 | 8.2857 | 0 | 5844 | 816 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally | 67 | 1339.81 | 19.9972 | 48.0315 | 64.1018 | 17.194 | 57 | 0 | 10 | 57 | 35 | 0 | 0 | 0 | 195 | 78 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:68; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:10 | 205 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 57 |
| coupArvnRedeployOptionalTroops | 32 | 1326.08 | 41.4401 | 49.8682 | 52.2702 | 17.125 | 25 | 0 | 7 | 25 | 0 | 0 | 0 | 0 | 14 | 64 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:64 | 78 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 25 |
| coupArvnRedeployPolice | 27 | 835.64 | 30.9495 | 34.897 | 36.8386 | 11.8889 | 27 | 0 | 0 | 27 | 0 | 0 | 0 | 0 | 0 | 54 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:54 | 54 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 27 |
| coupRedeployPass | 32 | 272.68 | 8.5214 | 26.7758 | 27.947 | 3.0625 | 15 | 0 | 17 | 15 | 13 | 0 | 0 | 0 | 32 | 16 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:16 | 48 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 15 |
| transport:chooseOne | 8 | 253.97 | 31.746 | 56.5317 | 56.5317 | 12.25 | 0 | 290 | 18 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| train | 8 | 243.06 | 30.382 | 55.4777 | 55.4777 | 5.75 | 8 | 0 | 0 | 8 | 10 | 0 | 0 | 0 | 28 | 8 | agent-guided-completion/production-preview-drive.chooseN/only origin-seat greedy chooseN publication is supported:4; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:4 | 36 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 8 |
| coupArvnRedeployMandatory:chooseOne | 12 | 232.68 | 19.3897 | 25.089 | 25.089 | 8 | 0 | 1428 | 204 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| transport | 4 | 223.63 | 55.9084 | 66.4181 | 66.4181 | 11.5 | 4 | 0 | 0 | 4 | 0 | 0 | 0 | 0 | 0 | 8 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:4; unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:4 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 4 |
| coupPacifyUS | 25 | 205.56 | 8.2223 | 12.6469 | 14.461 | 2.8 | 25 | 0 | 0 | 25 | 0 | 0 | 0 | 0 | 35 | 15 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:15 | 50 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 25 |
| govern:chooseOne | 58 | 178.94 | 3.0851 | 4.3999 | 4.6298 | 2 | 0 | 80 | 80 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupAgitateVC | 22 | 173.91 | 7.9052 | 11.5443 | 14.2055 | 2.7273 | 17 | 0 | 5 | 17 | 4 | 0 | 0 | 0 | 64 | 24 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:24 | 88 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 17 |
| infiltrate | 16 | 155.97 | 9.7482 | 12.2539 | 12.2539 | 53.4375 | 12 | 0 | 4 | 12 | 2 | 0 | 0 | 0 | 55 | 0 |  | 55 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 12 |
| advise | 13 | 122.06 | 9.3895 | 15.9323 | 15.9323 | 11.6923 | 10 | 0 | 3 | 10 | 3 | 0 | 0 | 0 | 52 | 0 |  | 52 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 10 |
| coupCommitmentPass | 32 | 109.13 | 3.4102 | 5.1056 | 5.431 | 1.1563 | 3 | 0 | 29 | 3 | 0 | 0 | 0 | 0 | 53 | 0 |  | 53 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 3 |
| coupNvaRedeployTroops | 11 | 103.58 | 9.4167 | 16.4988 | 16.4988 | 3.6364 | 7 | 0 | 4 | 7 | 0 | 0 | 0 | 0 | 8 | 7 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:7 | 15 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 7 |
| coupPacifyARVN | 11 | 100.66 | 9.1505 | 12.8483 | 12.8483 | 3.8182 | 5 | 0 | 6 | 5 | 8 | 0 | 0 | 0 | 24 | 10 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:10 | 34 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5 |
| coupArvnRedeployMandatory | 2 | 96.29 | 48.1436 | 52.3668 | 52.3668 | 11.5 | 1 | 0 | 1 | 1 | 0 | 0 | 0 | 0 | 2 | 4 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:4 | 6 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| ambushVc | 7 | 94.26 | 13.4654 | 24.2059 | 24.2059 | 6.8571 | 7 | 0 | 0 | 7 | 0 | 0 | 0 | 0 | 30 | 6 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:6 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 7 |
| march | 15 | 81.25 | 5.4166 | 10.4403 | 10.4403 | 4.6 | 10 | 0 | 5 | 10 | 13 | 0 | 0 | 0 | 39 | 0 |  | 39 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 10 |
| assault | 8 | 73.92 | 9.24 | 12.1682 | 12.1682 | 4.875 | 8 | 0 | 0 | 8 | 1 | 0 | 0 | 0 | 31 | 0 |  | 31 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 8 |
| coupPacifyPass | 16 | 65.35 | 4.0844 | 6.5399 | 6.5399 | 1.0625 | 14 | 0 | 2 | 14 | 0 | 0 | 0 | 0 | 26 | 0 |  | 26 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 14 |
| train:chooseOne | 12 | 61.29 | 5.1072 | 7.3218 | 7.3218 | 2.25 | 0 | 28 | 39 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| attack | 4 | 47.18 | 11.795 | 12.3628 | 12.3628 | 54.5 | 4 | 0 | 0 | 4 | 0 | 0 | 0 | 0 | 16 | 0 |  | 16 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 4 |
| coupAgitatePass | 8 | 29.77 | 3.7211 | 5.3269 | 5.3269 | 1.125 | 5 | 0 | 3 | 5 | 0 | 0 | 0 | 0 | 18 | 0 |  | 18 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5 |
| coupVictoryCheck | 8 | 28.07 | 3.5091 | 4.5663 | 4.5663 | 1 | 8 | 0 | 0 | 8 | 1 | 0 | 0 | 0 | 8 | 0 |  | 8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 8 |
| coupResourcesResolve | 8 | 27.85 | 3.4814 | 4.7765 | 4.7765 | 1 | 1 | 0 | 7 | 1 | 0 | 0 | 0 | 0 | 8 | 0 |  | 8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| coupCommitmentResolve | 3 | 17.13 | 5.7111 | 5.8363 | 5.8363 | 2 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 6 | 0 |  | 6 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| chooseOne:chooseOne | 13 | 8.05 | 0.6195 | 6.4095 | 6.4095 | 5.9231 | 0 | 4 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseNStep:add | 68 | 4.42 | 0.065 | 0.0771 | 0.636 | 20.9706 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseNStep:confirm | 77 | 3.64 | 0.0473 | 0.0824 | 1.0925 | 17.6753 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseOne | 12 | 3.53 | 0.2944 | 3.1635 | 3.1635 | 2.9167 | 0 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| pass | 1 | 3.36 | 3.3552 | 3.3552 | 3.3552 | 1 | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 1 | 0 |  | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| rally:chooseOne | 70 | 2.16 | 0.0309 | 0.0668 | 0.1289 | 1.3571 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:confirm | 35 | 1.8 | 0.0515 | 0.0532 | 0.7052 | 4.8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:add | 13 | 1.59 | 0.1219 | 0.7577 | 0.7577 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseNStep:confirm | 47 | 1.44 | 0.0306 | 0.0976 | 0.1487 | 5.7234 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseOne | 27 | 1.32 | 0.0489 | 0.1333 | 0.1491 | 2.4444 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:add | 21 | 1.21 | 0.0575 | 0.0887 | 0.0943 | 12.7143 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupNvaRedeployTroops:chooseOne | 25 | 1.08 | 0.0432 | 0.0615 | 0.076 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseOne | 23 | 0.77 | 0.0333 | 0.0551 | 0.0647 | 1.6957 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:add | 16 | 0.76 | 0.0477 | 0.0623 | 0.0623 | 3.75 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:confirm | 26 | 0.67 | 0.0258 | 0.0481 | 0.0566 | 4.5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:confirm | 13 | 0.55 | 0.0426 | 0.0693 | 0.0693 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:add | 8 | 0.48 | 0.0604 | 0.1485 | 0.1485 | 2.75 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:confirm | 16 | 0.43 | 0.0269 | 0.0919 | 0.0919 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupCommitmentResolve:chooseNStep:confirm | 12 | 0.38 | 0.0319 | 0.0534 | 0.0534 | 9.25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:add | 7 | 0.3 | 0.0432 | 0.0525 | 0.0525 | 3.5714 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| chooseNStep:chooseNStep:confirm | 6 | 0.24 | 0.0399 | 0.0537 | 0.0537 | 19.6667 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:confirm | 7 | 0.16 | 0.0224 | 0.0239 | 0.0239 | 4.5714 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseOne | 7 | 0.12 | 0.0178 | 0.019 | 0.019 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Top Hot Axes In Slow-Tier Seeds

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.

| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms | Cache hits | Cache misses | Cache compile ms |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | govern:chooseNStep:confirm | continuedDeepening | 33 | 16573.85 | 502.238 | 534.4759 | 10124.7183 | 0 | 0 | 0 |
| 2 | train:chooseNStep:add | continuedDeepening | 14 | 13229.32 | 944.9514 | 3402.2681 | 3402.2681 | 0 | 0 | 0 |
| 3 | govern:chooseNStep:add | continuedDeepening | 55 | 12194.81 | 221.7238 | 300.5656 | 4217.7609 | 0 | 0 | 0 |
| 4 | event | singlePass | 109 | 8189.55 | 75.1335 | 165.3195 | 3037.2518 | 0 | 0 | 0 |
| 5 | train:chooseNStep:confirm | continuedDeepening | 12 | 6628.76 | 552.3967 | 3174.3353 | 3174.3353 | 0 | 0 | 0 |
| 6 | coupArvnRedeployPolice:chooseOne | continuedDeepening | 58 | 4220.5 | 72.7672 | 138.1953 | 149.1483 | 0 | 0 | 0 |
| 7 | govern | singlePass | 47 | 3082.86 | 65.5927 | 82.9181 | 642.9323 | 0 | 0 | 0 |
| 8 | event-decision:chooseNStep:add | continuedDeepening | 6 | 1584.29 | 264.0491 | 393.174 | 393.174 | 0 | 0 | 0 |
| 9 | coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | 84 | 1418.62 | 16.8883 | 23.4136 | 33.938 | 0 | 0 | 0 |
| 10 | rally | singlePass | 67 | 1339.81 | 19.9972 | 48.0315 | 64.1018 | 0 | 0 | 0 |

## Hot-Path Buckets For Top Slow Axes

Captured only when `--profile-buckets` is enabled. Buckets are timing/count diagnostics inside `PolicyAgent.chooseDecision`; they are not correctness assertions.

### govern:chooseNStep:confirm | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| policyInnerPreview:chooseNStepDeepPass | 33 | 10319.1 |
| policyInnerPreview:chooseNStepBroadRun | 33 | 6229.6 |
| tokenStateIndex:refreshCachedEntries | 58404 | 774.33 |
| evalQuery:applyTokenFilter | 275379 | 389.45 |
| policyMicroturnSearch:chooseOneScoreOptions | 364 | 71.27 |
| zobrist:encodeDecisionStackFrame | 1456 | 58.67 |
| zobrist:digestDecisionStackFrame | 894 | 46.48 |
| evalQuery:countMatchingTokens | 37786 | 40.14 |
| policyInnerPreview:chooseNStepFinalSignals | 33 | 7.76 |
| policyInnerPreview:chooseNStepBroadSignals | 33 | 7.75 |
| policyMicroturnSearch:chooseNScoreOptions | 33 | 5.17 |
| policyInnerPreview:summarizeUsage | 33 | 0.57 |

### train:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| policyInnerPreview:chooseNStepBroadRun | 14 | 8087.86 |
| policyInnerPreview:chooseNStepDeepPass | 14 | 5113.09 |
| zobrist:digestDecisionStackFrame | 14430 | 2484.95 |
| zobrist:encodeDecisionStackFrame | 14556 | 1522.82 |
| tokenStateIndex:refreshCachedEntries | 15073 | 240.27 |
| policyMicroturnSearch:chooseNScoreOptions | 703 | 129.07 |
| policyMicroturnSearch:chooseOneScoreOptions | 487 | 87.63 |
| evalQuery:countMatchingTokens | 51110 | 69.13 |
| evalQuery:applyTokenFilter | 12738 | 33.08 |
| policyInnerPreview:chooseNStepBroadSignals | 14 | 9.27 |
| policyInnerPreview:chooseNStepFinalSignals | 14 | 7.14 |
| policyMicroturnSearch:chooseNRankOptions | 703 | 1.33 |

### govern:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| policyInnerPreview:chooseNStepDeepPass | 55 | 9672.26 |
| policyInnerPreview:chooseNStepBroadRun | 55 | 2471.5 |
| tokenStateIndex:refreshCachedEntries | 35197 | 429.6 |
| zobrist:digestDecisionStackFrame | 5372 | 252.08 |
| zobrist:encodeDecisionStackFrame | 5508 | 202.22 |
| evalQuery:applyTokenFilter | 117692 | 185.71 |
| policyMicroturnSearch:chooseOneScoreOptions | 592 | 85.67 |
| evalQuery:countMatchingTokens | 27021 | 28.85 |
| policyInnerPreview:chooseNStepBroadSignals | 55 | 17.15 |
| policyInnerPreview:chooseNStepFinalSignals | 55 | 13.58 |
| policyMicroturnSearch:chooseNScoreOptions | 55 | 8.6 |
| policyInnerPreview:summarizeUsage | 55 | 1.59 |

### event | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 58155 | 677.52 |
| evalQuery:applyTokenFilter | 110474 | 208.85 |
| zobrist:digestDecisionStackFrame | 1026 | 194.59 |
| zobrist:encodeDecisionStackFrame | 1026 | 116.67 |
| evalQuery:countMatchingTokens | 49013 | 51.86 |
| policyWasmRuntime:encodeBytecodeInput | 1124 | 32.83 |
| tokenStateIndex:build | 18 | 0.79 |
| evalQuery:applyTokenFilterCacheHit | 17764 | 0 |
| evalQuery:applyTokenFilterCompiled | 109718 | 0 |
| evalQuery:countMatchingTokensCacheHit | 1101739 | 0 |
| evalQuery:countMatchingTokensCompiled | 34985 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 2368255 | 0 |

### train:chooseNStep:confirm | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| policyInnerPreview:chooseNStepBroadRun | 12 | 3998.12 |
| policyInnerPreview:chooseNStepDeepPass | 12 | 2622.39 |
| zobrist:digestDecisionStackFrame | 8094 | 1471.45 |
| zobrist:encodeDecisionStackFrame | 8222 | 904.33 |
| tokenStateIndex:refreshCachedEntries | 3781 | 62.53 |
| policyMicroturnSearch:chooseNScoreOptions | 334 | 61.54 |
| policyMicroturnSearch:chooseOneScoreOptions | 269 | 45.42 |
| evalQuery:countMatchingTokens | 5845 | 8.18 |
| evalQuery:applyTokenFilter | 1507 | 5.68 |
| policyInnerPreview:chooseNStepBroadSignals | 12 | 2.99 |
| policyInnerPreview:chooseNStepFinalSignals | 12 | 2.3 |
| policyMicroturnSearch:chooseNRankOptions | 334 | 0.79 |

### coupArvnRedeployPolice:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| policyInnerPreview:chooseOneRun | 58 | 4164.54 |
| policyInnerPreviewSubroutine:driveOption | 1774 | 3435.14 |
| policyInnerPreviewDriveOption:publishMicroturn | 1896 | 1648.83 |
| policyMicroturnSearch:chooseOneScoreOptions | 1954 | 1484.76 |
| policyInnerPreviewSubroutine:resolveRefs | 1774 | 720.86 |
| policyInnerPreviewDriveOption:canonicalizeForExit | 1774 | 584.52 |
| policyInnerPreviewDriveOption:continuationDecisionApply | 1896 | 565.16 |
| policyInnerPreviewDriveOption:initialDecisionApply | 1774 | 523.69 |
| tokenStateIndex:refreshCachedEntries | 30212 | 232.16 |
| policyInnerPreviewDriveOption:syncDraftTokenStateIndex | 2844 | 93.19 |
| evalQuery:countMatchingTokens | 57912 | 58.66 |
| zobrist:digestDecisionStackFrame | 546 | 28.03 |

### govern | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 1272 | 160.46 |
| zobrist:encodeDecisionStackFrame | 1272 | 111.09 |
| tokenStateIndex:refreshCachedEntries | 5895 | 92.27 |
| evalQuery:applyTokenFilter | 17879 | 40.01 |
| policyWasmRuntime:encodeBytecodeInput | 376 | 11.17 |
| evalQuery:countMatchingTokens | 7293 | 8.29 |
| evalQuery:applyTokenFilterCacheHit | 18564 | 0 |
| evalQuery:applyTokenFilterCompiled | 17772 | 0 |
| evalQuery:countMatchingTokensCacheHit | 816766 | 0 |
| evalQuery:countMatchingTokensCompiled | 5131 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1552798 | 0 |
| policyWasmRuntime:encodedInputCacheMiss | 376 | 0 |

### event-decision:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| policyInnerPreview:chooseNStepDeepPass | 6 | 864.34 |
| policyInnerPreview:chooseNStepBroadRun | 6 | 712.84 |
| tokenStateIndex:refreshCachedEntries | 7120 | 89.08 |
| zobrist:digestDecisionStackFrame | 1396 | 45.54 |
| zobrist:encodeDecisionStackFrame | 1528 | 33.13 |
| evalQuery:applyTokenFilter | 2580 | 7.37 |
| evalQuery:countMatchingTokens | 5723 | 5.85 |
| policyInnerPreview:chooseNStepFinalSignals | 6 | 2.55 |
| policyMicroturnSearch:chooseOneScoreOptions | 11 | 2.02 |
| policyInnerPreview:chooseNStepBroadSignals | 6 | 1.77 |
| policyMicroturnSearch:chooseNScoreOptions | 6 | 1.38 |
| policyInnerPreview:summarizeUsage | 6 | 0.1 |

### coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| policyInnerPreview:chooseOneRun | 84 | 1378.42 |
| policyInnerPreviewSubroutine:driveOption | 696 | 1075.7 |
| policyInnerPreviewSubroutine:resolveRefs | 696 | 296.85 |
| policyInnerPreviewDriveOption:publishMicroturn | 732 | 295.7 |
| policyInnerPreviewDriveOption:continuationDecisionApply | 732 | 257.33 |
| policyMicroturnSearch:chooseOneScoreOptions | 816 | 240.21 |
| policyInnerPreviewDriveOption:canonicalizeForExit | 696 | 239.5 |
| policyInnerPreviewDriveOption:initialDecisionApply | 696 | 227.62 |
| tokenStateIndex:refreshCachedEntries | 11676 | 89.51 |
| policyInnerPreviewDriveOption:syncDraftTokenStateIndex | 1160 | 45.69 |
| evalQuery:countMatchingTokens | 24722 | 22.37 |
| zobrist:digestDecisionStackFrame | 252 | 11.41 |

### rally | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 7575 | 76.47 |
| evalQuery:applyTokenFilter | 6170 | 20.48 |
| zobrist:digestDecisionStackFrame | 242 | 17.83 |
| zobrist:encodeDecisionStackFrame | 242 | 13.59 |
| policyWasmRuntime:encodeBytecodeInput | 345 | 12.19 |
| evalQuery:countMatchingTokens | 9881 | 11.05 |
| evalQuery:applyTokenFilterCacheHit | 3667 | 0 |
| evalQuery:applyTokenFilterCompiled | 6012 | 0 |
| evalQuery:countMatchingTokensCacheHit | 601356 | 0 |
| evalQuery:countMatchingTokensCompiled | 7719 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1418674 | 0 |
| policyWasmRuntime:encodedInputCacheMiss | 345 | 0 |


## Continued-Deepening No-Counter Residual Split

Rows include only `continuedDeepening` axes with zero route/unsupported counters. `continued-deepening-orchestration-inclusive` is a top-level same-run bucket; `*-nested` rows are child hot-path evidence inside that orchestration bucket and are not additive with it. The residual row is the measured axis wall time not explained by the top-level orchestration bucket.

| Microturn class | Preview branch | Classification | Count | Total ms | Share of axis wall |
|---|---|---|---:|---:|---:|
| coupArvnRedeployPolice:chooseOne | continuedDeepening | continued-deepening-orchestration-inclusive | 58 | 4164.54 | 98.6741% |
| coupArvnRedeployPolice:chooseOne | continuedDeepening | inner-preview-subroutine-nested | 3548 | 4156 | 98.4717% |
| coupArvnRedeployPolice:chooseOne | continuedDeepening | drive-option-subroutine-nested | 10184 | 3415.39 | 80.9238% |
| coupArvnRedeployPolice:chooseOne | continuedDeepening | policy-search-candidate-scoring-nested | 1954 | 1484.76 | 35.1797% |
| coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | continued-deepening-orchestration-inclusive | 84 | 1378.42 | 97.1663% |
| coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | inner-preview-subroutine-nested | 1392 | 1372.55 | 96.7525% |
| coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | drive-option-subroutine-nested | 4016 | 1065.84 | 75.1322% |
| coupArvnRedeployPolice:chooseOne | continuedDeepening | existing-hot-path-bucket-nested | 88670 | 318.85 | 7.5548% |
| coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | policy-search-candidate-scoring-nested | 816 | 240.21 | 16.9327% |
| coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | existing-hot-path-bucket-nested | 36650 | 123.29 | 8.6908% |
| coupArvnRedeployPolice:chooseOne | continuedDeepening | unattributed-after-top-level-orchestration |  | 55.96 | 1.3259% |
| coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | unattributed-after-top-level-orchestration |  | 40.2 | 2.8337% |

## WASM Timing Buckets

_No WASM timing buckets recorded._

## WASM Serialization Stats

_No WASM serialization stats recorded._

## WASM Preview-Drive Unsupported Reasons

| Microturn class | Unsupported class | Unsupported owner | Reason | Count | Class unsupported total | Class route total |
|---|---|---|---|---:|---:|---:|
| govern:chooseNStep:confirm | unknown | production-deep-choosenstep-continuation.projectedState | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 182 | 182 | 0 |
| event | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 122 | 122 | 0 |
| rally | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 68 | 78 | 195 |
| coupArvnRedeployOptionalTroops | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 64 | 64 | 14 |
| coupArvnRedeployPolice | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 54 | 54 | 0 |
| govern | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 50 | 94 | 16 |
| govern | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 44 | 94 | 16 |
| govern:chooseNStep:add | unknown | production-deep-choosenstep-continuation.projectedState | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 35 | 35 | 261 |
| coupAgitateVC | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 24 | 24 | 64 |
| coupRedeployPass | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 16 | 16 | 32 |
| coupPacifyUS | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 15 | 15 | 35 |
| event-decision:chooseNStep:add | unknown | production-deep-choosenstep-continuation.projectedState | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 14 | 14 | 39 |
| coupPacifyARVN | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 10 | 10 | 24 |
| rally | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 10 | 78 | 195 |
| coupNvaRedeployTroops | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 7 | 7 | 8 |
| ambushVc | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 6 | 6 | 30 |
| train:chooseNStep:add | unknown | production-deep-choosenstep-continuation.projectedState | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 5 | 5 | 180 |
| train:chooseNStep:confirm | unknown | production-deep-choosenstep-continuation.projectedState | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 5 | 5 | 58 |
| coupArvnRedeployMandatory | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 4 | 4 | 2 |
| train | agent-guided-completion | production-preview-drive.chooseN | only origin-seat greedy chooseN publication is supported | 4 | 8 | 28 |
| train | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 4 | 8 | 28 |
| transport | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 4 | 8 | 0 |
| transport | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 4 | 8 | 0 |

## Terminal-Boundary Projected-State Split

| Microturn class | Classification | Boundary kind | Count |
|---|---|---|---:|
| govern:chooseNStep:confirm | expected-terminal-boundary | seat-or-turn-boundary | 182 |
| govern:chooseNStep:add | expected-terminal-boundary | seat-or-turn-boundary | 35 |
| event-decision:chooseNStep:add | expected-terminal-boundary | seat-or-turn-boundary | 14 |
| train:chooseNStep:add | expected-terminal-boundary | seat-or-turn-boundary | 5 |
| train:chooseNStep:confirm | expected-terminal-boundary | seat-or-turn-boundary | 5 |

## Fast-Tier vs Slow-Tier Delta

Fast tier: `1000`, `1006`, `1007`, `1010`, `1014`. Rows with ratio greater than `3.0` satisfy the Phase 0 hot-axis criterion.

| Microturn class | Slow decisions | Fast decisions | Slow mean ms | Fast mean ms | Slow:fast ratio | Verdict |
|---|---:|---:|---:|---:|---:|---|

## Notes

- `elapsedMs` is measured around the per-decision `PolicyAgent.chooseDecision` call. It excludes simulator apply/delta work and report rendering.
- Child processes enforce the per-seed timeout. Each child loads the built engine and production FITL GameSpecDoc, using the repo GameDef cache when available.
- WASM timing buckets are emitted only when `POLICY_WASM_TIMING_PROFILE=1` is set before the child process imports the WASM runtime module.
- The script does not modify engine source or production profile data.
