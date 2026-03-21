# 71CANCRASH-005: Layer 5 — Active Render Health Probe

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: 71CANCRASH-003

## Problem

The heartbeat checks structural health (ticker running, canvas connected) but cannot detect silent rendering failure — PixiJS may be ticking without producing any visible output. A single contained error can permanently corrupt the TexturePool, and if the heartbeat doesn't detect corruption (addressed in 71CANCRASH-003), there is no active verification that rendering is actually producing output.

## Assumption Reassessment (2026-03-21)

1. `game-canvas-runtime.ts` holds a reference to `gameCanvas.app` which exposes `app.stage` (the PixiJS stage container) — confirmed.
2. PixiJS `Container` has `children`, `renderable`, and `visible` properties — standard PixiJS v8 API.
3. After 71CANCRASH-003, the ticker error fence exposes `isRenderCorruptionSuspected()` — this ticket depends on that being available.
4. The `GameCanvasRuntime.destroy()` method already tears down all subsystems in sequence (lines 536-572) — the probe must be destroyed in this sequence too.
5. After 71CANCRASH-003, `CanvasRuntimeHealthStatus` should already be consolidated to a single source of truth. This ticket must use that shared type surface and must not re-declare it while wiring the probe into `game-canvas-runtime.ts`.

## Architecture Check

1. The probe is lightweight: it runs only after contained errors (not every tick), checking that the stage has renderable children. This is O(N) over direct children of the stage, which is a small fixed set (layer containers).
2. This is purely runner canvas concern — no engine or game-spec changes.
3. The probe is a new module with a clean interface; no backwards-compatibility concerns.
4. This ticket extends runtime wiring only; it must preserve the health-status consolidation introduced by 71CANCRASH-003 and avoid reintroducing duplicate type declarations.

## What to Change

### 1. Create `render-health-probe.ts`

Create `packages/runner/src/canvas/render-health-probe.ts`:

- Export a factory function `createRenderHealthProbe(options)` returning a `RenderHealthProbe` interface:
  ```typescript
  interface RenderHealthProbe {
    scheduleVerification(): void;
    destroy(): void;
  }
  ```
- Options:
  - `stage`: The PixiJS `Container` (stage) to inspect.
  - `ticker`: The PixiJS ticker to schedule one-shot verification on the next tick.
  - `onCorruption`: Callback invoked when rendering appears non-functional.
  - `logger`: Optional `Pick<Console, 'warn'>`.
- `scheduleVerification()`:
  - Schedules a one-shot callback on the next successful tick.
  - The callback inspects the stage's direct children: if the stage has children but NONE have `renderable === true` and `visible === true`, rendering is considered non-functional.
  - If non-functional: invoke `onCorruption()`.
  - If functional: no-op (rendering recovered).
  - Only one verification can be pending at a time (debounce).
- `destroy()`: Cancels any pending verification.

### 2. Wire probe into `game-canvas-runtime.ts`

- Import and create the probe after the ticker error fence is installed.
- In the ticker error fence's `wrappedTick` catch path (or via a new `onContainedError` callback on the fence), call `probe.scheduleVerification()`.
- The probe's `onCorruption` callback should trigger the existing crash recovery path (e.g., `options.onError?.(error)` or directly call `requestRecovery` via the crash recovery handle).
- Add `probe.destroy()` to the `destroyCanvasPipeline` sequence.
- While touching runtime health wiring, keep `CanvasRuntimeHealthStatus` imported from the single canonical module established by 71CANCRASH-003; do not re-declare it locally.

### 3. Extend `TickerErrorFenceOptions` with `onContainedError` callback (if not already addressed by 71CANCRASH-003)

If 71CANCRASH-003 does not add an `onContainedError` callback to the fence options, this ticket must add it:
- `onContainedError?: (error: unknown) => void` — called on every contained error (not just threshold-breaching crashes).
- This is how the probe learns that an error occurred and should schedule verification.

## Files to Touch

- `packages/runner/src/canvas/render-health-probe.ts` (new)
- `packages/runner/src/canvas/game-canvas-runtime.ts` (modify — create probe, wire into fence + destroy)
- `packages/runner/src/canvas/ticker-error-fence.ts` (modify — add `onContainedError` callback if not already present from 71CANCRASH-003)
- `packages/runner/test/canvas/render-health-probe.test.ts` (new)

## Out of Scope

- Changes to `texture-pool-patch.ts` (71CANCRASH-001).
- Changes to `safe-destroy.ts` or `text-runtime.ts` (71CANCRASH-002).
- Changes to `canvas-crash-recovery.ts` (71CANCRASH-003).
- Changes to `create-app.ts` (71CANCRASH-004).
- Changes to the engine package.
- Performance profiling or optimization of the probe.
- Adding telemetry or error reporting infrastructure.

## Acceptance Criteria

### Tests That Must Pass

1. **Probe triggers on non-functional rendering**: When `scheduleVerification()` is called and the stage has children but none are renderable, `onCorruption` is invoked.
2. **Probe no-ops on functional rendering**: When `scheduleVerification()` is called and the stage has renderable children, `onCorruption` is NOT invoked.
3. **Probe no-ops on empty stage**: When the stage has no children, `onCorruption` is NOT invoked (no children = nothing to render = not a corruption signal).
4. **Probe debounces**: Multiple calls to `scheduleVerification()` before the tick fires result in only one verification.
5. **Probe cleanup**: After `destroy()`, pending verifications do not fire.
6. **onContainedError wiring**: A contained ticker error triggers `scheduleVerification()` on the probe.
7. Existing suite: `pnpm -F @ludoforge/runner test` passes.
8. Typecheck: `pnpm -F @ludoforge/runner typecheck` passes.

### Invariants

1. The probe runs only after contained errors, never on every tick.
2. The probe does not interfere with normal rendering — it only inspects, never modifies.
3. The probe is destroyed during the canvas teardown sequence.
4. The probe's `onCorruption` callback feeds into the existing crash recovery path.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/render-health-probe.test.ts` — Tests for all four probe scenarios (non-functional, functional, empty stage, debounce, destroy cleanup).
2. `packages/runner/test/canvas/ticker-error-fence.test.ts` — Test that `onContainedError` is called on contained errors (if callback is added in this ticket).

### Commands

1. `pnpm -F @ludoforge/runner test -- render-health-probe`
2. `pnpm -F @ludoforge/runner test -- ticker-error-fence`
3. `pnpm -F @ludoforge/runner typecheck`
4. `pnpm -F @ludoforge/runner test`
