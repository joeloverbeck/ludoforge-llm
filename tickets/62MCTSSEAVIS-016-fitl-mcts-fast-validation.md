# 62MCTSSEAVIS-016: FITL MCTS Fast Tests — Decision Node Validation

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — test tuning only
**Deps**: 62MCTSSEAVIS-010, 62MCTSSEAVIS-011, 62MCTSSEAVIS-012

## Problem

After implementing decision nodes, all 10 FITL MCTS fast scenarios should complete without crashes. The 9 previously-failing scenarios (7 `moveHasIncompleteParams`, 1 `SELECTOR_CARDINALITY`, 1 `pass`-only) should now produce meaningful results via incremental decision expansion.

## Baseline Data (from 62MCTSSEAVIS-006)

408 `applyMoveFailure` events across 10 scenarios, all `moveHasIncompleteParams` in `expansion` phase. Blocked decision breakdown by name:
- `$targetSpaces`: 248 (train, assault, sweep, raid, govern)
- `$targetLoCs`: 56 (patrol)
- `$transportOrigin`: 36 (transport)
- `$targetCity`: 22 (advise)
- `$arcLightNoCoinProvinces`: 14 (airStrike)
- `$trucksBaseDestination`: 13 (event — Trucks card)
- `$spaces`: 13 (airLift)
- `$nvaLaosPieces`: 13 (event — Burning Bonze card)

S8 has a distinct failure mode: `SELECTOR_CARDINALITY` (zone selector resolves to 0 or >1 zones during effect execution). S9 completes but picks `pass` over expected [attack, march, rally]. These may need separate investigation during validation.

## What to Change

### 1. Run FITL MCTS fast tests with visitor and decision nodes

Enable `ConsoleVisitor` for all scenarios. Run with `RUN_MCTS_FITL_E2E=1`.

### 2. Tune `acceptableCategories` based on visitor output

Review visitor events to understand which action categories the search explores. Update test expectations (`acceptableCategories`) to reflect the new search behavior — decision nodes may discover action categories that were previously unreachable.

### 3. Fix any remaining crashes

If scenarios still crash, diagnose via visitor output and fix. Crashes at this point indicate bugs in the decision expansion implementation.

## Files to Touch

- `packages/engine/test/integration/fitl-mcts-*.test.ts` or `test/e2e/mcts-fitl/` (modify — tune expectations)
- `packages/engine/test/helpers/fitl-mcts-test-helpers.ts` (modify if needed)

## Out of Scope

- Default/strong test tuning (62MCTSSEAVIS-017)
- Texas Hold'em regression (62MCTSSEAVIS-018)
- Pool sizing tuning (62MCTSSEAVIS-019)
- Production source code changes (decision nodes should already work from Phase 2)

## Acceptance Criteria

### Tests That Must Pass

1. All 10 FITL MCTS fast scenarios complete without crashes
2. No `moveHasIncompleteParams` errors
3. No `SELECTOR_CARDINALITY` errors
4. At least 8 of 10 scenarios select a non-pass action
5. Visitor output shows `decisionNodeCreated` and `decisionCompleted` events for template-heavy scenarios
6. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. No production source code changes in this ticket
2. Tests validate behavior, not implementation details
3. `acceptableCategories` reflect actual game-legal action categories

## Test Plan

### Commands

1. `RUN_MCTS_FITL_E2E=1 pnpm -F @ludoforge/engine test:e2e`
2. `pnpm -F @ludoforge/engine test`
