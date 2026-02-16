# ENGINEAGNO-002: Propagate Replay Transition Budget Across All Execution Paths

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — execution context plumbing
**Deps**: ENGINEAGNO-001

## Problem

`maxPhaseTransitionsPerMove` is currently enforced for direct turn-flow effects and lifecycle effects, but not uniformly across all effect execution paths. Trigger-executed effects currently build fresh contexts without replay budget propagation, which can bypass replay boundary guarantees.

This weakens deterministic action-by-action replay guarantees for GameSpecDoc-driven games that use trigger-driven phase transitions.

## What to Change

1. Introduce one unified execution context/policy object (or equivalent) that carries replay transition budget.
2. Thread that budget through all effect application entry points:
   - action effects
   - lifecycle effects
   - trigger effects and recursive cascades
   - event-execution effect lists
3. Remove path-specific budget behavior and ensure a single, coherent per-move budget scope.
4. Preserve game-agnostic architecture: no game- or phase-specific branches in kernel.

## Invariants

1. A move’s configured transition budget applies regardless of where phase-transition effects are invoked.
2. Trigger-emitted phase transitions consume the same move budget as direct action effects.
3. Exceeding budget never crashes; transitions are blocked deterministically.
4. Budget behavior is deterministic for identical seed + move sequence.
5. Default behavior (no budget option) remains unchanged.

## Tests

1. Unit: trigger effect containing `gotoPhaseExact` consumes budget and is blocked when exhausted.
2. Unit: recursive trigger cascade with multiple transitions respects budget cap.
3. Unit: lifecycle + trigger combined transitions consume from one shared budget.
4. Integration: replay move with `maxPhaseTransitionsPerMove: 1` does not allow extra trigger-driven phase jumps.
5. Regression: tournament and existing e2e suites pass without replay budget option.

