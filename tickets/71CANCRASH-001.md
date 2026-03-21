# 71CANCRASH-001: Layer 1 — TexturePool Monkey-Patch (Root Cause Fix)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None (first ticket in the series)

## Problem

PixiJS v8.17.1 `TexturePoolClass.returnTexture` crashes with `TypeError: Cannot read properties of undefined (reading 'push')` when a texture's UID is not in `_poolKeyHash` or when the corresponding `_texturePool[key]` bucket is undefined. This is the root cause of the recurring canvas crash that permanently corrupts rendering state.

## Assumption Reassessment (2026-03-21)

1. `TexturePoolClass` is imported from `pixi.js` and its prototype is accessible at import time — confirmed by PixiJS v8 ESM exports.
2. `create-app.ts` creates the `Application` via `new Application()` + `app.init()` — confirmed (lines 27-36). The patch must run before `app.init()`.
3. No existing monkey-patch infrastructure exists in the runner — confirmed by grep; this is a new pattern.

## Architecture Check

1. A targeted prototype patch is the minimal fix for an upstream bug with no known PixiJS fix. It is isolated in one file and documented for removal.
2. This is purely a runner canvas concern — no engine, compiler, or game-spec changes.
3. No backwards-compatibility shims; the patch extends PixiJS behavior defensively.

## What to Change

### 1. Create `texture-pool-patch.ts`

Create `packages/runner/src/canvas/texture-pool-patch.ts`:

- Import `TexturePool` from `pixi.js` (the singleton class that exposes the pool).
- Save a reference to the original `returnTexture` method on the prototype.
- Replace `returnTexture` with a guarded version:
  - If `this._poolKeyHash[texture.uid]` is `undefined`, log a warning and return (texture was never pool-tracked).
  - If `this._texturePool[key]` is `undefined`, lazily create the bucket: `this._texturePool[key] = []`.
  - Call the original `push` logic.
- Check `VERSION` from `pixi.js` — if the major/minor version changes from `8.17`, log a notice suggesting review of whether the upstream bug is fixed.
- Export a `TEXTURE_POOL_PATCH_APPLIED` boolean constant for test assertions.

### 2. Import the patch in `create-app.ts`

Add `import './texture-pool-patch.js';` as the **first import** in `create-app.ts`, before the `Application` import, ensuring the patch runs before any PixiJS application is created.

## Files to Touch

- `packages/runner/src/canvas/texture-pool-patch.ts` (new)
- `packages/runner/src/canvas/create-app.ts` (modify — add 1 import line)
- `packages/runner/test/canvas/texture-pool-patch.test.ts` (new)

## Out of Scope

- Modifying any other PixiJS prototype or internal.
- Changes to `ticker-error-fence.ts`, `canvas-crash-recovery.ts`, or `game-canvas-runtime.ts`.
- Changes to `safe-destroy.ts` or `text-runtime.ts`.
- Changes to the engine package.
- Adding telemetry or error reporting infrastructure.
- Handling WebGL context loss.

## Acceptance Criteria

### Tests That Must Pass

1. **Untracked texture**: Calling `returnTexture` with a texture whose UID is not in `_poolKeyHash` does NOT throw — it silently returns.
2. **Cleared bucket**: Calling `returnTexture` with a texture whose key exists in `_poolKeyHash` but whose `_texturePool[key]` is `undefined` lazily creates the bucket and pushes the texture.
3. **Normal operation**: Calling `returnTexture` with a properly tracked texture pushes it to the existing bucket (original behavior preserved).
4. **Version notice**: When PixiJS version is not `8.17.x`, a notice is logged.
5. Existing suite: `pnpm -F @ludoforge/runner test` passes.
6. Typecheck: `pnpm -F @ludoforge/runner typecheck` passes.

### Invariants

1. The original `TexturePoolClass.prototype.returnTexture` behavior is preserved for all textures that ARE properly tracked in `_poolKeyHash`.
2. The patch is a side-effect import — no runtime code needs to call it explicitly.
3. The patch file is self-contained and can be removed by deleting the file and the import line.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/texture-pool-patch.test.ts` — Unit tests exercising the three scenarios (untracked, cleared bucket, normal) plus the version-check log.

### Commands

1. `pnpm -F @ludoforge/runner test -- texture-pool-patch`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner test`
