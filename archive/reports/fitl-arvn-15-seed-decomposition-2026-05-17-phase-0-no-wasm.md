# FITL ARVN 15-Seed Per-Microturn-Class Decomposition

**Status**: ✅ EXPLOITED — archived 2026-05-19.

**Date**: 2026-05-17-phase-0-no-wasm
**Status**: Spec 173 measurement witness.
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 600000 --date 2026-05-17-phase-0-no-wasm --no-wasm`
**CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-0-no-wasm.csv`

## Summary

- Seeds completed: 15/15
- Per-decision rows: 3744
- Hot class with slow:fast ratio >3x: no
- Per-seed timeout: 600000 ms
- Hot-path buckets: disabled
- WASM mode: disabled via --no-wasm
- WASM timing profile: disabled
- WASM production preview-drive route count: 0
- WASM production preview-drive unsupported count: 1834
- WASM production preview-drive batch count: 0
- WASM timing call count: 0

## Per-Seed Wall Time

| Seed | Status | Stop Reason | Wall ms | Decisions | ms/decision | Error |
|---:|---|---|---:|---:|---:|---|
| 1000 | OK | terminal | 5473.33 | 159 | 34.4235 |  |
| 1001 | OK | terminal | 7433 | 193 | 38.513 |  |
| 1002 | OK | terminal | 4450 | 143 | 31.1189 |  |
| 1003 | OK | terminal | 8056.44 | 221 | 36.4545 |  |
| 1004 | OK | terminal | 12679.18 | 339 | 37.4017 |  |
| 1005 | OK | terminal | 39646.6 | 393 | 100.8819 |  |
| 1006 | OK | terminal | 11927.99 | 228 | 52.3157 |  |
| 1007 | OK | terminal | 6368.48 | 218 | 29.2132 |  |
| 1008 | OK | terminal | 19090.18 | 346 | 55.1739 |  |
| 1009 | OK | terminal | 11592.66 | 292 | 39.7009 |  |
| 1010 | OK | terminal | 34063.24 | 334 | 101.9857 |  |
| 1011 | OK | terminal | 7010.92 | 206 | 34.0336 |  |
| 1012 | OK | terminal | 16275.49 | 201 | 80.9726 |  |
| 1013 | OK | terminal | 7895.74 | 258 | 30.6036 |  |
| 1014 | OK | terminal | 18835.77 | 213 | 88.4308 |  |

## Per-Microturn-Class Rollup

| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | WASM preview-drive routes | WASM preview-drive unsupported | WASM preview-drive unsupported reasons | WASM preview-drive batches | WASM timing calls | Marshaling ms | Execution ms | Deserialization ms | Token index builds | Static rebuilds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|
| train:chooseNStep:add | 37 | 38185.01 | 1032.0273 | 3115.4202 | 15174.9087 | 17.4865 | 0 | 5183 | 7420 | 0 | 0 | 0 | 372 | unknown/production-deep-choosenstep-continuation.runtime/no initialized policy WASM runtime:372 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| govern:chooseNStep:add | 135 | 23640.29 | 175.1133 | 278.637 | 3963.7225 | 6.0815 | 0 | 3770 | 5825 | 0 | 0 | 0 | 781 | unknown/production-deep-choosenstep-continuation.runtime/no initialized policy WASM runtime:781 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| govern:chooseNStep:confirm | 115 | 22723.82 | 197.5984 | 350.0867 | 6745.1931 | 6.6957 | 0 | 2505 | 1135 | 0 | 0 | 0 | 520 | unknown/production-deep-choosenstep-continuation.runtime/no initialized policy WASM runtime:520 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event | 248 | 21804.98 | 87.9233 | 85.8893 | 4989.4736 | 19.121 | 248 | 0 | 0 | 248 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 38 | 278 |
| coupArvnRedeployPolice:chooseOne | 153 | 14689.58 | 96.0104 | 289.2952 | 323.1239 | 30.3922 | 0 | 105697 | 3591 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| train:chooseNStep:confirm | 59 | 8515.38 | 144.3285 | 1187.5745 | 2759.2434 | 3.0508 | 0 | 1810 | 3782 | 0 | 0 | 0 | 84 | unknown/production-deep-choosenstep-continuation.runtime/no initialized policy WASM runtime:84 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| govern | 118 | 6784.66 | 57.4971 | 72.3175 | 638.0344 | 10.7797 | 111 | 0 | 7 | 111 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 111 |
| rally | 165 | 5552.03 | 33.6487 | 98.1887 | 151.1001 | 15.0667 | 146 | 0 | 19 | 146 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 146 |
| coupArvnRedeployOptionalTroops:chooseOne | 215 | 4106.14 | 19.0983 | 33.6373 | 43.598 | 8.3907 | 0 | 13517 | 1865 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupArvnRedeployOptionalTroops | 88 | 3423.44 | 38.9028 | 46.6056 | 65.9298 | 17.2159 | 71 | 0 | 17 | 71 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 71 |
| march | 40 | 2619.05 | 65.4762 | 122.653 | 276.332 | 8.9 | 30 | 0 | 10 | 30 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 30 |
| coupArvnRedeployPolice | 86 | 2479.04 | 28.826 | 34.2145 | 35.9499 | 11.6744 | 85 | 0 | 1 | 85 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 85 |
| event-decision:chooseNStep:add | 96 | 2050.31 | 21.3574 | 191.6019 | 362.4664 | 11.4479 | 0 | 250 | 1045 | 0 | 0 | 0 | 77 | unknown/production-deep-choosenstep-continuation.runtime/no initialized policy WASM runtime:77 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva | 5 | 1749.74 | 349.9473 | 1100.021 | 1100.021 | 15.2 | 5 | 0 | 0 | 5 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 5 |
| advise | 43 | 1511.08 | 35.1414 | 46.7128 | 49.9379 | 11.4186 | 32 | 0 | 11 | 32 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 32 |
| train | 23 | 1425.33 | 61.9709 | 51.3939 | 626.9825 | 5.4348 | 23 | 0 | 0 | 23 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 23 |
| infiltrate | 37 | 1060.08 | 28.6508 | 35.0267 | 35.8134 | 48.4324 | 30 | 0 | 7 | 30 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 30 |
| transport:chooseOne | 14 | 731.01 | 52.2151 | 106.9933 | 106.9933 | 16.7143 | 0 | 952 | 37 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault | 21 | 728.08 | 34.6704 | 37.6305 | 45.2049 | 4.8095 | 20 | 0 | 1 | 20 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 20 |
| attack | 14 | 670.4 | 47.8854 | 151.6635 | 151.6635 | 31.6429 | 12 | 0 | 2 | 12 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 12 |
| patrol | 1 | 596.76 | 596.7639 | 596.7639 | 596.7639 | 4 | 1 | 0 | 0 | 1 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| coupRedeployPass | 80 | 578.91 | 7.2364 | 26.1161 | 28.8646 | 2.95 | 32 | 0 | 48 | 32 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 32 |
| coupPacifyUS | 76 | 532.74 | 7.0097 | 11.3431 | 12.0869 | 2.8158 | 76 | 0 | 0 | 76 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 76 |
| coupAgitateVC | 69 | 514.07 | 7.4503 | 10.643 | 17.8714 | 2.971 | 52 | 0 | 17 | 52 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 52 |
| govern:chooseOne | 138 | 483.08 | 3.5006 | 4.962 | 11.5126 | 2 | 0 | 178 | 178 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupCommitmentPass | 80 | 422.74 | 5.2842 | 18.4646 | 19.2822 | 1.2 | 4 | 0 | 76 | 4 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 4 |
| transport | 7 | 344.73 | 49.2473 | 65.8779 | 65.8779 | 11.7143 | 7 | 0 | 0 | 7 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 7 |
| coupArvnRedeployMandatory:chooseOne | 13 | 315.75 | 24.2881 | 32.7177 | 32.7177 | 8 | 0 | 1435 | 205 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupPacifyARVN | 31 | 243.54 | 7.856 | 10.9647 | 11.2444 | 3.7742 | 14 | 0 | 17 | 14 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 14 |
| ambushVc | 12 | 223.5 | 18.6251 | 32.7805 | 32.7805 | 8.1667 | 11 | 0 | 1 | 11 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 11 |
| coupResourcesResolve | 20 | 215.25 | 10.7624 | 33.1055 | 36.7792 | 1 | 3 | 0 | 17 | 3 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 3 |
| coupPacifyPass | 40 | 171.97 | 4.2992 | 6.0064 | 10.0799 | 1.15 | 37 | 0 | 3 | 37 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 37 |
| train:chooseOne | 35 | 165.45 | 4.7272 | 7.8081 | 8.3507 | 2.3143 | 0 | 66 | 99 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupNvaRedeployTroops | 19 | 157.41 | 8.2845 | 15.432 | 15.432 | 3.7368 | 12 | 0 | 7 | 12 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 12 |
| coupArvnRedeployMandatory | 3 | 112.36 | 37.4519 | 44.1229 | 44.1229 | 11.3333 | 1 | 0 | 2 | 1 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| coupAgitatePass | 20 | 88.88 | 4.4438 | 5.9696 | 5.9941 | 1.25 | 17 | 0 | 3 | 17 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 17 |
| coupVictoryCheck | 20 | 82.4 | 4.1198 | 7.7581 | 8.4389 | 1 | 20 | 0 | 0 | 20 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 20 |
| coupCommitmentResolve | 4 | 79.04 | 19.761 | 23.0285 | 23.0285 | 2 | 0 | 0 | 4 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| chooseOne:chooseOne | 31 | 17.35 | 0.5597 | 5.6807 | 7.6646 | 5.2903 | 0 | 7 | 2 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseNStep:add | 168 | 14.11 | 0.084 | 0.1227 | 1.1873 | 20.75 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| resolveHonoluluPacify | 3 | 10.68 | 3.5609 | 3.9212 | 3.9212 | 1 | 3 | 0 | 0 | 3 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 3 |
| event-decision:chooseOne | 34 | 6.74 | 0.1982 | 0.633 | 4.781 | 3.6471 | 0 | 1 | 1 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseNStep:confirm | 209 | 6.74 | 0.0322 | 0.0582 | 0.158 | 14.7943 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseOne | 172 | 5.62 | 0.0327 | 0.1016 | 0.1331 | 1.3547 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:add | 43 | 4.2 | 0.0978 | 0.2665 | 0.7688 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:confirm | 91 | 3.51 | 0.0386 | 0.0766 | 0.1504 | 5.2198 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:add | 57 | 3.44 | 0.0604 | 0.0972 | 0.1228 | 11.614 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseOne | 87 | 3.04 | 0.035 | 0.0612 | 0.1224 | 2.4368 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseNStep:confirm | 89 | 2.61 | 0.0294 | 0.0742 | 0.1359 | 6.5169 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:add | 37 | 2.37 | 0.064 | 0.0574 | 0.709 | 3.7027 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:confirm | 43 | 1.82 | 0.0424 | 0.082 | 0.1241 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseOne | 57 | 1.76 | 0.0309 | 0.056 | 0.1349 | 1.614 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupNvaRedeployTroops:chooseOne | 43 | 1.62 | 0.0376 | 0.0487 | 0.0777 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:confirm | 55 | 1.55 | 0.0282 | 0.051 | 0.0931 | 4.4909 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| pass | 1 | 1.48 | 1.4765 | 1.4765 | 1.4765 | 1 | 1 | 0 | 0 | 1 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| assault:chooseNStep:add | 21 | 1.13 | 0.054 | 0.0705 | 0.1491 | 3.0952 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:confirm | 42 | 1.09 | 0.0259 | 0.0397 | 0.0936 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:add | 12 | 0.54 | 0.0446 | 0.077 | 0.077 | 3.4167 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupCommitmentResolve:chooseNStep:confirm | 16 | 0.43 | 0.0266 | 0.0451 | 0.0451 | 9.25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| chooseNStep:chooseNStep:confirm | 10 | 0.41 | 0.0407 | 0.0789 | 0.0789 | 18.2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:confirm | 12 | 0.3 | 0.0248 | 0.0288 | 0.0288 | 4.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseOne | 12 | 0.26 | 0.0214 | 0.0329 | 0.0329 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| patrol:chooseNStep:confirm | 3 | 0.22 | 0.0728 | 0.1321 | 0.1321 | 4.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseNStep:add | 3 | 0.16 | 0.0544 | 0.0565 | 0.0565 | 3.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseOne | 4 | 0.16 | 0.0396 | 0.056 | 0.056 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseOne | 5 | 0.15 | 0.0293 | 0.0491 | 0.0491 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseNStep:confirm | 3 | 0.1 | 0.0327 | 0.046 | 0.046 | 3.6667 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| patrol:chooseNStep:add | 1 | 0.08 | 0.0839 | 0.0839 | 0.0839 | 17 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Top Hot Axes In Slow-Tier Seeds

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.

| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms |
|---:|---|---|---:|---:|---:|---:|---:|
| 1 | train:chooseNStep:add | continuedDeepening | 14 | 12170.31 | 869.3079 | 3115.4202 | 3115.4202 |
| 2 | govern:chooseNStep:confirm | continuedDeepening | 33 | 11354.21 | 344.067 | 350.0867 | 6745.1931 |
| 3 | govern:chooseNStep:add | continuedDeepening | 55 | 10746.51 | 195.3911 | 277.6462 | 3963.7225 |
| 4 | event | singlePass | 109 | 8141.57 | 74.6933 | 167.6401 | 2994.5529 |
| 5 | coupArvnRedeployPolice:chooseOne | continuedDeepening | 58 | 7338.86 | 126.532 | 309.1166 | 323.1239 |
| 6 | train:chooseNStep:confirm | continuedDeepening | 12 | 5755.72 | 479.6432 | 2759.2434 | 2759.2434 |
| 7 | govern | singlePass | 47 | 2981.38 | 63.4337 | 72.007 | 638.0344 |
| 8 | rally | singlePass | 67 | 2357.49 | 35.1864 | 107.4892 | 142.7977 |
| 9 | coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | 84 | 1654.4 | 19.6952 | 33.1658 | 42.7801 |
| 10 | event-decision:chooseNStep:add | continuedDeepening | 6 | 1360.16 | 226.694 | 362.4664 | 362.4664 |

## WASM Timing Buckets

_No WASM timing buckets recorded._

## WASM Preview-Drive Unsupported Reasons

| Microturn class | Unsupported class | Unsupported owner | Reason | Count | Class unsupported total | Class route total |
|---|---|---|---|---:|---:|---:|
| govern:chooseNStep:add | unknown | production-deep-choosenstep-continuation.runtime | no initialized policy WASM runtime | 781 | 781 | 0 |
| govern:chooseNStep:confirm | unknown | production-deep-choosenstep-continuation.runtime | no initialized policy WASM runtime | 520 | 520 | 0 |
| train:chooseNStep:add | unknown | production-deep-choosenstep-continuation.runtime | no initialized policy WASM runtime | 372 | 372 | 0 |
| train:chooseNStep:confirm | unknown | production-deep-choosenstep-continuation.runtime | no initialized policy WASM runtime | 84 | 84 | 0 |
| event-decision:chooseNStep:add | unknown | production-deep-choosenstep-continuation.runtime | no initialized policy WASM runtime | 77 | 77 | 0 |

## Fast-Tier vs Slow-Tier Delta

Fast tier: `1000`, `1006`, `1007`, `1010`, `1014`. Rows with ratio greater than `3.0` satisfy the Phase 0 hot-axis criterion.

| Microturn class | Slow decisions | Fast decisions | Slow mean ms | Fast mean ms | Slow:fast ratio | Verdict |
|---|---:|---:|---:|---:|---:|---|
| event-decision:chooseOne | 12 | 6 | 0.4283 | 0.147 | 2.9136 |  |
| coupNvaRedeployTroops | 11 | 1 | 7.9497 | 3.5022 | 2.2699 |  |
| coupArvnRedeployPolice:chooseOne | 58 | 50 | 126.532 | 68.8814 | 1.837 |  |
| train:chooseNStep:confirm | 22 | 17 | 261.6699 | 145.2213 | 1.8019 |  |
| govern:chooseNStep:confirm | 44 | 35 | 258.072 | 203.8151 | 1.2662 |  |
| event-decision:chooseNStep:add | 48 | 30 | 28.3692 | 22.9174 | 1.2379 |  |
| transport | 4 | 3 | 53.4597 | 43.6308 | 1.2253 |  |
| advise:chooseOne | 27 | 30 | 0.04 | 0.033 | 1.2121 |  |
| march:chooseNStep:add | 21 | 22 | 0.0652 | 0.0553 | 1.179 |  |
| advise:chooseNStep:confirm | 13 | 15 | 0.0457 | 0.0389 | 1.1748 |  |
| chooseNStep:chooseNStep:confirm | 6 | 3 | 0.0419 | 0.0357 | 1.1737 |  |
| govern | 47 | 35 | 63.4337 | 56.4936 | 1.1228 |  |
| advise:chooseNStep:add | 13 | 15 | 0.1175 | 0.1059 | 1.1095 |  |
| train:chooseOne | 12 | 11 | 5.1561 | 4.6518 | 1.1084 |  |
| coupVictoryCheck | 8 | 6 | 4.2585 | 3.8448 | 1.1076 |  |
| coupCommitmentResolve:chooseNStep:confirm | 8 | 8 | 0.028 | 0.0253 | 1.1067 |  |
| rally:chooseNStep:confirm | 77 | 72 | 0.0342 | 0.031 | 1.1032 |  |
| assault:chooseNStep:add | 8 | 6 | 0.0589 | 0.0542 | 1.0867 |  |
| coupArvnRedeployPolice | 27 | 32 | 29.8081 | 27.89 | 1.0688 |  |
| infiltrate | 16 | 8 | 29.2867 | 27.6793 | 1.0581 |  |
| coupRedeployPass | 32 | 24 | 7.4592 | 7.0565 | 1.0571 |  |
| advise | 13 | 15 | 36.0016 | 34.1652 | 1.0538 |  |
| coupPacifyARVN | 11 | 8 | 7.8894 | 7.6507 | 1.0312 |  |
| coupResourcesResolve | 8 | 6 | 11.2926 | 11.0756 | 1.0196 |  |
| rally:chooseOne | 70 | 57 | 0.0325 | 0.032 | 1.0156 |  |
| rally | 67 | 54 | 35.1864 | 34.6508 | 1.0155 |  |
| event-decision:chooseNStep:confirm | 47 | 27 | 0.0301 | 0.0299 | 1.0067 |  |
| govern:chooseNStep:add | 55 | 35 | 195.3911 | 194.2899 | 1.0057 |  |
| coupPacifyUS | 25 | 26 | 6.9796 | 7.0001 | 0.9971 |  |
| coupArvnRedeployOptionalTroops:chooseOne | 84 | 60 | 19.6952 | 19.7925 | 0.9951 |  |
| coupArvnRedeployOptionalTroops | 32 | 25 | 38.96 | 39.3969 | 0.9889 |  |
| govern:chooseOne | 58 | 35 | 3.4272 | 3.487 | 0.9829 |  |
| coupCommitmentPass | 32 | 24 | 4.9065 | 5.0582 | 0.97 |  |
| ambushVc | 7 | 4 | 18.8935 | 19.5454 | 0.9666 |  |
| ambushVc:chooseNStep:add | 7 | 3 | 0.0467 | 0.0487 | 0.9589 |  |
| assault | 8 | 6 | 34.4188 | 36.5718 | 0.9411 |  |
| ambushVc:chooseNStep:confirm | 7 | 3 | 0.0253 | 0.0277 | 0.9134 |  |
| coupAgitateVC | 22 | 25 | 6.9274 | 7.6171 | 0.9095 |  |
| coupAgitatePass | 8 | 6 | 4.0005 | 4.4919 | 0.8906 |  |
| infiltrate:chooseOne | 23 | 13 | 0.0322 | 0.0362 | 0.8895 |  |
| rally:chooseNStep:add | 68 | 56 | 0.0824 | 0.0951 | 0.8665 |  |
| coupCommitmentResolve | 2 | 2 | 18.2902 | 21.2318 | 0.8615 |  |
| event | 109 | 77 | 74.6933 | 86.9667 | 0.8589 |  |
| assault:chooseNStep:confirm | 16 | 12 | 0.0262 | 0.0311 | 0.8424 |  |
| coupPacifyPass | 16 | 12 | 4.0307 | 4.8713 | 0.8274 |  |
| ambushVc:chooseOne | 7 | 4 | 0.02 | 0.0253 | 0.7905 |  |
| infiltrate:chooseNStep:confirm | 26 | 12 | 0.0272 | 0.0357 | 0.7619 |  |
| march:chooseNStep:confirm | 35 | 29 | 0.0359 | 0.0476 | 0.7542 |  |
| march | 15 | 13 | 63.6358 | 85.9235 | 0.7406 |  |
| attack | 4 | 8 | 37.2188 | 61.0782 | 0.6094 |  |
| coupNvaRedeployTroops:chooseOne | 25 | 2 | 0.0361 | 0.0606 | 0.5957 |  |
| chooseOne:chooseOne | 13 | 8 | 0.5615 | 1.0014 | 0.5607 |  |
| train:chooseNStep:add | 14 | 11 | 869.3079 | 1736.8926 | 0.5005 |  |
| transport:chooseOne | 8 | 6 | 36.1695 | 73.6092 | 0.4914 |  |
| infiltrate:chooseNStep:add | 16 | 8 | 0.0476 | 0.1273 | 0.3739 |  |
| train | 8 | 7 | 37.7592 | 120.9197 | 0.3123 |  |

## Notes

- `elapsedMs` is measured around the per-decision `PolicyAgent.chooseDecision` call. It excludes simulator apply/delta work and report rendering.
- Child processes enforce the per-seed timeout. Each child loads the built engine and production FITL GameSpecDoc, using the repo GameDef cache when available.
- WASM timing buckets are emitted only when `POLICY_WASM_TIMING_PROFILE=1` is set before the child process imports the WASM runtime module.
- The script does not modify engine source or production profile data.
