# Spec 61: Universal Competent Game Player AI Agent

**Status**: ✅ COMPLETED
**Priority**: P2 (post-MVP enhancement)
**Complexity**: L
**Dependencies**: Spec 02, Spec 06, Spec 09, Spec 10
**Estimated effort**: 3-4 weeks (phased)
**Source sections**: Brainstorming section 2.3 (agents), post-MVP roadmap item 2

## Overview

Implement a universal, competent game-playing AI agent based on Monte Carlo Tree Search (MCTS) that can play *any* game compiled to a GameDef — without game-specific knowledge. The agent must handle hidden information (via Information Set MCTS determinization), multiplayer games (via max^n backpropagation), and multi-step decision sequences (via the kernel's existing `legalMoves` → `applyMove` loop).

The goal is not superhuman play but *competent* play: an agent that explores the game tree intelligently, avoids obviously bad moves, and provides a meaningful opponent for playtesting and evolution fitness evaluation. It replaces the need for hand-tuned heuristics per game while remaining fully generic.

### Motivation

1. **Evolution pipeline quality signal**: The evaluator (Spec 11) needs agents that produce meaningful games. RandomAgent produces noise; GreedyAgent's one-step lookahead misses tactical depth. MCTS provides multi-step lookahead without game-specific heuristics.
2. **Universal competence**: A single agent implementation plays FITL, Texas Hold'em, and any future game — no per-game tuning required for baseline competence.
3. **Fair play under hidden information**: The agent must never observe hidden state it shouldn't see. ISMCTS determinization ensures the agent reasons only over information-set-consistent worlds.
4. **Configurable strength**: Budget (iteration count) controls play strength, enabling easy difficulty scaling and compute-vs-quality tradeoffs in the evolution pipeline.

## Scope

### In Scope

- MCTS search with UCT (Upper Confidence bounds applied to Trees) selection
- Information Set MCTS (ISMCTS) for games with hidden information
- Max^n backpropagation for N-player games (N ≥ 2)
- MCTS-Solver: proven win/loss propagation to short-circuit search
- Configurable iteration budget per move
- Integration with existing `Agent` interface and agent factory
- Random rollout policy (baseline)
- Deterministic behavior given same PRNG state
- Time budget option (alternative to iteration count)

### Out of Scope

- Neural network policy/value networks (NNUE, AlphaZero-style)
- Opening books or endgame tablebases
- Parallelized search (root parallelism, tree parallelism) — deferred to Phase 3
- Game-specific heuristic evaluation functions (future enhancement layer)
- MAST (Move-Average Sampling Technique) rollout policy — noted as future enhancement
- Progressive history or RAVE enhancements
- Persistent tree reuse across moves (tree recycling)

## Architecture

### File Layout

```
packages/engine/src/agents/
  mcts/
    mcts-agent.ts          # MctsAgent class implementing Agent interface
    mcts-node.ts           # Tree node data structure
    mcts-search.ts         # Core search loop (select → expand → rollout → backprop)
    uct.ts                 # UCT selection policy
    determinize.ts         # ISMCTS determinization (information set sampling)
    rollout.ts             # Random rollout (simulation) policy
    backprop.ts            # Max^n backpropagation
    mcts-solver.ts         # Proven win/loss propagation
    mcts-config.ts         # Configuration types and defaults
    index.ts               # Public re-exports
  factory.ts               # Updated: add 'mcts' agent type
  index.ts                 # Updated: re-export mcts module
```

### Module Dependency Graph

```
mcts-agent.ts
  ├── mcts-search.ts
  │     ├── uct.ts
  │     ├── determinize.ts
  │     ├── rollout.ts
  │     ├── backprop.ts
  │     └── mcts-solver.ts
  ├── mcts-node.ts
  └── mcts-config.ts

External kernel dependencies:
  ├── kernel/legal-moves.ts       (legalMoves)
  ├── kernel/apply-move.ts        (applyMove)
  ├── kernel/terminal.ts          (terminalResult)
  ├── kernel/move-completion.ts   (completeTemplateMove)
  ├── kernel/prng.ts              (nextInt, splitRng)
  └── kernel/types.ts             (Agent, GameDef, GameState, Move, Rng, PlayerId)
```

## Key Types & Interfaces

### Agent Interface (unchanged — from Spec 02)

```typescript
interface Agent {
  chooseMove(input: {
    readonly def: GameDef;
    readonly state: GameState;
    readonly playerId: PlayerId;
    readonly legalMoves: readonly Move[];
    readonly rng: Rng;
    readonly runtime?: GameDefRuntime;
  }): { readonly move: Move; readonly rng: Rng };
}
```

### MCTS Configuration

```typescript
interface MctsConfig {
  /** Maximum MCTS iterations per move. Default: 1000. */
  readonly iterations: number;

  /** Optional wall-clock time limit in milliseconds. If set, search stops
   *  when either iterations or time limit is reached, whichever comes first. */
  readonly timeLimitMs?: number;

  /** UCT exploration constant (C in UCB1 formula). Default: sqrt(2) ≈ 1.414. */
  readonly explorationConstant: number;

  /** Maximum rollout depth before heuristic cutoff. Default: 200. */
  readonly maxRolloutDepth: number;

  /** Number of determinizations to sample per move for ISMCTS.
   *  Default: 1 (single determinization per iteration, as in standard ISMCTS).
   *  For perfect-information games this is ignored. */
  readonly determinizations: number;

  /** Enable MCTS-Solver for proven win/loss propagation. Default: true. */
  readonly solver: boolean;
}

const DEFAULT_MCTS_CONFIG: MctsConfig = {
  iterations: 1000,
  explorationConstant: Math.SQRT2,
  maxRolloutDepth: 200,
  determinizations: 1,
  solver: true,
};
```

### Tree Node

```typescript
interface MctsNode {
  /** The move that led to this node (null for root). */
  readonly move: Move | null;

  /** Visit count. */
  visits: number;

  /** Per-player cumulative reward vector (index = PlayerId). */
  totalReward: number[];

  /** Child nodes, lazily expanded. */
  children: MctsNode[];

  /** Whether all legal moves from this node have been expanded. */
  fullyExpanded: boolean;

  /** MCTS-Solver: proven result if known (win/loss/draw per player). */
  provenResult: ProvenResult | null;

  /** Parent pointer for backpropagation. */
  parent: MctsNode | null;
}

type ProvenResult =
  | { readonly kind: 'win'; readonly player: PlayerId }
  | { readonly kind: 'draw' }
  | { readonly kind: 'loss'; readonly player: PlayerId };
```

### Agent Factory Update

```typescript
type AgentType = 'random' | 'greedy' | 'mcts';

function createAgent(type: AgentType, config?: MctsConfig): Agent;
```

`parseAgentSpec` updated to accept `mcts` and optional config notation (e.g., `"mcts:2000"` for 2000 iterations).

## Core Algorithm

### MCTS Search Loop

Each call to `MctsAgent.chooseMove()` executes:

```
function mctsSearch(root: MctsNode, state: GameState, def: GameDef, config: MctsConfig, rng: Rng):
  for i in 0..config.iterations:
    // 1. DETERMINIZE (ISMCTS): sample a world consistent with current player's information set
    [deterministicState, rng] = determinize(state, def, activePlayer, rng)

    // 2. SELECT: walk tree using UCT until reaching an unexpanded or terminal node
    [selectedNode, pathState] = select(root, deterministicState, def)

    // 3. EXPAND: add one new child node
    [childNode, childState] = expand(selectedNode, pathState, def, rng)

    // 4. ROLLOUT: simulate random play to terminal or depth limit
    [rewards, rng] = rollout(childState, def, config.maxRolloutDepth, rng)

    // 5. BACKPROPAGATE: update visit counts and reward vectors up the tree
    backpropagate(childNode, rewards)

    // 6. SOLVER CHECK: propagate proven results if enabled
    if config.solver:
      solverBackpropagate(childNode)

  // Choose move with highest visit count (most robust child)
  bestChild = argmax(root.children, child => child.visits)
  return bestChild.move
```

### UCT Selection Policy

Standard UCB1 adapted for multiplayer:

```
UCT(node, parentVisits, exploringPlayer) =
  (node.totalReward[exploringPlayer] / node.visits)
  + C * sqrt(ln(parentVisits) / node.visits)
```

Where `C` is `config.explorationConstant`. Ties broken by PRNG for determinism.

### ISMCTS Determinization

For games with hidden information (zones with visibility restrictions):

1. Identify all hidden zones not visible to the deciding player
2. For each hidden zone, enumerate tokens known to exist but whose exact location is unknown
3. Randomly redistribute hidden tokens among hidden zones consistent with known constraints
4. The resulting "determinized" state is a complete-information state that the agent can search normally

**Fair play guarantee**: The agent never reads the true hidden state. It only samples from the space of states consistent with what the player *should* know.

**Perfect information optimization**: If `def.zones` contains no visibility restrictions, skip determinization entirely (zero overhead for perfect-info games like chess analogues).

```typescript
function determinize(
  state: GameState,
  def: GameDef,
  observer: PlayerId,
  rng: Rng,
): { state: GameState; rng: Rng } {
  // If no hidden zones exist for this player, return state unchanged
  // Otherwise:
  // 1. Collect tokens in zones hidden from observer
  // 2. Randomly redistribute them among those zones
  // 3. Return the determinized state
}
```

### Max^n Backpropagation

For N-player games, each node stores a reward vector of length N (one entry per player). During rollout, terminal states produce a reward vector:

- **Win**: winning player gets 1.0, all others get 0.0
- **Draw**: all players get 0.5
- **Ranking** (scoring terminal): normalized scores in [0, 1] based on relative ranking
- **Non-terminal cutoff**: use `evaluateState()` normalized to [0, 1] per player

During backpropagation, each node accumulates the full reward vector. UCT selection uses the component corresponding to the player whose turn it is at that node.

```typescript
function backpropagate(node: MctsNode, rewards: readonly number[]): void {
  let current: MctsNode | null = node;
  while (current !== null) {
    current.visits += 1;
    for (let p = 0; p < rewards.length; p++) {
      current.totalReward[p] += rewards[p];
    }
    current = current.parent;
  }
}
```

### Decision Sequence Handling

The kernel's `legalMoves()` returns moves for the *current decision point*, which may be a sub-decision within a multi-step action. MCTS treats each call to `legalMoves()` as a node in the tree — it does not need to distinguish between "top-level" and "sub-decision" moves. The kernel's `applyMove()` advances the state to the next decision point (or terminal), which is exactly what MCTS needs.

This means MCTS naturally handles:
- Multi-step operations (FITL operations with sequential choices)
- Compound moves with parameters (template moves completed via `completeTemplateMove`)
- Event card choices requiring interactive decisions

No special handling is required beyond the standard `legalMoves → applyMove` loop.

### MCTS-Solver

Proven win/loss propagation (Winands et al. 2008):

1. When a terminal node is reached during expansion, mark it as proven (win/loss/draw)
2. During backpropagation, check if a node's children are all proven:
   - If the active player has any child proven as a win → node is proven win
   - If all children are proven losses for the active player → node is proven loss
   - If all children are proven and none is a win → proven draw (if any draws exist) or loss
3. Proven nodes are excluded from further UCT selection (no wasted iterations)
4. If the root becomes proven, return immediately

For multiplayer (max^n), "win" means the acting player's reward is maximal among all children.

```typescript
function solverBackpropagate(node: MctsNode): void {
  // Walk up from node, checking if parent can be proven
  // based on children's proven results and acting player at each level
}
```

## Rollout Policy

### Phase 1: Uniform Random

The baseline rollout policy plays uniformly random moves until a terminal state or depth limit is reached. Uses the existing `RandomAgent` logic (including `completeTemplateMove` for template moves).

```typescript
function randomRollout(
  state: GameState,
  def: GameDef,
  maxDepth: number,
  rng: Rng,
  runtime?: GameDefRuntime,
): { rewards: number[]; rng: Rng } {
  let currentState = state;
  let currentRng = rng;
  let depth = 0;

  while (depth < maxDepth) {
    const terminal = terminalResult(def, currentState);
    if (terminal !== null) {
      return { rewards: terminalToRewards(terminal, currentState.playerCount), rng: currentRng };
    }

    const moves = legalMoves(def, currentState, undefined, runtime);
    if (moves.length === 0) break;

    // Pick random move (reuse pickRandom from agent-move-selection)
    const { item: move, rng: nextRng } = pickRandom(moves, currentRng);
    const completed = completeTemplateMove(def, currentState, move, nextRng, runtime);
    if (completed.kind !== 'completed') {
      // Stochastic or unsatisfiable — use as-is or skip
      currentRng = completed.rng;
      break;
    }

    const result = applyMove(def, currentState, completed.move, undefined, runtime);
    currentState = result.state;
    currentRng = completed.rng;
    depth += 1;
  }

  // Non-terminal cutoff: use heuristic evaluation
  return {
    rewards: evaluateForAllPlayers(def, currentState),
    rng: currentRng,
  };
}
```

### Future Enhancement: MAST (Move-Average Sampling Technique)

Track average reward per move action across all rollouts. Bias rollout move selection toward moves with historically higher rewards. This is a simple, game-agnostic enhancement that typically improves rollout quality significantly. **Deferred to Phase 2.**

## Heuristic Evaluation

### Phase 1: Reuse Existing `evaluateState()`

The existing `evaluateState()` function in `agents/evaluate-state.ts` already provides a game-agnostic heuristic based on:
- Terminal detection (win/loss/draw)
- Per-player variable values (normalized by range)
- Scoring expressions from GameDef

For MCTS rollout cutoff, normalize this to [0, 1] per player:

```typescript
function evaluateForAllPlayers(def: GameDef, state: GameState): number[] {
  const raw: number[] = [];
  for (let p = 0; p < state.playerCount; p++) {
    raw.push(evaluateState(def, state, p as PlayerId));
  }
  // Normalize to [0, 1] via softmax or min-max normalization
  return normalizeRewards(raw);
}
```

### Future Enhancement: Auto-Derived Heuristics

Automatically derive evaluation weights from GameDef structure:
- Zone control bonuses based on spatial centrality
- Token count differentials
- Progress toward terminal conditions

**Deferred to Phase 2.**

## Integration with Agent Factory

### Factory Update

```typescript
// factory.ts
type AgentType = 'random' | 'greedy' | 'mcts';

const createAgent = (type: AgentType, config?: Partial<MctsConfig>): Agent => {
  switch (type) {
    case 'random':
      return new RandomAgent();
    case 'greedy':
      return new GreedyAgent();
    case 'mcts':
      return new MctsAgent(config);
    default:
      throw new Error(`Unknown agent type: ${type}`);
  }
};
```

### Agent Spec String

`parseAgentSpec` accepts MCTS with optional iteration count:

```
"mcts,mcts,random,mcts"          → 4 players, 3 MCTS (default config) + 1 random
"mcts:2000,mcts:500"             → 2 players, different iteration budgets
"greedy,mcts:1000"               → mixed agent types
```

## Performance Targets

| Metric | Target | Rationale |
|--------|--------|-----------|
| 1000 iterations | < 2s per move | Usable for interactive play |
| 5000 iterations | < 10s per move | Acceptable for evolution pipeline |
| Memory per search | < 50 MB | Node pool for 1M nodes |
| Win rate vs RandomAgent | > 80% | Minimum competence bar |
| Win rate vs GreedyAgent | > 60% | Meaningful improvement over 1-ply |

### Memory Management

Nodes are allocated from a pre-sized pool to avoid GC pressure during search. Pool size is derived from iteration count (worst case: one new node per iteration).

```typescript
interface NodePool {
  readonly capacity: number;
  allocate(): MctsNode;
  reset(): void;  // Reclaim all nodes for next search
}
```

## Testing Strategy

### Unit Tests

| File | Coverage |
|------|----------|
| `mcts-node.test.ts` | Node creation, child management, visit/reward updates |
| `uct.test.ts` | UCT formula correctness, tie-breaking determinism, exploration vs exploitation |
| `determinize.test.ts` | Determinization preserves visible state, randomizes hidden state, no-op for perfect info |
| `rollout.test.ts` | Rollout reaches terminal or depth limit, reward vector correctness |
| `backprop.test.ts` | Max^n reward propagation, visit count accumulation |
| `mcts-solver.test.ts` | Proven win/loss propagation, early termination |
| `mcts-config.test.ts` | Default config, validation, merge with partial overrides |

### Integration Tests

| Test | Description |
|------|-------------|
| `mcts-agent-perfect-info.test.ts` | MctsAgent plays a simple perfect-info game (e.g., Tic-Tac-Toe fixture) to completion |
| `mcts-agent-hidden-info.test.ts` | MctsAgent plays Texas Hold'em or a card game fixture with hidden zones |
| `mcts-agent-multiplayer.test.ts` | MctsAgent plays a 4-player FITL-like fixture — verifies N-player backprop |
| `mcts-vs-random.test.ts` | Statistical test: MctsAgent wins > 70% against RandomAgent over 100 games |
| `mcts-vs-greedy.test.ts` | Statistical test: MctsAgent wins > 50% against GreedyAgent over 100 games |
| `mcts-determinism.test.ts` | Same seed + same game state = identical move selection |

### Property Tests

- MctsAgent never returns a move not in `legalMoves`
- MctsAgent never crashes on any legal game state (fuzz with random states)
- Visit counts are monotonically non-decreasing
- Reward vectors stay in valid bounds [0, 1]
- Determinization never reveals hidden tokens to the observing player

### Performance Tests

- Benchmark: iterations/second for a reference GameDef
- Memory: peak allocation during 5000-iteration search
- Regression guard: fail if iterations/second drops below threshold

## Phased Delivery Plan

### Phase 1: Core MCTS (Tickets: MCTSAGENT-001 through MCTSAGENT-006)

**Goal**: Working MCTS agent for perfect-information games.

| Ticket | Deliverable |
|--------|-------------|
| MCTSAGENT-001 | `mcts-config.ts`, `mcts-node.ts` — configuration types, node data structure, node pool |
| MCTSAGENT-002 | `uct.ts` — UCT selection policy with deterministic tie-breaking |
| MCTSAGENT-003 | `rollout.ts` — random rollout policy using existing `pickRandom` and `completeTemplateMove` |
| MCTSAGENT-004 | `backprop.ts` — max^n backpropagation for N-player reward vectors |
| MCTSAGENT-005 | `mcts-search.ts` — core search loop (select → expand → rollout → backprop) |
| MCTSAGENT-006 | `mcts-agent.ts`, factory update — `MctsAgent` class, agent factory integration, `parseAgentSpec` update |

**Exit criteria**: MctsAgent beats RandomAgent > 80% on a perfect-info test fixture. All unit + integration tests pass. Determinism verified.

### Phase 2: Hidden Information & Solver (Tickets: MCTSAGENT-007 through MCTSAGENT-009)

**Goal**: ISMCTS determinization for hidden-info games, MCTS-Solver for proven results.

| Ticket | Deliverable |
|--------|-------------|
| MCTSAGENT-007 | `determinize.ts` — ISMCTS determinization, hidden zone detection, constraint-consistent redistribution |
| MCTSAGENT-008 | `mcts-solver.ts` — proven win/loss propagation, early termination |
| MCTSAGENT-009 | Integration tests for hidden-info games (Texas Hold'em fixture) and solver correctness |

**Exit criteria**: MctsAgent plays Texas Hold'em without seeing opponents' cards. Solver correctly identifies forced wins in simple endgames. Performance targets met.

### Phase 3: Parallelism & Enhancements (Future)

- Root parallelism (multiple independent trees, merged statistics)
- MAST rollout policy
- Auto-derived heuristic evaluation
- Tree recycling across moves
- Progressive widening for high-branching-factor games

## Key References

1. **Browne et al. 2012** — "A Survey of Monte Carlo Tree Search Methods." IEEE Transactions on Computational Intelligence and AI in Games. *Comprehensive MCTS survey covering UCT, enhancements, and applications.*

2. **Cowling, Powley & Whitehouse 2012** — "Information Set Monte Carlo Tree Search." IEEE Transactions on Computational Intelligence and AI in Games. *Defines ISMCTS: determinization approach for hidden-information games.*

3. **Sturtevant 2008** — "An Analysis of UCT in Multi-Player Games." ICGA Journal. *Max^n backpropagation for multiplayer MCTS.*

4. **Winands, Bjornsson & Saito 2008** — "Monte-Carlo Tree Search Solver." Computers and Games. *MCTS-Solver: proven win/loss propagation.*

5. **Finnsson & Bjornsson 2008** — "Simulation-Based Approach to General Game Playing." AAAI. *CadiaPlayer: MCTS for General Game Playing, demonstrating universal competence.*

6. **Chaslot, Winands & van den Herik 2008** — "Parallel Monte-Carlo Tree Search." Computers and Games. *Root parallelism and tree parallelism approaches.*

## Design Decisions & Rationale

### Why MCTS over Minimax/Alpha-Beta?

- **Game-agnostic**: MCTS needs no evaluation function to be useful (random rollouts suffice). Alpha-Beta requires a heuristic for every game.
- **Anytime**: MCTS can be stopped at any iteration count and still return a reasonable move. Alpha-Beta must complete a depth level.
- **Hidden information**: ISMCTS handles imperfect information naturally. Alpha-Beta has no standard approach.
- **Multiplayer**: Max^n MCTS scales to N players. Alpha-Beta is fundamentally two-player.

### Why max^n over Paranoid or BRS?

- **Correctness**: Max^n is the theoretically correct extension of minimax to N players — each player maximizes their own reward.
- **No coalition assumption**: Paranoid assumes all opponents cooperate against you (too pessimistic). BRS (Best Reply Search) assumes opponents are passive (too optimistic). Max^n makes no such assumption.
- **Simplicity**: max^n adds minimal complexity — just a reward vector instead of a scalar.

### Why determinization (ISMCTS) over other hidden-info approaches?

- **Simplicity**: Determinization is straightforward to implement on top of standard MCTS. No need for belief tracking or Bayesian updates.
- **Proven track record**: ISMCTS won multiple GGP competitions and performs well in practice despite known theoretical limitations (strategy fusion).
- **Compatible with kernel**: The kernel already tracks zone visibility via `RevealGrant`. Determinization just needs to sample consistent worlds.
- **Fair play**: The agent never reads true hidden state — it constructs plausible worlds from its information set, which is exactly what a human player does.

### Why MCTS-Solver?

- In many endgame situations, MCTS wastes iterations exploring positions that are already decided. MCTS-Solver detects proven wins/losses and prunes them from search, dramatically improving endgame play with minimal overhead.

### Why reuse `evaluateState()` for rollout cutoff?

- Already exists, is game-agnostic, and produces reasonable valuations based on GameDef structure. Avoids duplicating heuristic logic. Can be replaced with a better evaluation in Phase 2 without changing the MCTS architecture.
