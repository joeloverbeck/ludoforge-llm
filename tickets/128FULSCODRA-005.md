# 128FULSCODRA-005: Convert remaining lifecycle files and hash boundary to draft mutations

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel phase-advance, action-usage, event-execution, grant-lifecycle, free-operation-viability, apply-move hash boundary
**Deps**: `archive/tickets/128FULSCODRA-002.md`

## Problem

After tickets 003 and 004 convert the effect handlers and turn flow subsystem, the remaining spread sites are scattered across lifecycle files (`phase-advance.ts`, `action-usage.ts`, `event-execution.ts`, `grant-lifecycle.ts`, `free-operation-viability.ts`) and the hash boundary in `apply-move.ts`. Converting these completes the full-scope draft coverage, eliminating all remaining redundant object allocation within the `applyMoveCore` boundary.

## Assumption Reassessment (2026-04-13)

1. `phase-advance.ts` has 4-8 spread sites (including `...progressedState` variants). Confirmed.
2. `action-usage.ts` has 4 spread sites. Confirmed.
3. `event-execution.ts` has 1 spread site. Confirmed.
4. `grant-lifecycle.ts` has 1 spread site. Confirmed.
5. `free-operation-viability.ts` has 1-2 spread sites. Confirmed.
6. `advanceToDecisionPoint` returns `GameState` directly (not a wrapper type). Confirmed.
7. `applyReleasedDeferredEventEffects` returns `MoveActionExecutionResult` with `.stateWithRng: GameState`. Confirmed.

## Architecture Check

1. These are the "long tail" files — each has few spread sites but collectively they account for ~12 remaining sites. Grouping them in one ticket avoids excessive ticket overhead for 1-2 line changes per file.
2. No game-specific logic — all files operate on generic GameState infrastructure.
3. `advanceToDecisionPoint` can return `void` since it only returns `GameState` (no wrapper). `applyReleasedDeferredEventEffects` still returns non-state fields (trigger firings).

## What to Change

### 1. phase-advance.ts — convert 4-8 spread sites

Convert phase transition spreads to direct mutations. Key patterns:
- `{ ...state, currentPhase: nextPhase }` → `state.currentPhase = nextPhase`
- `{ ...progressedState, stateHash: ... }` → `progressedState.stateHash = ...` (if hash patches exist within phase advance)

Modify `advanceToDecisionPoint` to mutate state in-place and return `void` (or return only non-state fields if any exist in the call chain).

### 2. action-usage.ts — convert 4 spread sites

Convert action usage tracking updates to direct mutations:
- `{ ...state, actionUsage: { ...state.actionUsage, ... } }` → `ensureActionUsageCloned(state, tracker); state.actionUsage[key] = ...`

### 3. event-execution.ts — convert 1 spread site

Convert the event state update spread (likely `{ ...state, activeLastingEffects: ... }`) to:
- `ensureActiveLastingEffectsCloned(state, tracker); state.activeLastingEffects = newEffects`

### 4. grant-lifecycle.ts — convert 1 spread site

Convert the grant state update spread to direct mutation.

### 5. free-operation-viability.ts — convert 1-2 spread sites

Convert free operation state spreads to direct mutations. Note: if these spreads are in analysis/probe paths (not within the `applyMoveCore` chain), they may need to remain immutable. Verify the call chain before converting.

### 6. apply-move.ts — verify hash boundary converted

Ticket 002 converts the hash boundary spread. Verify it's complete — if any residual spread sites remain in `applyMoveCore` (e.g., around `consumeAuthorizedFreeOperationGrant` or simultaneous submission paths), convert them here.

## Files to Touch

- `packages/engine/src/kernel/phase-advance.ts` (modify)
- `packages/engine/src/kernel/action-usage.ts` (modify)
- `packages/engine/src/kernel/event-execution.ts` (modify)
- `packages/engine/src/kernel/grant-lifecycle.ts` (modify)
- `packages/engine/src/kernel/free-operation-viability.ts` (modify)
- `packages/engine/src/kernel/apply-move.ts` (modify — residual spreads if any)

## Out of Scope

- Converting effect handler files (ticket 003)
- Converting turn flow files (ticket 004)
- Property-based equivalence tests (ticket 006)
- Performance benchmarking (ticket 007)

## Acceptance Criteria

### Tests That Must Pass

1. All existing phase advance tests pass with identical behavior
2. All existing action usage tests pass
3. All existing determinism tests pass with identical stateHash values
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Foundation 8 (Determinism): all state transitions produce identical results
2. `advanceToDecisionPoint` mutates state in-place — callers no longer use the return value for state
3. Spread sites in probe/analysis paths outside `applyMoveCore` are NOT converted — they must remain immutable
4. COW helpers called before nested mutations

## Test Plan

### New/Modified Tests

1. `packages/engine/test/kernel/phase-advance.test.ts` — verify phase transitions produce identical outcomes
2. `packages/engine/test/kernel/action-usage.test.ts` — verify action usage tracking is deterministic

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "phase-advance|action-usage"`
2. `pnpm turbo build && pnpm turbo test`
