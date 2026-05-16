# Spec 174 Phase 4 Architectural Blocker

**Status**: ✅ EXPLOITED — referenced during spec 174 implementation (archived 2026-05-16).

**Date**: 2026-05-16
**Gate verdict**: Fail
**Gate report**: `reports/174-phase-4-gate-decision.md`
**Witness report**: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-post-174-011.md`
**Witness CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-post-174-011.csv`
**Next owner**: `archive/tickets/174WASMDEEPPRV-014.md`

## Blocker Summary

Phase 3b deep materialized-state activation did not materially improve the Spec 173 residual. The post-174-011 slow-tier median was `62042.20 ms`, worse than the post-008 baseline median of `27211.75 ms` and above the required `<=20408.8125 ms` threshold.

The witness proves two blockers:

1. Production preview-drive route activation exists but is not dominant enough to justify the default flip: route count `181`, unsupported count `3394`, batch count `1712`.
2. The largest residual wall-time class, `coupArvnRedeployPolice:chooseOne`, recorded `275891.21 ms` of measured agent-call time with `0` production preview-drive route and `0` unsupported counts. The next owner must explain whether that class is bypassing the preview-drive route, running an unsupported path without reason-granular telemetry, or dominated by a non-preview-drive token/query workload.

## Dominant Unsupported Classes

The current witness exposes unsupported production preview-drive activity by microturn class. It does not yet expose the lower-level `unsupportedDriveClass` / `unsupportedOwner` reason on each measured row, so the next owner must add or reuse reason-granular telemetry before proposing a default flip.

| Microturn class | Agent-call ms | Share of agent-call ms | Unsupported count | Route count | Batch count |
|---|---:|---:|---:|---:|---:|
| govern:chooseNStep:add | 41476.26 | 7.96% | 759 | 0 | 0 |
| govern:chooseNStep:confirm | 39709.11 | 7.62% | 464 | 0 | 0 |
| event | 36986.63 | 7.10% | 457 | 0 | 0 |
| train:chooseNStep:add | 27902.19 | 5.35% | 227 | 2 | 0 |
| train:chooseNStep:confirm | 18507.09 | 3.55% | 147 | 12 | 0 |
| govern | 9815.43 | 1.88% | 176 | 0 | 30 |
| rally | 5731.85 | 1.10% | 338 | 0 | 14 |
| assault:chooseNStep:add | 4114.93 | 0.79% | 57 | 16 | 0 |
| chooseNStep:chooseNStep:add | 3856.08 | 0.74% | 42 | 44 | 0 |
| event-decision:chooseNStep:add | 3136.30 | 0.60% | 9 | 81 | 0 |

## Dominant Residual Classes

| Microturn class | Agent-call ms | Unsupported count | Route count | Batch count |
|---|---:|---:|---:|---:|
| coupArvnRedeployPolice:chooseOne | 275891.21 | 0 | 0 | 0 |
| govern:chooseNStep:add | 41476.26 | 759 | 0 | 0 |
| govern:chooseNStep:confirm | 39709.11 | 464 | 0 | 0 |
| event | 36986.63 | 457 | 0 | 0 |
| coupArvnRedeployOptionalTroops:chooseOne | 33752.67 | 0 | 0 | 0 |
| train:chooseNStep:add | 27902.19 | 227 | 2 | 0 |
| train:chooseNStep:confirm | 18507.09 | 147 | 12 | 0 |
| govern | 9815.43 | 176 | 0 | 30 |
| rally | 5731.85 | 338 | 0 | 14 |
| assault:chooseNStep:add | 4114.93 | 57 | 16 | 0 |

## Required Next Work

`archive/tickets/174WASMDEEPPRV-014.md` owns the next architectural slice:

- add or expose reason-granular unsupported preview-drive telemetry for the witness rows, without weakening Foundation 20 fallback provenance;
- explain the zero-counter high-wall-time classes, especially `coupArvnRedeployPolice:chooseOne`;
- determine whether the residual owner is another generic WASM preview-drive coverage extension, a token/query lifetime optimization, or a measurement-boundary correction;
- keep `archive/tickets/174WASMDEEPPRV-010.md` rejected unless a later gate decision records a Pass.
