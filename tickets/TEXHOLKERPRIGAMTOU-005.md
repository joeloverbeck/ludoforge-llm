# TEXHOLKERPRIGAMTOU-005: GameSpecDoc — Macros

**Status**: TODO
**Priority**: HIGH
**Effort**: Large
**Dependencies**: TEXHOLKERPRIGAMTOU-004 (vocabulary and data assets must exist for macros to reference them)
**Blocks**: TEXHOLKERPRIGAMTOU-006, TEXHOLKERPRIGAMTOU-007, TEXHOLKERPRIGAMTOU-008

## Summary

Write the `20-macros.md` file containing all reusable macro definitions for Texas Hold 'Em. These macros encode the core game logic — hand evaluation, betting mechanics, pot distribution, blind escalation — entirely in YAML using the kernel DSL primitives (including the three new ones from tickets -001 through -003).

## What to Change

### File: `data/games/texas-holdem/20-macros.md` (new)

Define the following macros:

### Macro 1: `hand-rank-score`

**Purpose**: Given a 5-card subset (via `evaluateSubset`'s `subsetBind`), compute a composite hand score.

**Logic** (all in YAML/kernel DSL, no engine code):
1. **Flush detection**: Count cards per suit using `aggregate(count)` with filter. Check if any suit count == 5.
2. **Straight detection**: Check all 10 consecutive rank windows (A-5 low straight through T-A broadway). Use conditional checks for each window.
3. **Rank frequency**: Count cards per rank using `aggregate(count)`. Detect pairs (count==2), trips (count==3), quads (count==4).
4. **Hand type classification**: Assign type value:
   - 0 = high card, 1 = one pair, 2 = two pair, 3 = three of a kind
   - 4 = straight, 5 = flush, 6 = full house, 7 = four of a kind
   - 8 = straight flush, 9 = royal flush (T-A straight flush)
5. **Composite score**: `handType * 10^10 + primary * 10^8 + secondary * 10^6 + kicker1 * 10^4 + kicker2 * 10^2 + kicker3`

**Note**: This is the most complex macro. It must handle:
- Ace playing low in A-2-3-4-5 (wheel)
- Kicker ordering for tiebreaking
- Full house: trips rank as primary, pair rank as secondary
- Two pair: higher pair as primary, lower pair as secondary, kicker as tertiary

### Macro 2: `collect-forced-bets`

**Purpose**: Post antes (if any), small blind, big blind. Handle short stacks going all-in.

**Logic**:
1. If `ante > 0`, iterate over active (non-eliminated) players and `commitResource` ante amount
2. Identify SB and BB positions based on `dealerSeat` and seat ordering
3. Post SB via `commitResource` (with all-in clamping if short)
4. Post BB via `commitResource` (with all-in clamping if short)
5. Update `currentBet = bigBlind`, `lastRaiseSize = bigBlind`
6. Update per-player `streetBet` and `totalBet` for blind posters

### Macro 3: `deal-community`

**Purpose**: Burn 1 card, then deal N cards to the community zone.

**Parameters**: `count` (number of cards to deal — 3 for flop, 1 for turn/river)

**Logic**:
1. `draw` 1 card from `deck` to `burn`
2. `draw` N cards from `deck` to `community`

### Macro 4: `betting-round-completion`

**Purpose**: Check if all non-folded, non-all-in players have matched `currentBet`. Set `bettingClosed` when true.

**Logic**:
1. Count players where `handActive == true AND allIn == false AND streetBet != currentBet`
2. If count == 0, set `bettingClosed = true`

### Macro 5: `side-pot-distribution`

**Purpose**: Distribute pot to winners, handling side pots when players are all-in at different contribution levels.

**Logic** (iterative pot layer approach):
1. Collect `totalBet` for each non-folded player → eligible players
2. Find minimum `totalBet` among eligible players
3. Create pot layer = `minBet * eligibleCount` (plus folded contributions up to that level)
4. For each eligible player: evaluate hand using `evaluateSubset` with `hand-rank-score` macro
5. Award pot layer to player(s) with highest hand score
6. Handle ties: split evenly, odd chip to earliest position (deterministic)
7. Subtract `minBet` from each eligible player's contribution
8. Remove players with zero remaining contribution
9. Repeat until all contributions exhausted

### Macro 6: `eliminate-busted-players`

**Purpose**: After pot distribution, mark players with `chipStack == 0` as eliminated.

**Logic**:
1. `forEach` over players where `chipStack == 0 AND eliminated == false`
2. Set `eliminated = true`
3. Decrement `activePlayers`

### Macro 7: `escalate-blinds`

**Purpose**: Increment blind level and update blind/ante amounts from the blind schedule.

**Logic**:
1. Check if `handsPlayed` has reached the threshold for current level
2. If so, increment `blindLevel`
3. Look up new SB, BB, ante from blind schedule data asset
4. Update `smallBlind`, `bigBlind`, `ante` global vars

## Files to Touch

| File | Change Type |
|------|-------------|
| `data/games/texas-holdem/20-macros.md` | Create |

## Out of Scope

- **DO NOT** modify any `src/` kernel or compiler files
- **DO NOT** write `30-rules-actions.md` (that's TEXHOLKERPRIGAMTOU-006)
- **DO NOT** modify existing FITL macros or data files
- **DO NOT** add test files (testing is in later tickets)
- **DO NOT** implement new kernel primitives — macros must use only existing primitives (setVar, addVar, forEach, if, let, draw, shuffle, createToken, moveToken, moveAll, commitResource, evaluateSubset, reveal, gotoPhase, rollRandom)
- **DO NOT** modify vocabulary or metadata files from ticket -004

## Acceptance Criteria

### Tests That Must Pass

1. **Regression**: `npm test` — all existing tests still pass
2. **Build**: `npm run build` succeeds (no source changes in this ticket)
3. **Manual verification**: YAML blocks parse without errors under YAML 1.2 strict

### Invariants That Must Remain True

1. **Valid YAML**: All fenced YAML blocks parse under YAML 1.2 strict mode
2. **Macro naming**: Macro IDs follow kebab-case convention consistent with FITL macros
3. **Variable references**: All variable names referenced in macros (`chipStack`, `pot`, `currentBet`, `streetBet`, `totalBet`, `handActive`, `allIn`, `eliminated`, `activePlayers`, `playersInHand`, etc.) match exactly the declarations in `10-vocabulary.md`
4. **Zone references**: All zone IDs referenced (`deck`, `burn`, `community`, `hand`, `muck`) match declarations in `10-vocabulary.md`
5. **Effect kinds**: Only use effect kinds that exist in the kernel (including the 3 new primitives from tickets -001 through -003)
6. **No game engine changes**: This is a pure data file — no TypeScript code
7. **Hand rank score**: The composite scoring formula must produce a total ordering over all 7,462 distinct poker hand ranks
8. **Chip conservation in side pots**: The total chips awarded across all pot layers must equal the total pot collected
9. **Deterministic tiebreaking**: All tie scenarios (split pots, odd chips) must resolve deterministically using seat position
