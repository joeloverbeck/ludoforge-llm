# 62MCTSSEAVIS-017: FITL MCTS Default & Strong Test Validation

**Status**: NOT IMPLEMENTED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — test tuning only
**Deps**: 62MCTSSEAVIS-016

## Problem

After fast tests pass, the default and strong MCTS presets need validation. Higher iteration counts may expose different behaviors — deeper decision trees, pool pressure, different action distributions.

## What to Change

### 1. Run default preset tests

Execute FITL MCTS tests with default preset. Review visitor output for:
- Decision tree depth (how deep do decisions go?)
- Pool utilization (are we close to exhaustion?)
- Action category distribution (are more categories explored?)

### 2. Run strong preset tests

Execute with strong preset. Longer search may reveal:
- Pool exhaustion (may need multiplier tuning)
- Confidence-based stopping behavior with decision roots
- Deeper decision subtrees

### 3. Tune acceptable category sets

Update test expectations based on observed behavior. Document any preset-specific adjustments.

## Files to Touch

- `packages/engine/test/integration/fitl-mcts-*.test.ts` or `test/e2e/mcts-fitl/` (modify — tune expectations)

## Out of Scope

- Fast test tuning (already done in 62MCTSSEAVIS-016)
- Pool sizing tuning (62MCTSSEAVIS-019)
- Production source code changes

## Acceptance Criteria

### Tests That Must Pass

1. All FITL MCTS default preset scenarios pass
2. All FITL MCTS strong preset scenarios pass
3. No pool exhaustion crashes (graceful degradation works)
4. Visitor output shows healthy decision tree exploration
5. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. No production source code changes
2. Preset configurations unchanged (tuning is test-side only)

## Test Plan

### Commands

1. `RUN_MCTS_FITL_E2E=1 MCTS_PRESET=default pnpm -F @ludoforge/engine test:e2e`
2. `RUN_MCTS_FITL_E2E=1 MCTS_PRESET=strong pnpm -F @ludoforge/engine test:e2e`
3. `pnpm -F @ludoforge/engine test`

## Archival Note

Archived on 2026-03-18 as part of the MCTS retirement cleanup. This work item remained unfinished and was removed from the active planning surface so the repository no longer presents MCTS as current architecture.
