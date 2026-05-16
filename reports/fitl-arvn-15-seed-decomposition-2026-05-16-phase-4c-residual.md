# FITL ARVN 15-Seed Per-Microturn-Class Decomposition

**Date**: 2026-05-16-phase-4c-residual
**Status**: Spec 173 measurement witness.
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 400000 --date 2026-05-16-phase-4c-residual --profile-buckets`
**CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4c-residual.csv`

## Summary

- Seeds completed: 15/15
- Per-decision rows: 6381
- Hot class with slow:fast ratio >3x: yes
- Per-seed timeout: 400000 ms
- Hot-path buckets: enabled
- WASM production preview-drive route count: 181
- WASM production preview-drive unsupported count: 3394
- WASM production preview-drive batch count: 1712

## Per-Seed Wall Time

| Seed | Status | Stop Reason | Wall ms | Decisions | ms/decision | Error |
|---:|---|---|---:|---:|---:|---|
| 1000 | OK | terminal | 69655.76 | 427 | 163.1282 |  |
| 1001 | OK | terminal | 7777.7 | 177 | 43.9418 |  |
| 1002 | OK | terminal | 14997.16 | 299 | 50.1577 |  |
| 1003 | OK | terminal | 8804.36 | 210 | 41.9255 |  |
| 1004 | OK | terminal | 19353.75 | 476 | 40.6591 |  |
| 1005 | OK | terminal | 101783.04 | 790 | 128.8393 |  |
| 1006 | OK | noLegalMoves | 8203.63 | 231 | 35.5135 |  |
| 1007 | OK | terminal | 14397.39 | 290 | 49.6462 |  |
| 1008 | OK | terminal | 61390.41 | 679 | 90.413 |  |
| 1009 | OK | terminal | 15689.41 | 296 | 53.0048 |  |
| 1010 | OK | terminal | 39373.25 | 582 | 67.6516 |  |
| 1011 | OK | terminal | 78105.03 | 473 | 165.1269 |  |
| 1012 | OK | terminal | 106052.63 | 823 | 128.861 |  |
| 1013 | OK | terminal | 9923.65 | 265 | 37.4477 |  |
| 1014 | OK | noLegalMoves | 48444.67 | 363 | 133.4564 |  |

## Per-Microturn-Class Rollup

| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | WASM preview-drive routes | WASM preview-drive unsupported | WASM preview-drive unsupported reasons | WASM preview-drive batches | Token index builds | Static rebuilds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|
| coupArvnRedeployPolice:chooseOne | 617 | 278705.94 | 451.7114 | 2200.7095 | 3233.2307 | 29.3906 | 0 | 427381 | 15311 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| govern:chooseNStep:add | 133 | 42905.47 | 322.5975 | 653.0531 | 4859.3264 | 6.0376 | 0 | 4329 | 6126 | 0 | 0 | 0 | 759 | agent-guided-completion/production-deep-choosenstep-continuation.pickInnerDecision/deep preview-drive selected a non-chooseNStep continuation decision:667; unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:92 | 0 | 0 | 0 |
| govern:chooseNStep:confirm | 111 | 41219.77 | 371.3492 | 444.6997 | 7865.2522 | 6.3784 | 0 | 2231 | 1017 | 0 | 0 | 0 | 464 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:464 | 0 | 0 | 0 |
| event | 404 | 37701.38 | 93.3203 | 170.0763 | 4044.6333 | 24.2327 | 404 | 0 | 0 | 404 | 354 | 0 | 457 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:457 | 0 | 39 | 434 |
| coupArvnRedeployOptionalTroops:chooseOne | 405 | 34117.37 | 84.2404 | 216.0709 | 277.0195 | 8.2667 | 0 | 37399 | 5200 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| train:chooseNStep:add | 15 | 27929.25 | 1861.95 | 3587.8804 | 3587.8804 | 16.0667 | 0 | 11519 | 15743 | 0 | 0 | 2 | 227 | agent-guided-completion/production-deep-choosenstep-continuation.pickInnerDecision/deep preview-drive selected a non-chooseNStep continuation decision:220; unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:7 | 0 | 572 | 0 |
| train:chooseNStep:confirm | 21 | 18688.5 | 889.9288 | 3395.1911 | 3479.6537 | 9.2857 | 0 | 7263 | 9876 | 0 | 0 | 12 | 147 | agent-guided-completion/production-deep-choosenstep-continuation.pickInnerDecision/deep preview-drive selected a non-chooseNStep continuation decision:143; unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:4 | 0 | 536 | 0 |
| govern | 118 | 10220.28 | 86.6125 | 210.385 | 2439.7169 | 10.2797 | 115 | 0 | 3 | 115 | 104 | 0 | 176 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:176 | 30 | 0 | 115 |
| rally | 183 | 5758.55 | 31.4675 | 55.6197 | 585.0523 | 22.3443 | 174 | 0 | 9 | 174 | 52 | 0 | 338 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:338 | 14 | 10 | 174 |
| chooseNStep:chooseNStep:add | 6 | 4224.91 | 704.1518 | 1131.4851 | 1131.4851 | 22 | 0 | 254 | 928 | 0 | 0 | 44 | 42 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:42 | 0 | 1701 | 0 |
| assault:chooseNStep:add | 59 | 4090.14 | 69.3244 | 227.2233 | 949.1178 | 2.4576 | 0 | 284 | 222 | 0 | 0 | 16 | 57 | agent-guided-completion/production-deep-choosenstep-continuation.pickInnerDecision/deep preview-drive selected a non-chooseNStep continuation decision:39; unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:18 | 0 | 479 | 0 |
| coupArvnRedeployMandatory:chooseOne | 49 | 3880.4 | 79.1918 | 139.0841 | 151.8335 | 8 | 0 | 5271 | 753 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| transport:chooseOne | 34 | 3090.63 | 90.9008 | 183.5772 | 347.9531 | 15.2941 | 0 | 1898 | 81 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| event-decision:chooseNStep:add | 157 | 3085.49 | 19.6528 | 226.9546 | 469.7682 | 17.4713 | 0 | 294 | 1341 | 0 | 0 | 81 | 9 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:9 | 0 | 2001 | 0 |
| sweep:chooseNStep:confirm | 3 | 2839.52 | 946.5082 | 1824.2789 | 1824.2789 | 7.6667 | 0 | 557 | 346 | 0 | 0 | 19 | 0 |  | 0 | 1369 | 0 |
| assault:chooseNStep:confirm | 93 | 2274.62 | 24.4583 | 57.9543 | 1229.893 | 2.3226 | 0 | 100 | 75 | 0 | 0 | 0 | 30 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:21; agent-guided-completion/production-deep-choosenstep-continuation.pickInnerDecision/deep preview-drive selected a non-chooseNStep continuation decision:9 | 0 | 36 | 0 |
| sweep:chooseNStep:add | 1 | 1520.71 | 1520.7125 | 1520.7125 | 1520.7125 | 7 | 0 | 328 | 162 | 0 | 0 | 7 | 0 |  | 0 | 1040 | 0 |
| transport | 17 | 1467.12 | 86.3013 | 514.8949 | 514.8949 | 10.4118 | 17 | 0 | 0 | 17 | 0 | 0 | 34 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:34 | 0 | 0 | 17 |
| coupArvnRedeployPolice | 369 | 766.85 | 2.0782 | 3.1367 | 4.3566 | 6.832 | 369 | 0 | 0 | 369 | 0 | 0 | 330 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:330 | 369 | 0 | 369 |
| govern:chooseOne | 140 | 503.54 | 3.5967 | 5.2661 | 9.0109 | 2 | 0 | 184 | 184 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| train | 7 | 500.78 | 71.5401 | 176.8523 | 176.8523 | 8.8571 | 7 | 0 | 0 | 7 | 0 | 0 | 14 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:14 | 0 | 0 | 7 |
| coupArvnRedeployOptionalTroops | 125 | 347.49 | 2.7799 | 4.0579 | 6.1265 | 15.016 | 94 | 0 | 31 | 94 | 0 | 0 | 88 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:88 | 125 | 0 | 94 |
| assault | 131 | 313.07 | 2.3899 | 3.7879 | 4.4995 | 8.5649 | 112 | 0 | 19 | 112 | 0 | 0 | 71 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:71 | 131 | 0 | 112 |
| coupRedeployPass | 156 | 298.43 | 1.913 | 3.129 | 3.5649 | 1 | 85 | 0 | 71 | 85 | 0 | 0 | 0 |  | 156 | 0 | 85 |
| infiltrate | 54 | 279.68 | 5.1792 | 10.3167 | 14.82 | 51.6481 | 35 | 0 | 19 | 35 | 0 | 0 | 0 |  | 54 | 0 | 35 |
| ambushVc | 76 | 274.86 | 3.6166 | 6.2805 | 7.8066 | 40.5263 | 65 | 0 | 11 | 65 | 0 | 0 | 0 |  | 76 | 0 | 65 |
| coupPacifyARVN | 122 | 266.93 | 2.1879 | 3.2671 | 3.9629 | 4.541 | 94 | 0 | 28 | 94 | 0 | 0 | 84 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:84 | 122 | 0 | 94 |
| coupCommitmentPass | 156 | 243.96 | 1.5639 | 2.7845 | 3.4204 | 1.25 | 0 | 0 | 156 | 0 | 0 | 0 | 0 |  | 156 | 0 | 0 |
| march | 65 | 220.99 | 3.3999 | 5.257 | 6.9803 | 21.4462 | 52 | 0 | 13 | 52 | 0 | 0 | 0 |  | 65 | 0 | 52 |
| advise | 57 | 190.83 | 3.3478 | 6.7561 | 7.2473 | 11.0877 | 47 | 0 | 10 | 47 | 0 | 0 | 0 |  | 57 | 0 | 47 |
| coupPacifyPass | 78 | 187.41 | 2.4027 | 4.2675 | 4.6853 | 1.5769 | 67 | 0 | 11 | 67 | 0 | 0 | 0 |  | 78 | 0 | 67 |
| coupNvaRedeployTroops | 72 | 138.53 | 1.9241 | 3.0773 | 5.3058 | 3.7222 | 50 | 0 | 22 | 50 | 0 | 0 | 50 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:50 | 72 | 0 | 50 |
| train:chooseOne | 13 | 98.3 | 7.5615 | 13.3969 | 13.3969 | 2.2308 | 0 | 44 | 49 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| coupVictoryCheck | 41 | 95.56 | 2.3308 | 3.4616 | 3.6484 | 1 | 41 | 0 | 0 | 41 | 0 | 0 | 0 |  | 41 | 0 | 41 |
| attack | 30 | 91.39 | 3.0462 | 4.7386 | 8.8173 | 32.8667 | 23 | 0 | 7 | 23 | 0 | 0 | 0 |  | 30 | 0 | 23 |
| coupResourcesResolve | 39 | 88.07 | 2.2583 | 3.5233 | 3.9698 | 1 | 0 | 0 | 39 | 0 | 0 | 0 | 0 |  | 39 | 0 | 0 |
| assault:chooseOne | 27 | 84.89 | 3.1442 | 7.3049 | 18.8017 | 2 | 0 | 18 | 20 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| pass | 23 | 70.72 | 3.0746 | 4.6004 | 6.4555 | 3.8261 | 21 | 0 | 2 | 21 | 0 | 0 | 4 | agent-guided-completion/production-preview-drive.chooseN/only origin-seat greedy chooseN publication is supported:2; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:2 | 23 | 0 | 21 |
| coupAgitatePass | 39 | 64.83 | 1.6624 | 2.8002 | 2.8146 | 4.641 | 0 | 0 | 39 | 0 | 0 | 0 | 0 |  | 39 | 0 | 0 |
| ambushNva | 7 | 57.67 | 8.2385 | 28.4278 | 28.4278 | 60.2857 | 5 | 0 | 2 | 5 | 0 | 0 | 1 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:1 | 6 | 0 | 5 |
| bombard | 6 | 48.56 | 8.0931 | 10.6279 | 10.6279 | 122.3333 | 6 | 0 | 0 | 6 | 0 | 0 | 0 |  | 6 | 0 | 6 |
| coupArvnRedeployMandatory | 11 | 25.84 | 2.3488 | 4.2009 | 4.2009 | 10.2727 | 3 | 0 | 8 | 3 | 0 | 0 | 3 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:3 | 11 | 0 | 3 |
| chooseOne:chooseOne | 32 | 22.27 | 0.6959 | 4.8502 | 8.394 | 5.75 | 0 | 9 | 3 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| nvaTransferResources | 4 | 13.39 | 3.3479 | 3.8913 | 3.8913 | 47 | 4 | 0 | 0 | 4 | 0 | 0 | 4 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:4 | 4 | 0 | 4 |
| rally:chooseNStep:add | 186 | 11.34 | 0.0609 | 0.086 | 0.6089 | 22.129 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| coupNvaRedeployTroops:chooseOne | 263 | 11.08 | 0.0421 | 0.0586 | 1.1846 | 3.981 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| resolveHonoluluPacify | 5 | 8.47 | 1.693 | 1.9507 | 1.9507 | 1 | 5 | 0 | 0 | 5 | 0 | 0 | 5 | unsupported-effect/production-preview-drive.effect.popInterruptPhase/unsupported production preview-drive effect popInterruptPhase:5 | 5 | 0 | 5 |
| rally:chooseNStep:confirm | 251 | 8.44 | 0.0336 | 0.0634 | 0.1276 | 17.243 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| march:chooseNStep:confirm | 149 | 6.78 | 0.0455 | 0.0708 | 1.2396 | 5.5436 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally:chooseOne | 190 | 6.29 | 0.0331 | 0.0728 | 0.1603 | 1.3474 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| airStrike | 2 | 6.24 | 3.1204 | 3.7581 | 3.7581 | 2 | 2 | 0 | 0 | 2 | 0 | 0 | 0 |  | 2 | 0 | 2 |
| event-decision:chooseOne | 105 | 5.29 | 0.0504 | 0.0636 | 0.676 | 3.8381 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| march:chooseNStep:add | 82 | 4.89 | 0.0596 | 0.0912 | 0.1027 | 15.6098 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| advise:chooseNStep:add | 57 | 4.85 | 0.085 | 0.2112 | 0.7407 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| advise:chooseOne | 115 | 4.58 | 0.0398 | 0.0727 | 0.1274 | 2.4522 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| event-decision:chooseNStep:confirm | 129 | 4.55 | 0.0352 | 0.0587 | 0.1663 | 7.7519 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushVc:chooseNStep:add | 73 | 4.3 | 0.0589 | 0.0644 | 0.6181 | 3.6849 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate:chooseNStep:add | 54 | 2.99 | 0.0553 | 0.0752 | 0.5832 | 3.9259 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate:chooseOne | 84 | 2.95 | 0.0351 | 0.0638 | 0.1636 | 1.5833 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate:chooseNStep:confirm | 81 | 2.55 | 0.0315 | 0.0576 | 0.0926 | 4.6173 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| advise:chooseNStep:confirm | 57 | 2.5 | 0.0439 | 0.0817 | 0.0937 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushVc:chooseNStep:confirm | 73 | 2.22 | 0.0304 | 0.0597 | 0.1032 | 4.6438 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushVc:chooseOne | 76 | 2.06 | 0.0271 | 0.0545 | 0.1248 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| sweep | 1 | 2 | 2.0035 | 2.0035 | 2.0035 | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 0 |  | 1 | 0 | 0 |
| chooseNStep:chooseNStep:confirm | 16 | 0.71 | 0.0442 | 0.089 | 0.089 | 15.125 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushNva:chooseOne | 7 | 0.22 | 0.031 | 0.0406 | 0.0406 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| bombard:chooseNStep:add | 4 | 0.19 | 0.0484 | 0.0622 | 0.0622 | 7.75 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| bombard:chooseOne | 5 | 0.16 | 0.0325 | 0.0374 | 0.0374 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| bombard:chooseNStep:confirm | 4 | 0.11 | 0.0285 | 0.0333 | 0.0333 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| airStrike:chooseNStep:confirm | 2 | 0.09 | 0.0459 | 0.0507 | 0.0507 | 12.5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| airStrike:chooseOne | 2 | 0.09 | 0.0451 | 0.0502 | 0.0502 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushNva:chooseNStep:add | 1 | 0.04 | 0.0367 | 0.0367 | 0.0367 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushNva:chooseNStep:confirm | 1 | 0.02 | 0.0208 | 0.0208 | 0.0208 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |

## Top Hot Axes In Slow-Tier Seeds

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.

| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms |
|---:|---|---|---:|---:|---:|---:|---:|
| 1 | coupArvnRedeployPolice:chooseOne | continuedDeepening | 236 | 129057.88 | 546.8554 | 2306.8512 | 2844.7876 |
| 2 | govern:chooseNStep:confirm | continuedDeepening | 27 | 19965.94 | 739.4792 | 6949.0294 | 7865.2522 |
| 3 | train:chooseNStep:add | continuedDeepening | 11 | 17303.88 | 1573.0801 | 3337.3089 | 3337.3089 |
| 4 | event | singlePass | 161 | 14649.59 | 90.9912 | 336.0129 | 3114.7791 |
| 5 | govern:chooseNStep:add | continuedDeepening | 45 | 14365.03 | 319.2229 | 380.67 | 3456.9627 |
| 6 | coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | 158 | 13995.86 | 88.5814 | 215.5048 | 267.1846 |
| 7 | train:chooseNStep:confirm | continuedDeepening | 12 | 11689.26 | 974.105 | 3202.6545 | 3202.6545 |
| 8 | govern | singlePass | 31 | 3500.92 | 112.9329 | 618.7031 | 639.0527 |
| 9 | rally | singlePass | 62 | 2432.45 | 39.2331 | 65.7506 | 585.0523 |
| 10 | chooseNStep:chooseNStep:add | continuedDeepening | 2 | 2169.19 | 1084.5937 | 1131.4851 | 1131.4851 |

## Hot-Path Buckets For Top Slow Axes

Captured only when `--profile-buckets` is enabled. Buckets are timing/count diagnostics inside `PolicyAgent.chooseDecision`; they are not correctness assertions.

### coupArvnRedeployPolice:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 5033698 | 23099.7 |
| evalQuery:countMatchingTokens | 5438222 | 8391.55 |
| zobrist:digestDecisionStackFrame | 2760 | 151.39 |
| zobrist:encodeDecisionStackFrame | 2760 | 131.46 |
| evalQuery:applyTokenFilterCacheHit | 396588 | 0 |
| evalQuery:countMatchingTokensCacheHit | 127279270 | 0 |
| evalQuery:countMatchingTokensCompiled | 5438222 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 388864129 | 0 |
| tokenStateIndex:getCacheHit | 5033698 | 0 |
| zobrist:decisionStackFrameEncodedChars | 18395142 | 0 |
| zobrist:decisionStackFrameRunLocalCacheMiss | 2760 | 0 |

### govern:chooseNStep:confirm | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 55244 | 872.67 |
| evalQuery:applyTokenFilter | 375925 | 751.56 |
| evalQuery:countMatchingTokens | 58858 | 54.6 |
| zobrist:encodeDecisionStackFrame | 1240 | 52.47 |
| zobrist:digestDecisionStackFrame | 768 | 39.68 |
| evalQuery:applyTokenFilterCacheHit | 24750 | 0 |
| evalQuery:applyTokenFilterCompiled | 374035 | 0 |
| evalQuery:countMatchingTokensCacheHit | 2328454 | 0 |
| evalQuery:countMatchingTokensCompiled | 15430 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 5335342 | 0 |
| tokenStateIndex:getCacheHit | 396340 | 0 |
| zobrist:decisionStackFrameEncodedChars | 4871612 | 0 |

### train:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 20128 | 3487.83 |
| zobrist:encodeDecisionStackFrame | 21059 | 2068.17 |
| tokenStateIndex:refreshCachedEntries | 19885 | 401.53 |
| evalQuery:applyTokenFilter | 8906 | 36.77 |
| evalQuery:countMatchingTokens | 11727 | 27.02 |
| tokenStateIndex:build | 388 | 18.35 |
| evalQuery:applyTokenFilterCacheHit | 20424 | 0 |
| evalQuery:applyTokenFilterCompiled | 8906 | 0 |
| evalQuery:countMatchingTokensCacheHit | 2010742 | 0 |
| evalQuery:countMatchingTokensCompiled | 11727 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 5421379 | 0 |
| tokenStateIndex:getCacheHit | 29600 | 0 |

### event | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 67396 | 896.85 |
| evalQuery:applyTokenFilter | 153416 | 450 |
| zobrist:digestDecisionStackFrame | 1616 | 291.74 |
| zobrist:encodeDecisionStackFrame | 1616 | 178.87 |
| evalQuery:countMatchingTokens | 192736 | 143.58 |
| policyWasmRuntime:encodeBytecodeInput | 1664 | 50.75 |
| tokenStateIndex:build | 19 | 0.74 |
| evalQuery:applyTokenFilterCacheHit | 26415 | 0 |
| evalQuery:applyTokenFilterCompiled | 117635 | 0 |
| evalQuery:countMatchingTokensCacheHit | 2402280 | 0 |
| evalQuery:countMatchingTokensCompiled | 38640 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 5043580 | 0 |

### govern:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 33053 | 455.62 |
| evalQuery:applyTokenFilter | 163743 | 327.35 |
| zobrist:encodeDecisionStackFrame | 5880 | 225.57 |
| zobrist:digestDecisionStackFrame | 4640 | 215.56 |
| evalQuery:countMatchingTokens | 32009 | 32.94 |
| evalQuery:applyTokenFilterCacheHit | 14334 | 0 |
| evalQuery:applyTokenFilterCompiled | 163023 | 0 |
| evalQuery:countMatchingTokensCacheHit | 2099635 | 0 |
| evalQuery:countMatchingTokensCompiled | 15465 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 4815503 | 0 |
| tokenStateIndex:getCacheHit | 173890 | 0 |
| zobrist:decisionStackFrameEncodedChars | 26183445 | 0 |

### coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 449214 | 2083.86 |
| evalQuery:countMatchingTokens | 564266 | 679.61 |
| zobrist:digestDecisionStackFrame | 848 | 37.6 |
| zobrist:encodeDecisionStackFrame | 848 | 36.41 |
| evalQuery:applyTokenFilterCacheHit | 33368 | 0 |
| evalQuery:countMatchingTokensCacheHit | 17719717 | 0 |
| evalQuery:countMatchingTokensCompiled | 564266 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 40968401 | 0 |
| tokenStateIndex:getCacheHit | 449214 | 0 |
| zobrist:decisionStackFrameEncodedChars | 4511286 | 0 |
| zobrist:decisionStackFrameRunLocalCacheMiss | 848 | 0 |

### train:chooseNStep:confirm | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 12646 | 2259.76 |
| zobrist:encodeDecisionStackFrame | 13628 | 1418.77 |
| tokenStateIndex:refreshCachedEntries | 14324 | 283.73 |
| evalQuery:applyTokenFilter | 4528 | 16.02 |
| evalQuery:countMatchingTokens | 6232 | 14.52 |
| tokenStateIndex:build | 386 | 14.46 |
| evalQuery:applyTokenFilterCacheHit | 20714 | 0 |
| evalQuery:applyTokenFilterCompiled | 4528 | 0 |
| evalQuery:countMatchingTokensCacheHit | 1690423 | 0 |
| evalQuery:countMatchingTokensCompiled | 6232 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 4573840 | 0 |
| tokenStateIndex:getCacheHit | 20141 | 0 |

### govern | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 6313 | 104.58 |
| evalQuery:applyTokenFilter | 36038 | 98.98 |
| zobrist:digestDecisionStackFrame | 708 | 77.08 |
| zobrist:encodeDecisionStackFrame | 708 | 55.07 |
| evalQuery:countMatchingTokens | 12416 | 12.93 |
| policyWasmRuntime:encodeBytecodeInput | 248 | 7.65 |
| evalQuery:applyTokenFilterCacheHit | 17709 | 0 |
| evalQuery:applyTokenFilterCompiled | 30088 | 0 |
| evalQuery:countMatchingTokensCacheHit | 626069 | 0 |
| evalQuery:countMatchingTokensCompiled | 2452 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1117084 | 0 |
| policyWasmRuntime:encodedInputCacheMiss | 248 | 0 |

### rally | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 9833 | 134 |
| evalQuery:applyTokenFilter | 20386 | 80.13 |
| zobrist:digestDecisionStackFrame | 352 | 26.44 |
| evalQuery:countMatchingTokens | 26990 | 22.02 |
| zobrist:encodeDecisionStackFrame | 352 | 18.95 |
| policyWasmRuntime:encodeBytecodeInput | 248 | 13.14 |
| tokenStateIndex:build | 4 | 0.1 |
| evalQuery:applyTokenFilterCacheHit | 6016 | 0 |
| evalQuery:applyTokenFilterCompiled | 19224 | 0 |
| evalQuery:countMatchingTokensCacheHit | 922763 | 0 |
| evalQuery:countMatchingTokensCompiled | 9458 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 2159203 | 0 |

### chooseNStep:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 11204 | 86.84 |
| zobrist:digestDecisionStackFrame | 968 | 28.02 |
| tokenStateIndex:build | 1198 | 27.75 |
| zobrist:encodeDecisionStackFrame | 1010 | 21.09 |
| evalQuery:applyTokenFilter | 7376 | 11.65 |
| evalQuery:countMatchingTokens | 8002 | 11.57 |
| evalQuery:applyTokenFilterCacheHit | 4194 | 0 |
| evalQuery:applyTokenFilterCompiled | 7376 | 0 |
| evalQuery:countMatchingTokensCacheHit | 1109828 | 0 |
| evalQuery:countMatchingTokensCompiled | 8002 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 2462130 | 0 |
| tokenStateIndex:getCacheHit | 15712 | 0 |


## WASM Preview-Drive Unsupported Reasons

| Microturn class | Unsupported class | Unsupported owner | Reason | Count | Class unsupported total | Class route total |
|---|---|---|---|---:|---:|---:|
| govern:chooseNStep:add | agent-guided-completion | production-deep-choosenstep-continuation.pickInnerDecision | deep preview-drive selected a non-chooseNStep continuation decision | 667 | 759 | 0 |
| govern:chooseNStep:confirm | unknown | production-deep-choosenstep-continuation.projectedState | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 464 | 464 | 0 |
| event | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 457 | 457 | 0 |
| rally | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 338 | 338 | 0 |
| coupArvnRedeployPolice | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 330 | 330 | 0 |
| train:chooseNStep:add | agent-guided-completion | production-deep-choosenstep-continuation.pickInnerDecision | deep preview-drive selected a non-chooseNStep continuation decision | 220 | 227 | 2 |
| govern | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 176 | 176 | 0 |
| train:chooseNStep:confirm | agent-guided-completion | production-deep-choosenstep-continuation.pickInnerDecision | deep preview-drive selected a non-chooseNStep continuation decision | 143 | 147 | 12 |
| govern:chooseNStep:add | unknown | production-deep-choosenstep-continuation.projectedState | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 92 | 759 | 0 |
| coupArvnRedeployOptionalTroops | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 88 | 88 | 0 |
| coupPacifyARVN | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 84 | 84 | 0 |
| assault | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 71 | 71 | 0 |
| coupNvaRedeployTroops | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 50 | 50 | 0 |
| chooseNStep:chooseNStep:add | unknown | production-deep-choosenstep-continuation.projectedState | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 42 | 42 | 44 |
| assault:chooseNStep:add | agent-guided-completion | production-deep-choosenstep-continuation.pickInnerDecision | deep preview-drive selected a non-chooseNStep continuation decision | 39 | 57 | 16 |
| transport | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 34 | 34 | 0 |
| assault:chooseNStep:confirm | unknown | production-deep-choosenstep-continuation.projectedState | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 21 | 30 | 0 |
| assault:chooseNStep:add | unknown | production-deep-choosenstep-continuation.projectedState | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 18 | 57 | 16 |
| train | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 14 | 14 | 0 |
| assault:chooseNStep:confirm | agent-guided-completion | production-deep-choosenstep-continuation.pickInnerDecision | deep preview-drive selected a non-chooseNStep continuation decision | 9 | 30 | 0 |
| event-decision:chooseNStep:add | unknown | production-deep-choosenstep-continuation.projectedState | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 9 | 9 | 81 |
| train:chooseNStep:add | unknown | production-deep-choosenstep-continuation.projectedState | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 7 | 227 | 2 |
| resolveHonoluluPacify | unsupported-effect | production-preview-drive.effect.popInterruptPhase | unsupported production preview-drive effect popInterruptPhase | 5 | 5 | 0 |
| nvaTransferResources | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 4 | 4 | 0 |
| train:chooseNStep:confirm | unknown | production-deep-choosenstep-continuation.projectedState | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 4 | 147 | 12 |
| coupArvnRedeployMandatory | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 3 | 3 | 0 |
| pass | agent-guided-completion | production-preview-drive.chooseN | only origin-seat greedy chooseN publication is supported | 2 | 4 | 0 |
| pass | unsupported-effect | production-preview-drive.actionBatch | production preview-drive requires deterministic shared scalar runtime bindings | 2 | 4 | 0 |
| ambushNva | unsupported-effect | production-preview-drive.cardEventAction | production preview-drive does not route card event action candidates | 1 | 1 | 0 |

## Fast-Tier vs Slow-Tier Delta

Fast tier: `1000`, `1006`, `1007`, `1010`, `1014`. Rows with ratio greater than `3.0` satisfy the Phase 0 hot-axis criterion.

| Microturn class | Slow decisions | Fast decisions | Slow mean ms | Fast mean ms | Slow:fast ratio | Verdict |
|---|---:|---:|---:|---:|---:|---|
| assault:chooseNStep:confirm | 27 | 27 | 58.6413 | 6.0071 | 9.762 | hot axis |
| ambushNva | 2 | 4 | 17.6771 | 4.3828 | 4.0333 | hot axis |
| assault:chooseNStep:add | 15 | 16 | 99.8856 | 45.6866 | 2.1863 |  |
| govern:chooseNStep:confirm | 36 | 32 | 554.6319 | 274.9863 | 2.0169 |  |
| bombard | 4 | 1 | 9.5906 | 5.0227 | 1.9095 |  |
| nvaTransferResources | 1 | 1 | 3.392 | 2.221 | 1.5272 |  |
| attack | 20 | 4 | 3.2559 | 2.4013 | 1.3559 |  |
| airStrike:chooseNStep:confirm | 1 | 1 | 0.0507 | 0.0411 | 1.2336 |  |
| pass | 10 | 6 | 3.1492 | 2.5936 | 1.2142 |  |
| ambushNva:chooseOne | 2 | 4 | 0.0352 | 0.0291 | 1.2096 |  |
| advise | 19 | 21 | 3.6938 | 3.0734 | 1.2019 |  |
| rally | 68 | 60 | 36.0426 | 30.497 | 1.1818 |  |
| coupArvnRedeployMandatory | 3 | 5 | 2.6235 | 2.2715 | 1.155 |  |
| coupNvaRedeployTroops:chooseOne | 138 | 17 | 0.0456 | 0.04 | 1.14 |  |
| event-decision:chooseNStep:add | 84 | 43 | 25.2802 | 22.3382 | 1.1317 |  |
| advise:chooseNStep:add | 19 | 21 | 0.097 | 0.0871 | 1.1137 |  |
| coupArvnRedeployPolice:chooseOne | 236 | 197 | 546.8554 | 491.4709 | 1.1127 |  |
| march:chooseNStep:add | 27 | 31 | 0.0623 | 0.0564 | 1.1046 |  |
| coupAgitatePass | 15 | 12 | 1.7193 | 1.5573 | 1.104 |  |
| govern | 41 | 32 | 86.348 | 78.4414 | 1.1008 |  |
| rally:chooseNStep:confirm | 84 | 85 | 0.0358 | 0.0328 | 1.0915 |  |
| advise:chooseNStep:confirm | 19 | 21 | 0.046 | 0.0422 | 1.09 |  |
| infiltrate | 24 | 18 | 5.6588 | 5.193 | 1.0897 |  |
| infiltrate:chooseNStep:confirm | 38 | 24 | 0.0318 | 0.0293 | 1.0853 |  |
| infiltrate:chooseOne | 36 | 31 | 0.0359 | 0.0331 | 1.0846 |  |
| chooseNStep:chooseNStep:confirm | 7 | 4 | 0.0447 | 0.0425 | 1.0518 |  |
| coupCommitmentPass | 60 | 48 | 1.6159 | 1.549 | 1.0432 |  |
| rally:chooseNStep:add | 69 | 62 | 0.0652 | 0.0626 | 1.0415 |  |
| march | 21 | 22 | 3.3681 | 3.2364 | 1.0407 |  |
| event | 161 | 121 | 90.9912 | 87.5928 | 1.0388 |  |
| advise:chooseOne | 38 | 43 | 0.041 | 0.0398 | 1.0302 |  |
| coupArvnRedeployOptionalTroops:chooseOne | 158 | 117 | 88.5814 | 86.3491 | 1.0259 |  |
| govern:chooseOne | 50 | 33 | 3.4846 | 3.416 | 1.0201 |  |
| rally:chooseOne | 71 | 63 | 0.0341 | 0.0336 | 1.0149 |  |
| event-decision:chooseNStep:confirm | 57 | 41 | 0.0365 | 0.0363 | 1.0055 |  |
| coupArvnRedeployPolice | 127 | 118 | 2.0812 | 2.0714 | 1.0047 |  |
| coupNvaRedeployTroops | 39 | 6 | 1.8923 | 1.8948 | 0.9987 |  |
| coupVictoryCheck | 15 | 14 | 2.2859 | 2.2979 | 0.9948 |  |
| coupRedeployPass | 60 | 48 | 1.8875 | 1.9008 | 0.993 |  |
| assault | 52 | 42 | 2.4012 | 2.4333 | 0.9868 |  |
| march:chooseNStep:confirm | 48 | 49 | 0.0387 | 0.0397 | 0.9748 |  |
| coupPacifyARVN | 44 | 38 | 2.1213 | 2.1802 | 0.973 |  |
| ambushVc:chooseNStep:confirm | 33 | 19 | 0.0282 | 0.0291 | 0.9691 |  |
| coupPacifyPass | 30 | 24 | 2.3668 | 2.4719 | 0.9575 |  |
| coupResourcesResolve | 15 | 12 | 2.2264 | 2.3729 | 0.9383 |  |
| resolveHonoluluPacify | 1 | 2 | 1.5549 | 1.6868 | 0.9218 |  |
| coupArvnRedeployMandatory:chooseOne | 11 | 26 | 75.3801 | 82.9365 | 0.9089 |  |
| ambushVc | 33 | 22 | 3.2468 | 3.74 | 0.8681 |  |
| transport | 6 | 8 | 53.5759 | 62.1207 | 0.8624 |  |
| coupArvnRedeployOptionalTroops | 46 | 36 | 2.5722 | 3.1444 | 0.818 |  |
| ambushVc:chooseOne | 33 | 22 | 0.0226 | 0.0281 | 0.8043 |  |
| airStrike:chooseOne | 1 | 1 | 0.04 | 0.0502 | 0.7968 |  |
| transport:chooseOne | 12 | 16 | 73.735 | 96.1327 | 0.767 |  |
| govern:chooseNStep:add | 45 | 33 | 319.2229 | 433.2266 | 0.7368 |  |
| airStrike | 1 | 1 | 2.4827 | 3.7581 | 0.6606 |  |
| event-decision:chooseOne | 58 | 24 | 0.0443 | 0.069 | 0.642 |  |
| chooseOne:chooseOne | 12 | 9 | 0.5503 | 0.9804 | 0.5613 |  |
| infiltrate:chooseNStep:add | 24 | 18 | 0.0438 | 0.0788 | 0.5558 |  |
| ambushVc:chooseNStep:add | 33 | 19 | 0.0405 | 0.0759 | 0.5336 |  |
| assault:chooseOne | 7 | 11 | 1.7701 | 4.3118 | 0.4105 |  |

## Notes

- `elapsedMs` is measured around the per-decision `PolicyAgent.chooseDecision` call. It excludes simulator apply/delta work and report rendering.
- Child processes enforce the per-seed timeout. Each child loads the built engine and production FITL GameSpecDoc, using the repo GameDef cache when available.
- The script does not modify engine source or production profile data.
