# 68CANLIFCRARES-001: Remove `_texture = null` from neutralizeDisplayObject and safeDestroyDisplayObject fallback

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None (first ticket in Spec 68 chain)

## Problem

`neutralizeDisplayObject` sets `_texture = null` on PixiJS display objects. This creates a dangling reference: PixiJS's internal `CanvasTextSystem` retains a GPU text reference from the previous render pass and calls `_updateGpuText` → `decreaseReferenceCount` → `returnTexture` on the nulled texture, producing `Cannot read properties of undefined (reading 'push')` which crashes the entire canvas in an infinite RAF loop.

The same `_texture = null` pattern exists in the `safeDestroyDisplayObject` fallback path (when `destroy()` throws).

The fix: remove the `_texture = null` assignments. The combination of `removeFromParent()` + `visible = false` + `renderable = false` already prevents PixiJS from rendering the object. PixiJS manages texture lifecycle during `destroy()`, which happens later in the disposal queue.

## Assumption Reassessment (2026-03-20)

1. `neutralizeDisplayObject` at `safe-destroy.ts:36-38` contains `if ('_texture' in displayObject) { (displayObject as { _texture: unknown })._texture = null; }` — confirmed.
2. `safeDestroyDisplayObject` fallback at `safe-destroy.ts:73-75` contains the same `_texture = null` pattern — confirmed.
3. Existing test `neutralizeDisplayObject > nulls out _texture if present` at `safe-destroy.test.ts:319-326` asserts `_texture` IS null — this test must be updated to assert `_texture` is NOT null.
4. Existing test `safeDestroyDisplayObject fallback hardening > nulls out _texture when destroy() throws` at `safe-destroy.test.ts:251-263` — this test must be updated similarly.

## Architecture Check

1. Removing `_texture = null` is the smallest possible change to stop the crash. `renderable = false` makes PixiJS skip the object in `collectRenderables`, so there is no render-path access to the texture. `destroy()` (called later by the disposal queue) handles texture cleanup properly.
2. This change is entirely within the runner canvas layer — no kernel/compiler/game-specific impact.
3. No aliasing or shims. Pure removal of the offending lines.

## What to Change

### 1. Remove `_texture = null` from `neutralizeDisplayObject`

In `packages/runner/src/canvas/renderers/safe-destroy.ts`, remove lines 36-38:
```typescript
// REMOVE:
if ('_texture' in displayObject) {
  (displayObject as { _texture: unknown })._texture = null;
}
```

### 2. Remove `_texture = null` from `safeDestroyDisplayObject` fallback

In `packages/runner/src/canvas/renderers/safe-destroy.ts`, remove lines 73-75 (the same pattern inside the catch block):
```typescript
// REMOVE:
if ('_texture' in displayObject) {
  (displayObject as { _texture: unknown })._texture = null;
}
```

### 3. Update existing tests

- Update `neutralizeDisplayObject > nulls out _texture if present` to assert `_texture` is **preserved** (not null).
- Update `safeDestroyDisplayObject fallback hardening > nulls out _texture when destroy() throws` to assert `_texture` is **preserved** (not null).

## Files to Touch

- `packages/runner/src/canvas/renderers/safe-destroy.ts` (modify)
- `packages/runner/test/canvas/renderers/safe-destroy.test.ts` (modify)

## Out of Scope

- Changing the disposal queue timing (that's 68CANLIFCRARES-002).
- Adding ticker error fencing (that's 68CANLIFCRARES-003).
- Modifying `GameCanvas.tsx`, `game-store.ts`, or any store lifecycle code.
- Changing the `safeDestroyDisplayObject` happy path (when `destroy()` succeeds).
- Modifying `disposal-queue.ts`.
- Changing any engine package files.

## Acceptance Criteria

### Tests That Must Pass

1. `neutralizeDisplayObject > preserves _texture (does not null it)` — new/updated test asserting `container._texture` retains its original value after neutralization.
2. `safeDestroyDisplayObject fallback > preserves _texture when destroy() throws` — updated test asserting `_texture` is not nulled in the fallback path.
3. All existing `neutralizeDisplayObject` tests continue to pass (removeFromParent, visible/renderable/eventMode/interactiveChildren, children preserved).
4. All existing `safeDestroyContainer` and `safeDestroyDisplayObject` tests continue to pass.
5. All existing `safeDestroyChildren` tests continue to pass.
6. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. `neutralizeDisplayObject` must still set `visible = false`, `renderable = false`, `eventMode = 'none'`, `interactiveChildren = false`, and call `removeFromParent()`.
2. `safeDestroyDisplayObject` happy path (no throw) must remain unchanged.
3. No new exports or public API changes.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/renderers/safe-destroy.test.ts` — update two `_texture` tests to assert preservation instead of nulling. Rename test descriptions to reflect new behavior.

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/canvas/renderers/safe-destroy.test.ts`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`
