# 71CANCRASH-001: Layer 1 — Runner-Owned Destroy-Path Hardening

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None (first ticket in the series)

## Problem

The original ticket proposed a PixiJS-global `TexturePool` monkey-patch as the first fix layer. Reassessment against the current runner code and tests shows that this is not the strongest architectural move for the first ticket:

1. The runner already owns a disposal abstraction in `safe-destroy.ts` and `text-runtime.ts`.
2. Existing tests already reproduce the relevant failure surface by throwing `TexturePoolClass.returnTexture failed` from `destroy()` during runner-managed teardown and reconciliation.
3. Introducing a global Pixi monkey-patch would couple the runner to upstream private internals and create a new permanent side-effect import pattern before we have exhausted the cleaner runner-owned fix.

The highest-confidence first step is therefore to harden the runner's destroy path so display objects are made non-renderable before destruction begins.

## Assumption Reassessment (2026-03-21)

1. `safeDestroyDisplayObject` currently calls `destroy()` before setting `renderable = false` and `visible = false` — confirmed in `packages/runner/src/canvas/renderers/safe-destroy.ts`.
2. `destroyManagedText` currently calls `removeFromParent()` and then delegates to `safeDestroyDisplayObject(text)` without first disabling rendering — confirmed in `packages/runner/src/canvas/text/text-runtime.ts`.
3. Existing runner tests already model this crash surface through destroy-path failures in `safe-destroy.test.ts`, `text-runtime.test.ts`, and `token-renderer.test.ts` — confirmed.
4. PixiJS v8.17.1 does export `TexturePool`, and its `returnTexture()` implementation is still missing guards in the installed package. That remains useful background evidence, but it does not by itself justify making a Pixi-global monkey-patch the first architectural move.

## Architecture Check

1. The runner should prefer strengthening its own lifecycle invariants before patching upstream private state. That is cleaner, easier to test, and easier to remove or evolve.
2. Making a display object non-renderable before `destroy()` begins is a runner-owned contract, not a Pixi-private workaround.
3. No backwards-compatibility shims or aliases are needed. We are tightening the current destroy semantics in place.
4. If this hardening proves insufficient after verification, a follow-up ticket may still justify a targeted Pixi patch. That decision should be based on remaining failing evidence, not on speculation.

## What to Change

### 1. Harden `safeDestroyDisplayObject` before `destroy()`

In `packages/runner/src/canvas/renderers/safe-destroy.ts`:

- Set `renderable = false` and `visible = false` before the `destroy()` call when those properties exist.
- Keep the current catch fallback intact so failed destroys still detach, recurse through children, and disable interaction.

### 2. Harden `destroyManagedText` before any destroy-path operation

In `packages/runner/src/canvas/text/text-runtime.ts`:

- Set `text.renderable = false` and `text.visible = false` before `removeFromParent()`.
- Keep `safeDestroyDisplayObject(text)` as the single destroy primitive after the pre-destroy guard.

## Files to Touch

- `packages/runner/src/canvas/renderers/safe-destroy.ts` (modify)
- `packages/runner/src/canvas/text/text-runtime.ts` (modify)
- `packages/runner/test/canvas/renderers/safe-destroy.test.ts` (modify)
- `packages/runner/test/canvas/text/text-runtime.test.ts` (modify)

## Out of Scope

- Any PixiJS monkey-patch or prototype modification.
- Changes to `create-app.ts`.
- Changes to `ticker-error-fence.ts`, `canvas-crash-recovery.ts`, or `game-canvas-runtime.ts`.
- Changes to the engine package.
- Adding telemetry or error reporting infrastructure.
- Handling WebGL context loss.

## Acceptance Criteria

### Tests That Must Pass

1. **safe-destroy pre-destroy flags**: `safeDestroyDisplayObject()` sets `renderable = false` and `visible = false` before `destroy()` is invoked.
2. **safe-destroy fallback preserved**: If `destroy()` still throws, the existing fallback detach and child-recursion behavior remains intact.
3. **text-runtime pre-destroy flags**: `destroyManagedText()` sets `renderable = false` and `visible = false` before `removeFromParent()`.
4. Existing suite: `pnpm -F @ludoforge/runner test` passes.
5. Typecheck: `pnpm -F @ludoforge/runner typecheck` passes.
6. Lint: `pnpm -F @ludoforge/runner lint` passes.

### Invariants

1. Runner-owned destroy paths make objects non-renderable before Pixi destroy logic begins.
2. `safeDestroyDisplayObject()` remains the single destroy primitive for canvas display objects.
3. No new global Pixi side effects or monkey-patch infrastructure are introduced.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/renderers/safe-destroy.test.ts` — add ordering coverage proving `renderable`/`visible` are disabled before `destroy()`.
2. `packages/runner/test/canvas/text/text-runtime.test.ts` — add ordering coverage proving text is non-renderable before `removeFromParent()`.

### Commands

1. `pnpm -F @ludoforge/runner test -- safe-destroy`
2. `pnpm -F @ludoforge/runner test -- text-runtime`
3. `pnpm -F @ludoforge/runner typecheck`
4. `pnpm -F @ludoforge/runner lint`
5. `pnpm -F @ludoforge/runner test`

## Outcome

- Completion date: 2026-03-21
- What actually changed: Re-scoped the ticket away from a PixiJS-global `TexturePool` monkey-patch and implemented runner-owned destroy-path hardening instead. `safeDestroyDisplayObject()` now disables `renderable` and `visible` before `destroy()`, and `destroyManagedText()` disables those flags before `removeFromParent()`.
- Deviations from original plan: The original monkey-patch and `create-app.ts` side-effect import were not implemented. Reassessment showed that the cleaner first move is to strengthen the runner's disposal contract using already-proven failure surfaces in the existing test suite.
- Verification results:
  - `pnpm -F @ludoforge/runner exec vitest run test/canvas/renderers/safe-destroy.test.ts test/canvas/text/text-runtime.test.ts`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner lint`
  - `pnpm -F @ludoforge/runner test`
