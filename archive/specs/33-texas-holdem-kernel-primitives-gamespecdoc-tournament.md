# Spec 33: Texas Hold 'Em — Kernel Primitives, GameSpecDoc & Tournament

**Status**: ✅ COMPLETED
**Priority**: P1
**Complexity**: XL
**Dependencies**: Core engine (specs 01-10 complete), FITL patterns as reference
**Estimated effort**: 8-12 days
**Source**: brainstorming/texas-hold-em-rules.md

## Context

LudoForge-LLM's core engine is proven with Fire in the Lake (FITL) — a complex COIN-series wargame. To validate the engine's game-agnosticism and identify abstractions that should be elevated from game-specific to structural, we're implementing Texas Hold 'Em No-Limit poker as a second game.

Texas Hold 'Em is an excellent stress-test because it exercises fundamentally different game mechanics than FITL: hidden information, card evaluation, resource commitment (betting), and player elimination — all of which must be expressible in the existing game-agnostic kernel or via new generic primitives.

**Goal**: A fully playable single-table tournament (2-10 players) encoded entirely in GameSpecDoc YAML files, compiled to GameDef JSON, and playable by existing bots (RandomAgent, GreedyAgent).

## Phase 1: Kernel Primitives (3 new generic effects)

### 1.1 `reveal` Effect

**Purpose**: Disclose hidden zone/token information to specified observers. Generic hidden-info primitive shared with FITL (underground guerrillas) and any game with fog-of-war, private hands, or selective information disclosure.

**AST shape** (new variant in `EffectAST`):
```typescript
{
  reveal: {
    zone: ZoneRef;                    // zone to reveal (e.g., 'hand:0')
    to: 'all' | PlayerSel;           // who sees it ('all' for showdown)
    filter?: TokenFilterPredicate[];  // optional: reveal only matching tokens
  }
}
```

**Kernel behavior**:
- Adds/updates a `revealedTo` map in `GameState` tracking which zones/tokens are visible to which players
- For `to: 'all'`, marks zone as publicly visible (equivalent to moving to a public zone, but without physical movement)
- For `to: PlayerSel`, adds that player to the zone's observer set

**GameState impact** — new field:
```typescript
readonly reveals?: Readonly<Record<string, readonly PlayerId[]>>;
// key = zoneId, value = list of players who can see it (beyond normal visibility)
```

**Files to modify**:
- `src/kernel/types-ast.ts` — add `reveal` to `EffectAST` union
- `src/kernel/types-core.ts` — add `reveals` to `GameState`
- `src/kernel/schemas-ast.ts` — add Zod schema for reveal effect
- `src/kernel/schemas-core.ts` — add reveals schema to GameState schema
- `src/kernel/apply-effects.ts` — implement reveal effect application
- `src/cnl/compile-effects.ts` — compile reveal YAML to AST
- `src/cnl/compile-lowering.ts` — handle reveal in lowering pass
- `src/kernel/validate-gamedef-behavior.ts` — validate reveal references

**Tests**:
- Unit: reveal changes GameState.reveals correctly
- Unit: reveal with filter only reveals matching tokens
- Unit: reveal to 'all' marks zone as publicly visible
- Integration: reveal + legal move enumeration respects visibility

### 1.2 `evaluateSubset` Effect

**Purpose**: Iterate all C(N,K) subsets of a token collection, evaluate each with a multi-step scoring computation, and bind the best score and winning subset. Generic primitive for any game needing "best K from N" evaluation (card games, tile scoring, set collection).

**AST shape** (new variant in `EffectAST`):
```typescript
{
  evaluateSubset: {
    source: OptionsQuery;             // tokens to choose from (e.g., 7 cards)
    subsetSize: NumericValueExpr;     // K (e.g., 5 for poker)
    subsetBind: string;               // binds current subset for inner effects
    compute: EffectAST[];             // effects that compute intermediate values per subset
    scoreExpr: NumericValueExpr;      // final score using computed bindings
    resultBind: string;               // binds the BEST score across all subsets
    bestSubsetBind?: string;          // optionally binds the winning subset's tokens
    in: EffectAST[];                  // continuation effects using bound values
  }
}
```

**Kernel behavior**:
1. Resolve `source` to get N tokens
2. Generate all C(N,K) subsets
3. For each subset: bind subset tokens to `subsetBind`, execute `compute` effects (which create local `let` bindings), evaluate `scoreExpr`
4. Track the subset with the highest score
5. Bind best score to `resultBind`, best subset to `bestSubsetBind`
6. Execute `in` continuation effects

**Performance**: C(7,5)=21 subsets is trivial. C(10,5)=252 is still fast. The kernel should validate K <= N and warn for large combinations.

**Files to modify**:
- `src/kernel/types-ast.ts` — add `evaluateSubset` to `EffectAST` union
- `src/kernel/schemas-ast.ts` — add Zod schema
- `src/kernel/apply-effects.ts` — implement subset enumeration + scoring
- `src/cnl/compile-effects.ts` — compile YAML to AST
- `src/cnl/compile-lowering.ts` — handle in lowering pass

**Tests**:
- Unit: correct C(N,K) enumeration (C(5,3)=10, C(7,5)=21)
- Unit: simple scoring expression finds correct max
- Unit: bestSubsetBind contains the winning tokens
- Unit: compute effects can create intermediate bindings
- Integration: poker hand evaluation produces correct rankings for known hands

### 1.3 `commitResource` Effect

**Purpose**: Atomically transfer a resource amount from a player variable to a target variable, with built-in validation and all-in clamping. Generic primitive for any game with resource commitment (auction, bidding, wagering).

**AST shape** (new variant in `EffectAST`):
```typescript
{
  commitResource: {
    from: { scope: 'pvar'; player: PlayerSel; var: string };  // source variable
    to: { scope: 'global' | 'pvar'; var: string; player?: PlayerSel };  // destination
    amount: NumericValueExpr;   // how much to transfer
    min?: NumericValueExpr;     // minimum required (source < min → transfer all remaining)
    max?: NumericValueExpr;     // maximum allowed
    actualBind?: string;        // bind the actual transferred amount (may differ if all-in)
  }
}
```

**Kernel behavior**:
1. Evaluate `amount`, clamp to [0, source balance]
2. If clamped amount < `min`, transfer ALL remaining (all-in semantics)
3. If clamped amount > `max`, cap at `max`
4. Deduct from source, add to destination
5. Bind actual transferred amount to `actualBind` (useful for detecting all-in)

**Files to modify**:
- `src/kernel/types-ast.ts` — add `commitResource` to `EffectAST` union
- `src/kernel/schemas-ast.ts` — add Zod schema
- `src/kernel/apply-effects.ts` — implement atomic transfer
- `src/cnl/compile-effects.ts` — compile YAML to AST
- `src/cnl/compile-lowering.ts` — handle in lowering pass

**Tests**:
- Unit: exact transfer when amount <= source
- Unit: all-in clamping when amount > source
- Unit: all-in when source < min
- Unit: max capping
- Unit: actualBind reflects true transferred amount
- Property: source + destination totals preserved (no chips created/destroyed)

## Phase 2: Texas Hold 'Em GameSpecDoc Files

### File structure

```
data/games/texas-holdem/
├── 00-metadata.md
├── 10-vocabulary.md
├── 20-macros.md
├── 30-rules-actions.md
├── 40-content-data-assets.md
└── 90-terminal.md
```

### 2.1 `00-metadata.md`

```yaml
metadata:
  id: texas-holdem-nlhe-tournament
  players:
    min: 2
    max: 10
  defaultScenarioAssetId: tournament-standard
  maxTriggerDepth: 5
```

### 2.2 `10-vocabulary.md`

**Zones**:
| Zone ID | Owner | Visibility | Ordering | Purpose |
|---------|-------|------------|----------|---------|
| `deck` | none | hidden | stack | 52-card shuffled deck |
| `burn` | none | hidden | set | Burned cards |
| `community` | none | public | queue | Up to 5 shared cards |
| `hand` | player | owner | set | 2 private hole cards |
| `muck` | none | hidden | set | Folded/discarded cards |

**Per-player variables**:
| Variable | Type | Init | Min | Max | Purpose |
|----------|------|------|-----|-----|---------|
| `chipStack` | int | (from scenario) | 0 | 1000000 | Player's chip count |
| `streetBet` | int | 0 | 0 | 1000000 | Amount bet this street |
| `totalBet` | int | 0 | 0 | 1000000 | Total committed this hand |
| `handActive` | boolean | true | - | - | Still in the hand (not folded) |
| `allIn` | boolean | false | - | - | Player is all-in |
| `eliminated` | boolean | false | - | - | Busted from tournament |
| `seatIndex` | int | (from scenario) | 0 | 9 | Fixed seat position |

**Global variables**:
| Variable | Type | Init | Min | Max | Purpose |
|----------|------|------|-----|-----|---------|
| `pot` | int | 0 | 0 | 10000000 | Current pot total |
| `currentBet` | int | 0 | 0 | 1000000 | Highest bet this street |
| `lastRaiseSize` | int | 0 | 0 | 1000000 | Minimum raise increment |
| `dealerSeat` | int | 0 | 0 | 9 | Dealer button position |
| `smallBlind` | int | 10 | 1 | 1000000 | Current SB amount |
| `bigBlind` | int | 20 | 1 | 1000000 | Current BB amount |
| `ante` | int | 0 | 0 | 1000000 | Current ante amount |
| `blindLevel` | int | 0 | 0 | 100 | Current blind level index |
| `handsPlayed` | int | 0 | 0 | 100000 | Hand count for escalation |
| `handPhase` | int | 0 | 0 | 4 | 0=preflop,1=flop,2=turn,3=river,4=showdown |
| `activePlayers` | int | (from scenario) | 0 | 10 | Non-eliminated player count |
| `actingPosition` | int | 0 | 0 | 9 | Current seat to act |
| `bettingClosed` | boolean | false | - | - | All active players matched |

**Derived occupancy rule**:
- Do not persist a separate `playersInHand` counter.
- Hand occupancy is derived on demand as: `count(handActive == true && eliminated == false)`.
- Any branch that needs "players left in hand" must use this derived expression directly.

### 2.3 `20-macros.md`

Key macros (game-specific logic in YAML, not kernel code):

**`hand-rank-score`**: Given a 5-card subset (via evaluateSubset's subsetBind), computes:
- Flush detection: count cards per suit, check if any count == 5
- Straight detection: check all 10 consecutive rank windows (A-5 through T-A)
- Rank frequency: count cards per rank, detect pairs/trips/quads
- Hand type classification: 0=high card through 9=straight flush
- Composite score: `handType * 10^10 + primary * 10^8 + kicker1 * 10^6 + ...`

**`collect-forced-bets`**: Posts antes (if any), SB, BB, handles short blinds as all-in.

**`deal-community`**: Burns 1 card, deals N community cards (3 for flop, 1 for turn/river).

**`live-hands-at-most-one` / `live-hands-more-than-one` (condition macros)**:
- Canonical hand-occupancy predicates reused across preflop/advance/showdown routing.
- Removes duplicated aggregate conditions while keeping routing game-authored in GameSpecDoc.

**`betting-round-completion`**: Checks if all non-folded, non-all-in players have matched `currentBet`. Sets `bettingClosed` when true.

**`award-uncontested-pot`**: Awards full remaining `pot` to the single remaining active, non-eliminated hand and resets `totalBet`.

**`distribute-contested-pots`**: Iterates over contribution tiers using `forEach` over max-player range:
1. Find min `totalBet` among eligible players
2. Create pot layer = `minBet * eligibleCount`
3. Evaluate hands for eligible players using `evaluateSubset`
4. Award pot layer to winner(s), handle odd-chip rule
5. Subtract tier from contributions, repeat

**`eliminate-busted-players`**: After pot distribution, mark players with `chipStack == 0` as `eliminated`, decrement `activePlayers`.

**`escalate-blinds`**: Increment `blindLevel`, update `smallBlind`, `bigBlind`, `ante` from blind schedule data asset.

### 2.4 `30-rules-actions.md`

**Turn structure** (phases):
```yaml
turnStructure:
  phases:
    - id: hand-setup
      onEnter:
        - # Rotate dealer button to next non-eliminated player
        - # Determine SB/BB/UTG positions (heads-up special case)
        - # Call collect-forced-bets macro
        - # Shuffle deck, deal 2 hole cards to each active player
        - # Set handPhase = 0, reset per-hand variables
        - # Goto preflop phase

    - id: preflop
      onEnter:
        - # Set actingPosition = UTG (first after BB)
        - # If derived hand occupancy <= 1, skip to showdown

    - id: flop
      onEnter:
        - # deal-community(3) macro
        - # Reset street variables (streetBet, currentBet, lastRaiseSize)
        - # Set actingPosition = first active player clockwise from dealer

    - id: turn
      onEnter:
        - # deal-community(1) macro
        - # Reset street variables

    - id: river
      onEnter:
        - # deal-community(1) macro
        - # Reset street variables

    - id: showdown
      onEnter:
        - # Reveal all non-folded hands
        - # For each player: evaluateSubset(hand + community, 5, hand-rank-score)
        - # If only one active hand remains: award-uncontested-pot
        - # Else: distribute-contested-pots
        - # Goto hand-cleanup

    - id: hand-cleanup
      onEnter:
        - # Move all cards to muck
        - # Call eliminate-busted-players macro
        - # Increment handsPlayed
        - # Call escalate-blinds if threshold reached
        - # Check terminal (activePlayers == 1)
        - # Goto hand-setup for next hand
```

**Turn order**:
```yaml
turnOrder:
  type: roundRobin
```

**Actions**:
```yaml
actions:
  - id: fold
    actor: active
    phase: [preflop, flop, turn, river]
    pre: { op: '==', left: { ref: pvar, player: actor, var: handActive }, right: true }
    effects:
      - setVar: { scope: pvar, player: actor, var: handActive, value: false }
      - # Move hand cards to muck
      - # No playersInHand counter mutation; occupancy is derived from per-player flags

  - id: check
    actor: active
    phase: [preflop, flop, turn, river]
    pre:
      op: and
      args:
        - { op: '==', left: { ref: pvar, player: actor, var: streetBet }, right: { ref: gvar, var: currentBet } }
        - { op: '==', left: { ref: pvar, player: actor, var: handActive }, right: true }
    effects: []  # No-op, advance to next player

  - id: call
    actor: active
    phase: [preflop, flop, turn, river]
    pre:
      op: and
      args:
        - { op: '>', left: { ref: gvar, var: currentBet }, right: { ref: pvar, player: actor, var: streetBet } }
        - { op: '==', left: { ref: pvar, player: actor, var: handActive }, right: true }
        - { op: '==', left: { ref: pvar, player: actor, var: allIn }, right: false }
    effects:
      - commitResource:
          from: { scope: pvar, player: actor, var: chipStack }
          to: { scope: global, var: pot }
          amount: { op: '-', left: { ref: gvar, var: currentBet }, right: { ref: pvar, player: actor, var: streetBet } }
          actualBind: callAmount
      - # Update streetBet, totalBet, detect all-in

  - id: raise
    actor: active
    phase: [preflop, flop, turn, river]
    params:
      - name: raiseAmount
        domain:
          query: intsInRange
          min: { op: '+', left: { ref: gvar, var: currentBet }, right: { ref: gvar, var: lastRaiseSize } }
          max: { ref: pvar, player: actor, var: chipStack }
    pre:
      op: and
      args:
        - { op: '==', left: { ref: pvar, player: actor, var: handActive }, right: true }
        - { op: '==', left: { ref: pvar, player: actor, var: allIn }, right: false }
        - # chipStack > currentBet + lastRaiseSize (can afford min raise)
    effects:
      - commitResource:
          from: { scope: pvar, player: actor, var: chipStack }
          to: { scope: global, var: pot }
          amount: { ref: binding, name: raiseAmount }
          actualBind: raisedAmount
      - # Update currentBet, lastRaiseSize, streetBet, totalBet

  - id: allIn
    actor: active
    phase: [preflop, flop, turn, river]
    pre:
      op: and
      args:
        - { op: '==', left: { ref: pvar, player: actor, var: handActive }, right: true }
        - { op: '==', left: { ref: pvar, player: actor, var: allIn }, right: false }
        - { op: '>', left: { ref: pvar, player: actor, var: chipStack }, right: 0 }
    effects:
      - commitResource:
          from: { scope: pvar, player: actor, var: chipStack }
          to: { scope: global, var: pot }
          amount: { ref: pvar, player: actor, var: chipStack }
          actualBind: allInAmount
      - setVar: { scope: pvar, player: actor, var: allIn, value: true }
      - # Update streetBet, totalBet, possibly currentBet and lastRaiseSize
```

### 2.5 `40-content-data-assets.md`

**Card deck** (52 tokens with rank + suit properties):
```yaml
dataAssets:
  - id: standard-52-deck
    kind: pieceCatalog
    payload:
      pieceTypes:
        - id: card
          props:
            rank: int      # 2-14 (2=2, ..., 14=Ace)
            suit: int      # 0=spades, 1=hearts, 2=diamonds, 3=clubs
            rankName: string  # '2','3',...,'K','A'
            suitName: string  # 'S','H','D','C'
      inventory:
        # 52 cards created in setup phase via createToken

  - id: tournament-standard
    kind: scenario
    payload:
      startingChips: 1000
      blindSchedule:
        - { level: 0, sb: 10, bb: 20, ante: 0, handsUntilNext: 10 }
        - { level: 1, sb: 15, bb: 30, ante: 0, handsUntilNext: 10 }
        - { level: 2, sb: 25, bb: 50, ante: 5, handsUntilNext: 10 }
        - { level: 3, sb: 50, bb: 100, ante: 10, handsUntilNext: 8 }
        - { level: 4, sb: 75, bb: 150, ante: 15, handsUntilNext: 8 }
        - { level: 5, sb: 100, bb: 200, ante: 25, handsUntilNext: 6 }
        - { level: 6, sb: 150, bb: 300, ante: 50, handsUntilNext: 6 }
        - { level: 7, sb: 200, bb: 400, ante: 50, handsUntilNext: 5 }
        - { level: 8, sb: 300, bb: 600, ante: 75, handsUntilNext: 5 }
        - { level: 9, sb: 500, bb: 1000, ante: 100, handsUntilNext: 5 }
```

### 2.6 `90-terminal.md`

```yaml
terminal:
  conditions:
    - when: { op: '==', left: { ref: gvar, var: activePlayers }, right: 1 }
      result:
        type: win
        player: # player where eliminated == false
  scoring:
    method: highest
    value: { ref: pvar, player: actor, var: chipStack }
```

## Phase 3: Testing

### Tier 1 — Kernel primitive unit tests

**File**: `test/unit/kernel/reveal.test.ts`
- reveal changes GameState.reveals correctly
- reveal with filter only reveals matching tokens
- reveal to 'all' marks zone as publicly visible
- reveal to specific player adds to observer set
- multiple reveals accumulate (don't overwrite)

**File**: `test/unit/kernel/evaluate-subset.test.ts`
- correct C(N,K) enumeration: C(5,3)=10, C(7,5)=21, C(4,2)=6
- simple scoring: find max sum-of-values in subsets
- bestSubsetBind contains the winning tokens
- compute effects create intermediate bindings usable in scoreExpr
- ties: first-encountered subset wins (deterministic)
- edge: K=N returns the full set
- edge: K=0 or K>N handled gracefully

**File**: `test/unit/kernel/commit-resource.test.ts`
- exact transfer: amount <= source balance
- all-in clamping: amount > source → transfers all remaining
- all-in trigger: source < min → transfers all remaining
- max capping: amount > max → capped at max
- actualBind reflects true transferred amount
- zero transfer: amount = 0
- property: source + destination total preserved

### Tier 2 — GameSpecDoc compilation tests

**File**: `test/unit/compile-texas-holdem.test.ts`
- Parse all 6 Texas Hold 'Em spec files
- Validate parsed doc against schemas
- Compile to GameDef JSON without errors
- Verify all zones present (deck, burn, community, hand, muck)
- Verify all variables present (chipStack, pot, currentBet, etc.)
- Verify all actions present (fold, check, call, raise, allIn)
- Verify all phases present (hand-setup through hand-cleanup)
- Verify macro expansion produces valid effects

### Tier 3 — Hand mechanics tests

**File**: `test/integration/texas-holdem-hand.test.ts`
- Dealing: correct card count per player, burn cards consumed
- Betting round: fold/check/call/raise/allIn enumerated as legal moves
- Showdown: hand evaluation produces correct rankings for known hands
- Side pots: correct distribution with 2-3 all-in players at different levels
- Heads-up: correct position logic (button = SB)
- Uncalled bet refund: excess returned when all fold to bet

### Tier 4 — Tournament E2E tests

**File**: `test/e2e/texas-holdem-tournament.test.ts`
- Full tournament: RandomAgent plays 4-player tournament to completion
- Determinism: same seed = identical tournament trace
- Blind escalation: blinds increase on schedule
- Player elimination: busted players removed correctly
- Heads-up transition: blind posting changes at 2 players
- GreedyAgent: plays tournament without crash (basic strategy)

### Tier 5 — Property tests

**File**: `test/unit/texas-holdem-properties.test.ts`
- **I1 Chip conservation**: sum(chipStacks) + pot == totalStartingChips * playerCount
- **I2 Card conservation**: 52 cards across all zones at all times
- **I3 No negative stacks**: chipStack >= 0 always
- **I4 Deterministic replay**: same seed + same moves = identical stateHash
- **I5 Legal moves valid**: every enumerated move passes preconditions
- **I6 No orphan tokens**: every card in exactly one zone

### Edge case tests (integrated into Tier 3 and 4)

**Betting edge cases** (B1-B7):
- B1: Short blind → player posts all-in for less than blind amount
- B2: Short all-in raise → does NOT reopen betting for already-acted players
- B3: Multiple all-ins at different levels → correct side pot creation
- B4: All players all-in → auto-deal remaining community cards
- B5: Uncalled bet refund → excess returned to last bettor
- B6: Big blind option → BB can check or raise when no prior raise
- B7: Min raise tracking → lastRaiseSize correctly maintained

**Showdown edge cases** (S1-S6):
- S1: Multi-way pot split (3+ players tie)
- S2: Odd chip rule with 3-way tie (deterministic award)
- S3: Kicker comparison (same pair, different kickers)
- S4: Wheel straight (A-2-3-4-5, ace plays low)
- S5: Board plays (all players "play the board")
- S6: Full house tiebreak (higher trips wins)

**Tournament edge cases** (T1-T5):
- T1: Simultaneous elimination (2+ bust same hand)
- T2: Heads-up blind switch (Button = SB)
- T3: Blind escalation boundary (change between hands only)
- T4: All-in preflop (deal all community, evaluate)
- T5: Last player standing (terminal triggers)

## Implementation Phasing

### Ticket 1: Kernel Primitives
- Add `reveal` effect to types, schemas, compiler, and effect application
- Add `evaluateSubset` effect to types, schemas, compiler, and effect application
- Add `commitResource` effect to types, schemas, compiler, and effect application
- Write Tier 1 unit tests (all 3 primitives)
- Verify existing FITL tests still pass (no regression)

### Ticket 2: GameSpecDoc Files
- Create `data/games/texas-holdem/` directory with all 6 files
- Write `00-metadata.md`, `10-vocabulary.md`, `40-content-data-assets.md`, `90-terminal.md`
- Write `20-macros.md` (hand-rank-score, collect-forced-bets, deal-community, award-uncontested-pot, distribute-contested-pots, eliminate-busted, escalate-blinds)
- Write `30-rules-actions.md` (phases, turn order, all 5 actions)
- Write Tier 2 compilation tests

### Ticket 3: Hand Mechanics Tests
- Write Tier 3 integration tests
- Write betting edge case tests (B1-B7)
- Write showdown edge case tests (S1-S6)
- Debug and fix any issues found

### Ticket 4: Tournament E2E & Property Tests
- Write Tier 4 tournament E2E tests
- Write Tier 5 property tests
- Write tournament edge case tests (T1-T5)
- End-to-end validation: RandomAgent completes tournament

## Critical Files to Modify

### Kernel (Phase 1)
- `src/kernel/types-ast.ts` — 3 new EffectAST variants
- `src/kernel/types-core.ts` — `reveals` field on GameState
- `src/kernel/schemas-ast.ts` — Zod schemas for new effects
- `src/kernel/schemas-core.ts` — GameState schema update
- `src/kernel/apply-effects.ts` — effect application for all 3 primitives
- `src/cnl/compile-effects.ts` — YAML → AST compilation
- `src/cnl/compile-lowering.ts` — lowering pass for new effects
- `src/kernel/validate-gamedef-behavior.ts` — validation for new references

### GameSpecDoc (Phase 2)
- `data/games/texas-holdem/00-metadata.md` (new)
- `data/games/texas-holdem/10-vocabulary.md` (new)
- `data/games/texas-holdem/20-macros.md` (new)
- `data/games/texas-holdem/30-rules-actions.md` (new)
- `data/games/texas-holdem/40-content-data-assets.md` (new)
- `data/games/texas-holdem/90-terminal.md` (new)

### Tests (Phase 3-4)
- `test/unit/kernel/reveal.test.ts` (new)
- `test/unit/kernel/evaluate-subset.test.ts` (new)
- `test/unit/kernel/commit-resource.test.ts` (new)
- `test/unit/compile-texas-holdem.test.ts` (new)
- `test/integration/texas-holdem-hand.test.ts` (new)
- `test/e2e/texas-holdem-tournament.test.ts` (new)
- `test/unit/texas-holdem-properties.test.ts` (new)

### Existing utilities to reuse
- `test/helpers/production-spec-helpers.ts` — adapt pattern for Texas Hold 'Em spec loading
- `src/cnl/compiler-core.ts` — existing compilation pipeline (expandMacros, compileExpandedDoc)
- `src/kernel/apply-effects.ts` — extend existing effect switch
- `src/agents/random-agent.ts`, `src/agents/greedy-agent.ts` — existing bots (should work out-of-box)
- `src/sim/simulate.ts` — existing simulation runner

## Verification

1. **Build**: `npm run build` succeeds with no type errors
2. **Lint**: `npm run lint` passes
3. **Existing tests**: `npm test` — all existing tests pass (no regression)
4. **New unit tests**: `node --test dist/test/unit/kernel/reveal.test.js` etc.
5. **Compilation test**: Texas Hold 'Em spec compiles to valid GameDef JSON
6. **Simulation**: `simulate(gameDef, { seed: 42, agents: [RandomAgent x 4], maxTurns: 10000 })` completes without crash
7. **Determinism**: Two runs with same seed produce identical trace hashes
8. **Chip conservation**: Assert `sum(chipStacks) + pot == totalStartingChips * playerCount` at every state transition

## Outcome

- **Completion date**: 2026-02-17
- **What changed**:
  - Kernel primitives were implemented for hidden information reveal, subset evaluation, and resource commitment.
  - Texas Hold 'Em GameSpecDoc content and runtime wiring were added in the engine data/spec pipeline.
  - Texas Hold 'Em integration and end-to-end tournament tests were added to validate gameplay flow and tournament behavior.
- **Deviations from original plan**:
  - Implementation details were split into engine modules/files based on the current kernel architecture (for example, effect-dispatch and effect-specific modules) rather than a single monolithic effect file path listed in this spec.
- **Verification results**:
  - Texas Hold 'Em validation coverage is present in engine test suites, including integration/runtime bootstrap and e2e tournament scenarios (for example `packages/engine/test/integration/texas-runtime-bootstrap.test.ts` and `packages/engine/test/e2e/texas-holdem-tournament.test.ts`).
