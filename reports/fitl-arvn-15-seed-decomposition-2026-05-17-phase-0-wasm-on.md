# FITL ARVN 15-Seed Per-Microturn-Class Decomposition

**Date**: 2026-05-17-phase-0-wasm-on
**Status**: Spec 173 measurement witness.
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 600000 --date 2026-05-17-phase-0-wasm-on`
**CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-0-wasm-on.csv`

## Summary

- Seeds completed: 15/15
- Per-decision rows: 3769
- Hot class with slow:fast ratio >3x: no
- Per-seed timeout: 600000 ms
- Hot-path buckets: disabled
- WASM mode: enabled
- WASM timing profile: disabled
- WASM production preview-drive route count: 3125
- WASM production preview-drive unsupported count: 1998
- WASM production preview-drive batch count: 2648
- WASM timing call count: 0

## Per-Seed Wall Time

| Seed | Status | Stop Reason | Wall ms | Decisions | ms/decision | Error |
|---:|---|---|---:|---:|---:|---|
| 1000 | OK | terminal | 5388.09 | 159 | 33.8874 |  |
| 1001 | OK | terminal | 7076.68 | 193 | 36.6667 |  |
| 1002 | OK | terminal | 4563.56 | 148 | 30.8349 |  |
| 1003 | OK | terminal | 8292.78 | 226 | 36.6937 |  |
| 1004 | OK | terminal | 12905.97 | 344 | 37.5174 |  |
| 1005 | OK | terminal | 42775.27 | 398 | 107.4756 |  |
| 1006 | OK | terminal | 9771.63 | 228 | 42.858 |  |
| 1007 | OK | terminal | 6704.48 | 218 | 30.7545 |  |
| 1008 | OK | terminal | 18884.11 | 346 | 54.5784 |  |
| 1009 | OK | terminal | 11293.29 | 292 | 38.6757 |  |
| 1010 | OK | terminal | 33776.9 | 339 | 99.6369 |  |
| 1011 | OK | terminal | 7223.74 | 206 | 35.0667 |  |
| 1012 | OK | terminal | 15757.23 | 201 | 78.3942 |  |
| 1013 | OK | terminal | 7166.38 | 258 | 27.7767 |  |
| 1014 | OK | terminal | 17291.14 | 213 | 81.1791 |  |

## Per-Microturn-Class Rollup

| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | WASM preview-drive routes | WASM preview-drive unsupported | WASM preview-drive unsupported reasons | WASM preview-drive batches | WASM timing calls | Marshaling ms | Execution ms | Deserialization ms | Token index builds | Static rebuilds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|
| train:chooseNStep:add | 37 | 38268.98 | 1034.2969 | 3325.0373 | 14599.697 | 17.4865 | 0 | 5183 | 7420 | 0 | 0 | 359 | 13 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:13 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| govern:chooseNStep:confirm | 115 | 30766.91 | 267.5384 | 489.3177 | 9701.5223 | 6.6957 | 0 | 2505 | 1135 | 0 | 0 | 0 | 520 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:520 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| govern:chooseNStep:add | 135 | 24920.43 | 184.5958 | 288.1461 | 3836.7697 | 6.0815 | 0 | 3770 | 5825 | 0 | 0 | 708 | 73 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:73 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event | 248 | 21137.08 | 85.2302 | 83.5822 | 4768.2354 | 19.121 | 248 | 0 | 0 | 248 | 234 | 0 | 276 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:276 | 0 | 0 | 0 | 0 | 0 | 38 | 278 |
| coupArvnRedeployPolice:chooseOne | 153 | 14261.91 | 93.2151 | 275.1803 | 297.2089 | 30.3922 | 0 | 105697 | 3591 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| train:chooseNStep:confirm | 59 | 9393.73 | 159.2157 | 1650.2826 | 2877.6304 | 3.0508 | 0 | 1810 | 3782 | 0 | 0 | 72 | 12 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:12 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| govern | 118 | 6561.46 | 55.6056 | 77.6969 | 573.7059 | 10.7797 | 111 | 0 | 7 | 111 | 96 | 42 | 236 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:132; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:104 | 146 | 0 | 0 | 0 | 0 | 0 | 111 |
| coupArvnRedeployOptionalTroops:chooseOne | 215 | 4078.68 | 18.9706 | 33.2173 | 43.6963 | 8.3907 | 0 | 13517 | 1865 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupArvnRedeployOptionalTroops | 88 | 3470.68 | 39.4396 | 47.4229 | 49.9924 | 17.2159 | 71 | 0 | 17 | 71 | 0 | 36 | 176 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:176 | 212 | 0 | 0 | 0 | 0 | 0 | 71 |
| rally | 165 | 3421.24 | 20.7348 | 43.0022 | 152.1291 | 15.0667 | 146 | 0 | 19 | 146 | 100 | 381 | 215 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:198; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:17 | 398 | 0 | 0 | 0 | 0 | 0 | 146 |
| coupArvnRedeployPolice | 86 | 2563.31 | 29.8059 | 35.661 | 42.6181 | 11.6744 | 85 | 0 | 1 | 85 | 0 | 20 | 172 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:172 | 192 | 0 | 0 | 0 | 0 | 0 | 85 |
| event-decision:chooseNStep:add | 96 | 2222.39 | 23.1499 | 224.1214 | 383.2207 | 11.4479 | 0 | 250 | 1045 | 0 | 0 | 63 | 14 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:14 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| transport:chooseOne | 14 | 716.91 | 51.2078 | 110.5791 | 110.5791 | 16.7143 | 0 | 952 | 37 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupRedeployPass | 80 | 681.35 | 8.5168 | 26.0353 | 46.4046 | 2.95 | 32 | 0 | 48 | 32 | 15 | 82 | 40 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:40 | 122 | 0 | 0 | 0 | 0 | 0 | 32 |
| coupPacifyUS | 76 | 627.71 | 8.2594 | 13.3448 | 14.3324 | 2.8158 | 76 | 0 | 0 | 76 | 0 | 106 | 46 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:46 | 152 | 0 | 0 | 0 | 0 | 0 | 76 |
| train | 23 | 604.57 | 26.2856 | 50.3356 | 53.8835 | 5.4348 | 23 | 0 | 0 | 23 | 12 | 108 | 20 | agent-guided-completion/production-preview-drive.chooseN/only origin-seat greedy chooseN publication is supported:12; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:4; unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:4 | 124 | 0 | 0 | 0 | 0 | 0 | 23 |
| coupAgitateVC | 69 | 600.38 | 8.7011 | 12.9533 | 22.743 | 2.971 | 52 | 0 | 17 | 52 | 12 | 184 | 92 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:92 | 276 | 0 | 0 | 0 | 0 | 0 | 52 |
| patrol | 1 | 544.76 | 544.7553 | 544.7553 | 544.7553 | 4 | 1 | 0 | 0 | 1 | 0 | 0 | 1 | agent-guided-completion/production-preview-drive.chooseN/only origin-seat greedy chooseN publication is supported:1 | 1 | 0 | 0 | 0 | 0 | 0 | 1 |
| advise | 43 | 493.37 | 11.4737 | 39.8575 | 40.8868 | 11.4186 | 32 | 0 | 11 | 32 | 8 | 164 | 4 | agent-guided-completion/production-preview-drive.chooseN/only origin-seat greedy chooseN publication is supported:3; unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:1 | 167 | 0 | 0 | 0 | 0 | 0 | 32 |
| govern:chooseOne | 138 | 458.28 | 3.3209 | 4.3734 | 9.2472 | 2 | 0 | 178 | 178 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate | 37 | 358.67 | 9.6938 | 11.5751 | 18.1237 | 48.4324 | 30 | 0 | 7 | 30 | 16 | 136 | 0 |  | 136 | 0 | 0 | 0 | 0 | 0 | 30 |
| transport | 7 | 328.2 | 46.8854 | 53.4702 | 53.4702 | 11.7143 | 7 | 0 | 0 | 7 | 0 | 0 | 14 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:10; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:4 | 4 | 0 | 0 | 0 | 0 | 0 | 7 |
| coupArvnRedeployMandatory:chooseOne | 13 | 309.51 | 23.8087 | 34.4732 | 34.4732 | 8 | 0 | 1435 | 205 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupPacifyARVN | 31 | 276.25 | 8.9114 | 12.0124 | 12.3731 | 3.7742 | 14 | 0 | 17 | 14 | 30 | 66 | 30 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:28; unsupported-effect/production-preview-drive.effect.popInterruptPhase/unsupported production preview-drive effect popInterruptPhase:2 | 96 | 0 | 0 | 0 | 0 | 0 | 14 |
| coupCommitmentPass | 80 | 258.41 | 3.2301 | 4.935 | 9.5107 | 1.1375 | 9 | 0 | 71 | 9 | 2 | 131 | 0 |  | 131 | 0 | 0 | 0 | 0 | 0 | 9 |
| march | 40 | 243.14 | 6.0784 | 10.1739 | 13.0143 | 8.9 | 30 | 0 | 10 | 30 | 66 | 107 | 0 |  | 107 | 0 | 0 | 0 | 0 | 0 | 30 |
| coupNvaRedeployTroops | 19 | 170.38 | 8.9673 | 15.7582 | 15.7582 | 3.7368 | 12 | 0 | 7 | 12 | 0 | 14 | 12 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:12 | 26 | 0 | 0 | 0 | 0 | 0 | 12 |
| coupPacifyPass | 40 | 168.93 | 4.2232 | 5.6634 | 12.2934 | 1.15 | 37 | 0 | 3 | 37 | 2 | 60 | 2 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:2 | 62 | 0 | 0 | 0 | 0 | 0 | 37 |
| assault | 21 | 168.17 | 8.0081 | 10.1515 | 10.5452 | 4.8095 | 20 | 0 | 1 | 20 | 3 | 80 | 0 |  | 80 | 0 | 0 | 0 | 0 | 0 | 20 |
| attack | 14 | 164.6 | 11.7568 | 25.5722 | 25.5722 | 31.6429 | 12 | 0 | 2 | 12 | 0 | 44 | 6 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:6 | 44 | 0 | 0 | 0 | 0 | 0 | 12 |
| train:chooseOne | 35 | 161.52 | 4.6148 | 7.1579 | 7.521 | 2.3143 | 0 | 66 | 99 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc | 12 | 159.42 | 13.2854 | 23.1703 | 23.1703 | 8.1667 | 11 | 0 | 1 | 11 | 0 | 38 | 14 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:14 | 38 | 0 | 0 | 0 | 0 | 0 | 11 |
| coupArvnRedeployMandatory | 3 | 113.04 | 37.681 | 41.9448 | 41.9448 | 11.3333 | 1 | 0 | 2 | 1 | 0 | 4 | 6 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:6 | 10 | 0 | 0 | 0 | 0 | 0 | 1 |
| coupAgitatePass | 20 | 69.31 | 3.4655 | 4.735 | 4.9145 | 1.25 | 17 | 0 | 3 | 17 | 0 | 50 | 0 |  | 50 | 0 | 0 | 0 | 0 | 0 | 17 |
| coupVictoryCheck | 20 | 67.66 | 3.3829 | 4.1575 | 4.5571 | 1 | 20 | 0 | 0 | 20 | 4 | 20 | 0 |  | 20 | 0 | 0 | 0 | 0 | 0 | 20 |
| coupResourcesResolve | 20 | 67.45 | 3.3724 | 4.1684 | 5.1207 | 1 | 3 | 0 | 17 | 3 | 0 | 20 | 0 |  | 20 | 0 | 0 | 0 | 0 | 0 | 3 |
| coupCommitmentResolve | 9 | 39.4 | 4.3779 | 5.6071 | 5.6071 | 2 | 0 | 0 | 9 | 0 | 0 | 18 | 0 |  | 18 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva | 5 | 30.63 | 6.1258 | 9.7519 | 9.7519 | 15.2 | 5 | 0 | 0 | 5 | 0 | 11 | 0 |  | 11 | 0 | 0 | 0 | 0 | 0 | 5 |
| chooseOne:chooseOne | 31 | 20.21 | 0.6519 | 7.521 | 8.6676 | 5.2903 | 0 | 7 | 2 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| resolveHonoluluPacify | 3 | 16.94 | 5.6467 | 6.2725 | 6.2725 | 1 | 3 | 0 | 0 | 3 | 0 | 0 | 4 | unsupported-effect/production-preview-drive.effect.popInterruptPhase/unsupported production preview-drive effect popInterruptPhase:4 | 4 | 0 | 0 | 0 | 0 | 0 | 3 |
| rally:chooseNStep:add | 168 | 12.1 | 0.072 | 0.127 | 0.7485 | 20.75 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseNStep:confirm | 209 | 6.59 | 0.0315 | 0.0596 | 0.1154 | 14.7943 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseOne | 172 | 5.57 | 0.0324 | 0.0752 | 0.3555 | 1.3547 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseOne | 34 | 5.29 | 0.1555 | 0.6307 | 3.3148 | 3.6471 | 0 | 1 | 1 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:add | 43 | 4.27 | 0.0993 | 0.3023 | 0.7321 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| pass | 1 | 3.82 | 3.8225 | 3.8225 | 3.8225 | 1 | 1 | 0 | 0 | 1 | 0 | 1 | 0 |  | 1 | 0 | 0 | 0 | 0 | 0 | 1 |
| advise:chooseOne | 87 | 3.13 | 0.036 | 0.1065 | 0.1257 | 2.4368 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:add | 57 | 3.05 | 0.0535 | 0.0919 | 0.1117 | 11.614 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:confirm | 91 | 3.01 | 0.0331 | 0.0592 | 0.0975 | 5.2198 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseNStep:confirm | 89 | 2.71 | 0.0305 | 0.0794 | 0.1377 | 6.5169 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:add | 37 | 2.23 | 0.0603 | 0.0687 | 0.6327 | 3.7027 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:confirm | 43 | 1.74 | 0.0405 | 0.0739 | 0.0802 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseOne | 57 | 1.69 | 0.0296 | 0.0555 | 0.1497 | 1.614 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupNvaRedeployTroops:chooseOne | 43 | 1.6 | 0.0372 | 0.0511 | 0.0765 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:confirm | 55 | 1.41 | 0.0257 | 0.0434 | 0.0936 | 4.4909 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:add | 21 | 1.03 | 0.049 | 0.0615 | 0.1376 | 3.0952 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupCommitmentResolve:chooseNStep:confirm | 36 | 0.97 | 0.027 | 0.0464 | 0.0473 | 9.25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:confirm | 42 | 0.9 | 0.0215 | 0.0247 | 0.0807 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:add | 12 | 0.49 | 0.0412 | 0.0662 | 0.0662 | 3.4167 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| chooseNStep:chooseNStep:confirm | 10 | 0.39 | 0.0388 | 0.0533 | 0.0533 | 18.2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:confirm | 12 | 0.33 | 0.0276 | 0.0689 | 0.0689 | 4.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseOne | 12 | 0.24 | 0.02 | 0.0306 | 0.0306 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseNStep:add | 3 | 0.13 | 0.0424 | 0.047 | 0.047 | 3.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseOne | 5 | 0.13 | 0.0256 | 0.0338 | 0.0338 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseOne | 4 | 0.12 | 0.0299 | 0.0312 | 0.0312 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseNStep:confirm | 3 | 0.08 | 0.0278 | 0.0326 | 0.0326 | 3.6667 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| patrol:chooseNStep:confirm | 3 | 0.08 | 0.0262 | 0.0324 | 0.0324 | 4.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| patrol:chooseNStep:add | 1 | 0.07 | 0.0689 | 0.0689 | 0.0689 | 17 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Top Hot Axes In Slow-Tier Seeds

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.

| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms |
|---:|---|---|---:|---:|---:|---:|---:|
| 1 | govern:chooseNStep:confirm | continuedDeepening | 33 | 15783.47 | 478.2869 | 495.8533 | 9701.5223 |
| 2 | train:chooseNStep:add | continuedDeepening | 14 | 12791.7 | 913.6927 | 3325.0373 | 3325.0373 |
| 3 | govern:chooseNStep:add | continuedDeepening | 55 | 11330.67 | 206.0121 | 288.1461 | 3836.7697 |
| 4 | event | singlePass | 109 | 7985.01 | 73.257 | 154.8776 | 3057.5977 |
| 5 | coupArvnRedeployPolice:chooseOne | continuedDeepening | 58 | 7041.94 | 121.4127 | 293.6838 | 297.2089 |
| 6 | train:chooseNStep:confirm | continuedDeepening | 12 | 6073.85 | 506.1544 | 2877.6304 | 2877.6304 |
| 7 | govern | singlePass | 47 | 2881.94 | 61.3179 | 77.6969 | 573.7059 |
| 8 | coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | 84 | 1653.02 | 19.6788 | 31.5725 | 37.2774 |
| 9 | event-decision:chooseNStep:add | continuedDeepening | 6 | 1509.77 | 251.6281 | 383.2207 | 383.2207 |
| 10 | coupArvnRedeployOptionalTroops | singlePass | 32 | 1277.31 | 39.916 | 47.4229 | 47.7917 |

## WASM Timing Buckets

_No WASM timing buckets recorded._

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
| coupNvaRedeployTroops | 11 | 1 | 8.7228 | 3.578 | 2.4379 |  |
| event-decision:chooseOne | 12 | 6 | 0.3054 | 0.1474 | 2.0719 |  |
| coupArvnRedeployPolice:chooseOne | 58 | 50 | 121.4127 | 67.2084 | 1.8065 |  |
| train:chooseNStep:confirm | 22 | 17 | 276.1306 | 175.4383 | 1.5739 |  |
| assault:chooseNStep:add | 8 | 6 | 0.0584 | 0.0435 | 1.3425 |  |
| govern:chooseNStep:confirm | 44 | 35 | 358.7381 | 269.4394 | 1.3314 |  |
| event-decision:chooseNStep:add | 48 | 30 | 31.4842 | 23.6713 | 1.3301 |  |
| assault:chooseNStep:confirm | 16 | 12 | 0.0248 | 0.0192 | 1.2917 |  |
| train:chooseOne | 12 | 11 | 4.9969 | 4.1723 | 1.1976 |  |
| advise:chooseOne | 27 | 30 | 0.0383 | 0.032 | 1.1969 |  |
| march:chooseNStep:add | 21 | 22 | 0.0578 | 0.0484 | 1.1942 |  |
| govern | 47 | 35 | 61.3179 | 53.2814 | 1.1508 |  |
| transport | 4 | 3 | 49.6182 | 43.2417 | 1.1475 |  |
| advise:chooseNStep:add | 13 | 15 | 0.1213 | 0.1061 | 1.1433 |  |
| advise:chooseNStep:confirm | 13 | 15 | 0.0424 | 0.0377 | 1.1247 |  |
| assault | 8 | 6 | 8.57 | 7.7217 | 1.1099 |  |
| rally:chooseNStep:confirm | 77 | 72 | 0.0332 | 0.0309 | 1.0744 |  |
| coupCommitmentResolve:chooseNStep:confirm | 12 | 12 | 0.0281 | 0.0265 | 1.0604 |  |
| govern:chooseNStep:add | 55 | 35 | 206.0121 | 196.1797 | 1.0501 |  |
| coupArvnRedeployPolice | 27 | 32 | 30.4265 | 29.4729 | 1.0324 |  |
| event-decision:chooseNStep:confirm | 47 | 27 | 0.0309 | 0.0301 | 1.0266 |  |
| chooseNStep:chooseNStep:confirm | 6 | 3 | 0.0378 | 0.0369 | 1.0244 |  |
| coupArvnRedeployOptionalTroops | 32 | 25 | 39.916 | 39.0383 | 1.0225 |  |
| attack | 4 | 8 | 11.3726 | 11.2075 | 1.0147 |  |
| coupArvnRedeployOptionalTroops:chooseOne | 84 | 60 | 19.6788 | 19.6822 | 0.9998 |  |
| coupCommitmentPass | 32 | 24 | 3.2616 | 3.2887 | 0.9918 |  |
| govern:chooseOne | 58 | 35 | 3.3217 | 3.3604 | 0.9885 |  |
| coupVictoryCheck | 8 | 6 | 3.4122 | 3.4868 | 0.9786 |  |
| coupPacifyARVN | 11 | 8 | 8.5738 | 8.8428 | 0.9696 |  |
| march | 15 | 13 | 5.607 | 5.7856 | 0.9691 |  |
| coupPacifyUS | 25 | 26 | 8.1494 | 8.6049 | 0.9471 |  |
| infiltrate | 16 | 8 | 9.3599 | 9.9198 | 0.9436 |  |
| march:chooseNStep:confirm | 35 | 29 | 0.0332 | 0.0354 | 0.9379 |  |
| train | 8 | 7 | 28.5789 | 30.5725 | 0.9348 |  |
| coupRedeployPass | 32 | 24 | 8.3832 | 8.9723 | 0.9343 |  |
| coupResourcesResolve | 8 | 6 | 3.2822 | 3.528 | 0.9303 |  |
| ambushVc:chooseOne | 7 | 4 | 0.0198 | 0.0216 | 0.9167 |  |
| ambushVc | 7 | 4 | 12.7263 | 14.3522 | 0.8867 |  |
| event | 109 | 77 | 73.257 | 82.9155 | 0.8835 |  |
| ambushVc:chooseNStep:add | 7 | 3 | 0.0413 | 0.0483 | 0.8551 |  |
| coupCommitmentResolve | 3 | 3 | 3.8942 | 4.6634 | 0.8351 |  |
| coupAgitatePass | 8 | 6 | 3.0932 | 3.7289 | 0.8295 |  |
| rally:chooseOne | 70 | 57 | 0.0296 | 0.0361 | 0.8199 |  |
| chooseOne:chooseOne | 13 | 8 | 0.7873 | 0.9836 | 0.8004 |  |
| coupPacifyPass | 16 | 12 | 3.7938 | 4.7461 | 0.7994 |  |
| rally:chooseNStep:add | 68 | 56 | 0.0645 | 0.0807 | 0.7993 |  |
| rally | 67 | 54 | 18.7079 | 23.8185 | 0.7854 |  |
| infiltrate:chooseOne | 23 | 13 | 0.0294 | 0.0385 | 0.7636 |  |
| coupAgitateVC | 22 | 25 | 7.4086 | 9.9903 | 0.7416 |  |
| advise | 13 | 15 | 9.2006 | 13.1356 | 0.7004 |  |
| infiltrate:chooseNStep:confirm | 26 | 12 | 0.024 | 0.0346 | 0.6936 |  |
| ambushVc:chooseNStep:confirm | 7 | 3 | 0.0259 | 0.0381 | 0.6798 |  |
| coupNvaRedeployTroops:chooseOne | 25 | 2 | 0.0353 | 0.0607 | 0.5815 |  |
| train:chooseNStep:add | 14 | 11 | 913.6927 | 1682.9257 | 0.5429 |  |
| transport:chooseOne | 8 | 6 | 34.9959 | 72.8237 | 0.4806 |  |
| infiltrate:chooseNStep:add | 16 | 8 | 0.0449 | 0.1162 | 0.3864 |  |

## Notes

- `elapsedMs` is measured around the per-decision `PolicyAgent.chooseDecision` call. It excludes simulator apply/delta work and report rendering.
- Child processes enforce the per-seed timeout. Each child loads the built engine and production FITL GameSpecDoc, using the repo GameDef cache when available.
- WASM timing buckets are emitted only when `POLICY_WASM_TIMING_PROFILE=1` is set before the child process imports the WASM runtime module.
- The script does not modify engine source or production profile data.
