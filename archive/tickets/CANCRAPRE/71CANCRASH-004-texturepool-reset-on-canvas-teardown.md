# 71CANCRASH-004: Layer 3 — TexturePool Reset on Canvas Teardown

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

When crash recovery tears down the canvas and rebuilds it, the PixiJS `TexturePool` singleton retains corrupted state from the previous session. The rebuilt `Application` inherits dirty pool data, causing the crash to recur immediately after recovery.

## Assumption Reassessment (2026-03-21)

1. `GameCanvas.destroy()` in `packages/runner/src/canvas/create-app.ts` currently calls `app.destroy(true, { children: true, texture: true })` and does not clear any PixiJS-global pool state afterward — confirmed.
2. `TexturePool` is exported from the installed `pixi.js` v8.17.1 package as a singleton object, and `TexturePool.clear()` exists — confirmed against the local dependency, not left as an implementation-time assumption.
3. `GameCanvas.destroy()` is invoked from `destroyCanvasPipeline()` in `packages/runner/src/canvas/game-canvas-runtime.ts`, and that call remains the final step in the runner-owned teardown sequence — confirmed.
4. Existing runner tests already cover `createGameCanvas()` construction and deep destroy flags in `packages/runner/test/canvas/create-app.test.ts`, but they do not yet prove any post-`app.destroy()` global cleanup invariant — confirmed gap.

## Architecture Check

1. Resetting `TexturePool` inside `GameCanvas.destroy()` is cleaner than scattering Pixi-global cleanup into recovery orchestration code. `create-app.ts` owns `Application` lifetime, so it should also own teardown of Pixi global state that must not survive that lifetime.
2. This change complements the existing runner-owned destroy-path hardening from 71CANCRASH-001. It is not a replacement for those invariants; it is a teardown boundary guarantee for the next `Application`.
3. This remains runner-only. No engine, schema, or game-specific logic is involved.
4. No backwards-compatibility shims or aliasing are needed. The current architecture should converge on one teardown truth: once a `GameCanvas` is destroyed, the next canvas starts from a clean Pixi texture-pool state.
5. If future work reveals more Pixi-global teardown requirements, the follow-up architectural move should be a dedicated runner-owned teardown helper. This ticket does not justify broadening scope beyond `TexturePool`.

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

- `packages/runner/src/canvas/create-app.ts` (modify — add import + teardown cleanup)
- `packages/runner/test/canvas/create-app.test.ts` (modify — add destroy ordering and cleanup coverage)

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
3. **Existing destroy flags preserved**: `app.destroy(true, { children: true, texture: true })` still uses the same deep-cleanup options.
4. Targeted suite: the `create-app` canvas tests pass.
5. Existing suite: `pnpm -F @ludoforge/runner test` passes.
6. Typecheck: `pnpm -F @ludoforge/runner typecheck` passes.
7. Lint: `pnpm -F @ludoforge/runner lint` passes.

### Invariants

1. `TexturePool.clear()` runs as the last step of `GameCanvas.destroy()`, after `app.destroy()`.
2. The `GameCanvas` interface and `createGameCanvas` function signature remain unchanged.
3. No other PixiJS singletons are modified during teardown.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/create-app.test.ts` — add coverage proving `destroy()` keeps the existing deep-cleanup flags and then calls `TexturePool.clear()` strictly afterward.

### Commands

1. `pnpm -F @ludoforge/runner exec vitest run test/canvas/create-app.test.ts`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner lint`
4. `pnpm -F @ludoforge/runner test`

## Outcome

- Completion date: 2026-03-21
- What actually changed: `GameCanvas.destroy()` in `packages/runner/src/canvas/create-app.ts` now clears `TexturePool` immediately after `app.destroy(true, { children: true, texture: true })`, keeping teardown ownership at the app-lifecycle boundary.
- Test coverage added: `packages/runner/test/canvas/create-app.test.ts` now proves both the existing deep-cleanup flags and the ordering invariant that `TexturePool.clear()` runs strictly after `app.destroy()`.
- Deviations from original plan: The core implementation stayed aligned with the proposal, but the ticket itself was corrected first to match the real file layout, confirmed PixiJS API surface, existing test coverage, and required lint verification.
- Verification results:
  - `pnpm -F @ludoforge/runner exec vitest run test/canvas/create-app.test.ts`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner lint`
  - `pnpm -F @ludoforge/runner test`
