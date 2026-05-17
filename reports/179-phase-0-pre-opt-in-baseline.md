# Spec 179 Phase 0 — Pre-Opt-In Baseline

**Date**: 2026-05-17
**Repo HEAD**: `8d82d815a7baa49f1686497d333b2b9c0bef6bc5`
**Profile source**: `data/games/fire-in-the-lake/92-agents.md` last committed at `4415d65a4f7828a66c0df65d1c2f3ecb69b57763`
**Profile state measured**: temporary Phase 0 overlay on `arvn-evolved` re-added `stateFeatures.nvaMargin`, `stateFeatures.vcMargin`, `candidateFeatures.projectedNvaMargin`, `candidateFeatures.projectedVcMargin`, and `considerations.penalizeOpponentMargin` with weight `-200`. The overlay is measurement-only and is not retained in the repository diff.

## Baseline Command

```bash
node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 15 --trace-default all --concurrency 8
```

Run conditions:

- Seeds: `1000` through `1014`
- Trace mode: `all`
- Seed concurrency: `8`
- Evolved seat/profile: `arvn` / `arvn-evolved`
- WASM policy runtime: enabled
- GameDef cache: hit
- Raw trace output: `campaigns/fitl-arvn-agent-evolution/traces/trace-*.json` (ignored raw evidence)

Result summary:

| Metric | Value |
|---|---:|
| Wall time | 53.16s |
| Composite score | -3.2 |
| Average margin | -5.2 |
| Win rate | 0.2 |
| Completed seeds | 15 / 15 |
| Truncated seeds | 0 |
| Error seeds | 0 |

Last-line JSON:

```json
{"compositeScore":-3.2,"avgMargin":-5.2,"winRate":0.2,"wins":3,"completed":15,"truncated":0,"errors":0,"seeds":15,"playerCount":4,"evolvedSeat":"arvn","evolvedProfile":"arvn-evolved","maxTurns":500,"concurrency":8,"profileCompletionOverride":null,"wasmEnabled":true,"gamedefCacheHit":true,"decisionBreakdown":{"strategic":72.8,"tactical":17.8667,"strategicAvgGap":-24.6337,"tacticalAvgGap":88.0597,"tiedDecisions":81.6667,"totalDecisions":90.6667}}
```

## Action Distribution

Command:

```bash
node campaigns/fitl-arvn-agent-evolution/diagnose-action-distribution.mjs
```

Main-phase action-selection distribution across 159 decisions:

| Action | Count | Percent |
|---|---:|---:|
| Govern | 119 | 74.8% |
| Train | 23 | 14.5% |
| Event | 10 | 6.3% |
| Transport | 6 | 3.8% |
| Resolve Honolulu Pacify | 1 | 0.6% |
| Patrol | 0 | 0.0% |
| Sweep | 0 | 0.0% |
| Assault | 0 | 0.0% |

The full diagnostic also reported 268 coup-phase forced decisions and 933 microturn decisions.

## Ready Ref Stats

Command:

```bash
node campaigns/fitl-arvn-agent-evolution/diagnose-ready-ref-stats.mjs
```

Output:

```text
traces: 15
mainPhaseActionSelectionDecisions: 159
decisionsWithReadyRefStats: 159

| Preview ref | Decisions reporting stats | Ready / candidate ratio | Decisions with distinct=1 (uniform) | Decisions with distinct>1 (differentiating) | Avg range |
|---|---:|---:|---:|---:|---:|
| `preview.victoryCurrentMargin.currentMargin` | 13 / 159 (8.2%) | 83.3% | 13 (100.0%) | 0 (0.0%) | 0.00 |
| `preview.victoryCurrentRank.currentRank` | 13 / 159 (8.2%) | 83.3% | 12 (92.3%) | 1 (7.7%) | 0.08 |
| `victoryCurrentMargin.currentMargin.nva` | 146 / 159 (91.8%) | 93.2% | 146 (100.0%) | 0 (0.0%) | 0.00 |
| `victoryCurrentMargin.currentMargin.self` | 146 / 159 (91.8%) | 93.2% | 100 (68.5%) | 46 (31.5%) | 0.81 |
| `victoryCurrentMargin.currentMargin.vc` | 146 / 159 (91.8%) | 93.2% | 130 (89.0%) | 16 (11.0%) | 0.32 |
| `victoryCurrentRank.currentRank.self` | 146 / 159 (91.8%) | 93.2% | 134 (91.8%) | 12 (8.2%) | 0.10 |
```

## Uniformity Confirmation

Confirmed: opponent margin refs are uniform across candidates at this substrate state.

For `victoryCurrentMargin.currentMargin.nva`, every reporting main-phase action-selection decision was uniform: 146 / 146 reporting decisions had `distinct=1`, with average range `0.00`.

For `victoryCurrentMargin.currentMargin.vc`, 130 / 146 reporting decisions were uniform (`89.0%`), and the differentiating minority retained a small average range (`0.32`) compared with the self-margin control. The self-margin control differentiated on 46 / 146 reporting decisions (`31.5%`) with average range `0.81`, confirming that the preview machinery is active while opponent-margin action-selection signal remains mostly dead-weight before the Spec 179 opt-in.

## Reproducibility Notes

- The reusable aggregation script is `campaigns/fitl-arvn-agent-evolution/diagnose-ready-ref-stats.mjs`.
- The script reads the ignored raw trace set in `campaigns/fitl-arvn-agent-evolution/traces/`.
- Running the script twice against the captured trace set produced byte-identical output during ticket verification.
- The temporary `92-agents.md` profile overlay was reverted after this report was produced; ticket closeout verification requires `git diff data/games/fire-in-the-lake/92-agents.md` to be empty.
