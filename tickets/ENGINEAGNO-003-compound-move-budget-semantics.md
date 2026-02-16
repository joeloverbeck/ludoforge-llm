# ENGINEAGNO-003: Enforce Shared Budget Semantics for Compound Moves

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — compound move execution semantics
**Deps**: ENGINEAGNO-002

## Problem

Compound move execution (`operation + specialActivity`) currently re-enters `applyMoveCore` for special activity with fresh option-derived budget, which can effectively reset per-move replay limits and violate strict move-level semantics.

For robust game-agnostic replay and simulation consistency, compound execution should have explicit, consistent budget ownership.

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

1. Unit: compound move where operation and special activity each trigger phase transitions respects shared cap.
2. Unit: compound `before`/`during`/`after` variants all enforce shared budget.
3. Integration: compound replay with cap=1 allows only first transition across both components.
4. Regression: existing compound-action legality tests still pass.

