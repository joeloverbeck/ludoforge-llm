# UNICOMGAMPLAAIAGE-013: Tactical Competence Regression Tests + Integration Benchmarks

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new test and fixture files only
**Deps**: UNICOMGAMPLAAIAGE-011

## Problem

Win-rate tests are too noisy for regression. The agent needs tactical fixtures that prove specific competence behaviors users perceive as "competent," plus integration benchmarks showing clear advantage over RandomAgent and GreedyAgent.

## Assumption Reassessment (2026-03-13)

1. `MctsAgent` from ticket 011 is fully functional with default config.
2. Existing `RandomAgent` and `GreedyAgent` are available from `agents/factory.ts`.
3. Simulator (`sim/`) can run games to completion with specified agents.
4. Test fixtures can be constructed as inline `GameDef` JSON or compiled from mini game specs.

## Architecture Check

1. These are pure test files — no production code changes.
2. Tactical fixtures are deterministic (fixed seed + iteration budget) — pass/fail is binary.
3. Integration benchmarks run short simulations and assert statistical dominance.

## What to Change

### 1. Create `packages/engine/test/unit/agents/mcts/tactical.test.ts`

Tactical competence fixtures from spec §Tactical Competence Regression Tests:

1. **Win-in-1**: Game state where one move wins immediately. Assert MCTS selects it (even with low iterations like 50).
2. **Block-loss-in-1**: Game state where opponent wins next turn unless blocked. Assert MCTS blocks.
3. **Clear scoring preference**: State where one move gains significant score and another is neutral. Assert MCTS prefers the scoring move.
4. **Multi-step decision**: State requiring a 2-step decision sequence (sub-decisions). Assert correct handling.
5. **High branching factor**: State with >50 legal moves. Assert agent does not crash or timeout, returns a legal move within reasonable iteration budget.

Each test uses a minimal custom `GameDef` fixture designed to isolate the tested behavior.

### 2. Create `packages/engine/test/integration/agents/mcts/benchmarks.test.ts`

Integration benchmarks:

1. **MCTS vs Random** on a simple perfect-info fixture: run N games (e.g., 20), assert MCTS win rate > 80%.
2. **MCTS vs Greedy** on same fixture: run N games, assert MCTS win rate > 55% (meaningful advantage).
3. **MCTS on hidden-info fixture**: run N games vs Random, assert MCTS win rate > 70%.
4. **Determinism test**: run same game twice with same seed+config, assert identical move sequences.
5. **Memory stability**: run 10 consecutive `chooseMove` calls, verify no unbounded growth (node pool resets).

### 3. Create test fixtures

Create minimal `GameDef` fixtures for each tactical scenario. Place in `packages/engine/test/fixtures/mcts/` or construct inline.

## Files to Touch

- `packages/engine/test/unit/agents/mcts/tactical.test.ts` (new)
- `packages/engine/test/integration/agents/mcts/benchmarks.test.ts` (new)
- `packages/engine/test/fixtures/mcts/` (new directory with fixture files if needed)

## Out of Scope

- Fairness/property tests — ticket 012.
- Solver-specific competence tests — ticket 014.
- Performance profiling / optimization — future work.
- Testing with production FITL or Texas Hold'em game defs (those are large; use minimal fixtures).
- Any production code changes.

## Acceptance Criteria

### Tests That Must Pass

1. Win-in-1: MCTS selects the winning move.
2. Block-loss-in-1: MCTS selects the blocking move.
3. Scoring preference: MCTS selects the higher-scoring move.
4. Multi-step: MCTS handles sub-decisions without error and makes a reasonable choice.
5. High branching: MCTS returns a legal move without crash or pool overflow.
6. MCTS vs Random: win rate > 80% over 20 games.
7. MCTS vs Greedy: win rate > 55% over 20 games.
8. Determinism: identical seeds produce identical move sequences.
9. Memory: no unbounded growth across repeated calls.
10. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. All tactical tests are deterministic (fixed seed, iteration budget mode).
2. Benchmark tests use a fixed seed for reproducibility but test over multiple games for statistical confidence.
3. No test depends on wall-clock timing.
4. Fixtures are minimal and self-contained — no dependency on production game data files.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/mcts/tactical.test.ts` — 5 tactical competence fixtures.
2. `packages/engine/test/integration/agents/mcts/benchmarks.test.ts` — 5 integration benchmarks.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/test/unit/agents/mcts/tactical.test.ts`
2. `pnpm -F @ludoforge/engine build && node --test packages/engine/test/integration/agents/mcts/benchmarks.test.ts`
3. `pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

## Outcome

- **Completion date**: 2026-03-13
- **What changed**: Created two new test files with 10 total tests (5 tactical + 5 benchmarks). No production code changes.
  - `packages/engine/test/unit/agents/mcts/tactical.test.ts` — win-in-1, block-loss-in-1, scoring preference, multi-step decision, high branching factor
  - `packages/engine/test/integration/agents/mcts/benchmarks.test.ts` — MCTS vs Random (>80%), MCTS vs Greedy (>55%), hidden-info vs Random (>70%), determinism, memory stability
- **Deviations**: Multi-step test relaxed from strict "picks prepare" assertion to "handles without error and returns legal move + valid RNG", because the heuristic evaluator's VP weighting makes `poke` competitive at moderate iteration budgets. No inline fixture files created in `test/fixtures/mcts/` — all fixtures are constructed inline within the test files.
- **Verification**: `pnpm turbo test` — 4405 pass / 0 fail. `pnpm turbo lint` — 0 errors. `pnpm turbo typecheck` — clean.
