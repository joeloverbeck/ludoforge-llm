# FITL ARVN 15-Seed Per-Microturn-Class Decomposition

**Date**: 2026-05-15-post-005-profile-buckets-smoke
**Status**: Diagnostic smoke witness for Spec 173 profile-bucket instrumentation; not a closeout artifact.
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000 --timeout-ms 400000 --date 2026-05-15-post-005-profile-buckets-smoke --profile-buckets`
**CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-005-profile-buckets-smoke.csv`

## Summary

- Seeds completed: 1/1
- Per-decision rows: 159
- Hot class with slow:fast ratio >3x: no
- Per-seed timeout: 400000 ms
- Hot-path buckets: enabled

## Per-Seed Wall Time

| Seed | Status | Stop Reason | Wall ms | Decisions | ms/decision | Error |
|---:|---|---|---:|---:|---:|---|
| 1000 | OK | terminal | 13123.6 | 159 | 82.5384 |  |

## Per-Microturn-Class Rollup

| Microturn class | Decisions | Total ms | Mean ms | p95 ms | Max ms | Mean candidates | Encoded builds | Encoded object hits | Encoded hash hits | Encoded misses | Bytecode compiles | Token index builds | Static rebuilds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| coupArvnRedeployPolice:chooseOne | 17 | 7506.66 | 441.5685 | 826.858 | 826.858 | 30 | 0 | 7453 | 257 | 0 | 0 | 0 | 0 |
| transport:chooseOne | 2 | 1090.23 | 545.1152 | 545.865 | 545.865 | 25 | 0 | 342 | 9 | 0 | 0 | 0 | 0 |
| govern:chooseNStep:add | 3 | 594.93 | 198.3096 | 259.127 | 259.127 | 6.6667 | 0 | 97 | 161 | 0 | 0 | 0 | 0 |
| event | 9 | 530 | 58.8893 | 248.6019 | 248.6019 | 14.7778 | 9 | 0 | 0 | 9 | 10 | 18 | 11 |
| govern:chooseNStep:confirm | 3 | 514.75 | 171.5844 | 204.3338 | 204.3338 | 7.6667 | 0 | 82 | 37 | 0 | 0 | 0 | 0 |
| train:chooseNStep:add | 2 | 496.72 | 248.3614 | 472.8245 | 472.8245 | 14 | 0 | 107 | 55 | 0 | 0 | 0 | 0 |
| coupArvnRedeployPolice | 10 | 205.62 | 20.5622 | 28.1427 | 28.1427 | 10.5 | 9 | 0 | 1 | 9 | 0 | 0 | 9 |
| rally | 10 | 180.58 | 18.0581 | 42.7476 | 42.7476 | 10.7 | 8 | 0 | 2 | 8 | 19 | 0 | 8 |
| govern | 3 | 118.14 | 39.3809 | 64.6427 | 64.6427 | 10.6667 | 3 | 0 | 0 | 3 | 10 | 0 | 3 |
| govern:chooseOne | 3 | 83.66 | 27.8853 | 30.7121 | 30.7121 | 2 | 0 | 3 | 3 | 0 | 0 | 0 | 0 |
| transport | 1 | 67.31 | 67.3051 | 67.3051 | 67.3051 | 13 | 1 | 0 | 0 | 1 | 0 | 0 | 1 |
| train:chooseOne | 2 | 52.73 | 26.3669 | 28.3315 | 28.3315 | 2.5 | 0 | 3 | 4 | 0 | 0 | 0 | 0 |
| coupPacifyUS | 5 | 51.07 | 10.2139 | 13.7818 | 13.7818 | 2.8 | 5 | 0 | 0 | 5 | 0 | 0 | 5 |
| coupAgitateVC | 5 | 30.92 | 6.1835 | 7.6752 | 7.6752 | 3.4 | 4 | 0 | 1 | 4 | 0 | 0 | 4 |
| advise | 3 | 22.8 | 7.6013 | 8.651 | 8.651 | 10.6667 | 2 | 0 | 1 | 2 | 1 | 0 | 2 |
| coupRedeployPass | 4 | 18.75 | 4.6882 | 11.5003 | 11.5003 | 2 | 1 | 0 | 3 | 1 | 0 | 0 | 1 |
| coupPacifyARVN | 2 | 17.78 | 8.8923 | 11.3773 | 11.3773 | 3.5 | 1 | 0 | 1 | 1 | 0 | 0 | 1 |
| train | 1 | 12.64 | 12.6377 | 12.6377 | 12.6377 | 5 | 1 | 0 | 0 | 1 | 0 | 0 | 1 |
| coupCommitmentPass | 4 | 11.4 | 2.8501 | 3.2409 | 3.2409 | 1 | 1 | 0 | 3 | 1 | 0 | 0 | 1 |
| march | 2 | 9.87 | 4.9374 | 5.6615 | 5.6615 | 1 | 2 | 0 | 0 | 2 | 0 | 0 | 2 |
| coupPacifyPass | 2 | 9.04 | 4.5178 | 4.5265 | 4.5265 | 1 | 2 | 0 | 0 | 2 | 0 | 0 | 2 |
| attack | 1 | 8.43 | 8.4262 | 8.4262 | 8.4262 | 15 | 1 | 0 | 0 | 1 | 0 | 0 | 1 |
| coupCommitmentResolve | 1 | 5.24 | 5.2362 | 5.2362 | 5.2362 | 2 | 0 | 0 | 1 | 0 | 0 | 0 | 0 |
| coupResourcesResolve | 1 | 4.88 | 4.8809 | 4.8809 | 4.8809 | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 0 |
| coupAgitatePass | 1 | 4.07 | 4.0697 | 4.0697 | 4.0697 | 1 | 1 | 0 | 0 | 1 | 0 | 0 | 1 |
| coupVictoryCheck | 1 | 3.29 | 3.2862 | 3.2862 | 3.2862 | 1 | 1 | 0 | 0 | 1 | 0 | 0 | 1 |
| rally:chooseNStep:add | 10 | 1.31 | 0.1309 | 0.5971 | 0.5971 | 17.6 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseNStep:confirm | 11 | 0.64 | 0.0582 | 0.1503 | 0.1503 | 13.2727 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rally:chooseOne | 11 | 0.54 | 0.0492 | 0.1306 | 0.1306 | 1.3636 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:add | 4 | 0.24 | 0.0597 | 0.0832 | 0.0832 | 2.75 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| march:chooseNStep:confirm | 4 | 0.23 | 0.0568 | 0.0805 | 0.0805 | 3.75 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseOne | 6 | 0.2 | 0.0327 | 0.0398 | 0.0398 | 2.3333 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| train:chooseNStep:confirm | 2 | 0.19 | 0.097 | 0.0977 | 0.0977 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:add | 3 | 0.16 | 0.0535 | 0.0575 | 0.0575 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| coupCommitmentResolve:chooseNStep:confirm | 4 | 0.12 | 0.0303 | 0.0416 | 0.0416 | 9.25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| advise:chooseNStep:confirm | 3 | 0.11 | 0.0378 | 0.0449 | 0.0449 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| chooseNStep:chooseNStep:confirm | 1 | 0.05 | 0.0473 | 0.0473 | 0.0473 | 6 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| chooseOne:chooseOne | 1 | 0.04 | 0.0383 | 0.0383 | 0.0383 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| event-decision:chooseNStep:confirm | 1 | 0.04 | 0.0439 | 0.0439 | 0.0439 | 34 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Top Hot Axes In Slow-Tier Seeds

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`. Axes are `microturnClass + previewBranch`, ranked by total measured agent-call time.

| Rank | Microturn class | Preview branch | Decisions | Total ms | Mean ms | p95 ms | Max ms |
|---:|---|---|---:|---:|---:|---:|---:|

## Hot-Path Buckets For Top Slow Axes

Captured only when `--profile-buckets` is enabled. Buckets are timing/count diagnostics inside `PolicyAgent.chooseDecision`; they are not correctness assertions.


## Fast-Tier vs Slow-Tier Delta

Fast tier: `1000`, `1006`, `1007`, `1010`, `1014`. Rows with ratio greater than `3.0` satisfy the Phase 0 hot-axis criterion.

| Microturn class | Slow decisions | Fast decisions | Slow mean ms | Fast mean ms | Slow:fast ratio | Verdict |
|---|---:|---:|---:|---:|---:|---|

## Notes

- `elapsedMs` is measured around the per-decision `PolicyAgent.chooseDecision` call. It excludes simulator apply/delta work and report rendering.
- Child processes enforce the per-seed timeout. Each child loads the built engine and production FITL GameSpecDoc, using the repo GameDef cache when available.
- The script does not modify engine source or production profile data.
