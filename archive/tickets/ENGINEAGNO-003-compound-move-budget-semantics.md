# ENGINEAGNO-003: Enforce Shared Budget Semantics for Compound Moves

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — compound move execution semantics
**Deps**: ENGINEAGNO-002

## Problem

Compound move execution (`operation + specialActivity`) currently re-enters `applyMoveCore` for special activity. The current implementation allocates `phaseTransitionBudget` inside each `applyMoveCore` invocation from `ExecutionOptions.maxPhaseTransitionsPerMove`, so compound recursion receives a fresh budget object.

For robust game-agnostic replay and simulation consistency, compound execution should have explicit, consistent budget ownership.

## Assumption Reassessment (Code/Test Reality)

1. Confirmed: `applyMoveCore` currently creates a new budget object per invocation, and the nested special-activity call in compound execution (`applyMoveCore(...specialActivity...)`) reuses `options` but not a shared budget instance.
2. Confirmed: existing replay-boundary tests cover action effects, trigger effects, event-card effects, and lifecycle transitions, but do not cover compound `before` / `during` / `after` timing under `maxPhaseTransitionsPerMove`.
3. Discrepancy in prior scope: the issue is narrower than generic “policy reuse” and specifically concerns budget object ownership/lifetime across nested `applyMoveCore` calls.
4. Architectural note: fix should keep engine behavior generic by threading execution context (budget) explicitly, not by introducing compound-specific special cases in turn-flow/effect handlers.

## Updated Scope

1. Introduce explicit budget ownership in `applyMoveCore` so nested invocations can share one mutable budget instance for a single logical move execution.
2. Ensure compound special activity (`before` / `during` / `after`) executes under the same phase-transition budget as its parent operation.
3. Add targeted unit coverage for compound timing modes to prevent future regressions.
4. Keep non-compound behavior unchanged: independent top-level moves (including simultaneous-submission per-player commits) retain independent budgets.

## What to Change

1. Define and codify budget semantics for compound moves:
   - single shared budget for the entire compound move execution.
2. Ensure special activity path reuses parent execution context policy, including transition budget.
3. Prevent accidental budget reset across nested internal `applyMoveCore` calls.
4. Document compound semantics in code-level comments and developer-facing kernel notes.

## Invariants

1. Compound move consumes from one shared transition budget.
2. Operation + special activity cannot exceed configured per-move transition cap by recursion.
3. Timing mode (`before` / `during` / `after`) does not change budget ownership semantics.
4. Behavior is deterministic and engine-agnostic across games.

## Tests

1. Unit: compound move where operation and special activity each trigger phase transitions respects one shared cap.
2. Unit: compound `before`/`during`/`after` timing variants all enforce shared budget.
3. Regression: existing replay-boundary tests and compound-action legality tests still pass.

## Outcome

- Completion date: 2026-02-16
- What changed:
  - `applyMoveCore` now supports explicit `phaseTransitionBudget` threading via internal core options.
  - Compound special-activity recursion now reuses the parent budget object instead of creating a fresh budget from options.
  - `applyMove` execution was further decomposed into a shared `executeMoveAction` core (action execution + trigger dispatch) and a single top-level move envelope (turn-flow post-processing, bounded advance, final hash), removing nested full-envelope recursion for compound special activities.
  - Added/updated unit coverage in `test/unit/kernel/apply-move.test.ts` for compound timing `before`, `during`, and `after` under `maxPhaseTransitionsPerMove`.
- Deviations from original plan:
  - No integration test was added; strengthened unit coverage in the replay-boundary suite was sufficient and directly targets the recursion boundary.
  - Scope expanded beyond budget ownership to include architecture cleanup that keeps compound execution inside one move envelope while preserving game-agnostic behavior.
- Verification results:
  - `npm test` passed.
  - `npm run lint` passed.
