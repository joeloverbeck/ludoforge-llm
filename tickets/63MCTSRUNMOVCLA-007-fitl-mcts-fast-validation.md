# 63MCTSRUNMOVCLA-007: FITL MCTS Fast Validation + `acceptableCategories` Tuning

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — test tuning only
**Deps**: 63MCTSRUNMOVCLA-004, 63MCTSRUNMOVCLA-005, 63MCTSRUNMOVCLA-006

## Problem

After the architectural fix (runtime classification replacing compile-time partition), the 9 previously-crashing FITL MCTS fast scenarios should complete without errors. This ticket validates that the fix works end-to-end with real game data and tunes `acceptableCategories` in test expectations based on actual visitor output. This ticket absorbs 62MCTSSEAVIS-016.

## Assumption Reassessment (2026-03-16)

1. 10 FITL MCTS fast scenarios exist in `packages/engine/test/e2e/mcts-fitl/fitl-mcts-fast.test.ts` — **confirmed**.
2. 9 of 10 scenarios crash with `moveHasIncompleteParams`, `SELECTOR_CARDINALITY`, or pass-only selection — **confirmed** from spec section 0.2.
3. Scenarios gated behind `RUN_MCTS_FITL_E2E=1` env var — **confirmed**.
4. `ConsoleVisitor` test helper available at `packages/engine/test/helpers/mcts-console-visitor.ts` — **confirmed**.
5. `acceptableCategories` are per-scenario expected action categories in test assertions — **confirmed**.

## Architecture Check

1. No production code changes — this is purely test validation and expectation tuning.
2. Validates that runtime classification correctly routes FITL operations (rally, march, attack, etc.) through decision expansion.
3. Absorbs 62MCTSSEAVIS-016 which had the same goals but was blocked on the classification fix.

## What to Change

### 1. Run all 10 FITL MCTS fast scenarios with visitor

Enable `ConsoleVisitor` for all scenarios. Run with `RUN_MCTS_FITL_E2E=1`. Capture full visitor output.

### 2. Verify no crashes

All 10 scenarios must complete without:
- `moveHasIncompleteParams` errors
- `EffectRuntimeError: choiceRuntimeValidationFailed`
- `SELECTOR_CARDINALITY` errors
- Unhandled exceptions

### 3. Tune `acceptableCategories`

Review visitor output to understand which action categories the search actually explores per scenario. Update test expectations to reflect the new search behavior. Decision nodes may discover categories that were previously unreachable due to the classification bug.

### 4. Verify non-pass selection

At least 8 of 10 scenarios should select a non-pass action. If fewer do, investigate via visitor output — could indicate remaining issues in decision expansion.

### 5. Verify visitor event flow

Visitor output should show:
- `decisionNodeCreated` events for operations with inline decisions (rally, march, etc.)
- `decisionCompleted` events showing full parameter resolution
- `readyCount`/`pendingCount` in `searchStart` events reflecting correct classification

### 6. Archive 62MCTSSEAVIS-016

Since this ticket absorbs it, move `tickets/62MCTSSEAVIS-016-fitl-mcts-fast-validation.md` to the archive per the archival workflow.

## Files to Touch

- `packages/engine/test/e2e/mcts-fitl/fitl-mcts-fast.test.ts` (modify — tune `acceptableCategories`, add visitor assertions)
- `packages/engine/test/helpers/fitl-mcts-test-helpers.ts` (modify — if helper adjustments needed for visitor integration)
- `tickets/62MCTSSEAVIS-016-fitl-mcts-fast-validation.md` (archive — absorbed by this ticket)

## Out of Scope

- Default/strong FITL test tuning (62MCTSSEAVIS-017)
- Texas Hold'em regression (62MCTSSEAVIS-018)
- Pool sizing tuning (62MCTSSEAVIS-019)
- Production source code changes (classification fix is in tickets 001-005)
- Runner AI overlay integration

## Acceptance Criteria

### Tests That Must Pass

1. All 10 FITL MCTS fast scenarios complete without crashes.
2. No `moveHasIncompleteParams` errors.
3. No `SELECTOR_CARDINALITY` errors.
4. No `EffectRuntimeError: choiceRuntimeValidationFailed` errors.
5. At least 8 of 10 scenarios select a non-pass action.
6. Visitor output shows `decisionNodeCreated` and `decisionCompleted` events for template-heavy scenarios.
7. `acceptableCategories` updated to reflect actual game-legal action categories.
8. `pnpm -F @ludoforge/engine test` — full suite passes (including non-FITL tests).

### Invariants

1. No production source code changes in this ticket.
2. Tests validate behavior, not implementation details.
3. `acceptableCategories` reflect actual game-legal action categories per scenario.
4. 62MCTSSEAVIS-016 archived and not duplicated.

## Test Plan

### Commands

1. `RUN_MCTS_FITL_E2E=1 pnpm -F @ludoforge/engine test:e2e`
2. `pnpm -F @ludoforge/engine test`
