# 64MCTSPEROPT-013: Modular Leaf Evaluator Extraction and Cleanup

**Status**: PENDING
**Priority**: LOW
**Effort**: Medium
**Engine Changes**: Yes — MCTS module restructuring
**Deps**: 64MCTSPEROPT-001, 64MCTSPEROPT-009

## Problem

After the `LeafEvaluator` type is added (ticket 001), the actual rollout logic, MAST logic, and decision-boundary resolution still live in ad-hoc locations. The spec (Phase 5, section 3.1) requires extracting leaf evaluators into separate modules, moving rollout-specific config under rollout-only types, and moving `resolveDecisionBoundary()` to a non-rollout module.

## Assumption Reassessment (2026-03-17)

1. `rollout.ts` exists as a separate module — **confirmed**.
2. `mast.ts` exists as a separate module — **confirmed**.
3. `resolveDecisionBoundary()` — need to verify where it currently lives and what imports it.
4. `search.ts` likely has inline dispatch for leaf evaluation — need to verify.

## Architecture Check

1. Modular extraction makes each leaf evaluator independently testable and swappable.
2. Decision boundary resolution is used by both rollout and non-rollout paths — must not live under rollout.
3. No functionality is deleted — rollout and MAST remain available.

## What to Change

### 1. Create `decision-boundary.ts` (new file)

Move `resolveDecisionBoundary()` from its current location to a dedicated module. Update all imports.

### 2. Extract leaf evaluator dispatch into separate modules

Each `LeafEvaluator.type` should dispatch to a clear module:
- `heuristic` → `evaluate.ts` (already exists)
- `rollout` → `rollout.ts` (already exists, but ensure it reads from `LeafEvaluator` config)
- `auto` → thin dispatcher that measures cost and chooses

### 3. Move rollout-specific config under rollout types

Remove any remaining top-level config fields that are rollout-only. They should only exist inside `LeafEvaluator & { type: 'rollout' }`.

### 4. Ensure MAST only loads for rollout evaluator

`mast.ts` should only be imported/initialized when `leafEvaluator.type === 'rollout'`. Direct/heuristic profiles should not load MAST.

### 5. Remove dead top-level config fields

If any config fields are now exclusively under `LeafEvaluator.rollout`, remove them from the top-level `MctsConfig`.

### 6. Deprecate old preset names

If `resolvePreset()` still exists, mark it deprecated in favor of `resolveBudgetProfile()`.

## Files to Touch

- `packages/engine/src/agents/mcts/decision-boundary.ts` (new — extracted from current location)
- `packages/engine/src/agents/mcts/rollout.ts` (modify — read from LeafEvaluator config)
- `packages/engine/src/agents/mcts/mast.ts` (modify — conditional loading)
- `packages/engine/src/agents/mcts/search.ts` (modify — dispatch to evaluator modules)
- `packages/engine/src/agents/mcts/config.ts` (modify — remove dead fields, deprecate old names)
- `packages/engine/src/agents/mcts/index.ts` (modify — export new module)

## Out of Scope

- Deleting rollout or MAST functionality
- Kernel-side optimizations (Phase 4)
- Parallel search (Phase 6)
- CI workflow changes (ticket 64MCTSPEROPT-014)
- Adding new evaluator types

## Acceptance Criteria

### Tests That Must Pass

1. `resolveDecisionBoundary()` works from its new module.
2. `leafEvaluator: { type: 'rollout', ... }` still produces correct rollout behavior.
3. `leafEvaluator: { type: 'heuristic' }` does not import/initialize MAST.
4. No top-level config fields exist that are exclusively rollout-specific.
5. All existing MCTS tests pass without modification (beyond import changes).
6. `pnpm -F @ludoforge/engine test` — full suite passes.
7. `pnpm turbo typecheck` passes.

### Invariants

1. `rollout.ts` and `mast.ts` remain functional — not deleted.
2. `resolveDecisionBoundary()` is importable from `decision-boundary.ts`.
3. No backwards-compatibility shims or aliases.
4. No game-specific logic introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/mcts/decision-boundary.test.ts` (new) — covers extracted function.
2. Existing tests — update imports if needed.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
