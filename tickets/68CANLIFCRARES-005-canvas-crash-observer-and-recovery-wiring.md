# 68CANLIFCRARES-005: Add canvas crash observer and wire recovery flow into GameCanvas

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: archive/tickets/RUNPRESLIFE/68CANLIFCRARES-003-ticker-error-fence-and-runtime-crash-reporting.md, tickets/68CANLIFCRARES-004-store-lifecycle-crash-states.md

## Problem

When the ticker error fence stops the ticker and emits a `canvas-crash` event, nothing currently responds. The canvas remains dead and the user must reload the page. The React `ErrorBoundary` cannot catch this because the error occurs outside React's component tree (in the PixiJS RAF loop).

The fix: create a canvas crash observer that listens for `canvas-crash` events, orchestrates safe teardown of the existing canvas pipeline, transitions the store lifecycle through `canvasCrashed → reinitializing → playing`, and triggers `GameCanvas` to re-mount a fresh PixiJS application. Game state is preserved because it lives in Zustand.

## Assumption Reassessment (2026-03-20)

1. `GameCanvas` component at `GameCanvas.tsx:556-654` creates the runtime in a `useEffect` and tears it down on cleanup. Re-mount requires the effect to re-run.
2. `createGameCanvasRuntime` at `GameCanvas.tsx:176-554` is an async factory that creates all canvas infrastructure. It can be called again with the same store to rebuild.
3. `destroyCanvasPipeline` at `GameCanvas.tsx:656-676` is an internal function that tears down all canvas subsystems. Must be callable from the observer.
4. The ticker error fence (68CANLIFCRARES-003) emits `canvas-crash` on an `EventTarget` (`crashTarget`).
5. Store actions `reportCanvasCrash()`, `beginCanvasRecovery()`, `canvasRecovered()` are available from 68CANLIFCRARES-004.

## Architecture Check

1. The crash observer is a standalone module with a clear lifecycle (`create` → `destroy`). It bridges the PixiJS event world to the Zustand store world.
2. `GameCanvas` re-mounts via a React key change or lifecycle-driven effect dependency — the simplest mechanism to get a fresh PixiJS app.
3. Recovery is invisible to the user: game state lives in Zustand, the canvas just re-renders from the current snapshot.

## What to Change

### 1. Create `canvas-crash-observer.ts`

New file: `packages/runner/src/canvas/canvas-crash-observer.ts`

Exports:
- `createCanvasCrashObserver(options: CrashObserverOptions): CrashObserver`
- `CrashObserver` interface: `{ destroy(): void }`
- `CrashObserverOptions`: `{ crashTarget: EventTarget; store: StoreApi<GameStore>; onRecoveryNeeded: () => void }`

Behavior:
1. Listen for `canvas-crash` events on `crashTarget`.
2. On crash event:
   a. Call `store.getState().reportCanvasCrash()`.
   b. Call `store.getState().beginCanvasRecovery()`.
   c. Call `onRecoveryNeeded()` — the `GameCanvas` component provides this callback to trigger re-mount.
3. `destroy()` removes the event listener.

### 2. Wire into `GameCanvas.tsx`

In `packages/runner/src/canvas/GameCanvas.tsx`:
- After `createGameCanvasRuntime` resolves, install the ticker error fence on the PixiJS app (from 68CANLIFCRARES-003).
- Create a crash observer that listens on the fence's `crashTarget`.
- When `onRecoveryNeeded` fires: destroy the current runtime, then trigger re-initialization (e.g. by incrementing a React state key that forces the effect to re-run).
- After re-initialization succeeds, call `store.getState().canvasRecovered()`.
- Clean up fence and observer in the effect teardown.

### 3. Create test file

New file: `packages/runner/test/canvas/canvas-crash-observer.test.ts`

## Files to Touch

- `packages/runner/src/canvas/canvas-crash-observer.ts` (new)
- `packages/runner/src/canvas/GameCanvas.tsx` (modify)
- `packages/runner/test/canvas/canvas-crash-observer.test.ts` (new)

## Out of Scope

- Modifying `safe-destroy.ts` or `disposal-queue.ts` (done in 001/002).
- Creating the ticker error fence (done in 003).
- Store lifecycle state additions (done in 004).
- End-to-end crash resilience validation (that's 68CANLIFCRARES-006).
- Adding UI indicators (toast, overlay) for crash recovery state.
- Handling WebGL context loss (separate failure mode).
- Modifying any engine package files.

## Acceptance Criteria

### Tests That Must Pass

1. `canvas crash observer > calls reportCanvasCrash on crash event` — verify store action is called when `canvas-crash` is dispatched.
2. `canvas crash observer > calls beginCanvasRecovery after reporting crash` — verify sequencing.
3. `canvas crash observer > calls onRecoveryNeeded callback` — verify the callback fires.
4. `canvas crash observer > destroy removes event listener` — verify no further callbacks after destroy.
5. `canvas crash observer > ignores crash events after destroy` — verify no store mutation.
6. `GameCanvas integration > installs ticker error fence on app creation` — verify fence is created (can be tested via mock).
7. `GameCanvas integration > re-mounts canvas after crash recovery` — verify a new runtime is created after crash sequence.
8. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Game state (Zustand) must be fully preserved through the crash/recovery cycle.
2. `GameCanvas` cleanup must destroy both the fence and the observer (no leaked listeners).
3. The crash observer must not call store actions if it has been destroyed.
4. Recovery must result in `gameLifecycle` returning to `playing` (or `terminal` if the game ended).
5. Existing `GameCanvasRuntime.destroy()` flow must continue to work for normal (non-crash) teardown.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/canvas-crash-observer.test.ts` — unit tests for observer lifecycle, event handling, and store action sequencing.
2. `packages/runner/test/canvas/GameCanvas.test.ts` (if exists, modify; otherwise integration assertions can live in observer test) — verify fence and observer wiring.

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/canvas/canvas-crash-observer.test.ts`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`
