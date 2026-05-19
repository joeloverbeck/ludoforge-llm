# FITL ARVN 15-Seed Per-Microturn-Class Decomposition

**Status**: ✅ EXPLOITED — archived 2026-05-19.

**Date**: 2026-05-17-phase-1-post-conversion
**Status**: Spec 173 measurement witness.
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 600000 --date 2026-05-17-phase-1-post-conversion`
**CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-1-post-conversion.csv`

## Summary

- Seeds completed: 15/15
- Per-decision rows: 3769
- Hot class with slow:fast ratio >3x: no
- Per-seed timeout: 600000 ms
- Hot-path buckets: disabled
- WASM production preview-drive route count: 3125
- WASM production preview-drive unsupported count: 1998
- WASM production preview-drive batch count: 2648

## Per-Seed Wall Time

| Seed | Status | Stop Reason | Wall ms | Decisions | ms/decision | Error |
|---:|---|---|---:|---:|---:|---|
| 1000 | OK | terminal | 5337.23 | 159 | 33.5675 |  |
| 1001 | OK | terminal | 7401.28 | 193 | 38.3486 |  |
| 1002 | OK | terminal | 5027.77 | 148 | 33.9714 |  |
| 1003 | OK | terminal | 8513.54 | 226 | 37.6705 |  |
| 1004 | OK | terminal | 13509.09 | 344 | 39.2706 |  |
| 1005 | OK | terminal | 46398.13 | 398 | 116.5782 |  |
| 1006 | OK | terminal | 10385.88 | 228 | 45.5521 |  |
| 1007 | OK | terminal | 7096.61 | 218 | 32.5533 |  |
| 1008 | OK | terminal | 20068.3 | 346 | 58.0009 |  |
| 1009 | OK | terminal | 12081.98 | 292 | 41.3766 |  |
| 1010 | OK | terminal | 34001.6 | 339 | 100.2997 |  |
| 1011 | OK | terminal | 7434.41 | 206 | 36.0894 |  |
| 1012 | OK | terminal | 16348.91 | 201 | 81.3379 |  |
| 1013 | OK | terminal | 7435.68 | 258 | 28.8205 |  |
| 1014 | OK | terminal | 18417.33 | 213 | 86.4663 |  |

## Per-Microturn-Class Rollup

| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | WASM preview-drive routes | WASM preview-drive unsupported | WASM preview-drive unsupported reasons | WASM preview-drive batches | Token index builds | Static rebuilds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|
| train:chooseNStep:add | 37 | 39624.98 | 1070.9455 | 3640.0547 | 14572.9246 | 17.4865 | 0 | 5183 | 7420 | 0 | 0 | 359 | 13 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:13 | 0 | 0 | 0 |
| govern:chooseNStep:confirm | 115 | 32537.33 | 282.9333 | 507.4827 | 10370.9625 | 6.6957 | 0 | 2505 | 1135 | 0 | 0 | 0 | 520 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:520 | 0 | 0 | 0 |
| govern:chooseNStep:add | 135 | 26292.41 | 194.7586 | 312.5207 | 4134.5445 | 6.0815 | 0 | 3770 | 5825 | 0 | 0 | 708 | 73 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:73 | 0 | 0 | 0 |
| event | 248 | 22128.9 | 89.2294 | 90.4247 | 4939.346 | 19.121 | 248 | 0 | 0 | 248 | 234 | 0 | 276 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:276 | 0 | 38 | 278 |
| coupArvnRedeployPolice:chooseOne | 153 | 15350.6 | 100.3307 | 316.7145 | 348.8693 | 30.3922 | 0 | 105697 | 3591 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| train:chooseNStep:confirm | 59 | 9928.96 | 168.2875 | 1671.7289 | 3127.5815 | 3.0508 | 0 | 1810 | 3782 | 0 | 0 | 72 | 12 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:12 | 0 | 0 | 0 |
| govern | 118 | 6920.89 | 58.6516 | 81.8922 | 623.5461 | 10.7797 | 111 | 0 | 7 | 111 | 96 | 42 | 236 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:132; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:104 | 146 | 0 | 111 |
| coupArvnRedeployOptionalTroops:chooseOne | 215 | 4249.66 | 19.7658 | 33.247 | 44.8518 | 8.3907 | 0 | 13517 | 1865 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| coupArvnRedeployOptionalTroops | 88 | 3627.6 | 41.2227 | 48.7545 | 53.5907 | 17.2159 | 71 | 0 | 17 | 71 | 0 | 36 | 176 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:176 | 212 | 0 | 71 |
| rally | 165 | 3578.67 | 21.6889 | 45.2058 | 149.0288 | 15.0667 | 146 | 0 | 19 | 146 | 100 | 381 | 215 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:198; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:17 | 398 | 0 | 146 |
| coupArvnRedeployPolice | 86 | 2645.91 | 30.7664 | 36.2808 | 41.307 | 11.6744 | 85 | 0 | 1 | 85 | 0 | 20 | 172 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:172 | 192 | 0 | 85 |
| event-decision:chooseNStep:add | 96 | 2425.41 | 25.2647 | 261.3969 | 395.6655 | 11.4479 | 0 | 250 | 1045 | 0 | 0 | 63 | 14 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:14 | 0 | 0 | 0 |
| transport:chooseOne | 14 | 749.34 | 53.524 | 114.5017 | 114.5017 | 16.7143 | 0 | 952 | 37 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| coupRedeployPass | 80 | 695.79 | 8.6973 | 27.8994 | 30.6664 | 2.95 | 32 | 0 | 48 | 32 | 15 | 82 | 40 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:40 | 122 | 0 | 32 |
| train | 23 | 646.92 | 28.1271 | 56.7629 | 65.2008 | 5.4348 | 23 | 0 | 0 | 23 | 12 | 108 | 20 | agent-guided-completion/production-preview-drive.chooseN/only origin-seat greedy chooseN publication is supported:12; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:4; unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:4 | 124 | 0 | 23 |
| coupPacifyUS | 76 | 646.62 | 8.5081 | 13.5036 | 16.5472 | 2.8158 | 76 | 0 | 0 | 76 | 0 | 106 | 46 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:46 | 152 | 0 | 76 |
| coupAgitateVC | 69 | 598.23 | 8.6701 | 12.3642 | 14.0354 | 2.971 | 52 | 0 | 17 | 52 | 12 | 184 | 92 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:92 | 276 | 0 | 52 |
| patrol | 1 | 583.32 | 583.317 | 583.317 | 583.317 | 4 | 1 | 0 | 0 | 1 | 0 | 0 | 1 | agent-guided-completion/production-preview-drive.chooseN/only origin-seat greedy chooseN publication is supported:1 | 1 | 0 | 1 |
| advise | 43 | 505.73 | 11.7611 | 38.9572 | 41.1375 | 11.4186 | 32 | 0 | 11 | 32 | 8 | 164 | 4 | agent-guided-completion/production-preview-drive.chooseN/only origin-seat greedy chooseN publication is supported:3; unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:1 | 167 | 0 | 32 |
| govern:chooseOne | 138 | 472.74 | 3.4257 | 4.5329 | 9.3049 | 2 | 0 | 178 | 178 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate | 37 | 375.17 | 10.1396 | 13.6016 | 17.8162 | 48.4324 | 30 | 0 | 7 | 30 | 16 | 136 | 0 |  | 136 | 0 | 30 |
| transport | 7 | 349.94 | 49.9912 | 59.2788 | 59.2788 | 11.7143 | 7 | 0 | 0 | 7 | 0 | 0 | 14 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:10; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:4 | 4 | 0 | 7 |
| coupArvnRedeployMandatory:chooseOne | 13 | 338.28 | 26.0214 | 38.706 | 38.706 | 8 | 0 | 1435 | 205 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| coupPacifyARVN | 31 | 283.09 | 9.132 | 12.6593 | 13.4388 | 3.7742 | 14 | 0 | 17 | 14 | 30 | 66 | 30 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:28; unsupported-effect/production-preview-drive.effect.popInterruptPhase/unsupported production preview-drive effect popInterruptPhase:2 | 96 | 0 | 14 |
| coupCommitmentPass | 80 | 251.56 | 3.1444 | 4.5174 | 5.4201 | 1.1375 | 9 | 0 | 71 | 9 | 2 | 131 | 0 |  | 131 | 0 | 9 |
| march | 40 | 250.16 | 6.254 | 10.3437 | 11.382 | 8.9 | 30 | 0 | 10 | 30 | 66 | 107 | 0 |  | 107 | 0 | 30 |
| assault | 21 | 182.9 | 8.7096 | 10.622 | 11.0022 | 4.8095 | 20 | 0 | 1 | 20 | 3 | 80 | 0 |  | 80 | 0 | 20 |
| coupNvaRedeployTroops | 19 | 176.22 | 9.2748 | 19.2025 | 19.2025 | 3.7368 | 12 | 0 | 7 | 12 | 0 | 14 | 12 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:12 | 26 | 0 | 12 |
| ambushVc | 12 | 176.16 | 14.6799 | 27.0944 | 27.0944 | 8.1667 | 11 | 0 | 1 | 11 | 0 | 38 | 14 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:14 | 38 | 0 | 11 |
| coupPacifyPass | 40 | 174.28 | 4.3571 | 6.2046 | 10.9304 | 1.15 | 37 | 0 | 3 | 37 | 2 | 60 | 2 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:2 | 62 | 0 | 37 |
| attack | 14 | 168.54 | 12.0387 | 26.8401 | 26.8401 | 31.6429 | 12 | 0 | 2 | 12 | 0 | 44 | 6 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:6 | 44 | 0 | 12 |
| train:chooseOne | 35 | 160.98 | 4.5996 | 6.3072 | 7.3946 | 2.3143 | 0 | 66 | 99 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| coupArvnRedeployMandatory | 3 | 125.03 | 41.6769 | 45.4384 | 45.4384 | 11.3333 | 1 | 0 | 2 | 1 | 0 | 4 | 6 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:6 | 10 | 0 | 1 |
| coupAgitatePass | 20 | 78.53 | 3.9263 | 4.9923 | 7.156 | 1.25 | 17 | 0 | 3 | 17 | 0 | 50 | 0 |  | 50 | 0 | 17 |
| coupVictoryCheck | 20 | 72.28 | 3.6142 | 4.6601 | 6.2387 | 1 | 20 | 0 | 0 | 20 | 4 | 20 | 0 |  | 20 | 0 | 20 |
| coupResourcesResolve | 20 | 71.76 | 3.5878 | 4.4328 | 5.4574 | 1 | 3 | 0 | 17 | 3 | 0 | 20 | 0 |  | 20 | 0 | 3 |
| coupCommitmentResolve | 9 | 39.71 | 4.4124 | 5.362 | 5.362 | 2 | 0 | 0 | 9 | 0 | 0 | 18 | 0 |  | 18 | 0 | 0 |
| ambushNva | 5 | 31.98 | 6.3969 | 10.7675 | 10.7675 | 15.2 | 5 | 0 | 0 | 5 | 0 | 11 | 0 |  | 11 | 0 | 5 |
| chooseOne:chooseOne | 31 | 18.88 | 0.6091 | 7.1725 | 7.6074 | 5.2903 | 0 | 7 | 2 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| resolveHonoluluPacify | 3 | 16.39 | 5.463 | 6.3006 | 6.3006 | 1 | 3 | 0 | 0 | 3 | 0 | 0 | 4 | unsupported-effect/production-preview-drive.effect.popInterruptPhase/unsupported production preview-drive effect popInterruptPhase:4 | 4 | 0 | 3 |
| rally:chooseNStep:add | 168 | 13.04 | 0.0776 | 0.138 | 0.7679 | 20.75 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally:chooseNStep:confirm | 209 | 6.95 | 0.0333 | 0.0618 | 0.1433 | 14.7943 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| event-decision:chooseOne | 34 | 5.83 | 0.1715 | 0.5841 | 3.887 | 3.6471 | 0 | 1 | 1 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally:chooseOne | 172 | 5.81 | 0.0338 | 0.0967 | 0.1482 | 1.3547 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| advise:chooseNStep:add | 43 | 5.41 | 0.1258 | 0.7006 | 1.0741 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| march:chooseNStep:confirm | 91 | 3.67 | 0.0404 | 0.0876 | 0.1095 | 5.2198 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| march:chooseNStep:add | 57 | 3.36 | 0.059 | 0.1086 | 0.1298 | 11.614 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| pass | 1 | 3.32 | 3.3184 | 3.3184 | 3.3184 | 1 | 1 | 0 | 0 | 1 | 0 | 1 | 0 |  | 1 | 0 | 1 |
| advise:chooseOne | 87 | 3.31 | 0.038 | 0.0693 | 0.2093 | 2.4368 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| event-decision:chooseNStep:confirm | 89 | 2.96 | 0.0333 | 0.0889 | 0.185 | 6.5169 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate:chooseNStep:add | 37 | 2.3 | 0.0621 | 0.0568 | 0.6584 | 3.7027 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate:chooseOne | 57 | 1.98 | 0.0347 | 0.0685 | 0.1532 | 1.614 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| advise:chooseNStep:confirm | 43 | 1.78 | 0.0415 | 0.0661 | 0.1211 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| coupNvaRedeployTroops:chooseOne | 43 | 1.76 | 0.0408 | 0.0576 | 0.0752 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate:chooseNStep:confirm | 55 | 1.6 | 0.0291 | 0.0582 | 0.0936 | 4.4909 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| assault:chooseNStep:add | 21 | 1.2 | 0.0574 | 0.0731 | 0.1558 | 3.0952 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| assault:chooseNStep:confirm | 42 | 1.09 | 0.026 | 0.0454 | 0.0972 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| coupCommitmentResolve:chooseNStep:confirm | 36 | 1.03 | 0.0287 | 0.0514 | 0.0605 | 9.25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushVc:chooseNStep:add | 12 | 0.56 | 0.0467 | 0.0645 | 0.0645 | 3.4167 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| chooseNStep:chooseNStep:confirm | 10 | 0.42 | 0.0419 | 0.0532 | 0.0532 | 18.2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushVc:chooseNStep:confirm | 12 | 0.36 | 0.0296 | 0.0728 | 0.0728 | 4.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushVc:chooseOne | 12 | 0.3 | 0.0252 | 0.0671 | 0.0671 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| assault:chooseOne | 4 | 0.18 | 0.0456 | 0.0599 | 0.0599 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushNva:chooseNStep:add | 3 | 0.14 | 0.0474 | 0.0493 | 0.0493 | 3.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushNva:chooseOne | 5 | 0.13 | 0.0263 | 0.0386 | 0.0386 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushNva:chooseNStep:confirm | 3 | 0.08 | 0.0257 | 0.0286 | 0.0286 | 3.6667 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| patrol:chooseNStep:add | 1 | 0.08 | 0.0776 | 0.0776 | 0.0776 | 17 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| patrol:chooseNStep:confirm | 3 | 0.07 | 0.0242 | 0.0293 | 0.0293 | 4.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |

## Top Hot Axes In Slow-Tier Seeds

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.

| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms |
|---:|---|---|---:|---:|---:|---:|---:|
| 1 | govern:chooseNStep:confirm | continuedDeepening | 33 | 16836.93 | 510.21 | 570.2477 | 10370.9625 |
| 2 | train:chooseNStep:add | continuedDeepening | 14 | 13739.75 | 981.411 | 3640.0547 | 3640.0547 |
| 3 | govern:chooseNStep:add | continuedDeepening | 55 | 12071.05 | 219.4737 | 314.9946 | 4134.5445 |
| 4 | event | singlePass | 109 | 8446.51 | 77.4909 | 166.977 | 3224.9179 |
| 5 | coupArvnRedeployPolice:chooseOne | continuedDeepening | 58 | 7792.11 | 134.3468 | 341.9056 | 348.8693 |
| 6 | train:chooseNStep:confirm | continuedDeepening | 12 | 6564.94 | 547.0784 | 3127.5815 | 3127.5815 |
| 7 | govern | singlePass | 47 | 3046.97 | 64.8291 | 81.8922 | 623.5461 |
| 8 | coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | 84 | 1732.63 | 20.6265 | 34.5474 | 38.2103 |
| 9 | event-decision:chooseNStep:add | continuedDeepening | 6 | 1685.89 | 280.981 | 395.6655 | 395.6655 |
| 10 | rally | singlePass | 67 | 1352.88 | 20.1922 | 45.283 | 48.8911 |

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
| event-decision:chooseOne | 12 | 6 | 0.3556 | 0.1423 | 2.4989 |  |
| coupNvaRedeployTroops | 11 | 1 | 9.1097 | 3.7154 | 2.4519 |  |
| coupArvnRedeployPolice:chooseOne | 58 | 50 | 134.3468 | 69.2477 | 1.9401 |  |
| advise:chooseNStep:add | 13 | 15 | 0.2028 | 0.1064 | 1.906 |  |
| train:chooseNStep:confirm | 22 | 17 | 298.4576 | 177.4163 | 1.6822 |  |
| event-decision:chooseNStep:add | 48 | 30 | 35.1594 | 24.5568 | 1.4318 |  |
| govern:chooseNStep:confirm | 44 | 35 | 382.6782 | 280.8068 | 1.3628 |  |
| assault:chooseNStep:add | 8 | 6 | 0.0657 | 0.054 | 1.2167 |  |
| march:chooseNStep:add | 21 | 22 | 0.0634 | 0.0523 | 1.2122 |  |
| assault:chooseNStep:confirm | 16 | 12 | 0.0287 | 0.0238 | 1.2059 |  |
| event-decision:chooseNStep:confirm | 47 | 27 | 0.0367 | 0.0306 | 1.1993 |  |
| transport | 4 | 3 | 53.7434 | 44.9883 | 1.1946 |  |
| govern | 47 | 35 | 64.8291 | 56.0398 | 1.1568 |  |
| rally:chooseNStep:confirm | 77 | 72 | 0.0362 | 0.0315 | 1.1492 |  |
| coupCommitmentResolve:chooseNStep:confirm | 12 | 12 | 0.0286 | 0.0257 | 1.1128 |  |
| advise:chooseNStep:confirm | 13 | 15 | 0.046 | 0.0417 | 1.1031 |  |
| train:chooseOne | 12 | 11 | 4.8317 | 4.4836 | 1.0776 |  |
| coupRedeployPass | 32 | 24 | 8.9348 | 8.3267 | 1.073 |  |
| govern:chooseNStep:add | 55 | 35 | 219.4737 | 204.5759 | 1.0728 |  |
| coupVictoryCheck | 8 | 6 | 3.6744 | 3.487 | 1.0537 |  |
| assault | 8 | 6 | 9.0252 | 8.6008 | 1.0493 |  |
| coupArvnRedeployPolice | 27 | 32 | 31.1802 | 30.2724 | 1.03 |  |
| coupArvnRedeployOptionalTroops | 32 | 25 | 41.6404 | 40.5144 | 1.0278 |  |
| coupPacifyARVN | 11 | 8 | 9.1671 | 8.9193 | 1.0278 |  |
| coupArvnRedeployOptionalTroops:chooseOne | 84 | 60 | 20.6265 | 20.1751 | 1.0224 |  |
| train | 8 | 7 | 32.3543 | 31.8285 | 1.0165 |  |
| govern:chooseOne | 58 | 35 | 3.44 | 3.3999 | 1.0118 |  |
| rally:chooseOne | 70 | 57 | 0.0338 | 0.0337 | 1.003 |  |
| coupPacifyUS | 25 | 26 | 8.5029 | 8.5079 | 0.9994 |  |
| coupResourcesResolve | 8 | 6 | 3.5147 | 3.5405 | 0.9927 |  |
| march | 15 | 13 | 5.8469 | 5.9041 | 0.9903 |  |
| advise:chooseOne | 27 | 30 | 0.0411 | 0.0416 | 0.988 |  |
| coupCommitmentPass | 32 | 24 | 3.1093 | 3.1598 | 0.984 |  |
| chooseNStep:chooseNStep:confirm | 6 | 3 | 0.0403 | 0.0412 | 0.9782 |  |
| infiltrate | 16 | 8 | 9.6255 | 10.006 | 0.962 |  |
| coupCommitmentResolve | 3 | 3 | 4.1909 | 4.4446 | 0.9429 |  |
| attack | 4 | 8 | 10.971 | 11.6784 | 0.9394 |  |
| march:chooseNStep:confirm | 35 | 29 | 0.0385 | 0.0433 | 0.8891 |  |
| event | 109 | 77 | 77.4909 | 87.2566 | 0.8881 |  |
| coupPacifyPass | 16 | 12 | 3.9889 | 4.5742 | 0.872 |  |
| rally | 67 | 54 | 20.1922 | 24.262 | 0.8323 |  |
| ambushVc | 7 | 4 | 13.7594 | 16.5417 | 0.8318 |  |
| coupAgitateVC | 22 | 25 | 7.8558 | 9.5129 | 0.8258 |  |
| rally:chooseNStep:add | 68 | 56 | 0.0708 | 0.088 | 0.8045 |  |
| ambushVc:chooseNStep:add | 7 | 3 | 0.0453 | 0.0564 | 0.8032 |  |
| advise | 13 | 15 | 9.6722 | 13.1413 | 0.736 |  |
| coupAgitatePass | 8 | 6 | 3.3664 | 4.7088 | 0.7149 |  |
| coupNvaRedeployTroops:chooseOne | 25 | 2 | 0.0417 | 0.0589 | 0.708 |  |
| infiltrate:chooseNStep:confirm | 26 | 12 | 0.0265 | 0.038 | 0.6974 |  |
| infiltrate:chooseOne | 23 | 13 | 0.032 | 0.0462 | 0.6926 |  |
| chooseOne:chooseOne | 13 | 8 | 0.6743 | 0.9963 | 0.6768 |  |
| train:chooseNStep:add | 14 | 11 | 981.411 | 1692.5608 | 0.5798 |  |
| ambushVc:chooseNStep:confirm | 7 | 3 | 0.0235 | 0.0429 | 0.5478 |  |
| ambushVc:chooseOne | 7 | 4 | 0.0195 | 0.0358 | 0.5447 |  |
| transport:chooseOne | 8 | 6 | 38.1102 | 74.0757 | 0.5145 |  |
| infiltrate:chooseNStep:add | 16 | 8 | 0.0456 | 0.1211 | 0.3765 |  |

## Notes

- `elapsedMs` is measured around the per-decision `PolicyAgent.chooseDecision` call. It excludes simulator apply/delta work and report rendering.
- Child processes enforce the per-seed timeout. Each child loads the built engine and production FITL GameSpecDoc, using the repo GameDef cache when available.
- The script does not modify engine source or production profile data.
