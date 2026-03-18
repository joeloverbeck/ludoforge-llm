# 68RUNPRESLIFE-003: Centralize Canvas Commit and Disposal Lifecycle

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: None — runner-only
**Deps**: archive/tickets/RUNPRESLIFE/68RUNPRESLIFE-001-presentation-scene-contract.md, archive/tickets/RUNPRESLIFE/68RUNPRESLIFE-002-retained-text-runtime.md, archive/tickets/RUNPRESLIFE/68RUNPRESLIFE-006-complete-scene-migration-for-tokens-and-announcements.md, archive/tickets/RENDERLIFE-001.md

## Problem

The runner currently mixes three concerns in hot paths:

- scene/state diffing
- live Pixi tree mutation
- deferred teardown / error fallback

`createCanvasUpdater()` applies snapshots directly into renderers, renderers enqueue stale containers into `createDisposalQueue()`, and `safe-destroy.ts` catches failures after the fact. That helped with one prior disposal bug, but it still leaves lifecycle ordering implicit and difficult to prove against Pixi’s text and texture systems.

## Assumption Reassessment (2026-03-18)

1. Deferred disposal already exists, but it is container-oriented rather than scene-transaction-oriented — confirmed in `packages/runner/src/canvas/renderers/disposal-queue.ts`.
2. The runner currently mutates live Pixi objects directly from store and position subscriptions without a single commit boundary — confirmed in `packages/runner/src/canvas/canvas-updater.ts`.
3. `safeDestroyDisplayObject()` and `neutralizeDisplayObject()` are still expected parts of normal teardown behavior in multiple renderers, which means fallback logic is still part of the everyday architecture rather than an exceptional boundary — confirmed by imports across runner canvas renderers.
4. Archived ticket `68RUNPRESLIFE-001` introduced a partial scene boundary, not a fully complete one. Token layout/grouping and action-announcement scene nodes still need to land before commit/disposal can be considered the canonical boundary for all hot-path presentation surfaces.

## Architecture Check

1. A centralized commit/disposal lifecycle is cleaner than multiple renderer-local update and teardown rules. It creates one place to guarantee ordering: derive scene, diff scene, commit additions/updates, park stale nodes, then finalize destruction after a safe boundary.
2. This remains fully runner-only and presentation-only. `GameDef` and simulation do not gain any presentation lifecycle knowledge.
3. No backwards-compatibility shim should preserve direct renderer-managed disposal. Once the lifecycle runtime exists, renderers should stop calling `safeDestroy*` in ordinary flows.
4. The commit runtime should operate on the complete canonical scene, not a half-scene plus store-driven exceptions. This ticket should assume the scene migration ticket lands first.

## What to Change

### 1. Introduce a commit-phase runtime

Add a central canvas commit layer that owns:

- applying scene diffs
- sequencing geometry updates before visibility flips
- parking stale nodes instead of immediate destroy
- retiring parked nodes only after the commit boundary

This commit layer should sit between `CanvasUpdater` and renderer backends.

### 2. Narrow disposal to an exceptional boundary

Refactor `safe-destroy.ts` and `disposal-queue.ts` so that:

- normal node retirement uses the commit runtime’s canonical path
- `safeDestroyDisplayObject()` becomes an emergency fallback, not an expected steady-state mechanism
- ordinary renderer code no longer calls fallback helpers directly

### 3. Add lifecycle integration coverage

Add integration tests that repeatedly mount, update, unmount, and remount the runner while:

- toggling animations
- changing overlays
- changing token stacks and card faces
- updating FITL board state

Those tests should assert zero unexpected destroy fallbacks and zero console errors.

## Files to Touch

- `packages/runner/src/canvas/canvas-updater.ts` (modify)
- `packages/runner/src/canvas/GameCanvas.tsx` (modify)
- `packages/runner/src/canvas/renderers/disposal-queue.ts` (modify or replace)
- `packages/runner/src/canvas/renderers/safe-destroy.ts` (modify)
- `packages/runner/src/canvas/renderers/*` (modify)
- `packages/runner/test/canvas/GameCanvas.test.ts` (modify)
- `packages/runner/test/canvas/renderers/disposal-queue.test.ts` (modify)
- new canvas lifecycle integration tests under `packages/runner/test/canvas/` (new)

## Out of Scope

- game-specific FITL rendering tweaks
- visual-config schema authoring by itself
- screenshot refresh

## Acceptance Criteria

### Tests That Must Pass

1. Canvas lifecycle integration tests prove repeated mount/update/unmount cycles complete without console errors or unexpected fallback destroys.
2. Normal renderer flows no longer call `safeDestroy*` directly for ordinary node retirement.
3. Existing suite: `pnpm -F @ludoforge/runner test`
4. Existing suite: `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. The runner has exactly one canonical commit/disposal boundary.
2. Fallback destroy logic is exceptional, observable, and test-failing when it appears in normal flows.
3. Presentation lifecycle remains game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/canvas-lifecycle.test.ts` — repeated mount/update/unmount stress
2. `packages/runner/test/canvas/renderers/disposal-queue.test.ts` — narrowed fallback semantics
3. `packages/runner/test/canvas/GameCanvas.test.ts` — commit-phase ordering and cleanup

### Commands

1. `pnpm -F @ludoforge/runner test -- canvas-lifecycle.test.ts disposal-queue.test.ts GameCanvas.test.ts`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`
