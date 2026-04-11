# Spec 63: Agent Evolution Observability

**Status**: COMPLETED
**Priority**: P1
**Complexity**: M
**Dependencies**: None
**Source**: ARVN agent evolution campaign ceiling analysis (2026-04-11)

## Overview

The agent evolution harness lacks the diagnostic depth needed to identify
which decisions are bottlenecks. The ARVN campaign ran 24 experiments tuning
4-6 strategic decisions while 58-64 redeployment decisions were perfectly
tied and resolved alphabetically --- a fact invisible to the loop because
the harness only reports final-state metrics.

This spec adds two observability layers:

1. **Harness decision-type breakdown** in the tournament runner JSON output.
2. **Per-decision margin trajectory** in the trace output.

## Problem Statement

The tournament runner (`run-tournament.mjs`) outputs a single JSON line:
```json
{"compositeScore": -8.47, "avgMargin": -9.13, "winRate": 0.07, "wins": 1, ...}
```

This tells the loop WHAT the outcome is, not WHY. The per-seed trace files
contain per-decision candidate scores, gaps, and action types --- but
nothing surfaces the critical signal: "58 out of 69 decisions are perfectly
tied."

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

**Scope**: The two FITL tournament runners
(`campaigns/fitl-arvn-agent-evolution/run-tournament.mjs` and
`campaigns/fitl-vc-agent-evolution/run-tournament.mjs`). The Texas
Hold'em runner has a different output format and no `coup*`-prefixed
actions, so it is out of scope.

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
are "tactical." This is a convention-based heuristic, currently
FITL-specific --- games that adopt the `coup*` action naming convention
get the same treatment; games without it would classify all decisions as
strategic.

Gap = score of 1st unpruned candidate - score of 2nd unpruned candidate.
Tied = gap < 0.001 (floating-point epsilon).

**Note**: Gap computation requires the `candidates` array in the
agentDecision trace, which is only available at `traceLevel: 'verbose'`.
The FITL tournament runners currently use verbose (`run-tournament.mjs`
line 220), so this prerequisite is met.

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

**Prerequisite**: Margin trajectory depends on the agent profile defining
`selfMargin` as a state feature. ARVN's profile includes it
(`data/games/fire-in-the-lake/92-agents.md`, line 63). Profiles without
`selfMargin` will have `null` margin fields in the trace.

## FOUNDATIONS Alignment

- **#1 Engine Agnosticism**: The strategic/tactical classification uses
  a convention-based heuristic (the `coup*` action prefix), not hardcoded
  game logic. This is currently FITL-specific --- other games would need
  to adopt the naming convention, or all decisions would be classified as
  strategic. The harness enrichment lives in campaign-specific tournament
  runners, not in the engine.
- **#9 Replay, Telemetry, Auditability**: This spec directly extends the
  event stream with decision-level diagnostics.
- **#8 Determinism**: The enriched output is derived deterministically
  from the game trace.

## Acceptance Criteria

1. FITL tournament runners (`campaigns/fitl-arvn-agent-evolution/run-tournament.mjs`
   and `campaigns/fitl-vc-agent-evolution/run-tournament.mjs`) JSON output
   includes `decisionBreakdown` with strategic/tactical counts, average
   gaps, and tied-decision count.
2. Per-seed trace files include `marginBefore`, `marginAfter`,
   `marginDelta` for each evolved move.
3. All existing harness consumers (harness.sh parsing, results.tsv)
   continue to work unchanged (new fields are additive).

## Outcome

Completed: 2026-04-11

Implemented the observability slice across both FITL tournament runners.
`campaigns/fitl-arvn-agent-evolution/run-tournament.mjs` and
`campaigns/fitl-vc-agent-evolution/run-tournament.mjs` now emit additive
`decisionBreakdown` summary data, and both runners now attach
`marginBefore`, `marginAfter`, and `marginDelta` fields to saved evolved
move traces.

Deviations from original plan:

- The work shipped through the ticket series
  `63AGEEVOOBS-001` through `63AGEEVOOBS-004` instead of one monolithic
  implementation step.
- The ARVN runner satisfies the intended last-move margin invariant with
  real `selfMargin` data.
- The VC runner preserves the same margin field shape but currently emits
  `null` values for those fields in live traces because the FITL binding
  still maps `vc` to `vc-baseline`, whose emitted `agentDecision` payload
  does not include `stateFeatures.selfMargin`. This remained out of scope
  for the campaign-only observability tickets and was documented in the
  final ticket contract instead of being hidden.

Verification results:

- Focused runner proofs passed for ARVN and VC summary enrichment.
- Focused trace proof passed for ARVN margin trajectory invariants.
- VC trace proof confirmed additive margin fields, null-safe delta
  behavior, and the current baseline-profile limitation described above.
- `pnpm -F @ludoforge/engine build` passed during implementation.
- `pnpm turbo build` and `pnpm turbo test` passed after the series landed.
