# 63AGEEVOOBS-003: Per-decision margin trajectory in ARVN tournament runner

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — campaign-only
**Deps**: None

## Problem

The ARVN tournament trace records each evolved move's `agentDecision` but not the margin trajectory across decisions. The evolution loop cannot identify which decisions improved vs worsened the game state without externally computing deltas from `selfMargin` state features. Adding `marginBefore`, `marginAfter`, and `marginDelta` to each evolved move in the trace enables the loop to pinpoint which decision types and moments drive score changes.

## Assumption Reassessment (2026-04-11)

1. `campaigns/fitl-arvn-agent-evolution/run-tournament.mjs` exists — confirmed.
2. Per-seed trace includes `evolvedMoves` array with `move` and `agentDecision` per evolved move (lines 269-275) — confirmed.
3. The `agentDecision` object includes `stateFeatures` when trace level is verbose — need to verify this is where `selfMargin` appears at decision time.
4. ARVN agent profile (`data/games/fire-in-the-lake/92-agents.md`) defines `selfMargin` as a state feature (line 63) — confirmed.
5. Profiles without `selfMargin` should produce `null` margin fields — spec explicitly states this.

## Architecture Check

1. Margin trajectory is computed entirely within the campaign-specific runner by tracking state feature values across the evolved seat's decision sequence. No engine changes.
2. The `marginBefore`/`marginAfter`/`marginDelta` fields are additive to the existing evolved move objects in the trace.
3. No backwards-compatibility shims — purely additive output enrichment.

## What to Change

### 1. Extract selfMargin from agentDecision stateFeatures

In the seed loop, when building the `evolvedMoves` array, extract `selfMargin` from each move's `agentDecision.stateFeatures.selfMargin` (if present). This is the `marginBefore` for that decision.

### 2. Compute marginAfter and marginDelta

After collecting all evolved moves for a seed, iterate the array to compute:
- `marginAfter` for move `i` = `marginBefore` of move `i+1` (the selfMargin at the next evolved-seat decision)
- `marginAfter` for the last move = the evolved seat's final margin (already computed as `evolvedMargin`)
- `marginDelta` = `marginAfter - marginBefore`

For moves where `selfMargin` is not available (profile doesn't define it), set all three fields to `null`.

### 3. Add margin fields to per-seed trace evolvedMoves

Enrich each entry in the `evolvedMoves` array in `traceSummary` with `marginBefore`, `marginAfter`, and `marginDelta`:

```javascript
evolvedMoves.map((m, i) => ({
  ...m,
  marginBefore: margins[i] ?? null,
  marginAfter: margins[i + 1] ?? finalMargin ?? null,
  marginDelta: (margins[i] != null && (margins[i + 1] ?? finalMargin) != null)
    ? (margins[i + 1] ?? finalMargin) - margins[i]
    : null,
}))
```

## Files to Touch

- `campaigns/fitl-arvn-agent-evolution/run-tournament.mjs` (modify)

## Out of Scope

- VC tournament runner (separate ticket 63AGEEVOOBS-004)
- Decision-type breakdown (separate tickets 63AGEEVOOBS-001/002)
- Adding margin trajectory to the summary JSON (spec only requires it in per-seed trace)
- Modifying the agent profile or engine to emit additional state features

## Acceptance Criteria

### Tests That Must Pass

1. Run ARVN tournament with `--seeds 3 --trace-all false --trace-seed 1000`: `last-trace.json` includes `marginBefore`, `marginAfter`, `marginDelta` for each evolved move.
2. `marginDelta` equals `marginAfter - marginBefore` for every move where both are non-null.
3. Last move's `marginAfter` equals the seed's `evolvedMargin`.
4. Existing JSON summary fields remain unchanged.
5. Existing suite: `pnpm turbo build && pnpm turbo test`

### Invariants

1. Engine code is not modified.
2. Existing trace fields (`move`, `legalMoveCount`, `agentDecision`) remain unchanged.
3. Profiles without `selfMargin` produce `null` margin fields, not errors.

## Test Plan

### New/Modified Tests

1. Manual verification: run ARVN tournament with `--seeds 3 --trace-all false --trace-seed 1000`, inspect `last-trace.json` for margin fields on evolved moves.

### Commands

1. `node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 3 --trace-all false --trace-seed 1000 && node -e "const t=JSON.parse(require('fs').readFileSync('campaigns/fitl-arvn-agent-evolution/last-trace.json','utf8'));t.evolvedMoves.slice(0,3).forEach((m,i)=>console.log(i,m.marginBefore,m.marginAfter,m.marginDelta))"`
2. `pnpm turbo build && pnpm turbo test`
