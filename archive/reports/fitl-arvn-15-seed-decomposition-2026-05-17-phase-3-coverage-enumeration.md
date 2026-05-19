# FITL ARVN 15-Seed Per-Microturn-Class Decomposition

**Status**: ✅ EXPLOITED — archived 2026-05-19.

**Date**: 2026-05-17-phase-3-coverage-enumeration
**Status**: Spec 173 measurement witness.
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 600000 --date 2026-05-17-phase-3-coverage-enumeration`
**CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-3-coverage-enumeration.csv`

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
| 1000 | OK | terminal | 5100.66 | 159 | 32.0796 |  |
| 1001 | OK | terminal | 6787.42 | 193 | 35.168 |  |
| 1002 | OK | terminal | 4349.22 | 148 | 29.3866 |  |
| 1003 | OK | terminal | 7799.57 | 226 | 34.5114 |  |
| 1004 | OK | terminal | 12331.89 | 344 | 35.8485 |  |
| 1005 | OK | terminal | 42193.65 | 398 | 106.0142 |  |
| 1006 | OK | terminal | 9502.44 | 228 | 41.6774 |  |
| 1007 | OK | terminal | 6484.37 | 218 | 29.7448 |  |
| 1008 | OK | terminal | 18054.97 | 346 | 52.182 |  |
| 1009 | OK | terminal | 10960.09 | 292 | 37.5346 |  |
| 1010 | OK | terminal | 31362.76 | 339 | 92.5155 |  |
| 1011 | OK | terminal | 6670.73 | 206 | 32.3822 |  |
| 1012 | OK | terminal | 15305.3 | 201 | 76.1458 |  |
| 1013 | OK | terminal | 6913.58 | 258 | 26.7968 |  |
| 1014 | OK | terminal | 16566.12 | 213 | 77.7752 |  |

## Per-Microturn-Class Rollup

| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | WASM preview-drive routes | WASM preview-drive unsupported | WASM preview-drive unsupported reasons | WASM preview-drive batches | Token index builds | Static rebuilds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|
| train:chooseNStep:add | 37 | 36448.44 | 985.0931 | 3340.7136 | 13534.3437 | 17.4865 | 0 | 5183 | 7420 | 0 | 0 | 359 | 13 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:13 | 0 | 0 | 0 |
| govern:chooseNStep:confirm | 115 | 29449.24 | 256.0804 | 462.9733 | 9509.2863 | 6.6957 | 0 | 2505 | 1135 | 0 | 0 | 0 | 520 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:520 | 0 | 0 | 0 |
| govern:chooseNStep:add | 135 | 24093.19 | 178.4681 | 281.7946 | 3793.4361 | 6.0815 | 0 | 3770 | 5825 | 0 | 0 | 708 | 73 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:73 | 0 | 0 | 0 |
| event | 248 | 20265.78 | 81.7168 | 80.5263 | 4646.639 | 19.121 | 248 | 0 | 0 | 248 | 234 | 0 | 276 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:276 | 0 | 38 | 278 |
| coupArvnRedeployPolice:chooseOne | 153 | 13773.88 | 90.0253 | 273.5274 | 286.5465 | 30.3922 | 0 | 105697 | 3591 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| train:chooseNStep:confirm | 59 | 9162.67 | 155.2995 | 1546.3067 | 3002.9667 | 3.0508 | 0 | 1810 | 3782 | 0 | 0 | 72 | 12 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:12 | 0 | 0 | 0 |
| govern | 118 | 6362.31 | 53.9179 | 76.412 | 568.129 | 10.7797 | 111 | 0 | 7 | 111 | 96 | 42 | 236 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:132; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:104 | 146 | 0 | 111 |
| coupArvnRedeployOptionalTroops:chooseOne | 215 | 3858.07 | 17.9445 | 29.9661 | 38.0437 | 8.3907 | 0 | 13517 | 1865 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| coupArvnRedeployOptionalTroops | 88 | 3343 | 37.9887 | 45.89 | 48.9197 | 17.2159 | 71 | 0 | 17 | 71 | 0 | 36 | 176 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:176 | 212 | 0 | 71 |
| rally | 165 | 3268.87 | 19.8113 | 42.4562 | 138.066 | 15.0667 | 146 | 0 | 19 | 146 | 100 | 381 | 215 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:198; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:17 | 398 | 0 | 146 |
| coupArvnRedeployPolice | 86 | 2448.75 | 28.4739 | 33.5667 | 42.8756 | 11.6744 | 85 | 0 | 1 | 85 | 0 | 20 | 172 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:172 | 192 | 0 | 85 |
| event-decision:chooseNStep:add | 96 | 2140.13 | 22.293 | 215.6381 | 370.2152 | 11.4479 | 0 | 250 | 1045 | 0 | 0 | 63 | 14 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:14 | 0 | 0 | 0 |
| transport:chooseOne | 14 | 684.01 | 48.8578 | 102.893 | 102.893 | 16.7143 | 0 | 952 | 37 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| coupRedeployPass | 80 | 668.6 | 8.3575 | 27.241 | 39.3082 | 2.95 | 32 | 0 | 48 | 32 | 15 | 82 | 40 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:40 | 122 | 0 | 32 |
| coupPacifyUS | 76 | 606.63 | 7.982 | 12.7989 | 14.4073 | 2.8158 | 76 | 0 | 0 | 76 | 0 | 106 | 46 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:46 | 152 | 0 | 76 |
| train | 23 | 584.4 | 25.4085 | 47.9611 | 54.6481 | 5.4348 | 23 | 0 | 0 | 23 | 12 | 108 | 20 | agent-guided-completion/production-preview-drive.chooseN/only origin-seat greedy chooseN publication is supported:12; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:4; unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:4 | 124 | 0 | 23 |
| coupAgitateVC | 69 | 548.84 | 7.9542 | 11.1131 | 12.4284 | 2.971 | 52 | 0 | 17 | 52 | 12 | 184 | 92 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:92 | 276 | 0 | 52 |
| patrol | 1 | 535.63 | 535.6325 | 535.6325 | 535.6325 | 4 | 1 | 0 | 0 | 1 | 0 | 0 | 1 | agent-guided-completion/production-preview-drive.chooseN/only origin-seat greedy chooseN publication is supported:1 | 1 | 0 | 1 |
| advise | 43 | 467.56 | 10.8735 | 34.1669 | 41.5219 | 11.4186 | 32 | 0 | 11 | 32 | 8 | 164 | 4 | agent-guided-completion/production-preview-drive.chooseN/only origin-seat greedy chooseN publication is supported:3; unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:1 | 167 | 0 | 32 |
| govern:chooseOne | 138 | 431.38 | 3.1259 | 4.1833 | 8.6968 | 2 | 0 | 178 | 178 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate | 37 | 346.95 | 9.3771 | 11.6794 | 17.25 | 48.4324 | 30 | 0 | 7 | 30 | 16 | 136 | 0 |  | 136 | 0 | 30 |
| transport | 7 | 323.99 | 46.2837 | 53.8796 | 53.8796 | 11.7143 | 7 | 0 | 0 | 7 | 0 | 0 | 14 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:10; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:4 | 4 | 0 | 7 |
| coupArvnRedeployMandatory:chooseOne | 13 | 298.66 | 22.9739 | 32.2457 | 32.2457 | 8 | 0 | 1435 | 205 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| coupPacifyARVN | 31 | 266.19 | 8.5869 | 11.5874 | 13.1997 | 3.7742 | 14 | 0 | 17 | 14 | 30 | 66 | 30 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:28; unsupported-effect/production-preview-drive.effect.popInterruptPhase/unsupported production preview-drive effect popInterruptPhase:2 | 96 | 0 | 14 |
| coupCommitmentPass | 80 | 240.89 | 3.0112 | 4.2699 | 5.2033 | 1.1375 | 9 | 0 | 71 | 9 | 2 | 131 | 0 |  | 131 | 0 | 9 |
| march | 40 | 231.23 | 5.7807 | 9.8783 | 9.9716 | 8.9 | 30 | 0 | 10 | 30 | 66 | 107 | 0 |  | 107 | 0 | 30 |
| coupNvaRedeployTroops | 19 | 171.27 | 9.0144 | 21.5051 | 21.5051 | 3.7368 | 12 | 0 | 7 | 12 | 0 | 14 | 12 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:12 | 26 | 0 | 12 |
| assault | 21 | 163.23 | 7.7729 | 9.2602 | 10.2124 | 4.8095 | 20 | 0 | 1 | 20 | 3 | 80 | 0 |  | 80 | 0 | 20 |
| coupPacifyPass | 40 | 160.05 | 4.0011 | 5.0697 | 11.7176 | 1.15 | 37 | 0 | 3 | 37 | 2 | 60 | 2 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:2 | 62 | 0 | 37 |
| ambushVc | 12 | 153.22 | 12.7682 | 23.0022 | 23.0022 | 8.1667 | 11 | 0 | 1 | 11 | 0 | 38 | 14 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:14 | 38 | 0 | 11 |
| attack | 14 | 152.69 | 10.9067 | 22.3632 | 22.3632 | 31.6429 | 12 | 0 | 2 | 12 | 0 | 44 | 6 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:6 | 44 | 0 | 12 |
| train:chooseOne | 35 | 151.53 | 4.3294 | 5.7192 | 7.4264 | 2.3143 | 0 | 66 | 99 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| coupArvnRedeployMandatory | 3 | 117.4 | 39.1322 | 43.7314 | 43.7314 | 11.3333 | 1 | 0 | 2 | 1 | 0 | 4 | 6 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:6 | 10 | 0 | 1 |
| coupAgitatePass | 20 | 68.65 | 3.4327 | 4.6214 | 4.9003 | 1.25 | 17 | 0 | 3 | 17 | 0 | 50 | 0 |  | 50 | 0 | 17 |
| coupResourcesResolve | 20 | 68.54 | 3.4272 | 4.4525 | 5.4553 | 1 | 3 | 0 | 17 | 3 | 0 | 20 | 0 |  | 20 | 0 | 3 |
| coupVictoryCheck | 20 | 64.57 | 3.2287 | 3.9698 | 5.6453 | 1 | 20 | 0 | 0 | 20 | 4 | 20 | 0 |  | 20 | 0 | 20 |
| coupCommitmentResolve | 9 | 35.62 | 3.9579 | 4.9625 | 4.9625 | 2 | 0 | 0 | 9 | 0 | 0 | 18 | 0 |  | 18 | 0 | 0 |
| ambushNva | 5 | 31.82 | 6.3648 | 10.5775 | 10.5775 | 15.2 | 5 | 0 | 0 | 5 | 0 | 11 | 0 |  | 11 | 0 | 5 |
| chooseOne:chooseOne | 31 | 19.37 | 0.6249 | 7.047 | 8.4039 | 5.2903 | 0 | 7 | 2 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| resolveHonoluluPacify | 3 | 14.4 | 4.7996 | 4.8361 | 4.8361 | 1 | 3 | 0 | 0 | 3 | 0 | 0 | 4 | unsupported-effect/production-preview-drive.effect.popInterruptPhase/unsupported production preview-drive effect popInterruptPhase:4 | 4 | 0 | 3 |
| rally:chooseNStep:add | 168 | 11.42 | 0.068 | 0.1052 | 0.7932 | 20.75 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally:chooseNStep:confirm | 209 | 6.24 | 0.0299 | 0.0615 | 0.1199 | 14.7943 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| event-decision:chooseOne | 34 | 6.13 | 0.1803 | 0.5937 | 4.2897 | 3.6471 | 0 | 1 | 1 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| rally:chooseOne | 172 | 4.85 | 0.0282 | 0.0694 | 0.1403 | 1.3547 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| advise:chooseNStep:add | 43 | 3.89 | 0.0904 | 0.229 | 0.699 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| pass | 1 | 3.14 | 3.1374 | 3.1374 | 3.1374 | 1 | 1 | 0 | 0 | 1 | 0 | 1 | 0 |  | 1 | 0 | 1 |
| march:chooseNStep:add | 57 | 2.9 | 0.0508 | 0.0919 | 0.0978 | 11.614 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| march:chooseNStep:confirm | 91 | 2.82 | 0.031 | 0.0592 | 0.1019 | 5.2198 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| advise:chooseOne | 87 | 2.77 | 0.0319 | 0.0556 | 0.1148 | 2.4368 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| event-decision:chooseNStep:confirm | 89 | 2.54 | 0.0285 | 0.0829 | 0.168 | 6.5169 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate:chooseNStep:add | 37 | 2.08 | 0.0563 | 0.0605 | 0.6165 | 3.7027 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| coupNvaRedeployTroops:chooseOne | 43 | 1.64 | 0.0382 | 0.0741 | 0.0758 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate:chooseOne | 57 | 1.6 | 0.028 | 0.0697 | 0.1307 | 1.614 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| advise:chooseNStep:confirm | 43 | 1.58 | 0.0367 | 0.0616 | 0.074 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| infiltrate:chooseNStep:confirm | 55 | 1.32 | 0.0241 | 0.0408 | 0.0907 | 4.4909 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| coupCommitmentResolve:chooseNStep:confirm | 36 | 1.02 | 0.0283 | 0.0787 | 0.0859 | 9.25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| assault:chooseNStep:add | 21 | 0.97 | 0.0462 | 0.0646 | 0.1183 | 3.0952 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| assault:chooseNStep:confirm | 42 | 0.92 | 0.0219 | 0.0354 | 0.0743 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushVc:chooseNStep:add | 12 | 0.48 | 0.0396 | 0.0575 | 0.0575 | 3.4167 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| chooseNStep:chooseNStep:confirm | 10 | 0.37 | 0.0371 | 0.0569 | 0.0569 | 18.2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushVc:chooseNStep:confirm | 12 | 0.29 | 0.0244 | 0.0588 | 0.0588 | 4.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushVc:chooseOne | 12 | 0.25 | 0.0209 | 0.0618 | 0.0618 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushNva:chooseOne | 5 | 0.14 | 0.0272 | 0.0552 | 0.0552 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushNva:chooseNStep:add | 3 | 0.12 | 0.0409 | 0.0461 | 0.0461 | 3.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| assault:chooseOne | 4 | 0.11 | 0.0281 | 0.0306 | 0.0306 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| ambushNva:chooseNStep:confirm | 3 | 0.07 | 0.0217 | 0.0234 | 0.0234 | 3.6667 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| patrol:chooseNStep:confirm | 3 | 0.06 | 0.0204 | 0.0214 | 0.0214 | 4.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |
| patrol:chooseNStep:add | 1 | 0.05 | 0.0532 | 0.0532 | 0.0532 | 17 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 |

## Top Hot Axes In Slow-Tier Seeds

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.

| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms |
|---:|---|---|---:|---:|---:|---:|---:|
| 1 | govern:chooseNStep:confirm | continuedDeepening | 33 | 15311.61 | 463.9881 | 494.3505 | 9509.2863 |
| 2 | train:chooseNStep:add | continuedDeepening | 14 | 12549.88 | 896.42 | 3340.7136 | 3340.7136 |
| 3 | govern:chooseNStep:add | continuedDeepening | 55 | 11090.49 | 201.6452 | 298.0062 | 3793.4361 |
| 4 | event | singlePass | 109 | 7598.13 | 69.7076 | 160.5464 | 2866.3319 |
| 5 | coupArvnRedeployPolice:chooseOne | continuedDeepening | 58 | 6815.04 | 117.5008 | 279.7547 | 286.5465 |
| 6 | train:chooseNStep:confirm | continuedDeepening | 12 | 6091.52 | 507.6267 | 3002.9667 | 3002.9667 |
| 7 | govern | singlePass | 47 | 2809.63 | 59.7793 | 76.412 | 568.129 |
| 8 | coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | 84 | 1564.05 | 18.6196 | 29.8704 | 38.0437 |
| 9 | event-decision:chooseNStep:add | continuedDeepening | 6 | 1470.69 | 245.1143 | 370.2152 | 370.2152 |
| 10 | rally | singlePass | 67 | 1229.87 | 18.3563 | 43.9371 | 49.1637 |

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
| event-decision:chooseOne | 12 | 6 | 0.3881 | 0.1376 | 2.8205 |  |
| coupNvaRedeployTroops | 11 | 1 | 9.3906 | 3.7106 | 2.5307 |  |
| coupArvnRedeployPolice:chooseOne | 58 | 50 | 117.5008 | 65.3623 | 1.7977 |  |
| train:chooseNStep:confirm | 22 | 17 | 276.9307 | 162.0354 | 1.7091 |  |
| event-decision:chooseNStep:add | 48 | 30 | 30.6687 | 22.2372 | 1.3792 |  |
| govern:chooseNStep:confirm | 44 | 35 | 348.0126 | 253.5857 | 1.3724 |  |
| transport | 4 | 3 | 50.471 | 40.7006 | 1.2401 |  |
| coupCommitmentResolve:chooseNStep:confirm | 12 | 12 | 0.0289 | 0.0238 | 1.2143 |  |
| march:chooseNStep:add | 21 | 22 | 0.0544 | 0.0463 | 1.1749 |  |
| govern | 47 | 35 | 59.7793 | 51.793 | 1.1542 |  |
| chooseNStep:chooseNStep:confirm | 6 | 3 | 0.038 | 0.0334 | 1.1377 |  |
| train:chooseOne | 12 | 11 | 4.6638 | 4.1014 | 1.1371 |  |
| advise:chooseOne | 27 | 30 | 0.0357 | 0.0317 | 1.1262 |  |
| assault:chooseNStep:confirm | 16 | 12 | 0.0242 | 0.0217 | 1.1152 |  |
| event-decision:chooseNStep:confirm | 47 | 27 | 0.0305 | 0.0274 | 1.1131 |  |
| advise:chooseNStep:confirm | 13 | 15 | 0.0398 | 0.0362 | 1.0994 |  |
| assault:chooseNStep:add | 8 | 6 | 0.0494 | 0.0451 | 1.0953 |  |
| assault | 8 | 6 | 8.076 | 7.4736 | 1.0806 |  |
| govern:chooseNStep:add | 55 | 35 | 201.6452 | 187.4677 | 1.0756 |  |
| rally:chooseNStep:confirm | 77 | 72 | 0.0314 | 0.0293 | 1.0717 |  |
| coupRedeployPass | 32 | 24 | 8.7386 | 8.2568 | 1.0584 |  |
| advise:chooseNStep:add | 13 | 15 | 0.1071 | 0.102 | 1.05 |  |
| coupCommitmentResolve | 3 | 3 | 4.0669 | 3.9851 | 1.0205 |  |
| coupArvnRedeployOptionalTroops:chooseOne | 84 | 60 | 18.6196 | 18.371 | 1.0135 |  |
| coupArvnRedeployPolice | 27 | 32 | 28.8169 | 28.511 | 1.0107 |  |
| coupArvnRedeployOptionalTroops | 32 | 25 | 38.4181 | 38.2618 | 1.0041 |  |
| march | 15 | 13 | 5.4058 | 5.3998 | 1.0011 |  |
| attack | 4 | 8 | 10.0935 | 10.0979 | 0.9996 |  |
| coupPacifyUS | 25 | 26 | 8.0866 | 8.1013 | 0.9982 |  |
| coupCommitmentPass | 32 | 24 | 3.0043 | 3.019 | 0.9951 |  |
| coupVictoryCheck | 8 | 6 | 3.1704 | 3.3059 | 0.959 |  |
| coupResourcesResolve | 8 | 6 | 3.2444 | 3.393 | 0.9562 |  |
| coupPacifyARVN | 11 | 8 | 8.4259 | 8.8593 | 0.9511 |  |
| infiltrate | 16 | 8 | 9.0307 | 9.5656 | 0.9441 |  |
| train | 8 | 7 | 27.8796 | 29.5964 | 0.942 |  |
| govern:chooseOne | 58 | 35 | 2.9955 | 3.2044 | 0.9348 |  |
| coupAgitatePass | 8 | 6 | 3.1862 | 3.4989 | 0.9106 |  |
| rally:chooseOne | 70 | 57 | 0.0269 | 0.0297 | 0.9057 |  |
| event | 109 | 77 | 69.7076 | 79.7902 | 0.8736 |  |
| march:chooseNStep:confirm | 35 | 29 | 0.029 | 0.035 | 0.8286 |  |
| rally | 67 | 54 | 18.3563 | 22.2335 | 0.8256 |  |
| coupPacifyPass | 16 | 12 | 3.6326 | 4.4778 | 0.8112 |  |
| ambushVc | 7 | 4 | 11.7717 | 14.5413 | 0.8095 |  |
| coupAgitateVC | 22 | 25 | 7.0398 | 8.7437 | 0.8051 |  |
| ambushVc:chooseNStep:add | 7 | 3 | 0.0386 | 0.0485 | 0.7959 |  |
| infiltrate:chooseOne | 23 | 13 | 0.0264 | 0.035 | 0.7543 |  |
| rally:chooseNStep:add | 68 | 56 | 0.0593 | 0.0793 | 0.7478 |  |
| advise | 13 | 15 | 8.8109 | 12.2791 | 0.7176 |  |
| infiltrate:chooseNStep:confirm | 26 | 12 | 0.0222 | 0.032 | 0.6938 |  |
| coupNvaRedeployTroops:chooseOne | 25 | 2 | 0.0397 | 0.0576 | 0.6892 |  |
| ambushVc:chooseNStep:confirm | 7 | 3 | 0.0223 | 0.0338 | 0.6598 |  |
| ambushVc:chooseOne | 7 | 4 | 0.0176 | 0.0281 | 0.6263 |  |
| chooseOne:chooseOne | 13 | 8 | 0.664 | 1.0928 | 0.6076 |  |
| train:chooseNStep:add | 14 | 11 | 896.42 | 1567.7896 | 0.5718 |  |
| transport:chooseOne | 8 | 6 | 33.632 | 69.1588 | 0.4863 |  |
| infiltrate:chooseNStep:add | 16 | 8 | 0.0399 | 0.115 | 0.347 |  |

## Notes

- `elapsedMs` is measured around the per-decision `PolicyAgent.chooseDecision` call. It excludes simulator apply/delta work and report rendering.
- Child processes enforce the per-seed timeout. Each child loads the built engine and production FITL GameSpecDoc, using the repo GameDef cache when available.
- The script does not modify engine source or production profile data.
