# 68CANLIFCRARES-004: Extend store lifecycle with canvas crash/recovery states

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None (independent module, but logically consumed by 68CANLIFCRARES-005)

## Problem

The game store's lifecycle state machine (`idle → initializing → playing → terminal`) has no concept of canvas crash or recovery. When the canvas crashes, there is no way for the store to signal this state to the UI, and no way for the recovery layer to transition through a clean teardown → re-initialization cycle.

The fix: add `canvasCrashed` and `reinitializing` states to the `GameLifecycle` type, with three new store actions: `reportCanvasCrash()`, `beginCanvasRecovery()`, `canvasRecovered()`.

## Assumption Reassessment (2026-03-20)

1. `GameLifecycle` at `lifecycle-transition.ts:3` is `'idle' | 'initializing' | 'playing' | 'terminal'`. Confirmed.
2. `ALLOWED_LIFECYCLE_TRANSITIONS` at `lifecycle-transition.ts:5-10` defines the transition matrix. Must be extended.
3. `GameStoreState.gameLifecycle` at `game-store.ts:38` holds the current lifecycle. Confirmed.
4. `GameStoreActions` at `game-store.ts:93-127` defines all store actions. Must add new actions.
5. The `GameCanvas` component does not currently observe `gameLifecycle` for re-mount decisions — that wiring is 68CANLIFCRARES-005.

## Architecture Check

1. Adding states to the lifecycle type union is the minimal, type-safe way to model crash/recovery. TypeScript exhaustive checks will flag any unhandled cases.
2. Game state (Zustand store) is preserved through crash/recovery — only the canvas layer is torn down and re-created. This matches the spec's design: "Game state lives in Zustand, not in PixiJS."
3. No aliasing or shims. New states are additive to the existing union.

## What to Change

### 1. Extend `GameLifecycle` type

In `packages/runner/src/store/lifecycle-transition.ts`:
- Add `'canvasCrashed'` and `'reinitializing'` to the `GameLifecycle` union.
- Add transition rules:
  - `playing → canvasCrashed` (crash detected)
  - `canvasCrashed → reinitializing` (recovery begins)
  - `reinitializing → playing` (recovery complete)
  - `reinitializing → terminal` (game was terminal during recovery)
  - `canvasCrashed → initializing` (full re-init if needed)

### 2. Add store actions

In `packages/runner/src/store/game-store.ts`:
- Add `reportCanvasCrash(): void` — transitions `playing → canvasCrashed`. No-op if not in `playing` state.
- Add `beginCanvasRecovery(): void` — transitions `canvasCrashed → reinitializing`.
- Add `canvasRecovered(): void` — transitions `reinitializing → playing` (or `terminal` if game ended).

### 3. Add to `GameStoreActions` interface

Add the three new actions to the `GameStoreActions` interface and implement them in `createGameStore`.

## Files to Touch

- `packages/runner/src/store/lifecycle-transition.ts` (modify)
- `packages/runner/src/store/game-store.ts` (modify)
- `packages/runner/test/store/game-store-crash-lifecycle.test.ts` (new)

## Out of Scope

- Wiring store lifecycle to `GameCanvas.tsx` re-mount (68CANLIFCRARES-005).
- Ticker error fence (68CANLIFCRARES-003).
- Canvas crash observer (68CANLIFCRARES-005).
- Modifying any canvas rendering code.
- Modifying any engine package files.
- Adding UI indicators for crash/recovery state (future work).

## Acceptance Criteria

### Tests That Must Pass

1. `lifecycle transitions > playing → canvasCrashed is allowed` — verify `assertLifecycleTransition('playing', 'canvasCrashed', ...)` succeeds.
2. `lifecycle transitions > canvasCrashed → reinitializing is allowed` — verify transition succeeds.
3. `lifecycle transitions > reinitializing → playing is allowed` — verify transition succeeds.
4. `lifecycle transitions > idle → canvasCrashed is rejected` — verify transition throws.
5. `lifecycle transitions > canvasCrashed → terminal is rejected` — verify transition throws (must go through reinitializing first, or use initializing path).
6. `store crash lifecycle > reportCanvasCrash transitions to canvasCrashed and preserves gameState` — verify game state, gameDef, playerSeats are unchanged.
7. `store crash lifecycle > beginCanvasRecovery transitions to reinitializing` — verify lifecycle change.
8. `store crash lifecycle > canvasRecovered transitions back to playing` — verify lifecycle change.
9. `store crash lifecycle > reportCanvasCrash is no-op when not playing` — verify no state change when lifecycle is `idle` or `terminal`.
10. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. All existing lifecycle transitions must remain valid (no regression).
2. `gameState`, `gameDef`, `playerSeats`, `legalMoveResult`, `renderModel` must be preserved through the `playing → canvasCrashed → reinitializing → playing` cycle.
3. The `GameStore` type must remain a single intersection of state + actions (no breaking type changes).
4. `INITIAL_STATE.gameLifecycle` must remain `'idle'`.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/store/game-store-crash-lifecycle.test.ts` — lifecycle transition validation and store action tests for crash/recovery cycle.

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/store/game-store-crash-lifecycle.test.ts`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`
