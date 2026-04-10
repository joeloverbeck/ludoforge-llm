# Spec 63: Agent Evolution Observability

**Status**: Draft
**Priority**: P1
**Complexity**: M
**Dependencies**: None
**Source**: ARVN agent evolution campaign ceiling analysis (2026-04-11)

## Overview

The agent evolution harness and improve-loop OBSERVE protocol lack the
diagnostic depth needed to identify which decisions are bottlenecks. The
ARVN campaign ran 24 experiments tuning 4-6 strategic decisions while
58-64 redeployment decisions were perfectly tied and resolved alphabetically
--- a fact invisible to the loop because the harness only reports final-state
metrics.

This spec adds three observability layers:

1. **Harness decision-type breakdown** in the tournament runner JSON output.
2. **Per-decision margin trajectory** in the trace output.
3. **Improve-loop OBSERVE protocol amendment** to mandate per-decision gap
   analysis during the first experiment of each tier.

## Problem Statement

The tournament runner (`run-tournament.mjs`) outputs a single JSON line:
```json
{"compositeScore": -8.47, "avgMargin": -9.13, "winRate": 0.07, "wins": 1, ...}
```

This tells the loop WHAT the outcome is, not WHY. The per-seed trace files
contain per-decision candidate scores, gaps, and action types --- but the
loop's OBSERVE protocol never reads them, and nothing surfaces the critical
signal: "58 out of 69 decisions are perfectly tied."

### Specific gaps

1. **No decision-type breakdown**: The harness doesn't report how many
   decisions were strategic (operations/events) vs tactical
   (pacification/redeployment). The loop can't tell if the bottleneck is
   action selection or zone targeting.

2. **No tie/gap statistics**: The harness doesn't report the score-gap
   distribution across decisions. The loop can't tell that all redeployment
   decisions have gap=0 (secondary signals have zero effect) while
   strategic decisions have gaps of 2-9 (secondary signals can't compete).

3. **No margin trajectory**: The trace records `stateFeatures.selfMargin`
   at each decision but not the delta from the previous decision. The loop
   can't identify which decisions improved vs worsened the trajectory
   without external computation.

## Proposed Changes

### A. Harness enrichment (run-tournament.mjs)

Add to the per-seed output and the summary JSON:

```json
{
  "compositeScore": -8.47,
  "decisionBreakdown": {
    "strategic": 6,
    "tactical": 63,
    "strategicAvgGap": 2.4,
    "tacticalAvgGap": 0.01,
    "tiedDecisions": 58,
    "totalDecisions": 69
  }
}
```

Classification rule: a decision is "strategic" if its top unpruned
candidate's actionId does NOT contain "coup" (case-insensitive). All Coup
sub-phase decisions (pacify, redeploy, agitate, victory check, resources)
are "tactical." This is heuristic but game-agnostic --- it classifies by
the action naming convention, not by hardcoded game knowledge.

Gap = score of 1st unpruned candidate - score of 2nd unpruned candidate.
Tied = gap < 0.001 (floating-point epsilon).

### B. Trace margin trajectory

Add `marginDelta` to each evolved move's trace output:

```json
{
  "move": {...},
  "agentDecision": {...},
  "marginBefore": -15,
  "marginAfter": -14,
  "marginDelta": 1
}
```

`marginBefore` is the selfMargin state feature at this decision.
`marginAfter` is the selfMargin at the NEXT evolved-seat decision (or at
game end if this is the last). This requires tracking state across the
move loop in run-tournament.mjs.

### C. Improve-loop OBSERVE protocol amendment

Add to the campaign program.md template and the improve-loop skill:

> **First OBSERVE at each tier**: Read one per-seed trace file (the
> most promising losing seed). Parse the decision-type breakdown and
> gap distribution. If >50% of decisions are tied (gap < 0.001),
> the bottleneck is tactical scoring, not strategic scoring. Adjust
> hypothesis generation accordingly.

This is a process requirement, not an engine change.

## FOUNDATIONS Alignment

- **#1 Engine Agnosticism**: The strategic/tactical classification uses
  action naming conventions, not game-specific logic. Any game whose Coup
  or phase actions follow the `coup*` prefix convention gets the same
  treatment.
- **#9 Replay, Telemetry, Auditability**: This spec directly extends the
  event stream with decision-level diagnostics.
- **#8 Determinism**: The enriched output is derived deterministically
  from the game trace.

## Acceptance Criteria

1. `run-tournament.mjs` JSON output includes `decisionBreakdown` with
   strategic/tactical counts, average gaps, and tied-decision count.
2. Per-seed trace files include `marginBefore`, `marginAfter`,
   `marginDelta` for each evolved move.
3. The improve-loop skill's OBSERVE phase references per-decision gap
   analysis for the first experiment at each tier.
4. All existing harness consumers (harness.sh parsing, results.tsv)
   continue to work unchanged (new fields are additive).
