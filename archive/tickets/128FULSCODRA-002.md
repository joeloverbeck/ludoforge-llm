# 128FULSCODRA-002: Wire draft scope into applyMoveCore and thread tracker through lifecycle chain

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — kernel apply-move, effect-context, trigger-dispatch, phase-lifecycle, phase-advance, turn-flow-eligibility, boundary-expiry, event-execution
**Deps**: `archive/tickets/128FULSCODRA-001.md`

## Problem

Currently, `applyEffectsWithBudgetState` creates its own draft scope (mutable state + DraftTracker) for each effect execution batch. Multiple batches within a single `applyMoveCore` call each create independent drafts, and all lifecycle functions between batches (turn flow, boundary expiry, phase advance, hash computation) operate on immutable state via spreads. This ticket establishes a single draft scope at the `applyMoveCore` boundary and threads the mutable state + tracker through the entire lifecycle chain. Downstream conversion tickets (003-005) then convert internal spread sites to mutations.

## Assumption Reassessment (2026-04-13)

1. `applyMoveCore` at `packages/engine/src/kernel/apply-move.ts:1399-1552` is the actual internal entry point — called by both `applyMove` and `applyTrustedMove`. Confirmed.
2. `applyEffectsWithBudgetState` at `packages/engine/src/kernel/effect-dispatch.ts:101-195` creates its own `createMutableState` + `createDraftTracker` when no tracker is provided, or reuses an existing one. Confirmed — the reuse path already exists.
3. `advanceToDecisionPoint` at `phase-advance.ts:573` accepts `GameState` and returns `GameState`. Confirmed.
4. `applyTurnFlowEligibilityAfterMove` at `turn-flow-eligibility.ts:839` accepts `GameState` and returns `TurnFlowTransitionResult`. Confirmed.
5. `applyBoundaryExpiry` at `boundary-expiry.ts:19` accepts `GameState` and returns `BoundaryExpiryResult`. Confirmed.
6. `applyReleasedDeferredEventEffects` at `apply-move.ts:1317` is internal, accepts `GameState`, returns `MoveActionExecutionResult`. Confirmed.
7. Hash computation at `apply-move.ts:1517-1521` uses `{ ...progressedState, stateHash: reconciledHash, _runningHash: reconciledHash }`. Confirmed.
8. `createExecutionEffectContext()` / `toEffectCursor()` still materialize `tracker: undefined`, so `executeMoveAction` cannot actually reuse an outer draft without adjacent effect-context plumbing. Confirmed.
9. Triggered and lifecycle effect dispatch inside the `applyMoveCore` chain re-enter `applyEffects(...)` through `dispatchTriggers()` / `dispatchLifecycleEvent()`, so preserving one draft per move requires threading the tracker through those helpers too. Confirmed.

## Architecture Check

1. This is the critical structural change — it establishes the single-owner draft scope that all conversion tickets depend on. The design follows Foundation 11's scoped-mutation exception: one draft created at `applyMoveCore` entry, frozen at exit, external contract unchanged.
2. All public APIs (`applyMove`, `applyTrustedMove`) continue to accept immutable `GameState` and return immutable `GameState`. The mutable path is entirely internal.
3. No backwards-compatibility shims — lifecycle function signatures are changed directly. The `MutableGameState` type is structurally compatible with `GameState` (via `Mutable<T>`), so callers outside `applyMoveCore` can continue using immutable state while the apply-move path opts into tracker-aware plumbing.

## What to Change

### 1. Modify applyMoveCore to create draft scope

At the top of `applyMoveCore`, after validation and runtime setup:
- Call `createMutableState(state)` to create the working copy
- Call `createDraftTracker()` to create the tracker
- Thread the mutable state and tracker through all downstream calls
- At the exit, call `freezeState(mutableState)` to produce the final immutable state

### 2. Modify executeMoveAction to accept and thread existing tracker

`executeMoveAction` calls `applyEffectsWithBudgetState`, which already supports receiving an existing tracker. Thread the tracker from `applyMoveCore` through `executeMoveAction` so that `applyEffectsWithBudgetState` reuses the existing draft instead of creating a new one. This eliminates redundant draft creation within each effect batch.

### 3. Change lifecycle function signatures

Change the following functions to accept `MutableGameState` (or `GameState` — structurally compatible) plus `DraftTracker`:

- `advanceToDecisionPoint` in `phase-advance.ts` — add `tracker?: DraftTracker` parameter
- `applyTurnFlowEligibilityAfterMove` in `turn-flow-eligibility.ts` — add `tracker?: DraftTracker` parameter
- `applyBoundaryExpiry` in `boundary-expiry.ts` — add `tracker?: DraftTracker` parameter
- `applyReleasedDeferredEventEffects` in `apply-move.ts` — add `tracker?: DraftTracker` parameter

**Important**: In this ticket, the tracker parameter is optional (`tracker?: DraftTracker`). Functions continue to use spreads internally where later tickets own the actual mutation conversion; this ticket establishes the tracker-aware path and removes the top-level extra draft/final-hash spread so one mutable state can survive the full `applyMoveCore` chain.

### 4. Convert hash boundary to direct assignment

Replace the final spread in `applyMoveCore` (lines 1517-1521):
```typescript
// Before:
const stateWithHash = { ...progressedState, stateHash: reconciledHash, _runningHash: reconciledHash };
// After:
mutableState.stateHash = reconciledHash;
mutableState._runningHash = reconciledHash;
```

This is safe because `mutableState` is the same object threaded through the entire chain — `progressedState` is just an alias at this point.

### 5. Update applyMoveCore result construction

The final `return { state: stateWithHash, ... }` becomes `return { state: freezeState(mutableState), ... }`. Non-state fields (trigger firings, warnings, traces) are still collected from the lifecycle function return values.

## Files to Touch

- `packages/engine/src/kernel/apply-move.ts` (modify — applyMoveCore, applyReleasedDeferredEventEffects, executeMoveAction)
- `packages/engine/src/kernel/effect-context.ts` (modify — let execution contexts/cursors carry an optional tracker)
- `packages/engine/src/kernel/event-execution.ts` (modify — preserve tracker through deferred event move execution inside applyMoveCore)
- `packages/engine/src/kernel/effects-turn-flow.ts` (modify — pass the tracker through turn-flow effect lifecycle dispatch and phase advancement)
- `packages/engine/src/kernel/phase-advance.ts` (modify — advanceToDecisionPoint signature)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify — applyTurnFlowEligibilityAfterMove signature)
- `packages/engine/src/kernel/boundary-expiry.ts` (modify — applyBoundaryExpiry signature)
- `packages/engine/src/kernel/trigger-dispatch.ts` (modify — preserve tracker through emitted trigger execution inside applyMoveCore)
- `packages/engine/src/kernel/phase-lifecycle.ts` (modify — preserve tracker through lifecycle-event effect dispatch inside applyMoveCore)
- `packages/engine/src/kernel/initial-state.ts` (modify — update lifecycle dispatch call sites for the new tracker-aware signature)

## Out of Scope

- Converting spread internals within lifecycle functions (tickets 003-005)
- Converting effect handler internals (ticket 003)
- Property-based tests (ticket 006)
- Performance benchmarking (ticket 007)

## Acceptance Criteria

### Tests That Must Pass

1. All existing determinism tests pass with identical stateHash values (bit-for-bit)
2. All existing FITL and Texas Hold'em tests pass
3. `applyMove` and `applyTrustedMove` public API behavior is unchanged (same inputs → same outputs)
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Foundation 8 (Determinism): same seed + same actions = identical stateHash before and after this change
2. Foundation 11 (Immutability — external contract): `applyMove` input state is never modified; output is a new immutable object
3. Single draft scope: exactly one `createMutableState` + one `freezeState` per `applyMoveCore` invocation
4. `probeMoveViability` remains unaffected — it does not call `applyMoveCore`

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/apply-move.test.ts` — add test verifying input state deep-frozen before `applyMove`, no throw during execution, output state !== input state
2. `packages/engine/test/unit/kernel/effect-context-construction-contract.test.ts` — verify an explicit tracker is preserved on the effect cursor without leaking into the effect env
3. `packages/engine/test/integration/compiled-lifecycle-runtime.test.ts` — update lifecycle dispatch call sites for the tracker-aware signature

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm -F @ludoforge/engine test:e2e`
3. `pnpm turbo build`
4. `pnpm turbo typecheck`

## Outcome

**Completed**: 2026-04-14

1. `applyMoveCore` now owns a single draft scope by creating one mutable state and one draft tracker at entry, mutating the final hash fields in place, and freezing once at exit.
2. The draft tracker is threaded through the full apply-move lifecycle chain, including move execution, deferred event execution, trigger dispatch, lifecycle dispatch, boundary expiry, turn-flow eligibility, and decision-point advancement.
3. `effect-context.ts` now preserves an explicit tracker on the cursor without leaking it into the effect environment, so nested effect execution can reuse the outer draft safely.
4. External immutability is still enforced: a new unit test deep-freezes the input state, runs `applyMove`, and verifies the input object remains unchanged while the returned state reflects the move result.
5. `effect-dispatch.ts` required no code change because the tracker reuse branch already existed; the ticket draft was corrected to reflect the actual implementation boundary.
6. Schema/artifact fallout checked: the required verification commands passed without requiring any spec, schema, or generated-artifact updates for this ticket.

### Verification

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/apply-move.test.js dist/test/unit/kernel/effect-context-construction-contract.test.js dist/test/integration/compiled-lifecycle-runtime.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine test:e2e`
5. `pnpm turbo build`
6. `pnpm turbo typecheck`
