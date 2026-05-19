# FITL ARVN 15-Seed Per-Microturn-Class Decomposition

**Status**: ✅ EXPLOITED — archived 2026-05-19.

**Date**: 2026-05-17-spec-178-phase-2-post-optimization-wall-time
**Status**: FITL ARVN measurement witness.
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005,1011,1008,1013,1009 --timeout-ms 600000 --date 2026-05-17-spec-178-phase-2-post-optimization-wall-time --profile-buckets`
**CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-17-spec-178-phase-2-post-optimization-wall-time.csv`

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
| 1005 | OK | terminal | 44701 | 398 | 112.3141 |  |
| 1011 | OK | terminal | 7054.38 | 206 | 34.2446 |  |
| 1008 | OK | terminal | 19362.74 | 346 | 55.9617 |  |
| 1013 | OK | terminal | 7447.21 | 258 | 28.8652 |  |
| 1009 | OK | terminal | 12145.65 | 292 | 41.5947 |  |

## Per-Microturn-Class Rollup

| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | Cache hits | Cache misses | Cache compile ms | WASM preview-drive routes | WASM preview-drive unsupported | WASM preview-drive unsupported reasons | WASM preview-drive batches | WASM timing calls | Marshaling ms | Execution ms | Deserialization ms | Bytes serialized | Cache write ms | Cache write bytes | Cache write count | Token index builds | Static rebuilds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| govern:chooseNStep:confirm | 44 | 16528.63 | 375.6506 | 407.7631 | 10076.245 | 6.3864 | 0 | 877 | 397 | 0 | 0 | 0 | 0 | 0 | 0 | 182 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state/expected-terminal-boundary/seat-or-turn-boundary:182 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| train:chooseNStep:add | 14 | 13173.83 | 940.9875 | 3429.7141 | 3429.7141 | 17.5 | 0 | 3443 | 6438 | 0 | 0 | 0 | 0 | 0 | 180 | 5 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state/expected-terminal-boundary/seat-or-turn-boundary:5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| govern:chooseNStep:add | 55 | 11976.79 | 217.7599 | 315.4176 | 4006.0849 | 5.7818 | 0 | 1425 | 2217 | 0 | 0 | 0 | 0 | 0 | 261 | 35 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state/expected-terminal-boundary/seat-or-turn-boundary:35 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event | 109 | 8229.47 | 75.4997 | 156.1549 | 3022.0736 | 21.3119 | 109 | 0 | 0 | 109 | 78 | 0 | 0 | 0 | 0 | 122 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:122 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 18 | 119 |
| coupArvnRedeployPolice:chooseOne | 58 | 7172.12 | 123.6573 | 310.4654 | 325.3681 | 30.5862 | 0 | 57816 | 1954 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| train:chooseNStep:confirm | 22 | 6371.88 | 289.631 | 2879.5021 | 3148.1726 | 4.5 | 0 | 1747 | 3733 | 0 | 0 | 0 | 0 | 0 | 58 | 5 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state/expected-terminal-boundary/seat-or-turn-boundary:5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| govern | 47 | 3035.53 | 64.5858 | 80.2444 | 602.543 | 11.1064 | 45 | 0 | 2 | 45 | 32 | 0 | 0 | 0 | 16 | 94 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:50; unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:44 | 66 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 45 |
| coupArvnRedeployOptionalTroops:chooseOne | 84 | 1645.08 | 19.5842 | 33.0068 | 41.0225 | 8.2857 | 0 | 5844 | 816 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseNStep:add | 48 | 1580.06 | 32.9179 | 269.3329 | 385.9076 | 9.6458 | 0 | 164 | 706 | 0 | 0 | 0 | 0 | 0 | 39 | 14 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state/expected-terminal-boundary/seat-or-turn-boundary:14 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally | 67 | 1330.79 | 19.8626 | 47.0779 | 50.3792 | 17.194 | 57 | 0 | 10 | 57 | 35 | 0 | 0 | 0 | 195 | 78 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:68; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:10 | 205 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 57 |
| coupArvnRedeployOptionalTroops | 32 | 1311.84 | 40.9949 | 48.9023 | 52.7509 | 17.125 | 25 | 0 | 7 | 25 | 0 | 0 | 0 | 0 | 14 | 64 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:64 | 78 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 25 |
| coupArvnRedeployPolice | 27 | 830.68 | 30.7659 | 34.4631 | 35.1442 | 11.8889 | 27 | 0 | 0 | 27 | 0 | 0 | 0 | 0 | 0 | 54 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:54 | 54 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 27 |
| coupArvnRedeployMandatory:chooseOne | 12 | 315.62 | 26.3016 | 34.7009 | 34.7009 | 8 | 0 | 1428 | 204 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupRedeployPass | 32 | 283.8 | 8.8689 | 26.3183 | 27.0626 | 3.0625 | 15 | 0 | 17 | 15 | 13 | 0 | 0 | 0 | 32 | 16 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:16 | 48 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 15 |
| transport:chooseOne | 8 | 261.94 | 32.7424 | 49.5108 | 49.5108 | 12.25 | 0 | 290 | 18 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| train | 8 | 237.5 | 29.6871 | 57.5304 | 57.5304 | 5.75 | 8 | 0 | 0 | 8 | 10 | 0 | 0 | 0 | 28 | 8 | agent-guided-completion/production-preview-drive.chooseN/only origin-seat greedy chooseN publication is supported:4; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:4 | 36 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 8 |
| transport | 4 | 213.26 | 53.315 | 57.6966 | 57.6966 | 11.5 | 4 | 0 | 0 | 4 | 0 | 0 | 0 | 0 | 0 | 8 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:4; unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:4 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 4 |
| coupPacifyUS | 25 | 212.19 | 8.4877 | 13.7458 | 13.9924 | 2.8 | 25 | 0 | 0 | 25 | 0 | 0 | 0 | 0 | 35 | 15 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:15 | 50 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 25 |
| coupAgitateVC | 22 | 179.84 | 8.1746 | 12.1025 | 13.5866 | 2.7273 | 17 | 0 | 5 | 17 | 4 | 0 | 0 | 0 | 64 | 24 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:24 | 88 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 17 |
| govern:chooseOne | 58 | 176.52 | 3.0434 | 4.3355 | 5.1085 | 2 | 0 | 80 | 80 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate | 16 | 153.25 | 9.5781 | 12.6613 | 12.6613 | 53.4375 | 12 | 0 | 4 | 12 | 2 | 0 | 0 | 0 | 55 | 0 |  | 55 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 12 |
| advise | 13 | 121.36 | 9.3355 | 16.4691 | 16.4691 | 11.6923 | 10 | 0 | 3 | 10 | 3 | 0 | 0 | 0 | 52 | 0 |  | 52 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 10 |
| coupCommitmentPass | 32 | 103.37 | 3.2302 | 4.5612 | 5.1559 | 1.1563 | 3 | 0 | 29 | 3 | 0 | 0 | 0 | 0 | 53 | 0 |  | 53 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 3 |
| coupPacifyARVN | 11 | 101.24 | 9.2034 | 12.5405 | 12.5405 | 3.8182 | 5 | 0 | 6 | 5 | 8 | 0 | 0 | 0 | 24 | 10 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:10 | 34 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5 |
| coupNvaRedeployTroops | 11 | 100.9 | 9.1723 | 16.0862 | 16.0862 | 3.6364 | 7 | 0 | 4 | 7 | 0 | 0 | 0 | 0 | 8 | 7 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:7 | 15 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 7 |
| ambushVc | 7 | 87.22 | 12.4605 | 22.91 | 22.91 | 6.8571 | 7 | 0 | 0 | 7 | 0 | 0 | 0 | 0 | 30 | 6 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:6 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 7 |
| march | 15 | 86.62 | 5.7747 | 11.393 | 11.393 | 4.6 | 10 | 0 | 5 | 10 | 13 | 0 | 0 | 0 | 39 | 0 |  | 39 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 10 |
| coupArvnRedeployMandatory | 2 | 83.79 | 41.8936 | 41.9345 | 41.9345 | 11.5 | 1 | 0 | 1 | 1 | 0 | 0 | 0 | 0 | 2 | 4 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:4 | 6 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| assault | 8 | 73.31 | 9.1632 | 10.7957 | 10.7957 | 4.875 | 8 | 0 | 0 | 8 | 1 | 0 | 0 | 0 | 31 | 0 |  | 31 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 8 |
| coupPacifyPass | 16 | 63.37 | 3.9605 | 5.5747 | 5.5747 | 1.0625 | 14 | 0 | 2 | 14 | 0 | 0 | 0 | 0 | 26 | 0 |  | 26 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 14 |
| train:chooseOne | 12 | 61.02 | 5.0853 | 8.2139 | 8.2139 | 2.25 | 0 | 28 | 39 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| attack | 4 | 44.45 | 11.1135 | 13.7777 | 13.7777 | 54.5 | 4 | 0 | 0 | 4 | 0 | 0 | 0 | 0 | 16 | 0 |  | 16 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 4 |
| coupResourcesResolve | 8 | 27.78 | 3.4727 | 4.4171 | 4.4171 | 1 | 1 | 0 | 7 | 1 | 0 | 0 | 0 | 0 | 8 | 0 |  | 8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| coupVictoryCheck | 8 | 27.47 | 3.4336 | 4.1273 | 4.1273 | 1 | 8 | 0 | 0 | 8 | 1 | 0 | 0 | 0 | 8 | 0 |  | 8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 8 |
| coupAgitatePass | 8 | 26.72 | 3.3405 | 4.2048 | 4.2048 | 1.125 | 5 | 0 | 3 | 5 | 0 | 0 | 0 | 0 | 18 | 0 |  | 18 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5 |
| coupCommitmentResolve | 3 | 11.65 | 3.8825 | 4.3078 | 4.3078 | 2 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 6 | 0 |  | 6 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| chooseOne:chooseOne | 13 | 7.91 | 0.6082 | 6.2711 | 6.2711 | 5.9231 | 0 | 4 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseNStep:add | 68 | 4.47 | 0.0658 | 0.0851 | 0.6478 | 20.9706 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseOne | 12 | 3.72 | 0.3104 | 3.3139 | 3.3139 | 2.9167 | 0 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| pass | 1 | 3.2 | 3.2012 | 3.2012 | 3.2012 | 1 | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 1 | 0 |  | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| rally:chooseNStep:confirm | 77 | 2.55 | 0.0331 | 0.0538 | 0.1306 | 17.6753 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseOne | 70 | 2.1 | 0.03 | 0.0521 | 0.1777 | 1.3571 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseNStep:confirm | 47 | 1.52 | 0.0323 | 0.1103 | 0.1591 | 5.7234 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:add | 13 | 1.48 | 0.1141 | 0.6996 | 0.6996 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:confirm | 35 | 1.23 | 0.0352 | 0.0697 | 0.0843 | 4.8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:add | 21 | 1.19 | 0.0568 | 0.0841 | 0.0894 | 12.7143 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupNvaRedeployTroops:chooseOne | 25 | 1.08 | 0.0434 | 0.075 | 0.0916 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseOne | 27 | 1.05 | 0.039 | 0.0831 | 0.1142 | 2.4444 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:add | 16 | 0.75 | 0.0466 | 0.0573 | 0.0573 | 3.75 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:confirm | 26 | 0.69 | 0.0264 | 0.0431 | 0.0714 | 4.5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseOne | 23 | 0.68 | 0.0297 | 0.0473 | 0.0486 | 1.6957 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:confirm | 13 | 0.55 | 0.0422 | 0.0661 | 0.0661 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:add | 8 | 0.47 | 0.0584 | 0.1219 | 0.1219 | 2.75 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:confirm | 16 | 0.44 | 0.0276 | 0.0714 | 0.0714 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupCommitmentResolve:chooseNStep:confirm | 12 | 0.34 | 0.028 | 0.044 | 0.044 | 9.25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:add | 7 | 0.29 | 0.042 | 0.0466 | 0.0466 | 3.5714 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| chooseNStep:chooseNStep:confirm | 6 | 0.24 | 0.04 | 0.0661 | 0.0661 | 19.6667 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:confirm | 7 | 0.17 | 0.0238 | 0.027 | 0.027 | 4.5714 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseOne | 7 | 0.14 | 0.0195 | 0.0293 | 0.0293 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Top Hot Axes In Slow-Tier Seeds

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.

| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms | Cache hits | Cache misses | Cache compile ms |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | govern:chooseNStep:confirm | continuedDeepening | 33 | 16527.57 | 500.8355 | 506.1425 | 10076.245 | 0 | 0 | 0 |
| 2 | train:chooseNStep:add | continuedDeepening | 14 | 13173.83 | 940.9875 | 3429.7141 | 3429.7141 | 0 | 0 | 0 |
| 3 | govern:chooseNStep:add | continuedDeepening | 55 | 11976.79 | 217.7599 | 315.4176 | 4006.0849 | 0 | 0 | 0 |
| 4 | event | singlePass | 109 | 8229.47 | 75.4997 | 156.1549 | 3022.0736 | 0 | 0 | 0 |
| 5 | coupArvnRedeployPolice:chooseOne | continuedDeepening | 58 | 7172.12 | 123.6573 | 310.4654 | 325.3681 | 0 | 0 | 0 |
| 6 | train:chooseNStep:confirm | continuedDeepening | 12 | 6370.87 | 530.9056 | 3148.1726 | 3148.1726 | 0 | 0 | 0 |
| 7 | govern | singlePass | 47 | 3035.53 | 64.5858 | 80.2444 | 602.543 | 0 | 0 | 0 |
| 8 | coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | 84 | 1645.08 | 19.5842 | 33.0068 | 41.0225 | 0 | 0 | 0 |
| 9 | event-decision:chooseNStep:add | continuedDeepening | 6 | 1578.54 | 263.0902 | 385.9076 | 385.9076 | 0 | 0 | 0 |
| 10 | rally | singlePass | 67 | 1330.79 | 19.8626 | 47.0779 | 50.3792 | 0 | 0 | 0 |

## Hot-Path Buckets For Top Slow Axes

Captured only when `--profile-buckets` is enabled. Buckets are timing/count diagnostics inside `PolicyAgent.chooseDecision`; they are not correctness assertions.

### govern:chooseNStep:confirm | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| policyInnerPreview:chooseNStepDeepPass | 33 | 10349.26 |
| policyInnerPreview:chooseNStepBroadRun | 33 | 6154.53 |
| tokenStateIndex:refreshCachedEntries | 58404 | 788.56 |
| evalQuery:applyTokenFilter | 275379 | 403.64 |
| policyMicroturnSearch:chooseOneScoreOptions | 364 | 75.37 |
| zobrist:encodeDecisionStackFrame | 1456 | 59.77 |
| zobrist:digestDecisionStackFrame | 894 | 45.64 |
| evalQuery:countMatchingTokens | 37786 | 36.7 |
| policyInnerPreview:chooseNStepBroadSignals | 33 | 7.74 |
| policyInnerPreview:chooseNStepFinalSignals | 33 | 7.12 |
| policyMicroturnSearch:chooseNScoreOptions | 33 | 4.46 |
| policyInnerPreview:summarizeUsage | 33 | 0.54 |

### train:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| policyInnerPreview:chooseNStepBroadRun | 14 | 8097.85 |
| policyInnerPreview:chooseNStepDeepPass | 14 | 5053.81 |
| zobrist:digestDecisionStackFrame | 14430 | 2454.61 |
| zobrist:encodeDecisionStackFrame | 14556 | 1559.61 |
| tokenStateIndex:refreshCachedEntries | 15073 | 228.77 |
| policyMicroturnSearch:chooseNScoreOptions | 703 | 116.49 |
| policyMicroturnSearch:chooseOneScoreOptions | 487 | 86.03 |
| evalQuery:countMatchingTokens | 51110 | 71.36 |
| evalQuery:applyTokenFilter | 12738 | 33.31 |
| policyInnerPreview:chooseNStepBroadSignals | 14 | 6.73 |
| policyInnerPreview:chooseNStepFinalSignals | 14 | 6.11 |
| policyMicroturnSearch:chooseNRankOptions | 703 | 1.26 |

### govern:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| policyInnerPreview:chooseNStepDeepPass | 55 | 9424.14 |
| policyInnerPreview:chooseNStepBroadRun | 55 | 2507.95 |
| tokenStateIndex:refreshCachedEntries | 35197 | 419.71 |
| zobrist:digestDecisionStackFrame | 5372 | 249.1 |
| zobrist:encodeDecisionStackFrame | 5508 | 204.12 |
| evalQuery:applyTokenFilter | 117692 | 168.05 |
| policyMicroturnSearch:chooseOneScoreOptions | 592 | 89.24 |
| evalQuery:countMatchingTokens | 27021 | 29.61 |
| policyInnerPreview:chooseNStepBroadSignals | 55 | 12.45 |
| policyInnerPreview:chooseNStepFinalSignals | 55 | 11.27 |
| policyMicroturnSearch:chooseNScoreOptions | 55 | 9.07 |
| policyInnerPreview:summarizeUsage | 55 | 1.73 |

### event | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 58155 | 671.47 |
| evalQuery:applyTokenFilter | 110474 | 213.91 |
| zobrist:digestDecisionStackFrame | 1026 | 191.87 |
| zobrist:encodeDecisionStackFrame | 1026 | 120.99 |
| evalQuery:countMatchingTokens | 49013 | 50.04 |
| policyWasmRuntime:encodeBytecodeInput | 1124 | 31.21 |
| tokenStateIndex:build | 18 | 0.73 |
| evalQuery:applyTokenFilterCacheHit | 17764 | 0 |
| evalQuery:applyTokenFilterCompiled | 109718 | 0 |
| evalQuery:countMatchingTokensCacheHit | 1101739 | 0 |
| evalQuery:countMatchingTokensCompiled | 34985 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 2368255 | 0 |

### coupArvnRedeployPolice:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| policyInnerPreview:chooseOneRun | 58 | 7112.43 |
| policyInnerPreviewSubroutine:driveOption | 1774 | 6382.68 |
| policyMicroturnSearch:chooseOneScoreOptions | 1954 | 1483.91 |
| tokenStateIndex:refreshCachedEntries | 142412 | 1302.55 |
| policyInnerPreviewSubroutine:resolveRefs | 1774 | 720.62 |
| evalQuery:countMatchingTokens | 160806 | 180.98 |
| zobrist:digestDecisionStackFrame | 546 | 27.58 |
| zobrist:encodeDecisionStackFrame | 550 | 24.1 |
| policyInnerPreview:summarizeUsage | 58 | 1.78 |
| policyInnerPreviewSubroutine:surfaceSetup | 58 | 0.98 |
| evalQuery:applyTokenFilterCacheHit | 2998 | 0 |
| evalQuery:countMatchingTokensCacheHit | 3646550 | 0 |

### train:chooseNStep:confirm | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| policyInnerPreview:chooseNStepBroadRun | 12 | 3878.75 |
| policyInnerPreview:chooseNStepDeepPass | 12 | 2484.54 |
| zobrist:digestDecisionStackFrame | 8094 | 1416.71 |
| zobrist:encodeDecisionStackFrame | 8222 | 908.88 |
| tokenStateIndex:refreshCachedEntries | 3781 | 71.13 |
| policyMicroturnSearch:chooseNScoreOptions | 334 | 60.7 |
| policyMicroturnSearch:chooseOneScoreOptions | 269 | 32.13 |
| evalQuery:countMatchingTokens | 5845 | 9.7 |
| evalQuery:applyTokenFilter | 1507 | 4.41 |
| policyInnerPreview:chooseNStepBroadSignals | 12 | 2.66 |
| policyInnerPreview:chooseNStepFinalSignals | 12 | 2.09 |
| policyMicroturnSearch:chooseNRankOptions | 334 | 0.75 |

### govern | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 1272 | 158.34 |
| zobrist:encodeDecisionStackFrame | 1272 | 106.89 |
| tokenStateIndex:refreshCachedEntries | 5895 | 84.39 |
| evalQuery:applyTokenFilter | 17879 | 39.51 |
| policyWasmRuntime:encodeBytecodeInput | 376 | 12.83 |
| evalQuery:countMatchingTokens | 7293 | 7.36 |
| evalQuery:applyTokenFilterCacheHit | 18564 | 0 |
| evalQuery:applyTokenFilterCompiled | 17772 | 0 |
| evalQuery:countMatchingTokensCacheHit | 816766 | 0 |
| evalQuery:countMatchingTokensCompiled | 5131 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1552798 | 0 |
| policyWasmRuntime:encodedInputCacheMiss | 376 | 0 |

### coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| policyInnerPreview:chooseOneRun | 84 | 1609.69 |
| policyInnerPreviewSubroutine:driveOption | 696 | 1317.64 |
| policyInnerPreviewSubroutine:resolveRefs | 696 | 286.54 |
| policyMicroturnSearch:chooseOneScoreOptions | 816 | 220.48 |
| tokenStateIndex:refreshCachedEntries | 22140 | 195.05 |
| evalQuery:countMatchingTokens | 36818 | 33.42 |
| zobrist:digestDecisionStackFrame | 252 | 11.18 |
| zobrist:encodeDecisionStackFrame | 256 | 9 |
| policyInnerPreview:summarizeUsage | 84 | 1.97 |
| policyInnerPreviewSubroutine:surfaceSetup | 84 | 1.43 |
| evalQuery:applyTokenFilterCacheHit | 1136 | 0 |
| evalQuery:countMatchingTokensCacheHit | 1088222 | 0 |

### event-decision:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| policyInnerPreview:chooseNStepDeepPass | 6 | 870.46 |
| policyInnerPreview:chooseNStepBroadRun | 6 | 701.6 |
| tokenStateIndex:refreshCachedEntries | 7120 | 88.94 |
| zobrist:digestDecisionStackFrame | 1396 | 44.03 |
| zobrist:encodeDecisionStackFrame | 1528 | 32.71 |
| evalQuery:applyTokenFilter | 2580 | 7.51 |
| evalQuery:countMatchingTokens | 5723 | 5.47 |
| policyInnerPreview:chooseNStepBroadSignals | 6 | 2.02 |
| policyMicroturnSearch:chooseOneScoreOptions | 11 | 2.01 |
| policyInnerPreview:chooseNStepFinalSignals | 6 | 1.72 |
| policyMicroturnSearch:chooseNScoreOptions | 6 | 1.35 |
| policyInnerPreview:summarizeUsage | 6 | 0.09 |

### rally | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 7575 | 71.2 |
| zobrist:digestDecisionStackFrame | 242 | 17.39 |
| evalQuery:applyTokenFilter | 6170 | 16.38 |
| policyWasmRuntime:encodeBytecodeInput | 345 | 14.09 |
| zobrist:encodeDecisionStackFrame | 242 | 12.65 |
| evalQuery:countMatchingTokens | 9881 | 10.85 |
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
| coupArvnRedeployPolice:chooseOne | continuedDeepening | continued-deepening-orchestration-inclusive | 116 | 7114.21 | 99.1926% |
| coupArvnRedeployPolice:chooseOne | continuedDeepening | inner-preview-subroutine-nested | 3606 | 7104.28 | 99.0541% |
| coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | continued-deepening-orchestration-inclusive | 168 | 1611.66 | 97.9685% |
| coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | inner-preview-subroutine-nested | 1476 | 1605.61 | 97.6007% |
| coupArvnRedeployPolice:chooseOne | continuedDeepening | existing-hot-path-bucket-nested | 3953862 | 1535.21 | 21.4052% |
| coupArvnRedeployPolice:chooseOne | continuedDeepening | policy-search-candidate-scoring-nested | 1954 | 1483.91 | 20.69% |
| coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | existing-hot-path-bucket-nested | 1148824 | 248.65 | 15.1148% |
| coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | policy-search-candidate-scoring-nested | 816 | 220.48 | 13.4024% |
| coupArvnRedeployPolice:chooseOne | continuedDeepening | unattributed-after-top-level-orchestration |  | 57.91 | 0.8074% |
| coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | unattributed-after-top-level-orchestration |  | 33.42 | 2.0315% |

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
