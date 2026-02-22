# RENDERLIFE-001: Fix Deferred Pixi Disposal Leak and Add Integration Coverage

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

The new deferred-disposal path can detach children before queued `destroy()` runs, risking leaked child display objects/textures. Current tests validate parent teardown but do not prove child resources are reclaimed across token and ephemeral animation lifecycles.

## Assumption Reassessment (2026-02-22)

1. `neutralizeDisplayObject` currently calls `removeChildren()` before queued destruction, and `createDisposalQueue` calls `neutralizeDisplayObject` during `enqueue`.
2. Token renderer and ephemeral container factory already use `disposalQueue.enqueue(...)` when a queue is provided.
3. Primary mismatch: tests currently prove parent teardown/neutralization but do not prove child object graphs are reclaimed after deferred flush in queue-enabled lifecycles.
4. `create-app` already has no global window error suppression layer; this ticket should stay focused on disposal semantics unless a disposal change causes app-level regressions.

## Architecture Check

1. A deterministic lifecycle contract (`neutralize` for render safety, `destroy` for resource release) is cleaner than implicit side effects that mutate child ownership before disposal.
2. This work is strictly runner rendering lifecycle code and does not introduce game-specific branching into game-agnostic runtime layers.
3. No backwards-compatibility shim/alias behavior should be added; replace incorrect disposal behavior directly.

## What to Change

### 1. Correct deferred-disposal semantics

- Update disposal flow so neutralization does not orphan child resources prior to queued destroy.
- Ensure queued flush reclaims full object graphs, including nested card content and graphics/text nodes.
- Keep StrictMode/TexturePool fallback behavior intact for destroy failures.

### 2. Add integration-level lifecycle tests

- Add failing-first tests for token renderer with `disposalQueue` enabled to verify removed token containers and children are eventually destroyed.
- Add failing-first tests for ephemeral container factory `releaseAll` path to verify child graphics are reclaimed after queue flush.
- Add disposal-queue tests that assert child-object destruction behavior, not only parent state.

### 3. Keep teardown hardening intact

- Preserve StrictMode/TexturePool fallback behavior in `safeDestroyDisplayObject`.
- Do not add global error suppression or alias behavior.

## Files to Touch

- `packages/runner/src/canvas/renderers/safe-destroy.ts` (modify)
- `packages/runner/src/canvas/renderers/disposal-queue.ts` (modify)
- `packages/runner/src/canvas/renderers/token-renderer.ts` (modify if required by lifecycle fix)
- `packages/runner/src/animation/ephemeral-container-factory.ts` (modify if required by lifecycle fix)
- `packages/runner/test/canvas/renderers/disposal-queue.test.ts` (modify)
- `packages/runner/test/canvas/renderers/token-renderer.test.ts` (modify)
- `packages/runner/test/animation/ephemeral-container-factory.test.ts` (modify)
- `packages/runner/test/canvas/create-app.test.ts` (no change expected; regression-check only)

## Out of Scope

- Visual feature changes or animation style updates.
- Engine/runtime/GameDef schema changes.
- Performance optimization beyond disposal correctness.

## Acceptance Criteria

### Tests That Must Pass

1. Deferred-disposal tests prove queued flush destroys child display objects/resources, not just parent containers.
2. Token renderer tests prove removed token visuals are reclaimed when `disposalQueue` is active.
3. Ephemeral animation tests prove `releaseAll` + flush reclaims child resources.
4. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Enqueue path must make objects non-renderable immediately without forfeiting eventual full resource teardown.
2. No global window error suppression layer is reintroduced.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/renderers/disposal-queue.test.ts` — verify child teardown behavior in deferred flush.
2. `packages/runner/test/canvas/renderers/token-renderer.test.ts` — cover disposalQueue branch and resource cleanup.
3. `packages/runner/test/animation/ephemeral-container-factory.test.ts` — verify deferred release path destroys nested graphics after flush.
4. `packages/runner/test/canvas/create-app.test.ts` — run only if disposal changes unexpectedly affect app lifecycle teardown.

### Commands

1. `pnpm -F @ludoforge/runner test test/canvas/renderers/disposal-queue.test.ts test/canvas/renderers/token-renderer.test.ts test/animation/ephemeral-container-factory.test.ts`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm turbo test`
4. `pnpm -F @ludoforge/runner lint`
5. `pnpm turbo lint`

## Outcome

- Completion date: 2026-02-22
- Actually changed:
  - `neutralizeDisplayObject` no longer removes children; it now only detaches/hides/disables for immediate render safety.
  - Deferred queue flush now destroys queued containers with `{ children: true }` to enforce recursive teardown.
  - `safeDestroyDisplayObject` fallback now recursively destroys removed children when parent `destroy()` throws.
  - Added deferred-path tests proving child graphs remain attached until flush and are reclaimed after flush across disposal queue, token renderer queue branch, and ephemeral `releaseAll`.
  - Updated `safe-destroy` tests to reflect the explicit neutralize-vs-destroy lifecycle contract.
- Deviations from original plan:
  - No `create-app` test changes were needed; app-level error suppression concerns were already out of the active failure path.
  - `token-renderer.ts` and `ephemeral-container-factory.ts` required no implementation edits because queue wiring already existed.
- Verification results:
  - Targeted failing-first run reproduced the bug before code changes.
  - Post-fix targeted tests passed for disposal queue, token renderer, ephemeral factory, and safe destroy.
  - Full `@ludoforge/runner` test suite passed.
  - Workspace-wide `pnpm turbo test` passed.
  - Runner and workspace lint checks passed.
