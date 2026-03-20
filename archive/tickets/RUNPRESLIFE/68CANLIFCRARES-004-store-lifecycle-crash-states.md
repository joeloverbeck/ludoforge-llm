# 68CANLIFCRARES-004: Extend store lifecycle with canvas crash/recovery states

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

The runner store's lifecycle state machine (`idle → initializing → playing → terminal`) has no concept of canvas crash or recovery. When the canvas crashes, the runner has no explicit state that tells the UI or recovery wiring that the Pixi runtime is dead but the game session is still intact.

The fix: add `canvasCrashed` and `reinitializing` states to `GameLifecycle`, with three new store actions: `reportCanvasCrash()`, `beginCanvasRecovery()`, and `canvasRecovered()`.

## Assumption Reassessment (2026-03-20)

1. `GameLifecycle` at `lifecycle-transition.ts:3` is `'idle' | 'initializing' | 'playing' | 'terminal'`. Confirmed.
2. `ALLOWED_LIFECYCLE_TRANSITIONS` at `lifecycle-transition.ts:5-10` defines the transition matrix. Must be extended.
3. `GameStoreState.gameLifecycle` at `game-store.ts:38` holds the current lifecycle. Confirmed.
4. `GameStoreActions` at `game-store.ts:93-127` defines all store actions. Must add new actions.
5. `GameCanvas` already installs the ticker error fence and exposes runtime errors through its existing `onError` callback path. Ticket `68CANLIFCRARES-005` has to build on that callback-driven seam; there is no live `EventTarget` crash bus in the current architecture.
6. `GameContainer` currently treats only `idle` and `initializing` as non-canvas states. Introducing crash states without updating that mapping would leave `canvasCrashed` and `reinitializing` falling through the normal canvas render path.
7. The Pixi canvas is rendered for both `playing` and `terminal`, so canvas crash reporting cannot be restricted to `playing`. A terminal board can crash too.
8. The runner's focused test command shape is `pnpm -F @ludoforge/runner exec vitest run ...`, not `pnpm -F ... test -- ...`.

## Architecture Check

1. Extending `GameLifecycle` is preferable to bolting on ad hoc booleans such as `isCanvasCrashed` or overloading the generic `error` field. The lifecycle already acts as the runner's top-level readiness contract, so crash/recovery belongs there if it is modeled explicitly and exhaustively.
2. The crash states must describe runner-display lifecycle, not bootstrap lifecycle. Reusing `initializing` as an alias for canvas remount would be the wrong abstraction because the game session, worker state, and derived render data already exist. A dead Pixi runtime is not the same thing as a new game bootstrapping.
3. `canvasRecovered()` should derive its destination from the store's existing `terminal` snapshot. That keeps one source of truth for whether the recovered session should resume as `playing` or `terminal`.
4. Game state in Zustand must be preserved through crash/recovery. Only the canvas runtime is torn down and rebuilt.
5. No aliasing or compatibility paths. The lifecycle union is extended directly and all affected consumers are updated in the same change.

## What to Change

### 1. Extend `GameLifecycle` type

In `packages/runner/src/store/lifecycle-transition.ts`:
- Add `'canvasCrashed'` and `'reinitializing'` to the `GameLifecycle` union.
- Add transition rules:
  - `playing → canvasCrashed` (crash detected while game is active)
  - `terminal → canvasCrashed` (crash detected while terminal board remains mounted)
  - `canvasCrashed → reinitializing` (recovery begins)
  - `reinitializing → playing` (recovery complete)
  - `reinitializing → terminal` (game was terminal during recovery)

Do **not** add `canvasCrashed → initializing`. Canvas remount is not game bootstrap.

### 2. Add store actions

In `packages/runner/src/store/game-store.ts`:
- Add `reportCanvasCrash(): void` — transitions `playing | terminal → canvasCrashed`. No-op for other lifecycles.
- Add `beginCanvasRecovery(): void` — transitions `canvasCrashed → reinitializing`.
- Add `canvasRecovered(): void` — transitions `reinitializing → lifecycleFromTerminal(get().terminal)`. No extra parameter; the store already knows whether the recovered session is terminal.

### 3. Add to `GameStoreActions` interface

Add the three new actions to the `GameStoreActions` interface and implement them in `createGameStore`.

### 4. Define UI handling for the new lifecycle states

In `packages/runner/src/ui/GameContainer.tsx`:
- Treat `canvasCrashed` and `reinitializing` as non-canvas states.
- Render the same loading/recovery placeholder path used for `idle` / `initializing` so the dead Pixi runtime does not remain visible once these states are introduced.

## Files to Touch

- `packages/runner/src/store/lifecycle-transition.ts` (modify)
- `packages/runner/src/store/game-store.ts` (modify)
- `packages/runner/src/ui/GameContainer.tsx` (modify)
- `packages/runner/test/store/game-store-crash-lifecycle.test.ts` (new)
- `packages/runner/test/store/lifecycle-transition.test.ts` (modify)
- `packages/runner/test/ui/GameContainer.test.ts` (modify)

## Out of Scope

- Wiring store lifecycle to `GameCanvas.tsx` re-mount (68CANLIFCRARES-005).
- Ticker error fence (68CANLIFCRARES-003).
- Canvas crash observer (68CANLIFCRARES-005).
- Adding a second crash-reporting abstraction beside `GameCanvas`'s existing `onError` path.
- Modifying any canvas rendering code.
- Modifying any engine package files.
- Adding UI indicators for crash/recovery state (future work).

## Acceptance Criteria

### Tests That Must Pass

1. `lifecycle transitions > playing → canvasCrashed is allowed` — verify `assertLifecycleTransition('playing', 'canvasCrashed', ...)` succeeds.
2. `lifecycle transitions > terminal → canvasCrashed is allowed` — verify `assertLifecycleTransition('terminal', 'canvasCrashed', ...)` succeeds.
3. `lifecycle transitions > canvasCrashed → reinitializing is allowed` — verify transition succeeds.
4. `lifecycle transitions > reinitializing → playing is allowed` — verify transition succeeds.
5. `lifecycle transitions > reinitializing → terminal is allowed` — verify transition succeeds.
6. `lifecycle transitions > idle → canvasCrashed is rejected` — verify transition throws.
7. `lifecycle transitions > canvasCrashed → terminal is rejected` — verify transition throws.
8. `store crash lifecycle > reportCanvasCrash transitions to canvasCrashed and preserves game session state` — verify `gameState`, `gameDef`, `playerSeats`, `legalMoveResult`, `renderModel`, and `terminal` are unchanged.
9. `store crash lifecycle > reportCanvasCrash also works from terminal` — verify terminal sessions can enter `canvasCrashed`.
10. `store crash lifecycle > beginCanvasRecovery transitions to reinitializing` — verify lifecycle change.
11. `store crash lifecycle > canvasRecovered returns to playing when terminal is null` — verify lifecycle change.
12. `store crash lifecycle > canvasRecovered returns to terminal when terminal is set` — verify lifecycle change.
13. `store crash lifecycle > crash recovery actions are no-op outside their legal source states` — verify `reportCanvasCrash`, `beginCanvasRecovery`, and `canvasRecovered` remain idempotent when called out of order.
14. `GameContainer > renders LoadingState when lifecycle is canvasCrashed` — verify new state does not render the normal canvas path.
15. `GameContainer > renders LoadingState when lifecycle is reinitializing` — verify new state does not render the normal canvas path.
16. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. All existing lifecycle transitions must remain valid (no regression).
2. `gameState`, `gameDef`, `playerSeats`, `legalMoveResult`, `renderModel` must be preserved through the `playing → canvasCrashed → reinitializing → playing` cycle.
3. `terminal` must be preserved through the `terminal → canvasCrashed → reinitializing → terminal` cycle.
4. The crash lifecycle must not alias runner bootstrap. Recovery returns to `playing` or `terminal`, never `initializing`.
5. The `GameStore` type must remain a single intersection of state + actions (no breaking type changes).
6. `INITIAL_STATE.gameLifecycle` must remain `'idle'`.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/store/lifecycle-transition.test.ts` — extend allowed/rejected transition coverage for `canvasCrashed` and `reinitializing`.
2. `packages/runner/test/store/game-store-crash-lifecycle.test.ts` — store action tests for crash/recovery lifecycle, preservation, terminal recovery, and idempotent out-of-order calls.
3. `packages/runner/test/ui/GameContainer.test.ts` — verify `canvasCrashed` and `reinitializing` render the loading path instead of the normal canvas path.

### Commands

1. `pnpm -F @ludoforge/runner exec vitest run test/store/lifecycle-transition.test.ts test/store/game-store-crash-lifecycle.test.ts test/ui/GameContainer.test.ts --reporter=verbose`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`
4. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completed: 2026-03-20
- What actually changed:
  - Extended `GameLifecycle` with `canvasCrashed` and `reinitializing`, and updated the legal transition matrix in `packages/runner/src/store/lifecycle-transition.ts`.
  - Added `reportCanvasCrash()`, `beginCanvasRecovery()`, and `canvasRecovered()` to `packages/runner/src/store/game-store.ts`, with recovery resolving back to `playing` or `terminal` from the store's existing `terminal` snapshot.
  - Updated `packages/runner/src/ui/GameContainer.tsx` so crash and recovery states render the loading path instead of leaving the dead canvas mounted.
  - Added dedicated crash lifecycle store coverage in `packages/runner/test/store/game-store-crash-lifecycle.test.ts`, extended transition coverage in `packages/runner/test/store/lifecycle-transition.test.ts`, and added UI coverage in `packages/runner/test/ui/GameContainer.test.ts`.
- Deviations from original plan:
  - Expanded crash reporting to include terminal sessions. The original ticket assumed only `playing` canvases could crash, but the runner mounts Pixi during `terminal` as well.
  - Removed the proposed `canvasCrashed -> initializing` path. Reusing bootstrap lifecycle for canvas remount would have blurred two different responsibilities.
  - Added minimal `GameContainer` handling for the new states. Leaving UI mapping unchanged would have made the new lifecycle states architecturally incomplete.
  - Updated test fixtures that construct `GameStore` objects directly so the store contract remains explicit and type-safe after adding the new actions.
- Verification results:
  - `pnpm -F @ludoforge/runner exec vitest run test/store/lifecycle-transition.test.ts test/store/game-store-crash-lifecycle.test.ts test/ui/GameContainer.test.ts --reporter=verbose` ✅
  - `pnpm -F @ludoforge/runner test` ✅
  - `pnpm -F @ludoforge/runner typecheck` ✅
  - `pnpm -F @ludoforge/runner lint` ✅
