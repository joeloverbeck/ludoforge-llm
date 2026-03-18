# 62MCTSSEAVIS-023: Action Display Name Mapping Utility

**Status**: NOT IMPLEMENTED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — runner only
**Deps**: None

## Problem

The AITurnOverlay needs to show human-readable action names (e.g., "Rally" instead of "rally"). A utility is needed to map `actionId` strings to display names using `GameDef.actions` metadata.

## What to Change

### 1. Create or extend action display name utility

If not already present in `packages/runner/src/utils/`:
- Create `action-display-names.ts`
- Function: `getActionDisplayName(gameDef: GameDef, actionId: string): string`
- Lookup `gameDef.actions` for matching action, return display name
- Fallback: capitalize and de-kebab the actionId if no match

If the existing `display-name.ts` utility already handles this, extend it.

## Files to Touch

- `packages/runner/src/utils/action-display-names.ts` (new, or extend existing)

## Out of Scope

- AITurnOverlay UI (62MCTSSEAVIS-024)
- Store integration (62MCTSSEAVIS-022)
- Engine changes
- Non-action display names

## Acceptance Criteria

### Tests That Must Pass

1. Unit test: known actionId returns correct display name from GameDef
2. Unit test: unknown actionId falls back to formatted string
3. Unit test: handles edge cases (empty string, undefined)
4. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Game-agnostic — works with any GameDef, not just FITL
2. Pure function — no side effects
3. Existing display name utilities unchanged

## Test Plan

### New/Modified Tests

1. `packages/runner/test/utils/action-display-names.test.ts`

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm turbo build && pnpm turbo typecheck`

## Archival Note

Archived on 2026-03-18 as part of the MCTS retirement cleanup. This work item remained unfinished and was removed from the active planning surface so the repository no longer presents MCTS as current architecture.
