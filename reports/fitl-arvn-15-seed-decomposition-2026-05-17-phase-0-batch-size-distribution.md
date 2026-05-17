# FITL ARVN 15-Seed Per-Microturn-Class Decomposition

**Date**: 2026-05-17-phase-0-batch-size-distribution
**Status**: Spec 173 measurement witness.
**Command**: `POLICY_WASM_TIMING_PROFILE=1 node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 600000 --date 2026-05-17-phase-0-batch-size-distribution`
**CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-0-batch-size-distribution.csv`

## Summary

- Seeds completed: 15/15
- Per-decision rows: 3769
- Hot class with slow:fast ratio >3x: no
- Per-seed timeout: 600000 ms
- Hot-path buckets: disabled
- WASM mode: enabled
- WASM timing profile: enabled
- WASM production preview-drive route count: 3125
- WASM production preview-drive unsupported count: 1998
- WASM production preview-drive batch count: 2648
- WASM timing call count: 18048
- WASM serialized input bytes: 407142300
- Bytecode input cache write bytes: 0

## Per-Seed Wall Time

| Seed | Status | Stop Reason | Wall ms | Decisions | ms/decision | Error |
|---:|---|---|---:|---:|---:|---|
| 1000 | OK | terminal | 5443.56 | 159 | 34.2362 |  |
| 1001 | OK | terminal | 7037.53 | 193 | 36.4639 |  |
| 1002 | OK | terminal | 4614.5 | 148 | 31.1791 |  |
| 1003 | OK | terminal | 8141.15 | 226 | 36.0228 |  |
| 1004 | OK | terminal | 12780.79 | 344 | 37.1535 |  |
| 1005 | OK | terminal | 45341.86 | 398 | 113.9243 |  |
| 1006 | OK | terminal | 10681.15 | 228 | 46.8471 |  |
| 1007 | OK | terminal | 6847.3 | 218 | 31.4096 |  |
| 1008 | OK | terminal | 19659.26 | 346 | 56.8187 |  |
| 1009 | OK | terminal | 12344.39 | 292 | 42.2753 |  |
| 1010 | OK | terminal | 35933.62 | 339 | 105.9989 |  |
| 1011 | OK | terminal | 7728.8 | 206 | 37.5184 |  |
| 1012 | OK | terminal | 16123.56 | 201 | 80.2167 |  |
| 1013 | OK | terminal | 7559.41 | 258 | 29.3 |  |
| 1014 | OK | terminal | 18849.66 | 213 | 88.4961 |  |

## Per-Microturn-Class Rollup

| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | Cache hits | Cache misses | Cache compile ms | WASM preview-drive routes | WASM preview-drive unsupported | WASM preview-drive unsupported reasons | WASM preview-drive batches | WASM timing calls | Marshaling ms | Execution ms | Deserialization ms | Bytes serialized | Cache write ms | Cache write bytes | Cache write count | Token index builds | Static rebuilds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| train:chooseNStep:add | 37 | 40147.71 | 1085.0732 | 3484.129 | 15387.0676 | 17.4865 | 0 | 5183 | 7420 | 0 | 0 | 0 | 0 | 0 | 359 | 13 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:13 | 0 | 1044 | 40.2536 | 4.2802 | 17.0079 | 141984 | 0 | 0 | 0 | 0 | 0 |
| govern:chooseNStep:confirm | 115 | 32367.52 | 281.4567 | 523.1147 | 10196.7439 | 6.6957 | 0 | 2505 | 1135 | 0 | 0 | 0 | 0 | 0 | 0 | 520 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:520 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| govern:chooseNStep:add | 135 | 26018.15 | 192.7271 | 315.079 | 3912.9017 | 6.0815 | 0 | 3770 | 5825 | 0 | 0 | 0 | 0 | 0 | 708 | 73 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:73 | 0 | 2124 | 95.0654 | 10.018 | 37.3708 | 288864 | 0 | 0 | 0 | 0 | 0 |
| event | 248 | 22171.91 | 89.4028 | 95.7027 | 4825.1188 | 19.121 | 248 | 0 | 0 | 248 | 234 | 2328 | 234 | 11.1048 | 0 | 276 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:276 | 0 | 2562 | 220.9836 | 102.6372 | 4.0224 | 85327848 | 0 | 0 | 0 | 38 | 278 |
| coupArvnRedeployPolice:chooseOne | 153 | 15033.38 | 98.2574 | 302.5189 | 330.6634 | 30.3922 | 0 | 105697 | 3591 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| train:chooseNStep:confirm | 59 | 10155.88 | 172.1336 | 1765.9249 | 3233.1675 | 3.0508 | 0 | 1810 | 3782 | 0 | 0 | 0 | 0 | 0 | 72 | 12 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:12 | 0 | 624 | 19.8011 | 2.7414 | 9.3197 | 84864 | 0 | 0 | 0 | 0 | 0 |
| govern | 118 | 6949.9 | 58.8975 | 82.1992 | 605.9883 | 10.7797 | 111 | 0 | 7 | 111 | 96 | 848 | 96 | 3.4392 | 42 | 236 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:132; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:104 | 146 | 986 | 79.9776 | 35.9126 | 7.0438 | 31246976 | 0 | 0 | 0 | 0 | 111 |
| coupArvnRedeployOptionalTroops:chooseOne | 215 | 4140.9 | 19.26 | 34.2885 | 43.8233 | 8.3907 | 0 | 13517 | 1865 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally | 165 | 3619.5 | 21.9364 | 45.2402 | 145.2569 | 15.0667 | 146 | 0 | 19 | 146 | 100 | 731 | 100 | 3.7811 | 381 | 215 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:198; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:17 | 398 | 1212 | 119.6817 | 34.1655 | 25.9213 | 27993848 | 0 | 0 | 0 | 0 | 146 |
| coupArvnRedeployOptionalTroops | 88 | 3565.89 | 40.5215 | 49.23 | 56.1575 | 17.2159 | 71 | 0 | 17 | 71 | 0 | 704 | 0 | 0 | 36 | 176 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:176 | 212 | 740 | 76.4072 | 26.5587 | 4.287 | 23542464 | 0 | 0 | 0 | 0 | 71 |
| coupArvnRedeployPolice | 86 | 2650.18 | 30.816 | 37.7567 | 42.3004 | 11.6744 | 85 | 0 | 1 | 85 | 0 | 688 | 0 | 0 | 20 | 172 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:172 | 192 | 708 | 53.8655 | 24.1706 | 2.8752 | 22789416 | 0 | 0 | 0 | 0 | 85 |
| event-decision:chooseNStep:add | 96 | 2326.14 | 24.2306 | 242.4223 | 384.0075 | 11.4479 | 0 | 250 | 1045 | 0 | 0 | 0 | 0 | 0 | 63 | 14 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:14 | 0 | 69 | 3.5009 | 0.3876 | 1.4005 | 9384 | 0 | 0 | 0 | 0 | 0 |
| transport:chooseOne | 14 | 725.91 | 51.8508 | 105.4764 | 105.4764 | 16.7143 | 0 | 952 | 37 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupRedeployPass | 80 | 701.92 | 8.774 | 27.8203 | 32.7536 | 2.95 | 32 | 0 | 48 | 32 | 15 | 745 | 15 | 0.445 | 82 | 40 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:40 | 122 | 842 | 51.7299 | 25.6348 | 7.5704 | 24839640 | 0 | 0 | 0 | 0 | 32 |
| train | 23 | 653.47 | 28.4119 | 58.4062 | 66.3747 | 5.4348 | 23 | 0 | 0 | 23 | 12 | 198 | 12 | 0.5957 | 108 | 20 | agent-guided-completion/production-preview-drive.chooseN/only origin-seat greedy chooseN publication is supported:12; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:4; unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:4 | 124 | 318 | 24.4033 | 7.757 | 6.4269 | 6992108 | 0 | 0 | 0 | 0 | 23 |
| coupPacifyUS | 76 | 644.97 | 8.4865 | 13.3517 | 16.5188 | 2.8158 | 76 | 0 | 0 | 76 | 0 | 790 | 0 | 0 | 106 | 46 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:46 | 152 | 896 | 60.2349 | 27.0959 | 8.7207 | 25835728 | 0 | 0 | 0 | 0 | 76 |
| patrol | 1 | 602.82 | 602.8221 | 602.8221 | 602.8221 | 4 | 1 | 0 | 0 | 1 | 0 | 10 | 0 | 0 | 0 | 1 | agent-guided-completion/production-preview-drive.chooseN/only origin-seat greedy chooseN publication is supported:1 | 1 | 10 | 0.4477 | 0.3174 | 0.0039 | 325672 | 0 | 0 | 0 | 0 | 1 |
| coupAgitateVC | 69 | 596.41 | 8.6436 | 12.1919 | 13.5278 | 2.971 | 52 | 0 | 17 | 52 | 12 | 310 | 12 | 0.6055 | 184 | 92 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:92 | 276 | 506 | 43.8973 | 12.0526 | 13.5291 | 10689304 | 0 | 0 | 0 | 0 | 52 |
| advise | 43 | 514.33 | 11.9611 | 39.5013 | 44.7136 | 11.4186 | 32 | 0 | 11 | 32 | 8 | 461 | 8 | 0.638 | 164 | 4 | agent-guided-completion/production-preview-drive.chooseN/only origin-seat greedy chooseN publication is supported:3; unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:1 | 167 | 633 | 52.0017 | 19.2441 | 11.9075 | 15604616 | 0 | 0 | 0 | 0 | 32 |
| govern:chooseOne | 138 | 477.08 | 3.4571 | 4.666 | 8.5199 | 2 | 0 | 178 | 178 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate | 37 | 375.58 | 10.1509 | 13.6943 | 18.5471 | 48.4324 | 30 | 0 | 7 | 30 | 16 | 465 | 16 | 0.5514 | 136 | 0 |  | 136 | 617 | 60.0509 | 18.9723 | 10.033 | 16659108 | 0 | 0 | 0 | 0 | 30 |
| transport | 7 | 335.79 | 47.9699 | 56.4987 | 56.4987 | 11.7143 | 7 | 0 | 0 | 7 | 0 | 56 | 0 | 0 | 0 | 14 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:10; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:4 | 4 | 56 | 3.5298 | 2.0897 | 0.0903 | 1854252 | 0 | 0 | 0 | 0 | 7 |
| coupArvnRedeployMandatory:chooseOne | 13 | 309.65 | 23.8193 | 32.7849 | 32.7849 | 8 | 0 | 1435 | 205 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupPacifyARVN | 31 | 282.03 | 9.0978 | 12.8144 | 13.7293 | 3.7742 | 14 | 0 | 17 | 14 | 30 | 250 | 30 | 1.5066 | 66 | 30 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:28; unsupported-effect/production-preview-drive.effect.popInterruptPhase/unsupported production preview-drive effect popInterruptPhase:2 | 96 | 346 | 24.4157 | 9.7188 | 5.1356 | 9221372 | 0 | 0 | 0 | 0 | 14 |
| coupCommitmentPass | 80 | 272.44 | 3.4055 | 4.8158 | 9.9272 | 1.1375 | 9 | 0 | 71 | 9 | 2 | 798 | 2 | 0.1355 | 131 | 0 |  | 131 | 931 | 61.4529 | 26.9404 | 9.278 | 26127356 | 0 | 0 | 0 | 0 | 9 |
| march | 40 | 257.58 | 6.4396 | 12.4552 | 13.5147 | 8.9 | 30 | 0 | 10 | 30 | 66 | 405 | 66 | 1.8057 | 107 | 0 |  | 107 | 578 | 45.7138 | 16.9173 | 7.6758 | 15575624 | 0 | 0 | 0 | 0 | 30 |
| ambushVc | 12 | 177.41 | 14.7842 | 26.8552 | 26.8552 | 8.1667 | 11 | 0 | 1 | 11 | 0 | 58 | 0 | 0 | 38 | 14 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:14 | 38 | 96 | 9.0738 | 2.4697 | 2.0539 | 1945968 | 0 | 0 | 0 | 0 | 11 |
| assault | 21 | 175.58 | 8.3611 | 10.5267 | 10.6086 | 4.8095 | 20 | 0 | 1 | 20 | 3 | 228 | 3 | 0.2214 | 80 | 0 |  | 80 | 311 | 21.1308 | 8.0663 | 5.1131 | 7620036 | 0 | 0 | 0 | 0 | 20 |
| coupPacifyPass | 40 | 175.44 | 4.386 | 5.7301 | 10.8366 | 1.15 | 37 | 0 | 3 | 37 | 2 | 416 | 2 | 0.0858 | 60 | 2 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:2 | 62 | 478 | 27.8723 | 13.9581 | 4.5983 | 13645944 | 0 | 0 | 0 | 0 | 37 |
| coupNvaRedeployTroops | 19 | 174.89 | 9.2047 | 18.5268 | 18.5268 | 3.7368 | 12 | 0 | 7 | 12 | 0 | 235 | 0 | 0 | 14 | 12 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:12 | 26 | 249 | 15.68 | 7.8063 | 1.1658 | 7670696 | 0 | 0 | 0 | 0 | 12 |
| train:chooseOne | 35 | 170.61 | 4.8746 | 7.0833 | 7.118 | 2.3143 | 0 | 66 | 99 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| attack | 14 | 169.34 | 12.0957 | 27.7692 | 27.7692 | 31.6429 | 12 | 0 | 2 | 12 | 0 | 155 | 0 | 0 | 44 | 6 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:6 | 44 | 199 | 19.6552 | 5.8036 | 2.6539 | 5301016 | 0 | 0 | 0 | 0 | 12 |
| coupArvnRedeployMandatory | 3 | 114.01 | 38.0022 | 42.2933 | 42.2933 | 11.3333 | 1 | 0 | 2 | 1 | 0 | 24 | 0 | 0 | 4 | 6 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:6 | 10 | 28 | 2.5514 | 0.8253 | 0.3005 | 798316 | 0 | 0 | 0 | 0 | 1 |
| coupAgitatePass | 20 | 73.35 | 3.6674 | 4.9329 | 5.2092 | 1.25 | 17 | 0 | 3 | 17 | 0 | 120 | 0 | 0 | 50 | 0 |  | 50 | 170 | 13.7681 | 4.142 | 3.3978 | 3952020 | 0 | 0 | 0 | 0 | 17 |
| coupResourcesResolve | 20 | 71.37 | 3.5686 | 4.5851 | 4.6196 | 1 | 3 | 0 | 17 | 3 | 0 | 220 | 0 | 0 | 20 | 0 |  | 20 | 240 | 14.5631 | 7.6583 | 1.8027 | 7164780 | 0 | 0 | 0 | 0 | 3 |
| coupVictoryCheck | 20 | 70.76 | 3.5381 | 4.528 | 5.3784 | 1 | 20 | 0 | 0 | 20 | 4 | 216 | 4 | 0.2857 | 20 | 0 |  | 20 | 240 | 13.1885 | 7.2986 | 1.7804 | 7163520 | 0 | 0 | 0 | 0 | 20 |
| coupCommitmentResolve | 9 | 39.86 | 4.4286 | 5.2077 | 5.2077 | 2 | 0 | 0 | 9 | 0 | 0 | 99 | 0 | 0 | 18 | 0 |  | 18 | 117 | 5.8384 | 3.3253 | 1.1687 | 3237396 | 0 | 0 | 0 | 0 | 0 |
| ambushNva | 5 | 33.24 | 6.6473 | 11.1127 | 11.1127 | 15.2 | 5 | 0 | 0 | 5 | 0 | 65 | 0 | 0 | 11 | 0 |  | 11 | 76 | 4.7811 | 2.2042 | 0.6556 | 2159188 | 0 | 0 | 0 | 0 | 5 |
| chooseOne:chooseOne | 31 | 24.57 | 0.7926 | 7.29 | 12.7693 | 5.2903 | 0 | 7 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| resolveHonoluluPacify | 3 | 17.29 | 5.7623 | 6.3879 | 6.3879 | 1 | 3 | 0 | 0 | 3 | 0 | 28 | 0 | 0 | 0 | 4 | unsupported-effect/production-preview-drive.effect.popInterruptPhase/unsupported production preview-drive effect popInterruptPhase:4 | 4 | 28 | 1.4818 | 0.9216 | 0.013 | 909812 | 0 | 0 | 0 | 0 | 3 |
| rally:chooseNStep:add | 168 | 12.55 | 0.0747 | 0.12 | 0.8184 | 20.75 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseNStep:confirm | 209 | 7.07 | 0.0338 | 0.0644 | 0.1386 | 14.7943 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseOne | 172 | 6.01 | 0.035 | 0.0809 | 0.3592 | 1.3547 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseOne | 34 | 5.71 | 0.168 | 0.6061 | 3.7188 | 3.6471 | 0 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:add | 43 | 4.37 | 0.1017 | 0.2438 | 0.755 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| pass | 1 | 4.17 | 4.1741 | 4.1741 | 4.1741 | 1 | 1 | 0 | 0 | 1 | 0 | 13 | 0 | 0 | 1 | 0 |  | 1 | 14 | 0.7285 | 0.4241 | 0.0935 | 423180 | 0 | 0 | 0 | 0 | 1 |
| march:chooseNStep:confirm | 91 | 3.41 | 0.0375 | 0.0713 | 0.1004 | 5.2198 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseOne | 87 | 3.28 | 0.0377 | 0.0654 | 0.1529 | 2.4368 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:add | 57 | 3.21 | 0.0563 | 0.0834 | 0.1082 | 11.614 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseNStep:confirm | 89 | 2.89 | 0.0325 | 0.0917 | 0.1587 | 6.5169 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:add | 37 | 2.24 | 0.0604 | 0.0519 | 0.6383 | 3.7027 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseOne | 57 | 1.82 | 0.032 | 0.0692 | 0.1359 | 1.614 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:confirm | 43 | 1.81 | 0.042 | 0.0725 | 0.1449 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupNvaRedeployTroops:chooseOne | 43 | 1.77 | 0.0411 | 0.0609 | 0.0814 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:confirm | 55 | 1.69 | 0.0307 | 0.0606 | 0.1624 | 4.4909 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:add | 21 | 1.15 | 0.0546 | 0.0726 | 0.1648 | 3.0952 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:confirm | 42 | 1.09 | 0.0259 | 0.043 | 0.0998 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupCommitmentResolve:chooseNStep:confirm | 36 | 1.06 | 0.0294 | 0.0548 | 0.0584 | 9.25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:add | 12 | 0.57 | 0.0474 | 0.0653 | 0.0653 | 3.4167 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| chooseNStep:chooseNStep:confirm | 10 | 0.4 | 0.0405 | 0.0542 | 0.0542 | 18.2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:confirm | 12 | 0.35 | 0.0293 | 0.0694 | 0.0694 | 4.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseOne | 12 | 0.3 | 0.0251 | 0.0519 | 0.0519 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseNStep:add | 3 | 0.14 | 0.0473 | 0.0498 | 0.0498 | 3.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseOne | 5 | 0.14 | 0.0283 | 0.0414 | 0.0414 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseOne | 4 | 0.12 | 0.0312 | 0.0361 | 0.0361 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| patrol:chooseNStep:confirm | 3 | 0.09 | 0.0303 | 0.0393 | 0.0393 | 4.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| patrol:chooseNStep:add | 1 | 0.08 | 0.0809 | 0.0809 | 0.0809 | 17 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseNStep:confirm | 3 | 0.07 | 0.0233 | 0.0257 | 0.0257 | 3.6667 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Top Hot Axes In Slow-Tier Seeds

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.

| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms | Cache hits | Cache misses | Cache compile ms |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | govern:chooseNStep:confirm | continuedDeepening | 33 | 16758.16 | 507.8231 | 561.0527 | 10196.7439 | 0 | 0 | 0 |
| 2 | train:chooseNStep:add | continuedDeepening | 14 | 13686.78 | 977.627 | 3484.129 | 3484.129 | 0 | 0 | 0 |
| 3 | govern:chooseNStep:add | continuedDeepening | 55 | 11930.12 | 216.9112 | 315.5813 | 3912.9017 | 0 | 0 | 0 |
| 4 | event | singlePass | 109 | 8344.82 | 76.558 | 163.2787 | 3076.0746 | 1046 | 78 | 3.3333 |
| 5 | coupArvnRedeployPolice:chooseOne | continuedDeepening | 58 | 7625.11 | 131.4674 | 322.7307 | 330.6634 | 0 | 0 | 0 |
| 6 | train:chooseNStep:confirm | continuedDeepening | 12 | 6644.39 | 553.6991 | 3233.1675 | 3233.1675 | 0 | 0 | 0 |
| 7 | govern | singlePass | 47 | 3096.66 | 65.8864 | 83.4098 | 605.9883 | 344 | 32 | 1.2335 |
| 8 | coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | 84 | 1698.58 | 20.2212 | 33.913 | 39.4371 | 0 | 0 | 0 |
| 9 | event-decision:chooseNStep:add | continuedDeepening | 6 | 1545.44 | 257.5727 | 384.0075 | 384.0075 | 0 | 0 | 0 |
| 10 | rally | singlePass | 67 | 1369.63 | 20.4422 | 45.2402 | 48.9777 | 310 | 35 | 1.1751 |

## WASM Timing Buckets

| Microturn class | Route class | Calls | Marshaling ms | Execution ms | Deserialization ms | Batch size mean | Batch size min | Batch size max | Batch size histogram |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| event | scoreRows | 2562 | 220.9836 | 102.6372 | 4.0224 | 19.3419 | 1 | 83 | {"9-16":840,"17-32":848,"5-8":514,"33+":360} |
| govern:chooseNStep:add | productionPreviewDrive | 2124 | 95.0654 | 10.018 | 37.3708 | 1 | 1 | 2 | {"1":2124} |
| train:chooseNStep:add | productionPreviewDrive | 1044 | 40.2536 | 4.2802 | 17.0079 | 1 | 1 | 1 | {"1":1044} |
| govern | scoreRows | 944 | 72.5385 | 34.2116 | 0.8358 | 9.7797 | 1 | 83 | {"9-16":880,"5-8":64} |
| coupPacifyUS | scoreRows | 760 | 42.5122 | 25.3456 | 0.5339 | 2.8158 | 1 | 47 | {"2-4":760} |
| rally | scoreRows | 724 | 64.4488 | 26.3243 | 0.8115 | 13.1657 | 1 | 83 | {"1":112,"9-16":332,"17-32":184,"2-4":48,"33+":24,"5-8":24} |
| coupArvnRedeployOptionalTroops | scoreRows | 704 | 70.6585 | 26.2702 | 1.1818 | 17.2159 | 1 | 61 | {"17-32":448,"9-16":256} |
| coupArvnRedeployPolice | scoreRows | 688 | 51.83 | 24.0377 | 1.1498 | 11.6744 | 1 | 61 | {"9-16":664,"5-8":24} |
| coupCommitmentPass | scoreRows | 680 | 28.8088 | 21.9972 | 0.2736 | 1.1618 | 1 | 61 | {"1":570,"2-4":110} |
| coupRedeployPass | scoreRows | 680 | 32.5598 | 22.4042 | 0.3486 | 2.8353 | 1 | 61 | {"1":520,"5-8":24,"9-16":136} |
| train:chooseNStep:confirm | productionPreviewDrive | 624 | 19.8011 | 2.7414 | 9.3197 | 1 | 1 | 1 | {"1":624} |
| infiltrate | scoreRows | 444 | 31.9425 | 16.2544 | 0.6228 | 47.5405 | 1 | 83 | {"1":48,"33+":348,"17-32":48} |
| advise | scoreRows | 430 | 21.0452 | 15.2807 | 0.2796 | 10.4186 | 1 | 83 | {"9-16":380,"5-8":50} |
| march | scoreRows | 424 | 22.9047 | 14.424 | 0.2916 | 9.5472 | 1 | 66 | {"1":124,"2-4":132,"33+":24,"9-16":72,"17-32":72} |
| rally | productionPreviewDrive | 381 | 38.6431 | 3.4633 | 24.9274 | 1 | 1 | 2 | {"1":381} |
| coupPacifyPass | scoreRows | 360 | 14.0043 | 11.5643 | 0.1462 | 1.1333 | 1 | 61 | {"1":344,"5-8":8,"2-4":8} |
| coupAgitateVC | scoreRows | 276 | 19.3368 | 9.4259 | 0.2186 | 2.971 | 1 | 47 | {"5-8":12,"2-4":264} |
| coupPacifyARVN | scoreRows | 248 | 14.906 | 8.2634 | 0.1751 | 3.7742 | 1 | 47 | {"5-8":112,"2-4":136} |
| coupNvaRedeployTroops | scoreRows | 228 | 13.1256 | 7.4683 | 0.1217 | 3.7368 | 1 | 59 | {"2-4":156,"5-8":72} |
| assault | scoreRows | 210 | 9.2448 | 6.7796 | 0.0983 | 3.8095 | 1 | 83 | {"2-4":210} |
| coupResourcesResolve | scoreRows | 200 | 8.845 | 6.7487 | 0.0882 | 1 | 1 | 61 | {"1":200} |
| coupVictoryCheck | scoreRows | 200 | 7.9221 | 6.4334 | 0.0799 | 1 | 1 | 61 | {"1":200} |
| coupAgitateVC | productionPreviewDrive | 184 | 18.7536 | 0.8795 | 13.2569 | 1 | 1 | 1 | {"1":184} |
| train | scoreRows | 184 | 9.988 | 6.1849 | 0.0935 | 4.4348 | 1 | 75 | {"2-4":152,"9-16":8,"5-8":24} |
| advise | productionPreviewDrive | 164 | 22.3813 | 2.2594 | 11.5605 | 1 | 1 | 2 | {"1":164} |
| attack | scoreRows | 144 | 11.6893 | 5.1112 | 0.1639 | 35.2222 | 1 | 64 | {"9-16":12,"33+":84,"2-4":40,"5-8":8} |
| infiltrate | productionPreviewDrive | 136 | 14.3435 | 1.0624 | 9.3202 | 1 | 1 | 1 | {"1":136} |
| coupCommitmentPass | productionPreviewDrive | 131 | 11.2495 | 0.6688 | 8.8814 | 1 | 1 | 1 | {"1":131} |
| coupCommitmentPass | previewCandidateFeatureRows | 120 | 21.3946 | 4.2744 | 0.123 | 1.0917 | 1 | 61 | {"1":109,"2-4":11} |
| train | productionPreviewDrive | 108 | 11.4151 | 0.5882 | 6.3028 | 1 | 1 | 2 | {"1":108} |
| march | productionPreviewDrive | 107 | 14.9214 | 0.6704 | 7.3127 | 1.0187 | 1 | 2 | {"1":105,"2-4":2} |
| rally | previewCandidateFeatureRows | 107 | 16.5898 | 4.3779 | 0.1824 | 14.0467 | 1 | 83 | {"1":21,"9-16":14,"17-32":36,"2-4":24,"33+":12} |
| coupPacifyUS | productionPreviewDrive | 106 | 12.8467 | 0.6233 | 8.1376 | 1 | 1 | 1 | {"1":106} |
| coupCommitmentResolve | scoreRows | 90 | 2.7475 | 2.8911 | 0.0356 | 2 | 1 | 59 | {"2-4":90} |
| coupRedeployPass | productionPreviewDrive | 82 | 7.375 | 0.4114 | 7.1367 | 1 | 1 | 1 | {"1":82} |
| assault | productionPreviewDrive | 80 | 8.35 | 0.5055 | 4.9841 | 1 | 1 | 2 | {"1":80} |
| coupAgitatePass | scoreRows | 80 | 4.2118 | 2.5645 | 0.035 | 1.25 | 1 | 61 | {"1":60,"2-4":20} |
| coupRedeployPass | previewCandidateFeatureRows | 80 | 11.7951 | 2.8192 | 0.0851 | 1 | 1 | 61 | {"1":80} |
| event-decision:chooseNStep:add | productionPreviewDrive | 69 | 3.5009 | 0.3876 | 1.4005 | 1 | 1 | 1 | {"1":69} |
| coupPacifyARVN | productionPreviewDrive | 66 | 5.8601 | 0.2957 | 4.9212 | 1 | 1 | 1 | {"1":66} |
| ambushNva | scoreRows | 60 | 2.5915 | 1.9523 | 0.0276 | 14.8 | 1 | 64 | {"1":36,"33+":12,"17-32":12} |
| coupPacifyPass | productionPreviewDrive | 60 | 5.8564 | 0.3248 | 4.3428 | 1 | 1 | 1 | {"1":60} |
| coupPacifyPass | previewCandidateFeatureRows | 58 | 8.0116 | 2.069 | 0.1093 | 1.0345 | 1 | 61 | {"1":56,"2-4":2} |
| transport | scoreRows | 56 | 3.5298 | 2.0897 | 0.0903 | 10.7143 | 1 | 59 | {"9-16":56} |
| coupAgitatePass | productionPreviewDrive | 50 | 4.871 | 0.1947 | 3.3244 | 1 | 1 | 1 | {"1":50} |
| ambushVc | scoreRows | 48 | 4.4311 | 1.8794 | 0.0429 | 7.25 | 1 | 64 | {"9-16":16,"5-8":28,"2-4":4} |
| march | previewCandidateFeatureRows | 47 | 7.8877 | 1.8229 | 0.0715 | 7.4255 | 1 | 66 | {"1":22,"2-4":11,"33+":2,"9-16":6,"17-32":6} |
| coupAgitateVC | previewCandidateFeatureRows | 46 | 5.8069 | 1.7472 | 0.0536 | 2 | 1 | 47 | {"2-4":46} |
| attack | productionPreviewDrive | 44 | 4.2711 | 0.2491 | 2.4659 | 1 | 1 | 2 | {"1":44} |
| govern | productionPreviewDrive | 42 | 7.4391 | 1.701 | 6.208 | 1 | 1 | 1 | {"1":42} |
| coupAgitatePass | previewCandidateFeatureRows | 40 | 4.6853 | 1.3828 | 0.0384 | 1.25 | 1 | 61 | {"1":30,"2-4":10} |
| advise | previewCandidateFeatureRows | 39 | 8.5752 | 1.704 | 0.0674 | 10.6923 | 1 | 83 | {"9-16":36,"5-8":3} |
| ambushVc | productionPreviewDrive | 38 | 3.4323 | 0.1913 | 1.999 | 1 | 1 | 1 | {"1":38} |
| infiltrate | previewCandidateFeatureRows | 37 | 13.7649 | 1.6555 | 0.09 | 47.5405 | 1 | 83 | {"1":4,"33+":29,"17-32":4} |
| coupArvnRedeployOptionalTroops | productionPreviewDrive | 36 | 5.7487 | 0.2885 | 3.1052 | 1 | 1 | 1 | {"1":36} |
| coupPacifyARVN | previewCandidateFeatureRows | 32 | 3.6496 | 1.1597 | 0.0393 | 2 | 1 | 47 | {"2-4":32} |
| coupPacifyUS | previewCandidateFeatureRows | 30 | 4.876 | 1.127 | 0.0492 | 2 | 1 | 47 | {"2-4":30} |
| resolveHonoluluPacify | scoreRows | 28 | 1.4818 | 0.9216 | 0.013 | 1 | 1 | 55 | {"1":28} |
| train | previewCandidateFeatureRows | 26 | 3.0002 | 0.9839 | 0.0306 | 3.6923 | 1 | 75 | {"2-4":26} |
| coupArvnRedeployMandatory | scoreRows | 24 | 1.442 | 0.7927 | 0.0148 | 11.3333 | 1 | 59 | {"9-16":24} |
| assault | previewCandidateFeatureRows | 21 | 3.536 | 0.7812 | 0.0307 | 3.8095 | 1 | 83 | {"2-4":21} |
| coupArvnRedeployPolice | productionPreviewDrive | 20 | 2.0355 | 0.1329 | 1.7254 | 1 | 1 | 1 | {"1":20} |
| coupResourcesResolve | previewCandidateFeatureRows | 20 | 3.3984 | 0.77 | 0.0271 | 1 | 1 | 61 | {"1":20} |
| coupResourcesResolve | productionPreviewDrive | 20 | 2.3197 | 0.1396 | 1.6874 | 1 | 1 | 1 | {"1":20} |
| coupVictoryCheck | previewCandidateFeatureRows | 20 | 3.1792 | 0.7228 | 0.0261 | 1 | 1 | 61 | {"1":20} |
| coupVictoryCheck | productionPreviewDrive | 20 | 2.0872 | 0.1424 | 1.6744 | 1 | 1 | 1 | {"1":20} |
| coupCommitmentResolve | productionPreviewDrive | 18 | 1.7046 | 0.1115 | 1.12 | 1 | 1 | 1 | {"1":18} |
| coupNvaRedeployTroops | productionPreviewDrive | 14 | 1.2762 | 0.0861 | 1.0014 | 1 | 1 | 1 | {"1":14} |
| pass | scoreRows | 12 | 0.4523 | 0.3798 | 0.0042 | 1 | 1 | 58 | {"1":12} |
| ambushNva | productionPreviewDrive | 11 | 1.1812 | 0.0634 | 0.6198 | 1 | 1 | 2 | {"1":11} |
| attack | previewCandidateFeatureRows | 11 | 3.6948 | 0.4433 | 0.0241 | 38 | 1 | 64 | {"9-16":1,"33+":7,"2-4":3} |
| ambushVc | previewCandidateFeatureRows | 10 | 1.2104 | 0.399 | 0.012 | 6.2 | 1 | 55 | {"5-8":6,"2-4":2,"9-16":2} |
| patrol | scoreRows | 10 | 0.4477 | 0.3174 | 0.0039 | 3 | 1 | 64 | {"2-4":10} |
| coupCommitmentResolve | previewCandidateFeatureRows | 9 | 1.3863 | 0.3227 | 0.0131 | 2 | 1 | 59 | {"2-4":9} |
| coupNvaRedeployTroops | previewCandidateFeatureRows | 7 | 1.2782 | 0.2519 | 0.0427 | 2 | 1 | 59 | {"2-4":7} |
| ambushNva | previewCandidateFeatureRows | 5 | 1.0084 | 0.1885 | 0.0082 | 14.8 | 1 | 64 | {"1":3,"33+":1,"17-32":1} |
| coupArvnRedeployMandatory | productionPreviewDrive | 4 | 1.1094 | 0.0326 | 0.2857 | 1 | 1 | 1 | {"1":4} |
| pass | previewCandidateFeatureRows | 1 | 0.1556 | 0.0367 | 0.0012 | 1 | 1 | 58 | {"1":1} |
| pass | productionPreviewDrive | 1 | 0.1206 | 0.0076 | 0.0881 | 1 | 1 | 1 | {"1":1} |

## WASM Serialization Stats

| Microturn class | Axis label | Calls | Total bytes | Bytes/call | Cache write ms | Cache write bytes | Cache write count |
|---|---|---:|---:|---:|---:|---:|---:|
| event | actionSelection|none | 2482 | 82678752 | 33311.3425 | 0 | 0 | 0 |
| govern | actionSelection|continuedDeepening | 944 | 31202520 | 33053.5169 | 0 | 0 | 0 |
| coupPacifyUS | actionSelection|none | 790 | 25734032 | 32574.7241 | 0 | 0 | 0 |
| coupArvnRedeployOptionalTroops | actionSelection|continuedDeepening | 704 | 23500736 | 33381.7273 | 0 | 0 | 0 |
| rally | actionSelection|none | 698 | 23261552 | 33326.0057 | 0 | 0 | 0 |
| coupArvnRedeployPolice | actionSelection|continuedDeepening | 688 | 22768376 | 33093.5698 | 0 | 0 | 0 |
| coupRedeployPass | coupRedeployPass|none | 680 | 19566480 | 28774.2353 | 0 | 0 | 0 |
| coupCommitmentPass | coupCommitmentPass|none | 559 | 15637060 | 27973.2737 | 0 | 0 | 0 |
| advise | actionSelection|none | 469 | 15415352 | 32868.5544 | 0 | 0 | 0 |
| infiltrate | actionSelection|none | 429 | 14823660 | 34553.986 | 0 | 0 | 0 |
| coupAgitateVC | actionSelection|none | 322 | 10512848 | 32648.5963 | 0 | 0 | 0 |
| march | actionSelection|none | 299 | 9868344 | 33004.495 | 0 | 0 | 0 |
| coupPacifyARVN | actionSelection|continuedDeepening | 280 | 9157868 | 32706.6714 | 0 | 0 | 0 |
| coupNvaRedeployTroops | actionSelection|none | 235 | 7656864 | 32582.4 | 0 | 0 | 0 |
| assault | actionSelection|none | 231 | 7532096 | 32606.4762 | 0 | 0 | 0 |
| coupResourcesResolve | coupResourcesResolve|none | 240 | 7164780 | 29853.25 | 0 | 0 | 0 |
| coupPacifyPass | coupPacifyPass|none | 240 | 7163520 | 29848 | 0 | 0 | 0 |
| coupVictoryCheck | coupVictoryCheck|none | 240 | 7163520 | 29848 | 0 | 0 | 0 |
| train | actionSelection|continuedDeepening | 210 | 6873508 | 32730.9905 | 0 | 0 | 0 |
| coupCommitmentPass | coupCommitmentPass|continuedDeepening | 240 | 6544000 | 27266.6667 | 0 | 0 | 0 |
| coupPacifyPass | coupPacifyPass|continuedDeepening | 218 | 5891512 | 27025.2844 | 0 | 0 | 0 |
| march | march|none | 219 | 5643700 | 25770.3196 | 0 | 0 | 0 |
| coupRedeployPass | actionSelection|continuedDeepening | 160 | 5271056 | 32944.1 | 0 | 0 | 0 |
| attack | actionSelection|none | 155 | 5253500 | 33893.5484 | 0 | 0 | 0 |
| rally | rally|none | 240 | 4445344 | 18522.2667 | 0 | 0 | 0 |
| coupCommitmentPass | actionSelection|none | 121 | 3933248 | 32506.1818 | 0 | 0 | 0 |
| coupCommitmentResolve | actionSelection|none | 99 | 3218112 | 32506.1818 | 0 | 0 | 0 |
| coupAgitatePass | coupAgitatePass|none | 130 | 2964860 | 22806.6154 | 0 | 0 | 0 |
| event | actionSelection|continuedDeepening | 80 | 2649096 | 33113.7 | 0 | 0 | 0 |
| ambushVc | actionSelection|none | 58 | 1906152 | 32864.6897 | 0 | 0 | 0 |
| transport | actionSelection|continuedDeepening | 56 | 1854252 | 33111.6429 | 0 | 0 | 0 |
| infiltrate | infiltrate|none | 89 | 1728440 | 19420.6742 | 0 | 0 | 0 |
| ambushNva | ambushNva|none | 44 | 1271936 | 28907.6364 | 0 | 0 | 0 |
| coupAgitatePass | actionSelection|none | 30 | 977480 | 32582.6667 | 0 | 0 | 0 |
| ambushNva | actionSelection|none | 26 | 880676 | 33872.1538 | 0 | 0 | 0 |
| coupArvnRedeployMandatory | actionSelection|continuedDeepening | 24 | 793820 | 33075.8333 | 0 | 0 | 0 |
| resolveHonoluluPacify | resolveHonoluluPacify|none | 20 | 649504 | 32475.2 | 0 | 0 | 0 |
| coupPacifyPass | actionSelection|continuedDeepening | 18 | 588976 | 32720.8889 | 0 | 0 | 0 |
| pass | pass|none | 14 | 423180 | 30227.1429 | 0 | 0 | 0 |
| patrol | actionSelection|none | 10 | 325672 | 32567.2 | 0 | 0 | 0 |
| govern:chooseNStep:add | production-deep-choosenstep-continuation|continuedDeepening | 2124 | 288864 | 136 | 0 | 0 | 0 |
| resolveHonoluluPacify | resolveHonoluluPacify|continuedDeepening | 8 | 260308 | 32538.5 | 0 | 0 | 0 |
| train:chooseNStep:add | production-deep-choosenstep-continuation|continuedDeepening | 1044 | 141984 | 136 | 0 | 0 | 0 |
| coupAgitateVC | coupAgitatePass|none | 138 | 131928 | 956 | 0 | 0 | 0 |
| rally | march|none | 84 | 94616 | 1126.381 | 0 | 0 | 0 |
| rally | attack|none | 86 | 85000 | 988.3721 | 0 | 0 | 0 |
| train:chooseNStep:confirm | production-deep-choosenstep-continuation|continuedDeepening | 624 | 84864 | 136 | 0 | 0 | 0 |
| rally | ambushVc|none | 74 | 76288 | 1030.9189 | 0 | 0 | 0 |
| coupPacifyUS | coupPacifyPass|none | 76 | 72656 | 956 | 0 | 0 | 0 |
| advise | advise|none | 42 | 49136 | 1169.9048 | 0 | 0 | 0 |
| advise | airLift|none | 38 | 48772 | 1283.4737 | 0 | 0 | 0 |
| coupAgitateVC | coupAgitateVC|none | 46 | 44528 | 968 | 0 | 0 | 0 |
| govern | govern|continuedDeepening | 42 | 44456 | 1058.4762 | 0 | 0 | 0 |
| advise | airStrike|none | 38 | 42840 | 1127.3684 | 0 | 0 | 0 |
| advise | assault|none | 40 | 41920 | 1048 | 0 | 0 | 0 |
| coupArvnRedeployOptionalTroops | coupArvnRedeployOptionalTroops|continuedDeepening | 36 | 41728 | 1159.1111 | 0 | 0 | 0 |
| infiltrate | rally|none | 33 | 38284 | 1160.1212 | 0 | 0 | 0 |
| train | assault|continuedDeepening | 32 | 33480 | 1046.25 | 0 | 0 | 0 |
| coupPacifyARVN | coupPacifyARVN|continuedDeepening | 34 | 32912 | 968 | 0 | 0 | 0 |
| infiltrate | nvaTransferResources|none | 33 | 32340 | 980 | 0 | 0 | 0 |
| infiltrate | march|none | 28 | 31268 | 1116.7143 | 0 | 0 | 0 |
| coupPacifyARVN | coupPacifyPass|continuedDeepening | 32 | 30592 | 956 | 0 | 0 | 0 |
| train | patrol|continuedDeepening | 26 | 29512 | 1135.0769 | 0 | 0 | 0 |
| coupPacifyUS | coupPacifyUS|none | 30 | 29040 | 968 | 0 | 0 | 0 |
| train | sweep|continuedDeepening | 24 | 27872 | 1161.3333 | 0 | 0 | 0 |
| train | train|continuedDeepening | 26 | 27736 | 1066.7692 | 0 | 0 | 0 |
| march | rally|none | 23 | 26332 | 1144.8696 | 0 | 0 | 0 |
| rally | terror|none | 24 | 24576 | 1024 | 0 | 0 | 0 |
| assault | patrol|none | 21 | 23828 | 1134.6667 | 0 | 0 | 0 |
| march | terror|none | 23 | 23528 | 1022.9565 | 0 | 0 | 0 |
| assault | train|none | 21 | 22356 | 1064.5714 | 0 | 0 | 0 |
| assault | assault|none | 21 | 22016 | 1048.381 | 0 | 0 | 0 |
| coupArvnRedeployPolice | coupArvnRedeployMandatory|continuedDeepening | 20 | 21040 | 1052 | 0 | 0 | 0 |
| assault | sweep|none | 17 | 19740 | 1161.1765 | 0 | 0 | 0 |
| march | nvaTransferResources|none | 14 | 13720 | 980 | 0 | 0 | 0 |
| coupCommitmentPass | coupCommitmentResolve|none | 11 | 13048 | 1186.1818 | 0 | 0 | 0 |
| attack | march|none | 11 | 12684 | 1153.0909 | 0 | 0 | 0 |
| attack | attack|none | 11 | 11272 | 1024.7273 | 0 | 0 | 0 |
| coupCommitmentResolve | coupCommitmentResolve|none | 9 | 10680 | 1186.6667 | 0 | 0 | 0 |
| ambushVc | ambushVc|none | 10 | 10248 | 1024.8 | 0 | 0 | 0 |
| coupAgitatePass | coupAgitateVC|none | 10 | 9680 | 968 | 0 | 0 | 0 |
| attack | rally|none | 8 | 9384 | 1173 | 0 | 0 | 0 |
| event-decision:chooseNStep:add | production-deep-choosenstep-continuation|continuedDeepening | 69 | 9384 | 136 | 0 | 0 | 0 |
| ambushVc | march|none | 8 | 8968 | 1121 | 0 | 0 | 0 |
| coupCommitmentResolve | coupCommitmentPass|none | 9 | 8604 | 956 | 0 | 0 | 0 |
| ambushVc | attack|none | 8 | 7928 | 991 | 0 | 0 | 0 |
| coupNvaRedeployTroops | coupNvaRedeployTroops|none | 7 | 7140 | 1020 | 0 | 0 | 0 |
| coupNvaRedeployTroops | coupRedeployPass|none | 7 | 6692 | 956 | 0 | 0 | 0 |
| ambushVc | subvert|none | 6 | 6360 | 1060 | 0 | 0 | 0 |
| ambushVc | tax|none | 6 | 6312 | 1052 | 0 | 0 | 0 |
| attack | nvaTransferResources|none | 6 | 5880 | 980 | 0 | 0 | 0 |
| infiltrate | terror|none | 5 | 5116 | 1023.2 | 0 | 0 | 0 |
| coupArvnRedeployMandatory | coupArvnRedeployMandatory|continuedDeepening | 4 | 4496 | 1124 | 0 | 0 | 0 |
| rally | subvert|none | 4 | 4392 | 1098 | 0 | 0 | 0 |
| advise | patrol|none | 3 | 3396 | 1132 | 0 | 0 | 0 |
| attack | infiltrate|none | 3 | 3204 | 1068 | 0 | 0 | 0 |
| advise | train|none | 3 | 3200 | 1066.6667 | 0 | 0 | 0 |
| attack | terror|none | 3 | 3060 | 1020 | 0 | 0 | 0 |
| ambushNva | march|none | 2 | 2372 | 1186 | 0 | 0 | 0 |
| ambushNva | infiltrate|none | 2 | 2140 | 1070 | 0 | 0 | 0 |
| coupRedeployPass | coupArvnRedeployMandatory|continuedDeepening | 2 | 2104 | 1052 | 0 | 0 | 0 |
| rally | tax|none | 2 | 2080 | 1040 | 0 | 0 | 0 |
| ambushNva | attack|none | 2 | 2064 | 1032 | 0 | 0 | 0 |
| attack | ambushNva|none | 2 | 2032 | 1016 | 0 | 0 | 0 |
| coupPacifyPass | coupPacifyARVN|continuedDeepening | 2 | 1936 | 968 | 0 | 0 | 0 |

## WASM Preview-Drive Unsupported Reasons

| Microturn class | Unsupported class | Unsupported owner | Reason | Count | Class unsupported total | Class route total |
|---|---|---|---|---:|---:|---:|
| govern:chooseNStep:confirm | unknown | production-deep-choosenstep-continuation.projectedState | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 520 | 520 | 0 |
| event | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 276 | 276 | 0 |
| rally | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 198 | 215 | 381 |
| coupArvnRedeployOptionalTroops | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 176 | 176 | 36 |
| coupArvnRedeployPolice | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 172 | 172 | 20 |
| govern | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 132 | 236 | 42 |
| govern | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 104 | 236 | 42 |
| coupAgitateVC | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 92 | 92 | 184 |
| govern:chooseNStep:add | unknown | production-deep-choosenstep-continuation.projectedState | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 73 | 73 | 708 |
| coupPacifyUS | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 46 | 46 | 106 |
| coupRedeployPass | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 40 | 40 | 82 |
| coupPacifyARVN | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 28 | 30 | 66 |
| rally | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 17 | 215 | 381 |
| ambushVc | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 14 | 14 | 38 |
| event-decision:chooseNStep:add | unknown | production-deep-choosenstep-continuation.projectedState | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 14 | 14 | 63 |
| train:chooseNStep:add | unknown | production-deep-choosenstep-continuation.projectedState | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 13 | 13 | 359 |
| coupNvaRedeployTroops | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 12 | 12 | 14 |
| train | agent-guided-completion | production-preview-drive.chooseN | only origin-seat greedy chooseN publication is supported | 12 | 20 | 108 |
| train:chooseNStep:confirm | unknown | production-deep-choosenstep-continuation.projectedState | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 12 | 12 | 72 |
| transport | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 10 | 14 | 0 |
| attack | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 6 | 6 | 44 |
| coupArvnRedeployMandatory | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 6 | 6 | 4 |
| resolveHonoluluPacify | unsupported-effect | production-preview-drive.effect.popInterruptPhase | unsupported production preview-drive effect popInterruptPhase | 4 | 4 | 0 |
| train | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 4 | 20 | 108 |
| train | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 4 | 20 | 108 |
| transport | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 4 | 14 | 0 |
| advise | agent-guided-completion | production-preview-drive.chooseN | only origin-seat greedy chooseN publication is supported | 3 | 4 | 164 |
| coupPacifyARVN | unsupported-effect | production-preview-drive.effect.popInterruptPhase | unsupported production preview-drive effect popInterruptPhase | 2 | 30 | 66 |
| coupPacifyPass | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 2 | 2 | 60 |
| advise | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 1 | 4 | 164 |
| patrol | agent-guided-completion | production-preview-drive.chooseN | only origin-seat greedy chooseN publication is supported | 1 | 1 | 0 |

## Fast-Tier vs Slow-Tier Delta

Fast tier: `1000`, `1006`, `1007`, `1010`, `1014`. Rows with ratio greater than `3.0` satisfy the Phase 0 hot-axis criterion.

| Microturn class | Slow decisions | Fast decisions | Slow mean ms | Fast mean ms | Slow:fast ratio | Verdict |
|---|---:|---:|---:|---:|---:|---|
| event-decision:chooseOne | 12 | 6 | 0.3436 | 0.15 | 2.2907 |  |
| coupArvnRedeployPolice:chooseOne | 58 | 50 | 131.4674 | 71.9189 | 1.828 |  |
| coupNvaRedeployTroops | 11 | 1 | 9.1166 | 5.1653 | 1.765 |  |
| train:chooseNStep:confirm | 22 | 17 | 302.0627 | 186.9803 | 1.6155 |  |
| assault:chooseNStep:confirm | 16 | 12 | 0.0315 | 0.0221 | 1.4253 |  |
| govern:chooseNStep:confirm | 44 | 35 | 380.8909 | 286.8355 | 1.3279 |  |
| event-decision:chooseNStep:add | 48 | 30 | 32.2281 | 25.9399 | 1.2424 |  |
| assault:chooseNStep:add | 8 | 6 | 0.0644 | 0.0528 | 1.2197 |  |
| transport | 4 | 3 | 51.9269 | 42.694 | 1.2163 |  |
| govern | 47 | 35 | 65.8864 | 58.31 | 1.1299 |  |
| event-decision:chooseNStep:confirm | 47 | 27 | 0.0351 | 0.0313 | 1.1214 |  |
| coupCommitmentResolve:chooseNStep:confirm | 12 | 12 | 0.031 | 0.0277 | 1.1191 |  |
| coupRedeployPass | 32 | 24 | 9.216 | 8.4632 | 1.0889 |  |
| chooseNStep:chooseNStep:confirm | 6 | 3 | 0.0403 | 0.0377 | 1.069 |  |
| coupVictoryCheck | 8 | 6 | 3.782 | 3.5397 | 1.0685 |  |
| advise:chooseNStep:add | 13 | 15 | 0.1218 | 0.1146 | 1.0628 |  |
| assault | 8 | 6 | 8.8161 | 8.4327 | 1.0455 |  |
| march:chooseNStep:add | 21 | 22 | 0.0594 | 0.057 | 1.0421 |  |
| rally:chooseNStep:confirm | 77 | 72 | 0.0359 | 0.0345 | 1.0406 |  |
| govern:chooseNStep:add | 55 | 35 | 216.9112 | 209.2319 | 1.0367 |  |
| train:chooseOne | 12 | 11 | 5.1293 | 5.0999 | 1.0058 |  |
| coupPacifyUS | 25 | 26 | 8.596 | 8.5793 | 1.0019 |  |
| coupPacifyARVN | 11 | 8 | 9.1907 | 9.207 | 0.9982 |  |
| coupArvnRedeployOptionalTroops:chooseOne | 84 | 60 | 20.2212 | 20.3471 | 0.9938 |  |
| advise:chooseOne | 27 | 30 | 0.0403 | 0.0406 | 0.9926 |  |
| coupArvnRedeployPolice | 27 | 32 | 31.1877 | 31.5268 | 0.9892 |  |
| coupArvnRedeployOptionalTroops | 32 | 25 | 41.227 | 42.0928 | 0.9794 |  |
| govern:chooseOne | 58 | 35 | 3.4256 | 3.5495 | 0.9651 |  |
| train | 8 | 7 | 31.9455 | 33.7772 | 0.9458 |  |
| coupCommitmentPass | 32 | 24 | 3.3668 | 3.6329 | 0.9268 |  |
| ambushVc:chooseOne | 7 | 4 | 0.0249 | 0.027 | 0.9222 |  |
| infiltrate | 16 | 8 | 9.6519 | 10.5071 | 0.9186 |  |
| coupResourcesResolve | 8 | 6 | 3.359 | 3.6685 | 0.9156 |  |
| rally:chooseOne | 70 | 57 | 0.0346 | 0.0378 | 0.9153 |  |
| advise:chooseNStep:confirm | 13 | 15 | 0.0413 | 0.0457 | 0.9037 |  |
| march | 15 | 13 | 5.8964 | 6.5486 | 0.9004 |  |
| ambushVc:chooseNStep:add | 7 | 3 | 0.0484 | 0.0539 | 0.898 |  |
| coupAgitatePass | 8 | 6 | 3.4403 | 3.8851 | 0.8855 |  |
| attack | 4 | 8 | 10.4341 | 12.0236 | 0.8678 |  |
| coupAgitateVC | 22 | 25 | 8.0755 | 9.3987 | 0.8592 |  |
| coupCommitmentResolve | 3 | 3 | 4.2632 | 5.0108 | 0.8508 |  |
| coupPacifyPass | 16 | 12 | 4.1348 | 4.8991 | 0.844 |  |
| event | 109 | 77 | 76.558 | 91.6263 | 0.8355 |  |
| rally | 67 | 54 | 20.4422 | 25.4763 | 0.8024 |  |
| ambushVc | 7 | 4 | 13.6398 | 17.1366 | 0.7959 |  |
| infiltrate:chooseNStep:confirm | 26 | 12 | 0.0318 | 0.04 | 0.795 |  |
| march:chooseNStep:confirm | 35 | 29 | 0.0352 | 0.0445 | 0.791 |  |
| rally:chooseNStep:add | 68 | 56 | 0.0663 | 0.0883 | 0.7508 |  |
| infiltrate:chooseOne | 23 | 13 | 0.0309 | 0.0439 | 0.7039 |  |
| coupNvaRedeployTroops:chooseOne | 25 | 2 | 0.0422 | 0.0616 | 0.6851 |  |
| advise | 13 | 15 | 9.5926 | 14.3871 | 0.6668 |  |
| ambushVc:chooseNStep:confirm | 7 | 3 | 0.0262 | 0.0417 | 0.6283 |  |
| train:chooseNStep:add | 14 | 11 | 977.627 | 1777.4302 | 0.55 |  |
| transport:chooseOne | 8 | 6 | 35.6052 | 73.5116 | 0.4843 |  |
| chooseOne:chooseOne | 13 | 8 | 0.7139 | 1.6594 | 0.4302 |  |
| infiltrate:chooseNStep:add | 16 | 8 | 0.0458 | 0.1194 | 0.3836 |  |

## Notes

- `elapsedMs` is measured around the per-decision `PolicyAgent.chooseDecision` call. It excludes simulator apply/delta work and report rendering.
- Child processes enforce the per-seed timeout. Each child loads the built engine and production FITL GameSpecDoc, using the repo GameDef cache when available.
- WASM timing buckets are emitted only when `POLICY_WASM_TIMING_PROFILE=1` is set before the child process imports the WASM runtime module.
- The script does not modify engine source or production profile data.
