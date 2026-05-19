# Spec 180 Follow-Up - ARVN Standing Causal-Action Witness

**Status**: ✅ EXPLOITED — archived 2026-05-19.

**Date**: 2026-05-18
**Ticket**: `archive/tickets/180STDVECOBSROL-007.md`
**Profile measured**: `arvn-evolved`
**Raw trace delivery**: ignored under `campaigns/fitl-arvn-agent-evolution/traces/`; durable evidence is transcribed here.

## Scope

Ticket 006 proved that `hurtCurrentLeader` and `reduceNearestThreat` differentiated candidate scores. This follow-up adds a causal/action diagnostic for the stronger questions:

- did removing those two standing terms change the selected candidate?
- was the selected candidate best or tied-best by projected opponent standing margin?
- did the selected action reduce the targeted opponent margin after its microturn sequence completed?

No engine code or FITL-specific runtime branch was added.

## Profile Retune

The initial causal diagnostic over the ticket-006 profile found `0 / 16` counterfactual selected-action flips. The bounded retune changed only the two standing consideration weights:

| Consideration | Old weight | New weight |
|---|---:|---:|
| `hurtCurrentLeader` | 200 | 600 |
| `reduceNearestThreat` | 200 | 600 |

The more aggressive `1200` probe produced `7 / 20` counterfactual flips but worsened the tournament summary further. The retained `600` weight keeps a causal standing signal while avoiding that larger overcorrection.

## Commands

```bash
pnpm -F @ludoforge/engine build
node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 15 --trace-default all --concurrency 8
node campaigns/fitl-arvn-agent-evolution/diagnose-action-distribution.mjs
node campaigns/fitl-arvn-agent-evolution/diagnose-standing-witness.mjs
node campaigns/fitl-arvn-agent-evolution/diagnose-standing-causal-action.mjs
```

## Tournament Result

Final retained `600`-weight run:

```json
{"compositeScore":-7.2,"avgMargin":-7.8667,"winRate":0.0667,"wins":1,"completed":15,"truncated":0,"errors":0,"seeds":15,"playerCount":4,"evolvedSeat":"arvn","evolvedProfile":"arvn-evolved","maxTurns":500,"concurrency":8,"profileCompletionOverride":null,"wasmEnabled":true,"gamedefCacheHit":false,"decisionBreakdown":{"strategic":64.7333,"tactical":18.1333,"strategicAvgGap":-49.3388,"tacticalAvgGap":85.6618,"tiedDecisions":73.2667,"totalDecisions":82.8667}}
```

This is a profile-quality tradeoff, not an engine-substrate claim: the role-standing signal is now action-decisive in a bounded subset, but the 15-seed aggregate score is worse than ticket 006's report.

## Action Distribution

The final retained traces contained 150 main-phase ARVN action-selection decisions:

| Action | Count |
|---|---:|
| `govern` | 86 |
| `sweep` | 27 |
| `train` | 19 |
| `event` | 16 |
| `resolveHonoluluPacify` | 1 |
| `transport` | 1 |

## Standing Differentiation

`diagnose-standing-witness.mjs` uses `previewUsage.seatMatrix.byCandidate[*].perSeatRefs["victoryCurrentMargin.currentMargin.$seat"]` and reconstructs the two role-standing terms from the checked-in profile weight (`-projected role margin * 600`) when WASM traces omit per-term score contributions.

| Metric | Value |
|---|---:|
| Traces | 15 |
| Main-phase action-selection decisions | 150 |
| Decisions with `previewUsage.seatMatrix` | 150 (100.0%) |
| Decisions with opponent standing shift | 20 |
| Decisions where either role term differentiated | 20 (100.0% of shift decisions) |
| Decisions where both role terms differentiated | 20 (100.0% of shift decisions) |

| Term | Decisions differentiated | Share of opponent-shift decisions |
|---|---:|---:|
| `hurtCurrentLeader` | 20 | 100.0% |
| `reduceNearestThreat` | 20 | 100.0% |

Matrix status cells observed:

| Matrix status | Cells |
|---|---:|
| `ready` | 2478 |
| `gated` | 90 |
| `random` | 74 |
| `depthCap` | 16 |

## Causal Selection and Outcome Delta

`diagnose-standing-causal-action.mjs` subtracts the reconstructed `hurtCurrentLeader` and `reduceNearestThreat` contributions from each unpruned candidate and recomputes the selected winner by adjusted score. It then reruns the value-bearing seed subset through the generic simulator step seam and compares targeted opponent margins after the selected action's microturn sequence completes, before the next action-selection begins.

| Metric | Value |
|---|---:|
| Opponent-standing-shift decisions | 20 |
| Counterfactual selected-action flips after removing standing terms | 5 (25.0%) |
| Selected candidate best or tied-best by projected opponent margin | 15 (75.0%) |
| Selected candidate not best by projected opponent margin | 1 (5.0%) |

Selected actions among the 20 opponent-standing-shift decisions:

| Selected action | Opponent-shift decisions |
|---|---:|
| `govern` | 12 |
| `event` | 4 |
| `sweep` | 4 |

Outcome deltas for selected candidates with ready targeted opponent cells:

| Outcome delta class | Targeted opponent-seat rows |
|---|---:|
| improved (opponent margin decreased) | 3 |
| unchanged | 13 |
| worsened (opponent margin increased) | 0 |
| unknown | 0 |

| Opponent seat | Improved | Unchanged | Worsened | Unknown |
|---|---:|---:|---:|---:|
| `us` | 2 | 0 | 0 | 0 |
| `vc` | 1 | 13 | 0 | 0 |

Representative causal rows:

| Seed | Main-phase index | Selected action | Counterfactual winner without standing | Target seat | Delta |
|---:|---:|---|---|---|---:|
| 1009 | 2 | `event` | `govern` | `us` | -4 |
| 1009 | 10 | `sweep` | `govern` | none ready on selected | n/a |
| 1010 | 2 | `govern` | `govern` | `us` | -1 |
| 1014 | 5 | `sweep` | `govern` | none ready on selected | n/a |

## Residual Limits

- The retained profile change proves selected-action causality for a subset of opponent-shift decisions, but it does not prove an aggregate profile-quality improvement. The final 15-seed tournament summary is worse than ticket 006's score.
- Some selected actions are counterfactually standing-driven even though the selected candidate has no ready targeted opponent cell in the matrix. The report keeps those rows causal for selection but excludes them from the targeted-margin delta denominator.
- The outcome delta witness uses the generic simulator step seam. It measures after the selected action's microturn sequence completes, not immediately after the top-level action-selection decision.
- Raw traces remain ignored runtime artifacts; rerun the commands above to regenerate them.
