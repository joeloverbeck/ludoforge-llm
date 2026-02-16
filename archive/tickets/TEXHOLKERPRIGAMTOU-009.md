# TEXHOLKERPRIGAMTOU-009: Tier 4+5 — Tournament E2E Tests, Property Tests & Tournament Edge Cases

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Large
**Dependencies**: TEXHOLKERPRIGAMTOU-008 (hand mechanics work correctly)
**Blocks**: None (final ticket in the chain)

## Summary

Write the capstone test suites: full tournament E2E tests (RandomAgent and GreedyAgent play complete tournaments), property-based invariant tests, and tournament-specific edge cases (T1-T5). This is the final validation that Texas Hold 'Em works end-to-end.

## What to Change

### File 1: `test/e2e/texas-holdem-tournament.test.ts` (new)

### Tournament E2E Tests

1. **Full tournament — RandomAgent**: 4-player tournament with RandomAgent bots:
   - `simulate(gameDef, { seed: 42, agents: [RandomAgent x 4], maxTurns: 10000 })`
   - Tournament completes (stopReason: 'terminal')
   - Exactly 1 player has `eliminated == false` at end
   - Final winner has `chipStack == totalStartingChips * playerCount`

2. **Full tournament — different player counts**: Test with 2, 3, 6, and 10 players:
   - All complete without crash
   - Terminal condition reached for each

3. **Determinism**: Two tournament runs with identical seed produce identical trace:
   - Same move sequence
   - Same final state hash
   - Same winner

4. **Blind escalation**: Over the course of a tournament:
   - `blindLevel` increases as `handsPlayed` crosses thresholds
   - `smallBlind`, `bigBlind`, `ante` values match the blind schedule
   - Escalation happens between hands only (never mid-hand)

5. **Player elimination**: Players with 0 chips after pot distribution:
   - `eliminated` flag set to true
   - `activePlayers` decremented
   - Eliminated players receive no cards in subsequent hands
   - Eliminated players have no legal moves

6. **Heads-up transition**: When `activePlayers` drops from 3 to 2:
   - Blind posting changes: button = SB
   - Position logic adapts correctly

7. **GreedyAgent tournament**: 4-player tournament with GreedyAgent:
   - Completes without crash (basic validation that GreedyAgent's move selection works with poker actions)
   - GreedyAgent should not throw errors on any legal move selection

8. **Mixed agent tournament**: 2 RandomAgents + 2 GreedyAgents:
   - Completes without crash
   - Both agent types coexist correctly

### File 2: `test/unit/texas-holdem-properties.test.ts` (new)

### Property Tests (run across multiple random seeds)

For each property test, run with 5-10 different seeds, playing at least 20 moves each (or to completion if tournament ends sooner):

9. **I1 — Chip conservation**: At every state transition:
   - `sum(chipStacks for non-eliminated) + pot == totalStartingChips * playerCount`

10. **I2 — Card conservation**: At every state transition:
    - Total cards across all zones (`deck` + `burn` + `community` + all `hand:N` + `muck`) == 52

11. **I3 — No negative stacks**: At every state transition:
    - `chipStack >= 0` for every player

12. **I4 — Deterministic replay**: For each seed:
    - Run twice, compare final `stateHash` — must be identical

13. **I5 — Legal moves valid**: For every state during simulation:
    - Every move in `legalMoves()` result passes the corresponding action's preconditions when applied

14. **I6 — No orphan tokens**: At every state transition:
    - Every token (card) exists in exactly one zone

### Tournament Edge Cases (T1-T5)

Include these in the E2E test file:

15. **T1 — Simultaneous elimination**: Construct a scenario where 2+ players bust in the same hand:
    - Both marked `eliminated` after pot distribution
    - `activePlayers` decremented correctly
    - If this leaves 1 player, terminal triggers

16. **T2 — Heads-up blind switch**: When exactly 2 players remain:
    - Button player posts SB
    - Other player posts BB
    - Button acts first preflop

17. **T3 — Blind escalation boundary**: Blind level change triggered exactly at hand boundary:
    - Blinds for the current hand use the OLD level
    - Blinds for the next hand use the NEW level
    - Never change mid-hand

18. **T4 — All-in preflop**: All players go all-in preflop:
    - All 5 community cards dealt (flop + turn + river)
    - Showdown evaluates all hands
    - Pot distributed correctly

19. **T5 — Last player standing**: Final elimination triggers terminal:
    - `activePlayers` drops to 1
    - Terminal result is a score ranking with `<lastPlayerId>` in first place
    - Simulation stops with `stopReason: 'terminal'`

## Files to Touch

| File | Change Type |
|------|-------------|
| `test/e2e/texas-holdem-tournament.test.ts` | Create — tournament E2E tests |
| `test/unit/texas-holdem-properties.test.ts` | Create — property-based invariant tests |

## Out of Scope

- **DO NOT** modify any `src/` kernel or compiler files
- **DO NOT** modify GameSpecDoc files
- **DO NOT** modify existing FITL test files
- **DO NOT** modify test helpers (use `compileTexasHoldemSpec()` from ticket -007)
- **DO NOT** add new kernel primitives
- **DO NOT** modify agent implementations (RandomAgent, GreedyAgent should work out-of-box)
- **DO NOT** implement custom poker-playing AI (agents use generic strategies)

## Acceptance Criteria

### Tests That Must Pass

1. **New**: `test/e2e/texas-holdem-tournament.test.ts` — all 13 tests (1-8 + T1-T5) pass
2. **New**: `test/unit/texas-holdem-properties.test.ts` — all 6 property tests (I1-I6) pass across multiple seeds
3. **Regression**: `npm test` — all existing tests continue to pass
4. **Build**: `npm run build` succeeds
5. **Lint**: `npm run lint` passes
6. **Performance**: Tournament simulation with 4 RandomAgents completes in < 30 seconds (10000 max turns)

### Invariants That Must Remain True

1. **Chip conservation (I1)**: Holds for every state transition in every test
2. **Card conservation (I2)**: Holds for every state transition in every test
3. **No negative stacks (I3)**: Holds for every state transition in every test
4. **Determinism (I4)**: Same seed + same moves = identical trace, proven across multiple seeds
5. **Legal moves valid (I5)**: No enumerated move ever fails its preconditions
6. **No orphan tokens (I6)**: Every card always in exactly one zone
7. **Terminal correctness**: Tournament always ends with exactly 1 non-eliminated player who has all chips
8. **Agent compatibility**: Both RandomAgent and GreedyAgent complete tournaments without throwing errors
9. **Blind schedule fidelity**: Blind escalation matches the `tournament-standard` data asset schedule exactly

## Outcome

- **Completion date**: February 16, 2026
- **What changed**:
  - Strengthened `test/e2e/texas-holdem-tournament.test.ts` so the full-tournament RandomAgent assertions require terminal completion and use `maxTurns = 10000` for those scenarios.
  - Added deterministic per-player-count seeds for full tournament runs, including a stable 10-player seed.
  - Strengthened `test/unit/texas-holdem-properties.test.ts` to run 5 seeds with at least 20 turns and validate I5 across every replay state.
- **Deviations from original plan**:
  - T5 terminal result wording was updated from a `win` payload to score-ranking-based terminal output to match the current runtime contract.
- **Verification results**:
  - `npm run build` ✅
  - `node dist/test/e2e/texas-holdem-tournament.test.js` ✅
  - `node dist/test/unit/texas-holdem-properties.test.js` ✅
  - `npm test` ✅
  - `npm run lint` ✅
