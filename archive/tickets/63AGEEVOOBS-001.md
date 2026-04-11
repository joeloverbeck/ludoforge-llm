# 63AGEEVOOBS-001: Decision-type breakdown in ARVN tournament runner

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — campaign-only
**Deps**: None

## Problem

The ARVN agent evolution harness (`run-tournament.mjs`) outputs a single composite score. The evolution loop cannot distinguish whether the bottleneck is in strategic decisions (operations/events) or tactical decisions (coup sub-phases). In the ARVN campaign, 58 of 69 decisions were perfectly tied — invisible to the loop because no decision-type breakdown or gap statistics are reported.

## Assumption Reassessment (2026-04-11)

1. `campaigns/fitl-arvn-agent-evolution/run-tournament.mjs` exists (364 lines) — confirmed via glob.
2. The runner uses `traceLevel: 'verbose'` (line 220) — confirmed. This ensures `agentDecision.candidates` is populated.
3. Per-seed trace already includes `agentDecision` per evolved move (line 274) — confirmed.
4. Summary JSON output is built at lines 341-349 with `compositeScore`, `avgMargin`, `winRate` — confirmed.
5. `harness.sh` parses specific fields via `parse_field()` (lines 68-101) — adding new fields to the JSON is additive and non-breaking.

## Architecture Check

1. The classification heuristic (strategic = actionId does NOT contain "coup") lives entirely in the campaign-specific runner, not in the engine. This preserves engine agnosticism (FOUNDATIONS #1).
2. Gap computation uses data already present in the verbose trace (`candidates` array). No new engine instrumentation needed.
3. No backwards-compatibility shims — the new `decisionBreakdown` field is purely additive to the JSON output.

## What to Change

### 1. Add decision classification helper

In `campaigns/fitl-arvn-agent-evolution/run-tournament.mjs`, add a helper function (near the top, after imports) that classifies a decision and computes its gap:

```javascript
function classifyDecision(agentDecision) {
  if (!agentDecision?.candidates?.length) return null;
  const unpruned = agentDecision.candidates.filter((c) => !c.pruned);
  if (unpruned.length === 0) return null;
  const actionId = unpruned[0].actionId ?? '';
  const isStrategic = !actionId.toLowerCase().includes('coup');
  const gap = unpruned.length >= 2
    ? unpruned[0].score - unpruned[1].score
    : 0;
  const tied = unpruned.length >= 2 && gap < 0.001;
  return { isStrategic, gap, tied };
}
```

### 2. Accumulate decision stats in the seed loop

Inside the seed loop (around line 269, where `evolvedMoves` is built), accumulate counts:

- `strategicCount`, `tacticalCount`
- `strategicGapSum`, `tacticalGapSum`
- `tiedCount`, `totalDecisions`

Iterate over `evolvedMoves` and call `classifyDecision` on each `agentDecision`.

### 3. Add per-seed `decisionBreakdown` to trace output

Add the `decisionBreakdown` object to the `traceSummary` object (around line 292):

```javascript
decisionBreakdown: {
  strategic: strategicCount,
  tactical: tacticalCount,
  strategicAvgGap: strategicCount > 0 ? round4(strategicGapSum / strategicCount) : 0,
  tacticalAvgGap: tacticalCount > 0 ? round4(tacticalGapSum / tacticalCount) : 0,
  tiedDecisions: tiedCount,
  totalDecisions: totalDecisions,
}
```

### 4. Accumulate cross-seed decision stats and add to summary JSON

Add cross-seed accumulators before the seed loop and aggregate after each seed. Add `decisionBreakdown` to the final `result` object (line 341) with the same shape, averaged across all completed seeds.

## Files to Touch

- `campaigns/fitl-arvn-agent-evolution/run-tournament.mjs` (modify)

## Out of Scope

- VC tournament runner (separate ticket 63AGEEVOOBS-002)
- Margin trajectory (separate ticket 63AGEEVOOBS-003)
- Texas Hold'em runner (different output format, out of spec scope)
- Changes to `harness.sh` or `program.md` (additive JSON — no parser changes needed)

## Acceptance Criteria

### Tests That Must Pass

1. Run ARVN tournament with `--seeds 3`: JSON output includes `decisionBreakdown` with all six fields (`strategic`, `tactical`, `strategicAvgGap`, `tacticalAvgGap`, `tiedDecisions`, `totalDecisions`).
2. Per-seed trace files include `decisionBreakdown` with the same shape.
3. `harness.sh` continues to parse `compositeScore` correctly (additive fields don't break existing parsing).
4. Existing suite: `pnpm turbo build && pnpm turbo test`

### Invariants

1. Engine code is not modified — all changes are in campaign-specific runner.
2. Existing JSON output fields (`compositeScore`, `avgMargin`, `winRate`, `wins`, etc.) remain unchanged in value and position.

## Test Plan

### New/Modified Tests

1. Manual verification: run `node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 3` and inspect JSON output and trace files for `decisionBreakdown`.

### Commands

1. `node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 3 2>/dev/null | tail -1 | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');const j=JSON.parse(d);console.log(JSON.stringify(j.decisionBreakdown,null,2))"`
2. `pnpm turbo build && pnpm turbo test`

## Outcome

- Completed: 2026-04-11
- Added campaign-local decision classification and accumulation in `campaigns/fitl-arvn-agent-evolution/run-tournament.mjs`.
- Per-seed trace summaries now include `decisionBreakdown` with strategic/tactical counts, average gaps, tied decisions, and total decisions.
- Final runner JSON now appends an averaged `decisionBreakdown` without changing existing summary field values.
- Corrected a stale draft helper detail during implementation: single-candidate decisions now use a finite gap fallback so JSON output stays numeric instead of serializing `Infinity` to `null`.
- Verified the ticket command intent with one live-command substitution for trace capture: `--trace-seed 1000` must be paired with `--trace-all false` to write `campaigns/fitl-arvn-agent-evolution/last-trace.json` in the current runner.

## Verification Run

- `pnpm -F @ludoforge/engine build`
- `node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 3 2>/dev/null | tail -1 | node -e "const d=require('fs').readFileSync(0,'utf8'); const j=JSON.parse(d); console.log(JSON.stringify(j.decisionBreakdown,null,2));"`
- `node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 1 --trace-all false --trace-seed 1000 >/dev/null 2>/dev/null && node -e "const t=JSON.parse(require('fs').readFileSync('campaigns/fitl-arvn-agent-evolution/last-trace.json','utf8')); console.log(JSON.stringify(t.decisionBreakdown,null,2));"`
- `pnpm turbo build`
- `pnpm turbo test`
