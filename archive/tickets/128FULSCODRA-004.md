# 128FULSCODRA-004: Narrow turn flow draft mutations to tracker-backed branches

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel turn flow subsystem
**Deps**: `archive/tickets/128FULSCODRA-002.md`

## Problem

The turn flow subsystem (`turn-flow-lifecycle.ts`, `turn-flow-eligibility.ts`, `effects-turn-flow.ts`) still contains internal spread sites that create new `GameState` objects during tracker-backed turn flow execution. After ticket 002 threaded the mutable state and tracker through the move-execution lifecycle chain, the owned draft-path branches in these files can be converted to direct mutations using COW helpers. However, live callers in `initial-state.ts` and `phase-advance.ts` still rely on the shared turn-flow helpers as immutable authorities, so the wrapper return shapes and no-tracker behavior must remain intact.

## Assumption Reassessment (2026-04-14)

1. `turn-flow-lifecycle.ts` still has spread-based state transitions, but `applyTurnFlowInitialReveal(...)` and `applyTurnFlowCardBoundary(...)` are also called from shared immutable setup/lifecycle surfaces. Confirmed.
2. `turn-flow-eligibility.ts` still owns tracker-backed post-move turn-flow updates through `applyTurnFlowEligibilityAfterMove(...)`, and can mutate in place when `options.tracker` is present. Confirmed.
3. `effects-turn-flow.ts` still contains tracker-backed branches that rebuild `GameState` objects while applying turn-flow effects. Confirmed.
4. `TurnFlowTransitionResult` and the lifecycle wrappers must keep returning `.state: GameState`; removing `.state` would break live callers in `apply-move.ts`, `initial-state.ts`, and `phase-advance.ts`. Confirmed.
5. The correct boundary is tracker-backed mutation with immutable fallback preserved for no-tracker callers, matching `docs/FOUNDATIONS.md` and ticket 003's narrowed effect-handler pattern. Confirmed.

## Architecture Check

1. Turn flow remains a good allocation-reduction target, but only within the already-owned draft scope.
2. `docs/FOUNDATIONS.md` favors explicit scope boundaries: move-application may use scoped internal mutation, while shared setup/lifecycle helpers must remain usable as immutable authorities.
3. Functions that currently return `TurnFlowTransitionResult` or similar wrapper types will keep returning `.state` plus the existing non-state fields. Tracker-backed callers may receive the same mutated object back; no-tracker callers continue to receive immutable rebuilt state.

## What to Change

### 1. `turn-flow-lifecycle.ts` — add tracker-aware mutable fast path

Thread an optional `DraftTracker` through the internal zone/runtime helpers in this file. When a tracker is present, use `ensureZoneCloned(...)` / `ensureTurnOrderStateCloned(...)` and mutate the provided state in place. When no tracker is present, preserve the existing immutable behavior and returned wrapper shape.

### 2. `turn-flow-eligibility.ts` — mutate tracker-backed post-move updates in place

Convert the owned tracker-backed post-move transition branches inside `applyTurnFlowEligibilityAfterMove(...)` and its local helpers to mutate in place when `options.tracker` is present. Preserve immutable fallback behavior for setup/lifecycle callers and keep `TurnFlowTransitionResult.state`.

### 3. `effects-turn-flow.ts` — convert tracker-backed turn-flow effect branches

Convert the tracker-backed state rebuilds in the turn-flow effect handlers to direct mutation when `cursor.tracker` is present, while preserving immutable fallback behavior for shared no-tracker execution contexts.

## Files to Touch

- `packages/engine/src/kernel/turn-flow-lifecycle.ts` (modify)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/effects-turn-flow.ts` (modify)
- `packages/engine/test/unit/effects-turn-flow.test.ts` (modify)
- `packages/engine/test/integration/fitl-card-flow-determinism.test.ts` (modify)
- `packages/engine/test/integration/fitl-eligibility-pass-chain.test.ts` (modify)

## Out of Scope

- Removing `.state` from `TurnFlowTransitionResult` or lifecycle wrapper returns
- Converting shared immutable callers in `initial-state.ts` or `phase-advance.ts` to a new draft contract
- Converting phase-advance and other lifecycle files beyond the owned turn-flow effect handlers (ticket 005)
- Property-based equivalence tests (ticket 006)

## Acceptance Criteria

### Tests That Must Pass

1. All existing turn flow tests pass with identical behavior
2. All existing determinism tests pass with identical stateHash values
3. All FITL eligibility window tests pass
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Foundation 8 (Determinism): turn flow transitions produce identical results
2. `TurnFlowTransitionResult` and lifecycle wrapper return values still include `.state`, plus the existing non-state fields
3. Tracker-backed callers use COW helpers before nested mutations; no-tracker callers preserve immutable fallback behavior

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/effects-turn-flow.test.ts` — add tracker-backed mutation coverage for owned effect handlers
2. `packages/engine/test/integration/fitl-card-flow-determinism.test.ts` — verify turn-flow transitions remain deterministic
3. `packages/engine/test/integration/fitl-eligibility-pass-chain.test.ts` — verify post-move eligibility/card-end behavior remains unchanged

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/effects-turn-flow.test.js dist/test/integration/fitl-card-flow-determinism.test.js dist/test/integration/fitl-eligibility-pass-chain.test.js`
3. `pnpm -F @ludoforge/engine test`

## Implementation Notes

1. `turn-flow-lifecycle.ts` now accepts an optional tracker and uses `ensureZoneCloned(...)` / `ensureTurnOrderStateCloned(...)` to mutate tracker-backed lifecycle transitions in place while keeping immutable fallback behavior and wrapper returns for shared callers.
2. `turn-flow-eligibility.ts` now mutates tracker-backed post-move turn-flow updates, reward writes, and active-player/runtime rewrites in place when `options.tracker` is present, while preserving immutable setup/lifecycle behavior when no tracker is supplied.
3. `effects-turn-flow.ts` now reuses the tracker-backed turn-order and interrupt-stack draft path for `grantFreeOperation`, `gotoPhaseExact`, `pushInterruptPhase`, and `popInterruptPhase`, including the corrected incremental phase-hash updates for mutable phase transitions.
4. Verification coverage was extended in the owned unit and integration suites to cover tracker-backed effect execution and repeated deterministic turn-flow/pass-chain runs.

## Verification

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/effects-turn-flow.test.js dist/test/integration/fitl-card-flow-determinism.test.js dist/test/integration/fitl-eligibility-pass-chain.test.js`
3. `pnpm -F @ludoforge/engine test`

## Outcome

Completed: 2026-04-14

`128FULSCODRA-004` landed as the narrower, Foundations-aligned tracker-backed turn-flow mutation slice. Shared immutable callers still receive wrapper-returned state, while the owned move-execution branches now avoid several redundant `GameState` rebuilds and preserve deterministic behavior across the full engine suite.
