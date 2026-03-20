# 70ACTTOOSYN-006: Add Texas Hold'em actionSummaries to verbalization YAML

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — data file only
**Deps**: 70ACTTOOSYN-002 (actionSummaries field must exist on VerbalizationDef)

## Problem

Texas Hold'em actions lack authored summaries. While the impact is less visible than FITL (Hold'em has simpler action names), adding `actionSummaries` ensures consistent behavior across both test-case games and validates engine-agnosticism of the feature.

## Assumption Reassessment (2026-03-20)

1. `data/games/texas-holdem/05-verbalization.md` exists with labels, stages, and macros — confirmed.
2. Texas Hold'em has a small set of player-facing actions (fold, check, call, raise, allIn) — verify against actual action definitions in the Texas Hold'em spec YAML.
3. The spec provides the expected summaries — verify action IDs match compiled GameDef.

## Architecture Check

1. Data-only change — no engine code modified.
2. Validates that `actionSummaries` works for a second game (engine-agnosticism proof).
3. Texas Hold'em's simple action set makes this a quick addition.

## What to Change

### 1. Audit Texas Hold'em action IDs

Grep `data/games/texas-holdem/` for all action definitions. Confirm the exact action ID strings used in the compiled GameDef.

### 2. Add actionSummaries to 05-verbalization.md

**File**: `data/games/texas-holdem/05-verbalization.md`

Add `actionSummaries` to the YAML block:

```yaml
actionSummaries:
  fold: "Surrender hand and forfeit current bets"
  check: "Pass without adding chips to the pot"
  call: "Match the current bet to stay in the hand"
  raise: "Increase the current bet"
  allIn: "Bet all remaining chips"
```

Verify each ID against the actual action definitions. Add any missing actions.

### 3. Verify compilation

Run the Texas Hold'em compilation pipeline to confirm parsing succeeds.

## Files to Touch

- `data/games/texas-holdem/05-verbalization.md` (modify)

## Out of Scope

- FITL actionSummaries (70ACTTOOSYN-005)
- Engine code changes (tickets 001–004)
- Changing existing labels, stages, or macros in the Texas Hold'em verbalization
- Modifying Texas Hold'em rules files

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine test:e2e` — Texas Hold'em compilation succeeds with the new `actionSummaries` section.
2. Every key in `actionSummaries` matches an actual action ID in the compiled Texas Hold'em GameDef.
3. Every player-facing action ID in the Texas Hold'em GameDef has a corresponding entry in `actionSummaries`.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. No existing YAML keys in `05-verbalization.md` are modified or removed.
2. The Texas Hold'em game compiles and runs identically to before.
3. All existing Texas Hold'em tests pass unchanged.

## Test Plan

### New/Modified Tests

1. No new test files — existing E2E compilation tests validate YAML parse/compile.

### Commands

1. `pnpm -F @ludoforge/engine test:e2e`
2. `pnpm turbo test && pnpm turbo typecheck`
