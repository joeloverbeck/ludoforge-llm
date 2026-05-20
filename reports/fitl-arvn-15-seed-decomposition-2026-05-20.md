# FITL ARVN 15-Seed Per-Microturn-Class Decomposition

**Date**: 2026-05-20
**Status**: FITL ARVN measurement witness.
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 400000 --date 2026-05-20`
**CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-20.csv`

## Summary

- Seeds completed: 15/15
- Per-decision rows: 3808
- Hot class with slow:fast ratio >3x: yes
- Per-seed timeout: 400000 ms
- Hot-path buckets: disabled
- WASM mode: enabled
- WASM timing profile: disabled
- WASM production preview-drive route count: 4100
- WASM production preview-drive unsupported count: 3359
- WASM preview candidate-feature row oracle fallback count: 516
- WASM production preview-drive batch count: 4612
- WASM timing call count: 0
- WASM serialized input bytes: 0
- Bytecode input cache write bytes: 0

## Per-Seed Wall Time

| Seed | Status | Stop Reason | Wall ms | Decisions | ms/decision | Error |
|---:|---|---|---:|---:|---:|---|
| 1000 | OK | terminal | 13486.3 | 159 | 84.8195 |  |
| 1001 | OK | terminal | 13813.4 | 193 | 71.572 |  |
| 1002 | OK | terminal | 10134.22 | 147 | 68.9403 |  |
| 1003 | OK | noLegalMoves | 15809.94 | 226 | 69.9555 |  |
| 1004 | OK | terminal | 19787.82 | 459 | 43.1107 |  |
| 1005 | OK | terminal | 34199.8 | 178 | 192.1337 |  |
| 1006 | OK | terminal | 20530.15 | 234 | 87.7357 |  |
| 1007 | OK | terminal | 13132.15 | 218 | 60.2392 |  |
| 1008 | OK | terminal | 30768.15 | 421 | 73.0835 |  |
| 1009 | OK | terminal | 33864.23 | 313 | 108.1924 |  |
| 1010 | OK | terminal | 49577.4 | 434 | 114.2336 |  |
| 1011 | OK | terminal | 13628.55 | 211 | 64.5903 |  |
| 1012 | OK | terminal | 31060.69 | 171 | 181.6415 |  |
| 1013 | OK | terminal | 14282.42 | 258 | 55.3582 |  |
| 1014 | OK | terminal | 20494.07 | 186 | 110.1832 |  |

## Per-Microturn-Class Rollup

| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | Cache hits | Cache misses | Cache compile ms | WASM preview-drive routes | WASM preview-drive unsupported | WASM row oracle fallbacks | WASM preview-drive unsupported reasons | WASM preview-drive batches | WASM timing calls | Marshaling ms | Execution ms | Deserialization ms | Bytes serialized | Cache write ms | Cache write bytes | Cache write count | Token index builds | Static rebuilds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| coupArvnRedeployPolice:chooseOne | 136 | 47930.03 | 352.4267 | 1296.3431 | 1934.3012 | 30.3015 | 0 | 1986595 | 2165 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| train:chooseNStep:add | 45 | 41127.07 | 913.9348 | 4147.6735 | 14986.5231 | 15.6 | 0 | 146278 | 5411 | 0 | 0 | 0 | 0 | 0 | 430 | 16 | 0 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state/expected-terminal-boundary/seat-or-turn-boundary:16 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event | 249 | 35930.71 | 144.3001 | 162.2599 | 5418.1143 | 18.3213 | 249 | 0 | 0 | 249 | 238 | 0 | 0 | 0 | 0 | 354 | 0 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:354 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 38 | 281 |
| event-decision:chooseNStep:add | 87 | 27418.35 | 315.1534 | 668.2908 | 10901.4541 | 12.908 | 0 | 339338 | 8296 | 0 | 0 | 0 | 0 | 0 | 289 | 44 | 0 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state/expected-terminal-boundary/seat-or-turn-boundary:44 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| govern:chooseNStep:add | 113 | 18769.68 | 166.1034 | 312.4598 | 959.8988 | 5.7699 | 0 | 30529 | 4407 | 0 | 0 | 0 | 0 | 0 | 558 | 58 | 0 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state/expected-terminal-boundary/seat-or-turn-boundary:58 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| govern:chooseNStep:confirm | 95 | 17536.28 | 184.5925 | 409.4757 | 2017.8827 | 6.4526 | 0 | 9358 | 887 | 0 | 0 | 0 | 0 | 0 | 0 | 405 | 0 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state/expected-terminal-boundary/seat-or-turn-boundary:405 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally | 168 | 15309.41 | 91.1275 | 194.8483 | 667.1009 | 14.1131 | 147 | 0 | 21 | 147 | 100 | 0 | 0 | 0 | 373 | 223 | 494 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:206; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:17 | 390 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 147 |
| coupArvnRedeployOptionalTroops | 87 | 10604.85 | 121.8948 | 146.0806 | 162.0284 | 17.2759 | 70 | 0 | 17 | 70 | 0 | 0 | 0 | 0 | 102 | 522 | 0 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:522 | 624 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 70 |
| advise | 53 | 10484.74 | 197.8252 | 120.341 | 5197.2892 | 11.3962 | 42 | 0 | 11 | 42 | 8 | 0 | 0 | 0 | 196 | 6 | 0 | agent-guided-completion/production-preview-drive.chooseN/only origin-seat greedy chooseN publication is supported:3; unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:3 | 199 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 42 |
| govern | 99 | 9247.66 | 93.4107 | 132.8306 | 242.7467 | 10.5758 | 94 | 0 | 5 | 94 | 144 | 0 | 0 | 0 | 156 | 594 | 0 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:306; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:288 | 444 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 118 |
| train:chooseNStep:confirm | 66 | 7885.16 | 119.472 | 62.1852 | 3835.3878 | 2.6212 | 0 | 39947 | 1794 | 0 | 0 | 0 | 0 | 0 | 49 | 13 | 0 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state/expected-terminal-boundary/seat-or-turn-boundary:13 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupArvnRedeployPolice | 86 | 6975.69 | 81.1127 | 102.1123 | 134.5346 | 11.6628 | 83 | 0 | 3 | 83 | 0 | 0 | 0 | 0 | 72 | 516 | 0 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:516 | 588 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 83 |
| infiltrate | 40 | 5753.85 | 143.8462 | 209.7341 | 239.3917 | 44.2 | 30 | 0 | 10 | 30 | 16 | 0 | 0 | 0 | 142 | 0 | 0 |  | 142 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 30 |
| coupArvnRedeployOptionalTroops:chooseOne | 204 | 5432.47 | 26.6298 | 52.3386 | 71.7926 | 8.4118 | 0 | 111048 | 1638 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march | 40 | 3833.22 | 95.8306 | 160.3353 | 428.8977 | 9.85 | 32 | 0 | 8 | 32 | 66 | 0 | 0 | 0 | 110 | 0 | 0 |  | 110 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 32 |
| train | 25 | 2632.93 | 105.3171 | 111.1177 | 676.9294 | 4.88 | 24 | 0 | 1 | 24 | 20 | 0 | 0 | 0 | 312 | 72 | 5 | agent-guided-completion/production-preview-drive.chooseN/only origin-seat greedy chooseN publication is supported:60; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:6; unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:6 | 378 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 26 |
| ambushNva | 8 | 2359.09 | 294.8864 | 736.9538 | 736.9538 | 55.25 | 6 | 0 | 2 | 6 | 0 | 0 | 0 | 0 | 26 | 0 | 0 |  | 26 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 6 |
| coupRedeployPass | 88 | 1888.15 | 21.4563 | 68.761 | 119.2579 | 3 | 35 | 0 | 53 | 35 | 15 | 0 | 0 | 0 | 118 | 132 | 0 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:132 | 250 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 35 |
| transport:chooseOne | 14 | 1776.37 | 126.8837 | 310.9403 | 310.9403 | 22.8571 | 0 | 57627 | 39 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| attack | 11 | 1358.41 | 123.4919 | 266.0727 | 266.0727 | 30.5455 | 8 | 0 | 3 | 8 | 0 | 0 | 0 | 0 | 48 | 0 | 2 |  | 48 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 8 |
| transport | 7 | 1272.38 | 181.7686 | 811.727 | 811.727 | 10.8571 | 6 | 0 | 1 | 6 | 0 | 0 | 0 | 0 | 0 | 42 | 0 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:36; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:6 | 6 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 6 |
| coupAgitateVC | 77 | 1240.1 | 16.1052 | 22.1771 | 27.3252 | 2.8961 | 57 | 0 | 20 | 57 | 12 | 0 | 0 | 0 | 212 | 96 | 0 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:96 | 308 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 57 |
| coupPacifyUS | 76 | 1230.27 | 16.1877 | 23.1935 | 24.7166 | 2.8158 | 76 | 0 | 0 | 76 | 0 | 0 | 0 | 0 | 106 | 46 | 0 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:46 | 152 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 76 |
| sweep | 13 | 1122.06 | 86.312 | 119.7404 | 119.7404 | 10.6154 | 12 | 0 | 1 | 12 | 0 | 0 | 0 | 0 | 0 | 78 | 0 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:60; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:18 | 18 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 12 |
| assault | 21 | 1106.76 | 52.7026 | 57.5183 | 70.2314 | 4.8571 | 21 | 0 | 0 | 21 | 3 | 0 | 0 | 0 | 81 | 0 | 0 |  | 81 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 21 |
| coupCommitmentPass | 88 | 1059.03 | 12.0344 | 26.5849 | 32.7227 | 1.1477 | 9 | 0 | 79 | 9 | 28 | 0 | 0 | 0 | 233 | 0 | 0 |  | 233 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 9 |
| coupPacifyPass | 44 | 813.04 | 18.4782 | 40.1026 | 42.6446 | 2.0909 | 34 | 0 | 10 | 34 | 20 | 0 | 0 | 0 | 118 | 54 | 0 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:54 | 172 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 36 |
| coupPacifyARVN | 22 | 753.56 | 34.2526 | 38.86 | 39.0625 | 3.0455 | 10 | 0 | 12 | 10 | 16 | 0 | 0 | 0 | 180 | 48 | 0 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:36; unsupported-effect/production-preview-drive.effect.popInterruptPhase/unsupported production preview-drive effect popInterruptPhase:12 | 228 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 10 |
| patrol | 3 | 669.35 | 223.1174 | 588.1706 | 588.1706 | 3.6667 | 3 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 5 | 1 | 0 | agent-guided-completion/production-preview-drive.chooseN/only origin-seat greedy chooseN publication is supported:1 | 6 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 3 |
| ambushVc | 14 | 534.13 | 38.1523 | 51.6033 | 51.6033 | 6.7143 | 13 | 0 | 1 | 13 | 0 | 0 | 0 | 0 | 48 | 14 | 15 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:14 | 48 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 13 |
| coupNvaRedeployTroops | 24 | 441.94 | 18.4143 | 29.4758 | 35.9776 | 3.875 | 16 | 0 | 8 | 16 | 0 | 0 | 0 | 0 | 16 | 16 | 0 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:16 | 32 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 16 |
| govern:chooseOne | 117 | 400.11 | 3.4198 | 4.768 | 8.764 | 2 | 0 | 459 | 153 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupResourcesResolve | 22 | 332.02 | 15.092 | 39.334 | 42.311 | 1 | 2 | 0 | 20 | 2 | 0 | 0 | 0 | 0 | 22 | 0 | 0 |  | 22 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 |
| coupCommitmentResolve | 9 | 247.55 | 27.5059 | 31.6084 | 31.6084 | 2 | 0 | 0 | 9 | 0 | 0 | 0 | 0 | 0 | 18 | 0 | 0 |  | 18 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupVictoryCheck | 24 | 213.01 | 8.8756 | 12.7266 | 26.8105 | 1 | 24 | 0 | 0 | 24 | 4 | 0 | 0 | 0 | 24 | 0 | 0 |  | 24 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 24 |
| coupAgitatePass | 22 | 211.74 | 9.6247 | 13.8583 | 14.0358 | 1.2273 | 20 | 0 | 2 | 20 | 0 | 0 | 0 | 0 | 54 | 0 | 0 |  | 54 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 20 |
| train:chooseOne | 38 | 181.43 | 4.7745 | 6.4661 | 7.196 | 2.3158 | 0 | 248 | 109 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| chooseOne:chooseOne | 29 | 70.56 | 2.4331 | 26.5321 | 31.7627 | 6.6207 | 0 | 650 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseOne | 34 | 42.42 | 1.2477 | 9.6666 | 15.1036 | 3.8235 | 0 | 195 | 25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| resolveHonoluluPacify | 4 | 33.88 | 8.4701 | 12.4345 | 12.4345 | 1 | 4 | 0 | 0 | 4 | 0 | 0 | 0 | 0 | 0 | 9 | 0 | unsupported-effect/production-preview-drive.effect.popInterruptPhase/unsupported production preview-drive effect popInterruptPhase:9 | 9 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 4 |
| rally:chooseNStep:add | 170 | 14.68 | 0.0864 | 0.1284 | 1.2598 | 21.0882 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| pass | 2 | 9.64 | 4.8181 | 4.8579 | 4.8579 | 1 | 2 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 2 | 0 | 0 |  | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 |
| rally:chooseNStep:confirm | 211 | 8.51 | 0.0404 | 0.0814 | 1.1403 | 15.0474 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseOne | 175 | 6.49 | 0.0371 | 0.1007 | 0.2069 | 1.3771 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:add | 53 | 5.17 | 0.0975 | 0.2548 | 0.7531 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:add | 59 | 4.6 | 0.078 | 0.1082 | 1.1434 | 12.2034 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseNStep:confirm | 78 | 4.45 | 0.057 | 0.149 | 0.7696 | 7.3077 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseOne | 108 | 4.3 | 0.0398 | 0.0952 | 0.1181 | 2.4444 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:confirm | 94 | 3.72 | 0.0396 | 0.0762 | 0.1124 | 4.9255 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:confirm | 53 | 3.19 | 0.0602 | 0.0954 | 0.9561 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:add | 40 | 2.88 | 0.0721 | 0.0964 | 0.6365 | 3.75 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupNvaRedeployTroops:chooseOne | 58 | 2.53 | 0.0437 | 0.071 | 0.1252 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseOne | 65 | 2.48 | 0.0382 | 0.0674 | 0.1587 | 1.5846 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:confirm | 58 | 1.91 | 0.033 | 0.0573 | 0.0973 | 4.5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupCommitmentResolve:chooseNStep:confirm | 36 | 1.37 | 0.038 | 0.1045 | 0.1815 | 9.3056 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:add | 20 | 1.19 | 0.0597 | 0.0744 | 0.1362 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:confirm | 40 | 1.14 | 0.0285 | 0.0423 | 0.0947 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:add | 12 | 0.56 | 0.0467 | 0.0723 | 0.0723 | 3.4167 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseOne | 14 | 0.55 | 0.0394 | 0.1782 | 0.1782 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| chooseNStep:chooseNStep:confirm | 10 | 0.46 | 0.0457 | 0.0734 | 0.0734 | 13.7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseNStep:add | 7 | 0.38 | 0.0536 | 0.0616 | 0.0616 | 3.5714 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:confirm | 12 | 0.32 | 0.0268 | 0.0385 | 0.0385 | 4.25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseOne | 6 | 0.27 | 0.0454 | 0.0578 | 0.0578 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| patrol:chooseNStep:add | 3 | 0.24 | 0.0814 | 0.0863 | 0.0863 | 17 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| patrol:chooseNStep:confirm | 7 | 0.22 | 0.0311 | 0.0388 | 0.0388 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseNStep:confirm | 7 | 0.2 | 0.0288 | 0.0415 | 0.0415 | 4.1429 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseOne | 8 | 0.2 | 0.0251 | 0.0426 | 0.0426 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Top Hot Axes In Slow-Tier Seeds

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.

| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms | Cache hits | Cache misses | Cache compile ms |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | event-decision:chooseNStep:add | continuedDeepening | 19 | 23369.7 | 1229.9844 | 10901.4541 | 10901.4541 | 0 | 0 | 0 |
| 2 | coupArvnRedeployPolice:chooseOne | continuedDeepening | 44 | 17890.53 | 406.603 | 1261.6683 | 1934.3012 | 0 | 0 | 0 |
| 3 | event | singlePass | 97 | 12701.43 | 130.9425 | 242.8368 | 3326.091 | 0 | 0 | 0 |
| 4 | train:chooseNStep:add | continuedDeepening | 14 | 12507.64 | 893.4026 | 4234.7138 | 4234.7138 | 0 | 0 | 0 |
| 5 | govern:chooseNStep:add | continuedDeepening | 46 | 6719.38 | 146.0735 | 315.5171 | 328.7183 | 0 | 0 | 0 |
| 6 | rally | singlePass | 60 | 5980.34 | 99.6723 | 218.2148 | 667.1009 | 0 | 0 | 0 |
| 7 | train:chooseNStep:confirm | continuedDeepening | 11 | 4214.61 | 383.1468 | 3835.3878 | 3835.3878 | 0 | 0 | 0 |
| 8 | govern:chooseNStep:confirm | continuedDeepening | 24 | 4210.91 | 175.4544 | 322.7987 | 332.0461 | 0 | 0 | 0 |
| 9 | coupArvnRedeployOptionalTroops | singlePass | 32 | 3837.75 | 119.9298 | 143.4124 | 147.1939 | 0 | 0 | 0 |
| 10 | govern | singlePass | 37 | 3437.95 | 92.9175 | 135.3892 | 138.0814 | 0 | 0 | 0 |

## WASM Timing Buckets

_No WASM timing buckets recorded._

## WASM Serialization Stats

_No WASM serialization stats recorded._

## WASM Preview-Drive Unsupported Reasons

| Microturn class | Unsupported class | Unsupported owner | Reason | Count | Class unsupported total | Class route total |
|---|---|---|---|---:|---:|---:|
| coupArvnRedeployOptionalTroops | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 522 | 522 | 102 |
| coupArvnRedeployPolice | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 516 | 516 | 72 |
| govern:chooseNStep:confirm | unknown | production-deep-choosenstep-continuation.projectedState | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 405 | 405 | 0 |
| event | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 354 | 354 | 0 |
| govern | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 306 | 594 | 156 |
| govern | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 288 | 594 | 156 |
| rally | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 206 | 223 | 373 |
| coupRedeployPass | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 132 | 132 | 118 |
| coupAgitateVC | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 96 | 96 | 212 |
| sweep | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 60 | 78 | 0 |
| train | agent-guided-completion | production-preview-drive.chooseN | only origin-seat greedy chooseN publication is supported | 60 | 72 | 312 |
| govern:chooseNStep:add | unknown | production-deep-choosenstep-continuation.projectedState | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 58 | 58 | 558 |
| coupPacifyPass | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 54 | 54 | 118 |
| coupPacifyUS | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 46 | 46 | 106 |
| event-decision:chooseNStep:add | unknown | production-deep-choosenstep-continuation.projectedState | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 44 | 44 | 289 |
| coupPacifyARVN | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 36 | 48 | 180 |
| transport | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 36 | 42 | 0 |
| sweep | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 18 | 78 | 0 |
| rally | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 17 | 223 | 373 |
| coupNvaRedeployTroops | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 16 | 16 | 16 |
| train:chooseNStep:add | unknown | production-deep-choosenstep-continuation.projectedState | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 16 | 16 | 430 |
| ambushVc | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 14 | 14 | 48 |
| train:chooseNStep:confirm | unknown | production-deep-choosenstep-continuation.projectedState | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 13 | 13 | 49 |
| coupPacifyARVN | unsupported-effect | production-preview-drive.effect.popInterruptPhase | unsupported production preview-drive effect popInterruptPhase | 12 | 48 | 180 |
| resolveHonoluluPacify | unsupported-effect | production-preview-drive.effect.popInterruptPhase | unsupported production preview-drive effect popInterruptPhase | 9 | 9 | 0 |
| train | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 6 | 72 | 312 |
| train | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 6 | 72 | 312 |
| transport | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 6 | 42 | 0 |
| advise | agent-guided-completion | production-preview-drive.chooseN | only origin-seat greedy chooseN publication is supported | 3 | 6 | 196 |
| advise | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 3 | 6 | 196 |
| patrol | agent-guided-completion | production-preview-drive.chooseN | only origin-seat greedy chooseN publication is supported | 1 | 1 | 5 |

## Terminal-Boundary Projected-State Split

| Microturn class | Classification | Boundary kind | Count |
|---|---|---|---:|
| govern:chooseNStep:confirm | expected-terminal-boundary | seat-or-turn-boundary | 405 |
| govern:chooseNStep:add | expected-terminal-boundary | seat-or-turn-boundary | 58 |
| event-decision:chooseNStep:add | expected-terminal-boundary | seat-or-turn-boundary | 44 |
| train:chooseNStep:add | expected-terminal-boundary | seat-or-turn-boundary | 16 |
| train:chooseNStep:confirm | expected-terminal-boundary | seat-or-turn-boundary | 13 |

## Fast-Tier vs Slow-Tier Delta

Fast tier: `1000`, `1006`, `1007`, `1010`, `1014`. Rows with ratio greater than `3.0` satisfy the Phase 0 hot-axis criterion.

| Microturn class | Slow decisions | Fast decisions | Slow mean ms | Fast mean ms | Slow:fast ratio | Verdict |
|---|---:|---:|---:|---:|---:|---|
| event-decision:chooseOne | 10 | 6 | 4.0579 | 0.1521 | 26.6792 | hot axis |
| transport | 2 | 5 | 442.3124 | 77.5512 | 5.7035 | hot axis |
| event-decision:chooseNStep:add | 40 | 29 | 584.2807 | 139.5185 | 4.1878 | hot axis |
| advise:chooseNStep:confirm | 19 | 17 | 0.0885 | 0.0424 | 2.0873 |  |
| train:chooseNStep:confirm | 22 | 26 | 191.6397 | 126.9431 | 1.5097 |  |
| event-decision:chooseNStep:confirm | 35 | 24 | 0.0759 | 0.0506 | 1.5 |  |
| coupNvaRedeployTroops | 12 | 1 | 18.0182 | 12.5979 | 1.4303 |  |
| advise | 19 | 17 | 121.7171 | 89.0377 | 1.367 |  |
| assault:chooseNStep:confirm | 16 | 10 | 0.0327 | 0.024 | 1.3625 |  |
| coupArvnRedeployPolice:chooseOne | 44 | 52 | 406.603 | 325.7644 | 1.2482 |  |
| ambushVc:chooseOne | 8 | 4 | 0.0444 | 0.0368 | 1.2065 |  |
| assault:chooseNStep:add | 8 | 5 | 0.0637 | 0.0552 | 1.154 |  |
| infiltrate | 18 | 8 | 146.0642 | 127.9473 | 1.1416 |  |
| attack | 1 | 8 | 162.6677 | 143.7545 | 1.1316 |  |
| chooseNStep:chooseNStep:confirm | 3 | 6 | 0.0484 | 0.043 | 1.1256 |  |
| coupArvnRedeployOptionalTroops:chooseOne | 84 | 60 | 29.1607 | 27.0398 | 1.0784 |  |
| coupPacifyPass | 16 | 14 | 19.4085 | 18.0227 | 1.0769 |  |
| rally | 60 | 59 | 99.6723 | 92.8383 | 1.0736 |  |
| coupVictoryCheck | 9 | 7 | 8.4493 | 7.9529 | 1.0624 |  |
| coupRedeployPass | 32 | 28 | 22.3653 | 21.0829 | 1.0608 |  |
| ambushVc:chooseNStep:confirm | 7 | 2 | 0.0256 | 0.0245 | 1.0449 |  |
| coupCommitmentPass | 32 | 28 | 12.6837 | 12.3087 | 1.0305 |  |
| assault | 8 | 6 | 52.7228 | 51.4667 | 1.0244 |  |
| govern:chooseOne | 48 | 26 | 3.4693 | 3.3919 | 1.0228 |  |
| coupArvnRedeployPolice | 26 | 33 | 82.2153 | 80.6285 | 1.0197 |  |
| pass | 1 | 1 | 4.8579 | 4.7783 | 1.0167 |  |
| infiltrate:chooseNStep:confirm | 25 | 12 | 0.0334 | 0.033 | 1.0121 |  |
| coupPacifyARVN | 7 | 6 | 35.1501 | 34.8372 | 1.009 |  |
| coupPacifyUS | 25 | 26 | 16.1902 | 16.1639 | 1.0016 |  |
| coupResourcesResolve | 8 | 7 | 15.0864 | 15.1194 | 0.9978 |  |
| ambushVc:chooseNStep:add | 7 | 2 | 0.0435 | 0.0437 | 0.9954 |  |
| coupCommitmentResolve:chooseNStep:confirm | 8 | 12 | 0.036 | 0.0366 | 0.9836 |  |
| govern | 37 | 26 | 92.9175 | 94.5758 | 0.9825 |  |
| march:chooseNStep:add | 18 | 26 | 0.0587 | 0.0598 | 0.9816 |  |
| coupArvnRedeployOptionalTroops | 32 | 25 | 119.9298 | 122.2846 | 0.9807 |  |
| coupAgitatePass | 8 | 7 | 9.2412 | 9.458 | 0.9771 |  |
| rally:chooseOne | 63 | 62 | 0.0364 | 0.0376 | 0.9681 |  |
| advise:chooseNStep:add | 19 | 17 | 0.1031 | 0.1102 | 0.9356 |  |
| march:chooseNStep:confirm | 27 | 36 | 0.0412 | 0.0441 | 0.9342 |  |
| train:chooseOne | 12 | 16 | 4.5776 | 4.9665 | 0.9217 |  |
| advise:chooseOne | 39 | 34 | 0.0361 | 0.0396 | 0.9116 |  |
| train:chooseNStep:add | 14 | 21 | 893.4026 | 1010.92 | 0.8838 |  |
| ambushVc | 8 | 4 | 36.9871 | 41.9054 | 0.8826 |  |
| coupAgitateVC | 26 | 25 | 15.3301 | 17.4908 | 0.8765 |  |
| transport:chooseOne | 4 | 10 | 115.2694 | 131.5294 | 0.8764 |  |
| event | 97 | 81 | 130.9425 | 150.6474 | 0.8692 |  |
| coupCommitmentResolve | 2 | 3 | 26.2015 | 30.6814 | 0.854 |  |
| rally:chooseNStep:add | 61 | 60 | 0.0752 | 0.0919 | 0.8183 |  |
| rally:chooseNStep:confirm | 67 | 74 | 0.0372 | 0.0467 | 0.7966 |  |
| march | 12 | 15 | 82.3669 | 116.5401 | 0.7068 |  |
| infiltrate:chooseOne | 31 | 13 | 0.0345 | 0.049 | 0.7041 |  |
| govern:chooseNStep:add | 46 | 26 | 146.0735 | 209.5191 | 0.6972 |  |
| chooseOne:chooseOne | 11 | 9 | 2.5599 | 4.4643 | 0.5734 |  |
| train | 8 | 10 | 71.0615 | 140.2674 | 0.5066 |  |
| infiltrate:chooseNStep:add | 18 | 8 | 0.0571 | 0.1267 | 0.4507 |  |
| coupNvaRedeployTroops:chooseOne | 26 | 2 | 0.0446 | 0.0993 | 0.4491 |  |
| govern:chooseNStep:confirm | 35 | 26 | 120.3445 | 281.7808 | 0.4271 |  |

## Notes

- `elapsedMs` is measured around the per-decision `PolicyAgent.chooseDecision` call. It excludes simulator apply/delta work and report rendering.
- Child processes enforce the per-seed timeout. Each child loads the built engine and production FITL GameSpecDoc, using the repo GameDef cache when available.
- WASM timing buckets are emitted only when `POLICY_WASM_TIMING_PROFILE=1` is set before the child process imports the WASM runtime module.
- The script does not modify engine source or production profile data.
