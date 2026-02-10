# Spec 06: Kernel — Game Loop & Triggers

**Status**: Draft
**Priority**: P0 (critical path)
**Complexity**: L
**Dependencies**: Spec 03, Spec 04, Spec 05
**Estimated effort**: 3-4 days
**Source sections**: Brainstorming sections 2.1C, 2.1D, 2.1E, 2.1H, 2.1I

## Overview

Implement the game loop — the orchestrator that ties together state initialization, legal move enumeration, move application, trigger dispatch, and terminal detection. This is the heart of the kernel: it initializes games from GameDefs, tells agents what moves are available, applies chosen moves (costs then effects), fires triggered effects with depth limiting, detects game-ending conditions, and advances phases/turns. All operations are deterministic and produce incrementally updated Zobrist hashes.

## Scope

### In Scope
- `initialState(def, seed)` — create starting game state with setup effects applied
- `legalMoves(def, state)` — enumerate all valid moves for current player
- `applyMove(def, state, move)` — validate, apply costs + effects, dispatch triggers, update hash
- `dispatchTriggers(def, state, event, depth)` — match and fire triggers with depth limit
- `terminalResult(def, state)` — evaluate end conditions
- Phase/turn advancement logic
- Zobrist hash maintenance (incremental updates after every state change)
- Action usage tracking (per-turn, per-phase, per-game limits)

### Out of Scope
- Simulation loop (Spec 10 — calls these functions in a loop with agents)
- Agent implementations (Spec 09)
- Spatial queries/effects (Spec 07 — stubbed in Spec 04/05, extended here only when Spec 07 lands)
- Game Spec parsing/compilation (Spec 08a/08b)
- Trace logging details (Spec 10)

## Key Types & Interfaces

### Public API

```typescript
// Create initial game state from definition + seed
function initialState(def: GameDef, seed: number): GameState;

// Enumerate all legal moves for the active player in the current phase
function legalMoves(def: GameDef, state: GameState): readonly Move[];

// Apply a move to the game state (validate, cost, effects, triggers, advance)
function applyMove(def: GameDef, state: GameState, move: Move): GameState;

// Check if game has reached a terminal condition
function terminalResult(def: GameDef, state: GameState): TerminalResult | null;
```

### Internal Functions

```typescript
// Dispatch triggers for a given event, with cascading depth tracking
function dispatchTriggers(
  def: GameDef,
  state: GameState,
  rng: Rng,
  event: TriggerEvent,
  depth: number,
  maxDepth: number,
  triggerLog: TriggerFiring[]
): { state: GameState; rng: Rng; triggerLog: TriggerFiring[] };

// Advance to next phase or next turn
function advancePhase(
  def: GameDef,
  state: GameState
): GameState;

// Reset per-turn action usage counters
function resetTurnUsage(state: GameState): GameState;

// Reset per-phase action usage counters
function resetPhaseUsage(state: GameState): GameState;

// Validate that a move is legal (throws if not)
function validateMove(def: GameDef, state: GameState, move: Move): void;

// Enumerate parameter domains for an action
function enumerateParamDomains(
  action: ActionDef,
  def: GameDef,
  state: GameState,
  actorPlayer: PlayerId
): readonly Record<string, unknown>[];
```

## Implementation Requirements

### initialState(def, seed)

1. Create PRNG from seed: `createRng(BigInt(seed))`
2. Create Zobrist table from GameDef: `createZobristTable(def)`
3. Initialize global variables from `def.globalVars` (each at its `init` value)
4. Initialize per-player variables from `def.perPlayerVars` for each player
5. Initialize all zones as empty arrays
6. Set `currentPhase` to first phase in `def.turnStructure.phases`
7. Set `activePlayer` to first player (PlayerId 0)
8. Set `turnCount` to 0
9. Initialize `actionUsage` as empty records
10. Apply `def.setup` effects via `applyEffects` (this populates zones with initial tokens, etc.)
11. Compute initial Zobrist hash via `computeFullHash`
12. Dispatch `phaseEnter` trigger for initial phase
13. Dispatch `turnStart` trigger for first player
14. Return complete GameState

### legalMoves(def, state)

For each action in `def.actions`:

1. **Phase filter**: Skip if `action.phase !== state.currentPhase`
2. **Actor filter**: Resolve `action.actor` via `resolvePlayerSel`. Skip if `state.activePlayer` is not in the resolved set.
3. **Limit check**: Check `action.limits` against `state.actionUsage[action.id]`. Skip if any limit exceeded:
   - `scope: 'turn'`: check `turnCount` against limit
   - `scope: 'phase'`: check `phaseCount` against limit
   - `scope: 'game'`: check `gameCount` against limit
4. **Enumerate parameter combinations**: For each `ParamDef` in `action.params`:
   - Evaluate `param.domain` via `evalQuery` to get possible values
   - Generate cartesian product of all parameter domains
5. **Precondition filter**: For each parameter combination:
   - Create bindings with param values
   - If `action.pre` is not null, evaluate via `evalCondition`
   - Include only combinations where precondition holds (or pre is null)
6. **Build Move**: For each valid combination, create `Move { actionId, params }`

**Performance note**: If cartesian product is large, evaluate preconditions lazily (filter during generation, not after full enumeration).

### applyMove(def, state, move)

1. **Validate**: Confirm move is in `legalMoves(def, state)`. If not, throw descriptive error.
2. **Look up action**: Find `ActionDef` by `move.actionId`
3. **Build context**: Create EffectContext with move params as bindings
4. **Apply costs**: `applyEffects(action.cost, ctx)` — deduct resources
5. **Apply effects**: `applyEffects(action.effects, ctx)` — execute main effects
6. **Update action usage**: Increment `actionUsage[action.id]` counters
7. **Dispatch trigger**: `dispatchTriggers(def, state, rng, { type: 'actionResolved', action: move.actionId }, 0, maxDepth, [])`
8. **Update Zobrist hash**: Incrementally update hash based on all state deltas (variable changes, token movements)
9. **Check phase advancement**: If action indicates end-of-phase, advance phase
10. **Check turn advancement**: If all phases complete, advance turn (next player, reset per-turn usage, dispatch turnEnd/turnStart triggers)
11. Return new GameState

### dispatchTriggers(def, state, rng, event, depth, maxDepth, triggerLog)

1. If `depth >= maxDepth`: return state as-is. Log truncation: `[TRUNCATED at depth {depth}]`. No partial effects.
2. For each trigger in `def.triggers`:
   - Match event type: does `trigger.event` match the dispatched event?
   - If trigger has `match` condition: evaluate against current state. Skip if false.
   - If trigger has `when` condition: evaluate against current state. Skip if false.
3. For each matched trigger (in definition order):
   - Apply `trigger.effects` via `applyEffects`
   - Record `TriggerFiring { triggerId, event, depth }`
   - Check if trigger effects produce new events (e.g., `tokenEntered` from moveToken)
   - Recursively dispatch new events at `depth + 1`
4. Return accumulated state + rng + triggerLog

**Cascade detection**: When effects move tokens, this may produce `tokenEntered` events. These are dispatched recursively at `depth + 1`. The depth limit prevents infinite cascades.

**Truncation behavior**: When depth limit is reached:
- State is returned as-is at truncation point
- No partial effects from the truncated trigger
- Full chain is logged in triggerLog
- The `TRIGGER_DEPTH_EXCEEDED` degeneracy flag is detectable from the trace

### terminalResult(def, state)

1. Evaluate `def.endConditions` in definition order
2. For each end condition:
   - Evaluate `condition.when` via `evalCondition`
   - If true: resolve `condition.result` to a `TerminalResult`
     - For `{ type: 'score' }`: compute scores using `def.scoring` for each player, rank them
     - For `{ type: 'win', player }`: resolve player selector
3. **First match wins** — return immediately on first true condition
4. If no condition is true: return `null` (game continues)

### Phase/Turn Advancement

**Phase advancement**:
1. Dispatch `phaseExit` trigger for current phase
2. Find next phase in `def.turnStructure.phases` (circular if phases repeat per turn)
3. Reset per-phase action usage
4. Set `state.currentPhase` to new phase
5. Dispatch `phaseEnter` trigger for new phase

**Turn advancement** (when last phase of a turn completes):
1. Dispatch `turnEnd` trigger
2. Increment `turnCount`
3. Advance `activePlayer` according to `def.turnStructure.activePlayerOrder`:
   - `'roundRobin'`: next player in circular order
   - `'fixed'`: same player continues (for solo or fixed-player games)
4. Reset per-turn action usage
5. Reset phase to first phase
6. Dispatch `turnStart` trigger for new active player
7. Dispatch `phaseEnter` trigger for first phase

## Invariants

1. `initialState` produces deterministic state for any given seed
2. `legalMoves` returns only moves whose preconditions hold (no illegal moves in output)
3. `legalMoves` returns all valid moves (completeness — no valid move is missing)
4. `applyMove` on a legal move never throws (total function for legal inputs)
5. `applyMove` on an illegal move throws descriptive error with move details and reason
6. Trigger depth never exceeds `maxTriggerDepth` — truncation, not crash
7. Trigger truncation returns state as-is at truncation point (no partial effects from truncated trigger)
8. Trigger truncation logs full chain including `[TRUNCATED at depth N]`
9. Same seed + same move sequence = identical `stateHash` at every step (determinism)
10. `terminalResult` evaluates end conditions in definition order (first match wins)
11. Zobrist hash is updated incrementally after every state change
12. Phase advancement follows `turnStructure.phases` order
13. Active player advances according to `turnStructure.activePlayerOrder`
14. Per-turn action usage counters reset at turn boundaries
15. Per-phase action usage counters reset at phase boundaries

## Required Tests

### Unit Tests

**initialState**:
- Produces valid GameState with correct initial variable values
- Setup effects applied correctly (tokens distributed to zones)
- PRNG state is stored in returned GameState
- Zobrist hash matches full recomputation
- Phase set to first phase, player set to 0, turnCount set to 0

**legalMoves**:
- Simple 2-action game: both actions available → 2 moves returned
- Action with wrong phase filtered out
- Action with wrong actor filtered out
- Precondition filters out invalid param combinations (e.g., "need money >= 3" when money=1)
- Param domains enumerate correctly: tokensInZone returns right tokens, intsInRange returns right range
- Action limits respected: "once per turn" action already used → not in legal moves
- Empty legal moves: all actions preconditions fail → empty array

**applyMove**:
- Cost deducted: action costs 3 money, player had 5 → now has 2
- Effects applied: action adds 1 VP → VP increased
- Action usage incremented after move
- State hash updated (different from pre-move hash)
- Illegal move → descriptive error thrown

**Trigger dispatch**:
- Simple trigger fires on matching event (e.g., `actionResolved("buy")` triggers restock)
- Trigger with `when` condition: fires only when condition true
- Trigger with `match` condition: fires only on matching event details
- Non-matching trigger does not fire
- Cascading triggers: trigger A fires, produces event, trigger B fires (depth 2)
- Depth limit reached: state preserved, chain logged with TRUNCATED marker
- Depth limit at 1: only first-level triggers fire

**terminalResult**:
- Win condition met → returns win result with correct player
- Loss condition met → returns lossAll
- Score condition → returns ranked scores
- No condition met → returns null
- Multiple conditions: first true one wins (even if later ones would also be true)

**Phase/turn advancement**:
- After all actions in a phase, phase advances to next
- After last phase, turn advances to next player
- Per-turn usage counters reset on new turn
- Per-phase usage counters reset on new phase
- Round-robin: player 0 → 1 → 2 → 0
- Phase triggers fire: phaseExit then phaseEnter

### Integration Tests

- Full 10-turn game with 2 players: apply known moves, verify state at each step matches expected
- Game that triggers win condition at turn 7: verify terminalResult returns correct winner
- Game with cascading triggers (depth 3): all triggers fire correctly, state correct

### Property Tests

- For any valid GameDef + seed, random play for 1000 turns never crashes (no uncaught exceptions)
- Every move in `legalMoves` output passes precondition check when evaluated independently
- `applyMove` on any legal move produces a valid GameState (all vars in bounds, no orphan tokens)
- After `applyMove`, the new state's Zobrist hash matches `computeFullHash` recomputation

### Golden Tests

- Known GameDef + seed 42 + known move sequence (10 moves) → expected final state hash
- Known GameDef + seed 42 → expected legalMoves for initial state

### Determinism Tests

- Same seed + 50 random moves (chosen by index into legalMoves using PRNG) = identical state hash sequence on two independent runs

## Acceptance Criteria

- [ ] `initialState` produces correct starting state with setup effects applied
- [ ] `legalMoves` returns exactly the valid moves (no false positives, no missing moves)
- [ ] `applyMove` correctly applies costs, effects, and triggers
- [ ] Trigger dispatch respects depth limit with correct truncation behavior
- [ ] `terminalResult` evaluates conditions in order, first match wins
- [ ] Phase/turn advancement works correctly with proper trigger dispatch
- [ ] Zobrist hash is maintained incrementally and matches full recomputation
- [ ] Action usage limits are tracked and enforced per-turn/per-phase/per-game
- [ ] Same seed + same moves = identical state hash at every step
- [ ] Random play for 1000 turns on any valid GameDef never crashes

## Files to Create/Modify

```
src/kernel/initial-state.ts      # NEW — initialState implementation
src/kernel/legal-moves.ts        # NEW — legalMoves enumeration
src/kernel/apply-move.ts         # NEW — applyMove implementation
src/kernel/trigger-dispatch.ts   # NEW — trigger matching and dispatch
src/kernel/terminal.ts           # NEW — terminalResult detection
src/kernel/phase-advance.ts      # NEW — phase/turn advancement logic
src/kernel/action-usage.ts       # NEW — action usage tracking
src/kernel/index.ts              # MODIFY — re-export game loop APIs
test/unit/initial-state.test.ts  # NEW
test/unit/legal-moves.test.ts    # NEW
test/unit/apply-move.test.ts     # NEW
test/unit/trigger-dispatch.test.ts # NEW
test/unit/terminal.test.ts       # NEW
test/unit/phase-advance.test.ts  # NEW
test/integration/game-loop.test.ts     # NEW — full multi-turn game test
test/integration/determinism.test.ts   # NEW — determinism verification
```
