# 68CANLIFCRARES-002: Implement double-RAF disposal queue

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: 68CANLIFCRARES-001 (neutralize no longer nulls `_texture`)

## Problem

The current disposal queue defers `destroy()` by a single `requestAnimationFrame`. This is insufficient: PixiJS may still hold internal GPU references (e.g. `CanvasTextSystem` text cache) from the previous render pass. A single-RAF defer means the destroy can execute in the same RAF tick as or immediately after PixiJS's render pass, before PixiJS has fully cleared its internal references.

The fix: replace the single-RAF schedule with a double-RAF (nested `requestAnimationFrame`) strategy. This guarantees at least one full render cycle passes with the object absent from the scene graph before `destroy()` is called.

## Assumption Reassessment (2026-03-20)

1. `createDisposalQueue` at `disposal-queue.ts:17` defaults `scheduleFlush` to `(fn) => requestAnimationFrame(fn)` — single RAF. Confirmed.
2. `scheduleCoalescedFlush` at `disposal-queue.ts:29-38` schedules one callback and coalesces multiple enqueues. The coalescing logic must be preserved.
3. The `DisposalQueue` interface (enqueue, flush, destroy) is consumed by `GameCanvas.tsx`, `token-renderer`, `adjacency-renderer`, and `animation-controller`. The interface must not change.
4. Existing tests use a `scheduleFlush` override for synchronous testing. This DI pattern must be preserved.

## Architecture Check

1. Double-RAF is the minimal timing change that ensures PixiJS completes a full render cycle before we destroy the object. Frame N: neutralize. Frame N+1: PixiJS renders without it (clears internal refs). Frame N+2: safe to destroy.
2. Runner-only change. No kernel/compiler/game-specific impact.
3. No interface changes — `DisposalQueue` consumers are unaffected.

## What to Change

### 1. Replace default `scheduleFlush` with double-RAF

In `packages/runner/src/canvas/renderers/disposal-queue.ts`, change the default `scheduleFlush` from a single `requestAnimationFrame` to a nested double-RAF:

```typescript
// Before:
const schedule = options?.scheduleFlush ?? ((fn: () => void) => requestAnimationFrame(fn));

// After:
const defaultSchedule = (fn: () => void): void => {
  requestAnimationFrame(() => {
    requestAnimationFrame(fn);
  });
};
const schedule = options?.scheduleFlush ?? defaultSchedule;
```

The rest of the disposal queue logic (coalescing, Set-based dedup, `destroyed` guard, `flush()`, `destroy()`) remains unchanged.

### 2. Add timing-specific tests

Add tests that verify containers are NOT destroyed after 1 RAF and ARE destroyed after 2 RAFs when using the default schedule.

## Files to Touch

- `packages/runner/src/canvas/renderers/disposal-queue.ts` (modify)
- `packages/runner/test/canvas/renderers/disposal-queue.test.ts` (modify)

## Out of Scope

- Changing `neutralizeDisplayObject` behavior (done in 68CANLIFCRARES-001).
- Adding ticker error fencing (68CANLIFCRARES-003).
- Modifying any store lifecycle code.
- Changing the `DisposalQueue` interface or its consumers.
- Changing `safe-destroy.ts`.
- Changing any engine package files.

## Acceptance Criteria

### Tests That Must Pass

1. `disposal queue > default schedule defers destroy by two animation frames` — new test using fake RAF to verify container survives 1 frame and is destroyed after 2 frames.
2. `disposal queue > containers are not destroyed after a single RAF tick` — explicit assertion that `container.destroyed === false` after one RAF.
3. All existing disposal queue tests continue to pass (enqueue neutralization, dedup, coalescing, flush idempotency, destroy-after-destroy no-op, sync flush override).
4. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. `DisposalQueue` interface (`enqueue`, `flush`, `destroy`) must not change.
2. `scheduleFlush` DI override must continue to work (existing tests use synchronous override).
3. `enqueue` must still call `neutralizeDisplayObject` synchronously (Phase 1 is immediate).
4. `flush()` and `destroy()` must still synchronously destroy all pending containers.
5. Coalescing behavior must be preserved: multiple enqueues before flush produce a single scheduled callback.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/renderers/disposal-queue.test.ts` — add double-RAF timing tests using a fake `requestAnimationFrame` that captures callbacks for manual stepping.

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/canvas/renderers/disposal-queue.test.ts`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`
