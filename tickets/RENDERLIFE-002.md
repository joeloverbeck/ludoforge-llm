# RENDERLIFE-002: Make Deferred Disposal Queue a Required Renderer Contract

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: RENDERLIFE-001

## Problem

Renderer and animation code currently branches between immediate destroy and deferred queue disposal. This dual path increases lifecycle complexity, duplicates teardown logic, and weakens confidence in robust cleanup behavior.

## Assumption Reassessment (2026-02-22)

1. `disposalQueue` is currently optional in animation and token renderer options, with fallback paths to immediate `safeDestroy*` calls.
2. `GameCanvas` runtime already instantiates a disposal queue and threads it through token rendering and animation controller setup.
3. Mismatch: runtime intent is queue-first but APIs still expose optional fallback branches; this ticket removes optional branching after RENDERLIFE-001 correctness fixes.

## Architecture Check

1. One disposal pathway (queue-based) is cleaner and more extensible than maintaining multiple teardown semantics.
2. Scope is confined to runner rendering infrastructure and does not alter `GameDef`, simulation, or game-specific behavior contracts.
3. No backward-compatibility mode is needed; remove optional API surface directly.

## What to Change

### 1. Require disposal queue in renderer/animation wiring

- Make queue dependency required where lifecycle teardown occurs (token renderer and ephemeral timeline cleanup).
- Remove fallback branches that call immediate direct destruction.
- Keep external behavior unchanged while simplifying internals.

### 2. Tighten type contracts

- Update option interfaces and call sites so queue presence is guaranteed at compile time.
- Reduce nullable/optional handling in cleanup functions.

### 3. Strengthen regression tests for single-path behavior

- Add tests asserting cleanup always routes through queue flow.
- Remove/replace tests that specifically assert old fallback branching.

## Files to Touch

- `packages/runner/src/canvas/renderers/token-renderer.ts` (modify)
- `packages/runner/src/animation/timeline-builder.ts` (modify)
- `packages/runner/src/animation/ephemeral-container-factory.ts` (modify)
- `packages/runner/src/animation/animation-controller.ts` (modify)
- `packages/runner/src/canvas/GameCanvas.tsx` (modify)
- `packages/runner/test/canvas/renderers/token-renderer.test.ts` (modify)
- `packages/runner/test/animation/timeline-builder.test.ts` (modify)
- `packages/runner/test/animation/ephemeral-container-factory.test.ts` (modify)

## Out of Scope

- Changes to game rules/modeling.
- Pixi performance tuning beyond lifecycle simplification.
- UI feature additions.

## Acceptance Criteria

### Tests That Must Pass

1. Token renderer cleanup path uses queue-based disposal only.
2. Timeline ephemeral cleanup uses queue release path only.
3. TypeScript compile forbids constructing affected components without queue dependency.
4. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Single disposal lifecycle path is enforced by types and runtime wiring.
2. No game-specific conditionals are introduced in renderer lifecycle code.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/renderers/token-renderer.test.ts` — assert queue-only cleanup flow.
2. `packages/runner/test/animation/timeline-builder.test.ts` — assert queue-backed release behavior and remove fallback assumptions.
3. `packages/runner/test/animation/ephemeral-container-factory.test.ts` — assert queue-released lifecycle contract.

### Commands

1. `pnpm -F @ludoforge/runner typecheck`
2. `pnpm -F @ludoforge/runner test test/canvas/renderers/token-renderer.test.ts test/animation/timeline-builder.test.ts`
3. `pnpm -F @ludoforge/runner test`
4. `pnpm turbo test`
