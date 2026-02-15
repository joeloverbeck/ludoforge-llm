# TEXHOLKERPRIGAMTOU-006: GameSpecDoc — Rules, Actions & Turn Structure

**Status**: TODO
**Priority**: HIGH
**Effort**: Large
**Dependencies**: TEXHOLKERPRIGAMTOU-004 (vocabulary), TEXHOLKERPRIGAMTOU-005 (macros)
**Blocks**: TEXHOLKERPRIGAMTOU-007, TEXHOLKERPRIGAMTOU-008, TEXHOLKERPRIGAMTOU-009

## Summary

Write the `30-rules-actions.md` file defining the turn structure (7 phases), turn order, and all 5 player actions (fold, check, call, raise, allIn). This file wires together the macros from ticket -005 with the vocabulary from ticket -004 to create the complete game flow.

## What to Change

### File: `data/games/texas-holdem/30-rules-actions.md` (new)

### 1. Turn Structure — 7 Phases

**Phase: `hand-setup`**
`onEnter` effects:
- Rotate dealer button to next non-eliminated player (advance `dealerSeat`)
- Determine SB/BB/UTG positions (handle heads-up special case: button = SB)
- Invoke `collect-forced-bets` macro
- Shuffle deck
- Create 52 card tokens in `deck` zone (if first hand) or move all cards from `muck` back to `deck` and shuffle
- Deal 2 hole cards to each active (non-eliminated) player via `draw` from `deck` to `hand:N`
- Reset per-hand variables: `streetBet=0`, `totalBet=0`, `handActive=true`, `allIn=false` for each player
- Set `handPhase=0`, `playersInHand=activePlayers`, `currentBet=bigBlind`, `bettingClosed=false`
- `gotoPhase: preflop`

**Phase: `preflop`**
`onEnter` effects:
- Set `actingPosition` = UTG (first player clockwise after BB)
- If only 1 player not all-in, skip betting → `gotoPhase: showdown`
- If `playersInHand == 1`, skip to hand-cleanup (everyone folded preflop in blinds — rare but possible with antes)

**Phase: `flop`**
`onEnter` effects:
- Invoke `deal-community(3)` macro
- Reset street variables: `streetBet=0` for all active players, `currentBet=0`, `lastRaiseSize=bigBlind`, `bettingClosed=false`
- Set `handPhase=1`
- Set `actingPosition` = first active player clockwise from dealer

**Phase: `turn`**
`onEnter` effects:
- Invoke `deal-community(1)` macro
- Reset street variables (same as flop)
- Set `handPhase=2`
- Set `actingPosition` = first active player clockwise from dealer

**Phase: `river`**
`onEnter` effects:
- Invoke `deal-community(1)` macro
- Reset street variables (same as flop)
- Set `handPhase=3`
- Set `actingPosition` = first active player clockwise from dealer

**Phase: `showdown`**
`onEnter` effects:
- Set `handPhase=4`
- Reveal all non-folded hands (`reveal` effect on each active player's `hand` zone, `to: 'all'`)
- For each non-folded player: `evaluateSubset` on (hand + community), subsetSize=5, using `hand-rank-score` macro
- Invoke `side-pot-distribution` macro
- Handle uncalled bet refund: if last bet was not fully called, return excess to bettor
- `gotoPhase: hand-cleanup`

**Phase: `hand-cleanup`**
`onEnter` effects:
- Move all cards from all zones to `muck` (`moveAll` from `community`, `hand:*`, `burn`, `deck` to `muck`)
- Invoke `eliminate-busted-players` macro
- Increment `handsPlayed`
- Invoke `escalate-blinds` macro (if threshold reached)
- Check terminal condition: if `activePlayers == 1`, the game ends (terminal evaluation takes over)
- If game continues: `gotoPhase: hand-setup`

### 2. Turn Order

```yaml
turnOrder:
  type: roundRobin
```

The actual seat-order logic is handled by `actingPosition` tracking in phase `onEnter` effects and action preconditions.

### 3. Actions (5)

**`fold`**:
- Actor: `active`
- Phases: `[preflop, flop, turn, river]`
- Pre: `handActive == true AND allIn == false`
- Effects: Set `handActive=false`, move hand cards to `muck`, decrement `playersInHand`
- Post-fold check: if `playersInHand == 1`, award pot to remaining player → `gotoPhase: hand-cleanup`

**`check`**:
- Actor: `active`
- Phases: `[preflop, flop, turn, river]`
- Pre: `streetBet == currentBet AND handActive == true AND allIn == false`
- Effects: No-op (advance to next player)
- Post-check: invoke `betting-round-completion` macro

**`call`**:
- Actor: `active`
- Phases: `[preflop, flop, turn, river]`
- Pre: `currentBet > streetBet AND handActive == true AND allIn == false`
- Effects: `commitResource` for `currentBet - streetBet` amount. Update `streetBet`, `totalBet`. Detect all-in if chip stack depleted.
- Post-call: invoke `betting-round-completion` macro

**`raise`**:
- Actor: `active`
- Phases: `[preflop, flop, turn, river]`
- Params: `raiseAmount` with domain `intsInRange(currentBet + lastRaiseSize, chipStack + streetBet)` — represents total bet to (not raise increment)
- Pre: `handActive == true AND allIn == false AND chipStack > currentBet + lastRaiseSize - streetBet` (can afford min raise)
- Effects: `commitResource` for `raiseAmount - streetBet`. Update `currentBet`, `lastRaiseSize = raiseAmount - currentBet`, `streetBet`, `totalBet`.
- Post-raise: reset betting closure tracking

**`allIn`**:
- Actor: `active`
- Phases: `[preflop, flop, turn, river]`
- Pre: `handActive == true AND allIn == false AND chipStack > 0`
- Effects: `commitResource` for entire `chipStack`. Set `allIn=true`. Update `streetBet`, `totalBet`. If `chipStack + streetBet > currentBet`, update `currentBet` and `lastRaiseSize`.
- Post-allIn: invoke `betting-round-completion` macro

### 4. Phase Transitions via Betting

After each betting action, check:
- If `playersInHand == 1` → `gotoPhase: hand-cleanup` (everyone folded)
- If `bettingClosed == true` → advance to next street:
  - preflop → flop
  - flop → turn
  - turn → river
  - river → showdown
- If all active (non-folded) players are all-in → skip remaining streets, deal community cards, `gotoPhase: showdown`

## Files to Touch

| File | Change Type |
|------|-------------|
| `data/games/texas-holdem/30-rules-actions.md` | Create |

## Out of Scope

- **DO NOT** modify any `src/` kernel or compiler files
- **DO NOT** modify vocabulary, metadata, data assets, or terminal files (ticket -004)
- **DO NOT** modify macros file (ticket -005)
- **DO NOT** modify existing FITL game spec files
- **DO NOT** add test files (testing is in later tickets)
- **DO NOT** implement new kernel primitives
- **DO NOT** modify agent code

## Acceptance Criteria

### Tests That Must Pass

1. **Regression**: `npm test` — all existing tests still pass
2. **Build**: `npm run build` succeeds (no source changes)
3. **Manual verification**: YAML blocks parse without errors under YAML 1.2 strict

### Invariants That Must Remain True

1. **Valid YAML**: All fenced YAML blocks parse under YAML 1.2 strict mode
2. **Phase IDs**: All 7 phase IDs (`hand-setup`, `preflop`, `flop`, `turn`, `river`, `showdown`, `hand-cleanup`) are unique and kebab-case
3. **Action IDs**: All 5 action IDs (`fold`, `check`, `call`, `raise`, `allIn`) are unique
4. **Variable references**: All variables referenced match declarations in `10-vocabulary.md` exactly
5. **Zone references**: All zones referenced match declarations in `10-vocabulary.md` exactly
6. **Macro references**: All macro invocations reference macros declared in `20-macros.md`
7. **Effect kinds**: Only use effect kinds that exist in the kernel
8. **Precondition completeness**: Every action's `pre` condition is sufficient to prevent illegal states (e.g., betting when already folded, raising without enough chips)
9. **Phase transition completeness**: Every phase has a clear exit path — no dead-end phases
10. **Heads-up correctness**: The phase logic correctly handles the 2-player special case (button = SB, SB acts first preflop, BB acts first postflop)
11. **Betting closure**: `bettingClosed` is correctly computed — all non-folded, non-all-in players have matched `currentBet`
12. **No circular `gotoPhase`**: No infinite phase loops possible (hand-cleanup → hand-setup is the only cycle, and it's guarded by terminal check)
