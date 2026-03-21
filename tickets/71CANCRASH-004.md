# 71CANCRASH-004: Layer 3 — TexturePool Reset on Canvas Teardown

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

When crash recovery tears down the canvas and rebuilds it, the PixiJS `TexturePool` singleton retains corrupted state from the previous session. The rebuilt `Application` inherits dirty pool data, causing the crash to recur immediately after recovery.

## Assumption Reassessment (2026-03-21)

1. `GameCanvas.destroy()` in `create-app.ts` currently calls `app.destroy(true, { children: true, texture: true })` — confirmed (line 45).
2. `TexturePool` is exported from `pixi.js` as a singleton class with a `clear()` method — this needs verification at implementation time against PixiJS v8.17.x API surface.
3. The `destroy()` method on `GameCanvas` is called from `destroyCanvasPipeline` in `game-canvas-runtime.ts` (line 610), which is the last step in the teardown sequence — confirmed.

## Architecture Check

1. Adding `TexturePool.clear()` after `app.destroy()` is a one-line defensive measure that ensures clean state for any subsequent `Application` instance.
2. This is purely runner canvas teardown — no engine or game-spec changes.
3. No backwards-compatibility concerns; this is additive cleanup.

## What to Change

### 1. Modify `destroy()` in `create-app.ts`

After the existing `app.destroy(true, { children: true, texture: true })` call, add:

```typescript
import { TexturePool } from 'pixi.js';
// ... in destroy():
TexturePool.clear();
```

This flushes all pool state (`_poolKeyHash`, `_texturePool`) so the next `Application` starts with a clean, empty pool. Since `app.destroy()` already ran, the canvas element is removed from DOM — no visual flash.

## Files to Touch

- `packages/runner/src/canvas/create-app.ts` (modify — add import + 1 line in `destroy()`)
- `packages/runner/test/canvas/create-app.test.ts` (modify or create — test that `TexturePool.clear()` is called during destroy)

## Out of Scope

- Changes to `texture-pool-patch.ts` (71CANCRASH-001).
- Changes to `safe-destroy.ts` or `text-runtime.ts` (71CANCRASH-002).
- Changes to `ticker-error-fence.ts`, `canvas-crash-recovery.ts`, or `game-canvas-runtime.ts` (71CANCRASH-003).
- Creating the render health probe (71CANCRASH-005).
- Changes to the engine package.
- Handling WebGL context loss.
- Any changes to the `createGameCanvas` function signature or return type.

## Acceptance Criteria

### Tests That Must Pass

1. **TexturePool cleared on destroy**: After calling `GameCanvas.destroy()`, `TexturePool.clear()` has been invoked (verified via spy/mock).
2. **Destroy order preserved**: `app.destroy()` is called BEFORE `TexturePool.clear()` (not after or concurrently).
3. Existing suite: `pnpm -F @ludoforge/runner test` passes.
4. Typecheck: `pnpm -F @ludoforge/runner typecheck` passes.

### Invariants

1. `TexturePool.clear()` runs as the last step of `GameCanvas.destroy()`, after `app.destroy()`.
2. The `GameCanvas` interface and `createGameCanvas` function signature remain unchanged.
3. No other PixiJS singletons are modified during teardown.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/create-app.test.ts` — Test that `destroy()` calls `TexturePool.clear()` after `app.destroy()`. If this test file doesn't exist yet, create it with a focused test for the destroy path.

### Commands

1. `pnpm -F @ludoforge/runner test -- create-app`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner test`
