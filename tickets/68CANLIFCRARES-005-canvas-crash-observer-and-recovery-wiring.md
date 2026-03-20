# 68CANLIFCRARES-005: Add canvas crash observer and wire recovery flow into GameCanvas

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: archive/tickets/RUNPRESLIFE/68CANLIFCRARES-003-ticker-error-fence-and-runtime-crash-reporting.md, archive/tickets/RUNPRESLIFE/68CANLIFCRARES-004-store-lifecycle-crash-states.md

## Problem

When the ticker error fence stops the ticker and reports a fatal runtime error through `GameCanvas`'s existing `onError` seam, nothing currently responds. The canvas remains dead and the user must reload the page. The React `ErrorBoundary` cannot catch this because the error occurs outside React's component tree (in the PixiJS RAF loop).

The fix: create a small recovery coordinator that consumes the fatal `onError` callback, transitions the store lifecycle through `canvasCrashed → reinitializing → playing|terminal`, and triggers `GameCanvas` to mount a fresh PixiJS application. Game state is preserved because it lives in Zustand.

## Assumption Reassessment (2026-03-20)

1. `GameCanvas` component at `GameCanvas.tsx:556-654` creates the runtime in a `useEffect` and tears it down on cleanup. Re-mount requires the effect to re-run.
2. `createGameCanvasRuntime` at `GameCanvas.tsx:176-554` is an async factory that creates all canvas infrastructure. It can be called again with the same store to rebuild.
3. `destroyCanvasPipeline` at `GameCanvas.tsx:656-676` is already owned by `GameCanvasRuntime.destroy()`. A new recovery layer should call the existing runtime destroy flow, not reach into internal teardown helpers from the outside.
4. Archived ticket `68CANLIFCRARES-003` deliberately did **not** ship an `EventTarget` crash bus. The ticker error fence reports fatal failures through an explicit `onCrash` callback, and `GameCanvas` bridges that into its existing `onError` surface.
5. Archived ticket `68CANLIFCRARES-004` added `reportCanvasCrash()`, `beginCanvasRecovery()`, and `canvasRecovered()` to the store, plus explicit `canvasCrashed` / `reinitializing` lifecycle states.
6. `canvasRecovered()` already derives `playing` vs `terminal` from the store's `terminal` snapshot. Recovery wiring should not invent a second source of truth for post-recovery lifecycle.
7. The runner already has a stronger abstraction boundary than the spec text: canvas-runtime failures enter React through `onError`, while session state lives in Zustand. Recovery should preserve that split instead of introducing a parallel event system.
8. Focused runner test commands should use `pnpm -F @ludoforge/runner exec vitest run ...`, not `pnpm -F ... test -- ...`.

## Architecture Check

1. The recovery layer should be callback-driven, not event-driven. Reusing `GameCanvas`'s `onError` contract keeps one failure-reporting seam instead of inventing a second crash transport.
2. `GameCanvas` should continue to own runtime creation and destruction. The recovery coordinator should request a re-mount by changing component-local state, then let normal effect cleanup destroy the dead runtime.
3. A small standalone helper module is still justified if it is narrowly scoped to store-lifecycle sequencing plus re-mount signaling. It should not know about Pixi internals or call teardown helpers directly.
4. Recovery is invisible to the user: game state lives in Zustand, the canvas just re-renders from the current snapshot.
5. The architecture benefit over the current state is real: fatal render-loop failure is surfaced once, then recovered through explicit runner lifecycle transitions. That is cleaner and more extensible than leaving crash handling implicit inside `GameCanvas`.

## What to Change

### 1. Create `canvas-crash-recovery.ts`

New file: `packages/runner/src/canvas/canvas-crash-recovery.ts`

Exports:
- `createCanvasCrashRecovery(options: CanvasCrashRecoveryOptions): CanvasCrashRecovery`
- `CanvasCrashRecovery` interface: `{ handleCrash(error: unknown): void; destroy(): void }`
- `CanvasCrashRecoveryOptions`: `{ store: StoreApi<GameStore>; onRecoveryNeeded: () => void; logger?: Pick<Console, 'warn'> }`

Behavior:
1. `handleCrash(error)` should:
   a. Call `store.getState().reportCanvasCrash()`.
   b. Call `store.getState().beginCanvasRecovery()`.
   c. Call `onRecoveryNeeded()` exactly once for the active crash.
   d. Optionally log the contained fatal error for diagnosis.
2. `destroy()` should make later `handleCrash()` calls no-op.
3. The helper must be idempotent for repeated crash callbacks during a single recovery window. Once recovery is in progress, additional fatal callbacks must not trigger duplicate re-mount requests.

### 2. Wire into `GameCanvas.tsx`

In `packages/runner/src/canvas/GameCanvas.tsx`:
- Create a component-local recovery key / revision so `GameCanvas` can intentionally destroy and recreate its runtime.
- Create a crash recovery helper instance inside the effect scope.
- Pass an `onError` callback into `createGameCanvasRuntime()` that routes fatal runtime failures into the helper's `handleCrash(error)`.
- When `onRecoveryNeeded` fires:
  - destroy the current runtime via the existing cleanup path
  - increment the local recovery key so the effect runs again and mounts a fresh Pixi app
- After the new runtime is created successfully during a recovery cycle, call `store.getState().canvasRecovered()`.
- Clean up the recovery helper in the effect teardown.

Do **not**:
- add an `EventTarget` crash bus
- move ticker-fence installation out of `createGameCanvasRuntime()`
- call `destroyCanvasPipeline()` directly from outside the runtime

### 3. Create test file

New file: `packages/runner/test/canvas/canvas-crash-recovery.test.ts`

## Files to Touch

- `packages/runner/src/canvas/canvas-crash-recovery.ts` (new)
- `packages/runner/src/canvas/GameCanvas.tsx` (modify)
- `packages/runner/test/canvas/GameCanvas.test.ts` (modify)
- `packages/runner/test/canvas/canvas-crash-recovery.test.ts` (new)

## Out of Scope

- Modifying `safe-destroy.ts` or `disposal-queue.ts` (done in 001/002).
- Creating the ticker error fence (done in 003).
- Store lifecycle state additions (done in 004).
- End-to-end crash resilience validation (that's 68CANLIFCRARES-006).
- Adding an `EventTarget`-based crash event layer or any second crash-reporting abstraction beside `GameCanvas` `onError`.
- Adding UI indicators (toast, overlay) for crash recovery state.
- Handling WebGL context loss (separate failure mode).
- Modifying any engine package files.

## Acceptance Criteria

### Tests That Must Pass

1. `canvas crash recovery > handleCrash reports canvas crash and begins recovery` — verify store action sequencing.
2. `canvas crash recovery > handleCrash requests recovery remount exactly once per recovery window` — verify duplicate fatal callbacks do not cause duplicate re-mount requests.
3. `canvas crash recovery > destroy disables later crash handling` — verify no store mutation after destroy.
4. `GameCanvas integration > forwards fatal runtime errors into crash recovery` — verify the runtime `onError` path drives recovery instead of surfacing an unhandled fatal error.
5. `GameCanvas integration > re-mounts canvas after crash recovery` — verify a new runtime is created after crash sequence.
6. `GameCanvas integration > calls canvasRecovered after successful recovery mount` — verify post-recovery lifecycle returns to `playing` or `terminal` according to store state.
7. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Game state (Zustand) must be fully preserved through the crash/recovery cycle.
2. `GameCanvas` cleanup must destroy both the runtime and the crash recovery helper (no leaked handlers).
3. The crash recovery helper must not call store actions if it has been destroyed.
4. Recovery must result in `gameLifecycle` returning to `playing` or `terminal` via `canvasRecovered()`, never by aliasing bootstrap state.
5. Existing `GameCanvasRuntime.destroy()` flow must continue to work for normal (non-crash) teardown.
6. Recovery wiring must use the existing callback seam from `GameCanvas` / ticker-error-fence, not a duplicate event bus.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/canvas-crash-recovery.test.ts` — unit tests for helper lifecycle, crash sequencing, and duplicate-crash suppression.
2. `packages/runner/test/canvas/GameCanvas.test.ts` — integration coverage for fatal `onError` recovery flow, re-mount behavior, and `canvasRecovered()` sequencing.

### Commands

1. `pnpm -F @ludoforge/runner exec vitest run test/canvas/canvas-crash-recovery.test.ts test/canvas/GameCanvas.test.ts --reporter=verbose`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`
4. `pnpm -F @ludoforge/runner lint`
