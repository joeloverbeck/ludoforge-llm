# 71CANCRASH-006: Integration Test — End-to-End Defensive Layer Validation

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: 71CANCRASH-001, 71CANCRASH-002, 71CANCRASH-003, 71CANCRASH-004, 71CANCRASH-005

## Problem

Each defensive layer (001-005) has its own unit tests, but there is no integration test that proves the full chain works end-to-end: forced TexturePool corruption → detection → recovery → clean canvas. This is the final validation that the five layers work together and that each layer is independently sufficient.

## Assumption Reassessment (2026-03-21)

1. All five previous tickets must be completed before this ticket can be implemented.
2. The runner test infrastructure uses Vitest — confirmed (runner uses Vitest, not node --test).
3. PixiJS mocking in the runner test suite: needs investigation at implementation time. The integration test may need to mock PixiJS internals to simulate TexturePool corruption without a real GPU context.
4. The crash recovery flow is: `reportCanvasCrash()` → `beginCanvasRecovery()` → `onRecoveryNeeded()` callback — confirmed from `canvas-crash-recovery.ts` lines 39-41.
5. This ticket is test-only. If 71CANCRASH-005 refines the shared runtime-health contract, this ticket must follow that canonical shape and must not preserve stale boolean-only assumptions in fixtures or mocks.

## Architecture Check

1. This is a test-only ticket — no production code changes.
2. The integration test validates the architectural claim that each layer is independently sufficient.
3. No backwards-compatibility concerns; this is purely additive test coverage.
4. This ticket is not the place to invent a new runtime-health model. It should validate the production contract delivered by 71CANCRASH-003 and, if needed, refined by 71CANCRASH-005.

## What to Change

### 1. Create integration test file

Create `packages/runner/test/canvas/crash-elimination-integration.test.ts`:

**Test group 1: Layer 1 independence (Prevention)**
- Simulate the exact crash scenario: call `TexturePool.returnTexture` with a texture whose UID is not in `_poolKeyHash`.
- Assert: no error is thrown (the monkey-patch guards the access).
- Assert: the texture pool remains in a consistent state.

**Test group 2: Layer 2 independence (Detection)**
- Simulate a contained ticker error (by throwing inside the original tick).
- Assert: `isRenderCorruptionSuspected()` returns `true` after the error.
- Assert: heartbeat interval (fast-forwarded via fake timers) triggers recovery callback.
- If 71CANCRASH-005 evolves the shared runtime-health contract beyond the current boolean form, assert against that canonical contract instead of preserving this exact boolean assertion.

**Test group 3: Layer 3 independence (Clean Recovery)**
- Simulate canvas teardown via `GameCanvas.destroy()`.
- Assert: `TexturePool.clear()` was called.
- Assert: pool state is empty after teardown.

**Test group 4: Layer 4 independence (Hardening)**
- Create a mock display object and call `safeDestroyDisplayObject`.
- Assert: `renderable` and `visible` were set to `false` before `destroy()` was invoked.

**Test group 5: Layer 5 independence (Verification)**
- Schedule a render health probe verification with a stage whose children are all non-renderable.
- Assert: `onCorruption` callback is invoked.

**Test group 6: Full chain**
- Simulate: TexturePool corruption occurs during a ticker tick → error is contained → corruption flag is set → heartbeat detects corruption → recovery triggers → teardown calls `TexturePool.clear()` → rebuilt canvas starts clean.
- Assert: the recovery callback was invoked exactly once.
- Assert: no uncaught errors escape the test.

## Files to Touch

- `packages/runner/test/canvas/crash-elimination-integration.test.ts` (new)

## Out of Scope

- Modifying any production source files.
- Changes to any existing test files.
- Changes to the engine package.
- Browser-based E2E testing (this is a Vitest integration test with mocked PixiJS).
- Performance benchmarking.
- Adding telemetry or error reporting infrastructure.

## Acceptance Criteria

### Tests That Must Pass

1. **Layer 1 independence**: TexturePool monkey-patch prevents the TypeError for untracked textures.
2. **Layer 2 independence**: Corruption flag is set after a single contained error; heartbeat triggers recovery.
3. **Layer 3 independence**: `TexturePool.clear()` is called during canvas teardown.
4. **Layer 4 independence**: `renderable`/`visible` are `false` before `destroy()` call.
5. **Layer 5 independence**: Render health probe detects non-functional rendering and triggers corruption callback.
6. **Full chain**: End-to-end from corruption through detection to recovery completes without uncaught errors.
7. Existing suite: `pnpm -F @ludoforge/runner test` passes.
8. Typecheck: `pnpm -F @ludoforge/runner typecheck` passes.

### Invariants

1. Each defensive layer is proven independently sufficient by its own test group.
2. The integration test does not modify production code.
3. The integration test uses Vitest mocking/faking for PixiJS internals — no real GPU context required.
4. All existing runner tests continue to pass unmodified.
5. Runtime-health fixtures in this test must match the single canonical contract in production code at implementation time.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/crash-elimination-integration.test.ts` — 6 test groups covering each layer independently + full chain.

### Commands

1. `pnpm -F @ludoforge/runner test -- crash-elimination-integration`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner test`
