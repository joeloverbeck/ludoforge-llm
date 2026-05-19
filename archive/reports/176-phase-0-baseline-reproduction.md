# Spec 176 Phase 0 Baseline Reproduction

**Status**: ✅ EXPLOITED — archived 2026-05-19.

**Date**: 2026-05-17
**Status**: Phase 0 witness complete.
**Ticket**: `archive/tickets/176POLWASMPERF-001.md`

## Commands

```bash
node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 600000 --date 2026-05-17-phase-0-wasm-on
POLICY_WASM_TIMING_PROFILE=1 node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 600000 --date 2026-05-17-phase-0-wasm-on-timed
node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 600000 --date 2026-05-17-phase-0-no-wasm --no-wasm
```

## Artifacts

- WASM-on baseline: `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-0-wasm-on.md`, `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-0-wasm-on.csv`
- WASM-on with timing buckets: `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-0-wasm-on-timed.md`, `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-0-wasm-on-timed.csv`
- No-WASM baseline: `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-0-no-wasm.md`, `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-0-no-wasm.csv`

## Baseline Verdict

| Mode | Historical Phase 4i slow-tier median ms | 2026-05-17 slow-tier median ms | Delta vs historical | Verdict |
|---|---:|---:|---:|---|
| WASM-on | 11536.43 | 11293.29 | -2.11% | pass |
| No-WASM | 11089.56 | 11592.66 | +4.54% | pass |

Both modes reproduce the Phase 4i equivalence finding within the ticket's +/-5% slow-tier median bound.

The flag-off WASM-on run is the production-overhead witness for the newly landed instrumentation code. It remains within the historical seed-to-seed noise band: `11293.29 ms` slow-tier median vs the Phase 4i `11536.43 ms` median.

## Slow-Tier Per-Seed Wall Time

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009`.

| Seed | WASM-on wall ms | WASM-on timed wall ms | No-WASM wall ms |
|---:|---:|---:|---:|
| 1005 | 42775.27 | 43792.62 | 39646.60 |
| 1008 | 18884.11 | 18574.33 | 19090.18 |
| 1009 | 11293.29 | 12089.08 | 11592.66 |
| 1011 | 7223.74 | 7149.98 | 7010.92 |
| 1013 | 7166.38 | 7640.52 | 7895.74 |

## Total Wall Time

| Mode | Total 15-seed wall ms |
|---|---:|
| WASM-on | 208871.25 |
| WASM-on timed | 210677.99 |
| No-WASM | 210799.02 |

## Timing Buckets

Timing buckets were collected only from the `POLICY_WASM_TIMING_PROFILE=1` run. Values are raw Phase 0 substrate for later hypothesis tickets, not a Phase 1 attribution verdict.

| Route class | Calls | Marshaling ms | WASM execution ms | Deserialization ms |
|---|---:|---:|---:|---:|
| scoreRows | 11498 | 761.3181 | 404.9374 | 11.2538 |
| previewCandidateFeatureRows | 766 | 122.9312 | 28.6358 | 0.9734 |
| productionPreviewDrive | 5784 | 339.6315 | 29.8027 | 191.4198 |
| total | 18048 | 1223.8808 | 463.3759 | 203.6470 |

## Invariant Notes

- `POLICY_WASM_TIMING_PROFILE` is read at module import by the timing-profile module. The focused unit test verifies later `process.env` mutations do not change the cached flag.
- With the flag unset, snapshots remain zero-valued after routed WASM calls.
- `--no-wasm` skips `initializePolicyWasmRuntimeSync(...)`; the no-WASM witness completed all 15 seeds without runtime initialization errors.
- Timing buckets are observational only. They are not written to traces, do not influence policy choices, and are reset per seed by the decomposition profiler.
