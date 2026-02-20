# ANIMPIPE-001: Safe container destruction

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

`Container.destroy()` cascades to `Text.destroy()`, which triggers a PixiJS v8 bug in `TexturePoolClass.returnTexture`. This `TypeError` propagates into `processTrace`'s single try/catch and kills the entire animation timeline. Cards appear instantly in players' hands instead of animating.

## Assumption Reassessment (2026-02-20)

1. `token-renderer.ts` has two `tokenContainer.destroy()` call sites: update loop (~line 90) and `destroy()` method (~line 194) — confirmed by reading the file.
2. PixiJS v8 `TexturePoolClass.returnTexture` TypeError occurs during React StrictMode double-invocation — confirmed from error logs.
3. No existing safe-destroy utility exists in the codebase — confirmed via grep.

## Architecture Check

1. A dedicated `safeDestroyContainer` utility centralizes the workaround, keeping individual renderers clean and DRY.
2. This is a runner-only change; no engine/GameDef/GameSpecDoc boundaries are affected.
3. No backwards-compatibility shims — the old direct `destroy()` calls are simply replaced.

## What to Change

### 1. Create `safeDestroyContainer` utility

New file `packages/runner/src/canvas/renderers/safe-destroy.ts` (~25 lines):

- Export `safeDestroyContainer(container: Container): void`
- Wraps `container.destroy()` in try/catch
- On error: calls `container.removeFromParent()` as fallback, logs warning via `console.warn`
- Does NOT re-throw

### 2. Use `safeDestroyContainer` in token-renderer

Modify `packages/runner/src/canvas/renderers/token-renderer.ts`:

- Replace `tokenContainer.destroy()` at update loop (~line 90) with `safeDestroyContainer(tokenContainer)`
- Replace `tokenContainer.destroy()` at destroy method (~line 194) with `safeDestroyContainer(tokenContainer)`
- Add import for `safeDestroyContainer`

## Files to Touch

- `packages/runner/src/canvas/renderers/safe-destroy.ts` (new)
- `packages/runner/test/canvas/renderers/safe-destroy.test.ts` (new)
- `packages/runner/src/canvas/renderers/token-renderer.ts` (modify)
- `packages/runner/test/canvas/renderers/token-renderer.test.ts` (modify)

## Out of Scope

- Zone renderer or adjacency renderer destruction (they don't use Text children)
- Fixing the PixiJS v8 bug upstream
- Modifying animation controller error handling (ANIMPIPE-003)

## Acceptance Criteria

### Tests That Must Pass

1. `safeDestroyContainer` calls `container.destroy()` normally when no error
2. `safeDestroyContainer` catches error from `destroy()`, calls `removeFromParent()` as fallback
3. `safeDestroyContainer` logs warning on error, does not re-throw
4. Token renderer update cycle completes even when `destroy()` throws
5. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. No unhandled exceptions propagate from container destruction
2. Token containers are removed from display list even if `destroy()` fails

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/renderers/safe-destroy.test.ts` — unit tests for safe-destroy utility
2. `packages/runner/test/canvas/renderers/token-renderer.test.ts` — add test for destroy-throws scenario

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/canvas/renderers/safe-destroy.test.ts`
2. `pnpm -F @ludoforge/runner test && pnpm -F @ludoforge/runner typecheck`
