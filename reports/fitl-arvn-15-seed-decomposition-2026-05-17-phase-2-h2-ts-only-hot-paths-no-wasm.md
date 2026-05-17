# FITL ARVN 15-Seed Per-Microturn-Class Decomposition

**Date**: 2026-05-17-phase-2-h2-ts-only-hot-paths
**Status**: Spec 173 measurement witness.
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 600000 --date 2026-05-17-phase-2-h2-ts-only-hot-paths --profile-buckets --no-wasm`
**CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-2-h2-ts-only-hot-paths-no-wasm.csv`

## Summary

- Seeds completed: 15/15
- Per-decision rows: 3744
- Hot class with slow:fast ratio >3x: yes
- Per-seed timeout: 600000 ms
- Hot-path buckets: enabled
- WASM mode: disabled via --no-wasm
- WASM timing profile: disabled
- WASM production preview-drive route count: 0
- WASM production preview-drive unsupported count: 1834
- WASM production preview-drive batch count: 0
- WASM timing call count: 0

## Per-Seed Wall Time

| Seed | Status | Stop Reason | Wall ms | Decisions | ms/decision | Error |
|---:|---|---|---:|---:|---:|---|
| 1000 | OK | terminal | 5803.11 | 159 | 36.4975 |  |
| 1001 | OK | terminal | 7757.01 | 193 | 40.1918 |  |
| 1002 | OK | terminal | 4636.99 | 143 | 32.4265 |  |
| 1003 | OK | terminal | 8440.07 | 221 | 38.1904 |  |
| 1004 | OK | terminal | 13246.64 | 339 | 39.0756 |  |
| 1005 | OK | terminal | 41171.29 | 393 | 104.7616 |  |
| 1006 | OK | terminal | 11713.37 | 228 | 51.3744 |  |
| 1007 | OK | terminal | 6911.17 | 218 | 31.7026 |  |
| 1008 | OK | terminal | 20319.95 | 346 | 58.7282 |  |
| 1009 | OK | terminal | 12069.08 | 292 | 41.3325 |  |
| 1010 | OK | terminal | 34603.76 | 334 | 103.6041 |  |
| 1011 | OK | terminal | 7273.23 | 206 | 35.3069 |  |
| 1012 | OK | terminal | 16732.38 | 201 | 83.2457 |  |
| 1013 | OK | terminal | 8034.38 | 258 | 31.141 |  |
| 1014 | OK | terminal | 18763.43 | 213 | 88.0912 |  |

## Per-Microturn-Class Rollup

| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | WASM preview-drive routes | WASM preview-drive unsupported | WASM preview-drive unsupported reasons | WASM preview-drive batches | WASM timing calls | Marshaling ms | Execution ms | Deserialization ms | Token index builds | Static rebuilds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|
| train:chooseNStep:add | 37 | 39356.7 | 1063.6947 | 3268.2587 | 15258.6133 | 17.4865 | 0 | 5183 | 7420 | 0 | 0 | 0 | 372 | unknown/production-deep-choosenstep-continuation.runtime/no initialized policy WASM runtime:372 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| govern:chooseNStep:add | 135 | 24173.22 | 179.0609 | 283.9428 | 4168.9663 | 6.0815 | 0 | 3770 | 5825 | 0 | 0 | 0 | 781 | unknown/production-deep-choosenstep-continuation.runtime/no initialized policy WASM runtime:781 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| govern:chooseNStep:confirm | 115 | 23506.46 | 204.404 | 371.9176 | 7009.7804 | 6.6957 | 0 | 2505 | 1135 | 0 | 0 | 0 | 520 | unknown/production-deep-choosenstep-continuation.runtime/no initialized policy WASM runtime:520 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event | 248 | 22567.58 | 90.9983 | 89.0695 | 5171.2419 | 19.121 | 248 | 0 | 0 | 248 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 38 | 278 |
| coupArvnRedeployPolice:chooseOne | 153 | 15202.71 | 99.3641 | 293.9737 | 343.6722 | 30.3922 | 0 | 105697 | 3591 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| train:chooseNStep:confirm | 59 | 8619.25 | 146.089 | 1174.4499 | 2792.1542 | 3.0508 | 0 | 1810 | 3782 | 0 | 0 | 0 | 84 | unknown/production-deep-choosenstep-continuation.runtime/no initialized policy WASM runtime:84 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| govern | 118 | 6898.41 | 58.4611 | 77.5403 | 642.3312 | 10.7797 | 111 | 0 | 7 | 111 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 111 |
| rally | 165 | 5843.99 | 35.4181 | 104.2546 | 160.9834 | 15.0667 | 146 | 0 | 19 | 146 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 146 |
| coupArvnRedeployOptionalTroops:chooseOne | 215 | 4261.32 | 19.8201 | 34.3602 | 44.4027 | 8.3907 | 0 | 13517 | 1865 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupArvnRedeployOptionalTroops | 88 | 3532.28 | 40.1396 | 48.6777 | 52.5519 | 17.2159 | 71 | 0 | 17 | 71 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 71 |
| march | 40 | 2835.73 | 70.8932 | 118.7026 | 308.903 | 8.9 | 30 | 0 | 10 | 30 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 30 |
| coupArvnRedeployPolice | 86 | 2604.59 | 30.286 | 36.3406 | 43.7527 | 11.6744 | 85 | 0 | 1 | 85 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 85 |
| event-decision:chooseNStep:add | 96 | 2242.2 | 23.3562 | 209.1007 | 423.4991 | 11.4479 | 0 | 250 | 1045 | 0 | 0 | 0 | 77 | unknown/production-deep-choosenstep-continuation.runtime/no initialized policy WASM runtime:77 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise | 43 | 1609.32 | 37.426 | 48.3335 | 50.0055 | 11.4186 | 32 | 0 | 11 | 32 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 32 |
| train | 23 | 1492.84 | 64.9063 | 56.1206 | 646.7272 | 5.4348 | 23 | 0 | 0 | 23 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 23 |
| ambushNva | 5 | 1233.91 | 246.7828 | 622.5473 | 622.5473 | 15.2 | 5 | 0 | 0 | 5 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 5 |
| infiltrate | 37 | 1123.04 | 30.3523 | 36.0212 | 37.1829 | 48.4324 | 30 | 0 | 7 | 30 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 30 |
| transport:chooseOne | 14 | 750.95 | 53.6395 | 106.4294 | 106.4294 | 16.7143 | 0 | 952 | 37 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault | 21 | 734.24 | 34.9638 | 39.7733 | 40.8938 | 4.8095 | 20 | 0 | 1 | 20 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 20 |
| attack | 14 | 692.91 | 49.4933 | 159.7583 | 159.7583 | 31.6429 | 12 | 0 | 2 | 12 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 12 |
| coupRedeployPass | 80 | 598.73 | 7.4841 | 26.8553 | 35.2367 | 2.95 | 32 | 0 | 48 | 32 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 32 |
| patrol | 1 | 589.69 | 589.6885 | 589.6885 | 589.6885 | 4 | 1 | 0 | 0 | 1 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| coupPacifyUS | 76 | 557.45 | 7.3349 | 12.4702 | 13.8223 | 2.8158 | 76 | 0 | 0 | 76 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 76 |
| coupAgitateVC | 69 | 518.4 | 7.5131 | 10.1493 | 12.1286 | 2.971 | 52 | 0 | 17 | 52 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 52 |
| govern:chooseOne | 138 | 500.56 | 3.6272 | 5.28 | 8.9619 | 2 | 0 | 178 | 178 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupCommitmentPass | 80 | 440.24 | 5.503 | 20.9254 | 23.4673 | 1.2 | 4 | 0 | 76 | 4 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 4 |
| coupArvnRedeployMandatory:chooseOne | 13 | 344.88 | 26.5294 | 38.4393 | 38.4393 | 8 | 0 | 1435 | 205 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| transport | 7 | 343.09 | 49.0126 | 55.3233 | 55.3233 | 11.7143 | 7 | 0 | 0 | 7 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 7 |
| coupPacifyARVN | 31 | 242.63 | 7.8268 | 10.756 | 11.3419 | 3.7742 | 14 | 0 | 17 | 14 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 14 |
| ambushVc | 12 | 230.11 | 19.1757 | 34.0459 | 34.0459 | 8.1667 | 11 | 0 | 1 | 11 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 11 |
| coupResourcesResolve | 20 | 220.3 | 11.0148 | 34.2925 | 37.4183 | 1 | 3 | 0 | 17 | 3 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 3 |
| train:chooseOne | 35 | 170.83 | 4.8809 | 7.5266 | 7.6914 | 2.3143 | 0 | 66 | 99 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupNvaRedeployTroops | 19 | 169.51 | 8.9214 | 16.8156 | 16.8156 | 3.7368 | 12 | 0 | 7 | 12 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 12 |
| coupPacifyPass | 40 | 165.26 | 4.1315 | 5.2372 | 9.3387 | 1.15 | 37 | 0 | 3 | 37 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 37 |
| coupArvnRedeployMandatory | 3 | 113.06 | 37.6878 | 42.823 | 42.823 | 11.3333 | 1 | 0 | 2 | 1 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| coupAgitatePass | 20 | 92.55 | 4.6274 | 6.2129 | 6.606 | 1.25 | 17 | 0 | 3 | 17 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 17 |
| coupVictoryCheck | 20 | 87.61 | 4.3806 | 8.8841 | 9.0391 | 1 | 20 | 0 | 0 | 20 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 20 |
| coupCommitmentResolve | 4 | 78.47 | 19.6174 | 21.7791 | 21.7791 | 2 | 0 | 0 | 4 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| chooseOne:chooseOne | 31 | 18.31 | 0.5907 | 6.0584 | 8.079 | 5.2903 | 0 | 7 | 2 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseNStep:add | 168 | 13.2 | 0.0786 | 0.1296 | 0.7276 | 20.75 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| resolveHonoluluPacify | 3 | 11.69 | 3.8956 | 4.5801 | 4.5801 | 1 | 3 | 0 | 0 | 3 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 3 |
| rally:chooseNStep:confirm | 209 | 7.11 | 0.034 | 0.0644 | 0.1742 | 14.7943 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseOne | 172 | 5.79 | 0.0336 | 0.0875 | 0.1384 | 1.3547 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseOne | 34 | 5.77 | 0.1697 | 0.6198 | 3.7187 | 3.6471 | 0 | 1 | 1 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:add | 43 | 5.67 | 0.1319 | 0.7259 | 1.0023 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:confirm | 91 | 3.73 | 0.041 | 0.0763 | 0.1509 | 5.2198 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseOne | 87 | 3.71 | 0.0427 | 0.0863 | 0.5278 | 2.4368 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:add | 57 | 3.55 | 0.0624 | 0.1008 | 0.1299 | 11.614 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseNStep:confirm | 89 | 2.8 | 0.0315 | 0.1021 | 0.1593 | 6.5169 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:add | 37 | 2.47 | 0.0669 | 0.062 | 0.707 | 3.7027 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseOne | 57 | 2.02 | 0.0355 | 0.0587 | 0.2349 | 1.614 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:add | 21 | 1.95 | 0.0931 | 0.0685 | 0.9033 | 3.0952 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:confirm | 43 | 1.88 | 0.0438 | 0.0742 | 0.0947 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:confirm | 55 | 1.79 | 0.0326 | 0.0634 | 0.1077 | 4.4909 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupNvaRedeployTroops:chooseOne | 43 | 1.77 | 0.0412 | 0.0597 | 0.0831 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| pass | 1 | 1.52 | 1.5228 | 1.5228 | 1.5228 | 1 | 1 | 0 | 0 | 1 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| assault:chooseNStep:confirm | 42 | 1.05 | 0.0251 | 0.0394 | 0.0889 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:add | 12 | 0.53 | 0.0441 | 0.0516 | 0.0516 | 3.4167 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupCommitmentResolve:chooseNStep:confirm | 16 | 0.48 | 0.0298 | 0.046 | 0.046 | 9.25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| chooseNStep:chooseNStep:confirm | 10 | 0.41 | 0.0408 | 0.0589 | 0.0589 | 18.2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseNStep:confirm | 12 | 0.3 | 0.0249 | 0.0336 | 0.0336 | 4.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushVc:chooseOne | 12 | 0.24 | 0.0203 | 0.0295 | 0.0295 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseNStep:add | 3 | 0.15 | 0.0508 | 0.0657 | 0.0657 | 3.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseOne | 5 | 0.15 | 0.0296 | 0.0502 | 0.0502 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseOne | 4 | 0.15 | 0.0379 | 0.0456 | 0.0456 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ambushNva:chooseNStep:confirm | 3 | 0.09 | 0.0284 | 0.0342 | 0.0342 | 3.6667 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| patrol:chooseNStep:confirm | 3 | 0.08 | 0.0252 | 0.0302 | 0.0302 | 4.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| patrol:chooseNStep:add | 1 | 0.07 | 0.0737 | 0.0737 | 0.0737 | 17 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Top Hot Axes In Slow-Tier Seeds

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.

| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms |
|---:|---|---|---:|---:|---:|---:|---:|
| 1 | train:chooseNStep:add | continuedDeepening | 14 | 12717.25 | 908.3747 | 3268.2587 | 3268.2587 |
| 2 | govern:chooseNStep:confirm | continuedDeepening | 33 | 11863.96 | 359.5139 | 371.9176 | 7009.7804 |
| 3 | govern:chooseNStep:add | continuedDeepening | 55 | 11245.6 | 204.4655 | 283.9428 | 4168.9663 |
| 4 | event | singlePass | 109 | 8481.78 | 77.8145 | 171.3877 | 3219.5917 |
| 5 | coupArvnRedeployPolice:chooseOne | continuedDeepening | 58 | 7654.37 | 131.9719 | 321.8694 | 343.6722 |
| 6 | train:chooseNStep:confirm | continuedDeepening | 12 | 5842.81 | 486.9007 | 2792.1542 | 2792.1542 |
| 7 | govern | singlePass | 47 | 3098 | 65.9148 | 75.3679 | 642.3312 |
| 8 | rally | singlePass | 67 | 2447.34 | 36.5275 | 108.0264 | 156.6268 |
| 9 | coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | 84 | 1753.45 | 20.8744 | 34.6985 | 43.6293 |
| 10 | event-decision:chooseNStep:add | continuedDeepening | 6 | 1489.38 | 248.2298 | 423.4991 | 423.4991 |

## Hot-Path Buckets For Top Slow Axes

Captured only when `--profile-buckets` is enabled. Buckets are timing/count diagnostics inside `PolicyAgent.chooseDecision`; they are not correctness assertions.

### train:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 14414 | 2515.47 |
| zobrist:encodeDecisionStackFrame | 14556 | 1560.75 |
| tokenStateIndex:refreshCachedEntries | 14138 | 217.26 |
| evalQuery:countMatchingTokens | 48749 | 72.43 |
| evalQuery:applyTokenFilter | 12430 | 34.8 |
| evalQuery:applyTokenFilterCacheHit | 12401 | 0 |
| evalQuery:applyTokenFilterCompiled | 12430 | 0 |
| evalQuery:countMatchingTokensCacheHit | 1572349 | 0 |
| evalQuery:countMatchingTokensCompiled | 15001 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 3900523 | 0 |
| tokenStateIndex:getCacheHit | 27685 | 0 |
| zobrist:decisionStackFrameEncodedChars | 308810854 | 0 |

### govern:chooseNStep:confirm | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 38942 | 535.63 |
| evalQuery:applyTokenFilter | 183588 | 267.27 |
| zobrist:encodeDecisionStackFrame | 1456 | 62.34 |
| zobrist:digestDecisionStackFrame | 894 | 46.63 |
| evalQuery:countMatchingTokens | 25233 | 26.5 |
| evalQuery:applyTokenFilterCacheHit | 20823 | 0 |
| evalQuery:applyTokenFilterCompiled | 183240 | 0 |
| evalQuery:countMatchingTokensCacheHit | 2206552 | 0 |
| evalQuery:countMatchingTokensCompiled | 18089 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 4826909 | 0 |
| tokenStateIndex:getCacheHit | 144460 | 0 |
| zobrist:decisionStackFrameEncodedChars | 5676645 | 0 |

### govern:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 32445 | 405.2 |
| zobrist:digestDecisionStackFrame | 5372 | 251.42 |
| zobrist:encodeDecisionStackFrame | 5508 | 210.88 |
| evalQuery:applyTokenFilter | 115371 | 177.4 |
| evalQuery:countMatchingTokens | 25496 | 30.35 |
| evalQuery:applyTokenFilterCacheHit | 16374 | 0 |
| evalQuery:applyTokenFilterCompiled | 115110 | 0 |
| evalQuery:countMatchingTokensCacheHit | 2253157 | 0 |
| evalQuery:countMatchingTokensCompiled | 20138 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 5052040 | 0 |
| evalQuery:countMatchingTokensNoFilter | 98 | 0 |
| tokenStateIndex:getCacheHit | 108349 | 0 |

### event | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 58155 | 741.35 |
| evalQuery:applyTokenFilter | 110471 | 220.77 |
| zobrist:digestDecisionStackFrame | 1026 | 194.45 |
| zobrist:encodeDecisionStackFrame | 1026 | 120.8 |
| evalQuery:countMatchingTokens | 48979 | 49.81 |
| tokenStateIndex:build | 18 | 0.75 |
| evalQuery:applyTokenFilterCacheHit | 17767 | 0 |
| evalQuery:applyTokenFilterCompiled | 109715 | 0 |
| evalQuery:countMatchingTokensCacheHit | 1101635 | 0 |
| evalQuery:countMatchingTokensCompiled | 34951 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 2367804 | 0 |
| evalQuery:countMatchingTokensNoFilter | 20 | 0 |

### coupArvnRedeployPolice:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 142412 | 1365.26 |
| evalQuery:countMatchingTokens | 160806 | 189.7 |
| zobrist:digestDecisionStackFrame | 546 | 28.86 |
| zobrist:encodeDecisionStackFrame | 550 | 25.77 |
| evalQuery:applyTokenFilterCacheHit | 2998 | 0 |
| evalQuery:countMatchingTokensCacheHit | 3646550 | 0 |
| evalQuery:countMatchingTokensCompiled | 160806 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 10270634 | 0 |
| tokenStateIndex:getCacheHit | 142412 | 0 |
| zobrist:decisionStackFrameEncodedChars | 3410899 | 0 |
| zobrist:decisionStackFrameRunLocalCacheHit | 4 | 0 |
| zobrist:decisionStackFrameRunLocalCacheMiss | 546 | 0 |

### train:chooseNStep:confirm | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 8094 | 1464.45 |
| zobrist:encodeDecisionStackFrame | 8222 | 882.95 |
| tokenStateIndex:refreshCachedEntries | 3143 | 55.59 |
| evalQuery:countMatchingTokens | 5717 | 7.14 |
| evalQuery:applyTokenFilter | 1338 | 5.24 |
| evalQuery:applyTokenFilterCacheHit | 5135 | 0 |
| evalQuery:applyTokenFilterCompiled | 1338 | 0 |
| evalQuery:countMatchingTokensCacheHit | 314083 | 0 |
| evalQuery:countMatchingTokensCompiled | 5717 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 802340 | 0 |
| tokenStateIndex:getCacheHit | 7901 | 0 |
| zobrist:decisionStackFrameEncodedChars | 179770869 | 0 |

### govern | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| zobrist:digestDecisionStackFrame | 1272 | 161.46 |
| zobrist:encodeDecisionStackFrame | 1272 | 107.05 |
| tokenStateIndex:refreshCachedEntries | 5895 | 100 |
| evalQuery:applyTokenFilter | 17878 | 41.12 |
| evalQuery:countMatchingTokens | 7289 | 9.16 |
| evalQuery:applyTokenFilterCacheHit | 18565 | 0 |
| evalQuery:applyTokenFilterCompiled | 17771 | 0 |
| evalQuery:countMatchingTokensCacheHit | 777880 | 0 |
| evalQuery:countMatchingTokensCompiled | 5127 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1474848 | 0 |
| tokenStateIndex:getCacheHit | 27049 | 0 |
| zobrist:decisionStackFrameEncodedChars | 19657707 | 0 |

### rally | singlePass

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 14941 | 167.62 |
| zobrist:digestDecisionStackFrame | 466 | 50.41 |
| zobrist:encodeDecisionStackFrame | 466 | 33.28 |
| evalQuery:applyTokenFilter | 14055 | 31.67 |
| evalQuery:countMatchingTokens | 25364 | 27.47 |
| evalQuery:applyTokenFilterCacheHit | 7168 | 0 |
| evalQuery:applyTokenFilterCompiled | 13739 | 0 |
| evalQuery:countMatchingTokensCacheHit | 1285546 | 0 |
| evalQuery:countMatchingTokensCompiled | 13731 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 3177444 | 0 |
| tokenStateIndex:getCacheHit | 41660 | 0 |
| zobrist:decisionStackFrameEncodedChars | 6080096 | 0 |

### coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 22140 | 201.92 |
| evalQuery:countMatchingTokens | 36818 | 41.61 |
| zobrist:digestDecisionStackFrame | 252 | 11.39 |
| zobrist:encodeDecisionStackFrame | 256 | 9.91 |
| evalQuery:applyTokenFilterCacheHit | 1136 | 0 |
| evalQuery:countMatchingTokensCacheHit | 1088222 | 0 |
| evalQuery:countMatchingTokensCompiled | 36818 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 2310269 | 0 |
| tokenStateIndex:getCacheHit | 22140 | 0 |
| zobrist:decisionStackFrameEncodedChars | 1375821 | 0 |
| zobrist:decisionStackFrameRunLocalCacheHit | 4 | 0 |
| zobrist:decisionStackFrameRunLocalCacheMiss | 252 | 0 |

### event-decision:chooseNStep:add | continuedDeepening

| Bucket | Count | Total ms |
|---|---:|---:|
| tokenStateIndex:refreshCachedEntries | 6517 | 91.12 |
| zobrist:digestDecisionStackFrame | 1396 | 45.87 |
| zobrist:encodeDecisionStackFrame | 1528 | 34.68 |
| evalQuery:countMatchingTokens | 5447 | 9.63 |
| evalQuery:applyTokenFilter | 2149 | 7.23 |
| evalQuery:applyTokenFilterCacheHit | 1472 | 0 |
| evalQuery:applyTokenFilterCompiled | 2127 | 0 |
| evalQuery:countMatchingTokensCacheHit | 641942 | 0 |
| evalQuery:countMatchingTokensCompiled | 3379 | 0 |
| evalQuery:countMatchingTokensFilteredItems | 1306542 | 0 |
| tokenStateIndex:getCacheHit | 20143 | 0 |
| zobrist:decisionStackFrameEncodedChars | 5451520 | 0 |


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
| assault:chooseNStep:add | 8 | 6 | 0.1607 | 0.0481 | 3.341 | hot axis |
| event-decision:chooseOne | 12 | 6 | 0.3448 | 0.1465 | 2.3536 |  |
| coupNvaRedeployTroops | 11 | 1 | 8.7557 | 4.445 | 1.9698 |  |
| coupArvnRedeployPolice:chooseOne | 58 | 50 | 131.9719 | 71.0722 | 1.8569 |  |
| train:chooseNStep:confirm | 22 | 17 | 265.6322 | 145.0176 | 1.8317 |  |
| govern:chooseNStep:confirm | 44 | 35 | 269.6585 | 206.9532 | 1.303 |  |
| event-decision:chooseNStep:add | 48 | 30 | 31.0616 | 25.0063 | 1.2422 |  |
| assault:chooseNStep:confirm | 16 | 12 | 0.0283 | 0.0231 | 1.2251 |  |
| advise:chooseNStep:confirm | 13 | 15 | 0.05 | 0.0415 | 1.2048 |  |
| govern | 47 | 35 | 65.9148 | 55.2102 | 1.1939 |  |
| coupRedeployPass | 32 | 24 | 8.1571 | 6.963 | 1.1715 |  |
| chooseNStep:chooseNStep:confirm | 6 | 3 | 0.0417 | 0.0357 | 1.1681 |  |
| ambushVc | 7 | 4 | 20.7256 | 17.7865 | 1.1652 |  |
| rally:chooseNStep:confirm | 77 | 72 | 0.0365 | 0.0316 | 1.1551 |  |
| train:chooseOne | 12 | 11 | 5.4466 | 4.7813 | 1.1391 |  |
| transport | 4 | 3 | 51.679 | 45.4575 | 1.1369 |  |
| infiltrate:chooseOne | 23 | 13 | 0.0413 | 0.0372 | 1.1102 |  |
| march:chooseNStep:add | 21 | 22 | 0.0642 | 0.0586 | 1.0956 |  |
| ambushVc:chooseNStep:confirm | 7 | 3 | 0.0267 | 0.0248 | 1.0766 |  |
| govern:chooseNStep:add | 55 | 35 | 204.4655 | 190.0793 | 1.0757 |  |
| coupVictoryCheck | 8 | 6 | 4.5754 | 4.3317 | 1.0563 |  |
| coupArvnRedeployOptionalTroops:chooseOne | 84 | 60 | 20.8744 | 19.7639 | 1.0562 |  |
| assault | 8 | 6 | 35.9138 | 34.0713 | 1.0541 |  |
| coupArvnRedeployPolice | 27 | 32 | 30.8973 | 29.7246 | 1.0395 |  |
| ambushVc:chooseNStep:add | 7 | 3 | 0.0468 | 0.0451 | 1.0377 |  |
| rally:chooseOne | 70 | 57 | 0.0339 | 0.0327 | 1.0367 |  |
| coupCommitmentResolve:chooseNStep:confirm | 8 | 8 | 0.0302 | 0.0294 | 1.0272 |  |
| infiltrate | 16 | 8 | 31.0677 | 30.6214 | 1.0146 |  |
| coupArvnRedeployOptionalTroops | 32 | 25 | 40.2139 | 39.6568 | 1.014 |  |
| coupResourcesResolve | 8 | 6 | 11.5214 | 11.3624 | 1.014 |  |
| advise | 13 | 15 | 37.4128 | 37.4673 | 0.9985 |  |
| rally | 67 | 54 | 36.5275 | 36.8586 | 0.991 |  |
| event-decision:chooseNStep:confirm | 47 | 27 | 0.0304 | 0.0308 | 0.987 |  |
| ambushVc:chooseOne | 7 | 4 | 0.0206 | 0.0209 | 0.9856 |  |
| coupPacifyARVN | 11 | 8 | 7.7447 | 7.9108 | 0.979 |  |
| coupCommitmentPass | 32 | 24 | 5.0517 | 5.1956 | 0.9723 |  |
| govern:chooseOne | 58 | 35 | 3.5659 | 3.7084 | 0.9616 |  |
| coupPacifyUS | 25 | 26 | 7.0931 | 7.4343 | 0.9541 |  |
| coupCommitmentResolve | 2 | 2 | 18.7144 | 20.5204 | 0.912 |  |
| march:chooseNStep:confirm | 35 | 29 | 0.0404 | 0.0455 | 0.8879 |  |
| event | 109 | 77 | 77.8145 | 89.2254 | 0.8721 |  |
| coupAgitateVC | 22 | 25 | 6.9527 | 8.0641 | 0.8622 |  |
| coupPacifyPass | 16 | 12 | 3.9331 | 4.5917 | 0.8566 |  |
| infiltrate:chooseNStep:confirm | 26 | 12 | 0.0329 | 0.0392 | 0.8393 |  |
| advise:chooseOne | 27 | 30 | 0.0434 | 0.052 | 0.8346 |  |
| coupAgitatePass | 8 | 6 | 4.176 | 5.0618 | 0.825 |  |
| rally:chooseNStep:add | 68 | 56 | 0.0691 | 0.0869 | 0.7952 |  |
| march | 15 | 13 | 67.7923 | 93.9856 | 0.7213 |  |
| advise:chooseNStep:add | 13 | 15 | 0.1178 | 0.1787 | 0.6592 |  |
| attack | 4 | 8 | 38.2224 | 63.2225 | 0.6046 |  |
| coupNvaRedeployTroops:chooseOne | 25 | 2 | 0.0398 | 0.0681 | 0.5844 |  |
| chooseOne:chooseOne | 13 | 8 | 0.5956 | 1.0572 | 0.5634 |  |
| train:chooseNStep:add | 14 | 11 | 908.3747 | 1756.3111 | 0.5172 |  |
| transport:chooseOne | 8 | 6 | 37.8511 | 74.6905 | 0.5068 |  |
| infiltrate:chooseNStep:add | 16 | 8 | 0.0511 | 0.1313 | 0.3892 |  |
| train | 8 | 7 | 39.8752 | 126.2168 | 0.3159 |  |

## Notes

- `elapsedMs` is measured around the per-decision `PolicyAgent.chooseDecision` call. It excludes simulator apply/delta work and report rendering.
- Child processes enforce the per-seed timeout. Each child loads the built engine and production FITL GameSpecDoc, using the repo GameDef cache when available.
- WASM timing buckets are emitted only when `POLICY_WASM_TIMING_PROFILE=1` is set before the child process imports the WASM runtime module.
- The script does not modify engine source or production profile data.
