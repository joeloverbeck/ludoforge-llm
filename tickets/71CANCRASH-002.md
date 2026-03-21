# 71CANCRASH-002: Layer 4 — Pre-Destroy Render Guards

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

`safeDestroyDisplayObject` only sets `renderable = false` and `visible = false` in the catch fallback path (after `destroy()` throws). During the `destroy()` call itself, PixiJS may internally attempt to render the object (e.g., `_updateGpuText`), triggering the TexturePool crash. Similarly, `destroyManagedText` calls `removeFromParent()` then `safeDestroyDisplayObject` but does not disable rendering before the destroy path begins.

## Assumption Reassessment (2026-03-21)

1. `safeDestroyDisplayObject` currently sets `renderable`/`visible` to `false` only inside the `catch` block (lines 58-63 of `safe-destroy.ts`) — confirmed.
2. `destroyManagedText` calls `text.removeFromParent()` then `safeDestroyDisplayObject(text)` (lines 67-69 of `text-runtime.ts`) — confirmed. No `renderable`/`visible` guards before destroy.
3. The `DestroyableDisplayObject` interface already declares optional `renderable` and `visible` properties — confirmed (lines 16-17).

## Architecture Check

1. Setting `renderable = false` and `visible = false` before `destroy()` is a pure defensive measure — PixiJS `destroy()` does not depend on these flags.
2. This is runner-only; no engine or game-spec changes.
3. No shims or backwards-compatibility; this is a pre-existing function receiving an additional guard.

## What to Change

### 1. Modify `safeDestroyDisplayObject` in `safe-destroy.ts`

Before the `try { displayObject.destroy(options) }` call, add:

```typescript
if ('renderable' in displayObject) {
  displayObject.renderable = false;
}
if ('visible' in displayObject) {
  displayObject.visible = false;
}
```

This ensures that even if `destroy()` triggers an internal PixiJS render pass, the object will be skipped by the renderer's collect phase.

### 2. Modify `destroyManagedText` in `text-runtime.ts`

Before the `text.removeFromParent()` call, add:

```typescript
text.renderable = false;
text.visible = false;
```

This ensures Text objects are non-renderable before any destroy-path operations begin.

## Files to Touch

- `packages/runner/src/canvas/renderers/safe-destroy.ts` (modify)
- `packages/runner/src/canvas/text/text-runtime.ts` (modify)
- `packages/runner/test/canvas/renderers/safe-destroy.test.ts` (modify)
- `packages/runner/test/canvas/text/text-runtime.test.ts` (modify)

## Out of Scope

- Changes to `texture-pool-patch.ts` (71CANCRASH-001).
- Changes to `ticker-error-fence.ts`, `canvas-crash-recovery.ts`, or `game-canvas-runtime.ts`.
- Changes to the engine package.
- Modifying `neutralizeDisplayObject` (it already sets these flags).
- Changing `safeDestroyChildren` (it delegates to `safeDestroyDisplayObject`).

## Acceptance Criteria

### Tests That Must Pass

1. **safe-destroy: pre-destroy flags**: A mock display object's `renderable` and `visible` are set to `false` BEFORE `destroy()` is called (verify via call ordering).
2. **safe-destroy: fallback still works**: When `destroy()` throws, the catch-path neutralization still applies (existing behavior preserved).
3. **text-runtime: pre-destroy flags**: `destroyManagedText` sets `renderable = false` and `visible = false` on the Text object before `removeFromParent()`.
4. Existing suite: `pnpm -F @ludoforge/runner test` passes.
5. Typecheck: `pnpm -F @ludoforge/runner typecheck` passes.

### Invariants

1. `safeDestroyDisplayObject` sets `renderable = false` and `visible = false` before calling `destroy()`, not only in the catch path.
2. `destroyManagedText` sets rendering flags before any destroy-path operation.
3. No functional behavior change for properly-tracked display objects — the flags are purely defensive.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/renderers/safe-destroy.test.ts` — Add test verifying `renderable`/`visible` are `false` before `destroy()` is invoked.
2. `packages/runner/test/canvas/text/text-runtime.test.ts` — Add test verifying `destroyManagedText` sets flags before `removeFromParent()`.

### Commands

1. `pnpm -F @ludoforge/runner test -- safe-destroy`
2. `pnpm -F @ludoforge/runner test -- text-runtime`
3. `pnpm -F @ludoforge/runner typecheck`
4. `pnpm -F @ludoforge/runner test`
