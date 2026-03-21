# 71CANCRASH-005: Layer 5 — Active Render Health Probe

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: 71CANCRASH-003

## Problem

The heartbeat checks structural health (ticker running, canvas connected) but cannot detect silent rendering failure — PixiJS may be ticking without producing any visible output. A single contained error can permanently corrupt the TexturePool, and if the heartbeat doesn't detect corruption (addressed in 71CANCRASH-003), there is no active verification that rendering is actually producing output.

There is now an additional verified gap in the current architecture: `renderCorruptionSuspected` is a short-lived fence-local signal, but crash recovery polls health on a 5000ms heartbeat. With the current `corruptionClearThreshold` default of 10 successful ticks, the flag can clear in roughly 167ms at 60fps. That means the existing heartbeat-based recovery path can miss the corruption signal entirely even when a contained render-loop error occurred.

## Assumption Reassessment (2026-03-21)

1. `game-canvas-runtime.ts` holds a reference to `gameCanvas.app` which exposes `app.stage` (the PixiJS stage container) — confirmed.
2. PixiJS `Container` has `children`, `renderable`, and `visible` properties — standard PixiJS v8 API.
3. After 71CANCRASH-003, the ticker error fence already exposes `isRenderCorruptionSuspected()` — confirmed in `ticker-error-fence.ts`.
4. `TickerErrorFenceOptions` does NOT yet expose an `onContainedError` callback — this ticket still needs that callback if the probe is to react immediately instead of waiting for heartbeat polling.
5. `CanvasRuntimeHealthStatus` is already consolidated into `canvas-runtime-health.ts` and `game-canvas-runtime.ts` already imports it instead of re-declaring it — confirmed.
6. `GameCanvasRuntime.destroy()` already tears subsystems down in sequence and currently destroys the fence near the end of `destroyCanvasPipeline()` — the probe must join that sequence and be destroyed before the canvas itself is destroyed.
7. The current architecture already routes confirmed runtime faults into crash recovery through `options.onError` and `GameCanvas`'s `createCanvasCrashRecovery()` wiring. The probe should reuse that recovery path rather than introduce a second recovery mechanism.
8. A richer runtime-health model is not justified by this ticket as currently scoped. The bug is not "missing health states"; it is that the existing transient signal is too ephemeral for heartbeat polling. The fix should therefore prefer immediate verification plus existing recovery wiring over adding another persisted boolean or a speculative discriminated state object.

## Architecture Check

1. The current architecture is not sufficient on its own: the heartbeat-based recovery path can miss `renderCorruptionSuspected` entirely because the fence clears suspicion after a handful of successful ticks while the heartbeat polls every 5000ms.
2. A probe is beneficial only if it closes that race by running immediately after a contained error and routing confirmed corruption directly into the existing recovery path. A probe that merely feeds another transient health bit back into the heartbeat would duplicate the current flaw.
3. The probe remains lightweight: it runs only after contained errors (not every tick), checking the stage's direct children. This is O(N) over a small fixed set of layer containers.
4. This remains purely a runner canvas concern — no engine or game-spec changes.
5. The clean architecture here is:
   - ticker fence contains errors and emits `onContainedError`
   - probe schedules one-shot verification on the next tick
   - verified corruption goes straight to the existing recovery path
   - heartbeat remains responsible for slower structural failures (`tickerStarted`, `canvasConnected`) and as a coarse secondary safety net
6. This ticket must preserve the single canonical `CanvasRuntimeHealthStatus` type and must not add duplicate or parallel health contracts.
7. This ticket is NOT the right place to grow runtime health into a more elaborate state machine unless implementation proves the probe must persist new long-lived failure reasons. As of reassessment, that would be speculative complexity rather than architectural improvement.

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
- In the ticker error fence's contained-error path, call `probe.scheduleVerification()` via a new `onContainedError` callback on the fence options.
- The probe's `onCorruption` callback should trigger the existing crash recovery path by calling `options.onError?.(probeError)` with a dedicated error instance describing render-health verification failure. Do not add a second bespoke recovery channel.
- Add `probe.destroy()` to the `destroyCanvasPipeline` sequence.
- Keep `CanvasRuntimeHealthStatus` imported from the single canonical module established by 71CANCRASH-003; do not re-declare it locally.
- Do NOT add another persisted health field unless implementation reveals a concrete need that the callback-based probe cannot express. The current preferred architecture is callback-based verification plus existing recovery.

### 3. Extend `TickerErrorFenceOptions` with `onContainedError` callback (if not already addressed by 71CANCRASH-003)

`TickerErrorFenceOptions` does not currently expose this callback, so this ticket must add it:
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
- Reworking `CanvasRuntimeHealthStatus` into a larger state model unless implementation proves the callback-based probe is insufficient.

## Acceptance Criteria

### Tests That Must Pass

1. **Probe triggers on non-functional rendering**: When `scheduleVerification()` is called and the stage has children but none are renderable, `onCorruption` is invoked.
2. **Probe no-ops on functional rendering**: When `scheduleVerification()` is called and the stage has renderable children, `onCorruption` is NOT invoked.
3. **Probe no-ops on empty stage**: When the stage has no children, `onCorruption` is NOT invoked (no children = nothing to render = not a corruption signal).
4. **Probe debounces**: Multiple calls to `scheduleVerification()` before the tick fires result in only one verification.
5. **Probe cleanup**: After `destroy()`, pending verifications do not fire.
6. **onContainedError wiring**: A contained ticker error triggers `scheduleVerification()` on the probe without waiting for the heartbeat interval.
7. **Direct recovery wiring**: Confirmed probe corruption routes into the existing `onError` / crash-recovery path immediately rather than relying on heartbeat polling to observe a transient flag.
8. Existing suite: `pnpm -F @ludoforge/runner test` passes.
9. Typecheck: `pnpm -F @ludoforge/runner typecheck` passes.
10. Lint: `pnpm -F @ludoforge/runner lint` passes.
11. `CanvasRuntimeHealthStatus` remains the single canonical shared health type, with no duplicate declarations or parallel runtime-health contracts introduced.

### Invariants

1. The probe runs only after contained errors, never on every tick.
2. The probe does not interfere with normal rendering — it only inspects, never modifies.
3. The probe is destroyed during the canvas teardown sequence.
4. The probe's `onCorruption` callback feeds into the existing crash recovery path immediately.
5. This ticket must not grow the shared health contract by boolean accumulation unless that is still the minimal correct architecture after implementation-time reassessment.
6. The current race between transient corruption suspicion and slow heartbeat polling is explicitly closed by the implementation.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/render-health-probe.test.ts` — Tests for all four probe scenarios (non-functional, functional, empty stage, debounce, destroy cleanup).
2. `packages/runner/test/canvas/ticker-error-fence.test.ts` — Test that `onContainedError` is called on contained errors and not gated on threshold breach.
3. `packages/runner/test/canvas/GameCanvas.test.ts` — Test that runtime wiring routes confirmed probe corruption into `options.onError` / recovery wiring and destroys the probe during teardown.

### Commands

1. `pnpm -F @ludoforge/runner test -- render-health-probe`
2. `pnpm -F @ludoforge/runner test -- ticker-error-fence`
3. `pnpm -F @ludoforge/runner test -- GameCanvas`
4. `pnpm -F @ludoforge/runner typecheck`
5. `pnpm -F @ludoforge/runner lint`
6. `pnpm -F @ludoforge/runner test`

## Outcome

- Completion date: 2026-03-21
- What actually changed:
  - Added `packages/runner/src/canvas/render-health-probe.ts` with a one-shot, debounced verification probe that inspects stage children after contained ticker errors.
  - Extended `TickerErrorFenceOptions` with `onContainedError` so contained errors can trigger immediate verification instead of waiting for heartbeat polling.
  - Wired `game-canvas-runtime.ts` to create the probe, schedule verification on contained errors, route confirmed corruption through the existing `options.onError` recovery path, and destroy the probe during runtime teardown.
  - Added focused probe tests and strengthened fence/runtime tests around the new invariant.
- Deviations from original plan:
  - Kept `CanvasRuntimeHealthStatus` unchanged instead of expanding the runtime health contract, because the root issue was the race between transient suspicion and slow heartbeat polling, not missing persisted health states.
  - Reused the existing `onError` and crash-recovery path rather than introducing a second recovery mechanism.
- Verification results:
  - `pnpm -F @ludoforge/runner test -- render-health-probe`
  - `pnpm -F @ludoforge/runner test -- ticker-error-fence`
  - `pnpm -F @ludoforge/runner test -- GameCanvas`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner lint`
  - `pnpm -F @ludoforge/runner test`
