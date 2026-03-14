# Spec 63: MCTS Performance — Codebase Context Report

This report provides the full technical context for Spec 63 ("MCTS Performance — Rollout-Free Search + Optimizations"). It is intended for an external LLM to reason about, critique, and suggest improvements to the proposal.

---

## 1. System Overview

LudoForge-LLM is an engine for evolving board games. LLMs produce game specifications in a Markdown+YAML DSL. These compile into `GameDef` JSON, which a deterministic kernel runs. The MCTS agent is one of several bot implementations that play compiled games.

**Key constraint**: The kernel is **deterministic** — same seed + same actions = same result. The MCTS agent preserves this via a forked RNG chain: the search RNG is forked once per iteration, and each iteration's RNG is consumed independently.

**Two test games exercise the engine**:
- **Fire in the Lake (FITL)** — a 4-faction COIN wargame with hidden information, complex zone/token mechanics, and compound moves.
- **Texas Hold'em** — a no-limit poker tournament (2-10 players) with hidden cards, betting, and player elimination. This is the game used in MCTS E2E tests.

---

## 2. MCTS Module Architecture

All MCTS code lives in `packages/engine/src/agents/mcts/`. The module is self-contained with 14 source files:

### 2.1 File Map and Responsibilities

| File | Lines | Purpose |
|------|-------|---------|
| `mcts-agent.ts` | 71 | `Agent` interface wrapper. Handles RNG isolation, single-move short-circuit, runtime building. Delegates to `runSearch` + `selectRootDecision`. |
| `search.ts` | 337 | **Core search loop** — `runOneIteration()` (selection → expansion → rollout → evaluation → backpropagation), `runSearch()` (iteration loop with belief sampling), `selectRootDecision()` (visit-count selection). **This is the primary file affected by Spec 63.** |
| `rollout.ts` | 192 | Rollout simulation policy. Two modes: `random` (uniform move selection) and `epsilonGreedy` (evaluates candidate successors, picks best with probability 1-epsilon). **Spec 63 proposes decoupling this — no deletion, just removing the import from search.ts.** |
| `evaluate.ts` | 71 | `terminalToRewards()` maps terminal results to [0,1] reward vectors. `evaluateForAllPlayers()` runs `evaluateState()` for each player, centers with mean, applies sigmoid with configurable temperature. **Pure function — no RNG consumption.** |
| `config.ts` | 183 | `MctsConfig` interface with defaults, validation, and presets (`fast`, `default`, `strong`). |
| `diagnostics.ts` | 77 | `MctsSearchDiagnostics` interface and `collectDiagnostics()` — post-search tree walk for statistics. **Spec 63 proposes extending this with per-phase timing fields.** |
| `node.ts` | 113 | `MctsNode` interface — open-loop MCTS nodes keyed by action history, not game state. Mutable fields for search performance. Includes `ProvenResult` for solver. |
| `node-pool.ts` | 96 | Pre-allocated node pool to avoid GC pressure. Fixed-capacity array with allocate/reset. |
| `isuct.ts` | 77 | Availability-aware ISUCT selection formula for hidden-information MCTS. Uses per-child availability counts instead of parent visit counts. |
| `expansion.ts` | 154 | Progressive widening (`maxChildren = K * visits^alpha`) and expansion priority (terminal wins first, then heuristic score, then PRNG tiebreak). |
| `materialization.ts` | 143 | Converts `legalMoves()` output (which may include template moves with unresolved parameters) into `ConcreteMoveCandidate`s via `completeTemplateMove()`. |
| `belief.ts` | 144 | Belief sampling for hidden-information games. Fisher-Yates shuffles hidden tokens within zones, replaces state RNG. |
| `solver.ts` | 292 | Restricted MCTS-Solver for deterministic, perfect-info, 2-player, win/loss/draw games. Minimax back-propagation of proven results. |
| `move-key.ts` | 74 | Canonical move serialization for deduplication. |
| `index.ts` | 36 | Barrel re-exports. |

### 2.2 Dependency Graph (within MCTS module)

```
mcts-agent.ts
  └─ search.ts
       ├─ isuct.ts (selectChild)
       ├─ expansion.ts (shouldExpand, selectExpansionCandidate, filterAvailableCandidates → materialization.ts)
       ├─ materialization.ts (materializeConcreteCandidates)
       ├─ rollout.ts (rollout) ← SPEC 63 REMOVES THIS DEPENDENCY
       ├─ evaluate.ts (terminalToRewards, evaluateForAllPlayers)
       ├─ belief.ts (sampleBeliefState)
       ├─ solver.ts (canActivateSolver, updateSolverResult, selectSolverAwareChild)
       └─ node.ts / node-pool.ts (types)
```

### 2.3 Kernel Dependencies (called during search)

The MCTS module calls these kernel functions during the hot search loop:

| Kernel Function | Location | Called During | Cost |
|----------------|----------|---------------|------|
| `legalMoves()` | `kernel/legal-moves.ts` | Selection (non-root nodes), rollout (each ply) | Moderate — evaluates action preconditions |
| `applyMove()` | `kernel/apply-move.ts` | Selection, expansion, rollout (each ply) | High — applies effects, dispatches triggers |
| `terminalResult()` | `kernel/terminal.ts` | Evaluation, rollout (each ply) | Moderate — evaluates end conditions, scoring |
| `evaluateState()` | `agents/evaluate-state.ts` | Evaluation, expansion priority, rollout (greedy) | Moderate — per-player variable scoring + optional scoring expression |
| `materializeConcreteCandidates()` | Within MCTS module | Selection, rollout | Variable — depends on template moves |
| `fork()` / `nextInt()` | `kernel/prng.ts` | Everywhere (RNG management) | Cheap |
| `derivePlayerObservation()` | `kernel/observation.ts` | Once per `chooseMove()` call | Cheap |

---

## 3. Current `runOneIteration()` — The Code Being Changed

Here is the exact current implementation (search.ts lines 60-219), annotated:

```typescript
export function runOneIteration(
  root: MctsNode,
  sampledState: GameState,
  rng: Rng,
  def: GameDef,
  config: MctsConfig,
  rootLegalMoves: readonly Move[],
  runtime: GameDefRuntime,
  pool: NodePool,
  solverActive: boolean = false,
): { readonly rng: Rng } {
  let currentNode = root;
  let currentState = sampledState;
  let currentRng = rng;

  // ── SELECTION ──────────────────────────────────────────────────────
  // Traverse tree following ISUCT. At each internal node:
  //   1. Get legal moves (reuse rootLegalMoves at root)
  //   2. Materialize concrete candidates (consumes RNG for template completion)
  //   3. Build availability set (increment availability counter)
  //   4. Check progressive widening → expand if allowed
  //   5. Otherwise, select via ISUCT or solver shortcut
  //
  // Breaks when: terminal, no legal moves, no available children, or expansion
  while (true) {
    const movesAtNode = currentNode === root
      ? rootLegalMoves
      : legalMoves(def, currentState, undefined, runtime);

    if (movesAtNode.length === 0) break;

    const { candidates, rng: postMaterialize } = materializeConcreteCandidates(
      def, currentState, movesAtNode, currentRng,
      config.templateCompletionsPerVisit, runtime,
    );
    currentRng = postMaterialize;
    if (candidates.length === 0) break;

    // ... availability tracking, expansion, ISUCT selection ...
    // Each selected child: applyMove to advance state
  }

  // ── SIMULATION (ROLLOUT) ────────────────────── SPEC 63 TARGET ────
  const rolloutResult = rollout(def, currentState, currentRng, config, runtime);
  currentRng = rolloutResult.rng;
  // rollout() runs up to maxSimulationDepth plies:
  //   Per ply: terminalResult + legalMoves + materializeConcreteCandidates
  //            + (epsilon-greedy: N * applyMove + evaluateState)
  //            + applyMove for chosen move

  // ── EVALUATION ────────────────────────────────────────────────────
  let rewards: readonly number[];
  if (rolloutResult.terminal !== null) {
    rewards = terminalToRewards(rolloutResult.terminal, sampledState.playerCount);
  } else {
    const endTerminal = terminalResult(def, rolloutResult.state, runtime);
    if (endTerminal !== null) {
      rewards = terminalToRewards(endTerminal, sampledState.playerCount);
    } else {
      rewards = evaluateForAllPlayers(def, rolloutResult.state,
        config.heuristicTemperature, runtime);
    }
  }

  // ── BACKPROPAGATION ───────────────────────────────────────────────
  backpropagate(currentNode, rewards);

  // ── SOLVER ────────────────────────────────────────────────────────
  if (solverActive) { /* minimax proven-result propagation */ }

  return { rng: currentRng };
}
```

### Key observations for the reviewer:

1. **The rollout dominates cost**: For `epsilonGreedy` policy (default and strong presets), each rollout ply calls `applyMove` up to `rolloutCandidateSample` (default 6) times plus 1 for the chosen move, plus `evaluateState` for each candidate. Over 48-64 plies, this is 300-500+ kernel calls per iteration.

2. **The leaf evaluation is already implemented**: `evaluateForAllPlayers()` and `terminalToRewards()` exist and are used as fallbacks when rollout doesn't reach a terminal. The spec proposes using them directly at the leaf instead of first running a rollout.

3. **RNG consumption changes**: The rollout consumes RNG state (for epsilon-greedy randomness, candidate sampling). Removing it means the per-iteration RNG consumption pattern changes. The fork chain remains deterministic, but traces will differ.

---

## 4. Current `runSearch()` — The Loop Being Enhanced

```typescript
export function runSearch(
  root, def, state, observation, observer, config,
  searchRng, rootLegalMoves, runtime, pool,
): { readonly rng: Rng; readonly iterations: number } {
  let currentRng = searchRng;
  let iterations = 0;
  const solverActive = canActivateSolver(def, state, config);
  const deadline = config.timeLimitMs !== undefined
    ? Date.now() + config.timeLimitMs : undefined;

  while (iterations < config.iterations) {
    // Solver proven-root early exit
    if (solverActive && root.provenResult !== null) break;

    // Wall-clock early exit (after minIterations)
    if (deadline !== undefined && iterations >= config.minIterations
        && Date.now() >= deadline) break;

    // Fork iteration-local RNG
    const [iterationRng, nextSearchRng] = fork(currentRng);
    currentRng = nextSearchRng;

    // Belief sampling
    const belief = sampleBeliefState(def, state, observation, observer, iterationRng);

    // Run one iteration
    runOneIteration(root, belief.state, belief.rng, def, config,
      rootLegalMoves, runtime, pool, solverActive);

    iterations += 1;
  }

  return { rng: currentRng, iterations };
}
```

**Spec 63 proposes adding early termination here**: after `minIterations` and 50% budget consumed, if the best root child has >2x the visits of the runner-up, break.

---

## 5. The `evaluateState()` Heuristic — Quality Concern

This is the function that replaces rollout-derived value estimates. Its quality directly affects the rollout-free approach:

```typescript
// agents/evaluate-state.ts
export const evaluateState = (def, state, playerId, runtime?): number => {
  // 1. Check terminal → return ±1,000,000,000
  const terminalScore = scoreTerminalResult(def, state, playerId);
  if (terminalScore !== null) return terminalScore;

  // 2. Scoring expression (if defined) × 100
  let score = evalScoringValue(def, state, playerId, runtime);

  // 3. Per-player variable sum:
  //    Own vars: +10,000 × (value - min) / range
  //    Opponent vars: -2,500 × (value - min) / range
  for (const variable of def.perPlayerVars) {
    if (variable.type !== 'int') continue;
    const range = Math.max(1, variable.max - variable.min);
    score += Math.trunc((ownValue * 10_000) / range);
    score -= Math.trunc((opponentValue * 2_500) / range);
  }

  return score;
};
```

**Critical context for the reviewer**:
- This is a **generic, game-agnostic heuristic**. It doesn't understand poker hands, bluffing, position, etc.
- For Texas Hold'em (the E2E test game), per-player variables are chip counts. The heuristic effectively evaluates "who has more chips" with a 4:1 own-vs-opponent weighting.
- For FITL, per-player variables include support, opposition, resources, etc. The heuristic treats all variables equally.
- There is no game-specific evaluation function mechanism — the engine is agnostic.
- The `evaluateForAllPlayers()` wrapper centers scores (subtracts mean) and applies a sigmoid with `heuristicTemperature` (default 10,000). This maps raw scores to (0, 1) rewards.

**Quality implications**: The rollout provides value estimates by actually simulating play forward (with random or epsilon-greedy policy). Even bad rollout play can discover terminals and provide calibrated value signals. The heuristic provides only a static snapshot. The spec argues that the 4-50x iteration count increase compensates for lower per-iteration quality, citing modern MCTS literature.

---

## 6. Profile Configurations

Three named presets define search strength:

| Parameter | Fast | Default | Strong |
|-----------|------|---------|--------|
| `iterations` | 200 | 1,500 | 5,000 |
| `minIterations` | 128 | 128 | 128 |
| `timeLimitMs` | 2,000 | 10,000 | 30,000 |
| `maxSimulationDepth` | 16 | 48 | 64 |
| `rolloutPolicy` | `random` | `epsilonGreedy` | `epsilonGreedy` |
| `rolloutEpsilon` | 0.15 | 0.15 | 0.15 |
| `rolloutCandidateSample` | 6 | 6 | 6 |
| `templateCompletionsPerVisit` | 2 | 2 | 4 |
| `explorationConstant` | 1.4 | 1.4 | 1.4 |
| `progressiveWideningK` | 2.0 | 2.0 | 2.0 |
| `progressiveWideningAlpha` | 0.5 | 0.5 | 0.5 |
| `heuristicTemperature` | 10,000 | 10,000 | 10,000 |

**Note**: After removing rollouts, the rollout-specific parameters (`rolloutPolicy`, `rolloutEpsilon`, `rolloutCandidateSample`, `maxSimulationDepth`) become inert for the search loop but remain in the config (not deleted by this spec). The `rollout.ts` module is also retained.

---

## 7. Belief Sampling and Hidden Information

The MCTS implementation uses **information-set MCTS (ISMCTS)** for hidden-information games:

1. Each iteration begins with `sampleBeliefState()` — a plausible game state consistent with the observing player's partial observation.
2. Hidden tokens are Fisher-Yates shuffled within their zones (positions preserved for visible tokens).
3. The state's RNG is replaced with a freshly forked stream to prevent exploiting latent chance.
4. The resulting state has `stateHash = 0n` (a sentinel indicating belief-sampled, not canonical).

**Relevance to Spec 63**:
- The evaluation cache proposes skipping cache for `stateHash === 0n` states. This is correct since belief-sampled states are synthetic and their hashes are not meaningful.
- Different belief samples of the same "true" position will produce different leaf evaluations, which is the intended ISMCTS behavior.

---

## 8. The ISUCT Selection Formula

The selection formula uses **availability-aware UCB** (ISUCT), not standard UCT:

```
score = meanReward[exploringPlayer] + C * sqrt(ln(availability) / visits)
```

Where `availability` counts how many times the child's move was legal in sampled worlds (not how many times the parent was visited). This is the correct formulation for information-set MCTS.

**Relevance to Spec 63**: The spec does not modify the selection formula. However, reviewers should consider whether removing rollouts changes the reward distribution in ways that might require adjusting the exploration constant `C = 1.4`. With rollout-based rewards in [0,1], the existing C is calibrated. The `evaluateForAllPlayers()` function also outputs (0,1) via sigmoid, so the scale should be preserved.

---

## 9. The Solver Subsystem

The solver provides exact endgame play for a restricted class of games (deterministic, perfect-info, 2-player, win/loss/draw only). It propagates proven results via minimax back-propagation.

**Relevance to Spec 63**: The solver code runs during backpropagation and is independent of how leaf values are computed. The spec's changes should not affect solver correctness — the solver uses `terminalResult()` directly, not rollout or heuristic values.

---

## 10. E2E Test Structure

MCTS E2E tests compile the Texas Hold'em production spec and run full game simulations:

- **Fast lane** (`texas-holdem-mcts-fast.test.ts`): 200 iterations, random rollout, 2-player games. Tests: completion, determinism, wall-clock budget (< 90s). Extended tests (gated by `RUN_MCTS_E2E=1`): 3-player, 6-player, mixed agent tournaments.
- **Default lane** (`texas-holdem-mcts-default.test.ts`): 1,500 iterations, epsilon-greedy, time-budgeted (1s/move for testing).
- **Strong lane** (`texas-holdem-mcts-strong.test.ts`): 5,000 iterations, epsilon-greedy, deeper search.
- **Campaign bench** (`texas-holdem-mcts-campaign-bench.test.ts`): Performance benchmarking.

**CI**: Each lane has its own GitHub Actions workflow with `timeout-minutes: 15`. The MCTS E2E tests have **never passed CI** — they consistently exceed the 15-minute budget.

**Determinism tests assert**: same seed → same move sequence → same final state hash. These golden values will need updating after Spec 63 changes the algorithm.

---

## 11. Questions and Concerns for Deep Research

### 11.1 Heuristic Quality vs Rollout Quality

The generic `evaluateState()` is a linear combination of per-player variables. For Texas Hold'em, this reduces to "who has more chips." It knows nothing about:
- Hand strength or pot odds
- Betting position
- Tournament stage dynamics (ICM)
- Bluff equity

Does the MCTS literature support that even a very weak heuristic (essentially a material count) outperforms random rollouts when iteration count is sufficiently high? What is the crossover point?

### 11.2 Exploration Constant Recalibration

With rollouts, reward values are naturally calibrated by the rollout policy. With direct heuristic evaluation:
- Does the sigmoid centering in `evaluateForAllPlayers()` preserve the reward scale?
- Should `explorationConstant` (currently 1.4) be adjusted for heuristic-only evaluation?
- Is the `heuristicTemperature` (currently 10,000) appropriate for direct leaf evaluation vs post-rollout evaluation?

### 11.3 Early Termination Threshold

The spec proposes a 2x visit ratio threshold. Is this conservative enough? Too conservative? What does the literature say about:
- Optimal visit ratio thresholds for early termination
- Whether the threshold should vary with iteration budget
- Whether the threshold should consider reward margins, not just visit counts

### 11.4 Evaluation Cache Hit Rate

The cache is keyed by `stateHash` (bigint, Zobrist hash). For belief-sampled states (`stateHash === 0n`), caching is skipped. Questions:
- In practice, how often do transpositions occur in MCTS tree search? Is the cache overhead (Map lookups, memory) worth the potential savings?
- Should the cache have a size limit to prevent memory pressure in high-iteration profiles?
- Could a cheaper cache key (e.g., truncated hash) reduce lookup cost?

### 11.5 Progressive Widening Interaction

With rollouts removed, each iteration is much cheaper. This means more iterations complete within the same wall-clock budget, which means progressive widening allows more children sooner (since `maxChildren = K * visits^alpha`). Questions:
- Does the tree become too wide too fast without rollouts?
- Should `progressiveWideningK` or `progressiveWideningAlpha` be adjusted?
- Does wider-earlier expansion compensate for loss of rollout exploration?

### 11.6 Solver Interaction

The solver uses `terminalResult()` directly and does not depend on rollout values. But:
- Does the faster iteration rate help the solver prove more nodes?
- Are there edge cases where rollout-free evaluation + solver + ISUCT interact unexpectedly?

### 11.7 Alternative Approaches Not Considered

The spec deliberately excludes:
- **Neural network evaluation** (AlphaZero-style)
- **Parallelized MCTS** (multi-threaded search)
- **Transposition tables** (beyond the evaluation cache)
- **UCB1-Tuned** or other selection formula variants

Are there lightweight alternatives that could complement rollout-free search? For example:
- **Rapid action value estimation (RAVE)** / AMAF
- **First-play urgency** (FPU) adjustment for unexplored children
- **Last good reply** or other knowledge-based enhancements
- **Virtual loss** for future parallelization
- **Iterative deepening** for the heuristic evaluation

### 11.8 Profiling Granularity

The spec proposes `performance.now()` bracketing. Questions:
- Is `performance.now()` resolution sufficient for sub-millisecond phases?
- Should profiling include kernel call counts (not just wall-clock time)?
- Is there a risk that profiling overhead distorts the measurements?

---

## 12. Appendix: Full Source Code of Affected Files

For complete reference, the external LLM can find the following files in the codebase:

- `packages/engine/src/agents/mcts/search.ts` — 337 lines, primary target
- `packages/engine/src/agents/mcts/rollout.ts` — 192 lines, decoupled
- `packages/engine/src/agents/mcts/evaluate.ts` — 71 lines, leaf evaluation
- `packages/engine/src/agents/mcts/diagnostics.ts` — 77 lines, extended
- `packages/engine/src/agents/mcts/config.ts` — 183 lines, config/presets
- `packages/engine/src/agents/evaluate-state.ts` — 95 lines, heuristic
- `packages/engine/src/agents/mcts/node.ts` — 113 lines, node structure
- `packages/engine/src/agents/mcts/isuct.ts` — 77 lines, selection formula
- `packages/engine/src/agents/mcts/belief.ts` — 144 lines, belief sampling
- `packages/engine/src/agents/mcts/expansion.ts` — 154 lines, progressive widening
- `packages/engine/src/agents/mcts/materialization.ts` — 143 lines, template completion
- `packages/engine/src/agents/mcts/solver.ts` — 292 lines, endgame solver
- `packages/engine/src/agents/mcts/node-pool.ts` — 96 lines, memory pool
- `packages/engine/src/kernel/terminal.ts` — 238 lines, terminal detection

All source code for these files is included in this report by reference. The spec and this report together contain sufficient context for a full algorithmic review.
