# 68CANLIFCRARES-002: Implement double-RAF disposal queue

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: archive/tickets/RUNPRESLIFE/68CANLIFCRARES-001-remove-texture-null-from-neutralize-and-fallback.md

## Problem

The current disposal queue defers `destroy()` by a single `requestAnimationFrame`. This is insufficient: PixiJS may still hold internal GPU references (e.g. `CanvasTextSystem` text cache) from the previous render pass. A single-RAF defer means the destroy can execute in the same RAF tick as or immediately after PixiJS's render pass, before PixiJS has fully cleared its internal references.

The fix: replace the single-RAF schedule with a double-RAF (nested `requestAnimationFrame`) strategy. This guarantees at least one full render cycle passes with the object absent from the scene graph before `destroy()` is called.

## Assumption Reassessment (2026-03-20)

1. `createDisposalQueue` at `disposal-queue.ts:17` defaults `scheduleFlush` to `(fn) => requestAnimationFrame(fn)` — single RAF. Confirmed.
2. `scheduleCoalescedFlush` at `disposal-queue.ts:29-38` schedules one callback and coalesces multiple enqueues. The coalescing logic must be preserved.
3. The `DisposalQueue` interface (`enqueue`, `flush`, `destroy`) is consumed by `GameCanvas.tsx`, `token-renderer`, `adjacency-renderer`, `animation-controller`, `timeline-builder`, and `ephemeral-container-factory`. The interface must not change.
4. Existing tests across canvas and animation suites use a `scheduleFlush` override for synchronous or manually-triggered testing. This DI pattern must be preserved because those suites intentionally avoid real RAF timing.
5. The originally proposed focused command `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/canvas/renderers/disposal-queue.test.ts` is inaccurate for this repo. Because `packages/runner/package.json` defines `"test": "vitest run"`, the forwarded `--` form does not reliably express a package-scoped single-file run. Use `pnpm -F @ludoforge/runner exec vitest run test/canvas/renderers/disposal-queue.test.ts --reporter=verbose`.

## Architecture Check

1. Double-RAF is the minimal timing change that ensures PixiJS completes a full render cycle before we destroy the object. Frame N: neutralize. Frame N+1: PixiJS renders without it (clears internal refs). Frame N+2: safe to destroy.
2. Keeping the timing policy encapsulated inside `createDisposalQueue` is architecturally preferable to pushing frame-delay knowledge into renderers or animation code. The queue remains the single lifecycle boundary for deferred destruction.
3. Runner-only change. No kernel/compiler/game-specific impact.
4. No interface changes and no aliasing. `DisposalQueue` consumers remain unaffected while the queue adopts the safer default.

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
5. Existing suite: `pnpm -F @ludoforge/runner lint`

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

1. `pnpm -F @ludoforge/runner exec vitest run test/canvas/renderers/disposal-queue.test.ts --reporter=verbose`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`
4. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completed: 2026-03-20
- What actually changed:
  - Replaced the disposal queue's default single-RAF scheduler with an internal named double-RAF scheduler while preserving the existing `scheduleFlush` dependency-injection hook.
  - Added default-scheduler timing coverage that proves enqueued containers survive the first animation frame and are destroyed on the second.
  - Corrected the ticket's assumption set so it reflects the actual `DisposalQueue` consumers and the repo's focused Vitest command shape.
- Deviations from original plan:
  - No production-facing deviations. The implementation stayed runner-local and left queue coalescing, deduplication, and synchronous `flush()`/`destroy()` semantics unchanged.
  - Test support used a manual fake RAF inside the existing disposal-queue unit file rather than introducing any shared test helper because the scope was narrow.
- Verification results:
  - `pnpm -F @ludoforge/runner exec vitest run test/canvas/renderers/disposal-queue.test.ts --reporter=verbose` ✅
  - `pnpm -F @ludoforge/runner test` ✅
  - `pnpm -F @ludoforge/runner typecheck` ✅
  - `pnpm -F @ludoforge/runner lint` ✅
