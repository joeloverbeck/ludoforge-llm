# 100COMEVEEFF-007: Add FITL agent profile visibility entry

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — data file only
**Deps**: `archive/tickets/100COMEVEEFF-005.md`

## Problem

The FITL agent profile (`92-agents.md`) must declare visibility for the new `activeCardAnnotation` surface family. Without this entry, the compiler will either reject annotation refs in FITL policies or apply an unintended default visibility.

## Assumption Reassessment (2026-03-31)

1. `data/games/fire-in-the-lake/92-agents.md` exists and contains agent profile YAML with a `visibility` section that already includes entries for `activeCardIdentity`, `activeCardTag`, and `activeCardMetadata` (from Spec 99). Confirmed.
2. The visibility entry format follows the pattern established by Spec 99's families.
3. Event card annotations are public information (derived from card text that all players can read), so `current: public` is appropriate.

## Architecture Check

1. Data-only change — no engine code modified.
2. Follows the exact visibility pattern used by the three Spec 99 families.
3. Annotations are public because they summarize card text that is visible to all players. No hidden-information concerns.

## What to Change

### 1. Add `activeCardAnnotation` visibility entry in `92-agents.md`

In the `agents.visibility` YAML section, add:

```yaml
activeCardAnnotation:
  current: public
  preview:
    visibility: public
    allowWhenHiddenSampling: false
```

Place it after the existing `activeCardMetadata` entry.

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify)

## Out of Scope

- YAML authoring examples for policies (documented in the spec itself, not in the agent profile)
- Texas Hold'em agent profiles (no event decks, so no annotation visibility needed)
- Runtime resolution logic (ticket 006)
- Any engine code changes

## Acceptance Criteria

### Tests That Must Pass

1. FITL production spec compiles without visibility-related diagnostics for `activeCardAnnotation`
2. A FITL policy using `activeCard.annotation.unshaded.tokenPlacements.us` compiles and resolves
3. Existing FITL compilation tests pass unchanged
4. Existing suite: `pnpm turbo test`

### Invariants

1. `activeCardAnnotation` visibility is `public` for both current and preview (card annotations are derived from public card text)
2. No other visibility entries are modified
3. Visibility entry format matches Spec 99's family entries exactly

## Test Plan

### New/Modified Tests

1. No new test files — covered by existing FITL compilation integration tests. The compilation test from ticket 004 will exercise this visibility entry.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo test`
