# FITL ARVN 15-Seed Per-Microturn-Class Decomposition

**Status**: ✅ EXPLOITED — archived 2026-05-19.

**Date**: 2026-05-17-spec-178-phase-0-inner-preview-subroutine-split
**Status**: FITL ARVN measurement witness.
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005,1011,1008,1013,1009 --timeout-ms 600000 --date 2026-05-17-spec-178-phase-0-inner-preview-subroutine-split --profile-buckets`
**CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-17-spec-178-phase-0-inner-preview-subroutine-split.csv`

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
| 1005 | OK | terminal | 44861.03 | 398 | 112.7162 |  |
| 1011 | OK | terminal | 7643.92 | 206 | 37.1064 |  |
| 1008 | OK | terminal | 20589.01 | 346 | 59.5058 |  |
| 1013 | OK | terminal | 8011.45 | 258 | 31.0521 |  |
| 1009 | OK | terminal | 12663.82 | 292 | 43.3692 |  |

## Per-Microturn-Class Rollup

| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | Cache hits | Cache misses | Cache compile ms | WASM preview-drive routes | WASM preview-drive unsupported | WASM preview-drive unsupported reasons | WASM preview-drive batches | WASM timing calls | Marshaling ms | Execution ms | Deserialization ms | Bytes serialized | Cache write ms | Cache write bytes | Cache write count | Token index builds | Static rebuilds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| govern:chooseNStep:confirm | 44 | 16744.67 | 380.5608 | 388.0577 | 10137.1646 | 6.3864 | 0 | 877 | 397 | 0 | 0 | 0 | 0 | 0 | 0 | 182 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state/expected-terminal-boundary/seat-or-turn-boundary:182 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| train:chooseNStep:add | 14 | 13394.48 | 956.7488 | 3424.9896 | 3424.9896 | 17.5 | 0 | 3443 | 6438 | 0 | 0 | 0 | 0 | 0 | 180 | 5 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state/expected-terminal-boundary/seat-or-turn-boundary:5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| govern:chooseNStep:add | 55 | 12326.3 | 224.1145 | 324.9458 | 4042.8857 | 5.7818 | 0 | 1425 | 2217 | 0 | 0 | 0 | 0 | 0 | 261 | 35 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state/expected-terminal-boundary/seat-or-turn-boundary:35 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event | 109 | 8602.34 | 78.9205 | 181.2308 | 3302.5662 | 21.3119 | 109 | 0 | 0 | 109 | 78 | 0 | 0 | 0 | 0 | 122 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:122 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 18 | 119 |
| coupArvnRedeployPolice:chooseOne | 58 | 7634.2 | 131.6242 | 333.171 | 336.2273 | 30.5862 | 0 | 57816 | 1954 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| train:chooseNStep:confirm | 22 | 6476.1 | 294.3682 | 2893.3244 | 3212.7916 | 4.5 | 0 | 1747 | 3733 | 0 | 0 | 0 | 0 | 0 | 58 | 5 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state/expected-terminal-boundary/seat-or-turn-boundary:5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| govern | 47 | 3125.74 | 66.5052 | 79.1487 | 605.3891 | 11.1064 | 45 | 0 | 2 | 45 | 32 | 0 | 0 | 0 | 16 | 94 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:50; unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:44 | 66 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 45 |
| coupArvnRedeployOptionalTroops:chooseOne | 84 | 1796.69 | 21.3892 | 36.2731 | 47.0061 | 8.2857 | 0 | 5844 | 816 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseNStep:add | 48 | 1696.1 | 35.3354 | 289.1104 | 461.7081 | 9.6458 | 0 | 164 | 706 | 0 | 0 | 0 | 0 | 0 | 39 | 14 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state/expected-terminal-boundary/seat-or-turn-boundary:14 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally | 67 | 1380.12 | 20.5988 | 44.3733 | 49.1507 | 17.194 | 57 | 0 | 10 | 57 | 35 | 0 | 0 | 0 | 195 | 78 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:68; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:10 | 205 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 57 |
| coupArvnRedeployOptionalTroops | 32 | 1371.44 | 42.8575 | 50.5152 | 52.2167 | 17.125 | 25 | 0 | 7 | 25 | 0 | 0 | 0 | 0 | 14 | 64 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:64 | 78 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 25 |
| coupArvnRedeployPolice | 27 | 858.46 | 31.7947 | 36.4703 | 36.8016 | 11.8889 | 27 | 0 | 0 | 27 | 0 | 0 | 0 | 0 | 0 | 54 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:54 | 54 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 27 |
| coupArvnRedeployMandatory:chooseOne | 12 | 316.51 | 26.3757 | 34.5387 | 34.5387 | 8 | 0 | 1428 | 204 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupRedeployPass | 32 | 287.51 | 8.9846 | 27.715 | 28.7035 | 3.0625 | 15 | 0 | 17 | 15 | 13 | 0 | 0 | 0 | 32 | 16 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:16 | 48 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 15 |
| transport:chooseOne | 8 | 281.93 | 35.2413 | 54.6863 | 54.6863 | 12.25 | 0 | 290 | 18 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| train | 8 | 250.32 | 31.2902 | 56.1623 | 56.1623 | 5.75 | 8 | 0 | 0 | 8 | 10 | 0 | 0 | 0 | 28 | 8 | agent-guided-completion/production-preview-drive.chooseN/only origin-seat greedy chooseN publication is supported:4; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:4 | 36 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 8 |
| coupPacifyUS | 25 | 214.28 | 8.5712 | 13.0465 | 14.4594 | 2.8 | 25 | 0 | 0 | 25 | 0 | 0 | 0 | 0 | 35 | 15 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:15 | 50 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 25 |
| govern:chooseOne | 58 | 206.48 | 3.56 | 4.9509 | 5.8807 | 2 | 0 | 80 | 80 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| transport | 4 | 203.28 | 50.8202 | 56.8898 | 56.8898 | 11.5 | 4 | 0 | 0 | 4 | 0 | 0 | 0 | 0 | 0 | 8 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:4; unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:4 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 4 |
| coupAgitateVC | 22 | 178.61 | 8.1185 | 11.9169 | 12.7028 | 2.7273 | 17 | 0 | 5 | 17 | 4 | 0 | 0 | 0 | 64 | 24 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:24 | 88 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 17 |
| infiltrate | 16 | 156.88 | 9.8052 | 13.7864 | 13.7864 | 53.4375 | 12 | 0 | 4 | 12 | 2 | 0 | 0 | 0 | 55 | 0 |  | 55 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 12 |
| advise | 13 | 127.38 | 9.7985 | 15.0795 | 15.0795 | 11.6923 | 10 | 0 | 3 | 10 | 3 | 0 | 0 | 0 | 52 | 0 |  | 52 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 10 |
| coupCommitmentPass | 32 | 104.57 | 3.2679 | 5.4547 | 5.5893 | 1.1563 | 3 | 0 | 29 | 3 | 0 | 0 | 0 | 0 | 53 | 0 |  | 53 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 3 |
| coupNvaRedeployTroops | 11 | 102.36 | 9.3054 | 17.6709 | 17.6709 | 3.6364 | 7 | 0 | 4 | 7 | 0 | 0 | 0 | 0 | 8 | 7 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:7 | 15 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 7 |
| coupPacifyARVN | 11 | 101.57 | 9.2335 | 12.7888 | 12.7888 | 3.8182 | 5 | 0 | 6 | 5 | 8 | 0 | 0 | 0 | 24 | 10 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:10 | 34 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5 |
| ambushVc | 7 | 93.37 | 13.3385 | 22.6657 | 22.6657 | 6.8571 | 7 | 0 | 0 | 7 | 0 | 0 | 0 | 0 | 30 | 6 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:6 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 7 |
| coupArvnRedeployMandatory | 2 | 91.38 | 45.6918 | 47.647 | 47.647 | 11.5 | 1 | 0 | 1 | 1 | 0 | 0 | 0 | 0 | 2 | 4 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:4 | 6 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| march | 15 | 87.66 | 5.8437 | 11.6732 | 11.6732 | 4.6 | 10 | 0 | 5 | 10 | 13 | 0 | 0 | 0 | 39 | 0 |  | 39 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 10 |
| assault | 8 | 73.21 | 9.1514 | 13.1189 | 13.1189 | 4.875 | 8 | 0 | 0 | 8 | 1 | 0 | 0 | 0 | 31 | 0 |  | 31 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 8 |
| coupPacifyPass | 16 | 65.2 | 4.075 | 6.6009 | 6.6009 | 1.0625 | 14 | 0 | 2 | 14 | 0 | 0 | 0 | 0 | 26 | 0 |  | 26 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 14 |
| train:chooseOne | 12 | 61.9 | 5.1579 | 7.9145 | 7.9145 | 2.25 | 0 | 28 | 39 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| attack | 4 | 44.62 | 11.1561 | 14.1795 | 14.1795 | 54.5 | 4 | 0 | 0 | 4 | 0 | 0 | 0 | 0 | 16 | 0 |  | 16 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 4 |
| coupResourcesResolve | 8 | 30.86 | 3.8573 | 5.5537 | 5.5537 | 1 | 1 | 0 | 7 | 1 | 0 | 0 | 0 | 0 | 8 | 0 |  | 8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| coupVictoryCheck | 8 | 30.85 | 3.8559 | 5.0922 | 5.0922 | 1 | 8 | 0 | 0 | 8 | 1 | 0 | 0 | 0 | 8 | 0 |  | 8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 8 |
| coupAgitatePass | 8 | 26.15 | 3.2691 | 3.8721 | 3.8721 | 1.125 | 5 | 0 | 3 | 5 | 0 | 0 | 0 | 0 | 18 | 0 |  | 18 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5 |
| coupCommitmentResolve | 3 | 13.2 | 4.4002 | 5.0333 | 5.0333 | 2 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 6 | 0 |  | 6 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| chooseOne:chooseOne | 13 | 10.8 | 0.8306 | 9.1063 | 9.1063 | 5.9231 | 0 | 4 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseNStep:add | 68 | 4.61 | 0.0679 | 0.0903 | 0.6497 | 20.9706 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseOne | 12 | 3.91 | 0.3262 | 3.5238 | 3.5238 | 2.9167 | 0 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| pass | 1 | 3.3 | 3.2997 | 3.2997 | 3.2997 | 1 | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 1 | 0 |  | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| rally:chooseNStep:confirm | 77 | 2.63 | 0.0342 | 0.0562 | 0.1306 | 17.6753 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseOne | 70 | 2.22 | 0.0318 | 0.0601 | 0.1253 | 1.3571 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseOne | 27 | 1.91 | 0.0706 | 0.1242 | 0.8836 | 2.4444 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseNStep:confirm | 47 | 1.83 | 0.0388 | 0.0992 | 0.1797 | 5.7234 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:add | 13 | 1.51 | 0.1163 | 0.7357 | 0.7357 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupNvaRedeployTroops:chooseOne | 25 | 1.25 | 0.0498 | 0.0692 | 0.2559 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:confirm | 35 | 1.24 | 0.0354 | 0.0535 | 0.0603 | 4.8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:add | 21 | 1.23 | 0.0588 | 0.0768 | 0.0848 | 12.7143 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:add | 16 | 0.75 | 0.0467 | 0.0556 | 0.0556 | 3.75 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseOne | 23 | 0.74 | 0.0322 | 0.0466 | 0.0622 | 1.6957 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:confirm | 26 | 0.71 | 0.0272 | 0.0387 | 0.0453 | 4.5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:confirm | 16 | 0.55 | 0.0342 | 0.0868 | 0.0868 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:confirm | 13 | 0.54 | 0.0418 | 0.0763 | 0.0763 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:add | 8 | 0.52 | 0.0655 | 0.1482 | 0.1482 | 2.75 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupCommitmentResolve:chooseNStep:confirm | 12 | 0.37 | 0.0312 | 0.0599 | 0.0599 | 9.25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:add | 7 | 0.31 | 0.045 | 0.059 | 0.059 | 3.5714 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| chooseNStep:chooseNStep:confirm | 6 | 0.24 | 0.0398 | 0.0532 | 0.0532 | 19.6667 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:confirm | 7 | 0.17 | 0.0237 | 0.0247 | 0.0247 | 4.5714 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseOne | 7 | 0.13 | 0.0191 | 0.0228 | 0.0228 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Top Hot Axes In Slow-Tier Seeds

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.

| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms | Cache hits | Cache misses | Cache compile ms |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | govern:chooseNStep:confirm | continuedDeepening | 33 | 16743.45 | 507.3771 | 514.2473 | 10137.1646 | 0 | 0 | 0 |
| 2 | train:chooseNStep:add | continuedDeepening | 14 | 13394.48 | 956.7488 | 3424.9896 | 3424.9896 | 0 | 0 | 0 |
| 3 | govern:chooseNStep:add | continuedDeepening | 55 | 12326.3 | 224.1145 | 324.9458 | 4042.8857 | 0 | 0 | 0 |
| 4 | event | singlePass | 109 | 8602.34 | 78.9205 | 181.2308 | 3302.5662 | 0 | 0 | 0 |
| 5 | coupArvnRedeployPolice:chooseOne | continuedDeepening | 58 | 7634.2 | 131.6242 | 333.171 | 336.2273 | 0 | 0 | 0 |
| 6 | train:chooseNStep:confirm | continuedDeepening | 12 | 6475.01 | 539.5842 | 3212.7916 | 3212.7916 | 0 | 0 | 0 |
| 7 | govern | singlePass | 47 | 3125.74 | 66.5052 | 79.1487 | 605.3891 | 0 | 0 | 0 |
| 8 | coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | 84 | 1796.69 | 21.3892 | 36.2731 | 47.0061 | 0 | 0 | 0 |
| 9 | event-decision:chooseNStep:add | continuedDeepening | 6 | 1693.9 | 282.316 | 461.7081 | 461.7081 | 0 | 0 | 0 |
| 10 | rally | singlePass | 67 | 1380.12 | 20.5988 | 44.3733 | 49.1507 | 0 | 0 | 0 |

## Hot-Path Buckets For Top Slow Axes

Captured only when `--profile-buckets` is enabled. Buckets are timing/count diagnostics inside `PolicyAgent.chooseDecision`; they are not correctness assertions.

### govern:chooseNStep:confirm | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| policyInnerPreview:chooseNStepDeepPass | 33 | 10426.3 |
| policyInnerPreview:chooseNStepBroadRun | 33 | 6289.15 |
| tokenStateIndex:refreshCachedEntries | 58404 | 772.69 |
| evalQuery:applyTokenFilter | 275379 | 397.21 |
| policyMicroturnSearch:chooseOneScoreOptions | 364 | 77.98 |
| zobrist:encodeDecisionStackFrame | 1456 | 60.7 |
| zobrist:digestDecisionStackFrame | 894 | 46.96 |
| evalQuery:countMatchingTokens | 37786 | 41.09 |
| policyInnerPreview:chooseNStepBroadSignals | 33 | 10.4 |
| policyInnerPreview:chooseNStepFinalSignals | 33 | 7.36 |
| policyMicroturnSearch:chooseNScoreOptions | 33 | 5.54 |
| policyInnerPreview:summarizeUsage | 33 | 0.58 |

### train:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| policyInnerPreview:chooseNStepBroadRun | 14 | 8212.5 |
| policyInnerPreview:chooseNStepDeepPass | 14 | 5157.63 |
| zobrist:digestDecisionStackFrame | 14430 | 2504.13 |
| zobrist:encodeDecisionStackFrame | 14556 | 1573.28 |
| tokenStateIndex:refreshCachedEntries | 15073 | 238.65 |
| policyMicroturnSearch:chooseNScoreOptions | 703 | 135.33 |
| policyMicroturnSearch:chooseOneScoreOptions | 487 | 89.71 |
| evalQuery:countMatchingTokens | 51110 | 70.13 |
| evalQuery:applyTokenFilter | 12738 | 35.07 |
| policyInnerPreview:chooseNStepBroadSignals | 14 | 8.28 |
| policyInnerPreview:chooseNStepFinalSignals | 14 | 6.42 |
| policyMicroturnSearch:chooseNRankOptions | 703 | 1.25 |

### govern:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| policyInnerPreview:chooseNStepDeepPass | 55 | 9693.35 |
| policyInnerPreview:chooseNStepBroadRun | 55 | 2586.06 |
| tokenStateIndex:refreshCachedEntries | 35197 | 430 |
| zobrist:digestDecisionStackFrame | 5372 | 252.7 |
| zobrist:encodeDecisionStackFrame | 5508 | 209.06 |
| evalQuery:applyTokenFilter | 117692 | 177 |
| policyMicroturnSearch:chooseOneScoreOptions | 592 | 93.24 |
| evalQuery:countMatchingTokens | 27021 | 32.29 |
| policyInnerPreview:chooseNStepBroadSignals | 55 | 13.07 |
| policyInnerPreview:chooseNStepFinalSignals | 55 | 12.74 |
| policyMicroturnSearch:chooseNScoreOptions | 55 | 8.57 |
| policyInnerPreview:summarizeUsage | 55 | 1.66 |

### event | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 58155 | 729.95 |
| evalQuery:applyTokenFilter | 110474 | 225.72 |
| zobrist:digestDecisionStackFrame | 1026 | 195.19 |
| zobrist:encodeDecisionStackFrame | 1026 | 121.93 |
| evalQuery:countMatchingTokens | 49013 | 50.64 |
| policyWasmRuntime:encodeBytecodeInput | 1124 | 31.29 |
| tokenStateIndex:build | 18 | 0.73 |
| evalQuery:applyTokenFilterCacheHit | 17764 | 0 |
| evalQuery:applyTokenFilterCompiled | 109718 | 0 |
| evalQuery:countMatchingTokensCacheHit | 1101739 | 0 |
| evalQuery:countMatchingTokensCompiled | 34985 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 2368255 | 0 |

### coupArvnRedeployPolice:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| policyInnerPreview:chooseOneRun | 58 | 7576.62 |
| policyInnerPreviewSubroutine:driveOption | 1774 | 6804.08 |
| policyMicroturnSearch:chooseOneScoreOptions | 1954 | 1521.7 |
| tokenStateIndex:refreshCachedEntries | 142412 | 1360.81 |
| policyInnerPreviewSubroutine:resolveRefs | 1774 | 762.97 |
| evalQuery:countMatchingTokens | 160806 | 190.55 |
| zobrist:digestDecisionStackFrame | 546 | 28.71 |
| zobrist:encodeDecisionStackFrame | 550 | 26.36 |
| policyInnerPreview:summarizeUsage | 58 | 1.81 |
| policyInnerPreviewSubroutine:surfaceSetup | 58 | 1.06 |
| evalQuery:applyTokenFilterCacheHit | 2998 | 0 |
| evalQuery:countMatchingTokensCacheHit | 3646550 | 0 |

### train:chooseNStep:confirm | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| policyInnerPreview:chooseNStepBroadRun | 12 | 3953.02 |
| policyInnerPreview:chooseNStepDeepPass | 12 | 2514.39 |
| zobrist:digestDecisionStackFrame | 8094 | 1460.41 |
| zobrist:encodeDecisionStackFrame | 8222 | 899.99 |
| policyMicroturnSearch:chooseNScoreOptions | 334 | 73.99 |
| tokenStateIndex:refreshCachedEntries | 3781 | 60.47 |
| policyMicroturnSearch:chooseOneScoreOptions | 269 | 33.22 |
| evalQuery:countMatchingTokens | 5845 | 7.49 |
| evalQuery:applyTokenFilter | 1507 | 4.61 |
| policyInnerPreview:chooseNStepBroadSignals | 12 | 2.36 |
| policyInnerPreview:chooseNStepFinalSignals | 12 | 2.3 |
| policyMicroturnSearch:chooseNRankOptions | 334 | 0.7 |

### govern | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 1272 | 161.89 |
| zobrist:encodeDecisionStackFrame | 1272 | 107.86 |
| tokenStateIndex:refreshCachedEntries | 5895 | 89.47 |
| evalQuery:applyTokenFilter | 17879 | 36.3 |
| policyWasmRuntime:encodeBytecodeInput | 376 | 12.46 |
| evalQuery:countMatchingTokens | 7293 | 8.38 |
| evalQuery:applyTokenFilterCacheHit | 18564 | 0 |
| evalQuery:applyTokenFilterCompiled | 17772 | 0 |
| evalQuery:countMatchingTokensCacheHit | 816766 | 0 |
| evalQuery:countMatchingTokensCompiled | 5131 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1552798 | 0 |
| policyWasmRuntime:encodedInputCacheMiss | 376 | 0 |

### coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| policyInnerPreview:chooseOneRun | 84 | 1757.94 |
| policyInnerPreviewSubroutine:driveOption | 696 | 1453.32 |
| policyInnerPreviewSubroutine:resolveRefs | 696 | 298.53 |
| policyMicroturnSearch:chooseOneScoreOptions | 816 | 239.98 |
| tokenStateIndex:refreshCachedEntries | 22140 | 203.15 |
| evalQuery:countMatchingTokens | 36818 | 34.5 |
| zobrist:digestDecisionStackFrame | 252 | 11.46 |
| zobrist:encodeDecisionStackFrame | 256 | 9.63 |
| policyInnerPreview:summarizeUsage | 84 | 2.25 |
| policyInnerPreviewSubroutine:surfaceSetup | 84 | 1.59 |
| evalQuery:applyTokenFilterCacheHit | 1136 | 0 |
| evalQuery:countMatchingTokensCacheHit | 1088222 | 0 |

### event-decision:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| policyInnerPreview:chooseNStepDeepPass | 6 | 922.38 |
| policyInnerPreview:chooseNStepBroadRun | 6 | 763.29 |
| tokenStateIndex:refreshCachedEntries | 7120 | 97.44 |
| zobrist:digestDecisionStackFrame | 1396 | 46.11 |
| zobrist:encodeDecisionStackFrame | 1528 | 35.94 |
| evalQuery:applyTokenFilter | 2580 | 9.09 |
| evalQuery:countMatchingTokens | 5723 | 5.91 |
| policyMicroturnSearch:chooseOneScoreOptions | 11 | 2.85 |
| policyInnerPreview:chooseNStepBroadSignals | 6 | 2.74 |
| policyInnerPreview:chooseNStepFinalSignals | 6 | 2.46 |
| policyMicroturnSearch:chooseNScoreOptions | 6 | 1.49 |
| policyInnerPreview:summarizeUsage | 6 | 0.1 |

### rally | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 7575 | 72.21 |
| zobrist:digestDecisionStackFrame | 242 | 18.14 |
| evalQuery:applyTokenFilter | 6170 | 15.31 |
| zobrist:encodeDecisionStackFrame | 242 | 14.49 |
| evalQuery:countMatchingTokens | 9881 | 12.17 |
| policyWasmRuntime:encodeBytecodeInput | 345 | 11.58 |
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
| coupArvnRedeployPolice:chooseOne | continuedDeepening | continued-deepening-orchestration-inclusive | 116 | 7578.43 | 99.2695% |
| coupArvnRedeployPolice:chooseOne | continuedDeepening | inner-preview-subroutine-nested | 3606 | 7568.11 | 99.1343% |
| coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | continued-deepening-orchestration-inclusive | 168 | 1760.19 | 97.9685% |
| coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | inner-preview-subroutine-nested | 1476 | 1753.44 | 97.5928% |
| coupArvnRedeployPolice:chooseOne | continuedDeepening | existing-hot-path-bucket-nested | 3953862 | 1606.43 | 21.0425% |
| coupArvnRedeployPolice:chooseOne | continuedDeepening | policy-search-candidate-scoring-nested | 1954 | 1521.7 | 19.9327% |
| coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | existing-hot-path-bucket-nested | 1148824 | 258.74 | 14.4009% |
| coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | policy-search-candidate-scoring-nested | 816 | 239.98 | 13.3568% |
| coupArvnRedeployPolice:chooseOne | continuedDeepening | unattributed-after-top-level-orchestration |  | 55.77 | 0.7305% |
| coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | unattributed-after-top-level-orchestration |  | 36.5 | 2.0315% |

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
