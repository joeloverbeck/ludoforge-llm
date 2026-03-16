# 62MCTSSEAVIS-018: Texas Hold'em MCTS Regression Check

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — test execution only
**Deps**: 62MCTSSEAVIS-010, 62MCTSSEAVIS-011, 62MCTSSEAVIS-012

## Problem

Texas Hold'em has simple 1-decision moves. The decision node architecture should create 1-deep decision subtrees that are functionally equivalent to current behavior. This ticket validates no regression.

## What to Change

### 1. Run Texas Hold'em MCTS tests

Execute the existing Texas Hold'em MCTS test suite with decision nodes enabled.

### 2. Verify functional equivalence

- Simple moves create at most 1-deep decision subtrees
- Search results are equivalent to pre-change behavior
- No performance degradation

## Files to Touch

- None expected (test execution only)
- If failures: `packages/engine/test/integration/` or `test/e2e/` test files (modify expectations)

## Out of Scope

- FITL test tuning (62MCTSSEAVIS-016, 017)
- Pool sizing tuning (62MCTSSEAVIS-019)
- Production source code changes
- Texas Hold'em game spec changes

## Acceptance Criteria

### Tests That Must Pass

1. All existing Texas Hold'em MCTS tests pass
2. No new crashes or errors
3. Decision nodes for simple moves are shallow (0-1 decision depth)
4. Search performance is not significantly degraded (within 2x of pre-change)
5. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. No FITL-specific logic leaks into kernel (engine-agnosticism)
2. Texas Hold'em test expectations unchanged (or only trivially updated)
3. Decision node overhead is negligible for simple games

## Test Plan

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-path-pattern texas` (or equivalent)
2. `pnpm -F @ludoforge/engine test`
