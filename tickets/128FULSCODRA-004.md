# 128FULSCODRA-004: Convert turn flow subsystem to draft mutations

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel turn flow subsystem
**Deps**: `archive/tickets/128FULSCODRA-002.md`

## Problem

The turn flow subsystem (`turn-flow-lifecycle.ts`, `turn-flow-eligibility.ts`, `effects-turn-flow.ts`) contains 13-18 spread sites that create new GameState objects during turn flow transitions. After ticket 002 threads the mutable state and tracker through the lifecycle chain, these internal spread sites can be converted to direct mutations using COW helpers, eliminating redundant object allocation.

## Assumption Reassessment (2026-04-13)

1. `turn-flow-lifecycle.ts` has 7 spread sites creating state-like objects. Confirmed.
2. `turn-flow-eligibility.ts` has 4-6 spread sites. Confirmed.
3. `effects-turn-flow.ts` has 2-5 spread sites. Confirmed.
4. `applyTurnFlowEligibilityAfterMove` returns `TurnFlowTransitionResult` containing `.state: GameState` plus trace entries and boundary durations. The non-state fields must still be returned. Confirmed.
5. Turn flow functions modify `turnOrderState`, `currentPhase`, `activePlayer`, and various nested state fields. COW helpers for `turnOrderState` are provided by ticket 001. Confirmed.

## Architecture Check

1. Turn flow is the largest single subsystem of spread sites (13-18 across 3 files). Converting it yields the biggest per-ticket reduction in object allocation.
2. No game-specific logic — turn flow operates on generic phase/turn/seat abstractions.
3. Functions that currently return `TurnFlowTransitionResult` or similar wrapper types will mutate the state in-place but still return the non-state fields (trace entries, boundary durations, released deferred effects). The wrapper return type changes from `{ state: GameState, traceEntries: [...] }` to `{ traceEntries: [...] }` (state is mutated in-place, not returned).

## What to Change

### 1. turn-flow-lifecycle.ts — convert 7 spread sites

Convert all 7 state-creating spread patterns to direct mutations. Key patterns:
- `{ ...state, currentPhase: ... }` → `state.currentPhase = ...`
- `{ ...state, turnOrderState: { ...state.turnOrderState, ... } }` → `ensureTurnOrderStateCloned(state, tracker); state.turnOrderState.field = ...`
- `{ ...state, activePlayer: ... }` → `state.activePlayer = ...`

Thread the `DraftTracker` parameter through internal helper functions in this file.

### 2. turn-flow-eligibility.ts — convert 4-6 spread sites

Convert spread sites in eligibility window state updates. Modify `applyTurnFlowEligibilityAfterMove` to mutate state in-place and return only non-state fields. Update internal helpers to accept and use the tracker.

### 3. effects-turn-flow.ts — convert 2-5 spread sites

Convert turn flow effect spread sites to direct mutations. These are effect handlers for turn-flow-related effects that operate on state outside the existing Spec 78 draft scope.

## Files to Touch

- `packages/engine/src/kernel/turn-flow-lifecycle.ts` (modify)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/effects-turn-flow.ts` (modify)

## Out of Scope

- Converting effect handler files (ticket 003)
- Converting phase-advance and other lifecycle files (ticket 005)
- Property-based equivalence tests (ticket 006)

## Acceptance Criteria

### Tests That Must Pass

1. All existing turn flow tests pass with identical behavior
2. All existing determinism tests pass with identical stateHash values
3. All FITL eligibility window tests pass
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Foundation 8 (Determinism): turn flow transitions produce identical results
2. `TurnFlowTransitionResult` non-state fields (trace entries, boundary durations) are still returned correctly
3. COW helpers called before nested mutations — no aliased writes to `turnOrderState`

## Test Plan

### New/Modified Tests

1. `packages/engine/test/kernel/turn-flow-lifecycle.test.ts` — verify turn flow state transitions produce identical outcomes
2. `packages/engine/test/kernel/turn-flow-eligibility.test.ts` — verify eligibility transitions are deterministic

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "turn-flow"`
2. `pnpm turbo build && pnpm turbo test`
