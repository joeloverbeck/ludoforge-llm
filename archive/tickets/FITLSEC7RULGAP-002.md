# FITLSEC7RULGAP-002: DuringCoup Margin Ranking

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small-Medium
**Engine Changes**: Yes — generic enhancement to `terminal.ts`
**Deps**: FITLSEC7RULGAP-001

## Problem

Rule 7.1 says: "whenever any player [passes a victory check] or if none does by game end, the Faction that reached the highest victory margin (7.3) comes in 1st place, 2nd highest comes in 2nd place, and so on."

Currently, `evaluateVictory()` in `packages/engine/src/kernel/terminal.ts` handles `duringCoup` and `finalCoup` differently:

- **finalCoup**: Correctly calls `finalVictoryRanking()` to evaluate all margins and pick the top-ranked seat as winner, including full ranking metadata.
- **duringCoup**: Uses first-match — returns the first checkpoint whose condition passes, using `duringCheckpoint.seat` as the winner. This is wrong when margins are defined: the winner should be the faction with the highest margin, not whichever checkpoint triggered first.

## What to Change

### In `evaluateVictory()` (`packages/engine/src/kernel/terminal.ts`)

When a `duringCoup` checkpoint triggers and `def.terminal.margins` is defined and non-empty:

1. Call `finalVictoryRanking()` to evaluate all margins
2. Use `ranking[0].seat` as the winner seat (instead of `duringCheckpoint.seat`)
3. Resolve the winner player from the ranking seat
4. Include the full ranking in victory metadata

When margins are NOT defined (backward compatibility): keep current behavior — use `duringCheckpoint.seat` as winner, no ranking metadata.

### Code sketch

```typescript
if (duringCheckpoint !== undefined) {
  const margins = def.terminal.margins ?? [];
  if (margins.length > 0) {
    // Use margin ranking to determine winner (same as finalCoup)
    const ranking = finalVictoryRanking(def, adjacencyGraph, runtimeTableIndex, state);
    const winnerSeat = ranking[0]?.seat ?? duringCheckpoint.seat;
    const player = resolveSeatPlayer(state, winnerSeat);
    // ... error handling ...
    return {
      type: 'win',
      player,
      victory: {
        timing: 'duringCoup',
        checkpointId: duringCheckpoint.id,
        winnerSeat,
        ranking,
      },
    };
  }
  // Fallback: no margins defined, use checkpoint seat
  const player = resolveSeatPlayer(state, duringCheckpoint.seat);
  // ... existing behavior ...
}
```

## Files to Touch

- `packages/engine/src/kernel/terminal.ts` (modify — `evaluateVictory()` duringCoup branch)
- `packages/engine/test/unit/terminal.test.ts` (add duringCoup + margin ranking tests)
- `packages/engine/test/integration/fitl-production-terminal-victory.test.ts` (update expectations to include ranking metadata in duringCoup results)

## Out of Scope

- Game data changes (handled by FITLSEC7RULGAP-001)
- FinalCoup behavior changes (already correct)
- Compiler changes
- New types (VictoryTerminalMetadata already supports optional ranking)

## Acceptance Criteria

1. DuringCoup with margins defined: winner determined by highest margin, not checkpoint seat
2. DuringCoup with margins defined: victory metadata includes full ranking array
3. DuringCoup without margins: falls back to checkpoint seat (backward compatible)
4. Multiple factions passing simultaneously: highest margin wins
5. Tie-breaking uses configured tieBreakOrder for during-coup
6. `pnpm turbo build` passes
7. `pnpm -F @ludoforge/engine test` passes
8. `pnpm turbo typecheck` passes

## Test Plan

### New Unit Tests (terminal.test.ts)

1. DuringCoup with margins: winner is highest-margin seat, not checkpoint seat
2. DuringCoup without margins: falls back to checkpoint seat (existing behavior preserved)
3. DuringCoup margin tie: tie-break order determines winner
4. DuringCoup victory metadata includes ranking array

### Updated Integration Tests

1. `fitl-production-terminal-victory.test.ts`: during-coup result now includes ranking metadata

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`

## Outcome

- **Completion date**: 2026-02-24
- **What changed**:
  - Updated `packages/engine/src/kernel/terminal.ts` so `duringCoup` winner selection uses terminal margin ranking whenever `terminal.margins` is defined and non-empty.
  - `duringCoup` victory metadata now includes `ranking` in the same shape as `finalCoup`.
  - Winner seat resolution for `duringCoup` now comes from `ranking[0].seat` (fallback remains checkpoint seat when margins are absent).
  - Added/updated tests across unit + integration to verify:
    - during-coup winner-by-margin behavior,
    - tie-break handling,
    - ranking metadata presence for during-coup,
    - updated FITL/fixture expectations where checkpoint seat no longer implies winner seat.
- **Deviations from original plan**:
  - `packages/engine/test/integration/fitl-coup-victory.test.ts` also required updates because the fixture defines margins; during-coup winner changed from checkpoint seat (`us`) to highest margin (`nva`).
- **Verification results**:
  - `pnpm turbo build` passed.
  - `pnpm -F @ludoforge/engine test` passed (270/270).
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed.
