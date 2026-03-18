# MCTS Performance Analysis: FITL Game — Comprehensive Report

**Status**: COMPLETED
**Date**: 2026-03-17
**Purpose**: Provide an external LLM research agent with complete data to assess whether MCTS can be made viable for complex board games like Fire in the Lake (FITL), and what alternatives exist.

## Executive Summary

**MCTS on FITL is approximately 4,600× too slow for interactive play.**

A single MCTS decision with the "fast" preset (200 iterations) takes an estimated **46 minutes** on FITL. The target for interactive play is **~0.6 seconds** (600ms). Even with aggressive optimization, the fundamental cost structure suggests pure tree-search MCTS cannot reach interactive speeds on games of FITL's complexity.

The bottleneck is not algorithmic overhead — it's the **cost of a single game-state transition** (legalMoves + applyMove). Each transition costs ~3.2 seconds on FITL due to the game's inherent complexity: 50+ zones, 200+ tokens, cascading trigger chains, complex precondition evaluation, and a branching factor of 15+ legal moves per state.

---

## 1. System Architecture

### 1.1 The Engine

LudoForge-LLM is a game-agnostic board game engine. Games are defined as structured specifications (YAML + Markdown) that compile to `GameDef JSON`. A deterministic kernel executes games: `legalMoves()` → `applyMove()` → repeat. The kernel is pure, immutable (every state transition produces a new state object), and side-effect free.

**Key design constraints:**
- **Deterministic**: same seed + same actions = same result
- **Immutable**: `applyMove()` returns a new `GameState`, never mutates
- **Game-agnostic**: no game-specific logic in kernel code
- **Enumerable**: all legal moves are listable (no free-text or continuous action spaces)

### 1.2 MCTS Implementation

Standard UCT-based MCTS with extensions:

| Feature | Implementation |
|---------|---------------|
| Selection | ISUCT (Information Set UCT) with availability-aware scoring |
| Expansion | Progressive widening (K × visits^α) |
| Simulation | Three modes: legacy (deep), hybrid (shallow), direct (none) |
| Rollout policy | MAST (Move-Average Sampling Technique), epsilon-greedy, random |
| Decision handling | Runtime classification via `legalChoicesEvaluate()` + decision tree expansion |
| State caching | Hash-based cache for terminal results, legal moves, rewards |
| Early stopping | Hoeffding confidence bound + wall-clock time limit |
| Pool management | Pre-allocated node pool with capacity limits |

### 1.3 FITL (Fire in the Lake)

A 4-player asymmetric COIN-series counterinsurgency wargame:

| Property | Value |
|----------|-------|
| Players | 4 (US, ARVN, NVA, VC) |
| Map zones | ~50 (provinces, cities, LoCs, off-map areas) |
| Token types | ~15 (troops, guerrillas, bases, rangers, tunnels, etc.) |
| Tokens in play | ~200+ |
| Action types | ~20+ (rally, march, attack, sweep, train, patrol, etc.) |
| Branching factor | 15-30 legal moves per decision point |
| Decision depth | Many actions have 2-6 inline decisions (target spaces, pieces to move, etc.) |
| Trigger chains | Effects can cascade through triggers up to depth K=5 |
| State size | Large — zones with token arrays, markers, variables, eligibility tracking |

---

## 2. Measured Performance Data

### 2.1 Test Configuration

| Parameter | Value |
|-----------|-------|
| Preset | `fast` |
| Iterations | 10 (diagnostic run) |
| Rollout mode | `hybrid` |
| Hybrid cutoff depth | 4 plies |
| Rollout policy | `mast` |
| Progressive widening K | 2.0 |
| Progressive widening α | 0.5 |
| Decision widening cap | 8 |
| Exploration constant | 1.414 |
| Scenario | S1: Turn 1, VC faction, 15 legal moves |

### 2.2 Scenario S1 — Full Diagnostics (10 iterations)

**Top-level metrics:**

| Metric | Value |
|--------|-------|
| Total wall-clock time | 139,240 ms (2 min 19 sec) |
| Time per iteration | 13,924 ms (~14 sec) |
| Iterations completed | 10 |
| Nodes allocated | 7 (root + 6 children) |
| Max tree depth | 1 |
| Best action selected | `rally` (0 visits — search too shallow) |

**Phase timing breakdown:**

| Phase | Time (ms) | % of Total | Per Iteration |
|-------|-----------|------------|---------------|
| Selection | 8,325.9 | 6.0% | 832.6 ms |
| Expansion | 0.0 | 0.0% | 0.0 ms |
| **Simulation (rollout)** | **129,907.0** | **93.8%** | **12,990.7 ms** |
| Evaluation | 205.7 | 0.1% | 20.6 ms |
| Backpropagation | 0.4 | 0.0% | 0.04 ms |
| Belief sampling | 1.1 | 0.0% | 0.11 ms |
| **TOTAL** | **138,440.1** | **100%** | **13,844 ms** |

**Kernel call volumes:**

| Operation | Total Calls | Per Iteration | Est. Cost per Call | **Measured Avg (ms/call)** |
|-----------|-------------|---------------|-------------------|---------------------------|
| `legalMoves()` | 39 | 3.9 | ~200-500 ms | **38.9 ms** |
| `materialize` (classify) | 50 | 5.0 | ~100-300 ms | **1,048.8 ms** |
| `applyMove()` | 40 | 4.0 | ~500-2000 ms | **73.1 ms** |
| `terminalResult()` | 49 | 4.9 | ~50-200 ms | **1.0 ms** |
| `evaluateState()` | 10 | 1.0 | ~20 ms | **17.4 ms** |

> **CORRECTION (2026-03-17)**: The original "Est. Cost per Call" was inferred from phase timing divided by call counts. Per-kernel-call instrumentation reveals that **materialization (`legalChoicesEvaluate` per move) is the dominant per-call cost at ~1,049ms/call** — not `applyMove` as originally assumed. `applyMove` is relatively cheap at ~73ms/call. The original estimates were off by 10× in opposite directions.

**Per-kernel-call timing breakdown (S1×10):**

| Operation | Total Time (ms) | Calls | Avg ms/call | % of Measured |
|-----------|----------------|-------|-------------|---------------|
| `materialize` | 52,437.7 | 50 | 1,048.8 | **76.3%** |
| `applyMove` | 2,923.0 | 40 | 73.1 | 4.3% |
| `legalMoves` | 1,518.7 | 39 | 38.9 | 2.2% |
| `evaluate` | 173.6 | 10 | 17.4 | 0.3% |
| `terminal` | 48.5 | 49 | 1.0 | 0.1% |
| **Sum** | **57,101.5** | — | — | **83.1%** |

> Unaccounted time (~16.9%) includes overhead such as RNG operations, candidate sampling, move selection policy, array allocations, and other non-instrumented bookkeeping.

**Derived per-rollout-ply cost:**
- 40 hybrid rollout plies in 109,194 ms = **2,730 ms per rollout ply**
- Each ply: `legalMoves()` (~39ms) → `materializeMovesForRollout()` (~1,049ms × ~3 moves) → `pickMove()` → `applyMove()` (~73ms)
- **Materialization accounts for ~85% of per-ply cost**

**Cache performance:**

| Metric | Value |
|--------|-------|
| Cache lookups | 90 |
| Cache hits | 12 |
| Hit rate | 13.3% |
| Terminal cache hits | 11 |
| Legal moves cache hits | 1 |
| Reward cache hits | 0 |

**Decision node stats:**

| Metric | Value |
|--------|-------|
| Decision nodes created | 0 |
| Decision completions (tree) | 0 |
| Decision completions (rollout) | 0 |
| Illegal pruned | 0 |
| Boundary failures | 0 |

### 2.3 Move Composition at S1

```
Legal moves: 15
  pass:                1 (ready)
  event:               2 (ready)
  pivotalEvent:        1 (ready)
  vcTransferResources: 5 (ready)
  rally:               1 (pending — has inline decisions)
  march:               1 (pending)
  attack:              1 (pending)
  terror:              1 (pending)
  tax:                 1 (pending)
  ambushVc:            1 (pending)

Classification: 9 ready, 6 pending
```

### 2.4 Extrapolated Performance for Full "Fast" Preset

| Metric | 10 iters (measured) | 200 iters (extrapolated) |
|--------|--------------------|-----------------------|
| Total time | 139 sec | ~2,780 sec (~46 min) |
| Rollout time | 130 sec | ~2,600 sec |
| Selection time | 8.3 sec | ~166 sec (grows with tree depth) |

**For the "default" preset (1500 iterations):** ~6+ hours per decision.
**For the "strong" preset (5000 iterations):** ~19+ hours per decision.

---

## 3. Root Cause Analysis

### 3.1 The Fundamental Problem: Materialization Cost

> **REVISED (2026-03-17)**: Per-kernel-call instrumentation reveals the bottleneck hierarchy is fundamentally different from the original analysis. **Materialization (`legalChoicesEvaluate`) is the dominant cost — not `applyMove`.**

The MCTS algorithm's viability depends on **cheap state transitions**. In games like Go, Chess, or simple card games, `applyMove()` is O(1) — flip a bit, move a piece. In FITL, the per-kernel-call measurements reveal:

1. **`legalChoicesEvaluate()` (materialization) is the dominant cost** (**~1,049ms/call**, 76.3% of measured kernel time): Every legal move must be classified as `complete`, `pending`, or `illegal` via `legalChoicesEvaluate()`. This evaluates the action's choice tree against the current state — for FITL operations with `chooseN`/`chooseOne` decisions (target spaces, pieces to move), this involves scanning zones, checking preconditions, and evaluating choice options. With ~15 moves per state and ~5 materialization calls per iteration, this alone costs ~5,244ms per iteration.

2. **`applyMove()` is cheaper than expected** (**~73ms/call**, 4.3%): While effects are AST-interpreted, the per-call cost is moderate because most rollout moves are simple ready actions (pass, transfer, event) — not complex multi-effect operations. Trigger firings average only 2.5 per move (max 4 in S1, max 13 in S3).

3. **`legalMoves()` is moderate** (**~39ms/call**, 2.2%): Cheaper than estimated. Must evaluate preconditions for every action but benefits from early exit on eligibility checks.

4. **`terminalResult()` is negligible** (**~1ms/call**, 0.1%): Terminal detection is fast — just checks a few victory conditions.

5. **State size is ~42.5 KB** (measured via `JSON.stringify`): The FITL state serializes to ~42,548 bytes. This quantifies the immutable clone cost.

### 3.2 Why Caching Doesn't Help

Cache hit rate is 13.3% because:
- FITL states are highly diverse — each move creates a unique state hash
- 4 players mean 4× the branching per "round"
- Token positions, marker levels, and variable states create an enormous state space
- Even with the same zone layout, different token ordinals create different hashes

### 3.3 Why Rollout Dominates — Revised Understanding

With hybrid rollout depth=4:
- Each iteration does 4 rollout plies: `legalMoves → materialize → pick → applyMove`
- **Materialization is ~85% of per-ply cost**: ~1,049ms × ~3 classify calls vs ~73ms for applyMove
- 4 plies × ~2,730ms per ply = ~10.9s per iteration rollout
- 10 iterations × 10.9s = 109s (matches measured 109,194ms)

Even with `direct` rollout mode (0 plies), **selection still requires `classifyMovesForSearch` at every tree node** — which calls `legalChoicesEvaluate()` for each legal move. This is why selection costs ~695ms per iteration.

### 3.4 Per-Iteration Timing Variance

Extended diagnostics reveal **high iteration-time variance**:

| Metric | S1×10 | S3×10 |
|--------|-------|-------|
| p50 (median) | 11,432 ms | 12,365 ms |
| p95 | 19,118 ms | 16,841 ms |
| max | 19,118 ms | 16,841 ms |
| stddev | 4,050 ms | 2,977 ms |

The p95/p50 ratio of 1.67× (S1) indicates significant variance between iterations. Some iterations encounter more expensive game states (higher branching factor, more complex materialization).

### 3.5 Branching Factor by Depth

Extended diagnostics capture branching at each depth level:

**S1 (VC, Turn 1):**
| Depth | Avg Branching | Max | Samples |
|-------|--------------|-----|---------|
| 0 | 15.0 | 15 | 10 |
| 1 | 19.2 | 28 | 10 |
| 2 | 7.0 | 7 | 10 |
| 3 | 6.1 | 10 | 10 |

**S3 (NVA, Turn 2):**
| Depth | Avg Branching | Max | Samples |
|-------|--------------|-----|---------|
| 0 | 18.1 | 19 | 10 |
| 1 | 10.9 | 12 | 10 |
| 2 | 9.9 | **39** | 13 |
| 3 | 15.7 | **35** | 10 |

Notable: S3 has branching spikes up to 39 at depth 2 — certain NVA-era game states have extremely high move counts. These outlier states disproportionately slow rollouts.

### 3.6 Effect Chain Profiling

| Metric | S1 | S3 |
|--------|----|----|
| Total trigger firings | 100 | 111 |
| Max per move | 4 | 13 |
| Avg per move | 2.5 | 2.5 |

Trigger chains are modest on average (2.5 firings/move). The S3 max of 13 suggests occasional complex cascades (likely a march or rally touching multiple zones with triggers).

### 3.7 Materialization Breakdown

| Metric | S1 | S3 |
|--------|----|----|
| Template completion attempts | 428 | 606 |
| Template completion successes | 428 | 606 |
| Template completion failures | 0 | 0 |

100% success rate on template completions — the `completeTemplateMove()` random parameter filling works well for FITL. S3 has more attempts because NVA has more pending actions.

### 3.8 Comparison to Games Where MCTS Works Well

| Property | Go / Chess | FITL (measured) |
|----------|-----------|------|
| State transition cost | <0.001 ms | **~73 ms** (applyMove) |
| **Materialization cost** | **N/A** | **~1,049 ms** (legalChoicesEvaluate) |
| State size | ~400 bytes | **~42,548 bytes** |
| Branching factor | 30-250 | 15-39 (measured) |
| Effect complexity | Flip 1-2 cells | AST-interpreted, avg 2.5 triggers |
| State cloning | Bitboard copy | Deep object clone (~42 KB) |
| legalMoves enumeration | Bitboard ops | ~39 ms per call |
| Triggers/cascades | None | Up to 13 per move |
| Memory per search (10 iter) | <1 MB | ~170 MB heap |

**The gap is 5+ orders of magnitude in total per-ply cost.** MCTS performs millions of iterations per second on Go; on FITL it performs ~0.09 iterations per second. The dominant cost is **materialization** (move classification), not state transitions.

---

## 4. What the Diagnostics Reveal vs. Don't Reveal

### 4.1 What Is Captured (Sufficient for Macro Analysis)

- **Per-phase timing**: Clear breakdown of where time goes (selection/expansion/simulation/evaluation/backprop)
- **Kernel call volumes**: How many `legalMoves`, `applyMove`, `terminalResult`, `evaluateState` calls
- **Cache performance**: Hit rates, breakdown by cache type
- **Decision node metrics**: Creation count, max depth, completions, pruning
- **Tree structure**: Nodes allocated, max depth, root child visits
- **Compression metrics**: Forced move plies, hybrid rollout plies
- **Visitor events**: Per-batch progress, expansion events, decision events

### 4.2 What Is NOT Captured (Gaps for Deeper Analysis) — NOW CAPTURED

All 7 gaps identified in the original analysis have been implemented:

1. **Per-kernel-call timing** — NOW CAPTURED via `legalMovesTimeMs`, `applyMoveTimeMs`, `terminalTimeMs`, `materializeTimeMs`, `evaluateTimeMs`. Wraps `performance.now()` around each kernel call in search, rollout, and state-cache.

2. **State size metrics** — NOW CAPTURED via `stateSizeSamples` (sampled every 10th iteration). Derived: `avgStateSizeBytes`, `maxStateSizeBytes`, `stateSizeSampleCount`.

3. **Effect chain profiling** — NOW CAPTURED via `totalTriggerFirings`, `maxTriggerFiringsPerMove`. Reads `applied.triggerFirings.length` after every `applyMove()`. Derived: `avgTriggerFiringsPerMove`.

4. **Materialization breakdown** — NOW CAPTURED via `templateCompletionAttempts`, `templateCompletionSuccesses`, `templateCompletionFailures`. Instrumented inside `materializeMovesForRollout()`.

5. **Memory allocation pressure** — NOW CAPTURED via `heapUsedAtStartBytes`, `heapUsedAtEndBytes` (Node.js `process.memoryUsage()`). Derived: `heapGrowthBytes`. Guarded with `typeof process` check for browser safety.

6. **Branching factor per depth** — NOW CAPTURED via `branchingFactorSamples` (array of `{depth, count}`). Recorded in selection (non-root), rollout, and cutoff. Derived: `avgBranchingFactor`, `maxBranchingFactor`, `branchingFactorByDepth`.

7. **Per-iteration timing variance** — NOW CAPTURED via `iterationTimeSamples` (every iteration). Derived: `iterationTimeP50Ms`, `iterationTimeP95Ms`, `iterationTimeMaxMs`, `iterationTimeStddevMs`.

### 4.3 Proposed Additions — IMPLEMENTED

All proposed additions from the original report have been implemented. See Section 4.4 for the complete field reference.

### 4.4 Extended Diagnostic Fields Reference

**Per-kernel-call timing (ms, accumulated across all phases)**

| Field | Type | Description |
|-------|------|-------------|
| `legalMovesTimeMs` | `number` | Total time in `legalMoves()` calls |
| `applyMoveTimeMs` | `number` | Total time in `applyMove()` calls |
| `terminalTimeMs` | `number` | Total time in `terminalResult()` calls |
| `materializeTimeMs` | `number` | Total time in `legalChoicesEvaluate()` calls (classification) |
| `evaluateTimeMs` | `number` | Total time in `evaluateForAllPlayers()` calls |

**State size metrics (derived from sampled `JSON.stringify` length)**

| Field | Type | Description |
|-------|------|-------------|
| `avgStateSizeBytes` | `number` | Mean serialized state size across samples |
| `maxStateSizeBytes` | `number` | Peak serialized state size |
| `stateSizeSampleCount` | `number` | Number of samples taken (every 10th iteration) |

**Effect chain profiling**

| Field | Type | Description |
|-------|------|-------------|
| `totalTriggerFirings` | `number` | Sum of `triggerFirings.length` across all `applyMove()` calls |
| `maxTriggerFiringsPerMove` | `number` | Peak trigger count for a single `applyMove()` |
| `avgTriggerFiringsPerMove` | `number` | Mean trigger count per `applyMove()` call |

**Materialization breakdown**

| Field | Type | Description |
|-------|------|-------------|
| `templateCompletionAttempts` | `number` | Total `completeTemplateMove()` attempts in rollout |
| `templateCompletionSuccesses` | `number` | Successful template completions |
| `templateCompletionFailures` | `number` | Failed template completions (unsatisfiable/stochastic) |

**Memory pressure (Node.js only)**

| Field | Type | Description |
|-------|------|-------------|
| `heapUsedAtStartBytes` | `number` | `process.memoryUsage().heapUsed` at search start |
| `heapUsedAtEndBytes` | `number` | `process.memoryUsage().heapUsed` at search end |
| `heapGrowthBytes` | `number` | `heapUsedAtEndBytes - heapUsedAtStartBytes` |

**Branching factor per depth**

| Field | Type | Description |
|-------|------|-------------|
| `avgBranchingFactor` | `number` | Mean legal move count across all depth samples |
| `maxBranchingFactor` | `number` | Peak legal move count encountered |
| `branchingFactorByDepth` | `Record<number, {avg, max, count}>` | Per-depth statistics |

**Per-iteration timing**

| Field | Type | Description |
|-------|------|-------------|
| `iterationTimeP50Ms` | `number` | Median iteration wall-clock time |
| `iterationTimeP95Ms` | `number` | 95th percentile iteration time |
| `iterationTimeMaxMs` | `number` | Maximum iteration time |
| `iterationTimeStddevMs` | `number` | Standard deviation of iteration times |

---

## 5. Architectural Constraints

These constraints are non-negotiable and must be respected by any optimization strategy:

1. **Game-agnostic**: The engine cannot have FITL-specific optimizations. Any performance improvement must work for all games.

2. **Deterministic**: Same seed + same moves = same result. Any parallelization must preserve determinism.

3. **Immutable state**: The kernel's immutable architecture is fundamental. State mutation would require a complete kernel rewrite.

4. **Interpreted effects**: Game effects are AST-interpreted, not compiled to native code. This is by design — games are defined in YAML, not TypeScript.

5. **`legalMoves()` returns all legal moves**: No lazy enumeration — the full set must be materialized for MCTS to classify and select.

---

## 6. Potential Optimization Approaches

### 6.1 Within Current Architecture (Incremental)

| Approach | Expected Speedup | Effort | Risk |
|----------|-----------------|--------|------|
| **Direct rollout mode** (skip simulation entirely) | ~14× (eliminate 93.8% of time) | Low | Heuristic-only eval may be weak |
| **State clone optimization** (structural sharing) | ~2-5× on applyMove | High | Requires kernel refactoring |
| **legalMoves caching per state hash** | ~1.5-3× if hit rate improves | Medium | Memory-intensive |
| **Effect interpreter optimization** (JIT/precompilation) | ~2-10× on applyMove | Very High | Breaks game-agnostic constraint? |
| **Lazy legal move enumeration** | ~2× if early exit is common | Medium | API change |
| **Web Worker parallelism** (parallel rollouts) | ~2-4× on multi-core | Medium | Determinism challenges |
| **Reduce branching** (action pruning heuristic) | ~2× | Medium | May miss good moves |

**Direct rollout mode analysis:**
- Eliminates the 93.8% simulation cost
- Selection still costs ~832ms/iteration (8.3s for 10 iters)
- 200 iterations × 832ms = ~166 seconds (~2.8 min) — still too slow
- Even with 20 iterations: ~17 seconds — borderline

### 6.2 Alternative MCTS Variants

| Variant | Description | Viability |
|---------|-------------|-----------|
| **MCTS with neural network evaluation** | Replace rollouts with trained NN eval | High effort; requires training data |
| **Rapid Action Value Estimation (RAVE)** | Use all-moves-as-first heuristic | Moderate; reduces iteration needs |
| **Single-Player MCTS / Open-Loop** | Don't re-evaluate states, use move sequences | Faster but less accurate |
| **Flat Monte Carlo** | No tree; just sample moves and evaluate | Fastest; worst quality |
| **Beam search with heuristic** | No randomness; deterministic pruning | Fast but no exploration |

### 6.3 Beyond MCTS

| Approach | Description | Viability for Game-Agnostic Engine |
|----------|-------------|-----------------------------------|
| **Minimax + alpha-beta with heuristic** | Classical adversarial search | Poor for 4-player; good for 2-player |
| **Policy gradient RL** | Train a policy network | Requires per-game training |
| **LLM-based agent** | Use language model to select moves | Game-agnostic if given move descriptions |
| **Rule-based heuristic agent** | Hand-crafted per-game strategy | Breaks game-agnostic constraint |
| **Hybrid: LLM proposes + MCTS verifies** | LLM narrows to top-K moves, MCTS evaluates | Promising; reduces branching dramatically |
| **One-ply lookahead + heuristic** | Apply each legal move, evaluate, pick best | ~15 × 3.2s = 48s (still slow for FITL) |

### 6.4 The Core Tension

The game-agnostic engine is designed so that **games are data, not code**. This means:
- Effects are AST-interpreted (slow) rather than compiled (fast)
- Legal move enumeration is generic (slow) rather than game-specific (fast)
- State representation is flexible (expensive to clone) rather than compact (cheap to clone)

Any approach that makes MCTS viable must either:
1. **Dramatically reduce the number of kernel calls** (fewer iterations, fewer rollout plies, aggressive pruning)
2. **Dramatically reduce the cost per kernel call** (compile effects to native code, use structural sharing for state cloning)
3. **Replace kernel calls entirely** (neural evaluation, LLM-based move selection)

---

## 7. Concrete Recommendations

### 7.1 Immediate (Low Effort, Moderate Impact)

1. **Switch to `direct` rollout mode**: Eliminates 93.8% of time. Test whether heuristic-only evaluation produces reasonable move selection. Cost: 1 config change.

2. **Reduce iterations aggressively**: With direct mode, 20-50 iterations may suffice if the heuristic is reasonable. Cost: 1 config change.

3. **Add per-kernel-call timing to diagnostics**: Reveals whether `legalMoves()` or `applyMove()` is the dominant cost. Cost: ~2 hours of instrumentation.

### 7.2 Medium-Term (Moderate Effort, High Impact)

4. **Implement move pruning**: Before MCTS search, use a fast heuristic to eliminate obviously bad moves (e.g., `pass` when strong actions are available). Reduces branching factor from 15 to 5-8.

5. **Structural sharing for state cloning**: Use persistent data structures (immutable maps/arrays with structural sharing) to reduce clone cost from O(state size) to O(change size). This is the single highest-impact kernel optimization.

6. **Pre-compiled effect chains**: Cache the compiled effect AST for each action definition. Avoid re-interpreting the same AST every time an action is applied.

### 7.3 Long-Term (High Effort, Transformative Impact)

7. **Hybrid LLM + MCTS**: Use an LLM to propose the top 3-5 moves (based on game state description), then run a short MCTS search (10-20 iterations) only on those candidates. This reduces branching by ~5× and eliminates most rollout work.

8. **Trained neural evaluation function**: Train a game-specific neural network on self-play data to replace rollouts. AlphaZero-style approach. Requires significant ML infrastructure but would make MCTS viable.

9. **Compiled effect interpreter**: JIT-compile effect ASTs to native JavaScript functions at game definition load time. Would reduce `applyMove()` cost by 5-10× while maintaining game-agnosticism.

---

## 8. Raw Data

### 8.1 S1 Diagnostic Output (10 iterations) — Updated 2026-03-17

```
SCENARIO: S1: T1 VC — Burning Bonze
ITERATIONS: 10
LEGAL MOVES: 15
ELAPSED: 117114ms (11711.4ms/iteration)
BEST ACTION: rally (0 visits)

NODES ALLOCATED: 7
MAX TREE DEPTH: 1

PHASE TIMING (ms):
  selection:           6949.6    (6.0%)
  expansion:              0.0    (0.0%)
  simulation:        109193.8    (93.9%)
  evaluation:           173.8    (0.1%)
  backprop:               0.4    (0.0%)
  beliefSampling:         1.0    (0.0%)
  TOTAL:             116318.5

KERNEL CALLS:
  legalMoves:         39  (3.9/iter)
  materialize:        50  (5.0/iter)
  applyMove:          40  (4.0/iter)
  terminal:           49  (4.9/iter)
  evaluateState:      10  (1.0/iter)

PER-KERNEL-CALL TIMING (ms):
  legalMoves       total=    1518.7ms  calls=   39  avg=   38.94ms/call
  applyMove        total=    2923.0ms  calls=   40  avg=   73.08ms/call
  terminal         total=      48.5ms  calls=   49  avg=    0.99ms/call
  materialize      total=   52437.7ms  calls=   50  avg= 1048.75ms/call
  evaluate         total=     173.6ms  calls=   10  avg=   17.36ms/call

CACHE: lookups=90, hits=12, rate=13.3%
  terminal: 11, legalMoves: 1, rewards: 0

COMPRESSION: forcedPlies=0, hybridRolloutPlies=40
DECISION NODES: created=0, completionsTree=0, completionsRollout=0

STATE SIZE METRICS:
  samples: 1
  avgStateSizeBytes: 42548
  maxStateSizeBytes: 42548

EFFECT CHAIN PROFILING:
  totalTriggerFirings: 100
  maxTriggerFiringsPerMove: 4
  avgTriggerFiringsPerMove: 2.50

MATERIALIZATION BREAKDOWN:
  templateCompletionAttempts: 428
  templateCompletionSuccesses: 428
  templateCompletionFailures: 0

MEMORY PRESSURE:
  heapAtStart: 171.2 MB
  heapAtEnd: 138.1 MB
  heapGrowth: -33.1 MB

BRANCHING FACTOR:
  avg: 11.8
  max: 28
  byDepth:
    depth 0: avg=15.0, max=15, samples=10
    depth 1: avg=19.2, max=28, samples=10
    depth 2: avg=7.0, max=7, samples=10
    depth 3: avg=6.1, max=10, samples=10

PER-ITERATION TIMING (ms):
  p50: 11432.2
  p95: 19118.3
  max: 19118.3
  stddev: 4050.1

ROOT CHILD VISITS (6 children):
  D:rally                        0
  D:march                        0
  D:attack                       0
  D:terror                       0
  D:tax                          0
  D:ambushVc                     0
```

### 8.2 S1 Diagnostic Output (50 iterations)

```
SCENARIO: S1 — S1: T1 VC — Burning Bonze
ITERATIONS: 50
LEGAL MOVES: 15

ELAPSED: 511595ms (10231.9ms/iteration)
BEST ACTION: event (6 visits)
ITERATIONS COMPLETED: 50

NODES ALLOCATED: 43
MAX TREE DEPTH: 2

PHASE TIMING (ms):
  selection:       41096.0   (8.0%)
  expansion:       900.4     (0.2%)
  simulation:      468221.5  (91.6%)
  evaluation:      696.0     (0.1%)
  backprop:        1.0       (0.0%)
  beliefSampling:  3.4       (0.0%)
  TOTAL:           510918.3

KERNEL CALLS:
  legalMoves:      224  (4.5/iter)
  materialize:     341  (6.8/iter)
  applyMove:       299  (6.0/iter)
  terminal:        273  (5.5/iter)
  evaluateState:   49   (1.0/iter)

CACHE: lookups=677, hits=157, rate=23.2%
  terminal: 89, legalMoves: 67, rewards: 1

COMPRESSION: forcedPlies=62, hybridRolloutPlies=200
DECISION NODES: created=0, completionsTree=0, completionsRollout=0

ROOT CHILD VISITS (top 8 of 14):
  event (unshaded):        6
  vcTransferResources(4):  6
  pivotalEvent:            6
  vcTransferResources(3):  5
  event (shaded):          5
  vcTransferResources(2):  5
  vcTransferResources(5):  3
  pass:                    1
  D:rally:                 0  ← pending moves get 0 visits
  D:march:                 0
  D:attack:                0
  D:terror:                0
  D:tax:                   0
  D:ambushVc:              0
```

**Key observations from S1×50:**
- Cost drops to ~10.2s/iteration (vs 13.9s at 10 iters) — JIT warmup effect
- Cache hit rate improves to 23.2% (up from 13.3%) — more revisits at depth 2
- 62 forced move plies (free depth) vs 200 hybrid rollout plies
- **Pending moves (rally, march, attack, etc.) receive 0 visits** — search budget entirely consumed by ready moves
- Selection time grows disproportionately (6.0% → 8.0%) as tree deepens

### 8.3 S3 Diagnostic Output (10 iterations — NVA faction, Turn 2) — Updated 2026-03-17

```
SCENARIO: S3: T2 NVA — Trucks
ITERATIONS: 10
LEGAL MOVES: 19 (13 ready, 6 pending)
ELAPSED: 118209ms (11820.9ms/iteration)
BEST ACTION: nvaTransferResources (1 visit)

NODES ALLOCATED: 7
MAX TREE DEPTH: 1

PHASE TIMING (ms):
  selection:           2782.8    (2.4%)
  expansion:            708.6    (0.6%)
  simulation:        114440.3    (97.0%)
  evaluation:            18.9    (0.0%)
  backprop:               0.2    (0.0%)
  beliefSampling:         0.6    (0.0%)
  TOTAL:             117951.4

KERNEL CALLS:
  legalMoves:         41  (4.1/iter)
  materialize:        53  (5.3/iter)
  applyMove:          44  (4.4/iter)
  terminal:           51  (5.1/iter)
  evaluateState:      10  (1.0/iter)

PER-KERNEL-CALL TIMING (ms):
  legalMoves       total=    1438.2ms  calls=   41  avg=   35.08ms/call
  applyMove        total=    3606.2ms  calls=   44  avg=   81.96ms/call
  terminal         total=      31.1ms  calls=   51  avg=    0.61ms/call
  materialize      total=   49643.0ms  calls=   53  avg=  936.66ms/call
  evaluate         total=      18.8ms  calls=   10  avg=    1.88ms/call

CACHE: lookups=98, hits=14, rate=14.3%
  terminal: 12, legalMoves: 2, rewards: 0

COMPRESSION: forcedPlies=3, hybridRolloutPlies=40
DECISION NODES: created=0, completionsTree=0, completionsRollout=0

STATE SIZE METRICS:
  samples: 1
  avgStateSizeBytes: 42610
  maxStateSizeBytes: 42610

EFFECT CHAIN PROFILING:
  totalTriggerFirings: 111
  maxTriggerFiringsPerMove: 13
  avgTriggerFiringsPerMove: 2.52

MATERIALIZATION BREAKDOWN:
  templateCompletionAttempts: 606
  templateCompletionSuccesses: 606
  templateCompletionFailures: 0

MEMORY PRESSURE:
  heapAtStart: 191.3 MB
  heapAtEnd: 165.0 MB
  heapGrowth: -26.3 MB

BRANCHING FACTOR:
  avg: 13.4
  max: 39
  byDepth:
    depth 0: avg=18.1, max=19, samples=10
    depth 1: avg=10.9, max=12, samples=10
    depth 2: avg=9.9, max=39, samples=13
    depth 3: avg=15.7, max=35, samples=10

PER-ITERATION TIMING (ms):
  p50: 12364.7
  p95: 16841.2
  max: 16841.2
  stddev: 2977.4

ROOT CHILD VISITS (6 children):
  nvaTransferResources{amount:9} 1
  D:event                        0
  D:rally                        0
  D:march                        0
  D:terror                       0
  D:infiltrate                   0
```

**Key observations from S3×10:**
- 19 legal moves (11 are nvaTransferResources variants — high ready count)
- ~11.6s/iteration (slightly faster than S1 — fewer zones touched by NVA actions?)
- Simulation still dominates at 97.0%
- Only 1 visit to any child after 10 iterations — barely explores the tree
- Pending moves (event, rally, march, terror, infiltrate) get 0 visits

### 8.4 Cross-Scenario Comparison — Updated 2026-03-17

| Metric | S1×10 | S1×50 | S3×10 |
|--------|-------|-------|-------|
| Legal moves | 15 | 15 | 19 |
| Ready / Pending | 9 / 6 | 9 / 6 | 13 / 6 |
| ms/iteration | 11,711 | 10,232 | 11,821 |
| Simulation % | 93.9% | 91.6% | 97.0% |
| Cache hit rate | 13.3% | 23.2% | 14.3% |
| Nodes allocated | 7 | 43 | 7 |
| Max tree depth | 1 | 2 | 1 |
| Pending visit count | 0 | 0 | 0 |
| Best action visits | 0 | 6 | 1 |
| **materialize avg ms/call** | **1,049** | — | **937** |
| **applyMove avg ms/call** | **73** | — | **82** |
| **legalMoves avg ms/call** | **39** | — | **35** |
| **State size (bytes)** | **42,548** | — | **42,610** |
| **Trigger firings (avg/move)** | **2.5** | — | **2.5** |
| **Trigger firings (max)** | **4** | — | **13** |
| **Iteration p50/p95 (ms)** | **11,432/19,118** | — | **12,365/16,841** |
| **Branching max at any depth** | **28** | — | **39** |
| **Template completions** | **428/428/0** | — | **606/606/0** |

**Critical finding: Pending moves (the actual FITL operations — rally, march, attack, etc.) never receive visits.** The search budget is entirely consumed by ready moves (pass, event, vcTransferResources). This means MCTS never evaluates the core gameplay actions.

**New finding: Materialization is the true bottleneck.** At ~1,049ms/call (S1) and ~937ms/call (S3), `legalChoicesEvaluate()` accounts for 76% of measured kernel time. This was invisible in the original phase-level timing because materialization occurs inside both selection and simulation phases. The optimization priority should be: (1) reduce `legalChoicesEvaluate` cost, (2) cache materialization results, (3) reduce applyMove cost.

### 8.5 Visitor Event Stream (S1, 200 iterations, partial — killed after 512 seconds)

```
SEARCH START — iterations=200, moves=15 (ready=9, pending=6), pool=201
ROOT CANDIDATES — ready=[pass, event, event, pivotalEvent, vcTransferResources,
  vcTransferResources, vcTransferResources, vcTransferResources,
  vcTransferResources], pending=[rally, march, attack, terror, tax, ambushVc]
BATCH 0-50 — children=14, nodes=42, elapsed=512108ms
  top: event(6), vcTransferResources(6), pivotalEvent(6),
       vcTransferResources(5), event(5), vcTransferResources(5),
       vcTransferResources(3), pass(1)
```

### 8.3 MCTS "Fast" Preset Configuration

```typescript
{
  iterations: 200,
  maxSimulationDepth: 16,
  rolloutPolicy: 'mast',
  timeLimitMs: 2_000,        // 2 second wall-clock limit (disabled in tests)
  rolloutMode: 'hybrid',
  hybridCutoffDepth: 4,      // 4 rollout plies per iteration
  decisionWideningCap: 8,
  decisionDepthMultiplier: 2,
  explorationConstant: 1.414, // sqrt(2)
  progressiveWideningK: 2.0,
  progressiveWideningAlpha: 0.5,
  templateCompletionsPerVisit: 2,
  rolloutCandidateSample: 6,
  enableStateInfoCache: true,
  heuristicTemperature: 10_000,
}
```

---

## 9. Key Numbers for the Research Agent

| Metric | Value | Implication |
|--------|-------|-------------|
| **Dominant kernel cost** | **materialization: ~1,049 ms/call** | `legalChoicesEvaluate` — 76% of kernel time |
| `applyMove` cost | ~73-82 ms/call | Much cheaper than originally estimated |
| `legalMoves` cost | ~35-39 ms/call | Moderate |
| `terminalResult` cost | ~0.6-1.0 ms/call | Negligible |
| Cost per rollout ply | ~2,730 ms | Materialization dominates (~85%) |
| Cost per iteration (hybrid, depth=4) | 11,700-11,800 ms | Varies with game state |
| Cost per iteration (direct, depth=0) | ~700-800 ms (estimated) | Selection + eval only |
| Fast preset total (200 iter, hybrid) | ~39 min | Completely unworkable |
| Fast preset total (200 iter, direct) | ~2.5 min | Still too slow |
| Fast preset total (20 iter, direct) | ~15 sec | Borderline |
| Target for interactive play | ~600 ms | Browser-based game runner |
| Gap factor (hybrid) | ~3,900× | 39min / 0.6sec |
| Gap factor (direct, 20 iter) | ~25× | 15sec / 0.6sec |
| FITL branching factor | 15-39 moves (measured by depth) | Spikes to 39 at depth 2 |
| FITL state size | **42,548-42,610 bytes (measured)** | Via `JSON.stringify` |
| Trigger firings per move | avg 2.5, max 13 | Modest cascade depth |
| Template completion success rate | **100%** (428/428 S1, 606/606 S3) | Random completion works well |
| Iteration timing variance | p95/p50 = 1.67× (S1) | Significant per-iteration variance |
| Heap usage | ~138-191 MB | Negative growth = GC during search |
| Cache hit rate | 13-23% | Improves marginally with depth |
| Dominant cost component | materialization (76% of kernel time) | Not applyMove as originally assumed |
| Pending move visits | **0 out of 50 iterations** | MCTS never evaluates core gameplay actions |

---

## 10. Questions for the Research Agent

1. **Is there an MCTS variant or alternative tree search algorithm designed for games with expensive state transitions?** FITL's per-transition cost is 3+ seconds — most MCTS literature assumes sub-millisecond transitions.

2. **Can information reuse across iterations be improved?** The 13.3% cache hit rate suggests states are highly diverse. Are there techniques for approximate state matching or state abstraction that could improve reuse?

3. **Is a "propose-and-evaluate" architecture viable?** Instead of MCTS's explore-from-scratch approach, could we use a fast heuristic or LLM to propose top-K moves, then evaluate them with 1-ply lookahead?

4. **What's the minimum iteration count for meaningful MCTS results?** With 10 iterations and 15 legal moves, the search barely visits each child once. Is there a theoretical minimum below which MCTS degrades to random play?

5. **Are there game-agnostic evaluation functions that don't require rollouts?** FITL has a heuristic evaluation function, but it's expensive to compute (~20ms). Are there cheaper proxy evaluations (e.g., based on move type classification)?

6. **Could structural sharing (persistent data structures) realistically reduce state cloning to sub-millisecond?** The kernel currently deep-clones the entire GameState on every applyMove. If structural sharing reduced this to O(change-size), what speedup factor is realistic?

7. **Is there a way to parallelize MCTS iterations while preserving determinism?** Root parallelization (independent trees merged) vs leaf parallelization (parallel rollouts) — which is more viable for deterministic engines?

8. **Would compiling effect ASTs to JavaScript functions (JIT-style) be a game-agnostic optimization?** Effects are currently interpreted from AST nodes. A one-time compilation step at game load could eliminate interpreter overhead.

## Outcome

- Completion date: 2026-03-18
- What changed: This completed report was moved out of the active top-level reports directory during the MCTS retirement cleanup.
- Deviations from original plan: None to report content; only its location and active-surface visibility changed.
- Verification results: Active-doc references were updated as part of the retirement cleanup.
