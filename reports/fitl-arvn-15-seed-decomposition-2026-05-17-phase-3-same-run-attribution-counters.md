# FITL ARVN 15-Seed Per-Microturn-Class Decomposition

**Date**: 2026-05-17-phase-3-same-run-attribution-counters
**Status**: Spec 173 measurement witness.
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005,1011,1008,1013,1009 --timeout-ms 600000 --date 2026-05-17-phase-3-same-run-attribution-counters --profile-buckets`
**CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-3-same-run-attribution-counters.csv`

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
| 1005 | OK | terminal | 46452.09 | 398 | 116.7138 |  |
| 1011 | OK | terminal | 7428.38 | 206 | 36.0601 |  |
| 1008 | OK | terminal | 20101.17 | 346 | 58.0959 |  |
| 1013 | OK | terminal | 7804.11 | 258 | 30.2485 |  |
| 1009 | OK | terminal | 12335 | 292 | 42.2432 |  |

## Per-Microturn-Class Rollup

| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | Cache hits | Cache misses | Cache compile ms | WASM preview-drive routes | WASM preview-drive unsupported | WASM preview-drive unsupported reasons | WASM preview-drive batches | WASM timing calls | Marshaling ms | Execution ms | Deserialization ms | Bytes serialized | Cache write ms | Cache write bytes | Cache write count | Token index builds | Static rebuilds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| govern:chooseNStep:confirm | 44 | 17017.08 | 386.7519 | 432.2232 | 10471.4743 | 6.3864 | 0 | 877 | 397 | 0 | 0 | 0 | 0 | 0 | 0 | 182 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state/expected-terminal-boundary/seat-or-turn-boundary:182 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| train:chooseNStep:add | 14 | 13579.11 | 969.9367 | 3570.1491 | 3570.1491 | 17.5 | 0 | 3443 | 6438 | 0 | 0 | 0 | 0 | 0 | 180 | 5 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state/expected-terminal-boundary/seat-or-turn-boundary:5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| govern:chooseNStep:add | 55 | 12432.16 | 226.0393 | 323.285 | 4250.8766 | 5.7818 | 0 | 1425 | 2217 | 0 | 0 | 0 | 0 | 0 | 261 | 35 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state/expected-terminal-boundary/seat-or-turn-boundary:35 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event | 109 | 8492.93 | 77.9168 | 165.3813 | 3159.7047 | 21.3119 | 109 | 0 | 0 | 109 | 78 | 0 | 0 | 0 | 0 | 122 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:122 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 18 | 119 |
| coupArvnRedeployPolice:chooseOne | 58 | 7743.68 | 133.5117 | 331.3546 | 347.3767 | 30.5862 | 0 | 57816 | 1954 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| train:chooseNStep:confirm | 22 | 6482.75 | 294.6705 | 3057.93 | 3060.4335 | 4.5 | 0 | 1747 | 3733 | 0 | 0 | 0 | 0 | 0 | 58 | 5 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state/expected-terminal-boundary/seat-or-turn-boundary:5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| govern | 47 | 3130.22 | 66.6005 | 82.5819 | 634.878 | 11.1064 | 45 | 0 | 2 | 45 | 32 | 0 | 0 | 0 | 16 | 94 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:50; unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:44 | 66 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 45 |
| coupArvnRedeployOptionalTroops:chooseOne | 84 | 1720.48 | 20.4819 | 33.6051 | 41.0872 | 8.2857 | 0 | 5844 | 816 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseNStep:add | 48 | 1678.77 | 34.9744 | 290.5827 | 396.8408 | 9.6458 | 0 | 164 | 706 | 0 | 0 | 0 | 0 | 0 | 39 | 14 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state/expected-terminal-boundary/seat-or-turn-boundary:14 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally | 67 | 1371.16 | 20.4651 | 45.9156 | 49.6308 | 17.194 | 57 | 0 | 10 | 57 | 35 | 0 | 0 | 0 | 195 | 78 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:68; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:10 | 205 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 57 |
| coupArvnRedeployOptionalTroops | 32 | 1344.63 | 42.0197 | 48.3551 | 51.0758 | 17.125 | 25 | 0 | 7 | 25 | 0 | 0 | 0 | 0 | 14 | 64 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:64 | 78 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 25 |
| coupArvnRedeployPolice | 27 | 853.93 | 31.6269 | 33.9147 | 36.3676 | 11.8889 | 27 | 0 | 0 | 27 | 0 | 0 | 0 | 0 | 0 | 54 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:54 | 54 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 27 |
| coupArvnRedeployMandatory:chooseOne | 12 | 321.84 | 26.8201 | 37.5408 | 37.5408 | 8 | 0 | 1428 | 204 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| transport:chooseOne | 8 | 294.57 | 36.8214 | 60.9783 | 60.9783 | 12.25 | 0 | 290 | 18 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupRedeployPass | 32 | 283.49 | 8.8591 | 27.6383 | 28.682 | 3.0625 | 15 | 0 | 17 | 15 | 13 | 0 | 0 | 0 | 32 | 16 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:16 | 48 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 15 |
| train | 8 | 255.88 | 31.9848 | 59.6922 | 59.6922 | 5.75 | 8 | 0 | 0 | 8 | 10 | 0 | 0 | 0 | 28 | 8 | agent-guided-completion/production-preview-drive.chooseN/only origin-seat greedy chooseN publication is supported:4; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:4 | 36 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 8 |
| coupPacifyUS | 25 | 224.46 | 8.9786 | 14.8427 | 15.341 | 2.8 | 25 | 0 | 0 | 25 | 0 | 0 | 0 | 0 | 35 | 15 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:15 | 50 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 25 |
| transport | 4 | 211.21 | 52.8027 | 56.6779 | 56.6779 | 11.5 | 4 | 0 | 0 | 4 | 0 | 0 | 0 | 0 | 0 | 8 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:4; unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:4 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 4 |
| govern:chooseOne | 58 | 210.92 | 3.6365 | 5.2736 | 8.3469 | 2 | 0 | 80 | 80 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupAgitateVC | 22 | 172.36 | 7.8346 | 11.3818 | 11.7694 | 2.7273 | 17 | 0 | 5 | 17 | 4 | 0 | 0 | 0 | 64 | 24 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:24 | 88 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 17 |
| infiltrate | 16 | 167.99 | 10.4991 | 16.6646 | 16.6646 | 53.4375 | 12 | 0 | 4 | 12 | 2 | 0 | 0 | 0 | 55 | 0 |  | 55 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 12 |
| advise | 13 | 128.67 | 9.898 | 16.1905 | 16.1905 | 11.6923 | 10 | 0 | 3 | 10 | 3 | 0 | 0 | 0 | 52 | 0 |  | 52 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 10 |
| coupCommitmentPass | 32 | 107.58 | 3.3619 | 5.2567 | 5.5494 | 1.1563 | 3 | 0 | 29 | 3 | 0 | 0 | 0 | 0 | 53 | 0 |  | 53 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 3 |
| ambushVc | 7 | 102.57 | 14.6533 | 29.0747 | 29.0747 | 6.8571 | 7 | 0 | 0 | 7 | 0 | 0 | 0 | 0 | 30 | 6 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:6 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 7 |
| coupPacifyARVN | 11 | 100.47 | 9.1335 | 13.3334 | 13.3334 | 3.8182 | 5 | 0 | 6 | 5 | 8 | 0 | 0 | 0 | 24 | 10 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:10 | 34 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5 |
| coupNvaRedeployTroops | 11 | 99.26 | 9.0232 | 16.9877 | 16.9877 | 3.6364 | 7 | 0 | 4 | 7 | 0 | 0 | 0 | 0 | 8 | 7 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:7 | 15 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 7 |
| coupArvnRedeployMandatory | 2 | 89.41 | 44.7042 | 46.3792 | 46.3792 | 11.5 | 1 | 0 | 1 | 1 | 0 | 0 | 0 | 0 | 2 | 4 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:4 | 6 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| march | 15 | 88.56 | 5.9043 | 10.2649 | 10.2649 | 4.6 | 10 | 0 | 5 | 10 | 13 | 0 | 0 | 0 | 39 | 0 |  | 39 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 10 |
| assault | 8 | 83.74 | 10.4681 | 14.9976 | 14.9976 | 4.875 | 8 | 0 | 0 | 8 | 1 | 0 | 0 | 0 | 31 | 0 |  | 31 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 8 |
| coupPacifyPass | 16 | 65.09 | 4.0684 | 7.7149 | 7.7149 | 1.0625 | 14 | 0 | 2 | 14 | 0 | 0 | 0 | 0 | 26 | 0 |  | 26 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 14 |
| train:chooseOne | 12 | 57.16 | 4.7636 | 8.552 | 8.552 | 2.25 | 0 | 28 | 39 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| attack | 4 | 45.6 | 11.4009 | 13.3185 | 13.3185 | 54.5 | 4 | 0 | 0 | 4 | 0 | 0 | 0 | 0 | 16 | 0 |  | 16 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 4 |
| coupVictoryCheck | 8 | 30.66 | 3.8325 | 4.8848 | 4.8848 | 1 | 8 | 0 | 0 | 8 | 1 | 0 | 0 | 0 | 8 | 0 |  | 8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 8 |
| coupResourcesResolve | 8 | 29.73 | 3.7164 | 4.91 | 4.91 | 1 | 1 | 0 | 7 | 1 | 0 | 0 | 0 | 0 | 8 | 0 |  | 8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| coupAgitatePass | 8 | 29.49 | 3.6867 | 5.5011 | 5.5011 | 1.125 | 5 | 0 | 3 | 5 | 0 | 0 | 0 | 0 | 18 | 0 |  | 18 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5 |
| coupCommitmentResolve | 3 | 14.5 | 4.8328 | 6.9692 | 6.9692 | 2 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 6 | 0 |  | 6 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| chooseOne:chooseOne | 13 | 9.13 | 0.7025 | 7.4834 | 7.4834 | 5.9231 | 0 | 4 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseNStep:add | 68 | 4.89 | 0.0719 | 0.1075 | 0.7526 | 20.9706 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseOne | 12 | 4.47 | 0.3727 | 4.086 | 4.086 | 2.9167 | 0 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| pass | 1 | 3.41 | 3.4054 | 3.4054 | 3.4054 | 1 | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 1 | 0 |  | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| rally:chooseNStep:confirm | 77 | 2.72 | 0.0353 | 0.0612 | 0.1264 | 17.6753 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseOne | 70 | 2.35 | 0.0336 | 0.0829 | 0.1624 | 1.3571 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseNStep:confirm | 47 | 1.67 | 0.0355 | 0.103 | 0.1546 | 5.7234 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:add | 13 | 1.57 | 0.1209 | 0.7286 | 0.7286 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:confirm | 35 | 1.28 | 0.0364 | 0.0559 | 0.0561 | 4.8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseOne | 27 | 1.22 | 0.0451 | 0.0851 | 0.1482 | 2.4444 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:add | 21 | 1.22 | 0.058 | 0.0846 | 0.0856 | 12.7143 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupNvaRedeployTroops:chooseOne | 25 | 0.98 | 0.0392 | 0.0574 | 0.0621 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseOne | 23 | 0.9 | 0.0391 | 0.0833 | 0.0875 | 1.6957 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:add | 16 | 0.89 | 0.0555 | 0.0876 | 0.0876 | 3.75 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:add | 8 | 0.85 | 0.1067 | 0.3149 | 0.3149 | 2.75 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:confirm | 26 | 0.82 | 0.0317 | 0.0541 | 0.0551 | 4.5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:confirm | 13 | 0.65 | 0.0502 | 0.0908 | 0.0908 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:confirm | 16 | 0.5 | 0.031 | 0.1023 | 0.1023 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupCommitmentResolve:chooseNStep:confirm | 12 | 0.46 | 0.0386 | 0.0848 | 0.0848 | 9.25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:add | 7 | 0.4 | 0.0566 | 0.1199 | 0.1199 | 3.5714 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| chooseNStep:chooseNStep:confirm | 6 | 0.28 | 0.0464 | 0.0644 | 0.0644 | 19.6667 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:confirm | 7 | 0.19 | 0.0269 | 0.0406 | 0.0406 | 4.5714 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseOne | 7 | 0.15 | 0.021 | 0.0308 | 0.0308 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Top Hot Axes In Slow-Tier Seeds

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.

| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms | Cache hits | Cache misses | Cache compile ms |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | govern:chooseNStep:confirm | continuedDeepening | 33 | 17016.1 | 515.6395 | 596.051 | 10471.4743 | 0 | 0 | 0 |
| 2 | train:chooseNStep:add | continuedDeepening | 14 | 13579.11 | 969.9367 | 3570.1491 | 3570.1491 | 0 | 0 | 0 |
| 3 | govern:chooseNStep:add | continuedDeepening | 55 | 12432.16 | 226.0393 | 323.285 | 4250.8766 | 0 | 0 | 0 |
| 4 | event | singlePass | 109 | 8492.93 | 77.9168 | 165.3813 | 3159.7047 | 0 | 0 | 0 |
| 5 | coupArvnRedeployPolice:chooseOne | continuedDeepening | 58 | 7743.68 | 133.5117 | 331.3546 | 347.3767 | 0 | 0 | 0 |
| 6 | train:chooseNStep:confirm | continuedDeepening | 12 | 6481.67 | 540.1392 | 3060.4335 | 3060.4335 | 0 | 0 | 0 |
| 7 | govern | singlePass | 47 | 3130.22 | 66.6005 | 82.5819 | 634.878 | 0 | 0 | 0 |
| 8 | coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | 84 | 1720.48 | 20.4819 | 33.6051 | 41.0872 | 0 | 0 | 0 |
| 9 | event-decision:chooseNStep:add | continuedDeepening | 6 | 1676.95 | 279.4922 | 396.8408 | 396.8408 | 0 | 0 | 0 |
| 10 | rally | singlePass | 67 | 1371.16 | 20.4651 | 45.9156 | 49.6308 | 0 | 0 | 0 |

## Hot-Path Buckets For Top Slow Axes

Captured only when `--profile-buckets` is enabled. Buckets are timing/count diagnostics inside `PolicyAgent.chooseDecision`; they are not correctness assertions.

### govern:chooseNStep:confirm | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 58404 | 790.54 |
| evalQuery:applyTokenFilter | 275379 | 395.19 |
| zobrist:encodeDecisionStackFrame | 1456 | 58.5 |
| zobrist:digestDecisionStackFrame | 894 | 46.33 |
| evalQuery:countMatchingTokens | 37786 | 42.33 |
| evalQuery:applyTokenFilterCacheHit | 31227 | 0 |
| evalQuery:applyTokenFilterCompiled | 274857 | 0 |
| evalQuery:countMatchingTokensCacheHit | 3134984 | 0 |
| evalQuery:countMatchingTokensCompiled | 27070 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 6887743 | 0 |
| tokenStateIndex:getCacheHit | 216313 | 0 |
| zobrist:decisionStackFrameEncodedChars | 5676645 | 0 |

### train:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 14430 | 2509.16 |
| zobrist:encodeDecisionStackFrame | 14556 | 1561.42 |
| tokenStateIndex:refreshCachedEntries | 15073 | 244.73 |
| evalQuery:countMatchingTokens | 51110 | 77.46 |
| evalQuery:applyTokenFilter | 12738 | 36.62 |
| evalQuery:applyTokenFilterCacheHit | 12998 | 0 |
| evalQuery:applyTokenFilterCompiled | 12738 | 0 |
| evalQuery:countMatchingTokensCacheHit | 1614032 | 0 |
| evalQuery:countMatchingTokensCompiled | 15646 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 4013930 | 0 |
| policyWasmStatePatch:reuseAppliedStateHash | 865 | 0 |
| tokenStateIndex:getCacheHit | 27889 | 0 |

### govern:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 35197 | 429.03 |
| zobrist:digestDecisionStackFrame | 5372 | 250.95 |
| zobrist:encodeDecisionStackFrame | 5508 | 207.57 |
| evalQuery:applyTokenFilter | 117692 | 182.08 |
| evalQuery:countMatchingTokens | 27021 | 32.23 |
| evalQuery:applyTokenFilterCacheHit | 17539 | 0 |
| evalQuery:applyTokenFilterCompiled | 117431 | 0 |
| evalQuery:countMatchingTokensCacheHit | 2430450 | 0 |
| evalQuery:countMatchingTokensCompiled | 21663 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 5485737 | 0 |
| evalQuery:countMatchingTokensNoFilter | 126 | 0 |
| policyWasmStatePatch:reuseAppliedStateHash | 783 | 0 |

### event | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 58155 | 703.51 |
| evalQuery:applyTokenFilter | 110474 | 218.95 |
| zobrist:digestDecisionStackFrame | 1026 | 195.21 |
| zobrist:encodeDecisionStackFrame | 1026 | 119.6 |
| evalQuery:countMatchingTokens | 49013 | 54.32 |
| policyWasmRuntime:encodeBytecodeInput | 1124 | 32.13 |
| tokenStateIndex:build | 18 | 0.88 |
| evalQuery:applyTokenFilterCacheHit | 17764 | 0 |
| evalQuery:applyTokenFilterCompiled | 109718 | 0 |
| evalQuery:countMatchingTokensCacheHit | 1101739 | 0 |
| evalQuery:countMatchingTokensCompiled | 34985 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 2368255 | 0 |

### coupArvnRedeployPolice:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 142412 | 1405.17 |
| evalQuery:countMatchingTokens | 160806 | 193.6 |
| zobrist:digestDecisionStackFrame | 546 | 28.78 |
| zobrist:encodeDecisionStackFrame | 550 | 27.55 |
| evalQuery:applyTokenFilterCacheHit | 2998 | 0 |
| evalQuery:countMatchingTokensCacheHit | 3646550 | 0 |
| evalQuery:countMatchingTokensCompiled | 160806 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 10270634 | 0 |
| tokenStateIndex:getCacheHit | 142412 | 0 |
| zobrist:decisionStackFrameEncodedChars | 3410899 | 0 |
| zobrist:decisionStackFrameRunLocalCacheHit | 4 | 0 |
| zobrist:decisionStackFrameRunLocalCacheMiss | 546 | 0 |

### train:chooseNStep:confirm | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 8094 | 1459.05 |
| zobrist:encodeDecisionStackFrame | 8222 | 918.54 |
| tokenStateIndex:refreshCachedEntries | 3781 | 64.15 |
| evalQuery:countMatchingTokens | 5845 | 9.38 |
| evalQuery:applyTokenFilter | 1507 | 6.1 |
| evalQuery:applyTokenFilterCacheHit | 5601 | 0 |
| evalQuery:applyTokenFilterCompiled | 1507 | 0 |
| evalQuery:countMatchingTokensCacheHit | 340211 | 0 |
| evalQuery:countMatchingTokensCompiled | 5845 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 864258 | 0 |
| policyWasmStatePatch:reuseAppliedStateHash | 596 | 0 |
| tokenStateIndex:getCacheHit | 8086 | 0 |

### govern | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 1272 | 161.11 |
| zobrist:encodeDecisionStackFrame | 1272 | 109.07 |
| tokenStateIndex:refreshCachedEntries | 5895 | 89.86 |
| evalQuery:applyTokenFilter | 17879 | 38.53 |
| policyWasmRuntime:encodeBytecodeInput | 376 | 12.34 |
| evalQuery:countMatchingTokens | 7293 | 8.96 |
| evalQuery:applyTokenFilterCacheHit | 18564 | 0 |
| evalQuery:applyTokenFilterCompiled | 17772 | 0 |
| evalQuery:countMatchingTokensCacheHit | 816766 | 0 |
| evalQuery:countMatchingTokensCompiled | 5131 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1552798 | 0 |
| policyWasmRuntime:encodedInputCacheMiss | 376 | 0 |

### coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 22140 | 205.89 |
| evalQuery:countMatchingTokens | 36818 | 32.04 |
| zobrist:digestDecisionStackFrame | 252 | 11.24 |
| zobrist:encodeDecisionStackFrame | 256 | 8.93 |
| evalQuery:applyTokenFilterCacheHit | 1136 | 0 |
| evalQuery:countMatchingTokensCacheHit | 1088222 | 0 |
| evalQuery:countMatchingTokensCompiled | 36818 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 2310269 | 0 |
| tokenStateIndex:getCacheHit | 22140 | 0 |
| zobrist:decisionStackFrameEncodedChars | 1375821 | 0 |
| zobrist:decisionStackFrameRunLocalCacheHit | 4 | 0 |
| zobrist:decisionStackFrameRunLocalCacheMiss | 252 | 0 |

### event-decision:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 7120 | 89.19 |
| zobrist:digestDecisionStackFrame | 1396 | 44.86 |
| zobrist:encodeDecisionStackFrame | 1528 | 34.57 |
| evalQuery:applyTokenFilter | 2580 | 8.87 |
| evalQuery:countMatchingTokens | 5723 | 6.14 |
| evalQuery:applyTokenFilterCacheHit | 1721 | 0 |
| evalQuery:applyTokenFilterCompiled | 2558 | 0 |
| evalQuery:countMatchingTokensCacheHit | 746576 | 0 |
| evalQuery:countMatchingTokensCompiled | 3655 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1521014 | 0 |
| policyWasmStatePatch:reuseAppliedStateHash | 45 | 0 |
| tokenStateIndex:getCacheHit | 20969 | 0 |

### rally | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 7575 | 75.64 |
| evalQuery:applyTokenFilter | 6170 | 21.26 |
| zobrist:digestDecisionStackFrame | 242 | 17.68 |
| zobrist:encodeDecisionStackFrame | 242 | 14.04 |
| policyWasmRuntime:encodeBytecodeInput | 345 | 11.45 |
| evalQuery:countMatchingTokens | 9881 | 10.14 |
| evalQuery:applyTokenFilterCacheHit | 3667 | 0 |
| evalQuery:applyTokenFilterCompiled | 6012 | 0 |
| evalQuery:countMatchingTokensCacheHit | 601356 | 0 |
| evalQuery:countMatchingTokensCompiled | 7719 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1418674 | 0 |
| policyWasmRuntime:encodedInputCacheMiss | 345 | 0 |


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
