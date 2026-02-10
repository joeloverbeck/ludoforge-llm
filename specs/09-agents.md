# Spec 09: Agents (Random & Greedy)

**Status**: Draft
**Priority**: P1 (required for MVP)
**Complexity**: S
**Dependencies**: Spec 02, Spec 06
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
  }): Move;
}
```

### Agent Factory

```typescript
type AgentType = 'random' | 'greedy';

function createAgent(type: AgentType): Agent;

// Parse agent specification string (e.g., "random,greedy" for 2-player game)
function parseAgentSpec(spec: string, playerCount: number): readonly Agent[];
```

## Implementation Requirements

### RandomAgent

```typescript
class RandomAgent implements Agent {
  chooseMove(input): Move {
    // Select uniformly at random from legalMoves using provided PRNG
    const [index, _newRng] = nextInt(input.rng, 0, input.legalMoves.length - 1);
    return input.legalMoves[index];
  }
}
```

**Key behaviors**:
- Uses `nextInt` from Spec 03 (PRNG), NOT `Math.random()`
- Returns a move from `legalMoves` array (never invents a move)
- If `legalMoves` has exactly 1 element, returns that element (no randomness needed)
- If `legalMoves` is empty: this should never happen in normal play (Spec 06's game loop checks terminal before asking for moves), but if it does, throw descriptive error
- Deterministic: same state + same rng → same move

**Note on RNG threading**: The agent receives an `Rng` but does NOT return the updated rng. The simulation loop (Spec 10) is responsible for forking the RNG for agent use so that agent randomness doesn't affect game RNG. See Spec 10 for details.

### GreedyAgent

```typescript
class GreedyAgent implements Agent {
  chooseMove(input): Move {
    // Score each legal move by one-step lookahead
    // Pick the move with highest score (tiebreak by RNG)
    let bestScore = -Infinity;
    let bestMoves: Move[] = [];

    for (const move of input.legalMoves) {
      const nextState = applyMove(input.def, input.state, move);
      const score = evaluateState(input.def, nextState, input.playerId);
      if (score > bestScore) {
        bestScore = score;
        bestMoves = [move];
      } else if (score === bestScore) {
        bestMoves.push(move);
      }
    }

    // Tiebreak: random selection among equally-scored moves
    if (bestMoves.length === 1) return bestMoves[0];
    const [index, _newRng] = nextInt(input.rng, 0, bestMoves.length - 1);
    return bestMoves[index];
  }
}
```

**Heuristic evaluation function** (`evaluateState`):

```typescript
function evaluateState(def: GameDef, state: GameState, playerId: PlayerId): number {
  let score = 0;

  // 1. Maximize own scoring variable (VP, score, etc.)
  //    Use the scoring definition from GameDef if available
  if (def.scoring) {
    score += evalScoringValue(def, state, playerId) * 100;
  }

  // 2. Maximize own variable values (generic: sum of all per-player vars)
  //    Weighted by position in variable range (normalized to 0-1)
  for (const varDef of def.perPlayerVars) {
    const value = getPlayerVar(state, playerId, varDef.name);
    const normalized = (value - varDef.min) / Math.max(1, varDef.max - varDef.min);
    score += normalized * 10;
  }

  // 3. Maximize token count in own zones
  for (const zone of def.zones) {
    if (zone.owner === 'player') {
      const zoneId = resolvePlayerZone(zone.id, playerId);
      score += (state.zones[zoneId]?.length ?? 0) * 1;
    }
  }

  return Math.trunc(score); // integer-only
}
```

**Key behaviors**:
- Uses one-step lookahead: tries each legal move via `applyMove`, evaluates resulting state
- Heuristic: maximize own scoring value > maximize own resources > maximize own token count
- Tiebreaks deterministically using PRNG
- Performance consideration: for high branching factors (>50 legal moves), the agent calls `applyMove` for each. This should be acceptable for MVP; if too slow, add a configurable move sampling limit.

**Integer-only arithmetic**: The evaluation function uses `Math.trunc` to keep scores as integers. Normalization uses integer arithmetic where possible.

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
  const types = spec.split(',').map(s => s.trim() as AgentType);
  if (types.length !== playerCount) {
    throw new Error(
      `Agent spec has ${types.length} agents but game needs ${playerCount} players`
    );
  }
  return types.map(createAgent);
}
```

Usage: `parseAgentSpec("random,greedy", 2)` → `[RandomAgent, GreedyAgent]`

## Invariants

1. Agent always returns a move from `legalMoves` (never invents moves)
2. Agent never throws if `legalMoves` is non-empty
3. RandomAgent uses provided PRNG (not `Math.random`)
4. GreedyAgent is deterministic given same state + same RNG
5. Agent interface allows RNG parameter (RandomAgent requires it, GreedyAgent uses it for tiebreaking)
6. GreedyAgent's evaluation function uses integer-only arithmetic
7. `parseAgentSpec` validates agent count matches player count

## Required Tests

### Unit Tests

**RandomAgent**:
- With known seed: picks expected move from 5 legal moves (golden test)
- With single legal move: always returns that move
- With 2 legal moves + known seed: deterministic choice verified
- Same state + same rng → same move choice (determinism)
- Over 100 calls with 3 legal moves: all 3 are chosen at least once (rough uniformity)

**GreedyAgent**:
- Simple scenario: move A gives +1 VP, move B gives +0 VP → chooses A
- Tiebreak scenario: moves A and B both give +1 VP → deterministic tiebreak via RNG
- With known seed for tiebreak: picks expected move (golden test)
- Evaluation function: state with money=5, vp=3 → expected score
- Same state + same rng → same move choice (determinism)

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

- Agent always returns element of `legalMoves` array (for any valid input with non-empty legal moves)
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
