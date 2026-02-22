# RENDERLIFE-002: Make Deferred Disposal Queue a Required Renderer Contract

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: RENDERLIFE-001

## Problem

Renderer and animation code currently branches between immediate destroy and deferred queue disposal. This dual path increases lifecycle complexity, duplicates teardown logic, and weakens confidence in robust cleanup behavior.

## Assumption Reassessment (2026-02-22)

1. `disposalQueue` is currently optional in `createTokenRenderer`, `buildTimeline`, and `createAnimationController` options; each still contains queue-absent fallback behavior.
2. `createEphemeralContainerFactory` already has both `releaseAll(queue)` and `destroyAll()`, and `buildTimeline` currently chooses between them based on optional queue presence.
3. `GameCanvas` runtime already instantiates one disposal queue and passes it to both token renderer and animation controller.
4. Mismatch: runtime wiring is queue-first, but internal APIs/tests still permit queue-absent lifecycle branches. This ticket removes that optional branchability.

## Architecture Check

1. One disposal pathway (queue-based) is cleaner and more extensible than maintaining multiple teardown semantics.
2. Making queue dependency explicit at the teardown boundary reduces accidental divergence between runtime wiring and component contracts.
3. Scope is confined to runner rendering/animation lifecycle infrastructure and does not alter `GameDef`, simulation, or game-specific behavior contracts.
4. No backward-compatibility mode is needed; remove optional API surface directly.

## What to Change

### 1. Require disposal queue in renderer/animation wiring

- Make queue dependency required where lifecycle teardown occurs:
  - token renderer container removal/destruction path
  - timeline ephemeral cleanup path
  - animation controller option pass-through when ephemeral cleanup is active
- Remove fallback branches that call immediate direct destruction from these flows.
- Keep external user-visible behavior unchanged while simplifying internals.

### 2. Tighten type contracts

- Update option interfaces and call sites so queue presence is guaranteed at compile time for affected flows.
- Reduce nullable/optional handling in cleanup functions.

### 3. Strengthen regression tests for single-path behavior

- Add tests asserting cleanup always routes through queue flow.
- Remove/replace tests that explicitly assert queue-absent fallback branching.
- Add/adjust tests in animation-controller to ensure `disposalQueue` is threaded whenever ephemeral container factory is used.

## Files to Touch

- `packages/runner/src/canvas/renderers/token-renderer.ts` (modify)
- `packages/runner/src/animation/timeline-builder.ts` (modify)
- `packages/runner/src/animation/ephemeral-container-factory.ts` (modify)
- `packages/runner/src/animation/animation-controller.ts` (modify)
- `packages/runner/src/canvas/GameCanvas.tsx` (modify)
- `packages/runner/test/canvas/renderers/token-renderer.test.ts` (modify)
- `packages/runner/test/animation/timeline-builder.test.ts` (modify)
- `packages/runner/test/animation/ephemeral-container-factory.test.ts` (modify)
- `packages/runner/test/animation/animation-controller.test.ts` (modify)

## Out of Scope

- Changes to game rules/modeling.
- Pixi performance tuning beyond lifecycle simplification.
- UI feature additions.

## Acceptance Criteria

### Tests That Must Pass

1. Token renderer cleanup path uses queue-based disposal only.
2. Timeline ephemeral cleanup uses queue release path only.
3. Animation controller always forwards disposal queue when ephemeral cleanup is configured.
4. TypeScript compile forbids constructing affected components without queue dependency in affected flows.
5. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Single disposal lifecycle path is enforced by types and runtime wiring.
2. No game-specific conditionals are introduced in renderer lifecycle code.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/renderers/token-renderer.test.ts` — assert queue-only cleanup flow.
2. `packages/runner/test/animation/timeline-builder.test.ts` — assert queue-backed release behavior and remove fallback assumptions.
3. `packages/runner/test/animation/ephemeral-container-factory.test.ts` — assert queue-released lifecycle contract.
4. `packages/runner/test/animation/animation-controller.test.ts` — assert queue forwarding to timeline options when ephemeral path is active.

### Commands

1. `pnpm -F @ludoforge/runner typecheck`
2. `pnpm -F @ludoforge/runner test test/canvas/renderers/token-renderer.test.ts test/animation/timeline-builder.test.ts`
3. `pnpm -F @ludoforge/runner test`
4. `pnpm turbo test`

## Outcome

- Completed: 2026-02-22
- Actually changed:
  - Enforced queue-required cleanup contract in `createTokenRenderer` and removed direct immediate-destroy fallback path for token container teardown.
  - Removed `destroyAll()` from ephemeral container factory API and implementation; queue-based `releaseAll(queue)` is now the only lifecycle cleanup path.
  - Tightened `buildTimeline` option typing so ephemeral factory usage requires disposal queue; removed fallback cleanup branching.
  - Tightened `createAnimationController` option typing so `ephemeralParent` requires `disposalQueue`, and always forwards queue when ephemeral cleanup is active.
  - Updated runner tests to assert queue-only behavior and removed fallback-branch expectations.
- Deviations from original plan:
  - Expanded test scope to include `animation-controller` and `GameCanvas` contract alignment needed by stricter compile-time types.
  - Added explicit runtime guard errors for invalid ephemeral-without-queue wiring to protect invariants in addition to type-level constraints.
- Verification results:
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner test test/canvas/renderers/token-renderer.test.ts test/animation/timeline-builder.test.ts test/animation/ephemeral-container-factory.test.ts test/animation/animation-controller.test.ts` passed.
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm turbo test` passed.
  - `pnpm turbo lint` passed.
