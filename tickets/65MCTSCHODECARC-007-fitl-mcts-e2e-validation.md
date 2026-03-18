# 65MCTSCHODECARC-007: FITL MCTS E2E Test Validation and Regression Suite

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — test tuning only
**Deps**: 65MCTSCHODECARC-001, 65MCTSCHODECARC-002, 65MCTSCHODECARC-003, 65MCTSCHODECARC-004

## Problem

The core goal of Spec 65 is to fix the FITL MCTS competence tests. After tickets 001–004 implement the `chooseN` decision architecture, the FITL MCTS E2E tests must be validated. Currently 36 of 39 tests fail with `chooseN move param must be an array` errors. All 39 must pass after the fix.

## What to Change

### 1. Run FITL MCTS E2E tests and validate

Execute all three FITL MCTS E2E test files:
- `packages/engine/test/e2e/mcts-fitl/fitl-mcts-interactive.test.ts` (19 tests, 18 currently fail)
- `packages/engine/test/e2e/mcts-fitl/fitl-mcts-turn.test.ts` (10 tests, 9 currently fail)
- `packages/engine/test/e2e/mcts-fitl/fitl-mcts-background.test.ts` (10 tests, 9 currently fail)

### 2. Diagnose and fix any remaining failures

If tests still fail after tickets 001–004:
- Diagnose the failure mode (is it still `chooseN` param shape? a different error?)
- Fix test expectations if the MCTS now produces different (but valid) move categories
- Do NOT change production code in this ticket — only test expectations and acceptable move categories

### 3. Verify chooseOne regression

The existing passing tests (S9 in interactive, one in each turn/background) must still pass. These use `chooseOne` decisions and must not be affected by the `chooseN` changes.

### 4. Run full regression suite

After FITL MCTS E2E tests pass:
- Run full engine test suite
- Run typecheck and lint
- Verify node pool is not exhausted during FITL MCTS scenarios

## Files to Touch

- `packages/engine/test/e2e/mcts-fitl/fitl-mcts-interactive.test.ts` (modify — only if test expectations need tuning)
- `packages/engine/test/e2e/mcts-fitl/fitl-mcts-turn.test.ts` (modify — only if test expectations need tuning)
- `packages/engine/test/e2e/mcts-fitl/fitl-mcts-background.test.ts` (modify — only if test expectations need tuning)
- `packages/engine/test/e2e/mcts-fitl/fitl-mcts-test-helpers.ts` (modify — only if helper infrastructure needs adjustment)

## Out of Scope

- Production source code changes (all implementation is in tickets 001–004)
- Kernel or compiler changes
- Decision expansion logic
- New unit or integration tests (tickets 005–006)
- Search quality optimization or tuning iteration counts
- Texas Hold'em MCTS tests (separate regression concern)

## Acceptance Criteria

### Tests That Must Pass

1. `fitl-mcts-interactive.test.ts`: All 19 tests pass
2. `fitl-mcts-turn.test.ts`: All 10 tests pass
3. `fitl-mcts-background.test.ts`: All 10 tests pass
4. No `chooseN move param must be an array` errors in any test
5. No pool exhaustion crashes
6. Previously passing tests (S9 interactive, etc.) still pass with same results
7. `pnpm turbo build && pnpm turbo typecheck && pnpm turbo lint && pnpm turbo test` — all green

### Invariants

1. MCTS returns moves that pass kernel validation (`applyMove` succeeds)
2. `chooseN` params in returned moves are always arrays
3. `chooseOne` params in returned moves are always scalars
4. Same seed + same scenario → deterministic results
5. No production source code changes in this ticket

## Test Plan

### Commands

1. `RUN_MCTS_FITL_E2E=1 pnpm -F @ludoforge/engine test:e2e -- --test-name-pattern="fitl-mcts"` (targeted FITL MCTS)
2. `pnpm -F @ludoforge/engine test` (full engine unit/integration suite)
3. `pnpm turbo build && pnpm turbo typecheck && pnpm turbo lint && pnpm turbo test` (full verification)
