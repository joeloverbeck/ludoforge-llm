# Spec 10: Simulator & Trace Logger

**Status**: Draft
**Priority**: P1 (required for MVP)
**Complexity**: M
**Dependencies**: Spec 06, Spec 09
**Estimated effort**: 2-3 days
**Source sections**: Brainstorming sections 2.4A, 2.4B, 1.4

## Overview

Implement the simulation runner that orchestrates full game playthroughs: initialize state, loop through turns (agents choose from legal moves, kernel applies moves), log every step as a `MoveLog` entry with state hashes and deltas, and produce a complete `GameTrace` at termination. The simulator is the bridge between the kernel (Spec 06) and evaluation (Spec 11). It also provides the primary determinism verification mechanism — identical seeds must produce identical traces.

## Scope

### In Scope
- `runGame(def, seed, agents, maxTurns)` — main simulation loop
- MoveLog construction: stateHash, player, move, deltas, triggerFirings
- GameTrace construction: metadata, moves, finalState, result, turnsCount
- Delta computation between pre-move and post-move states
- Turn cap enforcement (maxTurns)
- RNG forking for agent use (agent randomness isolated from game RNG)
- Batch simulation: `runGames(def, seeds, agents, maxTurns)` for multiple runs

### Out of Scope
- Agent implementations (Spec 09 — consumed here)
- Kernel implementation (Spec 06 — consumed here)
- Metrics computation from traces (Spec 11)
- Degeneracy detection (Spec 11)
- Trace file I/O and serialization format (Spec 12 CLI handles file output)
- Interactive replay (Spec 12 CLI)

## Key Types & Interfaces

### Public API

```typescript
// Run a single game to completion (or maxTurns)
function runGame(
  def: GameDef,
  seed: number,
  agents: readonly Agent[],
  maxTurns: number
): GameTrace;

// Run multiple games with different seeds
function runGames(
  def: GameDef,
  seeds: readonly number[],
  agents: readonly Agent[],
  maxTurns: number
): readonly GameTrace[];
```

### MoveLog (from Spec 02 types)

```typescript
interface MoveLog {
  readonly stateHash: bigint;       // Zobrist hash AFTER move applied
  readonly player: PlayerId;
  readonly move: Move;
  readonly deltas: readonly StateDelta[];
  readonly triggerFirings: readonly TriggerFiring[];
}
```

### StateDelta

```typescript
interface StateDelta {
  readonly path: string;    // e.g. "globalVars.threat", "zones.hand:0", "perPlayerVars.0.money"
  readonly before: unknown; // value before move
  readonly after: unknown;  // value after move
}
```

### GameTrace (from Spec 02 types)

```typescript
interface GameTrace {
  readonly gameDefId: string;
  readonly seed: number;
  readonly moves: readonly MoveLog[];
  readonly finalState: GameState;
  readonly result: TerminalResult | null; // null if maxTurns reached without terminal
  readonly turnsCount: number;
}
```

## Implementation Requirements

### runGame Main Loop

```
function runGame(def, seed, agents, maxTurns):
  1. state = initialState(def, seed)
  2. gameRng = state.rng (game-level RNG from initialState)
  3. moveLogs = []
  4. turnCount = 0

  5. LOOP:
     a. result = terminalResult(def, state)
     b. if result !== null → BREAK (game over)
     c. if turnCount >= maxTurns → BREAK (turn cap)

     d. moves = legalMoves(def, state)
     e. if moves.length === 0 → BREAK (no legal moves — stall)

     f. activePlayer = state.activePlayer
     g. agent = agents[activePlayer]

     h. [agentRng, gameRng] = forkRng(gameRng)
        // Fork RNG: agent gets a copy, game continues with its own stream
        // This ensures agent randomness doesn't affect game determinism

     i. chosenMove = agent.chooseMove({
          def, state, playerId: activePlayer,
          legalMoves: moves, rng: agentRng
        })

     j. preState = state
     k. state = applyMove(def, state, chosenMove)
        // applyMove handles: cost, effects, triggers, hash update, phase/turn advance

     l. deltas = computeDeltas(preState, state)
     m. triggerFirings = extractTriggerFirings(preState, state)
        // trigger firings tracked by applyMove internally

     n. moveLogs.push({
          stateHash: state.stateHash,
          player: activePlayer,
          move: chosenMove,
          deltas,
          triggerFirings
        })

     o. turnCount = state.turnCount

  6. Return GameTrace {
       gameDefId: def.metadata.id,
       seed,
       moves: moveLogs,
       finalState: state,
       result: terminalResult(def, state),
       turnsCount: turnCount
     }
```

### RNG Forking Strategy

The simulation uses TWO RNG streams:
1. **Game RNG**: Part of GameState, used by kernel effects (shuffle, random positioning). Deterministic based on seed + moves.
2. **Agent RNG**: Forked from game RNG before each agent call. Used by agents for random selection and tiebreaking. Isolated — agent randomness does not affect game state RNG.

This separation ensures that:
- Swapping agent implementations doesn't change the game's random events (shuffles, draws)
- Same seed + same moves = same game state, regardless of which agents are playing
- Agent randomness is still deterministic (forked from deterministic stream)

### Delta Computation

`computeDeltas(preState, postState)`:

Compare pre-move and post-move states to identify all changes:

1. **Global variables**: For each var, if `pre.globalVars[name] !== post.globalVars[name]`, record delta
2. **Per-player variables**: For each player + var, compare values
3. **Zones**: For each zone, compare token arrays:
   - Tokens added to zone → delta with `before: null, after: tokenId`
   - Tokens removed from zone → delta with `before: tokenId, after: null`
   - Token order changed → delta with before/after arrays
4. **Phase/turn**: If currentPhase or activePlayer changed, record delta
5. **Turn count**: If turnCount changed, record delta

Deltas use dot-path notation for the `path` field:
- `"globalVars.threat"` → global variable change
- `"perPlayerVars.0.money"` → player 0's money changed
- `"zones.deck"` → deck zone contents changed
- `"currentPhase"` → phase changed
- `"activePlayer"` → active player changed

### Trigger Firing Extraction

Trigger firings are produced by `applyMove` → `dispatchTriggers` (Spec 06). The simulator needs to capture these for the MoveLog.

**Integration approach**: Either:
1. `applyMove` returns trigger firings as part of its result (requires modifying applyMove return type to include metadata), OR
2. The simulator wraps `dispatchTriggers` to capture firings

Option 1 is cleaner. Extend `applyMove` return type:

```typescript
interface ApplyMoveResult {
  readonly state: GameState;
  readonly triggerFirings: readonly TriggerFiring[];
}
```

Note: This may require a minor API extension to Spec 06's `applyMove`. The spec should document this integration requirement.

### Batch Simulation

`runGames(def, seeds, agents, maxTurns)`:

- Run `runGame` for each seed independently
- Each run is fully independent (different seed → different RNG stream)
- Return array of GameTrace in same order as seeds
- No parallelism required (sequential execution is deterministic)

### BigInt Serialization

`GameTrace` contains `bigint` values (stateHash). Since `JSON.stringify` does not support BigInt natively:

- Provide a `serializeTrace(trace): string` function that converts BigInt to hex strings
- Provide a `deserializeTrace(json): GameTrace` function that restores BigInt from hex strings
- Use a replacer/reviver pattern for JSON serialization

```typescript
function serializeTrace(trace: GameTrace): string {
  return JSON.stringify(trace, (key, value) =>
    typeof value === 'bigint' ? `0x${value.toString(16)}` : value
  );
}
```

## Invariants

1. Simulation terminates: either terminal condition met OR maxTurns reached OR no legal moves
2. Every MoveLog has a stateHash (Zobrist hash of state after move)
3. Same seed + same agents (same types) = identical GameTrace (determinism)
4. `GameTrace.turnsCount` matches actual number of turns simulated
5. `GameTrace.result` is non-null only if a terminal condition was met (null for maxTurns timeout or stall)
6. All moves in trace are legal (validated by `applyMove` at each step)
7. Deltas accurately reflect state changes (computable from consecutive states)
8. Agent RNG is forked from game RNG — agent randomness doesn't pollute game state
9. `runGames` produces independent traces (different seeds → different games)
10. Trace serialization round-trips correctly (serialize → deserialize → identical trace)

## Required Tests

### Unit Tests

**Single-turn game**:
- Game that ends after 1 move → trace has 1 MoveLog entry, result is non-null

**Multi-turn game**:
- Run 5-turn game → trace has correct number of MoveLog entries

**Terminal detection**:
- Game reaches win condition at turn 7 → result reflects winner, turnsCount = 7

**MaxTurns cap**:
- Game with no end condition, maxTurns=10 → trace has 10 entries, result is null

**No legal moves**:
- Game state where no moves are legal → simulation stops, trace records up to that point

**Delta computation**:
- Move that changes 1 global var → exactly 1 delta with correct path/before/after
- Move that changes 2 per-player vars → 2 deltas
- Move that moves a token between zones → delta for source zone and destination zone
- Move that changes phase → delta for currentPhase

**State hashes**:
- Every MoveLog.stateHash matches independently computed `computeFullHash` on the corresponding state

**RNG forking**:
- Two runs with same seed but different agent types → game state hashes differ (agents make different choices) but game RNG is forked correctly
- Two runs with same seed and same agent type → identical traces

**Serialization**:
- `deserializeTrace(serializeTrace(trace))` produces identical trace (round-trip)
- BigInt stateHash survives serialization

### Integration Tests

**Full game with 2 RandomAgents**:
- 50 turns, verify trace integrity (all MoveLog entries have valid stateHash, deltas are consistent)

**Determinism**:
- Run same game twice with seed 42 → traces are identical (byte-level comparison after serialization)

**Batch simulation**:
- `runGames` with 5 different seeds → 5 independent traces, all different

### Property Tests

- For any valid GameDef + seed, `runGame` terminates (within maxTurns)
- Every MoveLog in a trace has non-empty deltas OR is a no-op move (which shouldn't happen with properly designed games)
- `turnsCount` equals `moves.length` (each turn produces exactly one MoveLog)

### Golden Tests

- Known GameDef + seed 42 + RandomAgents + maxTurns=20 → expected trace (stateHash sequence matches)

## Acceptance Criteria

- [ ] `runGame` produces complete GameTrace for any valid GameDef
- [ ] Simulation terminates via terminal condition, maxTurns, or no legal moves
- [ ] Every MoveLog has stateHash matching independently computed hash
- [ ] Deltas accurately reflect pre/post state differences
- [ ] Same seed + same agents = identical trace (determinism verified)
- [ ] Agent RNG forked correctly (isolated from game RNG)
- [ ] `runGames` produces independent traces for different seeds
- [ ] Trace serialization handles BigInt round-trip
- [ ] maxTurns cap works correctly
- [ ] No legal moves scenario handled gracefully

## Files to Create/Modify

```
src/sim/simulator.ts             # NEW — runGame and runGames implementation
src/sim/delta.ts                 # NEW — computeDeltas state comparison
src/sim/trace-serialization.ts   # NEW — serializeTrace / deserializeTrace
src/sim/index.ts                 # MODIFY — re-export simulator APIs
src/kernel/apply-move.ts         # MODIFY — extend return type to include triggerFirings
test/unit/simulator.test.ts      # NEW — simulation loop tests
test/unit/delta.test.ts          # NEW — delta computation tests
test/unit/trace-serialization.test.ts  # NEW — serialization round-trip tests
test/integration/sim-full-game.test.ts # NEW — full game simulation tests
test/integration/sim-determinism.test.ts # NEW — determinism verification
```
