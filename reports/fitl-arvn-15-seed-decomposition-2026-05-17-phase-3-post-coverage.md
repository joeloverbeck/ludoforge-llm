# FITL ARVN 15-Seed Per-Microturn-Class Decomposition

**Date**: 2026-05-17-phase-3-post-coverage
**Status**: Spec 173 measurement witness.
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 600000 --date 2026-05-17-phase-3-post-coverage`
**CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-3-post-coverage.csv`

## Summary

- Seeds completed: 15/15
- Per-decision rows: 3769
- Hot class with slow:fast ratio >3x: yes
- Per-seed timeout: 600000 ms
- Hot-path buckets: disabled
- WASM production preview-drive route count: 3125
- WASM production preview-drive unsupported count: 1998
- WASM production preview-drive batch count: 2648

## Per-Seed Wall Time

| Seed | Status | Stop Reason | Wall ms | Decisions | ms/decision | Error |
|---:|---|---|---:|---:|---:|---|
| 1000 | OK | terminal | 5264.82 | 159 | 33.1121 |  |
| 1001 | OK | terminal | 7041.8 | 193 | 36.486 |  |
| 1002 | OK | terminal | 4483.38 | 148 | 30.2931 |  |
| 1003 | OK | terminal | 8179.08 | 226 | 36.1906 |  |
| 1004 | OK | terminal | 12810.6 | 344 | 37.2401 |  |
| 1005 | OK | terminal | 43913.35 | 398 | 110.3351 |  |
| 1006 | OK | terminal | 9957.14 | 228 | 43.6717 |  |
| 1007 | OK | terminal | 6763.28 | 218 | 31.0242 |  |
| 1008 | OK | terminal | 20056.98 | 346 | 57.9682 |  |
| 1009 | OK | terminal | 11883.37 | 292 | 40.6965 |  |
| 1010 | OK | terminal | 33309.28 | 339 | 98.2575 |  |
| 1011 | OK | terminal | 6993.67 | 206 | 33.9499 |  |
| 1012 | OK | terminal | 16313.74 | 201 | 81.1629 |  |
| 1013 | OK | terminal | 7495.54 | 258 | 29.0525 |  |
| 1014 | OK | terminal | 17658.03 | 213 | 82.9015 |  |

## Per-Microturn-Class Rollup

| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | WASM preview-drive routes | WASM preview-drive unsupported | WASM preview-drive unsupported reasons | WASM preview-drive batches | Token index builds | Static rebuilds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|
| train:chooseNStep:add | 37 | 38177.31 | 1031.8191 | 3350.8751 | 14205.023 | 17.4865 | 0 | 5183 | 7420 | 0 | 0 | 359 | 13 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:13 | 0 | 0 | 0 |
| govern:chooseNStep:confirm | 115 | 31342.28 | 272.5416 | 494.3471 | 10016.1876 | 6.6957 | 0 | 2505 | 1135 | 0 | 0 | 0 | 520 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:520 | 0 | 0 | 0 |
| govern:chooseNStep:add | 135 | 25705.04 | 190.4077 | 308.6523 | 4129.1184 | 6.0815 | 0 | 3770 | 5825 | 0 | 0 | 708 | 73 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:73 | 0 | 0 | 0 |
| event | 248 | 21494.88 | 86.6729 | 88.2523 | 4972.9611 | 19.121 | 248 | 0 | 0 | 248 | 234 | 0 | 276 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:276 | 0 | 38 | 278 |
| coupArvnRedeployPolice:chooseOne | 153 | 14883.91 | 97.2805 | 287.643 | 379.7532 | 30.3922 | 0 | 105697 | 3591 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| train:chooseNStep:confirm | 59 | 9442.68 | 160.0455 | 1583.0199 | 2983.7696 | 3.0508 | 0 | 1810 | 3782 | 0 | 0 | 72 | 12 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:12 | 0 | 0 | 0 |
| govern | 118 | 6690.85 | 56.7021 | 78.4149 | 592.2927 | 10.7797 | 111 | 0 | 7 | 111 | 96 | 42 | 236 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:132; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:104 | 146 | 0 | 111 |
| coupArvnRedeployOptionalTroops:chooseOne | 215 | 4056.47 | 18.8673 | 31.7531 | 41.0754 | 8.3907 | 0 | 13517 | 1865 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally | 165 | 3468.89 | 21.0236 | 43.9604 | 149.0353 | 15.0667 | 146 | 0 | 19 | 146 | 100 | 381 | 215 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:198; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:17 | 398 | 0 | 146 |
| coupArvnRedeployOptionalTroops | 88 | 3463.69 | 39.3601 | 46.3031 | 54.0615 | 17.2159 | 71 | 0 | 17 | 71 | 0 | 36 | 176 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:176 | 212 | 0 | 71 |
| coupArvnRedeployPolice | 86 | 2547.68 | 29.6242 | 34.0356 | 38.8184 | 11.6744 | 85 | 0 | 1 | 85 | 0 | 20 | 172 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:172 | 192 | 0 | 85 |
| event-decision:chooseNStep:add | 96 | 2341.92 | 24.395 | 241.415 | 404.3322 | 11.4479 | 0 | 250 | 1045 | 0 | 0 | 63 | 14 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:14 | 0 | 0 | 0 |
| transport:chooseOne | 14 | 718.47 | 51.3191 | 104.9015 | 104.9015 | 16.7143 | 0 | 952 | 37 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| coupRedeployPass | 80 | 663.34 | 8.2917 | 26.0838 | 32.0225 | 2.95 | 32 | 0 | 48 | 32 | 15 | 82 | 40 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:40 | 122 | 0 | 32 |
| coupPacifyUS | 76 | 624.4 | 8.2158 | 13.1421 | 14.6116 | 2.8158 | 76 | 0 | 0 | 76 | 0 | 106 | 46 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:46 | 152 | 0 | 76 |
| train | 23 | 617.62 | 26.8529 | 55.6591 | 55.9482 | 5.4348 | 23 | 0 | 0 | 23 | 12 | 108 | 20 | agent-guided-completion/production-preview-drive.chooseN/only origin-seat greedy chooseN publication is supported:12; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:4; unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:4 | 124 | 0 | 23 |
| coupAgitateVC | 69 | 580.88 | 8.4185 | 12.071 | 12.8582 | 2.971 | 52 | 0 | 17 | 52 | 12 | 184 | 92 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:92 | 276 | 0 | 52 |
| patrol | 1 | 545.59 | 545.5933 | 545.5933 | 545.5933 | 4 | 1 | 0 | 0 | 1 | 0 | 0 | 1 | agent-guided-completion/production-preview-drive.chooseN/only origin-seat greedy chooseN publication is supported:1 | 1 | 0 | 1 |
| advise | 43 | 487.75 | 11.3429 | 40.2154 | 41.511 | 11.4186 | 32 | 0 | 11 | 32 | 8 | 164 | 4 | agent-guided-completion/production-preview-drive.chooseN/only origin-seat greedy chooseN publication is supported:3; unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:1 | 167 | 0 | 32 |
| govern:chooseOne | 138 | 460.28 | 3.3354 | 4.4962 | 9.2924 | 2 | 0 | 178 | 178 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate | 37 | 369.13 | 9.9766 | 13.7744 | 18.399 | 48.4324 | 30 | 0 | 7 | 30 | 16 | 136 | 0 |  | 136 | 0 | 30 |
| transport | 7 | 328.94 | 46.9919 | 53.3185 | 53.3185 | 11.7143 | 7 | 0 | 0 | 7 | 0 | 0 | 14 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:10; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:4 | 4 | 0 | 7 |
| coupArvnRedeployMandatory:chooseOne | 13 | 315.85 | 24.296 | 34.0946 | 34.0946 | 8 | 0 | 1435 | 205 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| coupPacifyARVN | 31 | 274.14 | 8.8434 | 12.4904 | 13.518 | 3.7742 | 14 | 0 | 17 | 14 | 30 | 66 | 30 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:28; unsupported-effect/production-preview-drive.effect.popInterruptPhase/unsupported production preview-drive effect popInterruptPhase:2 | 96 | 0 | 14 |
| coupCommitmentPass | 80 | 261.28 | 3.266 | 5.3594 | 6.2672 | 1.1375 | 9 | 0 | 71 | 9 | 2 | 131 | 0 |  | 131 | 0 | 9 |
| march | 40 | 243 | 6.0749 | 10.0628 | 11.3879 | 8.9 | 30 | 0 | 10 | 30 | 66 | 107 | 0 |  | 107 | 0 | 30 |
| assault | 21 | 177.7 | 8.4619 | 10.5951 | 12.0288 | 4.8095 | 20 | 0 | 1 | 20 | 3 | 80 | 0 |  | 80 | 0 | 20 |
| coupNvaRedeployTroops | 19 | 177.37 | 9.335 | 17.0791 | 17.0791 | 3.7368 | 12 | 0 | 7 | 12 | 0 | 14 | 12 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:12 | 26 | 0 | 12 |
| coupPacifyPass | 40 | 169.72 | 4.243 | 5.4655 | 11.8758 | 1.15 | 37 | 0 | 3 | 37 | 2 | 60 | 2 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:2 | 62 | 0 | 37 |
| ambushVc | 12 | 163.94 | 13.6618 | 23.2173 | 23.2173 | 8.1667 | 11 | 0 | 1 | 11 | 0 | 38 | 14 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:14 | 38 | 0 | 11 |
| train:chooseOne | 35 | 162.45 | 4.6415 | 7.0354 | 8.1007 | 2.3143 | 0 | 66 | 99 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| attack | 14 | 162.15 | 11.5823 | 25.3776 | 25.3776 | 31.6429 | 12 | 0 | 2 | 12 | 0 | 44 | 6 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:6 | 44 | 0 | 12 |
| coupArvnRedeployMandatory | 3 | 114.92 | 38.3068 | 41.0591 | 41.0591 | 11.3333 | 1 | 0 | 2 | 1 | 0 | 4 | 6 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:6 | 10 | 0 | 1 |
| coupAgitatePass | 20 | 74.88 | 3.7441 | 4.8415 | 5.7109 | 1.25 | 17 | 0 | 3 | 17 | 0 | 50 | 0 |  | 50 | 0 | 17 |
| coupResourcesResolve | 20 | 68.56 | 3.428 | 4.4191 | 4.6114 | 1 | 3 | 0 | 17 | 3 | 0 | 20 | 0 |  | 20 | 0 | 3 |
| coupVictoryCheck | 20 | 66.7 | 3.335 | 4.3607 | 4.5054 | 1 | 20 | 0 | 0 | 20 | 4 | 20 | 0 |  | 20 | 0 | 20 |
| coupCommitmentResolve | 9 | 41.44 | 4.6043 | 7.1587 | 7.1587 | 2 | 0 | 0 | 9 | 0 | 0 | 18 | 0 |  | 18 | 0 | 0 |
| ambushNva | 5 | 31.73 | 6.346 | 11.3329 | 11.3329 | 15.2 | 5 | 0 | 0 | 5 | 0 | 11 | 0 |  | 11 | 0 | 5 |
| chooseOne:chooseOne | 31 | 18.62 | 0.6006 | 6.0579 | 8.5446 | 5.2903 | 0 | 7 | 2 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| resolveHonoluluPacify | 3 | 14.55 | 4.8496 | 4.9482 | 4.9482 | 1 | 3 | 0 | 0 | 3 | 0 | 0 | 4 | unsupported-effect/production-preview-drive.effect.popInterruptPhase/unsupported production preview-drive effect popInterruptPhase:4 | 4 | 0 | 3 |
| rally:chooseNStep:add | 168 | 12.24 | 0.0729 | 0.1089 | 0.7401 | 20.75 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| event-decision:chooseOne | 34 | 7.69 | 0.2261 | 0.6359 | 5.7341 | 3.6471 | 0 | 1 | 1 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally:chooseNStep:confirm | 209 | 7.66 | 0.0366 | 0.0663 | 1.0622 | 14.7943 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally:chooseOne | 172 | 5.33 | 0.031 | 0.0763 | 0.189 | 1.3547 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| advise:chooseNStep:add | 43 | 4.12 | 0.0959 | 0.2317 | 0.7271 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| pass | 1 | 3.28 | 3.2827 | 3.2827 | 3.2827 | 1 | 1 | 0 | 0 | 1 | 0 | 1 | 0 |  | 1 | 0 | 1 |
| march:chooseNStep:add | 57 | 3.26 | 0.0572 | 0.1058 | 0.1571 | 11.614 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| march:chooseNStep:confirm | 91 | 3.16 | 0.0347 | 0.0654 | 0.0968 | 5.2198 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| advise:chooseOne | 87 | 2.87 | 0.033 | 0.0576 | 0.1135 | 2.4368 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| event-decision:chooseNStep:confirm | 89 | 2.69 | 0.0302 | 0.0865 | 0.1671 | 6.5169 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate:chooseNStep:add | 37 | 2.29 | 0.062 | 0.0644 | 0.6668 | 3.7027 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate:chooseOne | 57 | 1.76 | 0.0309 | 0.0663 | 0.1454 | 1.614 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| coupNvaRedeployTroops:chooseOne | 43 | 1.75 | 0.0408 | 0.0609 | 0.0777 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| advise:chooseNStep:confirm | 43 | 1.67 | 0.0389 | 0.0706 | 0.0851 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate:chooseNStep:confirm | 55 | 1.61 | 0.0292 | 0.0685 | 0.1116 | 4.4909 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| assault:chooseNStep:add | 21 | 1.07 | 0.0512 | 0.0574 | 0.1417 | 3.0952 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| assault:chooseNStep:confirm | 42 | 1.01 | 0.024 | 0.0404 | 0.1041 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| coupCommitmentResolve:chooseNStep:confirm | 36 | 1.01 | 0.0281 | 0.046 | 0.0707 | 9.25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushVc:chooseNStep:add | 12 | 0.51 | 0.0422 | 0.0607 | 0.0607 | 3.4167 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| chooseNStep:chooseNStep:confirm | 10 | 0.38 | 0.0379 | 0.051 | 0.051 | 18.2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushVc:chooseNStep:confirm | 12 | 0.34 | 0.0287 | 0.0663 | 0.0663 | 4.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushVc:chooseOne | 12 | 0.23 | 0.0194 | 0.029 | 0.029 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushNva:chooseOne | 5 | 0.15 | 0.0293 | 0.0397 | 0.0397 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| assault:chooseOne | 4 | 0.14 | 0.0353 | 0.0413 | 0.0413 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushNva:chooseNStep:add | 3 | 0.13 | 0.0435 | 0.0496 | 0.0496 | 3.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushNva:chooseNStep:confirm | 3 | 0.08 | 0.0258 | 0.0264 | 0.0264 | 3.6667 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| patrol:chooseNStep:add | 1 | 0.08 | 0.0774 | 0.0774 | 0.0774 | 17 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| patrol:chooseNStep:confirm | 3 | 0.08 | 0.0258 | 0.0309 | 0.0309 | 4.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |

## Top Hot Axes In Slow-Tier Seeds

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.

| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms |
|---:|---|---|---:|---:|---:|---:|---:|
| 1 | govern:chooseNStep:confirm | continuedDeepening | 33 | 16308.54 | 494.198 | 512.0805 | 10016.1876 |
| 2 | train:chooseNStep:add | continuedDeepening | 14 | 13042.76 | 931.6254 | 3350.8751 | 3350.8751 |
| 3 | govern:chooseNStep:add | continuedDeepening | 55 | 11967.73 | 217.5952 | 312.6492 | 4129.1184 |
| 4 | event | singlePass | 109 | 8104.36 | 74.3519 | 162.6617 | 3076.6507 |
| 5 | coupArvnRedeployPolice:chooseOne | continuedDeepening | 58 | 7626.47 | 131.4909 | 330.921 | 379.7532 |
| 6 | train:chooseNStep:confirm | continuedDeepening | 12 | 6219.17 | 518.2643 | 2983.7696 | 2983.7696 |
| 7 | govern | singlePass | 47 | 2975.76 | 63.314 | 77.3698 | 592.2927 |
| 8 | coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | 84 | 1665.82 | 19.8312 | 32.1133 | 41.0754 |
| 9 | event-decision:chooseNStep:add | continuedDeepening | 6 | 1613.73 | 268.9558 | 404.3322 | 404.3322 |
| 10 | rally | singlePass | 67 | 1297.35 | 19.3635 | 43.9604 | 46.6644 |

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
| event-decision:chooseOne | 12 | 6 | 0.508 | 0.1465 | 3.4676 | hot axis |
| coupNvaRedeployTroops | 11 | 1 | 9.3341 | 3.5305 | 2.6438 |  |
| coupArvnRedeployPolice:chooseOne | 58 | 50 | 131.4909 | 67.989 | 1.934 |  |
| train:chooseNStep:confirm | 22 | 17 | 282.7354 | 170.4155 | 1.6591 |  |
| rally:chooseNStep:confirm | 77 | 72 | 0.0457 | 0.0322 | 1.4193 |  |
| event-decision:chooseNStep:add | 48 | 30 | 33.6489 | 24.1919 | 1.3909 |  |
| govern:chooseNStep:confirm | 44 | 35 | 370.6722 | 272.0005 | 1.3628 |  |
| march:chooseNStep:add | 21 | 22 | 0.0668 | 0.0498 | 1.3414 |  |
| assault:chooseNStep:confirm | 16 | 12 | 0.0275 | 0.0223 | 1.2332 |  |
| coupCommitmentResolve | 3 | 3 | 4.9932 | 4.0626 | 1.2291 |  |
| coupCommitmentResolve:chooseNStep:confirm | 12 | 12 | 0.0322 | 0.0262 | 1.229 |  |
| assault:chooseNStep:add | 8 | 6 | 0.0583 | 0.0481 | 1.2121 |  |
| transport | 4 | 3 | 50.3621 | 42.4983 | 1.185 |  |
| advise:chooseOne | 27 | 30 | 0.0376 | 0.0318 | 1.1824 |  |
| govern | 47 | 35 | 63.314 | 54.4009 | 1.1638 |  |
| coupCommitmentPass | 32 | 24 | 3.4699 | 3.0695 | 1.1304 |  |
| attack | 4 | 8 | 11.698 | 10.5045 | 1.1136 |  |
| coupRedeployPass | 32 | 24 | 8.8498 | 7.9484 | 1.1134 |  |
| advise:chooseNStep:add | 13 | 15 | 0.1167 | 0.1054 | 1.1072 |  |
| coupVictoryCheck | 8 | 6 | 3.4416 | 3.1391 | 1.0964 |  |
| govern:chooseNStep:add | 55 | 35 | 217.5952 | 200.171 | 1.087 |  |
| advise:chooseNStep:confirm | 13 | 15 | 0.0425 | 0.0394 | 1.0787 |  |
| event-decision:chooseNStep:confirm | 47 | 27 | 0.032 | 0.0297 | 1.0774 |  |
| assault | 8 | 6 | 9.1465 | 8.5393 | 1.0711 |  |
| chooseNStep:chooseNStep:confirm | 6 | 3 | 0.037 | 0.0351 | 1.0541 |  |
| coupPacifyARVN | 11 | 8 | 8.9774 | 8.6144 | 1.0421 |  |
| march | 15 | 13 | 5.8139 | 5.5943 | 1.0393 |  |
| coupArvnRedeployOptionalTroops:chooseOne | 84 | 60 | 19.8312 | 19.1182 | 1.0373 |  |
| coupPacifyUS | 25 | 26 | 8.4475 | 8.1903 | 1.0314 |  |
| train:chooseOne | 12 | 11 | 4.8921 | 4.7579 | 1.0282 |  |
| coupArvnRedeployPolice | 27 | 32 | 30.1212 | 29.3494 | 1.0263 |  |
| coupArvnRedeployOptionalTroops | 32 | 25 | 40.013 | 39.685 | 1.0083 |  |
| govern:chooseOne | 58 | 35 | 3.3681 | 3.3663 | 1.0005 |  |
| train | 8 | 7 | 30.2332 | 30.4136 | 0.9941 |  |
| infiltrate | 16 | 8 | 9.643 | 9.9357 | 0.9705 |  |
| rally:chooseOne | 70 | 57 | 0.0306 | 0.033 | 0.9273 |  |
| coupResourcesResolve | 8 | 6 | 3.2967 | 3.5695 | 0.9236 |  |
| infiltrate:chooseOne | 23 | 13 | 0.0334 | 0.0366 | 0.9126 |  |
| event | 109 | 77 | 74.3519 | 83.8421 | 0.8868 |  |
| coupAgitatePass | 8 | 6 | 3.4742 | 3.9234 | 0.8855 |  |
| march:chooseNStep:confirm | 35 | 29 | 0.034 | 0.0384 | 0.8854 |  |
| coupAgitateVC | 22 | 25 | 7.8982 | 9.0413 | 0.8736 |  |
| ambushVc:chooseNStep:add | 7 | 3 | 0.0416 | 0.0482 | 0.8631 |  |
| ambushVc:chooseOne | 7 | 4 | 0.018 | 0.0221 | 0.8145 |  |
| rally | 67 | 54 | 19.3635 | 24.0464 | 0.8053 |  |
| coupPacifyPass | 16 | 12 | 3.8757 | 4.8399 | 0.8008 |  |
| ambushVc | 7 | 4 | 12.1878 | 15.2438 | 0.7995 |  |
| rally:chooseNStep:add | 68 | 56 | 0.0641 | 0.0823 | 0.7789 |  |
| infiltrate:chooseNStep:confirm | 26 | 12 | 0.0269 | 0.0347 | 0.7752 |  |
| advise | 13 | 15 | 9.2253 | 13.0224 | 0.7084 |  |
| coupNvaRedeployTroops:chooseOne | 25 | 2 | 0.041 | 0.0585 | 0.7009 |  |
| train:chooseNStep:add | 14 | 11 | 931.6254 | 1648.939 | 0.565 |  |
| chooseOne:chooseOne | 13 | 8 | 0.5888 | 1.1133 | 0.5289 |  |
| transport:chooseOne | 8 | 6 | 36.2317 | 71.4357 | 0.5072 |  |
| ambushVc:chooseNStep:confirm | 7 | 3 | 0.0232 | 0.0479 | 0.4843 |  |
| infiltrate:chooseNStep:add | 16 | 8 | 0.0485 | 0.1223 | 0.3966 |  |

## Notes

- `elapsedMs` is measured around the per-decision `PolicyAgent.chooseDecision` call. It excludes simulator apply/delta work and report rendering.
- Child processes enforce the per-seed timeout. Each child loads the built engine and production FITL GameSpecDoc, using the repo GameDef cache when available.
- The script does not modify engine source or production profile data.
