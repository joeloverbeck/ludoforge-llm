# FITL ARVN 15-Seed Per-Microturn-Class Decomposition

**Date**: 2026-05-17-post-fix-wasm
**Status**: Spec 173 measurement witness.
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 600000 --date 2026-05-17-post-fix-wasm`
**CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-17-post-fix-wasm.csv`

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
| 1000 | OK | terminal | 5774.13 | 159 | 36.3153 |  |
| 1001 | OK | terminal | 7740.93 | 193 | 40.1084 |  |
| 1002 | OK | terminal | 4863.01 | 148 | 32.8582 |  |
| 1003 | OK | terminal | 8630.24 | 226 | 38.1869 |  |
| 1004 | OK | terminal | 13549.75 | 344 | 39.3888 |  |
| 1005 | OK | terminal | 45070.63 | 398 | 113.2428 |  |
| 1006 | OK | terminal | 10396.86 | 228 | 45.6003 |  |
| 1007 | OK | terminal | 7057.85 | 218 | 32.3755 |  |
| 1008 | OK | terminal | 19628.36 | 346 | 56.7294 |  |
| 1009 | OK | terminal | 11536.43 | 292 | 39.5083 |  |
| 1010 | OK | terminal | 32686.29 | 339 | 96.4197 |  |
| 1011 | OK | terminal | 7530.37 | 206 | 36.5552 |  |
| 1012 | OK | terminal | 17130.9 | 201 | 85.2284 |  |
| 1013 | OK | terminal | 7791.95 | 258 | 30.2014 |  |
| 1014 | OK | terminal | 18588.69 | 213 | 87.2708 |  |

## Per-Microturn-Class Rollup

| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | WASM preview-drive routes | WASM preview-drive unsupported | WASM preview-drive unsupported reasons | WASM preview-drive batches | Token index builds | Static rebuilds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|
| train:chooseNStep:add | 37 | 38923.17 | 1051.9776 | 3555.1835 | 13939.7165 | 17.4865 | 0 | 5183 | 7420 | 0 | 0 | 359 | 13 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:13 | 0 | 0 | 0 |
| govern:chooseNStep:confirm | 115 | 32171.55 | 279.7526 | 499.065 | 10178.967 | 6.6957 | 0 | 2505 | 1135 | 0 | 0 | 0 | 520 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:520 | 0 | 0 | 0 |
| govern:chooseNStep:add | 135 | 26149.38 | 193.6991 | 316.8279 | 3906.8676 | 6.0815 | 0 | 3770 | 5825 | 0 | 0 | 708 | 73 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:73 | 0 | 0 | 0 |
| event | 248 | 22259.8 | 89.7573 | 87.7694 | 5227.3726 | 19.121 | 248 | 0 | 0 | 248 | 234 | 0 | 276 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:276 | 0 | 38 | 278 |
| coupArvnRedeployPolice:chooseOne | 153 | 15259.93 | 99.7381 | 309.3734 | 340.3259 | 30.3922 | 0 | 105697 | 3591 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| train:chooseNStep:confirm | 59 | 9594.78 | 162.6234 | 1642.2972 | 3101.5262 | 3.0508 | 0 | 1810 | 3782 | 0 | 0 | 72 | 12 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:12 | 0 | 0 | 0 |
| govern | 118 | 6889.89 | 58.3889 | 81.89 | 610.5471 | 10.7797 | 111 | 0 | 7 | 111 | 96 | 42 | 236 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:132; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:104 | 146 | 0 | 111 |
| coupArvnRedeployOptionalTroops:chooseOne | 215 | 4190.68 | 19.4915 | 32.8726 | 41.8878 | 8.3907 | 0 | 13517 | 1865 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| coupArvnRedeployOptionalTroops | 88 | 3594.32 | 40.8446 | 51.0482 | 54.3384 | 17.2159 | 71 | 0 | 17 | 71 | 0 | 36 | 176 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:176 | 212 | 0 | 71 |
| rally | 165 | 3593.84 | 21.7809 | 46.4684 | 143.1633 | 15.0667 | 146 | 0 | 19 | 146 | 100 | 381 | 215 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:198; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:17 | 398 | 0 | 146 |
| coupArvnRedeployPolice | 86 | 2699.71 | 31.3919 | 38.4851 | 41.8875 | 11.6744 | 85 | 0 | 1 | 85 | 0 | 20 | 172 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:172 | 192 | 0 | 85 |
| event-decision:chooseNStep:add | 96 | 2303.46 | 23.9944 | 240.8434 | 398.0758 | 11.4479 | 0 | 250 | 1045 | 0 | 0 | 63 | 14 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:14 | 0 | 0 | 0 |
| transport:chooseOne | 14 | 740.12 | 52.866 | 107.1415 | 107.1415 | 16.7143 | 0 | 952 | 37 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| coupRedeployPass | 80 | 689.59 | 8.6199 | 27.4531 | 35.0103 | 2.95 | 32 | 0 | 48 | 32 | 15 | 82 | 40 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:40 | 122 | 0 | 32 |
| coupPacifyUS | 76 | 652.18 | 8.5814 | 14.4499 | 15.253 | 2.8158 | 76 | 0 | 0 | 76 | 0 | 106 | 46 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:46 | 152 | 0 | 76 |
| train | 23 | 629.75 | 27.3806 | 51.8979 | 56.9709 | 5.4348 | 23 | 0 | 0 | 23 | 12 | 108 | 20 | agent-guided-completion/production-preview-drive.chooseN/only origin-seat greedy chooseN publication is supported:12; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:4; unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:4 | 124 | 0 | 23 |
| coupAgitateVC | 69 | 590.44 | 8.5571 | 11.4689 | 13.5275 | 2.971 | 52 | 0 | 17 | 52 | 12 | 184 | 92 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:92 | 276 | 0 | 52 |
| patrol | 1 | 573.99 | 573.9863 | 573.9863 | 573.9863 | 4 | 1 | 0 | 0 | 1 | 0 | 0 | 1 | agent-guided-completion/production-preview-drive.chooseN/only origin-seat greedy chooseN publication is supported:1 | 1 | 0 | 1 |
| advise | 43 | 516.35 | 12.0081 | 36.1418 | 41.5028 | 11.4186 | 32 | 0 | 11 | 32 | 8 | 164 | 4 | agent-guided-completion/production-preview-drive.chooseN/only origin-seat greedy chooseN publication is supported:3; unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:1 | 167 | 0 | 32 |
| govern:chooseOne | 138 | 472.8 | 3.4261 | 4.8217 | 8.8772 | 2 | 0 | 178 | 178 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate | 37 | 371.37 | 10.0371 | 13.1741 | 17.5432 | 48.4324 | 30 | 0 | 7 | 30 | 16 | 136 | 0 |  | 136 | 0 | 30 |
| transport | 7 | 350.67 | 50.0953 | 61.6911 | 61.6911 | 11.7143 | 7 | 0 | 0 | 7 | 0 | 0 | 14 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:10; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:4 | 4 | 0 | 7 |
| coupArvnRedeployMandatory:chooseOne | 13 | 329.22 | 25.3246 | 37.747 | 37.747 | 8 | 0 | 1435 | 205 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| coupPacifyARVN | 31 | 287.63 | 9.2785 | 12.3936 | 13.8824 | 3.7742 | 14 | 0 | 17 | 14 | 30 | 66 | 30 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:28; unsupported-effect/production-preview-drive.effect.popInterruptPhase/unsupported production preview-drive effect popInterruptPhase:2 | 96 | 0 | 14 |
| coupCommitmentPass | 80 | 257.82 | 3.2228 | 4.796 | 5.2391 | 1.1375 | 9 | 0 | 71 | 9 | 2 | 131 | 0 |  | 131 | 0 | 9 |
| march | 40 | 252.56 | 6.3139 | 11.3335 | 11.5873 | 8.9 | 30 | 0 | 10 | 30 | 66 | 107 | 0 |  | 107 | 0 | 30 |
| coupNvaRedeployTroops | 19 | 182.02 | 9.5799 | 17.8526 | 17.8526 | 3.7368 | 12 | 0 | 7 | 12 | 0 | 14 | 12 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:12 | 26 | 0 | 12 |
| assault | 21 | 174.9 | 8.3287 | 10.1994 | 10.5009 | 4.8095 | 20 | 0 | 1 | 20 | 3 | 80 | 0 |  | 80 | 0 | 20 |
| ambushVc | 12 | 169.85 | 14.1538 | 25.923 | 25.923 | 8.1667 | 11 | 0 | 1 | 11 | 0 | 38 | 14 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:14 | 38 | 0 | 11 |
| coupPacifyPass | 40 | 166.97 | 4.1742 | 5.2108 | 12.1958 | 1.15 | 37 | 0 | 3 | 37 | 2 | 60 | 2 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:2 | 62 | 0 | 37 |
| train:chooseOne | 35 | 166.9 | 4.7687 | 7.2691 | 7.3866 | 2.3143 | 0 | 66 | 99 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| attack | 14 | 164.01 | 11.7147 | 27.2687 | 27.2687 | 31.6429 | 12 | 0 | 2 | 12 | 0 | 44 | 6 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:6 | 44 | 0 | 12 |
| coupArvnRedeployMandatory | 3 | 119.88 | 39.9612 | 43.4312 | 43.4312 | 11.3333 | 1 | 0 | 2 | 1 | 0 | 4 | 6 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:6 | 10 | 0 | 1 |
| coupAgitatePass | 20 | 74.51 | 3.7256 | 4.9363 | 4.9639 | 1.25 | 17 | 0 | 3 | 17 | 0 | 50 | 0 |  | 50 | 0 | 17 |
| coupResourcesResolve | 20 | 71.75 | 3.5874 | 4.6792 | 4.8419 | 1 | 3 | 0 | 17 | 3 | 0 | 20 | 0 |  | 20 | 0 | 3 |
| coupVictoryCheck | 20 | 70.98 | 3.5491 | 4.4992 | 6.079 | 1 | 20 | 0 | 0 | 20 | 4 | 20 | 0 |  | 20 | 0 | 20 |
| coupCommitmentResolve | 9 | 42.1 | 4.6783 | 9.8394 | 9.8394 | 2 | 0 | 0 | 9 | 0 | 0 | 18 | 0 |  | 18 | 0 | 0 |
| ambushNva | 5 | 30.57 | 6.1134 | 9.4982 | 9.4982 | 15.2 | 5 | 0 | 0 | 5 | 0 | 11 | 0 |  | 11 | 0 | 5 |
| chooseOne:chooseOne | 31 | 18.8 | 0.6063 | 7.075 | 7.3468 | 5.2903 | 0 | 7 | 2 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| resolveHonoluluPacify | 3 | 15.52 | 5.1718 | 5.5232 | 5.5232 | 1 | 3 | 0 | 0 | 3 | 0 | 0 | 4 | unsupported-effect/production-preview-drive.effect.popInterruptPhase/unsupported production preview-drive effect popInterruptPhase:4 | 4 | 0 | 3 |
| rally:chooseNStep:add | 168 | 12.87 | 0.0766 | 0.1147 | 0.7281 | 20.75 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally:chooseNStep:confirm | 209 | 6.94 | 0.0332 | 0.0674 | 0.1408 | 14.7943 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally:chooseOne | 172 | 5.62 | 0.0327 | 0.0779 | 0.1567 | 1.3547 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| event-decision:chooseOne | 34 | 5.48 | 0.161 | 0.6354 | 3.3664 | 3.6471 | 0 | 1 | 1 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| advise:chooseNStep:add | 43 | 4.39 | 0.1021 | 0.2902 | 0.7282 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| march:chooseNStep:confirm | 91 | 3.39 | 0.0373 | 0.0669 | 0.1145 | 5.2198 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| pass | 1 | 3.39 | 3.3901 | 3.3901 | 3.3901 | 1 | 1 | 0 | 0 | 1 | 0 | 1 | 0 |  | 1 | 0 | 1 |
| march:chooseNStep:add | 57 | 3.37 | 0.0591 | 0.0856 | 0.1153 | 11.614 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| advise:chooseOne | 87 | 3.19 | 0.0367 | 0.087 | 0.1247 | 2.4368 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| event-decision:chooseNStep:confirm | 89 | 2.83 | 0.0318 | 0.103 | 0.1669 | 6.5169 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate:chooseNStep:add | 37 | 2.37 | 0.064 | 0.0557 | 0.6521 | 3.7027 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| advise:chooseNStep:confirm | 43 | 1.85 | 0.0429 | 0.0734 | 0.1025 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate:chooseOne | 57 | 1.84 | 0.0324 | 0.0521 | 0.1692 | 1.614 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| coupNvaRedeployTroops:chooseOne | 43 | 1.66 | 0.0387 | 0.0556 | 0.0801 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate:chooseNStep:confirm | 55 | 1.6 | 0.0291 | 0.056 | 0.1064 | 4.4909 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| assault:chooseNStep:add | 21 | 1.18 | 0.0563 | 0.0657 | 0.1746 | 3.0952 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| assault:chooseNStep:confirm | 42 | 1.09 | 0.0259 | 0.0403 | 0.1029 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| coupCommitmentResolve:chooseNStep:confirm | 36 | 1.03 | 0.0287 | 0.0451 | 0.0507 | 9.25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushVc:chooseNStep:add | 12 | 0.51 | 0.0426 | 0.052 | 0.052 | 3.4167 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| chooseNStep:chooseNStep:confirm | 10 | 0.42 | 0.0417 | 0.0577 | 0.0577 | 18.2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushVc:chooseNStep:confirm | 12 | 0.33 | 0.0278 | 0.0672 | 0.0672 | 4.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushVc:chooseOne | 12 | 0.25 | 0.021 | 0.0326 | 0.0326 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushNva:chooseNStep:add | 3 | 0.17 | 0.0564 | 0.0765 | 0.0765 | 3.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushNva:chooseOne | 5 | 0.16 | 0.0316 | 0.0477 | 0.0477 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| assault:chooseOne | 4 | 0.14 | 0.0358 | 0.049 | 0.049 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| patrol:chooseNStep:add | 1 | 0.13 | 0.1324 | 0.1324 | 0.1324 | 17 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushNva:chooseNStep:confirm | 3 | 0.12 | 0.0392 | 0.0653 | 0.0653 | 3.6667 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| patrol:chooseNStep:confirm | 3 | 0.07 | 0.0242 | 0.0261 | 0.0261 | 4.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |

## Top Hot Axes In Slow-Tier Seeds

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.

| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms |
|---:|---|---|---:|---:|---:|---:|---:|
| 1 | govern:chooseNStep:confirm | continuedDeepening | 33 | 16545.97 | 501.3931 | 499.065 | 10178.967 |
| 2 | train:chooseNStep:add | continuedDeepening | 14 | 13513.14 | 965.2246 | 3555.1835 | 3555.1835 |
| 3 | govern:chooseNStep:add | continuedDeepening | 55 | 11924.6 | 216.811 | 317.8426 | 3906.8676 |
| 4 | event | singlePass | 109 | 8169.83 | 74.9525 | 169.7033 | 3067.7518 |
| 5 | coupArvnRedeployPolice:chooseOne | continuedDeepening | 58 | 7641.28 | 131.7462 | 329.0644 | 340.3259 |
| 6 | train:chooseNStep:confirm | continuedDeepening | 12 | 6340.28 | 528.3568 | 3101.5262 | 3101.5262 |
| 7 | govern | singlePass | 47 | 3032.54 | 64.5221 | 80.7299 | 610.5471 |
| 8 | coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | 84 | 1718.41 | 20.4573 | 33.6251 | 41.8878 |
| 9 | event-decision:chooseNStep:add | continuedDeepening | 6 | 1578.08 | 263.0138 | 398.0758 | 398.0758 |
| 10 | rally | singlePass | 67 | 1352.63 | 20.1886 | 46.4684 | 63.1358 |

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
| coupNvaRedeployTroops | 11 | 1 | 9.8268 | 3.9709 | 2.4747 |  |
| event-decision:chooseOne | 12 | 6 | 0.3137 | 0.1583 | 1.9817 |  |
| coupArvnRedeployPolice:chooseOne | 58 | 50 | 131.7462 | 71.6532 | 1.8387 |  |
| train:chooseNStep:confirm | 22 | 17 | 288.2466 | 170.9322 | 1.6863 |  |
| assault:chooseNStep:confirm | 16 | 12 | 0.0315 | 0.0222 | 1.4189 |  |
| event-decision:chooseNStep:add | 48 | 30 | 32.9084 | 24.095 | 1.3658 |  |
| govern:chooseNStep:confirm | 44 | 35 | 376.0671 | 275.8306 | 1.3634 |  |
| coupCommitmentResolve | 3 | 3 | 5.7577 | 4.2317 | 1.3606 |  |
| assault:chooseNStep:add | 8 | 6 | 0.0654 | 0.0496 | 1.3185 |  |
| transport | 4 | 3 | 54.5174 | 44.1992 | 1.2334 |  |
| train:chooseOne | 12 | 11 | 5.2877 | 4.5371 | 1.1654 |  |
| advise:chooseNStep:add | 13 | 15 | 0.1247 | 0.1073 | 1.1622 |  |
| govern | 47 | 35 | 64.5221 | 55.705 | 1.1583 |  |
| march:chooseNStep:add | 21 | 22 | 0.0616 | 0.0553 | 1.1139 |  |
| advise:chooseOne | 27 | 30 | 0.0394 | 0.0354 | 1.113 |  |
| coupRedeployPass | 32 | 24 | 8.9245 | 8.0941 | 1.1026 |  |
| event-decision:chooseNStep:confirm | 47 | 27 | 0.0333 | 0.0308 | 1.0812 |  |
| govern:chooseNStep:add | 55 | 35 | 216.811 | 202.3626 | 1.0714 |  |
| coupArvnRedeployOptionalTroops:chooseOne | 84 | 60 | 20.4573 | 19.2742 | 1.0614 |  |
| assault | 8 | 6 | 8.6069 | 8.3072 | 1.0361 |  |
| rally:chooseNStep:confirm | 77 | 72 | 0.034 | 0.0329 | 1.0334 |  |
| coupArvnRedeployOptionalTroops | 32 | 25 | 41.2276 | 40.0813 | 1.0286 |  |
| advise:chooseNStep:confirm | 13 | 15 | 0.0434 | 0.0427 | 1.0164 |  |
| coupCommitmentResolve:chooseNStep:confirm | 12 | 12 | 0.0288 | 0.0285 | 1.0105 |  |
| march | 15 | 13 | 5.835 | 5.7747 | 1.0104 |  |
| govern:chooseOne | 58 | 35 | 3.3871 | 3.3533 | 1.0101 |  |
| infiltrate | 16 | 8 | 9.6422 | 9.6578 | 0.9984 |  |
| chooseNStep:chooseNStep:confirm | 6 | 3 | 0.0398 | 0.04 | 0.995 |  |
| coupArvnRedeployPolice | 27 | 32 | 31.2132 | 31.409 | 0.9938 |  |
| coupPacifyARVN | 11 | 8 | 9.0524 | 9.2342 | 0.9803 |  |
| coupCommitmentPass | 32 | 24 | 3.1589 | 3.2244 | 0.9797 |  |
| coupPacifyUS | 25 | 26 | 8.4484 | 8.6602 | 0.9755 |  |
| train | 8 | 7 | 30.2736 | 31.4414 | 0.9629 |  |
| attack | 4 | 8 | 10.6807 | 11.1661 | 0.9565 |  |
| coupVictoryCheck | 8 | 6 | 3.4631 | 3.6444 | 0.9503 |  |
| rally:chooseOne | 70 | 57 | 0.0317 | 0.0334 | 0.9491 |  |
| coupResourcesResolve | 8 | 6 | 3.5382 | 3.7403 | 0.946 |  |
| ambushVc:chooseNStep:add | 7 | 3 | 0.0435 | 0.0464 | 0.9375 |  |
| ambushVc | 7 | 4 | 13.6498 | 15.0493 | 0.907 |  |
| coupPacifyPass | 16 | 12 | 3.9987 | 4.4916 | 0.8903 |  |
| coupAgitatePass | 8 | 6 | 3.3188 | 3.7552 | 0.8838 |  |
| ambushVc:chooseOne | 7 | 4 | 0.02 | 0.0232 | 0.8621 |  |
| coupAgitateVC | 22 | 25 | 7.874 | 9.1575 | 0.8598 |  |
| event | 109 | 77 | 74.9525 | 88.2536 | 0.8493 |  |
| rally | 67 | 54 | 20.1886 | 24.3412 | 0.8294 |  |
| march:chooseNStep:confirm | 35 | 29 | 0.034 | 0.0418 | 0.8134 |  |
| rally:chooseNStep:add | 68 | 56 | 0.0676 | 0.085 | 0.7953 |  |
| advise | 13 | 15 | 9.8102 | 13.2239 | 0.7419 |  |
| chooseOne:chooseOne | 13 | 8 | 0.6762 | 0.9639 | 0.7015 |  |
| infiltrate:chooseNStep:confirm | 26 | 12 | 0.0267 | 0.0383 | 0.6971 |  |
| infiltrate:chooseOne | 23 | 13 | 0.0297 | 0.0443 | 0.6704 |  |
| coupNvaRedeployTroops:chooseOne | 25 | 2 | 0.0385 | 0.0601 | 0.6406 |  |
| ambushVc:chooseNStep:confirm | 7 | 3 | 0.0242 | 0.0379 | 0.6385 |  |
| train:chooseNStep:add | 14 | 11 | 965.2246 | 1632.4588 | 0.5913 |  |
| transport:chooseOne | 8 | 6 | 36.4109 | 74.8061 | 0.4867 |  |
| infiltrate:chooseNStep:add | 16 | 8 | 0.049 | 0.1213 | 0.404 |  |

## Notes

- `elapsedMs` is measured around the per-decision `PolicyAgent.chooseDecision` call. It excludes simulator apply/delta work and report rendering.
- Child processes enforce the per-seed timeout. Each child loads the built engine and production FITL GameSpecDoc, using the repo GameDef cache when available.
- The script does not modify engine source or production profile data.
