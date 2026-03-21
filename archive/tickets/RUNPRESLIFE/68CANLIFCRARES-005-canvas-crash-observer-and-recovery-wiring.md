# 68CANLIFCRARES-005: Add canvas crash observer and wire recovery flow into GameCanvas

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: archive/tickets/RUNPRESLIFE/68CANLIFCRARES-003-ticker-error-fence-and-runtime-crash-reporting.md, archive/tickets/RUNPRESLIFE/68CANLIFCRARES-004-store-lifecycle-crash-states.md

## Problem

When the ticker error fence stops the ticker and reports a fatal runtime error, nothing currently recovers the Pixi runtime. The canvas remains dead and the user must reload the page. The React `ErrorBoundary` cannot catch this because the error occurs outside React's component tree (in the PixiJS RAF loop).

The fix: add a small recovery coordinator that transitions the store lifecycle through `canvasCrashed → reinitializing → playing|terminal` and triggers `GameCanvas` to mount a fresh PixiJS application. Game state is preserved because it lives in Zustand.

## Assumption Reassessment (2026-03-20)

1. `GameCanvas.tsx` currently mixes two responsibilities: the React component and the large async `createGameCanvasRuntime()` factory. That works functionally, but it is the wrong shape for clean recovery testing because the component cannot be exercised against a mocked runtime seam without reaching through the same module.
2. The `GameCanvas` component creates the Pixi runtime in a `useEffect` and tears it down on cleanup. Re-mount requires a component-local state change or a parent key change; store lifecycle transitions alone do not currently re-run the effect.
3. `createGameCanvasRuntime()` is already a reusable async factory. It can be called again with the same store to rebuild the Pixi runtime, and its `destroy()` path already owns `destroyCanvasPipeline()`. Recovery must reuse that destroy flow rather than call teardown helpers directly.
4. Archived ticket `68CANLIFCRARES-003` deliberately did **not** ship an `EventTarget` crash bus. The ticker error fence reports fatal failures through an explicit `onCrash` callback.
5. Archived ticket `68CANLIFCRARES-004` added `reportCanvasCrash()`, `beginCanvasRecovery()`, and `canvasRecovered()` to the store, plus explicit `canvasCrashed` / `reinitializing` lifecycle states.
6. `canvasRecovered()` already derives `playing` vs `terminal` from the store's `terminal` snapshot. Recovery wiring should not invent a second source of truth for post-recovery lifecycle.
7. `GameContainer.tsx` currently does **not** pass `onError` into `GameCanvas`, and it treats both `canvasCrashed` and `reinitializing` as non-canvas loading states. As written, that unmounts `GameCanvas` during the exact recovery window where it would need to recreate the Pixi runtime.
8. The active-session mount point therefore has to stay alive through recovery. Either the parent owns remount orchestration, or `GameContainer` must stop unmounting `GameCanvas` while the child-owned recovery cycle is in progress.
9. Focused runner test commands should use `pnpm -F @ludoforge/runner exec vitest run ...`, not `pnpm -F ... test -- ...`.

## Architecture Check

1. The recovery layer should remain callback-driven, not event-driven. Reusing the existing ticker-fence callback path keeps one crash transport instead of inventing a second event system.
2. `GameCanvas` should continue to own Pixi runtime creation, destruction, and re-mount. That responsibility belongs with the runtime boundary, not with a larger UI container.
3. `GameContainer` should not own Pixi teardown details, but it must stop cutting off the runtime's mount point during recovery. Leaving `canvasCrashed` / `reinitializing` as hard non-canvas states is architecturally incompatible with child-owned remount.
4. A small standalone helper module is still justified if it is narrowly scoped to store-lifecycle sequencing plus duplicate-crash suppression. It should not know about Pixi internals or call teardown helpers directly.
5. A small extraction of `createGameCanvasRuntime()` into its own module is justified. The current mixed module couples React rendering to runtime construction and makes recovery-specific component tests unnecessarily brittle.
6. The architecture benefit over the current state is real: fatal render-loop failure is surfaced once, recovered through explicit runner lifecycle transitions, and kept at the canvas/runtime boundary instead of leaking Pixi recovery concerns upward.

## What to Change

### 1. Extract the runtime factory from `GameCanvas.tsx`

New file: `packages/runner/src/canvas/game-canvas-runtime.ts`

Move into this module:
- `createGameCanvasRuntime(...)`
- `createScopedLifecycleCallback(...)`
- runtime types needed by `GameCanvas`

Requirements:
1. The extraction must be behavior-preserving aside from recovery wiring.
2. `GameCanvas.tsx` becomes the React lifecycle shell that owns recovery state.
3. Runtime teardown ownership remains inside the runtime module; no external caller may reach into `destroyCanvasPipeline()` directly.

### 2. Create `canvas-crash-recovery.ts`

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

### 3. Wire recovery into `GameCanvas.tsx`

In `packages/runner/src/canvas/GameCanvas.tsx`:
- Create a component-local recovery key / revision so `GameCanvas` can intentionally destroy and recreate its runtime.
- Create a crash recovery helper instance inside the effect scope.
- Pass an internal runtime-crash callback into `createGameCanvasRuntime()` that routes fatal runtime failures into the helper's `handleCrash(error)`.
- When `onRecoveryNeeded` fires:
  - increment the local recovery key so the effect runs again and mounts a fresh Pixi app
- Let normal effect cleanup destroy the dead runtime; do not call teardown helpers directly from the recovery helper.
- After the new runtime is created successfully during a recovery cycle, call `store.getState().canvasRecovered()`.
- Preserve the public `onError` prop as an optional observer callback. Recovery must not depend on a parent wiring this prop.
- Clean up the recovery helper in the effect teardown.

Do **not**:
- add an `EventTarget` crash bus
- move ticker-fence installation out of `createGameCanvasRuntime()`
- call `destroyCanvasPipeline()` directly from outside the runtime

### 4. Update `GameContainer.tsx` recovery compatibility

In `packages/runner/src/ui/GameContainer.tsx`:
- Stop treating `canvasCrashed` and `reinitializing` as hard non-canvas states that remove the `GameCanvas` mount point.
- Keep the active-session canvas path mounted so child-owned recovery can complete.
- Do not move Pixi recovery logic into `GameContainer`; this file should only stop blocking recovery and continue to own high-level UI layout.

### 5. Create test files

New file: `packages/runner/test/canvas/canvas-crash-recovery.test.ts`

New file: `packages/runner/test/canvas/GameCanvas.recovery.test.tsx`

## Files to Touch

- `packages/runner/src/canvas/game-canvas-runtime.ts` (new)
- `packages/runner/src/canvas/canvas-crash-recovery.ts` (new)
- `packages/runner/src/canvas/GameCanvas.tsx` (modify)
- `packages/runner/src/ui/GameContainer.tsx` (modify)
- `packages/runner/test/canvas/GameCanvas.test.ts` (modify)
- `packages/runner/test/canvas/GameCanvas.recovery.test.tsx` (new)
- `packages/runner/test/canvas/canvas-crash-recovery.test.ts` (new)
- `packages/runner/test/ui/GameContainer.test.ts` (modify)

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
4. `GameCanvas recovery > forwards fatal runtime errors into crash recovery` — verify fatal runtime errors trigger the helper and request one recovery re-mount.
5. `GameCanvas recovery > re-mounts the runtime after crash recovery` — verify a new runtime is created after crash sequence and the dead runtime is destroyed through normal cleanup.
6. `GameCanvas recovery > calls canvasRecovered after successful recovery mount` — verify post-recovery lifecycle returns to `playing` or `terminal` according to store state.
7. `GameContainer > keeps GameCanvas mounted during reinitializing` — verify the parent no longer removes the canvas mount point during recovery.
8. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Game state (Zustand) must be fully preserved through the crash/recovery cycle.
2. `GameCanvas` cleanup must destroy both the runtime and the crash recovery helper (no leaked handlers).
3. The crash recovery helper must not call store actions if it has been destroyed.
4. Recovery must result in `gameLifecycle` returning to `playing` or `terminal` via `canvasRecovered()`, never by aliasing bootstrap state.
5. Existing `GameCanvasRuntime.destroy()` flow must continue to work for normal (non-crash) teardown.
6. Recovery wiring must use the existing callback seam from `GameCanvas` / ticker-error-fence, not a duplicate event bus.
7. `GameContainer` must not own Pixi teardown or store-crash sequencing; it only preserves the mount point needed for child-owned recovery.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/canvas-crash-recovery.test.ts` — unit tests for helper lifecycle, crash sequencing, and duplicate-crash suppression.
2. `packages/runner/test/canvas/GameCanvas.test.ts` — existing runtime-factory coverage updated for the runtime extraction.
3. `packages/runner/test/canvas/GameCanvas.recovery.test.tsx` — component recovery coverage using the extracted runtime module as a clean seam.
4. `packages/runner/test/ui/GameContainer.test.ts` — verify recovery-compatible lifecycle rendering so `GameCanvas` remains mounted during `reinitializing`.

### Commands

1. `pnpm -F @ludoforge/runner exec vitest run test/canvas/canvas-crash-recovery.test.ts test/canvas/GameCanvas.test.ts test/canvas/GameCanvas.recovery.test.tsx test/ui/GameContainer.test.ts --reporter=verbose`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`
4. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completed: 2026-03-20
- What actually changed:
  - Extracted the runtime factory and runtime-only helpers into `packages/runner/src/canvas/game-canvas-runtime.ts`, leaving `GameCanvas.tsx` as the React lifecycle shell.
  - Added `packages/runner/src/canvas/canvas-crash-recovery.ts` to sequence `reportCanvasCrash()`, `beginCanvasRecovery()`, and single-shot remount requests.
  - Wired `GameCanvas` to recover from fatal ticker/runtime crashes by bumping a local recovery revision, letting normal cleanup destroy the dead runtime, and calling `canvasRecovered()` after the fresh runtime mounts successfully.
  - Updated `GameContainer.tsx` so active-session crash/recovery states no longer remove the `GameCanvas` mount point needed for child-owned recovery.
  - Added dedicated recovery unit coverage, component recovery coverage, and updated container/runtime tests to reflect the corrected ownership model.
- Deviations from original plan:
  - Replaced the ticket's original "GameCanvas-only wiring" scope with a small runtime extraction plus a `GameContainer` lifecycle adjustment. The original scope was incomplete because the parent was unmounting the child during recovery.
  - Preserved `GameCanvas`'s public `onError` as an observer callback instead of making recovery depend on parent wiring.
  - Did not add any new UI indicator or overlay for recovery. The change stayed focused on architecture and correctness.
- Verification results:
  - `pnpm -F @ludoforge/runner exec vitest run test/canvas/canvas-crash-recovery.test.ts test/canvas/GameCanvas.test.ts test/canvas/GameCanvas.recovery.test.tsx test/ui/GameContainer.test.ts --reporter=verbose` ✅
  - `pnpm -F @ludoforge/runner test` ✅
  - `pnpm -F @ludoforge/runner typecheck` ✅
  - `pnpm -F @ludoforge/runner lint` ✅
