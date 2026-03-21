# 71CANCRASH-003: Layer 2 — Render Corruption Detection + Heartbeat Integration

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

After a single contained ticker error, the heartbeat check in `canvas-crash-recovery.ts` sees `tickerStarted: true` and `canvasConnected: true` — both remain healthy. There is no signal that PixiJS's internal rendering state may be corrupted. Recovery never triggers, and the canvas stays permanently blank.

## Assumption Reassessment (2026-03-21)

1. `installTickerErrorFence` returns a `TickerErrorFence` with only a `destroy()` method — confirmed (line 24-26 of `ticker-error-fence.ts`). There is no corruption flag or exposure method.
2. `CanvasRuntimeHealthStatus` has only `tickerStarted` and `canvasConnected` — confirmed (lines 12-15 of `canvas-crash-recovery.ts` and lines 77-80 of `game-canvas-runtime.ts`). Note: the type is declared in BOTH files — they must stay in sync or be consolidated.
3. The heartbeat in `canvas-crash-recovery.ts` only triggers recovery when `tickerStarted` or `canvasConnected` is `false` (line 50) — confirmed.
4. `getHealthStatus()` in `game-canvas-runtime.ts` returns `tickerStarted` and `canvasConnected` only (lines 511-521) — confirmed.

## Architecture Check

1. Adding a `renderCorruptionSuspected` flag to the fence is minimal and non-breaking — the fence already tracks error state internally.
2. Extending `CanvasRuntimeHealthStatus` with `renderCorruptionSuspected` is additive — existing consumers check only `tickerStarted`/`canvasConnected`, so adding a new field is backwards-compatible.
3. The `CanvasRuntimeHealthStatus` type is duplicated in `canvas-crash-recovery.ts` (line 12) and `game-canvas-runtime.ts` (line 77). This ticket must consolidate to a single source of truth to avoid type drift.

## What to Change

### 1. Extend `TickerErrorFence` interface and implementation in `ticker-error-fence.ts`

- Add `isRenderCorruptionSuspected(): boolean` to the `TickerErrorFence` interface.
- Track a `renderCorruptionSuspected` flag internally:
  - Set to `true` after ANY contained error (even a single one that doesn't reach the consecutive threshold).
  - Track `successfulTicksSinceError` counter, incremented on each successful tick.
  - Reset `renderCorruptionSuspected` to `false` only after N consecutive successful ticks (default: 10, configurable via `TickerErrorFenceOptions.corruptionClearThreshold`).
- Return `isRenderCorruptionSuspected` in the returned fence object.

### 2. Consolidate `CanvasRuntimeHealthStatus` type

- The canonical definition stays in `canvas-crash-recovery.ts` (it's the consumer).
- `game-canvas-runtime.ts` imports it from `canvas-crash-recovery.ts` instead of re-declaring it.
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
- `packages/runner/src/canvas/canvas-crash-recovery.ts` (modify)
- `packages/runner/src/canvas/game-canvas-runtime.ts` (modify)
- `packages/runner/test/canvas/ticker-error-fence.test.ts` (modify)
- `packages/runner/test/canvas/canvas-crash-recovery.test.ts` (modify)

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
6. **Type consolidation**: `CanvasRuntimeHealthStatus` is imported from `canvas-crash-recovery.ts` in `game-canvas-runtime.ts` — no duplicate type declaration.
7. Existing suite: `pnpm -F @ludoforge/runner test` passes.
8. Typecheck: `pnpm -F @ludoforge/runner typecheck` passes.

### Invariants

1. A single contained ticker error is sufficient to mark the renderer as corruption-suspected.
2. The corruption flag is only cleared by consecutive successful ticks, never by time alone.
3. The heartbeat triggers recovery on `renderCorruptionSuspected: true` regardless of `tickerStarted` and `canvasConnected` values.
4. `CanvasRuntimeHealthStatus` is defined in exactly one file.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/ticker-error-fence.test.ts` — Add tests for corruption flag lifecycle (set, clear after N ticks, reset on new error).
2. `packages/runner/test/canvas/canvas-crash-recovery.test.ts` — Add test for heartbeat triggering recovery on `renderCorruptionSuspected: true`.

### Commands

1. `pnpm -F @ludoforge/runner test -- ticker-error-fence`
2. `pnpm -F @ludoforge/runner test -- canvas-crash-recovery`
3. `pnpm -F @ludoforge/runner typecheck`
4. `pnpm -F @ludoforge/runner test`
