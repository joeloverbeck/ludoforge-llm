# Spec 10: Simulator & Trace Logger

**Status**: Draft
**Priority**: P1 (required for MVP)
**Complexity**: M
**Dependencies**: Spec 03, Spec 06, Spec 09
**Estimated effort**: 2-3 days
**Source sections**: Brainstorming sections 2.4A, 2.4B, 1.4

## Overview

Implement the simulation runner that orchestrates full game playthroughs: initialize state, loop through turns (agents choose from legal moves, kernel applies moves), log every step as a `MoveLog` entry with state hashes and deltas, and produce a complete `GameTrace` at termination.

The simulator is the bridge between the kernel (Spec 06) and evaluation (Spec 11). It is also a core determinism boundary: same `GameDef` + seed + agent implementations must produce byte-identical serialized traces.

## Scope

### In Scope
- `runGame(def, seed, agents, maxTurns, playerCount?)` — main simulation loop
- `runGames(def, seeds, agents, maxTurns, playerCount?)` — batch simulation
- `MoveLog` construction: `stateHash`, `player`, `move`, `legalMoveCount`, `deltas`, `triggerFirings`
- `GameTrace` construction: metadata, move logs, final state, terminal result, turns count
- Delta computation between pre-move and post-move states
- Turn-cap enforcement (`maxTurns`)
- Deterministic per-agent RNG threading (separate from game RNG)
- Deterministic trace ordering and deterministic delta path ordering

### Out of Scope
- Agent implementations (Spec 09 — consumed here)
- Kernel implementation (Spec 06 — consumed here)
- Metrics/degeneracy computation (Spec 11)
- Trace file I/O and transport format (Spec 12 handles file output)
- Interactive replay UX (Spec 12)

## Key Types & Interfaces

### Public API

```typescript
function runGame(
  def: GameDef,
  seed: number,
  agents: readonly Agent[],
  maxTurns: number,
  playerCount?: number
): GameTrace;

function runGames(
  def: GameDef,
  seeds: readonly number[],
  agents: readonly Agent[],
  maxTurns: number,
  playerCount?: number
): readonly GameTrace[];
```

### MoveLog and GameTrace

Use Spec 02 type contracts with one required amendment for simulator termination semantics:

```typescript
type SimulationStopReason = 'terminal' | 'maxTurns' | 'noLegalMoves';

interface MoveLog {
  readonly stateHash: bigint;
  readonly player: PlayerId;
  readonly move: Move;
  readonly legalMoveCount: number;
  readonly deltas: readonly StateDelta[];
  readonly triggerFirings: readonly TriggerLogEntry[];
}

interface GameTrace {
  readonly gameDefId: string;
  readonly seed: number;
  readonly moves: readonly MoveLog[];
  readonly finalState: GameState;
  readonly result: TerminalResult | null;
  readonly turnsCount: number;
  readonly stopReason: SimulationStopReason;
}
```

## Contract Corrections (Required)

These corrections align Spec 10 to the roadmap/API contracts and existing kernel behavior:

1. Trace serialization is provided by `src/kernel/serde.ts` (`serializeTrace`, `deserializeTrace`).
2. `applyMove` already returns `{ state, triggerFirings }`; no Spec 10 change to kernel API is required.
3. `MoveLog.triggerFirings` type is `TriggerLogEntry[]` (not `TriggerFiring[]` only).
4. `turnsCount` must be `finalState.turnCount`; it is not guaranteed to equal `moves.length`.
5. `GameTrace` must include `stopReason` so evaluator degeneracy checks can distinguish max-turn exits from no-legal-move stalls.

## Implementation Requirements

### Input Validation

`runGame` must fail fast with descriptive errors when:
- `seed` is not a safe integer.
- `maxTurns` is not a safe integer or is negative.
- `agents.length !== resolvedPlayerCount`.

`resolvedPlayerCount` is the value from `initialState(def, seed, playerCount).playerCount`.

### Main Loop

```text
runGame(def, seed, agents, maxTurns, playerCount?):
  state = initialState(def, seed, playerCount)
  resolvedPlayerCount = state.playerCount
  validate agents length

  initialize per-player agent RNG streams deterministically from seed
  moveLogs = []

  loop:
    result = terminalResult(def, state)
    if result !== null: break

    if moveLogs.length >= maxTurns: break

    legal = legalMoves(def, state)
    if legal.length === 0: break

    player = state.activePlayer
    agent = agents[player]
    selection = agent.chooseMove({ def, state, playerId: player, legalMoves: legal, rng: agentRng[player] })
    agentRng[player] = selection.rng

    preState = state
    applyResult = applyMove(def, state, selection.move)
    state = applyResult.state

    deltas = computeDeltas(preState, state)
    append MoveLog { stateHash, player, move, legalMoveCount, deltas, triggerFirings }

  return {
    gameDefId: def.metadata.id,
    seed,
    moves: moveLogs,
    finalState: state,
    result: terminalResult(def, state),
    turnsCount: state.turnCount,
    stopReason
  }
```

### Agent Boundary Rules

- Simulator is authoritative on legality: chosen move is validated by `applyMove`; illegal selections throw with context.
- Agent RNG state is threaded only through `agent.chooseMove` return value.
- Agent RNG and game RNG must remain fully isolated.

### Agent RNG Strategy

Use one deterministic stream per player:

```typescript
agentRngByPlayer[p] = createRng(BigInt(seed) ^ (BigInt(p + 1) * 0x9e3779b97f4a7c15n));
```

Requirements:
- Same seed and same agents produce the same per-player RNG progression.
- Agent randomness must not mutate `GameState.rng`.

### Delta Computation

`computeDeltas(preState, postState)` must be deterministic and path-stable.

Tracked fields:
- `globalVars.<name>`
- `perPlayerVars.<playerId>.<name>`
- `zones.<zoneId>`
- `currentPhase`
- `activePlayer`
- `turnCount`

Intentional exclusions:
- `rng` (engine-internal random state)
- `stateHash` (already logged separately)

Zone delta encoding:
- For `zones.<zoneId>`, store token-id arrays only (`before`/`after` arrays of token IDs).
- Do not emit one delta per index; one zone-level delta per changed zone keeps logs stable and bounded.

Deterministic ordering:
- Emit deltas sorted lexicographically by `path`.

### Hash Consistency

`MoveLog.stateHash` must equal `postState.stateHash` from `applyMove`.

Debug/invariant test requirement:
- In tests, recompute hash via `computeFullHash(createZobristTable(def), postState)` and assert equality.

### No-Legal-Move Semantics

If `legalMoves(def, state).length === 0` and `terminalResult(def, state) === null`, simulation ends with:
- `result: null`
- `finalState` and `turnsCount` from that stalled decision state
- `stopReason: 'noLegalMoves'`

No synthetic/no-op move should be logged.

### Batch Simulation

`runGames` behavior:
- Runs are independent, deterministic, and returned in the same order as `seeds`.
- Empty `seeds` input returns `[]`.
- Implementation may execute sequentially for MVP; parallel execution is optional later but must preserve deterministic output order.

### Serialization Contract

Use existing kernel serde APIs:
- `serializeTrace(trace): SerializedGameTrace`
- `deserializeTrace(json): GameTrace`

No new simulator-local serialization module is needed.

## Invariants

1. A run terminates via terminal condition, `maxTurns`, or no-legal-move stall.
2. Every logged move has a valid post-move `stateHash`.
3. Same `def` + seed + agents yields deterministic trace output.
4. `turnsCount` equals `finalState.turnCount`.
5. `result !== null` only when terminal condition is met.
6. All logged moves were legal at selection time.
7. Deltas are deterministic and accurately represent tracked state changes.
8. Agent RNG streams are isolated from game RNG.
9. `runGames` preserves input seed order.
10. Trace serde round-trip is lossless for BigInt/hash fields.
11. `stopReason` is exact:
   - `'terminal'` iff `result !== null`
   - `'maxTurns'` iff `result === null` and move cap reached
   - `'noLegalMoves'` iff `result === null` and legal-move set is empty

## Required Tests

### Unit Tests

- Single-turn terminal game produces 1 `MoveLog` and non-null `result`.
- Multi-turn game produces expected move count and deterministic move ordering.
- `maxTurns=0` returns immediately with zero moves.
- `maxTurns` cap truncates run with `result: null` when no terminal met.
- No-legal-move state exits cleanly with no synthetic move.
- Stop reason is correct for terminal, max-turn, and no-legal-move exits.
- Input validation: invalid `seed`, invalid `maxTurns`, and mismatched agent count throw.
- Delta computation:
  - one global var change emits one delta path
  - per-player var changes emit correct player-scoped paths
  - token movement updates both affected zones at zone-level paths
  - phase/player/turn transitions emit correct deltas
  - output ordering is path-sorted and deterministic
- Hash integrity: each logged hash matches independent full-hash recomputation.
- Agent RNG isolation:
  - same seed + same agents -> identical traces
  - same seed + different agents -> trace divergence without RNG cross-contamination
- Serde round-trip via kernel `serializeTrace`/`deserializeTrace` is exact.

### Integration Tests

- Full game run with two random agents: trace schema-valid and internally consistent.
- Determinism: same setup run twice yields byte-identical serialized traces.
- `runGames` over multiple seeds returns traces in seed order.

### Property Tests

- For any valid input and finite `maxTurns`, `runGame` terminates.
- Logged move count is `<= maxTurns`.
- Every `MoveLog.legalMoveCount >= 1`.
- `turnsCount` equals `finalState.turnCount` (not `moves.length`).

### Golden Tests

- Known `GameDef` + fixed agents + seed produces expected state-hash sequence.

## Acceptance Criteria

- [ ] `runGame` produces a complete `GameTrace` for valid inputs.
- [ ] Termination semantics are correct for terminal, cap, and no-legal-move cases.
- [ ] Every `MoveLog.stateHash` is consistent with kernel hashing.
- [ ] Deltas are correct, deterministic, and path-sorted.
- [ ] Determinism verified for same seed/setup.
- [ ] Agent RNG is correctly isolated from game RNG.
- [ ] `runGames` produces independent traces in seed order.
- [ ] Trace serde round-trips via kernel serde functions.
- [ ] Validation errors are descriptive and fail fast.
- [ ] `GameTrace.stopReason` is present and correct for every run.

## Files to Create/Modify

```text
src/sim/simulator.ts                  # NEW — runGame/runGames implementation
src/sim/delta.ts                      # NEW — deterministic computeDeltas
src/sim/index.ts                      # MODIFY — re-export simulator APIs
src/kernel/types.ts                   # MODIFY — add GameTrace.stopReason + SimulationStopReason
src/kernel/schemas.ts                 # MODIFY — add schema support for stopReason
src/kernel/serde.ts                   # MODIFY — include stopReason in trace serde round-trip
test/unit/sim/simulator.test.ts       # NEW — simulation loop and validation tests
test/unit/sim/delta.test.ts           # NEW — delta computation and ordering tests
test/integration/sim/simulator.test.ts # NEW — determinism and batch integration tests
test/unit/schemas-top-level.test.ts   # MODIFY — trace schema expectations for stopReason
test/unit/serde.test.ts               # MODIFY — trace serde expectations for stopReason
```
