# ANIMPIPE-003: Granular error handling + forceFlush

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

`processTrace` in `animation-controller.ts` wraps the entire pipeline (descriptor mapping + timeline building + enqueueing) in a single try/catch. One failure in any step kills ALL animations for that trace. There is also no recovery mechanism when the animation pipeline gets stuck.

## Assumption Reassessment (2026-02-20)

1. `processTrace` has a single try/catch at lines ~81-123 — confirmed by reading animation-controller.ts.
2. `AnimationQueue` interface has no `forceFlush` method — confirmed.
3. The `onError` callback exists and is called with error message — confirmed.

## Architecture Check

1. Splitting the try/catch into two separate blocks (mapping vs timeline building) isolates failures without adding complexity.
2. `forceFlush` provides a simple recovery path — kill all queued timelines and reset state.
3. No backwards-compatibility shims. The error handling restructure is internal.

## What to Change

### 1. Split error handling in processTrace

Modify `packages/runner/src/animation/animation-controller.ts`:

```typescript
// Outer: mapping
let descriptors;
try {
  descriptors = deps.traceToDescriptors(...);
} catch (error) {
  deps.onError('Descriptor mapping failed.', error);
  return;
}
// Inner: timeline
try {
  const timeline = deps.buildTimeline(descriptors, ...);
  queue.enqueue(timeline);
} catch (error) {
  deps.onError('Timeline build failed.', error);
}
```

### 2. Add forceFlush to AnimationQueue

Modify `packages/runner/src/animation/animation-queue.ts`:

- Add `forceFlush(): void` method
- Kills all queued timelines (clear queue array, kill active timeline)
- Calls the `onAllComplete` callback to notify watchers
- Sets `animationPlaying` to false via store

### 3. Add forceFlush to AnimationController

Modify `packages/runner/src/animation/animation-controller.ts`:

- Add `forceFlush(): void` to `AnimationController` interface
- Delegates to `queue.forceFlush()`

## Files to Touch

- `packages/runner/src/animation/animation-controller.ts` (modify)
- `packages/runner/src/animation/animation-queue.ts` (modify)
- `packages/runner/test/animation/animation-controller.test.ts` (modify)
- `packages/runner/test/animation/animation-queue.test.ts` (modify — if exists, else new)

## Out of Scope

- Subscriber ordering (ANIMPIPE-002)
- Canvas-ready gating (ANIMPIPE-002)
- Stagger/parallel sequencing (ANIMPIPE-004)

## Acceptance Criteria

### Tests That Must Pass

1. `traceToDescriptors` throws → error reported via `onError`, future traces still processed
2. `buildTimeline` throws → error reported via `onError`, future traces still processed
3. `forceFlush()` empties queue, kills active timeline
4. `forceFlush()` sets `animationPlaying` to false
5. After `forceFlush()`, new traces can be processed normally
6. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. A failure in one animation step never prevents processing of subsequent traces
2. `forceFlush` always leaves the pipeline in a clean, recoverable state

## Test Plan

### New/Modified Tests

1. `packages/runner/test/animation/animation-controller.test.ts` — add granular error handling tests, forceFlush tests
2. `packages/runner/test/animation/animation-queue.test.ts` — add forceFlush tests if queue has a separate test file

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/animation/animation-controller.test.ts`
2. `pnpm -F @ludoforge/runner test && pnpm -F @ludoforge/runner typecheck`
