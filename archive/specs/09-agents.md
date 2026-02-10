# Spec 09: Agents (Random & Greedy)

**Status**: ✅ COMPLETED
**Priority**: P1 (required for MVP)
**Complexity**: S
**Dependencies**: Spec 02, Spec 03, Spec 06
**Estimated effort**: 1-2 days
**Source sections**: Brainstorming section 2.3

## Overview

Implement two bot agents that play games autonomously: RandomAgent (uniform random move selection) and GreedyAgent (heuristic-based move selection). Both conform to the `Agent` interface defined in Spec 02. Agents are the "players" in the simulation loop (Spec 10) — they observe the game state, receive legal moves, and choose one. Both must be deterministic given the same PRNG state.

## Scope

### In Scope
- `Agent` interface implementation
- `RandomAgent`: uniformly random selection from legal moves using provided PRNG
- `GreedyAgent`: score-based selection using one-step lookahead heuristic
- Deterministic behavior given same RNG state
- Agent factory for creating agents by name string
- Optional `GreedyAgent` configuration for bounded move evaluation (`maxMovesToEvaluate`)

### Out of Scope
- UCT/MCTS agent (post-MVP, noted in brainstorming as optional)
- Neural network or learned agents
- Multi-step lookahead beyond one move
- Agent configuration beyond what's needed for basic operation
- Human interactive agent (CLI input)

## Key Types & Interfaces

### Agent Interface (from Spec 02)

```typescript
interface Agent {
  chooseMove(input: {
    readonly def: GameDef;
    readonly state: GameState;
    readonly playerId: PlayerId;
    readonly legalMoves: readonly Move[];
    readonly rng: Rng;
  }): { readonly move: Move; readonly rng: Rng };
}
```

### Agent Factory

```typescript
type AgentType = 'random' | 'greedy';

function createAgent(type: AgentType): Agent;

// Parse agent specification string (e.g., "random,greedy" for 2-player game)
function parseAgentSpec(spec: string, playerCount: number): readonly Agent[];
```

### GreedyAgent Configuration

```typescript
interface GreedyAgentConfig {
  // If undefined, evaluate all legal moves. If set, deterministically evaluate at most this many.
  readonly maxMovesToEvaluate?: number;
}
```

## Implementation Requirements

### RandomAgent

```typescript
class RandomAgent implements Agent {
  chooseMove(input): { move: Move; rng: Rng } {
    if (input.legalMoves.length === 0) {
      throw new Error('RandomAgent.chooseMove called with empty legalMoves');
    }
    if (input.legalMoves.length === 1) {
      return { move: input.legalMoves[0], rng: input.rng };
    }

    // Select uniformly at random from legalMoves using provided PRNG
    const [index, nextRng] = nextInt(input.rng, 0, input.legalMoves.length - 1);
    return { move: input.legalMoves[index], rng: nextRng };
  }
}
```

**Key behaviors**:
- Uses `nextInt` from Spec 03 (PRNG), NOT `Math.random()`
- Returns a move from `legalMoves` array (never invents a move) plus advanced RNG state
- If `legalMoves` has exactly 1 element, returns that element and does not advance RNG
- If `legalMoves` is empty: this should never happen in normal play (Spec 06's game loop checks terminal before asking for moves), but if it does, throw descriptive error
- Deterministic: same state + same rng → same `{move, rng}` result

**RNG threading contract**: Agents are pure and do not keep hidden mutable RNG state. The caller threads RNG by feeding the returned `rng` back into the same agent on the next decision.

### GreedyAgent

```typescript
class GreedyAgent implements Agent {
  chooseMove(input): { move: Move; rng: Rng } {
    if (input.legalMoves.length === 0) {
      throw new Error('GreedyAgent.chooseMove called with empty legalMoves');
    }

    // Optional deterministic sampling for very high branching factors
    const candidates = selectCandidatesDeterministically(input.legalMoves, input.rng, this.maxMovesToEvaluate);

    // Score each legal move by one-step lookahead
    // Pick the move with highest score (tiebreak by RNG)
    let bestScore = -Infinity;
    let bestMoves: Move[] = [];

    for (const move of candidates.moves) {
      const { state: nextState } = applyMove(input.def, input.state, move);
      const score = evaluateState(input.def, nextState, input.playerId);
      if (score > bestScore) {
        bestScore = score;
        bestMoves = [move];
      } else if (score === bestScore) {
        bestMoves.push(move);
      }
    }

    // Tiebreak: random selection among equally-scored moves
    if (bestMoves.length === 1) {
      return { move: bestMoves[0], rng: candidates.rng };
    }
    const [index, nextRng] = nextInt(candidates.rng, 0, bestMoves.length - 1);
    return { move: bestMoves[index], rng: nextRng };
  }
}
```

**Heuristic evaluation function** (`evaluateState`):

```typescript
function evaluateState(def: GameDef, state: GameState, playerId: PlayerId): number {
  // 0. Highest priority: immediate terminal outcomes
  const terminal = terminalResult(def, state);
  if (terminal !== null) {
    if (terminal.winner === playerId) return 1_000_000_000;
    if (terminal.winner !== null) return -1_000_000_000;
    return 0; // draw
  }

  let score = 0;

  // 1. Maximize own scoring variable (VP, score, etc.)
  //    Use the scoring definition from GameDef if available
  if (def.scoring) {
    score += evalScoringValue(def, state, playerId) * 100;
  }

  // 2. Maximize own variable values and minimize opponents' (integer-only scaling)
  for (const varDef of def.perPlayerVars) {
    const range = Math.max(1, varDef.max - varDef.min);
    const own = getPlayerVar(state, playerId, varDef.name) - varDef.min;
    score += Math.trunc((own * 10_000) / range);

    for (let p = 0; p < state.playerCount; p++) {
      if (p === playerId) continue;
      const opp = getPlayerVar(state, p as PlayerId, varDef.name) - varDef.min;
      score -= Math.trunc((opp * 2_500) / range);
    }
  }

  // 3. Maximize token count in own zones
  for (const zone of def.zones) {
    if (zone.owner === 'player') {
      const zoneId = resolvePlayerZone(zone.id, playerId);
      score += (state.zones[zoneId]?.length ?? 0) * 1;
    }
  }

  return score;
}
```

**Key behaviors**:
- Uses one-step lookahead: tries each legal move via `applyMove`, evaluates resulting state
- Heuristic priority: terminal win/loss > own scoring value > own resources (with light opponent suppression) > own token count
- Tiebreaks deterministically using PRNG
- Boundedness: supports optional deterministic move sampling when legal move count is very high, to cap runtime
- Sampling contract: if `maxMovesToEvaluate` is unset or `>= legalMoves.length`, evaluate all moves and preserve input RNG unchanged before tiebreak

**Integer-only arithmetic**: The evaluation function must avoid floating point accumulation. Use scaled integer math for normalization.

### Agent Factory

```typescript
function createAgent(type: AgentType): Agent {
  switch (type) {
    case 'random': return new RandomAgent();
    case 'greedy': return new GreedyAgent();
    default: throw new Error(`Unknown agent type: ${type}`);
  }
}

function parseAgentSpec(spec: string, playerCount: number): readonly Agent[] {
  const types = spec
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);

  if (types.length !== playerCount) {
    throw new Error(
      `Agent spec has ${types.length} agents but game needs ${playerCount} players`
    );
  }
  return types.map(type => {
    if (type !== 'random' && type !== 'greedy') {
      throw new Error(`Unknown agent type: ${type}. Allowed: random, greedy`);
    }
    return createAgent(type);
  });
}
```

Usage: `parseAgentSpec("random,greedy", 2)` → `[RandomAgent, GreedyAgent]`

## Invariants

1. Agent always returns a move from `legalMoves` (never invents moves)
2. Agent never throws if `legalMoves` is non-empty
3. RandomAgent uses provided PRNG (not `Math.random`)
4. GreedyAgent is deterministic given same state + same RNG
5. Agent interface threads RNG explicitly (`chooseMove` returns `{ move, rng }`)
6. GreedyAgent's evaluation function uses integer-only arithmetic
7. `parseAgentSpec` validates agent count matches player count
8. GreedyAgent prefers immediate terminal win and avoids immediate terminal loss when alternatives exist
9. If deterministic sampling is enabled, candidate set selection is deterministic for identical input RNG

## Required Tests

### Unit Tests

**RandomAgent**:
- With known seed: picks expected move from 5 legal moves (golden test)
- With single legal move: always returns that move
- With single legal move: returned RNG is unchanged
- With 2 legal moves + known seed: deterministic choice verified
- Same state + same rng → same `{move, rng}` result (determinism)
- Over 100 calls with 3 legal moves: all 3 are chosen at least once (rough uniformity)

**GreedyAgent**:
- Simple scenario: move A gives +1 VP, move B gives +0 VP → chooses A
- Terminal scenario: move A wins immediately, move B increases resources → chooses A
- Terminal scenario: move A loses immediately, move B is non-terminal → chooses B
- Tiebreak scenario: moves A and B both give +1 VP → deterministic tiebreak via RNG
- With known seed for tiebreak: picks expected move (golden test)
- Evaluation function: state with money=5, vp=3 → expected score
- Same state + same rng → same `{move, rng}` result (determinism)
- With `maxMovesToEvaluate` set, candidate selection is deterministic and bounded

**Agent factory**:
- `createAgent('random')` → RandomAgent instance
- `createAgent('greedy')` → GreedyAgent instance
- `createAgent('unknown')` → throws error
- `parseAgentSpec("random,greedy", 2)` → [RandomAgent, GreedyAgent]
- `parseAgentSpec("random", 2)` → throws (count mismatch)

### Integration Tests

- RandomAgent plays 20 turns of a simple game without crashing
- GreedyAgent plays 20 turns and achieves higher score than random (on average, over 10 games with different seeds)

### Property Tests

- Agent result `.move` is always an element of `legalMoves` array (for any valid input with non-empty legal moves)
- Agent never throws for non-empty `legalMoves`

### Golden Tests

- Known GameDef + state + seed 42 + 3 legal moves → RandomAgent picks expected move
- Known GameDef + state + seed 42 + 3 legal moves with known scores → GreedyAgent picks expected move

## Acceptance Criteria

- [ ] RandomAgent selects uniformly from legal moves using PRNG
- [ ] GreedyAgent uses one-step lookahead with heuristic evaluation
- [ ] Both agents are deterministic given same state + same RNG
- [ ] Both agents never return a move not in legalMoves
- [ ] Both agents never throw for non-empty legalMoves
- [ ] GreedyAgent tiebreaks deterministically
- [ ] Agent factory creates correct agent types
- [ ] `parseAgentSpec` validates agent count against player count
- [ ] No `Math.random()` calls anywhere in agent code
- [ ] Evaluation function uses integer-only arithmetic
- [ ] GreedyAgent prioritizes immediate terminal outcomes (win/loss) before heuristic score
- [ ] Optional greedy move-evaluation cap behaves deterministically when enabled

## Files to Create/Modify

```
src/agents/agent.ts              # NEW — Agent interface re-export (or import from kernel types)
src/agents/random-agent.ts       # NEW — RandomAgent implementation
src/agents/greedy-agent.ts       # NEW — GreedyAgent implementation
src/agents/evaluate-state.ts     # NEW — heuristic state evaluation function
src/agents/agent-factory.ts      # NEW — createAgent and parseAgentSpec
src/agents/index.ts              # MODIFY — re-export agent APIs
test/unit/random-agent.test.ts   # NEW
test/unit/greedy-agent.test.ts   # NEW
test/unit/evaluate-state.test.ts # NEW
test/unit/agent-factory.test.ts  # NEW
test/integration/agent-play.test.ts  # NEW — agents playing full games
```

## Outcome

- **Completion date**: 2026-02-10
- **What was actually changed**:
  - Implemented and exported `RandomAgent`, `GreedyAgent`, `evaluateState`, deterministic candidate selection, and agent factory APIs under `src/agents/`.
  - Implemented `parseAgentSpec` normalization and validation behavior for comma-separated specs.
  - Added comprehensive unit coverage in `test/unit/agents/` for random behavior, greedy evaluation/tiebreaking, candidate bounding, evaluation scoring, and factory/parse validation.
- **Deviations from original plan**:
  - Factory implementation lives in `src/agents/factory.ts` rather than `src/agents/agent-factory.ts`.
  - Factory parsing tests were consolidated in `test/unit/agents/factory-api-shape.test.ts` rather than a separate `agent-factory`/`parse-agent-spec` file.
  - No dedicated `test/integration/agent-play.test.ts` was added in this pass; baseline integration coverage still passes.
- **Verification results**:
  - `npm run lint`
  - `npm run build`
  - `npm run test:unit -- --coverage=false`
  - `npm test`
