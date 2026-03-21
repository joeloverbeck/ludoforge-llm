# 71CANCRASH-003: Layer 2 — Render Corruption Suspicion + Heartbeat Integration

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

Spec 69 already hardened the runner with sliding-window ticker detection and heartbeat-based crash recovery. That closed the repeated-error gap, but it did not close the single-contained-error gap:

1. A single render-loop error can still be contained by `ticker-error-fence.ts` without stopping the ticker.
2. The heartbeat in `canvas-crash-recovery.ts` still only sees structural health (`tickerStarted`, `canvasConnected`).
3. If PixiJS rendering is degraded after that contained error, the runtime can remain structurally healthy while functionally blank.

This ticket addresses that remaining gap by surfacing a short-lived "render corruption suspected" signal from the runtime health surface. It does not replace the existing sliding-window detector; it complements it.

## Assumption Reassessment (2026-03-21)

1. `installTickerErrorFence` still returns a `TickerErrorFence` with only `destroy()` exposed. It already tracks both consecutive-error and sliding-window thresholds, but it exposes no degraded-runtime signal for sub-threshold errors.
2. `CanvasRuntimeHealthStatus` still contains only `tickerStarted` and `canvasConnected`. It is duplicated in both `canvas-crash-recovery.ts` and `game-canvas-runtime.ts`, which is a real type-drift risk.
3. The heartbeat in `canvas-crash-recovery.ts` still requests recovery only when structural health is bad (`tickerStarted === false` or `canvasConnected === false`).
4. `getHealthStatus()` in `game-canvas-runtime.ts` still exposes only structural health, so recovery cannot distinguish "healthy runtime" from "ticker still running after a contained render-loop failure."
5. The current fence architecture from Spec 69 is still valuable. Sliding-window detection should remain in place; this ticket must not regress or replace it.

## Architecture Check

1. The proposed change is beneficial relative to the current architecture. The present design distinguishes only "healthy" and "hard failed." It has no concept of "degraded after a contained render-loop fault," which is exactly the missing state for this bug.
2. The corruption signal belongs on the runtime-owned health surface, not inside the recovery module. Recovery should remain generic and react to health; it should not own or infer Pixi runtime semantics.
3. The shared health contract should live in its own small module, not in either `canvas-crash-recovery.ts` or `game-canvas-runtime.ts`. Making the runtime import a type from its consumer would invert ownership and make the layering worse.
4. The signal should remain narrowly scoped: a boolean suspicion flag derived from contained ticker errors. Do not broaden this ticket into a general probe framework; active verification belongs to 71CANCRASH-005.

## What to Change

### 1. Extend `TickerErrorFence` interface and implementation in `ticker-error-fence.ts`

- Add `isRenderCorruptionSuspected(): boolean` to the `TickerErrorFence` interface.
- Track a `renderCorruptionSuspected` flag internally:
  - Set to `true` after ANY contained error (even a single one that doesn't reach the consecutive threshold).
  - Track `successfulTicksSinceError` counter, incremented on each successful tick.
  - Reset `renderCorruptionSuspected` to `false` only after N consecutive successful ticks (default: 10, configurable via `TickerErrorFenceOptions.corruptionClearThreshold`).
- Return `isRenderCorruptionSuspected` in the returned fence object.

### 2. Consolidate `CanvasRuntimeHealthStatus` type

- Create a small shared module, `packages/runner/src/canvas/canvas-runtime-health.ts`.
- Move `CanvasRuntimeHealthStatus` there.
- `canvas-crash-recovery.ts`, `game-canvas-runtime.ts`, and any tests that import the type must import from the shared module.
- Add `renderCorruptionSuspected: boolean` to the type.

### 3. Extend heartbeat in `canvas-crash-recovery.ts`

- In the heartbeat interval callback, after the existing `tickerStarted && canvasConnected` check, add:
  ```typescript
  if (healthStatus.renderCorruptionSuspected) {
    requestRecovery('Canvas runtime heartbeat detected render corruption. Starting recovery.', healthStatus);
    return;
  }
  ```

### 4. Wire fence corruption flag into `getHealthStatus()` in `game-canvas-runtime.ts`

- Store the `tickerErrorFence` reference so `getHealthStatus()` can access it.
- In `getHealthStatus()`, add `renderCorruptionSuspected: tickerErrorFence.isRenderCorruptionSuspected()` to the returned object.

## Files to Touch

- `packages/runner/src/canvas/ticker-error-fence.ts` (modify)
- `packages/runner/src/canvas/canvas-runtime-health.ts` (create)
- `packages/runner/src/canvas/canvas-crash-recovery.ts` (modify)
- `packages/runner/src/canvas/game-canvas-runtime.ts` (modify)
- `packages/runner/test/canvas/ticker-error-fence.test.ts` (modify)
- `packages/runner/test/canvas/canvas-crash-recovery.test.ts` (modify)
- `packages/runner/test/canvas/GameCanvas.test.ts` (modify)
- `packages/runner/test/canvas/GameCanvas.recovery.test.tsx` (modify as needed for the expanded health contract import)

## Out of Scope

- Changes to `texture-pool-patch.ts` (71CANCRASH-001).
- Changes to `safe-destroy.ts` or `text-runtime.ts` (71CANCRASH-002).
- Changes to `create-app.ts` (71CANCRASH-004).
- Creating the render health probe (71CANCRASH-005).
- Changes to the engine package.
- Adding telemetry or error reporting infrastructure.

## Acceptance Criteria

### Tests That Must Pass

1. **Corruption flag set on single error**: After a single contained error (below consecutive threshold), `isRenderCorruptionSuspected()` returns `true`.
2. **Corruption flag cleared after N successful ticks**: After the configured threshold of consecutive successful ticks, `isRenderCorruptionSuspected()` returns `false`.
3. **Corruption flag reset on new error**: If an error occurs during the clearing countdown, the counter resets and the flag remains `true`.
4. **Heartbeat triggers recovery on corruption**: When `getHealthStatus()` returns `renderCorruptionSuspected: true` (even with `tickerStarted: true` and `canvasConnected: true`), the heartbeat triggers recovery.
5. **Heartbeat does NOT trigger on healthy state**: When all three fields are healthy, no recovery triggers.
6. **Type consolidation**: `CanvasRuntimeHealthStatus` is defined exactly once in `canvas-runtime-health.ts` and imported by both runtime and recovery code — no duplicate declaration.
7. Existing suite: `pnpm -F @ludoforge/runner test` passes.
8. Typecheck: `pnpm -F @ludoforge/runner typecheck` passes.
9. Lint: `pnpm -F @ludoforge/runner lint` passes.

### Invariants

1. A single contained ticker error is sufficient to mark the renderer as corruption-suspected.
2. The corruption flag is only cleared by consecutive successful ticks, never by time alone.
3. The heartbeat triggers recovery on `renderCorruptionSuspected: true` regardless of `tickerStarted` and `canvasConnected` values.
4. `CanvasRuntimeHealthStatus` is defined in exactly one shared contract file.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/ticker-error-fence.test.ts` — Add tests for corruption flag lifecycle (set, clear after N ticks, reset on new error) without regressing the existing sliding-window behavior.
2. `packages/runner/test/canvas/canvas-crash-recovery.test.ts` — Add test for heartbeat triggering recovery on `renderCorruptionSuspected: true`.
3. `packages/runner/test/canvas/GameCanvas.test.ts` — Update runtime health expectations for the expanded health status object.
4. `packages/runner/test/canvas/GameCanvas.recovery.test.tsx` — Update any health status fixtures/imports to use the shared contract.

### Commands

1. `pnpm -F @ludoforge/runner test -- ticker-error-fence`
2. `pnpm -F @ludoforge/runner test -- canvas-crash-recovery`
3. `pnpm -F @ludoforge/runner test -- GameCanvas`
4. `pnpm -F @ludoforge/runner typecheck`
5. `pnpm -F @ludoforge/runner lint`
6. `pnpm -F @ludoforge/runner test`

## Outcome

- Completed: 2026-03-21
- What actually changed:
  - Added `renderCorruptionSuspected` to the runtime health contract.
  - Extended `TickerErrorFence` to expose `isRenderCorruptionSuspected()` and to clear the suspicion flag only after a configurable number of consecutive successful ticks.
  - Extended heartbeat recovery so a structurally healthy but corruption-suspected runtime still triggers recovery.
  - Consolidated `CanvasRuntimeHealthStatus` into a dedicated shared module: `packages/runner/src/canvas/canvas-runtime-health.ts`.
  - Strengthened runner tests around the corruption suspicion lifecycle and heartbeat behavior.
- Deviations from original plan:
  - The original draft proposed making `canvas-crash-recovery.ts` the canonical home of `CanvasRuntimeHealthStatus`. That was not implemented because it would invert ownership and make the runtime import a consumer-owned contract. A dedicated shared module is cleaner and more extensible.
  - The original draft treated the fence as consecutive-threshold-only. The implementation preserved the existing sliding-window detector from Spec 69 and layered the suspicion signal on top of it.
- Verification results:
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner lint`
  - `pnpm -F @ludoforge/runner test`
