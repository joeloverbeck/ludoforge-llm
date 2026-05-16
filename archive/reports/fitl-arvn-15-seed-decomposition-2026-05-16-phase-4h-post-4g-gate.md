# FITL ARVN 15-Seed Per-Microturn-Class Decomposition

**Status**: ✅ EXPLOITED — referenced during spec 174 implementation (archived 2026-05-16).

**Date**: 2026-05-16-phase-4h-post-4g-gate
**Status**: Spec 173 measurement witness.
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 400000 --date 2026-05-16-phase-4h-post-4g-gate --profile-buckets`
**CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4h-post-4g-gate.csv`

## Summary

- Seeds completed: 15/15
- Per-decision rows: 6377
- Hot class with slow:fast ratio >3x: yes
- Per-seed timeout: 400000 ms
- Hot-path buckets: enabled
- WASM production preview-drive route count: 1253
- WASM production preview-drive unsupported count: 2313
- WASM production preview-drive batch count: 1711

## Per-Seed Wall Time

| Seed | Status | Stop Reason | Wall ms | Decisions | ms/decision | Error |
|---:|---|---|---:|---:|---:|---|
| 1000 | OK | terminal | 20069.35 | 427 | 47.0008 |  |
| 1001 | OK | terminal | 5474.4 | 177 | 30.9288 |  |
| 1002 | OK | terminal | 9159.31 | 299 | 30.6331 |  |
| 1003 | OK | terminal | 6140.16 | 210 | 29.2389 |  |
| 1004 | OK | terminal | 11313.09 | 476 | 23.767 |  |
| 1005 | OK | terminal | 64149.54 | 790 | 81.2019 |  |
| 1006 | OK | noLegalMoves | 7103.95 | 231 | 30.753 |  |
| 1007 | OK | terminal | 8084.51 | 290 | 27.8776 |  |
| 1008 | OK | terminal | 28601.78 | 679 | 42.1234 |  |
| 1009 | OK | terminal | 9484.7 | 296 | 32.0429 |  |
| 1010 | OK | terminal | 26582.38 | 582 | 45.6742 |  |
| 1011 | OK | terminal | 33182.64 | 473 | 70.1536 |  |
| 1012 | OK | terminal | 68856.48 | 823 | 83.6652 |  |
| 1013 | OK | terminal | 7018.31 | 261 | 26.8901 |  |
| 1014 | OK | noLegalMoves | 21685.55 | 363 | 59.7398 |  |

## Per-Microturn-Class Rollup

| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | WASM preview-drive routes | WASM preview-drive unsupported | WASM preview-drive unsupported reasons | WASM preview-drive batches | Token index builds | Static rebuilds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|
| coupArvnRedeployPolice:chooseOne | 617 | 61678.05 | 99.9644 | 295.8136 | 430.3042 | 29.3906 | 0 | 427381 | 15311 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| govern:chooseNStep:confirm | 110 | 39282.45 | 357.1132 | 452.0387 | 7756.9929 | 6.4091 | 0 | 2231 | 1017 | 0 | 0 | 0 | 464 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:464 | 0 | 0 | 0 |
| govern:chooseNStep:add | 131 | 37243.52 | 284.3017 | 527.5087 | 4466.3746 | 6.0611 | 0 | 3629 | 5431 | 0 | 0 | 663 | 89 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:89 | 0 | 0 | 0 |
| event | 404 | 33901.22 | 83.9139 | 165.7193 | 3993.6446 | 24.297 | 404 | 0 | 0 | 404 | 354 | 0 | 457 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:457 | 0 | 39 | 434 |
| train:chooseNStep:add | 15 | 25919.31 | 1727.9543 | 3301.6555 | 3301.6555 | 16.0667 | 0 | 7233 | 15523 | 0 | 0 | 222 | 7 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:7 | 0 | 0 | 0 |
| train:chooseNStep:confirm | 21 | 17120.23 | 815.2489 | 2946.0582 | 3287.042 | 9.2857 | 0 | 4701 | 9733 | 0 | 0 | 155 | 4 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:4 | 0 | 0 | 0 |
| coupArvnRedeployOptionalTroops:chooseOne | 405 | 9413.36 | 23.2429 | 38.6135 | 50.7723 | 8.2667 | 0 | 37399 | 5200 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| govern | 117 | 8516.67 | 72.7921 | 189.5099 | 2244.0835 | 10.2735 | 114 | 0 | 3 | 114 | 104 | 0 | 174 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:174 | 30 | 0 | 114 |
| rally | 183 | 5059.02 | 27.6449 | 41.9833 | 540.1266 | 22.3443 | 174 | 0 | 9 | 174 | 52 | 0 | 338 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:338 | 14 | 10 | 174 |
| assault:chooseNStep:add | 60 | 3878.01 | 64.6335 | 167.4519 | 929.5296 | 2.45 | 0 | 250 | 182 | 0 | 0 | 53 | 22 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:22 | 0 | 0 | 0 |
| chooseNStep:chooseNStep:add | 6 | 3680.07 | 613.3455 | 1015.6887 | 1015.6887 | 22 | 0 | 254 | 928 | 0 | 0 | 44 | 42 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:42 | 0 | 0 | 0 |
| event-decision:chooseNStep:add | 157 | 2451.28 | 15.6132 | 166.3625 | 394.5603 | 17.4586 | 0 | 294 | 1341 | 0 | 0 | 81 | 9 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:9 | 0 | 0 | 0 |
| assault:chooseNStep:confirm | 94 | 2171.88 | 23.1051 | 46.9685 | 1262.709 | 2.3085 | 0 | 89 | 65 | 0 | 0 | 9 | 20 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:20 | 0 | 0 | 0 |
| sweep:chooseNStep:confirm | 3 | 2080.62 | 693.5385 | 1298.3875 | 1298.3875 | 7.6667 | 0 | 557 | 346 | 0 | 0 | 19 | 0 |  | 0 | 0 | 0 |
| transport:chooseOne | 34 | 1601.09 | 47.0908 | 117.404 | 133.0695 | 15.2941 | 0 | 1898 | 81 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| coupArvnRedeployMandatory:chooseOne | 49 | 1192.18 | 24.3302 | 34.7375 | 36.8666 | 8 | 0 | 5271 | 753 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| transport | 17 | 1186.99 | 69.8227 | 491.3328 | 491.3328 | 10.4118 | 17 | 0 | 0 | 17 | 0 | 0 | 34 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:34 | 0 | 0 | 17 |
| sweep:chooseNStep:add | 1 | 1138.43 | 1138.4345 | 1138.4345 | 1138.4345 | 7 | 0 | 328 | 162 | 0 | 0 | 7 | 0 |  | 0 | 0 | 0 |
| coupArvnRedeployPolice | 369 | 741.24 | 2.0088 | 3.0339 | 4.3903 | 6.832 | 369 | 0 | 0 | 369 | 0 | 0 | 330 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:330 | 369 | 0 | 369 |
| govern:chooseOne | 138 | 475.29 | 3.4441 | 4.9286 | 10.902 | 2 | 0 | 180 | 180 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| train | 7 | 410.66 | 58.6659 | 169.893 | 169.893 | 8.8571 | 7 | 0 | 0 | 7 | 0 | 0 | 14 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:14 | 0 | 0 | 7 |
| coupArvnRedeployOptionalTroops | 125 | 342.53 | 2.7402 | 3.8582 | 5.2355 | 15.016 | 94 | 0 | 31 | 94 | 0 | 0 | 88 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:88 | 125 | 0 | 94 |
| assault | 132 | 328.4 | 2.4878 | 4.236 | 6.1715 | 8.5 | 113 | 0 | 19 | 113 | 0 | 0 | 70 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:70 | 132 | 0 | 113 |
| coupRedeployPass | 156 | 287.26 | 1.8414 | 3.156 | 3.5777 | 1 | 85 | 0 | 71 | 85 | 0 | 0 | 0 |  | 156 | 0 | 85 |
| ambushVc | 76 | 283.94 | 3.7361 | 7.5092 | 10.342 | 40.5263 | 65 | 0 | 11 | 65 | 0 | 0 | 0 |  | 76 | 0 | 65 |
| infiltrate | 55 | 275.88 | 5.016 | 9.3174 | 11.2038 | 51.7273 | 36 | 0 | 19 | 36 | 0 | 0 | 0 |  | 55 | 0 | 36 |
| coupPacifyARVN | 122 | 255.07 | 2.0907 | 3.0644 | 3.5783 | 4.541 | 94 | 0 | 28 | 94 | 0 | 0 | 84 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:84 | 122 | 0 | 94 |
| coupCommitmentPass | 156 | 252.3 | 1.6173 | 2.7351 | 3.7173 | 1.25 | 0 | 0 | 156 | 0 | 0 | 0 | 0 |  | 156 | 0 | 0 |
| march | 63 | 220.15 | 3.4944 | 5.6375 | 12.2751 | 21.1746 | 50 | 0 | 13 | 50 | 0 | 0 | 0 |  | 63 | 0 | 50 |
| advise | 57 | 189.75 | 3.3289 | 6.9225 | 7.885 | 11.0175 | 47 | 0 | 10 | 47 | 0 | 0 | 0 |  | 57 | 0 | 47 |
| coupPacifyPass | 78 | 179.85 | 2.3058 | 3.5812 | 3.8349 | 1.5769 | 67 | 0 | 11 | 67 | 0 | 0 | 0 |  | 78 | 0 | 67 |
| coupNvaRedeployTroops | 72 | 141.87 | 1.9705 | 3.4003 | 4.3825 | 3.7222 | 50 | 0 | 22 | 50 | 0 | 0 | 50 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:50 | 72 | 0 | 50 |
| attack | 30 | 96.82 | 3.2275 | 5.8061 | 9.0705 | 32.8667 | 23 | 0 | 7 | 23 | 0 | 0 | 0 |  | 30 | 0 | 23 |
| coupVictoryCheck | 41 | 92.6 | 2.2585 | 3.2524 | 3.5173 | 1 | 41 | 0 | 0 | 41 | 0 | 0 | 0 |  | 41 | 0 | 41 |
| coupResourcesResolve | 39 | 84.43 | 2.1649 | 3.2814 | 4.1908 | 1 | 0 | 0 | 39 | 0 | 0 | 0 | 0 |  | 39 | 0 | 0 |
| assault:chooseOne | 27 | 82.97 | 3.0728 | 7.4414 | 11.8493 | 2 | 0 | 18 | 20 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| train:chooseOne | 13 | 71.03 | 5.4641 | 7.9116 | 7.9116 | 2.2308 | 0 | 44 | 49 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushNva | 8 | 66 | 8.2504 | 34.9322 | 34.9322 | 52.875 | 6 | 0 | 2 | 6 | 0 | 0 | 1 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:1 | 7 | 0 | 6 |
| pass | 21 | 64.6 | 3.0762 | 4.8092 | 4.9393 | 4.0952 | 20 | 0 | 1 | 20 | 0 | 0 | 4 | agent-guided-completion/production-preview-drive.chooseN/only origin-seat greedy chooseN publication is supported:2; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:2 | 21 | 0 | 20 |
| coupAgitatePass | 39 | 64.29 | 1.6484 | 2.3735 | 2.6638 | 4.641 | 0 | 0 | 39 | 0 | 0 | 0 | 0 |  | 39 | 0 | 0 |
| bombard | 6 | 46.31 | 7.718 | 9.2268 | 9.2268 | 122.3333 | 6 | 0 | 0 | 6 | 0 | 0 | 0 |  | 6 | 0 | 6 |
| coupArvnRedeployMandatory | 11 | 24.36 | 2.2144 | 3.4518 | 3.4518 | 10.2727 | 3 | 0 | 8 | 3 | 0 | 0 | 3 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:3 | 11 | 0 | 3 |
| chooseOne:chooseOne | 32 | 23.71 | 0.7409 | 6.329 | 8.1245 | 5.75 | 0 | 9 | 3 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| nvaTransferResources | 4 | 15.72 | 3.929 | 5.1359 | 5.1359 | 47 | 4 | 0 | 0 | 4 | 0 | 0 | 4 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:4 | 4 | 0 | 4 |
| rally:chooseNStep:add | 186 | 11.03 | 0.0593 | 0.0811 | 0.6862 | 22.1183 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| resolveHonoluluPacify | 5 | 9.93 | 1.9852 | 2.7725 | 2.7725 | 1 | 5 | 0 | 0 | 5 | 0 | 0 | 5 | unsupported-effect/production-preview-drive.effect.popInterruptPhase/unsupported production preview-drive effect popInterruptPhase:5 | 5 | 0 | 5 |
| coupNvaRedeployTroops:chooseOne | 263 | 8.9 | 0.0338 | 0.0515 | 0.0768 | 3.981 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally:chooseNStep:confirm | 251 | 7.59 | 0.0302 | 0.0561 | 0.1447 | 17.2351 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| event-decision:chooseNStep:confirm | 129 | 5.8 | 0.0449 | 0.0801 | 1.7083 | 7.7519 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| airStrike | 2 | 5.7 | 2.8499 | 3.2521 | 3.2521 | 2 | 2 | 0 | 0 | 2 | 0 | 0 | 0 |  | 2 | 0 | 2 |
| rally:chooseOne | 190 | 5.35 | 0.0282 | 0.0482 | 0.2443 | 1.3421 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| advise:chooseNStep:add | 57 | 4.78 | 0.0838 | 0.2478 | 0.6677 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| event-decision:chooseOne | 105 | 4.76 | 0.0454 | 0.0932 | 0.615 | 3.8286 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushVc:chooseNStep:add | 73 | 4.4 | 0.0603 | 0.1053 | 0.6955 | 3.6849 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| march:chooseNStep:confirm | 146 | 4.38 | 0.03 | 0.0556 | 0.1304 | 5.5822 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| march:chooseNStep:add | 81 | 4.23 | 0.0522 | 0.0776 | 0.0994 | 15.1852 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| advise:chooseOne | 115 | 3.6 | 0.0313 | 0.0539 | 0.1168 | 2.4435 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate:chooseNStep:add | 55 | 2.96 | 0.0539 | 0.0644 | 0.6131 | 3.9273 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| advise:chooseNStep:confirm | 57 | 2.89 | 0.0508 | 0.0761 | 0.7857 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| sweep | 1 | 2.76 | 2.7557 | 2.7557 | 2.7557 | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 0 |  | 1 | 0 | 0 |
| infiltrate:chooseOne | 86 | 2.46 | 0.0286 | 0.0491 | 0.1298 | 1.5698 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate:chooseNStep:confirm | 82 | 2.12 | 0.0259 | 0.0465 | 0.0561 | 4.622 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushVc:chooseNStep:confirm | 73 | 2.06 | 0.0282 | 0.0623 | 0.1035 | 4.6438 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushVc:chooseOne | 76 | 1.84 | 0.0242 | 0.0666 | 0.0967 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| chooseNStep:chooseNStep:confirm | 16 | 0.66 | 0.041 | 0.0702 | 0.0702 | 15.125 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushNva:chooseOne | 8 | 0.26 | 0.0322 | 0.0479 | 0.0479 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| bombard:chooseNStep:add | 4 | 0.16 | 0.0408 | 0.0461 | 0.0461 | 7.75 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| bombard:chooseOne | 5 | 0.15 | 0.0297 | 0.0342 | 0.0342 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| airStrike:chooseNStep:confirm | 2 | 0.07 | 0.0372 | 0.0397 | 0.0397 | 12.5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| airStrike:chooseOne | 2 | 0.07 | 0.0369 | 0.0383 | 0.0383 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| bombard:chooseNStep:confirm | 4 | 0.07 | 0.0182 | 0.0189 | 0.0189 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushNva:chooseNStep:add | 1 | 0.04 | 0.0373 | 0.0373 | 0.0373 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushNva:chooseNStep:confirm | 1 | 0.02 | 0.0211 | 0.0211 | 0.0211 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |

## Top Hot Axes In Slow-Tier Seeds

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.

| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms |
|---:|---|---|---:|---:|---:|---:|---:|
| 1 | coupArvnRedeployPolice:chooseOne | continuedDeepening | 236 | 26887.27 | 113.9291 | 302.8698 | 430.3042 |
| 2 | govern:chooseNStep:confirm | continuedDeepening | 27 | 19309.53 | 715.1676 | 6598.8885 | 7756.9929 |
| 3 | train:chooseNStep:add | continuedDeepening | 11 | 16289.03 | 1480.8207 | 2955.4769 | 2955.4769 |
| 4 | event | singlePass | 161 | 13497.45 | 83.8351 | 325.8774 | 3157.6584 |
| 5 | govern:chooseNStep:add | continuedDeepening | 43 | 12300.16 | 286.0502 | 299.8107 | 3107.1555 |
| 6 | train:chooseNStep:confirm | continuedDeepening | 12 | 10803.37 | 900.2807 | 2725.2606 | 2725.2606 |
| 7 | coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | 158 | 3747.25 | 23.7168 | 36.5975 | 43.489 |
| 8 | govern | singlePass | 30 | 2950.12 | 98.3373 | 574.265 | 584.7126 |
| 9 | rally | singlePass | 62 | 2220.92 | 35.8213 | 44.4446 | 540.1266 |
| 10 | chooseNStep:chooseNStep:add | continuedDeepening | 2 | 1847.96 | 923.979 | 985.0948 | 985.0948 |

## Hot-Path Buckets For Top Slow Axes

Captured only when `--profile-buckets` is enabled. Buckets are timing/count diagnostics inside `PolicyAgent.chooseDecision`; they are not correctness assertions.

### coupArvnRedeployPolice:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 479298 | 4707.7 |
| evalQuery:countMatchingTokens | 570974 | 702.52 |
| zobrist:digestDecisionStackFrame | 2760 | 151.79 |
| zobrist:encodeDecisionStackFrame | 2760 | 120.3 |
| evalQuery:applyTokenFilterCacheHit | 11054 | 0 |
| evalQuery:countMatchingTokensCacheHit | 13746577 | 0 |
| evalQuery:countMatchingTokensCompiled | 570974 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 36494026 | 0 |
| tokenStateIndex:getCacheHit | 479298 | 0 |
| zobrist:decisionStackFrameEncodedChars | 18395142 | 0 |
| zobrist:decisionStackFrameRunLocalCacheMiss | 2760 | 0 |

### govern:chooseNStep:confirm | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 55244 | 785.04 |
| evalQuery:applyTokenFilter | 375925 | 705.71 |
| evalQuery:countMatchingTokens | 58858 | 56.53 |
| zobrist:encodeDecisionStackFrame | 1240 | 47.74 |
| zobrist:digestDecisionStackFrame | 768 | 39.82 |
| evalQuery:applyTokenFilterCacheHit | 24750 | 0 |
| evalQuery:applyTokenFilterCompiled | 374035 | 0 |
| evalQuery:countMatchingTokensCacheHit | 2293866 | 0 |
| evalQuery:countMatchingTokensCompiled | 15430 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 5231302 | 0 |
| tokenStateIndex:getCacheHit | 396340 | 0 |
| zobrist:decisionStackFrameEncodedChars | 4871612 | 0 |

### train:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 20128 | 3480.62 |
| zobrist:encodeDecisionStackFrame | 20344 | 1966.49 |
| tokenStateIndex:refreshCachedEntries | 8783 | 186.82 |
| evalQuery:applyTokenFilter | 4636 | 16.21 |
| evalQuery:countMatchingTokens | 7500 | 14.87 |
| evalQuery:applyTokenFilterCacheHit | 8929 | 0 |
| evalQuery:applyTokenFilterCompiled | 4636 | 0 |
| evalQuery:countMatchingTokensCacheHit | 975870 | 0 |
| evalQuery:countMatchingTokensCompiled | 7500 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 2335706 | 0 |
| policyWasmStatePatch:reuseAppliedStateHash | 1432 | 0 |
| tokenStateIndex:getCacheHit | 17459 | 0 |

### event | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 64941 | 815.02 |
| evalQuery:applyTokenFilter | 147410 | 366.51 |
| zobrist:digestDecisionStackFrame | 1618 | 294.56 |
| zobrist:encodeDecisionStackFrame | 1618 | 184.85 |
| evalQuery:countMatchingTokens | 186676 | 135.53 |
| policyWasmRuntime:encodeBytecodeInput | 1666 | 48.33 |
| tokenStateIndex:build | 19 | 0.72 |
| evalQuery:applyTokenFilterCacheHit | 22297 | 0 |
| evalQuery:applyTokenFilterCompiled | 112981 | 0 |
| evalQuery:countMatchingTokensCacheHit | 1568517 | 0 |
| evalQuery:countMatchingTokensCompiled | 37844 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 3548449 | 0 |

### govern:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 32467 | 417.45 |
| evalQuery:applyTokenFilter | 162791 | 295.68 |
| zobrist:digestDecisionStackFrame | 4572 | 211.35 |
| zobrist:encodeDecisionStackFrame | 4680 | 170.28 |
| evalQuery:countMatchingTokens | 31654 | 32.75 |
| evalQuery:applyTokenFilterCacheHit | 14081 | 0 |
| evalQuery:applyTokenFilterCompiled | 162071 | 0 |
| evalQuery:countMatchingTokensCacheHit | 1811071 | 0 |
| evalQuery:countMatchingTokensCompiled | 15110 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 4013162 | 0 |
| policyWasmStatePatch:reuseAppliedStateHash | 660 | 0 |
| tokenStateIndex:getCacheHit | 172284 | 0 |

### train:chooseNStep:confirm | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 12646 | 2268.84 |
| zobrist:encodeDecisionStackFrame | 13158 | 1296.52 |
| tokenStateIndex:refreshCachedEntries | 6279 | 122.51 |
| evalQuery:countMatchingTokens | 3549 | 8.54 |
| evalQuery:applyTokenFilter | 1718 | 7.25 |
| evalQuery:applyTokenFilterCacheHit | 7183 | 0 |
| evalQuery:applyTokenFilterCompiled | 1718 | 0 |
| evalQuery:countMatchingTokensCacheHit | 678867 | 0 |
| evalQuery:countMatchingTokensCompiled | 3549 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1661752 | 0 |
| policyWasmStatePatch:reuseAppliedStateHash | 1144 | 0 |
| tokenStateIndex:getCacheHit | 11358 | 0 |

### coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 54878 | 496.49 |
| evalQuery:countMatchingTokens | 87666 | 90.64 |
| zobrist:digestDecisionStackFrame | 848 | 36.92 |
| zobrist:encodeDecisionStackFrame | 848 | 28.62 |
| evalQuery:applyTokenFilterCacheHit | 1728 | 0 |
| evalQuery:countMatchingTokensCacheHit | 2303253 | 0 |
| evalQuery:countMatchingTokensCompiled | 87666 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 5258523 | 0 |
| tokenStateIndex:getCacheHit | 54878 | 0 |
| zobrist:decisionStackFrameEncodedChars | 4511286 | 0 |
| zobrist:decisionStackFrameRunLocalCacheMiss | 848 | 0 |

### govern | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 5415 | 86.17 |
| zobrist:digestDecisionStackFrame | 680 | 75.88 |
| evalQuery:applyTokenFilter | 34387 | 66.35 |
| zobrist:encodeDecisionStackFrame | 680 | 51.58 |
| evalQuery:countMatchingTokens | 7078 | 8.37 |
| policyWasmRuntime:encodeBytecodeInput | 240 | 7.2 |
| evalQuery:applyTokenFilterCacheHit | 12895 | 0 |
| evalQuery:applyTokenFilterCompiled | 28877 | 0 |
| evalQuery:countMatchingTokensCacheHit | 432946 | 0 |
| evalQuery:countMatchingTokensCompiled | 2378 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 826410 | 0 |
| policyWasmRuntime:encodedInputCacheMiss | 240 | 0 |

### rally | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 8327 | 111.11 |
| evalQuery:applyTokenFilter | 18423 | 52.65 |
| zobrist:digestDecisionStackFrame | 352 | 26.59 |
| evalQuery:countMatchingTokens | 23044 | 23.72 |
| zobrist:encodeDecisionStackFrame | 352 | 20.09 |
| policyWasmRuntime:encodeBytecodeInput | 248 | 10.85 |
| tokenStateIndex:build | 4 | 0.11 |
| evalQuery:applyTokenFilterCacheHit | 4861 | 0 |
| evalQuery:applyTokenFilterCompiled | 17831 | 0 |
| evalQuery:countMatchingTokensCacheHit | 622517 | 0 |
| evalQuery:countMatchingTokensCompiled | 8708 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1476058 | 0 |

### chooseNStep:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 11204 | 103.19 |
| zobrist:digestDecisionStackFrame | 968 | 27.94 |
| zobrist:encodeDecisionStackFrame | 1010 | 19.64 |
| evalQuery:applyTokenFilter | 7376 | 9.81 |
| evalQuery:countMatchingTokens | 8002 | 9.65 |
| evalQuery:applyTokenFilterCacheHit | 4194 | 0 |
| evalQuery:applyTokenFilterCompiled | 7376 | 0 |
| evalQuery:countMatchingTokensCacheHit | 1109828 | 0 |
| evalQuery:countMatchingTokensCompiled | 8002 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 2462130 | 0 |
| policyWasmStatePatch:reuseAppliedStateHash | 22 | 0 |
| tokenStateIndex:getCacheHit | 16910 | 0 |


## WASM Preview-Drive Unsupported Reasons

| Microturn class | Unsupported class | Unsupported owner | Reason | Count | Class unsupported total | Class route total |
|---|---|---|---|---:|---:|---:|
| govern:chooseNStep:confirm | unknown | production-deep-choosenstep-continuation.projectedState | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 464 | 464 | 0 |
| event | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 457 | 457 | 0 |
| rally | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 338 | 338 | 0 |
| coupArvnRedeployPolice | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 330 | 330 | 0 |
| govern | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 174 | 174 | 0 |
| govern:chooseNStep:add | unknown | production-deep-choosenstep-continuation.projectedState | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 89 | 89 | 663 |
| coupArvnRedeployOptionalTroops | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 88 | 88 | 0 |
| coupPacifyARVN | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 84 | 84 | 0 |
| assault | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 70 | 70 | 0 |
| coupNvaRedeployTroops | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 50 | 50 | 0 |
| chooseNStep:chooseNStep:add | unknown | production-deep-choosenstep-continuation.projectedState | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 42 | 42 | 44 |
| transport | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 34 | 34 | 0 |
| assault:chooseNStep:add | unknown | production-deep-choosenstep-continuation.projectedState | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 22 | 22 | 53 |
| assault:chooseNStep:confirm | unknown | production-deep-choosenstep-continuation.projectedState | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 20 | 20 | 9 |
| train | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 14 | 14 | 0 |
| event-decision:chooseNStep:add | unknown | production-deep-choosenstep-continuation.projectedState | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 9 | 9 | 81 |
| train:chooseNStep:add | unknown | production-deep-choosenstep-continuation.projectedState | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 7 | 7 | 222 |
| resolveHonoluluPacify | unsupported-effect | production-preview-drive.effect.popInterruptPhase | unsupported production preview-drive effect popInterruptPhase | 5 | 5 | 0 |
| nvaTransferResources | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 4 | 4 | 0 |
| train:chooseNStep:confirm | unknown | production-deep-choosenstep-continuation.projectedState | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 4 | 4 | 155 |
| coupArvnRedeployMandatory | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 3 | 3 | 0 |
| pass | agent-guided-completion | production-preview-drive.chooseN | only origin-seat greedy chooseN publication is supported | 2 | 4 | 0 |
| pass | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 2 | 4 | 0 |
| ambushNva | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 1 | 1 | 0 |

## Fast-Tier vs Slow-Tier Delta

Fast tier: `1000`, `1006`, `1007`, `1010`, `1014`. Rows with ratio greater than `3.0` satisfy the Phase 0 hot-axis criterion.

| Microturn class | Slow decisions | Fast decisions | Slow mean ms | Fast mean ms | Slow:fast ratio | Verdict |
|---|---:|---:|---:|---:|---:|---|
| assault:chooseNStep:confirm | 28 | 27 | 55.2481 | 4.6881 | 11.7848 | hot axis |
| ambushNva | 3 | 4 | 15.1828 | 3.7527 | 4.0458 | hot axis |
| assault:chooseNStep:add | 16 | 16 | 99.0374 | 39.2282 | 2.5246 |  |
| govern:chooseNStep:confirm | 35 | 32 | 551.7206 | 262.8857 | 2.0987 |  |
| bombard | 4 | 1 | 8.6196 | 5.1193 | 1.6837 |  |
| event-decision:chooseNStep:confirm | 57 | 41 | 0.0613 | 0.0369 | 1.6612 |  |
| attack | 20 | 4 | 3.6275 | 2.2026 | 1.6469 |  |
| nvaTransferResources | 1 | 1 | 3.4958 | 2.4106 | 1.4502 |  |
| airStrike | 1 | 1 | 3.2521 | 2.4476 | 1.3287 |  |
| ambushNva:chooseOne | 3 | 4 | 0.0376 | 0.0291 | 1.2921 |  |
| rally | 68 | 60 | 32.9196 | 25.9385 | 1.2691 |  |
| event-decision:chooseNStep:add | 84 | 43 | 20.7096 | 16.5199 | 1.2536 |  |
| govern | 40 | 32 | 74.6494 | 62.4708 | 1.1949 |  |
| coupVictoryCheck | 15 | 14 | 2.5064 | 2.1195 | 1.1825 |  |
| march | 19 | 22 | 3.6523 | 3.1344 | 1.1652 |  |
| rally:chooseOne | 71 | 63 | 0.0302 | 0.0263 | 1.1483 |  |
| advise:chooseNStep:add | 19 | 21 | 0.0967 | 0.0848 | 1.1403 |  |
| rally:chooseNStep:confirm | 84 | 85 | 0.0336 | 0.0297 | 1.1313 |  |
| coupArvnRedeployPolice:chooseOne | 236 | 197 | 113.9291 | 100.8671 | 1.1295 |  |
| event | 161 | 121 | 83.8351 | 74.4008 | 1.1268 |  |
| march:chooseNStep:add | 26 | 31 | 0.056 | 0.0497 | 1.1268 |  |
| coupNvaRedeployTroops | 39 | 6 | 1.9235 | 1.7212 | 1.1175 |  |
| advise:chooseOne | 38 | 43 | 0.0342 | 0.0309 | 1.1068 |  |
| infiltrate | 25 | 18 | 5.5982 | 5.0885 | 1.1002 |  |
| govern:chooseOne | 48 | 33 | 3.612 | 3.3008 | 1.0943 |  |
| infiltrate:chooseOne | 38 | 31 | 0.0299 | 0.0274 | 1.0912 |  |
| assault | 53 | 42 | 2.585 | 2.4075 | 1.0737 |  |
| advise:chooseNStep:confirm | 19 | 21 | 0.0396 | 0.0378 | 1.0476 |  |
| ambushVc:chooseNStep:confirm | 33 | 19 | 0.0279 | 0.0267 | 1.0449 |  |
| chooseNStep:chooseNStep:confirm | 7 | 4 | 0.0401 | 0.0385 | 1.0416 |  |
| advise | 19 | 21 | 3.3594 | 3.2273 | 1.0409 |  |
| coupArvnRedeployPolice | 127 | 118 | 2.0773 | 1.9994 | 1.039 |  |
| pass | 8 | 6 | 2.8966 | 2.8002 | 1.0344 |  |
| rally:chooseNStep:add | 69 | 62 | 0.0636 | 0.0619 | 1.0275 |  |
| coupRedeployPass | 60 | 48 | 1.8313 | 1.7958 | 1.0198 |  |
| coupCommitmentPass | 60 | 48 | 1.6132 | 1.5887 | 1.0154 |  |
| coupArvnRedeployOptionalTroops:chooseOne | 158 | 117 | 23.7168 | 23.4324 | 1.0121 |  |
| march:chooseNStep:confirm | 45 | 49 | 0.0327 | 0.0324 | 1.0093 |  |
| transport | 6 | 8 | 43.0335 | 43.1798 | 0.9966 |  |
| coupResourcesResolve | 15 | 12 | 2.0984 | 2.1292 | 0.9855 |  |
| coupNvaRedeployTroops:chooseOne | 138 | 17 | 0.0342 | 0.0352 | 0.9716 |  |
| coupAgitatePass | 15 | 12 | 1.5431 | 1.6123 | 0.9571 |  |
| infiltrate:chooseNStep:confirm | 39 | 24 | 0.0258 | 0.027 | 0.9556 |  |
| coupPacifyPass | 30 | 24 | 2.2529 | 2.3722 | 0.9497 |  |
| coupArvnRedeployMandatory:chooseOne | 11 | 26 | 23.1486 | 24.9577 | 0.9275 |  |
| airStrike:chooseOne | 1 | 1 | 0.0355 | 0.0383 | 0.9269 |  |
| coupPacifyARVN | 44 | 38 | 1.9799 | 2.1737 | 0.9108 |  |
| ambushVc | 33 | 22 | 3.5928 | 3.9527 | 0.9089 |  |
| coupArvnRedeployOptionalTroops | 46 | 36 | 2.5806 | 2.8507 | 0.9053 |  |
| airStrike:chooseNStep:confirm | 1 | 1 | 0.0347 | 0.0397 | 0.8741 |  |
| transport:chooseOne | 12 | 16 | 41.4005 | 48.5151 | 0.8534 |  |
| resolveHonoluluPacify | 1 | 2 | 1.6145 | 1.9534 | 0.8265 |  |
| ambushVc:chooseOne | 33 | 22 | 0.0203 | 0.0252 | 0.8056 |  |
| coupArvnRedeployMandatory | 3 | 5 | 2.0338 | 2.5297 | 0.804 |  |
| govern:chooseNStep:add | 43 | 33 | 286.0502 | 386.8071 | 0.7395 |  |
| event-decision:chooseOne | 58 | 24 | 0.0408 | 0.0599 | 0.6811 |  |
| infiltrate:chooseNStep:add | 25 | 18 | 0.0454 | 0.073 | 0.6219 |  |
| chooseOne:chooseOne | 12 | 9 | 0.5641 | 0.9494 | 0.5942 |  |
| assault:chooseOne | 7 | 11 | 2.14 | 4.055 | 0.5277 |  |
| ambushVc:chooseNStep:add | 33 | 19 | 0.0427 | 0.0815 | 0.5239 |  |

## Notes

- `elapsedMs` is measured around the per-decision `PolicyAgent.chooseDecision` call. It excludes simulator apply/delta work and report rendering.
- Child processes enforce the per-seed timeout. Each child loads the built engine and production FITL GameSpecDoc, using the repo GameDef cache when available.
- The script does not modify engine source or production profile data.
