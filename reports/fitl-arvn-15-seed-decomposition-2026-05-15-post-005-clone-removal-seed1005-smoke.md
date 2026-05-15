# FITL ARVN 15-Seed Per-Microturn-Class Decomposition

**Date**: 2026-05-15-post-005-clone-removal-seed1005-smoke
**Status**: Red diagnostic smoke witness for a reverted Spec 173 clone-removal candidate; not a closeout artifact.
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005 --timeout-ms 400000 --date 2026-05-15-post-005-clone-removal-seed1005-smoke`
**CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-005-clone-removal-seed1005-smoke.csv`

## Summary

- Seeds completed: 1/1
- Per-decision rows: 412
- Hot class with slow:fast ratio >3x: no
- Per-seed timeout: 400000 ms

## Per-Seed Wall Time

| Seed | Status | Stop Reason | Wall ms | Decisions | ms/decision | Error |
|---:|---|---|---:|---:|---:|---|
| 1005 | OK | terminal | 84177.93 | 412 | 204.3154 |  |

## Per-Microturn-Class Rollup

| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | Token index builds | Static rebuilds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| train:chooseNStep:add | 13 | 18669.49 | 1436.1147 | 3326.9766 | 3326.9766 | 13.4615 | 0 | 5541 | 12351 | 0 | 0 | 0 | 0 |
| coupArvnRedeployPolice:chooseOne | 16 | 18239.31 | 1139.9569 | 2544.3754 | 2544.3754 | 30.5 | 0 | 19852 | 680 | 0 | 0 | 0 | 0 |
| train:chooseNStep:confirm | 15 | 15837.63 | 1055.8422 | 3413.0635 | 3413.0635 | 10.6 | 0 | 4574 | 9720 | 0 | 0 | 0 | 0 |
| govern:chooseNStep:confirm | 5 | 8834.43 | 1766.8858 | 8246.2229 | 8246.2229 | 7.2 | 0 | 125 | 57 | 0 | 0 | 0 | 0 |
| govern:chooseNStep:add | 5 | 5661.27 | 1132.2534 | 4882.936 | 4882.936 | 6.2 | 0 | 150 | 289 | 0 | 0 | 0 | 0 |
| coupArvnRedeployMandatory:chooseOne | 12 | 2525.93 | 210.4944 | 308.7921 | 308.7921 | 8 | 0 | 1428 | 204 | 0 | 0 | 0 | 0 |
| transport:chooseOne | 8 | 2297.5 | 287.1869 | 816.4203 | 816.4203 | 12.75 | 0 | 362 | 22 | 0 | 0 | 0 | 0 |
| coupArvnRedeployOptionalTroops:chooseOne | 12 | 1881.95 | 156.8292 | 218.2783 | 218.2783 | 8 | 0 | 420 | 60 | 0 | 0 | 0 | 0 |
| event | 29 | 1824.97 | 62.9301 | 98.2836 | 625.9839 | 21.0345 | 29 | 0 | 0 | 29 | 10 | 0 | 31 |
| govern:chooseOne | 7 | 1325.2 | 189.3145 | 1144.7803 | 1144.7803 | 2 | 0 | 7 | 7 | 0 | 0 | 0 | 0 |
| govern | 7 | 1025.27 | 146.4672 | 704.0496 | 704.0496 | 10.5714 | 7 | 0 | 0 | 7 | 0 | 0 | 7 |
| train:chooseOne | 9 | 322.38 | 35.8202 | 48.5852 | 48.5852 | 2.3333 | 0 | 24 | 29 | 0 | 0 | 0 | 0 |
| rally | 19 | 313.83 | 16.5173 | 55.9034 | 55.9034 | 25.6316 | 15 | 0 | 4 | 15 | 4 | 0 | 15 |
| transport | 4 | 304.76 | 76.1897 | 105.0355 | 105.0355 | 11 | 4 | 0 | 0 | 4 | 0 | 0 | 4 |
| train | 5 | 167.03 | 33.4062 | 40.2326 | 40.2326 | 11.4 | 5 | 0 | 0 | 5 | 10 | 0 | 5 |
| coupArvnRedeployOptionalTroops | 6 | 146.24 | 24.3736 | 28.0219 | 28.0219 | 17.5 | 5 | 0 | 1 | 5 | 0 | 0 | 5 |
| coupArvnRedeployPolice | 6 | 135.82 | 22.6371 | 26.0087 | 26.0087 | 11.6667 | 6 | 0 | 0 | 6 | 0 | 0 | 6 |
| chooseOne:chooseOne | 3 | 97.04 | 32.346 | 96.4345 | 96.4345 | 6.6667 | 0 | 4 | 1 | 0 | 0 | 0 | 0 |
| coupRedeployPass | 8 | 59.38 | 7.422 | 21.637 | 21.637 | 3 | 4 | 0 | 4 | 4 | 13 | 0 | 4 |
| coupArvnRedeployMandatory | 2 | 54.89 | 27.4437 | 28.1366 | 28.1366 | 11.5 | 1 | 0 | 1 | 1 | 0 | 0 | 1 |
| coupNvaRedeployTroops | 6 | 35.46 | 5.9098 | 8.0016 | 8.0016 | 4.5 | 5 | 0 | 1 | 5 | 0 | 0 | 5 |
| attack | 3 | 30.92 | 10.3066 | 11.3776 | 11.3776 | 53 | 3 | 0 | 0 | 3 | 0 | 0 | 3 |
| coupPacifyUS | 5 | 30.43 | 6.0852 | 9.9146 | 9.9146 | 2.8 | 5 | 0 | 0 | 5 | 0 | 0 | 5 |
| coupCommitmentPass | 8 | 20.78 | 2.5976 | 3.5789 | 3.5789 | 1 | 2 | 0 | 6 | 2 | 0 | 0 | 2 |
| march | 3 | 15.93 | 5.3111 | 6.7626 | 6.7626 | 3 | 1 | 0 | 2 | 1 | 0 | 0 | 1 |
| infiltrate | 2 | 15.56 | 7.7819 | 10.5904 | 10.5904 | 30.5 | 1 | 0 | 1 | 1 | 0 | 0 | 1 |
| coupAgitateVC | 3 | 15.39 | 5.1307 | 5.8877 | 5.8877 | 2.3333 | 1 | 0 | 2 | 1 | 2 | 0 | 1 |
| coupPacifyPass | 4 | 14.59 | 3.6468 | 4.2475 | 4.2475 | 1 | 3 | 0 | 1 | 3 | 0 | 0 | 3 |
| coupPacifyARVN | 1 | 12.18 | 12.1776 | 12.1776 | 12.1776 | 6 | 0 | 0 | 1 | 0 | 0 | 0 | 0 |
| assault | 1 | 9.65 | 9.645 | 9.645 | 9.645 | 4 | 1 | 0 | 0 | 1 | 1 | 0 | 1 |
| coupResourcesResolve | 2 | 9.23 | 4.6141 | 5.1376 | 5.1376 | 1 | 1 | 0 | 1 | 1 | 0 | 0 | 1 |
| coupAgitatePass | 2 | 9.16 | 4.5776 | 5.0616 | 5.0616 | 1.5 | 2 | 0 | 0 | 2 | 0 | 0 | 2 |
| coupCommitmentResolve | 2 | 7.82 | 3.9088 | 4.0863 | 4.0863 | 2 | 0 | 0 | 2 | 0 | 0 | 0 | 0 |
| coupVictoryCheck | 2 | 7.79 | 3.8943 | 4.9567 | 4.9567 | 1 | 2 | 0 | 0 | 2 | 0 | 0 | 2 |
| advise | 1 | 6.8 | 6.7993 | 6.7993 | 6.7993 | 12 | 1 | 0 | 0 | 1 | 0 | 0 | 1 |
| event-decision:chooseNStep:add | 26 | 1.33 | 0.051 | 0.0726 | 0.0985 | 11.5385 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseNStep:add | 19 | 1.13 | 0.0597 | 0.1104 | 0.1104 | 22.1053 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseNStep:confirm | 28 | 0.93 | 0.0333 | 0.0429 | 0.0758 | 18.5357 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseNStep:confirm | 23 | 0.65 | 0.0281 | 0.0372 | 0.0486 | 3.8696 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseOne | 19 | 0.65 | 0.034 | 0.1029 | 0.1029 | 1.3158 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupNvaRedeployTroops:chooseOne | 17 | 0.64 | 0.0378 | 0.0547 | 0.0547 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseOne | 7 | 0.28 | 0.0396 | 0.054 | 0.054 | 3.1429 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupCommitmentResolve:chooseNStep:confirm | 8 | 0.25 | 0.0312 | 0.045 | 0.045 | 9.25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:confirm | 8 | 0.24 | 0.0306 | 0.0408 | 0.0408 | 3.875 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:add | 3 | 0.23 | 0.0763 | 0.087 | 0.087 | 23 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| chooseNStep:chooseNStep:confirm | 3 | 0.17 | 0.0578 | 0.0878 | 0.0878 | 19.6667 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:confirm | 3 | 0.12 | 0.0415 | 0.0627 | 0.0627 | 4.6667 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseOne | 3 | 0.12 | 0.0398 | 0.0562 | 0.0562 | 1.6667 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:add | 1 | 0.09 | 0.0907 | 0.0907 | 0.0907 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| infiltrate:chooseNStep:add | 2 | 0.09 | 0.0434 | 0.0456 | 0.0456 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| assault:chooseNStep:confirm | 2 | 0.07 | 0.0366 | 0.0456 | 0.0456 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseOne | 2 | 0.06 | 0.031 | 0.0343 | 0.0343 | 2.5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:add | 1 | 0.05 | 0.0541 | 0.0541 | 0.0541 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:confirm | 1 | 0.04 | 0.0362 | 0.0362 | 0.0362 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Top Hot Axes In Slow-Tier Seeds

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.

| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms |
|---:|---|---|---:|---:|---:|---:|---:|
| 1 | train:chooseNStep:add | continuedDeepening | 13 | 18669.49 | 1436.1147 | 3326.9766 | 3326.9766 |
| 2 | coupArvnRedeployPolice:chooseOne | continuedDeepening | 16 | 18239.31 | 1139.9569 | 2544.3754 | 2544.3754 |
| 3 | train:chooseNStep:confirm | continuedDeepening | 10 | 15837.19 | 1583.719 | 3413.0635 | 3413.0635 |
| 4 | govern:chooseNStep:confirm | continuedDeepening | 5 | 8834.43 | 1766.8858 | 8246.2229 | 8246.2229 |
| 5 | govern:chooseNStep:add | continuedDeepening | 5 | 5661.27 | 1132.2534 | 4882.936 | 4882.936 |
| 6 | coupArvnRedeployMandatory:chooseOne | continuedDeepening | 12 | 2525.93 | 210.4944 | 308.7921 | 308.7921 |
| 7 | transport:chooseOne | continuedDeepening | 8 | 2297.5 | 287.1869 | 816.4203 | 816.4203 |
| 8 | coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening | 12 | 1881.95 | 156.8292 | 218.2783 | 218.2783 |
| 9 | event | singlePass | 29 | 1824.97 | 62.9301 | 98.2836 | 625.9839 |
| 10 | govern:chooseOne | continuedDeepening | 7 | 1325.2 | 189.3145 | 1144.7803 | 1144.7803 |

## Fast-Tier vs Slow-Tier Delta

Fast tier: `1000`, `1006`, `1007`, `1010`, `1014`. Rows with ratio greater than `3.0` satisfy the Phase 0 hot-axis criterion.

| Microturn class | Slow decisions | Fast decisions | Slow mean ms | Fast mean ms | Slow:fast ratio | Verdict |
|---|---:|---:|---:|---:|---:|---|

## Notes

- `elapsedMs` is measured around the per-decision `PolicyAgent.chooseDecision` call. It excludes simulator apply/delta work and report rendering.
- Child processes enforce the per-seed timeout. Each child loads the built engine and production FITL GameSpecDoc, using the repo GameDef cache when available.
- The script does not modify engine source or production profile data.
