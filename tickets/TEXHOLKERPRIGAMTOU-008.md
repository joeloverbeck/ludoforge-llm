# TEXHOLKERPRIGAMTOU-008: Tier 3 — Hand Mechanics Integration Tests + Betting & Showdown Edge Cases

**Status**: TODO
**Priority**: MEDIUM
**Effort**: Large
**Dependencies**: TEXHOLKERPRIGAMTOU-007 (compilation tests pass — spec compiles correctly)
**Blocks**: TEXHOLKERPRIGAMTOU-009

## Summary

Write integration tests that verify individual hand mechanics work correctly when the compiled Texas Hold 'Em GameDef is executed by the kernel. Covers dealing, betting rounds, hand evaluation, side pots, and all betting (B1-B7) and showdown (S1-S6) edge cases from the spec.

## What to Change

### File: `test/integration/texas-holdem-hand.test.ts` (new)

### Core Hand Mechanics Tests

1. **Dealing**: After `hand-setup` phase:
   - Each active player has exactly 2 cards in their `hand` zone
   - `deck` has 52 - (2 * playerCount) cards remaining
   - No cards in `burn`, `community`, or `muck` zones
   - All dealt cards are unique (no duplicates)

2. **Flop dealing**: After `flop` phase onEnter:
   - `burn` has 1 card, `community` has 3 cards
   - `deck` has 52 - (2 * playerCount) - 4 cards

3. **Turn dealing**: After `turn` phase onEnter:
   - `burn` has 2 cards, `community` has 4 cards

4. **River dealing**: After `river` phase onEnter:
   - `burn` has 3 cards, `community` has 5 cards

5. **Betting round — legal moves**: During a betting phase:
   - `fold` is available to active, non-all-in players
   - `check` is available when `streetBet == currentBet`
   - `call` is available when `currentBet > streetBet`
   - `raise` is available when player can afford min raise
   - `allIn` is available when player has chips > 0

6. **Hand evaluation**: At showdown with known cards:
   - Construct a state with known hole cards and community cards
   - Verify `evaluateSubset` produces correct hand ranking for known hands
   - Test: royal flush > straight flush > four of a kind > full house > flush > straight > three of a kind > two pair > one pair > high card

7. **Side pots**: With 2-3 all-in players at different chip levels:
   - Verify main pot and side pot(s) distributed correctly
   - Player with fewer chips can only win from main pot
   - Remaining players compete for side pot

8. **Heads-up position logic**: With 2 players:
   - Button/dealer = SB (posts small blind)
   - Non-button = BB (posts big blind)
   - SB acts first preflop, BB acts first postflop

9. **Uncalled bet refund**: When all players fold to a bet:
   - Excess (unmatched portion of last bet) returned to bettor
   - `chipStack` increased by refund amount
   - `pot` decreased accordingly

### Betting Edge Cases (B1-B7)

10. **B1 — Short blind**: Player with fewer chips than SB amount:
    - Posts all-in for less than blind
    - `allIn` flag set to true
    - Remaining blind amount NOT required from other players

11. **B2 — Short all-in raise**: Player goes all-in for less than a full raise:
    - Does NOT reopen betting for players who already acted
    - Players who haven't acted can still call or raise

12. **B3 — Multiple all-ins at different levels**: 3+ players all-in at different amounts:
    - Correct side pot creation (one per contribution tier)
    - Each pot awarded to best hand among eligible players

13. **B4 — All players all-in**: All remaining players are all-in:
    - Remaining community cards dealt automatically (no betting phases)
    - Skip to showdown

14. **B5 — Uncalled bet refund**: Last bet not fully called:
    - Excess chips returned to last bettor before pot distribution

15. **B6 — Big blind option**: When no raises preflop:
    - BB player can check (option to raise)
    - BB is last to act preflop

16. **B7 — Min raise tracking**: After a raise:
    - `lastRaiseSize` correctly set to the raise increment (difference between new bet and previous bet)
    - Next min raise = `currentBet + lastRaiseSize`

### Showdown Edge Cases (S1-S6)

17. **S1 — Multi-way pot split**: 3+ players tie with identical hand rankings:
    - Pot split evenly among tied players
    - Odd chip awarded deterministically (earliest position)

18. **S2 — Odd chip rule with 3-way tie**: Pot of 31 chips split 3 ways:
    - Two players get 10, one gets 11 (or similar deterministic resolution)

19. **S3 — Kicker comparison**: Two players with same pair, different kickers:
    - Higher kicker wins
    - Test: pair of aces with king kicker beats pair of aces with queen kicker

20. **S4 — Wheel straight**: A-2-3-4-5 straight:
    - Ace plays low (value 1, not 14)
    - Beats: high card, one pair, two pair, three of a kind
    - Loses to: 2-3-4-5-6 straight (higher straight)

21. **S5 — Board plays**: All 5 community cards form the best hand:
    - All remaining players "play the board"
    - Pot split evenly among all active players

22. **S6 — Full house tiebreak**: Two players with full houses:
    - Higher trips wins (AAA-22 beats KKK-AA)
    - Same trips, higher pair wins (AAA-KK beats AAA-QQ)

## Test Setup Helper

Create a helper function `setupHandState(config)` that:
- Compiles the Texas Hold 'Em spec (via `compileTexasHoldemSpec()`)
- Creates initial state with `initialState(gameDef, seed)`
- Optionally applies a sequence of setup moves to reach a desired game state
- Optionally injects specific cards into specific zones (for deterministic hand evaluation tests)

## Files to Touch

| File | Change Type |
|------|-------------|
| `test/integration/texas-holdem-hand.test.ts` | Create — integration test suite |
| `test/helpers/texas-holdem-helpers.ts` | Create — test setup helpers (optional, if needed) |

## Out of Scope

- **DO NOT** modify any `src/` kernel or compiler files
- **DO NOT** modify GameSpecDoc files (if bugs found, create amendment tickets)
- **DO NOT** write tournament-level E2E tests (that's ticket -009)
- **DO NOT** write property tests (that's ticket -009)
- **DO NOT** modify existing FITL test files
- **DO NOT** modify the production spec helper beyond what was done in ticket -007

## Acceptance Criteria

### Tests That Must Pass

1. **New**: `test/integration/texas-holdem-hand.test.ts` — all 22 tests above pass
2. **Regression**: `npm test` — all existing tests continue to pass
3. **Build**: `npm run build` succeeds
4. **Lint**: `npm run lint` passes

### Invariants That Must Remain True

1. **Card conservation**: 52 cards across all zones at all times during every test
2. **Chip conservation**: `sum(chipStacks) + pot == totalStartingChips * playerCount` at every state transition
3. **No negative stacks**: `chipStack >= 0` for all players at all times
4. **Deterministic**: Same seed + same move sequence = identical state (every test is reproducible)
5. **Legal moves valid**: Every move enumerated by `legalMoves()` passes its action's preconditions
6. **No orphan tokens**: Every card is in exactly one zone at all times
7. **Hand evaluation total ordering**: For any two distinct 5-card poker hands, the scoring function produces different scores (or correctly identifies a tie)
8. **Side pot math**: Total chips awarded across all pots == total pot collected (no chips created or lost)
