# TEXHOLKERPRIGAMTOU-008: Tier 3 - Texas Hand Mechanics Integration Tests

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Large
**Dependencies**: `archive/tickets/TEXHOLKERPRIGAMTOU-007.md` (Texas compile/structure contracts complete)
**Blocks**: TEXHOLKERPRIGAMTOU-009

## Summary

Add integration coverage that proves Texas Hold'em hand flow works when the compiled production `GameSpecDoc` executes through the kernel runtime (`initialState` -> `legalMoves` -> `applyMove` -> phase advancement). Focus on high-value behavior contracts at the game-runtime boundary.

## Assumptions Reassessed (2026-02-16)

The previous ticket text assumed APIs and test structure that do not match the repository:

1. Canonical helper is `compileTexasProductionSpec()` in `test/helpers/production-spec-helpers.ts`.
2. `compileTexasHoldemSpec()` does not exist and must not be added as aliasing.
3. Existing Texas runtime integration coverage already lives in `test/integration/texas-runtime-bootstrap.test.ts`.
4. Texas compile/structure checks already exist in `test/unit/texas-holdem-spec-structure.test.ts`.
5. The production Texas rules encode all behavior in YAML/macros (`data/games/texas-holdem/*.md`); tests should validate runtime outcomes, not hardcode alternative rule engines in test code.
6. "Uncalled bet refund" is currently represented by side-pot layer accounting and chip conservation; there is no separate refund variable/event contract.
7. Detailed 5-card ranking ordering is already strongly exercised at primitive level (`test/unit/kernel/evaluate-subset.test.ts`); this ticket should verify integration between phases/actions/showdown distribution, not duplicate primitive internals.
8. `applyMove()` auto-advances to the next decision point; in current Texas flow this can skip through no-decision street transitions. Street-dealing assertions should use phase lifecycle stepping (`advancePhase`) rather than assuming intermediate decision points always exist.

## Architecture Decision

The original 22-case list mixed runtime integration contracts with low-level primitive restatement and brittle state injection assumptions. This ticket is narrowed to stable public-surface integration tests that are:

- engine-agnostic and data-driven (no game-specific logic in kernel code),
- deterministic and seed-reproducible,
- targeted at hand-flow regressions that would break real play.

This is more beneficial than the prior shape because it avoids overfitting tests to implementation details while still validating tournament-critical behavior.

## What to Change

### File 1: `test/integration/texas-holdem-hand.test.ts` (new)

Create a dedicated integration suite that uses only runtime public APIs and production-spec helper:

- `compileTexasProductionSpec()` + `assertValidatedGameDef()`
- `initialState(def, seed, playerCount)`
- `advanceToDecisionPoint(def, state)` when entering actionable states
- `legalMoves(def, state)`
- `applyMove(def, state, move)`

### Required test coverage

1. **Hand setup/deal invariants**
- After advancing from seed state to first decision point, each non-eliminated player has exactly 2 cards.
- Card conservation remains 52 across `deck`, `burn`, `community`, `hand:*`, `muck`.

2. **Street progression and burn/community counts**
- Across preflop -> flop -> turn -> river phase transitions, burn/community/deck counts match expected progression (validated via phase lifecycle stepping).

3. **Action legality surface contracts**
- During betting rounds, legal actions match preconditions encoded in Texas actions:
  - `check` requires `streetBet == currentBet`
  - `call` requires `currentBet > streetBet`
  - `raise` domain starts at `currentBet + lastRaiseSize`
  - `allIn` requires positive `chipStack`

4. **Heads-up positional contracts**
- In 2-player setup, button posts SB, other player posts BB.
- Button acts first preflop.

5. **All-in closes betting path**
- When remaining non-folded players are all-in, runtime auto-advances to resolve remaining streets/showdown without requiring impossible actions.

6. **Showdown and side-pot distribution contracts**
- With deterministic seeded play or controlled betting sequence leading to uneven contributions:
  - side-pot math preserves chips,
  - only eligible contributors can win each layer,
  - odd-chip remainder distribution is deterministic.

7. **Early fold hand termination contract**
- When hand reduces to one `handActive` player, flow resolves without traversing unnecessary betting decisions.

8. **Per-transition invariants in integration run**
- Chip conservation: `sum(chipStack) + pot` remains constant.
- No negative chip stacks.
- Determinism under same seed + move policy.

### File 2: `test/helpers/texas-holdem-hand-test-helpers.ts` (optional)

Add only if it removes duplication in the integration suite. Keep helper generic and runtime-facing (no test-only game logic).

## Files to Touch

| File | Change Type |
|------|-------------|
| `test/integration/texas-holdem-hand.test.ts` | Create - integration hand mechanics suite |
| `test/helpers/texas-holdem-hand-test-helpers.ts` | Create only if needed |

## Out of Scope

- Do not add/rename Texas compile helper aliases.
- Do not duplicate primitive unit tests for `evaluateSubset` scoring internals.
- Do not modify FITL tests.
- Do not add tournament-long E2E/property suites (ticket `-009`).

## Acceptance Criteria

### Tests That Must Pass

1. `test/integration/texas-holdem-hand.test.ts` passes.
2. `npm run build` passes.
3. `npm run lint` passes.
4. `npm test` passes.

### Runtime invariants to assert in new integration coverage

1. Card conservation across zones.
2. Chip conservation across stacks + pot.
3. No negative stacks.
4. Deterministic replay for fixed seed/policy in covered scenarios.
5. Betting legality surfaces remain consistent with action preconditions.
6. Side-pot distribution does not create/lose chips.

## Outcome

- Completion date: 2026-02-16
- What was actually changed:
- Added `test/integration/texas-holdem-hand.test.ts` with 7 integration tests covering:
  - initial hand setup/dealing invariants and uniqueness,
  - deterministic flop/turn/river dealing contracts via phase lifecycle stepping,
  - preflop legality contracts (`check`/`call`/`raise`/`allIn`),
  - early-fold hand termination behavior,
  - forced 3-way all-in auto-resolution with side-pot eligibility bounds and conservation checks,
  - deterministic replay under fixed seed/policy,
  - per-transition conservation and non-negative-stack invariants.
- Reassessed and corrected ticket assumptions/scope twice before and during implementation (helper naming, existing test architecture, decision-point auto-advance behavior).
- Deviations from original plan:
- Replaced brittle expectations about guaranteed intermediate decision points with phase-lifecycle assertions (`advancePhase`) for street dealing checks.
- Scoped out direct BB-option/postflop-action assertions from this ticket because current runtime decision-point progression auto-resolves no-decision segments; left behavior documented in assumptions.
- Verification results:
- `npm run build` passed.
- `npm run lint` passed.
- `npm test` passed (full unit + integration suite).
