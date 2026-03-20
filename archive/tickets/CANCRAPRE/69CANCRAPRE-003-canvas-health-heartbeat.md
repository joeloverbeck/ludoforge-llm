# 69CANCRAPRE-003: Canvas Health Heartbeat

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: Spec 69, 69CANCRAPRE-002

## Problem

There are failure modes where the canvas becomes unhealthy without crossing the ticker fence threshold. That can happen if Pixi stops advancing, if the canvas element is detached, or if the runtime otherwise enters a dead state after a contained error. The current recovery path is purely reactive to explicit `handleCrash()` calls.

## Assumption Reassessment (2026-03-20)

1. `canvas-crash-recovery.ts` exports `createCanvasCrashRecovery()` returning `{ handleCrash, destroy }`. It has no heartbeat or proactive detection. **Confirmed**.
2. `CanvasCrashRecoveryOptions` currently has `store`, `onRecoveryNeeded`, and `logger`. No health polling surface exists. **Confirmed**.
3. `GameCanvas.tsx` creates crash recovery in the effect, wires `onError` to `crashRecovery.handleCrash`, and cleans up via `crashRecovery.destroy()`. **Confirmed**.
4. The crash recovery uses a `recoveryRequested` guard to prevent duplicate recovery. **Confirmed**.
5. The original ticket proposed passing raw Pixi ticker and DOM element references into crash recovery. That would leak runtime internals into the recovery module and make re-mount handling more fragile. **Architecture correction**.

## Architecture Check

1. A periodic heartbeat is the correct safety net.
2. The recovery module should consume a sanitized runtime health surface, not raw Pixi and DOM objects.
3. `GameCanvasRuntime` should own the Pixi-specific health check and expose a simple getter such as `getHealthStatus()`.
4. Configurable timers enable deterministic testing.

## What to Change

### 1. Add a runtime health surface

Extend `GameCanvasRuntime` with a read-only health getter:

```typescript
export interface CanvasRuntimeHealthStatus {
  readonly tickerStarted: boolean;
  readonly canvasConnected: boolean;
}
```

`getHealthStatus()` should return the current runtime health without exposing Pixi internals outside the runtime module.

### 2. Extend `CanvasCrashRecoveryOptions`

Add:
- `getHealthStatus?: () => CanvasRuntimeHealthStatus | null`
- `heartbeatIntervalMs?: number` — default 5000, `0` disables
- timer injection hooks if needed for deterministic tests

### 3. Add heartbeat polling to `createCanvasCrashRecovery()`

- start a heartbeat when `heartbeatIntervalMs > 0` and `getHealthStatus` is provided
- trigger recovery when `tickerStarted === false` or `canvasConnected === false`, unless recovery is already in flight
- `destroy()` clears the timer

### 4. Wire heartbeat in `GameCanvas.tsx`

Pass `getHealthStatus: () => runtimeRef.current?.getHealthStatus() ?? null` into crash recovery so the recovery module always polls the current runtime instance.

## Files to Touch

- `packages/runner/src/canvas/canvas-crash-recovery.ts` (modify)
- `packages/runner/src/canvas/GameCanvas.tsx` (modify)
- `packages/runner/src/canvas/game-canvas-runtime.ts` (modify)
- `packages/runner/test/canvas/canvas-crash-recovery.test.ts` (modify)
- `packages/runner/test/canvas/GameCanvas.recovery.test.tsx` (modify)

## Out of Scope

- `safe-destroy.ts` changes (ticket 001)
- `ticker-error-fence.ts` changes (ticket 002)
- Viewport snapshot/restore (ticket 004)
- Any engine package files
- Store changes beyond existing crash lifecycle actions

## Acceptance Criteria

### Tests That Must Pass

1. Heartbeat detects `tickerStarted === false` and triggers recovery.
2. Heartbeat detects `canvasConnected === false` and triggers recovery.
3. Heartbeat does NOT trigger recovery if `recoveryRequested` is already true.
4. Heartbeat timer is cleared on `destroy()`.
5. Heartbeat is disabled when `heartbeatIntervalMs: 0`.
6. Heartbeat is not created when `getHealthStatus` is absent.
7. Existing `handleCrash()` behavior stays intact.
8. `GameCanvas.tsx` passes a runtime-backed health getter into crash recovery.

### Invariants

1. `handleCrash()` behavior is unchanged.
2. The `recoveryRequested` guard prevents multiple recovery triggers regardless of source.
3. `destroy()` is idempotent and always cleans up the timer.
4. Crash recovery does not import Pixi types or reach into Pixi runtime objects directly.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/canvas-crash-recovery.test.ts` — add `describe('heartbeat')` with health-surface polling cases and timer cleanup checks.
2. `packages/runner/test/canvas/GameCanvas.recovery.test.tsx` — verify `GameCanvas` passes a live runtime-backed health getter into crash recovery.

### Commands

1. `pnpm -F @ludoforge/runner exec vitest run test/canvas/canvas-crash-recovery.test.ts test/canvas/GameCanvas.recovery.test.tsx`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completion date: 2026-03-20
- What actually changed:
  - added heartbeat polling to `createCanvasCrashRecovery()`
  - added a sanitized runtime health surface through `GameCanvasRuntime.getHealthStatus()`
  - wired `GameCanvas` to provide a live runtime-backed health getter to crash recovery
  - added heartbeat coverage in `canvas-crash-recovery.test.ts` and `GameCanvas.recovery.test.tsx`
- Deviations from original plan:
  - raw Pixi ticker and canvas references were not exposed to the recovery module; the implementation uses a runtime-owned health surface instead
- Verification results:
  - `pnpm -F @ludoforge/runner exec vitest run test/canvas/canvas-crash-recovery.test.ts test/canvas/GameCanvas.recovery.test.tsx`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner lint`
