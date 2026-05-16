# FITL ARVN 15-Seed Per-Microturn-Class Decomposition

**Date**: 2026-05-17-phase-0-wasm-on-timed
**Status**: Spec 173 measurement witness.
**Command**: `POLICY_WASM_TIMING_PROFILE=1 node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 600000 --date 2026-05-17-phase-0-wasm-on-timed`
**CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-0-wasm-on-timed.csv`

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

## Per-Seed Wall Time

| Seed | Status | Stop Reason | Wall ms | Decisions | ms/decision | Error |
|---:|---|---|---:|---:|---:|---|
| 1000 | OK | terminal | 5414.07 | 159 | 34.0508 |  |
| 1001 | OK | terminal | 7121.07 | 193 | 36.8967 |  |
| 1002 | OK | terminal | 4529.87 | 148 | 30.6072 |  |
| 1003 | OK | terminal | 7986.2 | 226 | 35.3372 |  |
| 1004 | OK | terminal | 13410.2 | 344 | 38.9831 |  |
| 1005 | OK | terminal | 43792.62 | 398 | 110.0317 |  |
| 1006 | OK | terminal | 10211.49 | 228 | 44.7872 |  |
| 1007 | OK | terminal | 6595.96 | 218 | 30.2567 |  |
| 1008 | OK | terminal | 18574.33 | 346 | 53.683 |  |
| 1009 | OK | terminal | 12089.08 | 292 | 41.401 |  |
| 1010 | OK | terminal | 32825.08 | 339 | 96.8291 |  |
| 1011 | OK | terminal | 7149.98 | 206 | 34.7086 |  |
| 1012 | OK | terminal | 16094.59 | 201 | 80.0726 |  |
| 1013 | OK | terminal | 7640.52 | 258 | 29.6144 |  |
| 1014 | OK | terminal | 17242.93 | 213 | 80.9527 |  |

## Per-Microturn-Class Rollup

| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | WASM preview-drive routes | WASM preview-drive unsupported | WASM preview-drive unsupported reasons | WASM preview-drive batches | WASM timing calls | Marshaling ms | Execution ms | Deserialization ms | Token index builds | Static rebuilds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|
| train:chooseNStep:add | 37 | 37854.22 | 1023.0871 | 3362.7828 | 13808.8529 | 17.4865 | 0 | 5183 | 7420 | 0 | 0 | 359 | 13 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:13 | 0 | 1044 | 35.3189 | 3.627 | 14.3703 | 0 | 0 |
| govern:chooseNStep:confirm | 115 | 31116.03 | 270.5741 | 497.504 | 9842.8188 | 6.6957 | 0 | 2505 | 1135 | 0 | 0 | 0 | 520 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:520 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| govern:chooseNStep:add | 135 | 25607.14 | 189.6825 | 310.5046 | 4020.1116 | 6.0815 | 0 | 3770 | 5825 | 0 | 0 | 708 | 73 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:73 | 0 | 2124 | 87.0324 | 9.2958 | 35.7243 | 0 | 0 |
| event | 248 | 21243.34 | 85.6586 | 83.5027 | 4827.3659 | 19.121 | 248 | 0 | 0 | 248 | 234 | 0 | 276 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:276 | 0 | 2562 | 210.7026 | 100.248 | 3.2764 | 38 | 278 |
| coupArvnRedeployPolice:chooseOne | 153 | 14497.79 | 94.7568 | 285.5561 | 303.3242 | 30.3922 | 0 | 105697 | 3591 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| train:chooseNStep:confirm | 59 | 9546.03 | 161.7972 | 1605.2171 | 3009.9894 | 3.0508 | 0 | 1810 | 3782 | 0 | 0 | 72 | 12 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:12 | 0 | 624 | 18.2642 | 2.3831 | 8.3874 | 0 | 0 |
| govern | 118 | 6682.57 | 56.6319 | 78.1369 | 586.7154 | 10.7797 | 111 | 0 | 7 | 111 | 96 | 42 | 236 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:132; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:104 | 146 | 986 | 68.5384 | 34.2534 | 6.0173 | 0 | 111 |
| coupArvnRedeployOptionalTroops:chooseOne | 215 | 4091.35 | 19.0295 | 32.39 | 39.4041 | 8.3907 | 0 | 13517 | 1865 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupArvnRedeployOptionalTroops | 88 | 3497.56 | 39.745 | 47.9799 | 50.0423 | 17.2159 | 71 | 0 | 17 | 71 | 0 | 36 | 176 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:176 | 212 | 740 | 72.1895 | 25.5639 | 3.902 | 0 | 71 |
| rally | 165 | 3475.7 | 21.0649 | 44.0265 | 146.567 | 15.0667 | 146 | 0 | 19 | 146 | 100 | 381 | 215 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:198; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:17 | 398 | 1212 | 117.2179 | 33.3155 | 25.9922 | 0 | 146 |
| coupArvnRedeployPolice | 86 | 2567.6 | 29.8558 | 35.2561 | 39.9398 | 11.6744 | 85 | 0 | 1 | 85 | 0 | 20 | 172 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:172 | 192 | 708 | 63.6175 | 24.1642 | 2.6797 | 0 | 85 |
| event-decision:chooseNStep:add | 96 | 2205.19 | 22.9707 | 241.8379 | 370.0337 | 11.4479 | 0 | 250 | 1045 | 0 | 0 | 63 | 14 | unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state:14 | 0 | 69 | 3.1198 | 0.3434 | 1.2663 | 0 | 0 |
| transport:chooseOne | 14 | 709.65 | 50.6891 | 108.6155 | 108.6155 | 16.7143 | 0 | 952 | 37 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupRedeployPass | 80 | 668 | 8.35 | 26.7778 | 35.6615 | 2.95 | 32 | 0 | 48 | 32 | 15 | 82 | 40 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:40 | 122 | 842 | 51.5663 | 25.2966 | 6.449 | 0 | 32 |
| coupPacifyUS | 76 | 634.36 | 8.3468 | 12.8934 | 14.9717 | 2.8158 | 76 | 0 | 0 | 76 | 0 | 106 | 46 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:46 | 152 | 896 | 58.7191 | 27.0485 | 8.8536 | 0 | 76 |
| train | 23 | 597.74 | 25.9888 | 51.9505 | 56.1673 | 5.4348 | 23 | 0 | 0 | 23 | 12 | 108 | 20 | agent-guided-completion/production-preview-drive.chooseN/only origin-seat greedy chooseN publication is supported:12; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:4; unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:4 | 124 | 318 | 21.3867 | 7.5379 | 6.1919 | 0 | 23 |
| coupAgitateVC | 69 | 585.13 | 8.4801 | 12.1159 | 13.7416 | 2.971 | 52 | 0 | 17 | 52 | 12 | 184 | 92 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:92 | 276 | 506 | 40.6555 | 12.1858 | 12.9569 | 0 | 52 |
| patrol | 1 | 573.7 | 573.6987 | 573.6987 | 573.6987 | 4 | 1 | 0 | 0 | 1 | 0 | 0 | 1 | agent-guided-completion/production-preview-drive.chooseN/only origin-seat greedy chooseN publication is supported:1 | 1 | 10 | 0.4069 | 0.3242 | 0.0042 | 0 | 1 |
| advise | 43 | 484.04 | 11.2566 | 36.1559 | 45.0504 | 11.4186 | 32 | 0 | 11 | 32 | 8 | 164 | 4 | agent-guided-completion/production-preview-drive.chooseN/only origin-seat greedy chooseN publication is supported:3; unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:1 | 167 | 633 | 49.716 | 18.2865 | 11.3693 | 0 | 32 |
| govern:chooseOne | 138 | 475.4 | 3.4449 | 4.7852 | 10.0968 | 2 | 0 | 178 | 178 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate | 37 | 374.71 | 10.1274 | 13.8124 | 18.0927 | 48.4324 | 30 | 0 | 7 | 30 | 16 | 136 | 0 |  | 136 | 617 | 58.0656 | 18.9868 | 8.6777 | 0 | 30 |
| transport | 7 | 330.8 | 47.2571 | 55.1296 | 55.1296 | 11.7143 | 7 | 0 | 0 | 7 | 0 | 0 | 14 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:10; unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:4 | 4 | 56 | 3.178 | 1.8842 | 0.0318 | 0 | 7 |
| coupArvnRedeployMandatory:chooseOne | 13 | 308.04 | 23.6953 | 31.5053 | 31.5053 | 8 | 0 | 1435 | 205 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupPacifyARVN | 31 | 278.73 | 8.9913 | 12.2057 | 13.2339 | 3.7742 | 14 | 0 | 17 | 14 | 30 | 66 | 30 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:28; unsupported-effect/production-preview-drive.effect.popInterruptPhase/unsupported production preview-drive effect popInterruptPhase:2 | 96 | 346 | 23.3704 | 9.7506 | 4.2749 | 0 | 14 |
| coupCommitmentPass | 80 | 262.32 | 3.279 | 5.2998 | 5.6481 | 1.1375 | 9 | 0 | 71 | 9 | 2 | 131 | 0 |  | 131 | 931 | 57.9742 | 27.6783 | 9.0425 | 0 | 9 |
| march | 40 | 249.56 | 6.2389 | 10.5333 | 10.8245 | 8.9 | 30 | 0 | 10 | 30 | 66 | 107 | 0 |  | 107 | 578 | 40.0453 | 16.5152 | 8.3935 | 0 | 30 |
| coupNvaRedeployTroops | 19 | 189.44 | 9.9706 | 22.3294 | 22.3294 | 3.7368 | 12 | 0 | 7 | 12 | 0 | 14 | 12 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:12 | 26 | 249 | 13.336 | 7.7386 | 1.0547 | 0 | 12 |
| assault | 21 | 178.03 | 8.4778 | 11.6922 | 16.2385 | 4.8095 | 20 | 0 | 1 | 20 | 3 | 80 | 0 |  | 80 | 311 | 20.9936 | 8.2023 | 6.049 | 0 | 20 |
| ambushVc | 12 | 169.05 | 14.0873 | 25.8879 | 25.8879 | 8.1667 | 11 | 0 | 1 | 11 | 0 | 38 | 14 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:14 | 38 | 96 | 7.9278 | 2.2429 | 2.3144 | 0 | 11 |
| coupPacifyPass | 40 | 163.83 | 4.0957 | 5.4205 | 10.5155 | 1.15 | 37 | 0 | 3 | 37 | 2 | 60 | 2 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:2 | 62 | 478 | 26.8476 | 14.1362 | 5.0429 | 0 | 37 |
| attack | 14 | 159.18 | 11.3697 | 25.7967 | 25.7967 | 31.6429 | 12 | 0 | 2 | 12 | 0 | 44 | 6 | unsupported-effect/production-preview-drive.cardEventAction/production preview-drive does not route card event action candidates:6 | 44 | 199 | 20.1717 | 5.6878 | 2.3762 | 0 | 12 |
| train:chooseOne | 35 | 159.16 | 4.5474 | 7.9863 | 7.9942 | 2.3143 | 0 | 66 | 99 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupArvnRedeployMandatory | 3 | 116.6 | 38.8651 | 44.3444 | 44.3444 | 11.3333 | 1 | 0 | 2 | 1 | 0 | 4 | 6 | unsupported-effect/production-preview-drive.actionBatch/production preview-drive requires deterministic shared scalar runtime bindings:6 | 10 | 28 | 1.7309 | 0.7973 | 0.2799 | 0 | 1 |
| coupResourcesResolve | 20 | 73.38 | 3.6688 | 4.5807 | 9.9445 | 1 | 3 | 0 | 17 | 3 | 0 | 20 | 0 |  | 20 | 240 | 13.1195 | 7.2953 | 1.6654 | 0 | 3 |
| coupAgitatePass | 20 | 70.45 | 3.5227 | 5.0718 | 5.2321 | 1.25 | 17 | 0 | 3 | 17 | 0 | 50 | 0 |  | 50 | 170 | 11.2223 | 4.2268 | 3.1827 | 0 | 17 |
| coupVictoryCheck | 20 | 66.46 | 3.323 | 4.0916 | 4.4993 | 1 | 20 | 0 | 0 | 20 | 4 | 20 | 0 |  | 20 | 240 | 13.0317 | 7.1493 | 1.7314 | 0 | 20 |
| coupCommitmentResolve | 9 | 43.04 | 4.7827 | 9.0196 | 9.0196 | 2 | 0 | 0 | 9 | 0 | 0 | 18 | 0 |  | 18 | 117 | 6.8771 | 3.1818 | 1.2735 | 0 | 0 |
| ambushNva | 5 | 33.37 | 6.6737 | 10.53 | 10.53 | 15.2 | 5 | 0 | 0 | 5 | 0 | 11 | 0 |  | 11 | 76 | 4.6374 | 2.1892 | 0.6338 | 0 | 5 |
| chooseOne:chooseOne | 31 | 19.22 | 0.6201 | 6.9574 | 8.2661 | 5.2903 | 0 | 7 | 2 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| resolveHonoluluPacify | 3 | 17.3 | 5.7665 | 6.7251 | 6.7251 | 1 | 3 | 0 | 0 | 3 | 0 | 0 | 4 | unsupported-effect/production-preview-drive.effect.popInterruptPhase/unsupported production preview-drive effect popInterruptPhase:4 | 4 | 28 | 1.3801 | 0.894 | 0.0115 | 0 | 3 |
| rally:chooseNStep:add | 168 | 13.76 | 0.0819 | 0.1085 | 0.981 | 20.75 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseNStep:confirm | 209 | 6.57 | 0.0314 | 0.061 | 0.1254 | 14.7943 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| pass | 1 | 5.99 | 5.9886 | 5.9886 | 5.9886 | 1 | 1 | 0 | 0 | 1 | 0 | 1 | 0 |  | 1 | 14 | 1.5199 | 0.9455 | 0.1704 | 0 | 1 |
| event-decision:chooseOne | 34 | 5.72 | 0.1682 | 0.5953 | 3.7819 | 3.6471 | 0 | 1 | 1 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseOne | 172 | 5.25 | 0.0305 | 0.0836 | 0.1345 | 1.3547 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:add | 43 | 4.07 | 0.0946 | 0.221 | 0.7292 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:confirm | 91 | 3.23 | 0.0355 | 0.0716 | 0.1087 | 5.2198 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:add | 57 | 3.2 | 0.0562 | 0.1248 | 0.13 | 11.614 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseOne | 87 | 3.06 | 0.0352 | 0.0772 | 0.1252 | 2.4368 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupNvaRedeployTroops:chooseOne | 43 | 2.75 | 0.0639 | 0.0691 | 1.0188 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseNStep:confirm | 89 | 2.66 | 0.0299 | 0.0738 | 0.1515 | 6.5169 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:add | 37 | 2.16 | 0.0583 | 0.0521 | 0.6021 | 3.7027 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseOne | 57 | 1.73 | 0.0303 | 0.0617 | 0.1846 | 1.614 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:confirm | 43 | 1.64 | 0.0381 | 0.0653 | 0.0757 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:confirm | 55 | 1.45 | 0.0263 | 0.0675 | 0.0816 | 4.4909 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:add | 21 | 1.2 | 0.057 | 0.1294 | 0.1328 | 3.0952 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:confirm | 42 | 1.12 | 0.0266 | 0.0469 | 0.1091 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupCommitmentResolve:chooseNStep:confirm | 36 | 1.05 | 0.029 | 0.0476 | 0.058 | 9.25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:add | 12 | 0.49 | 0.0412 | 0.0582 | 0.0582 | 3.4167 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| chooseNStep:chooseNStep:confirm | 10 | 0.4 | 0.04 | 0.0561 | 0.0561 | 18.2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:confirm | 12 | 0.39 | 0.0324 | 0.0913 | 0.0913 | 4.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseOne | 12 | 0.23 | 0.0195 | 0.0273 | 0.0273 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseNStep:add | 3 | 0.13 | 0.0433 | 0.047 | 0.047 | 3.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseOne | 5 | 0.13 | 0.0258 | 0.0382 | 0.0382 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseOne | 4 | 0.13 | 0.0328 | 0.0341 | 0.0341 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseNStep:confirm | 3 | 0.07 | 0.0219 | 0.0232 | 0.0232 | 3.6667 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| patrol:chooseNStep:confirm | 3 | 0.07 | 0.0227 | 0.0251 | 0.0251 | 4.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| patrol:chooseNStep:add | 1 | 0.06 | 0.0587 | 0.0587 | 0.0587 | 17 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Top Hot Axes In Slow-Tier Seeds

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.

| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms |
|---:|---|---|---:|---:|---:|---:|---:|
| 1 | govern:chooseNStep:confirm | continuedDeepening | 33 | 16075.06 | 487.1229 | 526.2382 | 9842.8188 |
| 2 | train:chooseNStep:add | continuedDeepening | 14 | 12993.19 | 928.0853 | 3362.7828 | 3362.7828 |
| 3 | govern:chooseNStep:add | continuedDeepening | 55 | 11884.4 | 216.0801 | 321.5971 | 4020.1116 |
| 4 | event | singlePass | 109 | 8046.62 | 73.8222 | 169.5268 | 3011.168 |
| 5 | coupArvnRedeployPolice:chooseOne | continuedDeepening | 58 | 7255.34 | 125.092 | 296.5627 | 303.3242 |
| 6 | train:chooseNStep:confirm | continuedDeepening | 12 | 6331.68 | 527.6403 | 3009.9894 | 3009.9894 |
| 7 | govern | singlePass | 47 | 2951.89 | 62.8061 | 77.3581 | 586.7154 |
| 8 | coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | 84 | 1685.18 | 20.0617 | 34.2437 | 38.5446 |
| 9 | event-decision:chooseNStep:add | continuedDeepening | 6 | 1507.56 | 251.2599 | 370.0337 | 370.0337 |
| 10 | coupArvnRedeployOptionalTroops | singlePass | 32 | 1301.89 | 40.684 | 49.7022 | 50.0423 |

## WASM Timing Buckets

| Microturn class | Route class | Calls | Marshaling ms | Execution ms | Deserialization ms |
|---|---|---:|---:|---:|---:|
| event | scoreRows | 2562 | 210.7026 | 100.248 | 3.2764 |
| govern:chooseNStep:add | productionPreviewDrive | 2124 | 87.0324 | 9.2958 | 35.7243 |
| train:chooseNStep:add | productionPreviewDrive | 1044 | 35.3189 | 3.627 | 14.3703 |
| govern | scoreRows | 944 | 61.6688 | 32.5983 | 0.7759 |
| coupPacifyUS | scoreRows | 760 | 42.0115 | 25.3608 | 0.4701 |
| rally | scoreRows | 724 | 62.8779 | 25.9764 | 0.6779 |
| coupArvnRedeployOptionalTroops | scoreRows | 704 | 68.2208 | 25.293 | 1.0796 |
| coupArvnRedeployPolice | scoreRows | 688 | 60.8392 | 24.0199 | 1.0324 |
| coupCommitmentPass | scoreRows | 680 | 28.5947 | 22.6925 | 0.3145 |
| coupRedeployPass | scoreRows | 680 | 32.4473 | 22.1472 | 0.4935 |
| train:chooseNStep:confirm | productionPreviewDrive | 624 | 18.2642 | 2.3831 | 8.3874 |
| infiltrate | scoreRows | 444 | 33.145 | 16.4257 | 0.6355 |
| advise | scoreRows | 430 | 20.784 | 14.442 | 0.2625 |
| march | scoreRows | 424 | 20.0497 | 14.1159 | 0.265 |
| rally | productionPreviewDrive | 381 | 37.1804 | 3.1283 | 25.1575 |
| coupPacifyPass | scoreRows | 360 | 13.8514 | 11.8012 | 0.8002 |
| coupAgitateVC | scoreRows | 276 | 19.8318 | 9.6614 | 0.2339 |
| coupPacifyARVN | scoreRows | 248 | 13.6564 | 8.2916 | 0.1514 |
| coupNvaRedeployTroops | scoreRows | 228 | 10.9686 | 7.4183 | 0.127 |
| assault | scoreRows | 210 | 9.6203 | 6.9512 | 0.1047 |
| coupResourcesResolve | scoreRows | 200 | 7.9429 | 6.4191 | 0.0787 |
| coupVictoryCheck | scoreRows | 200 | 7.8529 | 6.2937 | 0.0786 |
| coupAgitateVC | productionPreviewDrive | 184 | 16.1036 | 0.8572 | 12.6777 |
| train | scoreRows | 184 | 7.5494 | 5.9689 | 0.082 |
| advise | productionPreviewDrive | 164 | 20.4912 | 2.1236 | 11.0387 |
| attack | scoreRows | 144 | 10.0776 | 5.03 | 0.1086 |
| infiltrate | productionPreviewDrive | 136 | 13.631 | 1.0172 | 7.9677 |
| coupCommitmentPass | productionPreviewDrive | 131 | 11.73 | 0.6244 | 8.6063 |
| coupCommitmentPass | previewCandidateFeatureRows | 120 | 17.6495 | 4.3614 | 0.1217 |
| train | productionPreviewDrive | 108 | 10.9926 | 0.5559 | 6.0789 |
| march | productionPreviewDrive | 107 | 10.7243 | 0.5886 | 8.0651 |
| rally | previewCandidateFeatureRows | 107 | 17.1596 | 4.2108 | 0.1568 |
| coupPacifyUS | productionPreviewDrive | 106 | 11.7047 | 0.5953 | 8.349 |
| coupCommitmentResolve | scoreRows | 90 | 2.5271 | 2.7581 | 0.0339 |
| coupRedeployPass | productionPreviewDrive | 82 | 7.8158 | 0.3985 | 5.8719 |
| assault | productionPreviewDrive | 80 | 7.9715 | 0.4992 | 5.9169 |
| coupAgitatePass | scoreRows | 80 | 3.2398 | 2.6837 | 0.0432 |
| coupRedeployPass | previewCandidateFeatureRows | 80 | 11.3032 | 2.7509 | 0.0836 |
| event-decision:chooseNStep:add | productionPreviewDrive | 69 | 3.1198 | 0.3434 | 1.2663 |
| coupPacifyARVN | productionPreviewDrive | 66 | 5.6098 | 0.2842 | 4.0894 |
| ambushNva | scoreRows | 60 | 2.5336 | 1.9458 | 0.0262 |
| coupPacifyPass | productionPreviewDrive | 60 | 6.078 | 0.2666 | 4.182 |
| coupPacifyPass | previewCandidateFeatureRows | 58 | 6.9182 | 2.0684 | 0.0607 |
| transport | scoreRows | 56 | 3.178 | 1.8842 | 0.0318 |
| coupAgitatePass | productionPreviewDrive | 50 | 3.9833 | 0.1957 | 3.1068 |
| ambushVc | scoreRows | 48 | 2.988 | 1.6726 | 0.0259 |
| march | previewCandidateFeatureRows | 47 | 9.2713 | 1.8107 | 0.0634 |
| coupAgitateVC | previewCandidateFeatureRows | 46 | 4.7201 | 1.6672 | 0.0453 |
| attack | productionPreviewDrive | 44 | 4.1275 | 0.2317 | 2.248 |
| govern | productionPreviewDrive | 42 | 6.8696 | 1.6551 | 5.2414 |
| coupAgitatePass | previewCandidateFeatureRows | 40 | 3.9992 | 1.3474 | 0.0327 |
| advise | previewCandidateFeatureRows | 39 | 8.4408 | 1.7209 | 0.0681 |
| ambushVc | productionPreviewDrive | 38 | 3.8569 | 0.1703 | 2.2782 |
| infiltrate | previewCandidateFeatureRows | 37 | 11.2896 | 1.5439 | 0.0745 |
| coupArvnRedeployOptionalTroops | productionPreviewDrive | 36 | 3.9687 | 0.2709 | 2.8224 |
| coupPacifyARVN | previewCandidateFeatureRows | 32 | 4.1042 | 1.1748 | 0.0341 |
| coupPacifyUS | previewCandidateFeatureRows | 30 | 5.0029 | 1.0924 | 0.0345 |
| resolveHonoluluPacify | scoreRows | 28 | 1.3801 | 0.894 | 0.0115 |
| train | previewCandidateFeatureRows | 26 | 2.8447 | 1.0131 | 0.031 |
| coupArvnRedeployMandatory | scoreRows | 24 | 1.3442 | 0.7711 | 0.0116 |
| assault | previewCandidateFeatureRows | 21 | 3.4018 | 0.7519 | 0.0274 |
| coupArvnRedeployPolice | productionPreviewDrive | 20 | 2.7783 | 0.1443 | 1.6473 |
| coupResourcesResolve | previewCandidateFeatureRows | 20 | 3.0258 | 0.7571 | 0.0226 |
| coupResourcesResolve | productionPreviewDrive | 20 | 2.1508 | 0.1191 | 1.5641 |
| coupVictoryCheck | previewCandidateFeatureRows | 20 | 3.0758 | 0.7193 | 0.0252 |
| coupVictoryCheck | productionPreviewDrive | 20 | 2.103 | 0.1363 | 1.6276 |
| coupCommitmentResolve | productionPreviewDrive | 18 | 2.9694 | 0.1086 | 1.2279 |
| coupNvaRedeployTroops | productionPreviewDrive | 14 | 1.2977 | 0.0731 | 0.8879 |
| pass | scoreRows | 12 | 1.0276 | 0.8486 | 0.0171 |
| ambushNva | productionPreviewDrive | 11 | 1.158 | 0.0605 | 0.5996 |
| attack | previewCandidateFeatureRows | 11 | 5.9666 | 0.4261 | 0.0196 |
| ambushVc | previewCandidateFeatureRows | 10 | 1.0829 | 0.4 | 0.0103 |
| patrol | scoreRows | 10 | 0.4069 | 0.3242 | 0.0042 |
| coupCommitmentResolve | previewCandidateFeatureRows | 9 | 1.3806 | 0.3151 | 0.0117 |
| coupNvaRedeployTroops | previewCandidateFeatureRows | 7 | 1.0697 | 0.2472 | 0.0398 |
| ambushNva | previewCandidateFeatureRows | 5 | 0.9458 | 0.1829 | 0.008 |
| coupArvnRedeployMandatory | productionPreviewDrive | 4 | 0.3867 | 0.0262 | 0.2683 |
| pass | previewCandidateFeatureRows | 1 | 0.2789 | 0.0743 | 0.0024 |
| pass | productionPreviewDrive | 1 | 0.2134 | 0.0226 | 0.1509 |

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
| coupNvaRedeployTroops | 11 | 1 | 8.4922 | 3.4407 | 2.4682 |  |
| event-decision:chooseOne | 12 | 6 | 0.3448 | 0.1414 | 2.4385 |  |
| coupArvnRedeployPolice:chooseOne | 58 | 50 | 125.092 | 68.2234 | 1.8336 |  |
| train:chooseNStep:confirm | 22 | 17 | 287.8479 | 169.6648 | 1.6966 |  |
| assault:chooseNStep:confirm | 16 | 12 | 0.0318 | 0.0199 | 1.598 |  |
| assault:chooseNStep:add | 8 | 6 | 0.071 | 0.0459 | 1.5468 |  |
| coupNvaRedeployTroops:chooseOne | 25 | 2 | 0.0754 | 0.0544 | 1.386 |  |
| govern:chooseNStep:confirm | 44 | 35 | 365.364 | 269.2684 | 1.3569 |  |
| event-decision:chooseNStep:add | 48 | 30 | 31.4375 | 23.1684 | 1.3569 |  |
| advise:chooseOne | 27 | 30 | 0.0423 | 0.0328 | 1.2896 |  |
| event-decision:chooseNStep:confirm | 47 | 27 | 0.0323 | 0.027 | 1.1963 |  |
| march:chooseNStep:add | 21 | 22 | 0.0626 | 0.0525 | 1.1924 |  |
| govern | 47 | 35 | 62.8061 | 53.9354 | 1.1645 |  |
| transport | 4 | 3 | 50.2568 | 43.2576 | 1.1618 |  |
| chooseNStep:chooseNStep:confirm | 6 | 3 | 0.0406 | 0.0354 | 1.1469 |  |
| advise:chooseNStep:add | 13 | 15 | 0.1176 | 0.1033 | 1.1384 |  |
| train:chooseOne | 12 | 11 | 4.9797 | 4.3801 | 1.1369 |  |
| assault | 8 | 6 | 8.4282 | 7.4851 | 1.126 |  |
| coupRedeployPass | 32 | 24 | 8.5519 | 7.6427 | 1.119 |  |
| advise:chooseNStep:confirm | 13 | 15 | 0.0419 | 0.0379 | 1.1055 |  |
| govern:chooseNStep:add | 55 | 35 | 216.0801 | 198.1224 | 1.0906 |  |
| coupCommitmentResolve:chooseNStep:confirm | 12 | 12 | 0.028 | 0.0257 | 1.0895 |  |
| coupVictoryCheck | 8 | 6 | 3.4736 | 3.2271 | 1.0764 |  |
| coupArvnRedeployOptionalTroops:chooseOne | 84 | 60 | 20.0617 | 19.2032 | 1.0447 |  |
| rally:chooseNStep:confirm | 77 | 72 | 0.0323 | 0.0311 | 1.0386 |  |
| coupArvnRedeployOptionalTroops | 32 | 25 | 40.684 | 39.542 | 1.0289 |  |
| coupArvnRedeployPolice | 27 | 32 | 30.2686 | 29.9374 | 1.0111 |  |
| coupPacifyARVN | 11 | 8 | 8.9405 | 8.9056 | 1.0039 |  |
| coupPacifyUS | 25 | 26 | 8.4606 | 8.4284 | 1.0038 |  |
| infiltrate | 16 | 8 | 9.9606 | 9.9401 | 1.0021 |  |
| march | 15 | 13 | 5.852 | 5.8413 | 1.0018 |  |
| govern:chooseOne | 58 | 35 | 3.3556 | 3.4115 | 0.9836 |  |
| attack | 4 | 8 | 10.6762 | 10.8558 | 0.9835 |  |
| train | 8 | 7 | 28.7552 | 29.9369 | 0.9605 |  |
| rally:chooseOne | 70 | 57 | 0.03 | 0.0314 | 0.9554 |  |
| coupCommitmentPass | 32 | 24 | 3.2003 | 3.3549 | 0.9539 |  |
| coupCommitmentResolve | 3 | 3 | 4.1645 | 4.4431 | 0.9373 |  |
| coupResourcesResolve | 8 | 6 | 3.2438 | 3.5007 | 0.9266 |  |
| ambushVc | 7 | 4 | 13.6365 | 14.8631 | 0.9175 |  |
| ambushVc:chooseNStep:confirm | 7 | 3 | 0.0343 | 0.0378 | 0.9074 |  |
| event | 109 | 77 | 73.8222 | 82.9324 | 0.8901 |  |
| ambushVc:chooseOne | 7 | 4 | 0.0188 | 0.0215 | 0.8744 |  |
| coupAgitateVC | 22 | 25 | 7.8625 | 9.2754 | 0.8477 |  |
| coupAgitatePass | 8 | 6 | 3.1269 | 3.6952 | 0.8462 |  |
| march:chooseNStep:confirm | 35 | 29 | 0.0339 | 0.0401 | 0.8454 |  |
| coupPacifyPass | 16 | 12 | 3.8865 | 4.6167 | 0.8418 |  |
| rally:chooseNStep:add | 68 | 56 | 0.0777 | 0.0969 | 0.8019 |  |
| rally | 67 | 54 | 19.2853 | 24.1625 | 0.7982 |  |
| ambushVc:chooseNStep:add | 7 | 3 | 0.0396 | 0.0507 | 0.7811 |  |
| infiltrate:chooseNStep:confirm | 26 | 12 | 0.0251 | 0.0353 | 0.711 |  |
| infiltrate:chooseOne | 23 | 13 | 0.0297 | 0.0418 | 0.7105 |  |
| advise | 13 | 15 | 8.9815 | 12.8665 | 0.6981 |  |
| chooseOne:chooseOne | 13 | 8 | 0.6564 | 1.078 | 0.6089 |  |
| train:chooseNStep:add | 14 | 11 | 928.0853 | 1614.7222 | 0.5748 |  |
| transport:chooseOne | 8 | 6 | 34.5166 | 72.2525 | 0.4777 |  |
| infiltrate:chooseNStep:add | 16 | 8 | 0.043 | 0.1128 | 0.3812 |  |

## Notes

- `elapsedMs` is measured around the per-decision `PolicyAgent.chooseDecision` call. It excludes simulator apply/delta work and report rendering.
- Child processes enforce the per-seed timeout. Each child loads the built engine and production FITL GameSpecDoc, using the repo GameDef cache when available.
- WASM timing buckets are emitted only when `POLICY_WASM_TIMING_PROFILE=1` is set before the child process imports the WASM runtime module.
- The script does not modify engine source or production profile data.
