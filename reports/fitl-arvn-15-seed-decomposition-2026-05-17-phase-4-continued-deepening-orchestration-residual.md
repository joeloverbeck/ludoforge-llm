# FITL ARVN 15-Seed Per-Microturn-Class Decomposition

**Date**: 2026-05-17-phase-4-continued-deepening-orchestration-residual
**Status**: FITL ARVN measurement witness.
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005,1011,1008,1013,1009 --timeout-ms 600000 --date 2026-05-17-phase-4-continued-deepening-orchestration-residual --profile-buckets`
**CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-4-continued-deepening-orchestration-residual.csv`

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
| 1005 | OK | terminal | 44579.06 | 398 | 112.0077 |  |
| 1011 | OK | terminal | 7424.89 | 206 | 36.0432 |  |
| 1008 | OK | terminal | 19927.11 | 346 | 57.5928 |  |
| 1013 | OK | terminal | 7810.97 | 258 | 30.2751 |  |
| 1009 | OK | terminal | 12010.82 | 292 | 41.1329 |  |

## Per-Microturn-Class Rollup

| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | Cache hits | Cache misses | Cache compile ms | WASM preview-drive routes | WASM preview-drive unsupported | WASM preview-drive unsupported reasons | WASM preview-drive batches | WASM timing calls | Marshaling ms | Execution ms | Deserialization ms | Bytes serialized | Cache write ms | Cache write bytes | Cache write count | Token index builds | Static rebuilds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| govern:chooseNStep:confirm | 44 | 16601.97 | 377.3175 | 390.2484 | 10304.5253 | 6.3864 | 0 | 877 | 397 | 0 | 0 | 0 | 0 | 0 | 0 | 182 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state/expected-terminal-boundary/seat-or-turn-boundary:182 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| train:chooseNStep:add | 14 | 13357.66 | 954.1188 | 3438.39 | 3438.39 | 17.5 | 0 | 3443 | 6438 | 0 | 0 | 0 | 0 | 0 | 180 | 5 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state/expected-terminal-boundary/seat-or-turn-boundary:5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| govern:chooseNStep:add | 55 | 12084.57 | 219.7195 | 312.8447 | 4097.3365 | 5.7818 | 0 | 1425 | 2217 | 0 | 0 | 0 | 0 | 0 | 261 | 35 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state/expected-terminal-boundary/seat-or-turn-boundary:35 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event | 109 | 8307.29 | 76.2137 | 168.9215 | 3193.1697 | 21.3119 | 109 | 0 | 0 | 109 | 78 | 0 | 0 | 0 | 0 | 122 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:122 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 18 | 119 |
| coupArvnRedeployPolice:chooseOne | 58 | 7635.87 | 131.6528 | 326.9492 | 333.6838 | 30.5862 | 0 | 57816 | 1954 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| train:chooseNStep:confirm | 22 | 6277.12 | 285.3237 | 2949.6868 | 2959.3025 | 4.5 | 0 | 1747 | 3733 | 0 | 0 | 0 | 0 | 0 | 58 | 5 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state/expected-terminal-boundary/seat-or-turn-boundary:5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| govern | 47 | 3022.95 | 64.3181 | 77.9065 | 602.9717 | 11.1064 | 45 | 0 | 2 | 45 | 32 | 0 | 0 | 0 | 16 | 94 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:50; unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:44 | 66 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 45 |
| coupArvnRedeployOptionalTroops:chooseOne | 84 | 1705.84 | 20.3076 | 33.4083 | 40.8905 | 8.2857 | 0 | 5844 | 816 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseNStep:add | 48 | 1543.13 | 32.1486 | 260.078 | 374.1891 | 9.6458 | 0 | 164 | 706 | 0 | 0 | 0 | 0 | 0 | 39 | 14 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state/expected-terminal-boundary/seat-or-turn-boundary:14 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally | 67 | 1349.02 | 20.1346 | 44.5784 | 47.0653 | 17.194 | 57 | 0 | 10 | 57 | 35 | 0 | 0 | 0 | 195 | 78 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:68; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:10 | 205 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 57 |
| coupArvnRedeployOptionalTroops | 32 | 1327.69 | 41.4902 | 54.3853 | 54.5164 | 17.125 | 25 | 0 | 7 | 25 | 0 | 0 | 0 | 0 | 14 | 64 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:64 | 78 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 25 |
| coupArvnRedeployPolice | 27 | 867.01 | 32.1115 | 39.1181 | 40.1654 | 11.8889 | 27 | 0 | 0 | 27 | 0 | 0 | 0 | 0 | 0 | 54 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:54 | 54 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 27 |
| coupArvnRedeployMandatory:chooseOne | 12 | 315.15 | 26.2628 | 37.9183 | 37.9183 | 8 | 0 | 1428 | 204 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupRedeployPass | 32 | 294.67 | 9.2083 | 28.4911 | 41.4636 | 3.0625 | 15 | 0 | 17 | 15 | 13 | 0 | 0 | 0 | 32 | 16 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:16 | 48 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 15 |
| transport:chooseOne | 8 | 282.84 | 35.3546 | 55.5718 | 55.5718 | 12.25 | 0 | 290 | 18 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| train | 8 | 243.96 | 30.4952 | 55.7203 | 55.7203 | 5.75 | 8 | 0 | 0 | 8 | 10 | 0 | 0 | 0 | 28 | 8 | agent-guided-completion/production-preview-drive.chooseN/only origin-seat greedy chooseN publication is supported:4; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:4 | 36 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 8 |
| transport | 4 | 203.15 | 50.7879 | 53.4296 | 53.4296 | 11.5 | 4 | 0 | 0 | 4 | 0 | 0 | 0 | 0 | 0 | 8 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:4; unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:4 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 4 |
| coupPacifyUS | 25 | 202.84 | 8.1136 | 12.4558 | 12.8169 | 2.8 | 25 | 0 | 0 | 25 | 0 | 0 | 0 | 0 | 35 | 15 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:15 | 50 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 25 |
| govern:chooseOne | 58 | 197.45 | 3.4043 | 4.5584 | 4.8987 | 2 | 0 | 80 | 80 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupAgitateVC | 22 | 174.29 | 7.9224 | 11.7408 | 16.8283 | 2.7273 | 17 | 0 | 5 | 17 | 4 | 0 | 0 | 0 | 64 | 24 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:24 | 88 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 17 |
| infiltrate | 16 | 154.4 | 9.6498 | 12.5676 | 12.5676 | 53.4375 | 12 | 0 | 4 | 12 | 2 | 0 | 0 | 0 | 55 | 0 |  | 55 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 12 |
| advise | 13 | 123.44 | 9.4952 | 15.7613 | 15.7613 | 11.6923 | 10 | 0 | 3 | 10 | 3 | 0 | 0 | 0 | 52 | 0 |  | 52 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 10 |
| coupCommitmentPass | 32 | 107.42 | 3.3569 | 5.4729 | 9.2606 | 1.1563 | 3 | 0 | 29 | 3 | 0 | 0 | 0 | 0 | 53 | 0 |  | 53 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 3 |
| coupPacifyARVN | 11 | 102.97 | 9.3611 | 15.1662 | 15.1662 | 3.8182 | 5 | 0 | 6 | 5 | 8 | 0 | 0 | 0 | 24 | 10 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:10 | 34 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5 |
| coupNvaRedeployTroops | 11 | 100.48 | 9.1347 | 18.4998 | 18.4998 | 3.6364 | 7 | 0 | 4 | 7 | 0 | 0 | 0 | 0 | 8 | 7 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:7 | 15 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 7 |
| ambushVc | 7 | 97.34 | 13.9061 | 24.0589 | 24.0589 | 6.8571 | 7 | 0 | 0 | 7 | 0 | 0 | 0 | 0 | 30 | 6 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:6 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 7 |
| march | 15 | 87.58 | 5.8389 | 11.9821 | 11.9821 | 4.6 | 10 | 0 | 5 | 10 | 13 | 0 | 0 | 0 | 39 | 0 |  | 39 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 10 |
| coupArvnRedeployMandatory | 2 | 81.77 | 40.887 | 40.9616 | 40.9616 | 11.5 | 1 | 0 | 1 | 1 | 0 | 0 | 0 | 0 | 2 | 4 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:4 | 6 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| assault | 8 | 73.46 | 9.1828 | 11.3684 | 11.3684 | 4.875 | 8 | 0 | 0 | 8 | 1 | 0 | 0 | 0 | 31 | 0 |  | 31 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 8 |
| coupPacifyPass | 16 | 64.95 | 4.0595 | 7.0001 | 7.0001 | 1.0625 | 14 | 0 | 2 | 14 | 0 | 0 | 0 | 0 | 26 | 0 |  | 26 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 14 |
| train:chooseOne | 12 | 59.34 | 4.9454 | 7.0877 | 7.0877 | 2.25 | 0 | 28 | 39 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| attack | 4 | 45.05 | 11.2619 | 12.8817 | 12.8817 | 54.5 | 4 | 0 | 0 | 4 | 0 | 0 | 0 | 0 | 16 | 0 |  | 16 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 4 |
| coupVictoryCheck | 8 | 28.16 | 3.52 | 4.3213 | 4.3213 | 1 | 8 | 0 | 0 | 8 | 1 | 0 | 0 | 0 | 8 | 0 |  | 8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 8 |
| coupAgitatePass | 8 | 27.49 | 3.4364 | 5.3832 | 5.3832 | 1.125 | 5 | 0 | 3 | 5 | 0 | 0 | 0 | 0 | 18 | 0 |  | 18 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5 |
| coupResourcesResolve | 8 | 26.05 | 3.2556 | 4.2721 | 4.2721 | 1 | 1 | 0 | 7 | 1 | 0 | 0 | 0 | 0 | 8 | 0 |  | 8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| coupCommitmentResolve | 3 | 11.62 | 3.8723 | 4.1988 | 4.1988 | 2 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 6 | 0 |  | 6 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| chooseOne:chooseOne | 13 | 7.46 | 0.5737 | 5.8083 | 5.8083 | 5.9231 | 0 | 4 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseOne | 12 | 5.04 | 0.42 | 4.6837 | 4.6837 | 2.9167 | 0 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseNStep:add | 68 | 4.53 | 0.0667 | 0.1061 | 0.6436 | 20.9706 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| pass | 1 | 3.46 | 3.4556 | 3.4556 | 3.4556 | 1 | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 1 | 0 |  | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| rally:chooseNStep:confirm | 77 | 2.88 | 0.0374 | 0.0879 | 0.2357 | 17.6753 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseOne | 70 | 2.3 | 0.0329 | 0.0787 | 0.1957 | 1.3571 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:add | 13 | 1.56 | 0.1203 | 0.7856 | 0.7856 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseNStep:confirm | 47 | 1.44 | 0.0305 | 0.1091 | 0.1487 | 5.7234 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:add | 21 | 1.26 | 0.06 | 0.0831 | 0.106 | 12.7143 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:confirm | 35 | 1.19 | 0.0341 | 0.058 | 0.0669 | 4.8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseOne | 27 | 1.17 | 0.0432 | 0.1037 | 0.1351 | 2.4444 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupNvaRedeployTroops:chooseOne | 25 | 0.9 | 0.0362 | 0.0538 | 0.0565 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseOne | 23 | 0.75 | 0.0327 | 0.0568 | 0.0693 | 1.6957 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:add | 16 | 0.74 | 0.0459 | 0.0557 | 0.0557 | 3.75 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:confirm | 26 | 0.73 | 0.028 | 0.0488 | 0.0568 | 4.5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:confirm | 13 | 0.54 | 0.0418 | 0.0799 | 0.0799 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:confirm | 16 | 0.52 | 0.0324 | 0.0907 | 0.0907 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:add | 8 | 0.5 | 0.0621 | 0.1203 | 0.1203 | 2.75 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupCommitmentResolve:chooseNStep:confirm | 12 | 0.33 | 0.0271 | 0.0442 | 0.0442 | 9.25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:add | 7 | 0.27 | 0.0387 | 0.0436 | 0.0436 | 3.5714 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| chooseNStep:chooseNStep:confirm | 6 | 0.26 | 0.0434 | 0.0789 | 0.0789 | 19.6667 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:confirm | 7 | 0.17 | 0.0238 | 0.0305 | 0.0305 | 4.5714 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseOne | 7 | 0.14 | 0.0195 | 0.0262 | 0.0262 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Top Hot Axes In Slow-Tier Seeds

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.

| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms | Cache hits | Cache misses | Cache compile ms |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | govern:chooseNStep:confirm | continuedDeepening | 33 | 16600.97 | 503.0598 | 518.1801 | 10304.5253 | 0 | 0 | 0 |
| 2 | train:chooseNStep:add | continuedDeepening | 14 | 13357.66 | 954.1188 | 3438.39 | 3438.39 | 0 | 0 | 0 |
| 3 | govern:chooseNStep:add | continuedDeepening | 55 | 12084.57 | 219.7195 | 312.8447 | 4097.3365 | 0 | 0 | 0 |
| 4 | event | singlePass | 109 | 8307.29 | 76.2137 | 168.9215 | 3193.1697 | 0 | 0 | 0 |
| 5 | coupArvnRedeployPolice:chooseOne | continuedDeepening | 58 | 7635.87 | 131.6528 | 326.9492 | 333.6838 | 0 | 0 | 0 |
| 6 | train:chooseNStep:confirm | continuedDeepening | 12 | 6275.98 | 522.9981 | 2959.3025 | 2959.3025 | 0 | 0 | 0 |
| 7 | govern | singlePass | 47 | 3022.95 | 64.3181 | 77.9065 | 602.9717 | 0 | 0 | 0 |
| 8 | coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | 84 | 1705.84 | 20.3076 | 33.4083 | 40.8905 | 0 | 0 | 0 |
| 9 | event-decision:chooseNStep:add | continuedDeepening | 6 | 1541.72 | 256.9537 | 374.1891 | 374.1891 | 0 | 0 | 0 |
| 10 | rally | singlePass | 67 | 1349.02 | 20.1346 | 44.5784 | 47.0653 | 0 | 0 | 0 |

## Hot-Path Buckets For Top Slow Axes

Captured only when `--profile-buckets` is enabled. Buckets are timing/count diagnostics inside `PolicyAgent.chooseDecision`; they are not correctness assertions.

### govern:chooseNStep:confirm | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| policyInnerPreview:chooseNStepDeepPass | 33 | 10375.77 |
| policyInnerPreview:chooseNStepBroadRun | 33 | 6199.16 |
| tokenStateIndex:refreshCachedEntries | 58404 | 775.19 |
| evalQuery:applyTokenFilter | 275379 | 429.34 |
| policyMicroturnSearch:chooseOneScoreOptions | 364 | 71.8 |
| zobrist:encodeDecisionStackFrame | 1456 | 58.47 |
| zobrist:digestDecisionStackFrame | 894 | 46.11 |
| evalQuery:countMatchingTokens | 37786 | 38.86 |
| policyInnerPreview:chooseNStepBroadSignals | 33 | 9.24 |
| policyInnerPreview:chooseNStepFinalSignals | 33 | 7.5 |
| policyMicroturnSearch:chooseNScoreOptions | 33 | 4.71 |
| policyInnerPreview:summarizeUsage | 33 | 0.55 |

### train:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| policyInnerPreview:chooseNStepBroadRun | 14 | 8225.44 |
| policyInnerPreview:chooseNStepDeepPass | 14 | 5108.63 |
| zobrist:digestDecisionStackFrame | 14430 | 2515.9 |
| zobrist:encodeDecisionStackFrame | 14556 | 1532.27 |
| tokenStateIndex:refreshCachedEntries | 15073 | 237.77 |
| policyMicroturnSearch:chooseNScoreOptions | 703 | 123.87 |
| policyMicroturnSearch:chooseOneScoreOptions | 487 | 83.07 |
| evalQuery:countMatchingTokens | 51110 | 66.09 |
| evalQuery:applyTokenFilter | 12738 | 37.98 |
| policyInnerPreview:chooseNStepBroadSignals | 14 | 7.4 |
| policyInnerPreview:chooseNStepFinalSignals | 14 | 6.23 |
| policyMicroturnSearch:chooseNRankOptions | 703 | 1.06 |

### govern:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| policyInnerPreview:chooseNStepDeepPass | 55 | 9543.51 |
| policyInnerPreview:chooseNStepBroadRun | 55 | 2495.61 |
| tokenStateIndex:refreshCachedEntries | 35197 | 414.59 |
| zobrist:digestDecisionStackFrame | 5372 | 250.63 |
| zobrist:encodeDecisionStackFrame | 5508 | 205.15 |
| evalQuery:applyTokenFilter | 117692 | 190.45 |
| policyMicroturnSearch:chooseOneScoreOptions | 592 | 90.11 |
| evalQuery:countMatchingTokens | 27021 | 30.59 |
| policyInnerPreview:chooseNStepBroadSignals | 55 | 13.65 |
| policyInnerPreview:chooseNStepFinalSignals | 55 | 11.6 |
| policyMicroturnSearch:chooseNScoreOptions | 55 | 8.34 |
| policyInnerPreview:summarizeUsage | 55 | 1.54 |

### event | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 58155 | 727.39 |
| evalQuery:applyTokenFilter | 110474 | 209.39 |
| zobrist:digestDecisionStackFrame | 1026 | 193.97 |
| zobrist:encodeDecisionStackFrame | 1026 | 116.99 |
| evalQuery:countMatchingTokens | 49013 | 49.23 |
| policyWasmRuntime:encodeBytecodeInput | 1124 | 29.37 |
| tokenStateIndex:build | 18 | 0.74 |
| evalQuery:applyTokenFilterCacheHit | 17764 | 0 |
| evalQuery:applyTokenFilterCompiled | 109718 | 0 |
| evalQuery:countMatchingTokensCacheHit | 1101739 | 0 |
| evalQuery:countMatchingTokensCompiled | 34985 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 2368255 | 0 |

### coupArvnRedeployPolice:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| policyInnerPreview:chooseOneRun | 58 | 7579.61 |
| policyMicroturnSearch:chooseOneScoreOptions | 1954 | 1537.43 |
| tokenStateIndex:refreshCachedEntries | 142412 | 1365.89 |
| evalQuery:countMatchingTokens | 160806 | 199.93 |
| zobrist:digestDecisionStackFrame | 546 | 28.76 |
| zobrist:encodeDecisionStackFrame | 550 | 25 |
| policyInnerPreview:summarizeUsage | 58 | 1.81 |
| evalQuery:applyTokenFilterCacheHit | 2998 | 0 |
| evalQuery:countMatchingTokensCacheHit | 3646550 | 0 |
| evalQuery:countMatchingTokensCompiled | 160806 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 10270634 | 0 |
| policyMicroturnSearch:chooseOneSelectableOptions | 59770 | 0 |

### train:chooseNStep:confirm | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| policyInnerPreview:chooseNStepBroadRun | 12 | 3843.72 |
| policyInnerPreview:chooseNStepDeepPass | 12 | 2423.63 |
| zobrist:digestDecisionStackFrame | 8094 | 1449.88 |
| zobrist:encodeDecisionStackFrame | 8222 | 858.82 |
| policyMicroturnSearch:chooseNScoreOptions | 334 | 59.7 |
| tokenStateIndex:refreshCachedEntries | 3781 | 59.7 |
| policyMicroturnSearch:chooseOneScoreOptions | 269 | 35.75 |
| evalQuery:countMatchingTokens | 5845 | 8.3 |
| evalQuery:applyTokenFilter | 1507 | 4.4 |
| policyInnerPreview:chooseNStepBroadSignals | 12 | 2.37 |
| policyInnerPreview:chooseNStepFinalSignals | 12 | 2.17 |
| policyMicroturnSearch:chooseNRankOptions | 334 | 0.6 |

### govern | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 1272 | 160.02 |
| zobrist:encodeDecisionStackFrame | 1272 | 104.59 |
| tokenStateIndex:refreshCachedEntries | 5895 | 90.21 |
| evalQuery:applyTokenFilter | 17879 | 38.33 |
| policyWasmRuntime:encodeBytecodeInput | 376 | 11.6 |
| evalQuery:countMatchingTokens | 7293 | 7.09 |
| evalQuery:applyTokenFilterCacheHit | 18564 | 0 |
| evalQuery:applyTokenFilterCompiled | 17772 | 0 |
| evalQuery:countMatchingTokensCacheHit | 816766 | 0 |
| evalQuery:countMatchingTokensCompiled | 5131 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1552798 | 0 |
| policyWasmRuntime:encodedInputCacheMiss | 376 | 0 |

### coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| policyInnerPreview:chooseOneRun | 84 | 1669.75 |
| policyMicroturnSearch:chooseOneScoreOptions | 816 | 226.71 |
| tokenStateIndex:refreshCachedEntries | 22140 | 190.86 |
| evalQuery:countMatchingTokens | 36818 | 30.73 |
| zobrist:digestDecisionStackFrame | 252 | 11.43 |
| zobrist:encodeDecisionStackFrame | 256 | 9.27 |
| policyInnerPreview:summarizeUsage | 84 | 1.95 |
| evalQuery:applyTokenFilterCacheHit | 1136 | 0 |
| evalQuery:countMatchingTokensCacheHit | 1088222 | 0 |
| evalQuery:countMatchingTokensCompiled | 36818 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 2310269 | 0 |
| policyMicroturnSearch:chooseOneSelectableOptions | 6660 | 0 |

### event-decision:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| policyInnerPreview:chooseNStepDeepPass | 6 | 845.97 |
| policyInnerPreview:chooseNStepBroadRun | 6 | 689.7 |
| tokenStateIndex:refreshCachedEntries | 7120 | 87.14 |
| zobrist:digestDecisionStackFrame | 1396 | 44.31 |
| zobrist:encodeDecisionStackFrame | 1528 | 31.68 |
| evalQuery:applyTokenFilter | 2580 | 8.09 |
| evalQuery:countMatchingTokens | 5723 | 6.72 |
| policyMicroturnSearch:chooseOneScoreOptions | 11 | 2.98 |
| policyInnerPreview:chooseNStepFinalSignals | 6 | 1.68 |
| policyInnerPreview:chooseNStepBroadSignals | 6 | 1.65 |
| policyMicroturnSearch:chooseNScoreOptions | 6 | 1.34 |
| policyInnerPreview:summarizeUsage | 6 | 0.09 |

### rally | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 7575 | 67.68 |
| zobrist:digestDecisionStackFrame | 242 | 18.09 |
| evalQuery:applyTokenFilter | 6170 | 16.93 |
| policyWasmRuntime:encodeBytecodeInput | 345 | 14.14 |
| zobrist:encodeDecisionStackFrame | 242 | 14.01 |
| evalQuery:countMatchingTokens | 9881 | 10.02 |
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
| coupArvnRedeployPolice:chooseOne | continuedDeepening | continued-deepening-orchestration-inclusive | 116 | 7581.42 | 99.2869% |
| coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | continued-deepening-orchestration-inclusive | 168 | 1671.7 | 97.9986% |
| coupArvnRedeployPolice:chooseOne | continuedDeepening | existing-hot-path-bucket-nested | 14385302 | 1619.58 | 21.2102% |
| coupArvnRedeployPolice:chooseOne | continuedDeepening | policy-search-candidate-scoring-nested | 61724 | 1537.43 | 20.1343% |
| coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | existing-hot-path-bucket-nested | 3495911 | 242.29 | 14.2036% |
| coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | policy-search-candidate-scoring-nested | 7476 | 226.71 | 13.2902% |
| coupArvnRedeployPolice:chooseOne | continuedDeepening | unattributed-after-top-level-orchestration |  | 54.45 | 0.7131% |
| coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | unattributed-after-top-level-orchestration |  | 34.14 | 2.0014% |

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
