# ENGINEAGNO-002: Propagate Replay Transition Budget Across All Execution Paths

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — execution context plumbing
**Deps**: ENGINEAGNO-001

## Problem

`maxPhaseTransitionsPerMove` is currently enforced only on the direct effect context assembled inside `applyMoveCore`.

Several execution paths still create fresh effect contexts without forwarding the same per-move budget object:

1. trigger-dispatch effect execution (including recursive trigger cascades),
2. event-card effect execution (`executeEventMove` side/branch effects and lasting setup/teardown effect lists),
3. lifecycle and auto-advance paths reached through `advancePhase` / `advanceToDecisionPoint`.

Because transition effects (`gotoPhaseExact`, `advancePhase`, interrupt push/pop) consume budget only when `phaseTransitionBudget` is present in the active `EffectContext`, missing propagation allows paths to bypass replay boundary guarantees.

## What to Change

1. Introduce one unified per-move execution policy/context carrier (or equivalent options threading) that owns transition-budget state.
2. Thread that budget through all effect application entry points:
   - action effects
   - lifecycle effects
   - trigger effects and recursive cascades
   - event-execution effect lists
3. Ensure `advancePhase` and `advanceToDecisionPoint` participate in the same move-level budget scope when called from move execution.
4. Remove path-specific budget behavior and ensure a single, coherent per-move budget scope.
5. Keep fallback behavior unchanged when `maxPhaseTransitionsPerMove` is undefined.
6. Preserve game-agnostic architecture: no game- or phase-specific branches in kernel.

## Invariants

1. A move’s configured transition budget applies regardless of where phase-transition effects are invoked.
2. Trigger-emitted phase transitions consume the same move budget as direct action effects.
3. Event-card side/branch and lasting effect transitions consume the same move budget.
4. Lifecycle-triggered transitions reached during `advancePhase`/`advanceToDecisionPoint` consume the same move budget.
5. Exceeding budget never crashes; transitions are blocked deterministically.
6. Budget behavior is deterministic for identical seed + move sequence.
7. Default behavior (no budget option) remains unchanged.

## Tests

1. Unit: trigger effect containing `gotoPhaseExact` consumes budget and is blocked when exhausted.
2. Unit: recursive trigger cascade with multiple transitions respects budget cap.
3. Unit: event-card effect list containing multiple transitions is capped by one shared move budget.
4. Unit: `advancePhase` plus lifecycle-triggered transition chain consumes one shared move budget.
5. Integration: replay move with `maxPhaseTransitionsPerMove: 1` does not allow extra trigger-driven/event/lifecycle phase jumps.
6. Regression: tournament and existing e2e suites pass without replay budget option.

## Outcome

- Completion date: 2026-02-16
- What changed:
  - Added shared transition-budget propagation through trigger dispatch (including recursive cascades).
  - Added budget propagation for event-card execution effect lists (side/branch plus lasting setup/teardown).
  - Added budget propagation through `advancePhase` and `advanceToDecisionPoint` lifecycle paths.
  - Added/expanded unit coverage for trigger, event-card, and lifecycle/advance replay-budget invariants.
- Deviations from original plan:
  - Scope was broadened from trigger-only assumptions to include event execution and lifecycle/advance gaps discovered during reassessment.
  - The implementation used focused options-threading as the unified policy carrier rather than introducing a large new context type.
- Verification results:
  - `npm run build` passed.
  - `node --test dist/test/unit/kernel/apply-move.test.js` passed.
  - `npm test` passed.
  - `npm run lint` passed.
