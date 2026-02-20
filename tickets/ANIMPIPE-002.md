# ANIMPIPE-002: Fix subscriber ordering + canvas-ready gating

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

In `GameCanvas.tsx`, `animationController.start()` subscribes to the store at line 290, but `canvasUpdater.start()` subscribes at line 412. When Zustand fires, the animation controller processes traces BEFORE canvas updater populates containers — so animations target containers that don't exist yet. Additionally, there is no guard preventing animations from running before the canvas has rendered.

## Assumption Reassessment (2026-02-20)

1. `animationController.start()` is called at line 290 and `canvasUpdater.start()` at line 412 — confirmed by reading GameCanvas.tsx.
2. The lifecycle test at line 652 of `GameCanvas.test.ts` expects `animation-controller-start` before `updater-start` — confirmed, needs updating.
3. `canvasUpdater.start()` applies the initial snapshot synchronously — confirmed by reading canvas-updater.ts.

## Architecture Check

1. Reordering ensures canvas containers exist before animation controller subscribes, following the natural data dependency chain.
2. Canvas-ready gating is a simple boolean guard — no complex state machine or new abstractions needed.
3. No backwards-compatibility shims. The subscriber order changes directly.

## What to Change

### 1. Reorder initialization in GameCanvas.tsx

Move `canvasUpdater.start()` to BEFORE `animationController.start()`:

```
CURRENT:                          NEW:
1. animationController.start()    1. canvasUpdater.start()
2. aiPlaybackController.start()   2. animationController.start()
3. canvasUpdater.start()          3. aiPlaybackController.start()
```

### 2. Add canvas-ready gating

Add `let canvasReady = false` before `canvasUpdater.start()`. Set to `true` after `canvasUpdater.start()`. Pass `isCanvasReady: () => canvasReady` to `createAnimationController`.

### 3. Add `isCanvasReady` option to animation controller

Modify `packages/runner/src/animation/animation-controller.ts`:

- Add optional `isCanvasReady?: () => boolean` to `AnimationControllerOptions`
- At top of `processTrace`, check: if provided and returns false, return early
- Backward compatible — if not provided, gate is skipped

### 4. Update lifecycle tests

Modify `packages/runner/test/canvas/GameCanvas.test.ts`:

- Update lifecycle ordering test to expect `updater-start` before `animation-controller-start`
- Add explicit ordering invariant test

## Files to Touch

- `packages/runner/src/canvas/GameCanvas.tsx` (modify)
- `packages/runner/src/animation/animation-controller.ts` (modify)
- `packages/runner/test/canvas/GameCanvas.test.ts` (modify)
- `packages/runner/test/animation/animation-controller.test.ts` (modify)

## Out of Scope

- Animation queue changes (ANIMPIPE-003)
- Stagger/parallel sequencing (ANIMPIPE-004)
- Preset changes (ANIMPIPE-005-007)

## Acceptance Criteria

### Tests That Must Pass

1. Lifecycle test: `updater-start` fires before `animation-controller-start`
2. `isCanvasReady=false` causes processTrace to return early without processing
3. `isCanvasReady=true` allows processTrace to work normally
4. `isCanvasReady` not provided still works (backward compatibility)
5. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Canvas updater always subscribes before animation controller
2. Animation controller never processes traces when canvas is not ready

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/GameCanvas.test.ts` — update lifecycle ordering test, add ordering invariant
2. `packages/runner/test/animation/animation-controller.test.ts` — add isCanvasReady gating tests

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/canvas/GameCanvas.test.ts`
2. `pnpm -F @ludoforge/runner test && pnpm -F @ludoforge/runner typecheck`
