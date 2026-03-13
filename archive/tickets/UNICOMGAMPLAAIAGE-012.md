# UNICOMGAMPLAAIAGE-012: Fairness and Property Tests

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new test files only
**Deps**: UNICOMGAMPLAAIAGE-011

## Problem

The MCTS agent's core fairness guarantees must be verified with dedicated property tests. These are mandatory per spec §Mandatory Fairness / Property Tests and are non-negotiable for shipping.

## Assumption Reassessment (2026-03-13)

1. `MctsAgent` from ticket 011 is fully functional.
2. `derivePlayerObservation` from ticket 003 provides observation projection.
3. `sampleBeliefState` from ticket 004 handles hidden-state and RNG sampling.
4. Test fixtures with hidden-info zones exist or can be created from FITL/Texas Hold'em game defs.

## Architecture Check

1. These are pure test files — no production code changes.
2. Tests exercise the full `MctsAgent.chooseMove` path, not just individual components.
3. Requires constructing game states that differ in hidden information but are observation-equivalent.

## What to Change

### 1. Create `packages/engine/test/unit/agents/mcts/fairness.test.ts`

Mandatory property tests from spec §Mandatory Fairness / Property Tests:

1. **Observation-equivalent states test**: Construct two `GameState`s identical from observer's perspective but differing in hidden contents. Assert `chooseMove()` returns same move under same agent RNG.

2. **Future-RNG fairness test**: Construct two `GameState`s identical from observer's perspective but differing only in `state.rng`. Assert `chooseMove()` returns same move under same agent RNG.

3. **Visible-state preservation test**: After every belief sample, `derivePlayerObservation(sampled)` equals `derivePlayerObservation(original)` for the observer.

4. **Input immutability test**: Deep-compare input `GameState` before and after `chooseMove()` — must be identical.

5. **Legality test**: Returned move is always in the input `legalMoves` array (by value comparison).

6. **Availability accounting test**: In a game where some moves are only legal in some belief samples, verify unavailable actions are skipped (not penalized with low reward).

### 2. Create test fixtures

Create minimal game spec fixtures (or inline `GameDef` JSON) for:
- A game with hidden zones (e.g., hands in a card game).
- A game with public zones only (control case).
- A game with mixed visibility.

Place in `packages/engine/test/fixtures/mcts/` if files needed, or inline in test.

## Files to Touch

- `packages/engine/test/unit/agents/mcts/fairness.test.ts` (new)
- `packages/engine/test/fixtures/mcts/` (new directory, optional — only if fixture files needed)

## Out of Scope

- Tactical competence tests (win-in-1, block-loss-in-1) — ticket 013.
- Integration benchmarks vs RandomAgent/GreedyAgent — ticket 013.
- Solver correctness tests — ticket 014.
- Any production code changes.

## Acceptance Criteria

### Tests That Must Pass

1. Observation-equivalent states produce identical moves (tested with ≥3 different hidden configurations).
2. Future-RNG-different states produce identical moves (tested with ≥3 different RNG seeds in hidden state).
3. Visible-state preservation holds for ≥10 belief samples.
4. Input state immutability holds for `chooseMove` call.
5. Legality: returned move is in `legalMoves` array.
6. Availability: no assertion errors from ISUCT when moves have varying availability.
7. All tests are deterministic (use fixed seeds).
8. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Fairness properties hold for any valid `MctsConfig` (test with default and with varied iteration counts).
2. Tests use iteration-budget mode (deterministic), not wall-clock mode.
3. Tests do not depend on specific move choices beyond fairness guarantees.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/mcts/fairness.test.ts` — all 6 mandatory fairness/property tests.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/test/unit/agents/mcts/fairness.test.ts`
2. `pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

## Outcome

- **Completion date**: 2026-03-13
- **What changed**: Created `packages/engine/test/unit/agents/mcts/fairness.test.ts` (16 tests across 7 suites) covering all 6 mandatory fairness/property tests. All fixtures are inline — no fixture directory needed.
- **Deviations from plan**: No fixture files created in `packages/engine/test/fixtures/mcts/` — inline `GameDef`/`GameState` construction sufficed (ticket allowed this).
- **Verification results**:
  - `fairness.test.ts`: 16/16 pass
  - Full engine suite: 4395/4395 pass
  - Lint: 0 errors
  - Typecheck: 0 errors
