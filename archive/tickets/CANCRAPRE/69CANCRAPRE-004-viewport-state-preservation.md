# 69CANCRAPRE-004: Viewport State Preservation on Crash Recovery

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: Spec 69, 69CANCRAPRE-003

## Problem

When crash recovery destroys and recreates the `GameCanvasRuntime`, the viewport state is lost. The user sees the board snap back to the default view, which is disorienting after a crash that should be as transparent as possible.

## Assumption Reassessment (2026-03-20)

1. `GameCanvasRuntime` currently exposes `coordinateBridge`, `setInteractionHighlights()`, and `destroy()`. No viewport snapshot method exists. **Confirmed**.
2. The viewport is created via `setupViewport()` and is owned by the runtime. **Confirmed**.
3. `GameCanvas.tsx` recovery flow re-creates the runtime without capturing or restoring viewport state. **Confirmed**.
4. `GameCanvasRuntimeOptions` does not currently have an `initialViewport` field. **Confirmed**.

## Architecture Check

1. `ViewportSnapshot` should be a read-only value object.
2. The runtime should own both capture and restore. `GameCanvas` should only shuttle the snapshot across the remount boundary.
3. `getViewportSnapshot()` on `GameCanvasRuntime` is a side-effect-free getter.
4. `initialViewport` on `GameCanvasRuntimeOptions` is optional, so non-recovery creation paths remain unchanged.

## What to Change

### 1. Define `ViewportSnapshot`

```typescript
export interface ViewportSnapshot {
  readonly x: number;
  readonly y: number;
  readonly scaleX: number;
  readonly scaleY: number;
}
```

### 2. Add `getViewportSnapshot()` to `GameCanvasRuntime`

Read the runtime-owned viewport position and scale. Return `null` when the runtime is unavailable or destroyed.

### 3. Add `initialViewport` to `GameCanvasRuntimeOptions`

When provided, `createGameCanvasRuntime()` restores the viewport after creation.

### 4. Capture and restore in `GameCanvas.tsx`

- before destroying the old runtime during recovery, call `getViewportSnapshot()` and store the result in a ref
- pass the stored snapshot as `initialViewport` when creating the new runtime
- clear the ref after a successful recovery mount

## Files to Touch

- `packages/runner/src/canvas/game-canvas-runtime.ts` (modify)
- `packages/runner/src/canvas/GameCanvas.tsx` (modify)
- `packages/runner/test/canvas/GameCanvas.test.ts` (modify)
- `packages/runner/test/canvas/GameCanvas.recovery.test.tsx` (modify)

## Out of Scope

- `safe-destroy.ts` changes (ticket 001)
- `ticker-error-fence.ts` changes (ticket 002)
- Store changes
- Any engine package files

## Acceptance Criteria

### Tests That Must Pass

1. `getViewportSnapshot()` returns current `{ x, y, scaleX, scaleY }`.
2. `getViewportSnapshot()` returns `null` when the runtime has been destroyed.
3. `createGameCanvasRuntime()` with `initialViewport` restores the viewport position and scale.
4. `createGameCanvasRuntime()` without `initialViewport` keeps the default behavior.
5. `GameCanvas.tsx` captures viewport snapshot before destroying the old runtime during recovery.
6. `GameCanvas.tsx` passes the captured snapshot to the new runtime as `initialViewport`.

### Invariants

1. `ViewportSnapshot` is immutable.
2. The viewport snapshot remains a transient canvas-layer value, not a store concern.
3. Non-recovery runtime creation is unaffected.
4. Recovery still proceeds when no snapshot is available.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/GameCanvas.test.ts` — add runtime-level viewport snapshot capture/restore coverage.
2. `packages/runner/test/canvas/GameCanvas.recovery.test.tsx` — add recovery-flow coverage proving snapshots are captured before destroy and passed into the recreated runtime.

### Commands

1. `pnpm -F @ludoforge/runner exec vitest run test/canvas/GameCanvas.test.ts test/canvas/GameCanvas.recovery.test.tsx`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completion date: 2026-03-20
- What actually changed:
  - introduced `ViewportSnapshot` plus `getViewportSnapshot()` on `GameCanvasRuntime`
  - added optional `initialViewport` restoration during runtime creation
  - updated `GameCanvas` to capture the viewport before recovery teardown and restore it on the recreated runtime
  - expanded `GameCanvas.test.ts` and `GameCanvas.recovery.test.tsx` with viewport capture and restore coverage
- Deviations from original plan:
  - none beyond the runtime-health work in Ticket 003 sharing the same runtime interface surface
- Verification results:
  - `pnpm -F @ludoforge/runner exec vitest run test/canvas/GameCanvas.test.ts test/canvas/GameCanvas.recovery.test.tsx`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner lint`
