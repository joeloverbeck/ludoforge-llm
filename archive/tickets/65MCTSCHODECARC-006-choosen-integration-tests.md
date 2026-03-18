# 65MCTSCHODECARC-006: `chooseN` MCTS Integration Tests

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — test-only
**Deps**: 65MCTSCHODECARC-001, 65MCTSCHODECARC-002, 65MCTSCHODECARC-003, 65MCTSCHODECARC-004, 65MCTSCHODECARC-005

## Problem

Unit tests (ticket 005) verify decision expansion in isolation. Integration tests are needed to verify the full MCTS pipeline: `MctsAgent.chooseMove()` → decision expansion → search → `postCompleteSelectedMove` → `applyMove` → kernel validation. These tests exercise the complete `chooseN` path end-to-end with a game-agnostic fixture.

## What to Change

### 1. Create integration test file

New file: `packages/engine/test/integration/agents/mcts/mcts-choosen-integration.test.ts`

Tests (per spec section 5.2):

1. **End-to-end chooseN via MctsAgent**: Create a minimal game def with a `chooseN` action (pick 1–2 targets from 3 zones). Run `MctsAgent.chooseMove()` → verify returned move has array param → verify `applyMove` succeeds without validation error.

2. **End-to-end chooseN with min:0**: Same game def with `min: 0` → verify MCTS can return a move with empty array `[]` (a valid selection).

3. **Mixed decisions**: Game def with a `chooseOne` followed by a `chooseN` in the same action → verify both decision types resolve correctly in the same move tree. `chooseOne` binding is scalar, `chooseN` binding is array.

4. **Post-completion correctness**: Verify `postCompleteSelectedMove` produces a move with array params that pass `legalChoicesEvaluate` validation.

5. **Determinism**: Same seed + same game state → identical `chooseN` move selection across two runs.

6. **chooseOne regression**: Run existing `chooseOne`-only game def through `MctsAgent.chooseMove()` → verify scalar params, no regressions.

### 2. Integration test approach

- Use `MctsAgent` as the entry point (not raw `expandDecisionNode`).
- Create game defs programmatically or via small inline spec compilation.
- Use low iteration counts (50–100) for speed — these are correctness tests, not quality tests.
- Verify moves by calling `applyMove(def, state, move)` and asserting no errors.
- Assert on `move.params` shapes (array vs scalar) to confirm the fix.

## Files to Touch

- `packages/engine/test/integration/agents/mcts/mcts-choosen-integration.test.ts` (new)

## Out of Scope

- FITL-specific tests (ticket 007)
- Production source code changes
- Kernel or compiler changes
- Search quality or performance testing
- Decision expansion unit tests (ticket 005)

## Acceptance Criteria

### Tests That Must Pass

1. All 6 integration tests described above pass
2. `MctsAgent.chooseMove()` returns moves where `chooseN` bindings are arrays
3. `applyMove` succeeds for all returned moves (kernel validation passes)
4. All existing MCTS integration tests still pass
5. `pnpm turbo build && pnpm turbo test` — green

### Invariants

1. Returned moves always pass `legalChoicesEvaluate` validation
2. `chooseOne` bindings remain scalar in returned moves
3. `chooseN` bindings are always `Array.isArray()` in returned moves
4. Same seed produces identical moves (determinism)
5. No production source code created or modified
6. Test fixtures are game-agnostic (no FITL/Texas Hold'em logic)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/agents/mcts/mcts-choosen-integration.test.ts` — all 6 tests as described above

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern="mcts-choosen-integration"` (targeted)
2. `pnpm turbo build && pnpm turbo typecheck && pnpm turbo lint && pnpm turbo test`
