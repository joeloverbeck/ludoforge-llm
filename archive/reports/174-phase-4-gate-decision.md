# Spec 174 Phase 4 Gate Decision

**Status**: ✅ EXPLOITED — referenced during spec 174 implementation (archived 2026-05-16).

**Date**: 2026-05-16
**Verdict**: Fail
**Decision owner**: `archive/tickets/174WASMDEEPPRV-009.md`
**Witness report**: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-post-174-011.md`
**Witness CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-post-174-011.csv`
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 400000 --date 2026-05-16-post-174-011 --profile-buckets`

## Gate Math

The Phase 4 gate required the slow-tier median elapsed time for seeds `1005`, `1011`, `1008`, `1013`, and `1009` to improve by at least 25% versus the post-008 baseline.

| Metric | Value |
|---|---:|
| Post-008 baseline slow-tier median | 27211.75 ms |
| Required final median for 25% improvement | <= 20408.8125 ms |
| Post-174-011 final slow-tier median | 62042.20 ms |
| Delta vs baseline | +34830.45 ms |
| Percent change vs baseline | +127.9978% |
| Improvement | -127.9978% |
| Verdict | Fail |

## Slow-Tier Per-Seed Wall Time

| Seed | Post-008 wall ms | Post-174-011 wall ms | Delta ms |
|---:|---:|---:|---:|
| 1005 | 75311.43 | 105568.95 | +30257.52 |
| 1011 | 27575.25 | 73940.56 | +46365.31 |
| 1008 | 27181.00 | 62042.20 | +34861.20 |
| 1013 | 24326.57 | 9894.41 | -14432.16 |
| 1009 | 27211.75 | 15191.22 | -12020.53 |

## Activation Counters

| Counter | Value |
|---|---:|
| WASM production preview-drive route count | 181 |
| WASM production preview-drive unsupported count | 3394 |
| WASM production preview-drive batch count | 1712 |

## Per-Microturn-Class Unsupported Leaders

These rows rank microturn classes with nonzero production preview-drive unsupported counts by measured `PolicyAgent.chooseDecision` elapsed time in the witness CSV.

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

## Decision

Ticket `archive/tickets/174WASMDEEPPRV-010.md` must not proceed with the default flip or A/B deletion. The fail-path blocker report is `reports/174-phase-4-architectural-blocker.md`, and the diagnostic owner is `archive/tickets/174WASMDEEPPRV-014.md`.
