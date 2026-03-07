# LEGACTTOO-014: Include RemoveMessage Destination in Template Output

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/kernel/tooltip-template-realizer.ts`
**Deps**: archive/tickets/LEGACTTOO-007-template-realizer-blocker-extractor-golden-tests.md

## Problem

`RemoveMessage` has a `destination` field (the zone tokens are moved to after removal) that the template realizer ignores. "Remove US Troops from Saigon" omits where the tokens go. "Remove US Troops from Saigon to Casualties" would be more informative for the player.

## Assumption Reassessment (2026-03-07)

1. `RemoveMessage` at `tooltip-ir.ts:90-98` has `readonly destination: string` (required field, not optional).
2. `realizeRemove` at `tooltip-template-realizer.ts` uses `tokenFilter`, `fromZone`, and `budget` but not `destination`.
3. In FITL, common destinations are `casualties`, `available`, `out-of-play` — all meaningful to players.

## Architecture Check

1. Simple template string change — append ` to {destination}` when destination differs from a default/implicit removal target.
2. No game-specific logic — the destination is already in the IR from the normalizer.
3. No backwards compatibility concern.

## What to Change

### 1. Update `realizeRemove` in `tooltip-template-realizer.ts`

Include the destination label in the output string:
```
Remove {token} from {fromZone} to {destination}
```
With budget: `Remove {token} from {fromZone} to {destination} (up to {budget})`

## Files to Touch

- `packages/engine/src/kernel/tooltip-template-realizer.ts` (modify)
- `packages/engine/test/unit/kernel/tooltip-template-realizer.test.ts` (modify)

## Out of Scope

- Changing the `RemoveMessage` IR structure
- Suppressing destination when it matches a "default" removal zone

## Acceptance Criteria

### Tests That Must Pass

1. `Remove` with destination produces `"Remove US Troops from Saigon to Casualties"`.
2. `Remove` with destination and budget produces `"Remove US Troops from Saigon to Casualties (up to 3)"`.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Every `RemoveMessage` realization includes destination (it's a required field).
2. Template realizer remains pure and deterministic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/tooltip-template-realizer.test.ts` — update existing remove tests to verify destination appears in output.

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
