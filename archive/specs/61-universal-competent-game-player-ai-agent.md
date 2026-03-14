# Spec 61: Universal Competent Game Player AI Agent

**Status**: ✅ COMPLETED
**Priority**: P2 (post-MVP enhancement)  
**Complexity**: XL  
**Dependencies**: Spec 02, Spec 06, Spec 09, Spec 10  
**Estimated effort**: 4–6 weeks (phased)  
**Source sections**: Brainstorming section 2.3 (agents), post-MVP roadmap item 2

## Overview

Implement a **universal, competent, fair game-playing AI agent** based on **open-loop Monte Carlo Tree Search (MCTS)** with **belief sampling** for hidden information and unknown future stochastic outcomes.

The agent must work for any game compiled to `GameDef` without game-specific evaluation code. It must be:

- **Competent**: avoids obvious blunders, finds short tactical wins/blocks, and feels like a credible adversary.
- **Universal**: works for perfect-information, hidden-information, deterministic, stochastic, 2-player, and multiplayer games.
- **Fair**: never uses hidden zones, filtered reveals, or latent future game RNG as ground truth.
- **Practical**: fast enough for interactive play and reproducible enough for automated evaluation.

This is not a research-complete GGP system. It is the strongest practical, game-agnostic search agent that fits the current engine architecture.

## Non-Negotiable Design Constraints

1. Root decisions must depend only on the acting player’s **represented observation**, not the raw hidden state.
2. Unknown future chance outcomes are hidden information too. The search must not exploit `GameState.rng` as if it were visible.
3. The search tree is **open-loop** (keyed by action history / sampled concrete actions), not a closed-loop state tree.
4. Hidden-information selection uses **availability-aware ISMCTS selection**, not plain UCT over parent visits.
5. Large branching factors are first-class. **Progressive widening** and **lazy template completion** are required.
6. **MCTS-Solver is not generally sound** for hidden-info / stochastic / multiplayer search. Solver support is restricted accordingly.
7. **Iteration-budget mode** is the determinism contract. Wall-clock mode is optional and not part of the reproducibility guarantee.

## Motivation

1. The evolution pipeline needs a meaningful opponent. `RandomAgent` is noise and `GreedyAgent` is too shallow.
2. The platform needs one serious default agent that works across current and future YAML-defined games.
3. Hidden-info games must be fair: the agent cannot gain strength by reading opponents’ private cards, deck order, or future random outcomes from raw engine state.
4. Difficulty should scale with budget, not per-game hand tuning.

## Scope

### In Scope

- Open-loop MCTS over action histories
- Hidden-information belief sampling based on current represented observation
- Future game-RNG resampling so search does not exploit latent chance outcomes
- Availability-aware selection for hidden-information search
- Multiplayer reward-vector backpropagation
- Progressive widening for large action spaces
- Lazy concrete expansion for template moves
- Short, generic, heuristic-guided rollouts
- Reuse of existing `evaluateState()` through a robust utility transform
- Reuse of `GameDefRuntime` across all internal search calls
- Deterministic iteration-budget mode
- Optional wall-clock budget for interactive play
- Optional restricted solver mode for deterministic perfect-information 2-player games only
- Integration with existing `Agent` interface and agent factory

### Out of Scope

- Neural policy/value networks
- Opening books / tablebases
- Exact perfect-recall information sets for games whose player knowledge depends on history not represented in `GameState`
- Explicit chance-node enumeration
- General transposition tables across belief-sampled states
- Tree reuse across moves
- Parallel search
- Game-specific heuristic functions
- Multi-observer / re-determinizing ISMCTS variants
- Full solver support for hidden-info, stochastic, score-ranking, or multiplayer games

## Important Limitation

V1 belief sampling is only as good as the engine’s represented player knowledge.

The current engine represents zone visibility, reveal grants, and public state, but it does **not** expose a dedicated perfect-recall information-set history to the `Agent` interface. Therefore:

- V1 search is **fair with respect to represented observation**.
- V1 search is **not** a guarantee of exact perfect-recall information-set reasoning for games where knowledge depends on earlier observations no longer represented in current state.

This limitation must be documented explicitly.

## Architecture

### File Layout

~~~text
packages/engine/src/
  kernel/
    observation.ts            # NEW: shared visibility / observation projection utilities
    state-hash.ts             # NEW or existing helper: recompute stateHash for synthetic search states
    move-legality.ts          # NEW helper if needed: validate / materialize concrete moves for search
  agents/
    mcts/
      mcts-agent.ts           # MctsAgent implementing Agent
      search.ts               # Core search loop
      node.ts                 # Open-loop node structure + pool
      isuct.ts                # Availability-aware selection formula
      belief.ts               # Observation projection + hidden-state / future-RNG sampling
      move-key.ts             # Canonical move serialization / dedupe
      expansion.ts            # Progressive widening + template completion materialization
      rollout.ts              # Short heuristic-guided rollout policy
      evaluate.ts             # Utility transforms
      solver.ts               # Restricted solver
      config.ts               # Config types, defaults, validation
      diagnostics.ts          # Optional internal stats
      index.ts
    factory.ts                # Updated: add 'mcts'
    index.ts                  # Updated: re-export mcts module
~~~

## Core Design Choice: Open-Loop Belief-Sampled Search

This agent is **open-loop**.

Nodes do **not** represent exact game states. They represent action history from the root and aggregate statistics across many sampled hidden states and sampled future stochastic outcomes.

That is the right practical choice here because:

- hidden information varies across determinizations,
- future chance outcomes are unknown to players,
- template moves can explode branching factor,
- the engine does not expose explicit chance distributions or perfect-recall information sets.

Consequences:

- child legality is checked against the **current sampled search state** during each iteration,
- node statistics are aggregated over many sampled worlds,
- `stateHash` is **not** the primary node identity.

## Key Types & Interfaces

### Agent Interface (unchanged)

~~~typescript
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
~~~

### MCTS Configuration

~~~typescript
interface MctsConfig {
  /** Hard iteration cap. Deterministic mode uses this as the primary budget. */
  readonly iterations: number;

  /** Optional minimum iterations before wall-clock early stop is allowed. */
  readonly minIterations: number;

  /** Optional wall-clock budget for interactive play. */
  readonly timeLimitMs?: number;

  /** Exploration constant for availability-aware selection. */
  readonly explorationConstant: number;

  /** Maximum plies simulated after tree expansion before heuristic cutoff. */
  readonly maxSimulationDepth: number;

  /** Progressive widening constant: maxChildren = K * visits^alpha. */
  readonly progressiveWideningK: number;

  /** Progressive widening exponent. */
  readonly progressiveWideningAlpha: number;

  /** Max concrete completions sampled from a single template move per visit. */
  readonly templateCompletionsPerVisit: number;

  /** Rollout policy. */
  readonly rolloutPolicy: 'random' | 'epsilonGreedy';

  /** Exploration rate for epsilon-greedy rollouts. */
  readonly rolloutEpsilon: number;

  /** Max candidate moves sampled per rollout step before heuristic choice. */
  readonly rolloutCandidateSample: number;

  /** Temperature for transforming evaluateState() outputs into [0,1] utilities. */
  readonly heuristicTemperature: number;

  /** Restricted solver support only. */
  readonly solverMode: 'off' | 'perfectInfoDeterministic2P';

  /** Optional internal diagnostics for tuning/tests. */
  readonly diagnostics?: boolean;
}

const DEFAULT_MCTS_CONFIG: MctsConfig = {
  iterations: 1500,
  minIterations: 128,
  explorationConstant: 1.4,
  maxSimulationDepth: 48,
  progressiveWideningK: 2.0,
  progressiveWideningAlpha: 0.5,
  templateCompletionsPerVisit: 2,
  rolloutPolicy: 'epsilonGreedy',
  rolloutEpsilon: 0.15,
  rolloutCandidateSample: 6,
  heuristicTemperature: 10_000,
  solverMode: 'off',
};
~~~

### Node Structure

~~~typescript
type MoveKey = string;

interface MctsNode {
  /** Concrete move that led to this node. Null for root. */
  readonly move: Move | null;

  /** Canonical key for move dedupe. Null for root. */
  readonly moveKey: MoveKey | null;

  /** Parent pointer for backpropagation. */
  readonly parent: MctsNode | null;

  /** Number of completed simulations through this node. */
  visits: number;

  /** Number of times this move was available for selection at its parent. */
  availability: number;

  /** Cumulative per-player utility totals. */
  totalReward: number[];

  /** Optional heuristic prior captured at expansion time. */
  heuristicPrior: number[] | null;

  /** Concrete child moves only. */
  children: MctsNode[];

  /** Optional proven result; only used in restricted solver mode. */
  provenResult: ProvenResult | null;
}

type ProvenResult =
  | { readonly kind: 'win'; readonly forPlayer: PlayerId }
  | { readonly kind: 'loss'; readonly forPlayer: PlayerId }
  | { readonly kind: 'draw' };
~~~

## Required Shared Observation Utilities

A new engine-side observation layer is required so the agent and runner do not diverge.

### Observation Projection

~~~typescript
interface PlayerObservation {
  readonly observer: PlayerId;
  readonly visibleTokenIdsByZone: Readonly<Record<string, readonly string[]>>;
  readonly visibleTokenOrderByZone: Readonly<Record<string, readonly string[]>>;
  readonly visibleRevealsByZone: Readonly<Record<string, readonly RevealGrant[]>>;
  readonly requiresHiddenSampling: boolean;
}

function derivePlayerObservation(
  def: GameDef,
  state: GameState,
  observer: PlayerId,
): PlayerObservation;
~~~

`derivePlayerObservation()` must use the same semantics as the runner’s current visibility logic:

- zone visibility: `public` / `owner` / `hidden`
- zone ownership
- dynamic `RevealGrant`s
- filtered reveal grants
- token-level visibility
- visible ordering where ordering conveys information

This logic belongs in shared engine code, not duplicated ad hoc in MCTS.

### Belief Sampling

~~~typescript
function sampleBeliefState(
  def: GameDef,
  rootState: GameState,
  observation: PlayerObservation,
  observer: PlayerId,
  rng: Rng,
): { readonly state: GameState; readonly rng: Rng };
~~~

`sampleBeliefState()` must do **both**:

1. Hidden-state sampling for hidden / partially hidden zones.
2. Future-RNG sampling by replacing `searchState.rng` with a sampled unknown RNG state so the search does not exploit latent future chance outcomes.

### Belief Sampling Rules

The default generic sampler must:

1. Preserve all currently visible tokens exactly.
2. Preserve all observer-visible ordering information exactly.
3. Preserve zone counts, ownership partitioning, and public token identities.
4. Respect dynamic reveal grants and filtered reveals.
5. Preserve all constraints representable from current state.
6. Never move a token between zones unless the observer cannot distinguish which of those zones it belongs to.
7. Recompute `stateHash` for the synthetic search state, or mark the sampled state as search-only and ensure no search path relies on stale hash values.
8. Replace `searchState.rng` with a newly sampled RNG state derived from the search RNG.

### Conservative Default for Hidden-State Sampling

The default generic sampler must be **conservative**.

It must **not** perform arbitrary hidden-token redistribution across zones merely because those zones are hidden. That can easily create impossible or strategically absurd states.

Default behavior:

- preserve per-zone token counts,
- preserve owner partitions,
- preserve known public token identities,
- only shuffle assignments within uncertainty classes that are actually ambiguous from the observer’s represented observation.

If exact validity cannot be guaranteed generically, prefer a **narrower but valid sampler** over an over-aggressive one.

## Move Identity and Template Handling

### Canonical Move Keys

~~~typescript
function canonicalMoveKey(move: Move): MoveKey;
~~~

Requirements:

- stable across equivalent param ordering,
- includes `actionId`, concrete params, and compound payload where relevant,
- deterministic.

### Template Moves: Required Strategy

The tree operates on **concrete moves**, not raw unresolved templates.

Because `legalMoves()` may return template moves, MCTS needs a lazy materialization layer:

~~~typescript
interface ConcreteMoveCandidate {
  readonly move: Move;
  readonly moveKey: MoveKey;
}

function materializeConcreteCandidates(
  def: GameDef,
  state: GameState,
  legalMoves: readonly Move[],
  rng: Rng,
  limitPerTemplate: number,
  runtime?: GameDefRuntime,
): { readonly candidates: readonly ConcreteMoveCandidate[]; readonly rng: Rng };
~~~

Rules:

1. Non-template legal moves are yielded as-is.
2. Template moves are completed **lazily**, not exhaustively.
3. Only the selected / sampled template move is completed; do **not** complete every template move at every node.
4. Concrete completions are deduplicated by `MoveKey`.
5. Progressive widening controls how many concrete completions are admitted into a node over time.
6. Root search must reuse `input.legalMoves`; it must not recompute root legal moves unless required for template materialization.

If the current kernel surface does not provide a clean way to validate whether a previously expanded concrete move is currently legal, add a lightweight helper in shared engine code for search use.

## Core Algorithm

### `chooseMove()` Outline

~~~text
function chooseMove(input):
  if input.legalMoves.length === 1:
    return that move immediately

  runtime = input.runtime ?? buildRuntimeOnce(def)

  // Isolate internal search randomness from externally returned agent RNG.
  [searchRng, nextAgentRng] = fork(input.rng)

  observation = derivePlayerObservation(def, input.state, input.playerId)
  root = createRootNode(playerCount)

  deadline = now + timeLimitMs if configured
  iterations = 0

  while iterations < config.iterations:
    if timeLimitMs is set and iterations >= minIterations and now >= deadline:
      break

    [iterationRng, searchRng] = fork(searchRng)
    [sampledState, iterationRng] =
      sampleBeliefState(def, input.state, observation, input.playerId, iterationRng)

    result = runOneIteration(root, sampledState, iterationRng, runtime, input.legalMoves)
    searchRng = result.rng
    iterations += 1

    if solver proves root and solver is enabled:
      break

  bestChild = selectRootDecision(root)
  return { move: bestChild.move, rng: nextAgentRng }
~~~

### One Iteration

Each iteration performs:

1. **Belief sample**: sample hidden state and unknown future RNG from represented observation.
2. **Selection**: traverse the open-loop tree using availability-aware selection over legal children in the current sampled state.
3. **Expansion**: if widening allows and an unexpanded legal concrete move exists, add exactly one child.
4. **Simulation**: rollout from the expanded state (or selected leaf) to terminal or depth cutoff.
5. **Backpropagation**: update visits and reward vectors up the path.
6. **Restricted solver update**: only when solver mode is valid for the current game/search mode.

## Selection Policy

### Availability-Aware Hidden-Info Selection

Plain UCT over parent visits is wrong here because not every action is available in every sampled world.

Use availability-aware selection:

~~~text
score(child, exploringPlayer) =
  meanReward(child, exploringPlayer)
  + C * sqrt(ln(max(1, child.availability)) / child.visits)
~~~

Where:

- `meanReward = child.totalReward[exploringPlayer] / child.visits`
- `child.availability` is incremented whenever that move is legal at the parent in the current sampled state
- unvisited available children are preferred for expansion before applying the formula

### Acting Player

At each selected node, `exploringPlayer` is read from the **current sampled state’s** `activePlayer`, not cached on the node.

### Child Legality in Open-Loop Search

A previously expanded child may be unavailable in a later sampled world.

Rules:

- only available children participate in selection for that iteration,
- unavailable children are skipped, not penalized,
- availability counts are updated only when a child is actually available.

## Expansion Policy

### Progressive Widening

Large move spaces are part of the problem, not an edge case.

Use progressive widening:

~~~text
maxChildren(node) = max(1, floor(K * node.visits^alpha))
~~~

A node may add a new child only when:

~~~text
node.children.length < maxChildren(node)
~~~

Starting defaults:

- `K = 2.0`
- `alpha = 0.5`

These are defaults, not per-game truths.

### Expansion Priority

When multiple unexpanded legal concrete moves are available, expansion priority is:

1. immediate terminal win for the acting player,
2. move with best one-step heuristic value among sampled candidates,
3. PRNG tie-break.

That is a cheap, game-agnostic competence boost.

## Simulation / Rollout Policy

### Default Rollout = Short Epsilon-Greedy

Pure random playouts are too weak for many card/board games and too expensive when run deeply.

Default rollout policy is **short epsilon-greedy rollout**:

1. stop immediately on terminal state,
2. enumerate current legal moves,
3. sample up to `rolloutCandidateSample` candidate moves,
4. lazily materialize concrete completions for sampled templates,
5. evaluate successor states with one-step `evaluateState()` for the acting player,
6. choose best sampled move with probability `1 - epsilon`, else choose random sampled move,
7. stop at `maxSimulationDepth` and apply leaf evaluation.

A pure-random rollout mode may still exist for benchmarking/debugging, but it is not the default competence mode.

## Utility / Reward Model

### Terminal Reward Mapping

~~~typescript
function terminalToRewards(result: TerminalResult, playerCount: number): number[];
~~~

Rules:

- `win` -> winner `1.0`, others `0.0`
- `draw` -> all players `0.5`
- `lossAll` -> all players `0.0`
- `score` / ranking -> normalize final scores or final placements to `[0,1]`, preserving ties

If raw terminal scores are available, use them. If only ranking is available, normalize by placement with tie preservation.

### Non-Terminal Leaf Evaluation

`evaluateState()` is useful, but its raw scale is not directly usable as MCTS utility because terminal states use extreme constants.

Rules:

1. **Never** normalize terminal and non-terminal states together.
2. Check terminal first and use `terminalToRewards()`.
3. For non-terminal cutoff states:

~~~typescript
function evaluateForAllPlayers(
  def: GameDef,
  state: GameState,
  temperature: number,
): number[] {
  const raw = players.map((p) => evaluateState(def, state, p));
  const mean = average(raw);
  return raw.map((v) => sigmoid((v - mean) / temperature));
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}
~~~

A centered-logistic transform is preferred over naive min-max normalization because min-max becomes unstable when one player’s raw score is an outlier.

## Backpropagation

~~~typescript
function backpropagate(node: MctsNode, rewards: readonly number[]): void {
  let current: MctsNode | null = node;
  while (current !== null) {
    current.visits += 1;
    for (let p = 0; p < rewards.length; p += 1) {
      current.totalReward[p] += rewards[p];
    }
    current = current.parent;
  }
}
~~~

The search stores full reward vectors and uses the current acting player’s component during selection.

## Restricted Solver Support

### Solver Scope Is Deliberately Narrow

MCTS-Solver is **not** enabled generically.

V1 solver mode is allowed only when all of the following hold:

- game is deterministic from the searched state onward,
- game is perfect-information,
- player count is exactly 2,
- terminal semantics are win/loss/draw (not score-ranking).

If those conditions are not met, `solverMode` behaves as `off`.

### Why So Narrow

Applying solver logic to belief-sampled hidden-info trees or stochastic trees is unsound. Applying it to score-ranking or general multiplayer utilities is also much more complex than the draft assumed.

## Decision Sequence Handling

The kernel’s `legalMoves -> applyMove` loop already models sub-decisions.

The agent therefore treats every decision point as a node regardless of whether it is:

- a top-level action,
- a sub-decision inside a compound move,
- a template completion choice,
- a multi-step operation choice.

No special top-level/sub-decision distinction is required.

## Stochastic Effects and Chance Handling

The engine resolves stochastic effects through `GameState.rng` during `applyMove()`.

Therefore the search must treat future `GameState.rng` as hidden chance information.

V1 handling:

- no explicit chance-node enumeration,
- each iteration samples a fresh hidden future RNG state,
- transitions are sampled by normal `applyMove()` calls on the sampled search state.

This yields a practical stochastic search without requiring the kernel to expose chance distributions.

## Determinism Contract

### Deterministic Mode

Given the same:

- input state,
- player observation,
- input legal moves,
- search config,
- agent RNG,
- runtime cache,

**iteration-budget mode** must produce the same chosen move and the same returned agent RNG.

### Time-Budget Mode

Wall-clock mode is allowed for interactive play but is **not** the determinism contract.

### RNG Isolation

Internal search randomness must not leak into the externally returned agent RNG.

Required pattern:

~~~text
[searchRng, nextAgentRng] = fork(input.rng)
~~~

- use `searchRng` for all internal sampling,
- return `nextAgentRng` unchanged by search depth / iteration count.

## Performance Requirements

### Required Engine-Side Rules

1. Reuse `input.runtime` if provided.
2. If `input.runtime` is absent, build runtime once per `chooseMove()`, not inside inner loops.
3. Search must use the lightest available kernel path:
   - no effect trace collection,
   - no unnecessary warning allocation,
   - no delta computation,
   - no repeated root legal enumeration.
4. Node storage is mutable and pooled; this is an intentional exception to general engine immutability.
5. Search allocations must scale roughly with `O(iterations)`, not unbounded across turns.

### Memory Management

Use a node pool sized to the active search budget, not a fixed million-node assumption.

~~~typescript
interface NodePool {
  readonly capacity: number;
  allocate(): MctsNode;
  reset(): void;
}
~~~

Suggested sizing rule:

~~~text
capacity = max(iterations + 1, rootLegalMoveCount * 4)
~~~

## Factory / Integration

### Agent Factory Update

~~~typescript
type AgentType = 'random' | 'greedy' | 'mcts';

function createAgent(type: AgentType, config?: Partial<MctsConfig>): Agent;
~~~

### Agent Spec Parsing

Support at minimum:

~~~text
mcts
mcts:1500
~~~

Where `mcts:N` sets iteration count. Richer config remains programmatic.

## Testing Strategy

### Unit Tests

- node creation, pooling, reward accumulation
- availability-aware selection
- visible-state preservation during belief sampling
- future-RNG replacement
- move-key canonicalization
- progressive widening
- lazy template completion
- epsilon-greedy rollout
- terminal mapping + centered-logistic transform
- solver restricted-activation checks
- config defaults / validation

### Integration Tests

- perfect-info fixture game to completion
- hidden-info card game fixture
- multiplayer fixture
- template-heavy game
- non-regression benchmark vs `RandomAgent`
- non-regression benchmark vs `GreedyAgent`
- determinism test in iteration mode
- runtime reuse test

### Mandatory Fairness / Property Tests

1. **Observation-equivalent states test**: if two raw states are identical from the acting player’s represented observation but differ in hidden contents, `chooseMove()` must return the same move under the same agent RNG.
2. **Future-RNG fairness test**: if two raw states are identical from the acting player’s represented observation but differ only in hidden future `GameState.rng`, `chooseMove()` must return the same move under the same agent RNG.
3. **Visible-state preservation test**: belief sampling never changes the projected observation.
4. **Input immutability test**: search never mutates the caller’s `GameState`.
5. **Legality test**: returned move is always legal at root.
6. **Availability accounting test**: unavailable actions are skipped, not penalized.

### Tactical Competence Regression Tests

Win-rate tests alone are too noisy.

Add tactical fixtures proving the agent:

- takes an immediate win in 1,
- blocks an immediate loss in 1,
- prefers a clear scoring move over a neutral move,
- handles a multi-step decision correctly,
- does not collapse under high branching factor.

These tests are closer to what users perceive as “competent”.

## Phased Delivery Plan

### Phase 1: Fair, Strong Core Search

Goal: shippable universal baseline agent for perfect-info, hidden-info, deterministic, and stochastic games.

Deliverables:

1. shared `observation.ts` in engine-side code
2. belief sampling that includes hidden zones **and future-RNG masking**
3. open-loop search core with availability-aware selection
4. progressive widening
5. lazy concrete template completion
6. centered-logistic leaf evaluation
7. default epsilon-greedy rollout policy
8. runtime reuse + RNG isolation
9. deterministic iteration-budget mode
10. tactical competence + fairness tests

Exit criteria:

- agent is fair on observation-equivalence tests,
- agent passes tactical competence fixtures,
- agent clearly outperforms `RandomAgent`,
- agent meaningfully outperforms `GreedyAgent` on reference fixtures,
- no cheating via hidden future RNG,
- no unbounded memory growth across repeated calls.

### Phase 2: Restricted Solver + Quality Polish

Deliverables:

1. restricted solver support for deterministic perfect-info 2-player win/loss/draw games
2. search presets (`fast`, `default`, `strong`)
3. optional rollout history tables / MAST-style bias
4. optional improvements to template-materialization helpers

### Phase 3: Advanced Search Enhancements

- tree reuse across moves
- root parallelism
- RAVE / GRAVE / progressive history
- transposition support where valid
- multi-observer / re-determinizing ISMCTS variants
- optional game-defined belief sampler hooks

## Acceptance Summary

This spec is successful when the resulting `MctsAgent` is:

- **fair**: does not use hidden state or hidden future RNG,
- **competent**: passes tactical fixtures and beats placeholder agents,
- **universal**: works across current reference games without per-game heuristics,
- **practical**: fast enough for interactive play and reproducible in iteration-budget mode,
- **honest**: does not claim exact information-set reasoning the engine cannot yet represent.