# 70BITFONLEA-003: Measure and Mitigate Initialization Chrome Violations

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small–Medium
**Engine Changes**: None — runner-only
**Deps**: 70BITFONLEA-001, 70BITFONLEA-002

## Problem

During game initialization, Chrome emits `'message' handler took 150ms` and `'requestAnimationFrame' handler took 61–99ms` violation warnings. The `setAndDerive()` function in `game-store.ts` performs three expensive synchronous operations inside a single Zustand `set()` callback:

1. `deriveStoreRunnerProjection()` — O(zones × tokens + cards) traversal
2. `deriveStoreWorldLayout()` — ForceAtlas2 layout computation
3. `projectRenderModel()` — second full traversal of game state

This creates a 3–4 frame stall for FITL (10+ zones, 20–50 tokens, 117 event cards).

**This ticket is measurement-gated**: the font leak fix in tickets 001 + 002 may itself reduce handler times below the violation threshold, since dynamic font generation is expensive per-tick work. Implementation of the deferral only proceeds if violations persist.

## Assumption Reassessment (2026-03-21)

1. `setAndDerive()` in `game-store.ts` (lines 690–709) calls `deriveStoreRunnerProjection()`, `deriveStoreWorldLayout()`, and `projectRenderModel()` synchronously inside a single `set()` callback — **confirmed**.
2. `projectRenderModel()` depends on `runnerProjection` being non-null — **confirmed** (guarded by null check at line 705).
3. The canvas updater subscribes to store changes with equality selectors — **confirmed** (it will pick up deferred updates on next tick).
4. `deriveStoreWorldLayout()` depends only on `gameDef` and `visualConfigProvider`, not on `runnerProjection` — **confirmed**.

## Architecture Check

1. Deferring `projectRenderModel()` via `queueMicrotask()` splits the work across two event loop turns without changing the data flow — the render model still arrives before the next `requestAnimationFrame`.
2. The store state will briefly lack `renderModel` between the two microtasks. This is safe because the canvas updater uses equality selectors that tolerate null → value transitions.
3. No backwards-compatibility shims — the synchronous path is simply replaced.

## What to Change

### 1. Measurement Protocol (mandatory before any code changes)

After 70BITFONLEA-001 and 70BITFONLEA-002 are merged:

1. Run `pnpm -F @ludoforge/runner dev`
2. Open Chrome DevTools console
3. Verify: no `"dynamically created N bitmap fonts"` warnings
4. Check: are `requestAnimationFrame` violations still > 50ms?
5. Check: is `message` handler violation still > 100ms?
6. Document results in this ticket file (update the Measurement Results section below).

**If violations are ≤ 50ms / ≤ 100ms respectively**: mark this ticket WONTFIX — the font leak fix resolved the performance issue.

**If violations persist**: proceed to step 2.

### 2. Defer `projectRenderModel()` via `queueMicrotask()`

**File**: `packages/runner/src/store/game-store.ts`

In `setAndDerive()`, remove `projectRenderModel()` from the synchronous `set()` callback. Instead:

1. Inside the `set()` callback, return `renderModel: null` (or retain the previous `current.renderModel` for one tick).
2. After the `set()` call returns, schedule a microtask:
   ```typescript
   queueMicrotask(() => {
     const { runnerProjection } = get();
     if (runnerProjection === null) return;
     const renderModel = projectRenderModel(runnerProjection, visualConfigProvider, get().renderModel);
     set({ renderModel });
   });
   ```
3. This ensures `deriveStoreRunnerProjection()` and `deriveStoreWorldLayout()` remain synchronous (required for state consistency), while the render model projection runs in a separate microtask.

## Measurement Results

_(To be filled after 70BITFONLEA-001 and 70BITFONLEA-002 are complete)_

- `requestAnimationFrame` violation duration: ___ms
- `message` handler violation duration: ___ms
- Decision: PROCEED / WONTFIX

## Files to Touch

- `packages/runner/src/store/game-store.ts` (modify — only if measurement shows violations persist)

## Out of Scope

- Font name changes — completed in 70BITFONLEA-001.
- Style caching — completed in 70BITFONLEA-002.
- Typed BitmapText font-contract cleanup — handled separately in `70BITFONLEA-004`.
- Refactoring `deriveStoreRunnerProjection()` or `deriveStoreWorldLayout()` internals.
- Any changes to canvas updater subscription logic.
- Adding `performance.mark()` / `performance.measure()` instrumentation (nice-to-have but not in scope).
- Any engine (`packages/engine/`) changes.
- Any changes to `bitmap-font-registry.ts` or `table-overlay-renderer.ts`.

## Acceptance Criteria

### Tests That Must Pass

1. **New** (only if deferral is implemented): Store test — after `setAndDerive()` returns, `renderModel` is initially null/stale; after microtask flush, `renderModel` is populated with correct projection.
2. **New** (only if deferral is implemented): Store test — when `runnerProjection` is null, the deferred microtask does not set `renderModel`.
3. **Existing**: All tests in `packages/runner/test/store/` pass.
4. **Existing**: `pnpm -F @ludoforge/runner test` passes.

### Invariants

1. `deriveStoreRunnerProjection()` and `deriveStoreWorldLayout()` remain synchronous inside `set()` — they are required for state consistency.
2. The canvas updater must tolerate a one-microtask delay for `renderModel` without visual artifacts or errors.
3. `pnpm turbo typecheck` and `pnpm turbo lint` pass with zero errors.
4. If measurement shows violations are resolved by tickets 001+002, **no code changes are made** and this ticket is marked WONTFIX.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/store/game-store.test.ts` — add "deferred render model projection" tests (only if deferral is implemented):
   - "renderModel is populated after microtask flush"
   - "deferred projection is skipped when runnerProjection is null"

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

### Manual Verification

1. Run `pnpm -F @ludoforge/runner dev`, open browser console:
   - Confirm: no `"dynamically created N bitmap fonts"` warnings
   - Confirm: Chrome Violation warnings reduced or eliminated
   - Confirm: canvas renders correctly with zone labels, token badges, and table overlays
   - Confirm: no visual flash/flicker during game initialization (render model arrives before first paint)
