# Spec 180 Phase 5 - FITL ARVN Standing Witness

**Date**: 2026-05-18
**Ticket**: `archive/tickets/180STDVECOBSROL-006.md`
**Profile measured**: `arvn-evolved`
**Raw trace delivery**: ignored under `campaigns/fitl-arvn-agent-evolution/traces/`; durable evidence is transcribed here.

## Profile Change

`data/games/fire-in-the-lake/92-agents.md` now adds two ARVN move-scope considerations:

- `hurtCurrentLeader`: scores the projected margin for `seatAgg.over: { role: currentLeader }`.
- `reduceNearestThreat`: scores the projected margin for `seatAgg.over: { role: nearestThreat }`.

Both use `preview.victory.currentMargin.$seat`, `availability: selfAndTargetReady`, and `previewFallback.onUnavailable: noContribution`. No engine code or FITL-specific runtime branch was added.

## Commands

```bash
pnpm -F @ludoforge/engine build
node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 15 --trace-default all --concurrency 8
node campaigns/fitl-arvn-agent-evolution/diagnose-action-distribution.mjs
node campaigns/fitl-arvn-agent-evolution/diagnose-ready-ref-stats.mjs
node campaigns/fitl-arvn-agent-evolution/diagnose-standing-witness.mjs
```

## Tournament Result

```json
{"compositeScore":-2.8,"avgMargin":-4.8,"winRate":0.2,"wins":3,"completed":15,"truncated":0,"errors":0,"seeds":15,"playerCount":4,"evolvedSeat":"arvn","evolvedProfile":"arvn-evolved","maxTurns":500,"concurrency":8,"profileCompletionOverride":null,"wasmEnabled":true,"gamedefCacheHit":true,"decisionBreakdown":{"strategic":67.0667,"tactical":18,"strategicAvgGap":-39.7714,"tacticalAvgGap":89.6296,"tiedDecisions":75.2667,"totalDecisions":85.0667}}
```

## Action Distribution

The 15 traces contained 150 main-phase ARVN action-selection decisions:

| Action | Count |
|---|---:|
| `govern` | 108 |
| `train` | 20 |
| `event` | 12 |
| `sweep` | 7 |
| `transport` | 2 |
| `resolveHonoluluPacify` | 1 |

Per-seed main-phase counts:

| Seed | Counts |
|---:|---|
| 1000 | `{"govern":4,"train":1}` |
| 1001 | `{"govern":4,"sweep":2,"train":2,"event":1}` |
| 1002 | `{"govern":5}` |
| 1003 | `{"govern":6,"train":4}` |
| 1004 | `{"govern":11,"event":2,"train":1,"resolveHonoluluPacify":1}` |
| 1005 | `{"govern":6,"event":1,"transport":1}` |
| 1006 | `{"govern":5,"event":3,"sweep":1,"train":1,"transport":1}` |
| 1007 | `{"govern":9,"train":1}` |
| 1008 | `{"govern":11,"train":3,"event":1}` |
| 1009 | `{"govern":12,"event":2}` |
| 1010 | `{"govern":9,"train":4}` |
| 1011 | `{"govern":6,"train":3,"event":1}` |
| 1012 | `{"govern":7,"sweep":1}` |
| 1013 | `{"govern":8}` |
| 1014 | `{"govern":5,"sweep":3,"event":1}` |

## Standing Differentiation

`diagnose-standing-witness.mjs` treats an opponent-shift decision as a main-phase action-selection decision where `previewUsage.seatMatrix.byCandidate[*].perSeatRefs["victoryCurrentMargin.currentMargin.$seat"]` contains at least one non-ARVN ready seat whose value differs across candidates. The two role considerations then count as differentiating when their trace contribution is distinct across candidates. The default WASM-on campaign did not emit per-term `scoreContributions`, so the helper reconstructs the two contribution values from the matrix cells using the checked-in profile formula (`-projected role margin * 200`).

| Metric | Value |
|---|---:|
| Traces | 15 |
| Main-phase action-selection decisions | 150 |
| Decisions with `previewUsage.seatMatrix` | 150 (100.0%) |
| Decisions with opponent standing shift | 16 |
| Decisions where either role term differentiated | 16 (100.0% of shift decisions) |
| Decisions where both role terms differentiated | 16 (100.0% of shift decisions) |

| Term | Decisions differentiated | Share of opponent-shift decisions |
|---|---:|---:|
| `hurtCurrentLeader` | 16 | 100.0% |
| `reduceNearestThreat` | 16 | 100.0% |

This clears the ticket threshold of at least 30% of opponent-shift main-phase decisions.

Matrix status cells observed:

| Matrix status | Cells |
|---|---:|
| `ready` | 2478 |
| `gated` | 90 |
| `random` | 74 |
| `depthCap` | 16 |

Per-seed standing rows:

| Seed | Main-phase decisions | Opponent-shift decisions | Any term differentiated |
|---:|---:|---:|---:|
| 1000 | 5 | 1 | 1 |
| 1001 | 9 | 1 | 1 |
| 1002 | 5 | 1 | 1 |
| 1003 | 10 | 1 | 1 |
| 1004 | 15 | 1 | 1 |
| 1005 | 8 | 0 | 0 |
| 1006 | 11 | 0 | 0 |
| 1007 | 10 | 2 | 2 |
| 1008 | 15 | 3 | 3 |
| 1009 | 14 | 2 | 2 |
| 1010 | 13 | 2 | 2 |
| 1011 | 10 | 0 | 0 |
| 1012 | 8 | 0 | 0 |
| 1013 | 8 | 0 | 0 |
| 1014 | 9 | 2 | 2 |

## Ready-Ref Stats

| Preview ref | Decisions reporting stats | Ready / candidate ratio | Uniform decisions | Differentiating decisions | Avg range |
|---|---:|---:|---:|---:|---:|
| `preview.victoryCurrentMargin.currentMargin` | 13 / 150 (8.7%) | 80.0% | 13 (100.0%) | 0 (0.0%) | 0.00 |
| `preview.victoryCurrentRank.currentRank` | 13 / 150 (8.7%) | 80.0% | 12 (92.3%) | 1 (7.7%) | 0.08 |
| `victoryCurrentMargin.currentMargin.$seat` | 150 / 150 (100.0%) | 92.9% | 134 (89.3%) | 16 (10.7%) | 0.31 |
| `victoryCurrentMargin.currentMargin.nva` | 137 / 150 (91.3%) | 93.3% | 136 (99.3%) | 1 (0.7%) | 0.01 |
| `victoryCurrentMargin.currentMargin.self` | 137 / 150 (91.3%) | 93.3% | 94 (68.6%) | 43 (31.4%) | 0.82 |
| `victoryCurrentMargin.currentMargin.vc` | 137 / 150 (91.3%) | 93.3% | 122 (89.1%) | 15 (10.9%) | 0.31 |
| `victoryCurrentRank.currentRank.self` | 137 / 150 (91.3%) | 93.3% | 129 (94.2%) | 8 (5.8%) | 0.07 |

## Residual Risks

- The witness proves ordinary-operation role-standing signal for ARVN. It does not claim Spec 179 `outcomeGrantContinuation.exitCounts` activation.
- `currentLeader` and `nearestThreat` resolved to the same target in these observed FITL decisions, so the two terms move together in this workload. The generic role distinction is already covered by Phase 4 architecture tests.
- Post-review inspection found that this report proves candidate-score differentiation, not selected-action causality or executed enemy-margin reduction. In the 16 opponent-standing-shift decisions, selected actions were `govern` 14 times and `event` 2 times; a review reconstruction over unpruned candidates found no selected-action flips when the reconstructed standing-term contribution was removed. Follow-up ticket `archive/tickets/180STDVECOBSROL-007.md` owns the completed durable causal/action and outcome-delta witness.
- Raw traces are ignored runtime artifacts; rerun the commands above to regenerate them.

## Fixture Fallout

The ARVN profile change intentionally shifts the existing Spec 178 inner-preview outcome-parity witness. The following fixtures were regenerated from `packages/engine/test/architecture/policy-preview-inner-outcome-parity.test.ts`'s own capture oracle after the broad engine lane exposed the stale expectations:

- `packages/engine/test/architecture/fixtures/178-outcome-parity-1005.json`
- `packages/engine/test/architecture/fixtures/178-outcome-parity-1008.json`
- `packages/engine/test/architecture/fixtures/178-outcome-parity-1009.json`
- `packages/engine/test/architecture/fixtures/178-outcome-parity-1011.json`
- `packages/engine/test/architecture/fixtures/178-outcome-parity-1013.json`

Focused proof after regeneration:

```bash
pnpm -F @ludoforge/engine exec node --test dist/test/architecture/policy-preview-inner-outcome-parity.test.js
```

Result: 5 tests passed.
