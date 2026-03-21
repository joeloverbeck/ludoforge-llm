# 72PITEXCRAPRE-001: TexturePool monkey-patch for returnTexture crash prevention

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None (ship-gating for Spec 72)

## Problem

PixiJS v8.17.1's `TexturePoolClass.returnTexture` crashes when called with a texture whose uid is not in `_poolKeyHash` or whose pool bucket was cleared. This crashes the canvas render loop, kills the ticker, and makes the game unplayable. Upstream issue #11735 is open with no fix timeline.

## What to Change

### 1. Create TexturePool monkey-patch

**CREATE**: `packages/runner/src/canvas/pixi-patches.ts`

Patch `TexturePoolClass.prototype.returnTexture` to guard against undefined keys and missing buckets. The patch replaces the method with a guarded version that:
1. Reads `key` from `this._poolKeyHash[renderTexture.uid]`
2. If `key === undefined`, returns silently
3. Handles `resetStyle` if applicable
4. If `this._texturePool[key] === undefined`, creates the bucket
5. Pushes the texture

Exports `applyPixiPatches()` (auto-called at module load) and `removePixiPatches()` (for testing).

### 2. Wire patch into app creation

**MODIFY**: `packages/runner/src/canvas/create-app.ts`
- Add `import './pixi-patches.js';` as the first import
- In `destroy()`: call `TexturePool.clear()` before `app.destroy()`

### 3. Test the patch

**CREATE**: `packages/runner/test/canvas/pixi-patches.test.ts`

## Files to Touch

- `packages/runner/src/canvas/pixi-patches.ts` (new)
- `packages/runner/src/canvas/create-app.ts` (modify)
- `packages/runner/test/canvas/pixi-patches.test.ts` (new)

## Out of Scope

- BitmapText migration (72PITEXCRAPRE-002+)
- Teardown hardening (72PITEXCRAPRE-007)
- validateRenderables null-child patch (contained by ticker error fence)

## Acceptance Criteria

### Tests That Must Pass

1. `returnTexture` with untracked texture uid does not throw
2. `returnTexture` with tracked texture works normally
3. `returnTexture` with key in `_poolKeyHash` but missing bucket in `_texturePool` does not throw
4. `applyPixiPatches()` is idempotent
5. `removePixiPatches()` restores original method
6. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Patch must not break normal TexturePool operation (textures obtained via getOptimalTexture still return correctly)
2. Patch must be removable when upstream fixes land

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/pixi-patches.test.ts` — verifies guard behavior

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
