# MCTS Performance Optimization — Technical Context for External Research

**Date**: 2026-03-17
**Purpose**: Provide an external LLM researcher with complete technical context to identify issues, improvements, and beneficial features for the MCTS performance optimization effort (Spec 64).

---

## 1. Executive Summary

### The Problem

MCTS on Fire in the Lake (FITL) — a complex 4-player asymmetric wargame — is approximately **4,600x too slow** for interactive play. A single decision with the "fast" preset (200 iterations, hybrid rollout) takes ~46 minutes. The target for a browser-based game runner is 10-30 seconds (background worker) or ~600ms (interactive).

### The Root Cause

**Move classification (`legalChoicesEvaluate`) is the dominant bottleneck**, consuming **76% of kernel time** at ~1,049 ms per call. This function evaluates whether each legal move's inline decision tree can be satisfied against the current game state. It is called for every legal move (15-39 moves) at every tree node during both selection and rollout phases.

This was initially misdiagnosed as an `applyMove` bottleneck. Per-kernel-call instrumentation revealed that `applyMove` is actually relatively cheap at ~73 ms/call (4.3% of kernel time).

### What's Been Done (Phase 1 of Spec 64)

1. **Classification caching** in the state-info cache — root state classified once, reused across iterations
2. **All presets switched to `rolloutMode: 'direct'`** — eliminates rollout-phase materialization entirely (was 93.8% of total time)
3. **`background` preset added** with tuned parameters for complex games
4. **Classification cache hit diagnostics** added
5. All 4,799 unit tests pass on the branch

### What's Planned (Phases 2-4)

- **Phase 2**: Remove dead rollout modes (`legacy`/`hybrid`) and consolidate presets
- **Phase 3**: Lazy/deferred materialization — avoid `legalChoicesEvaluate` during selection through already-expanded nodes; incremental classification at expansion only
- **Phase 4**: Root parallelization (optional)

### What the Researcher Should Focus On

1. Are there better algorithmic approaches than Phases 2-4 for this class of problem?
2. Are there MCTS variants or alternative tree search algorithms designed for expensive state transitions?
3. What other optimizations, features, or architectural changes would make MCTS viable for complex games?
4. Are there issues or risks in the current plan that we haven't identified?

---

## 2. System Architecture

### 2.1 Game-Agnostic Engine Design

LudoForge-LLM is a game-agnostic board game engine. Games are defined as structured specifications (YAML + Markdown) that compile to `GameDef JSON`. A deterministic kernel executes games.

**Non-negotiable constraints:**

| Constraint | Description | Implication |
|-----------|-------------|-------------|
| **Game-agnostic** | No game-specific logic in kernel code | Cannot add FITL-specific optimizations |
| **Deterministic** | Same seed + same actions = same result | Parallelization must preserve determinism |
| **Immutable state** | `applyMove()` returns new `GameState`, never mutates | Deep clone on every move (~42 KB state) |
| **Interpreted effects** | Game effects are AST-interpreted, not compiled | Slower than native code; by design for YAML-defined games |
| **Full enumeration** | `legalMoves()` returns all legal moves | No lazy enumeration — full set materialized |
| **Enumerable actions** | All legal moves must be listable | No free-text or continuous action spaces |

### 2.2 Key Data Flow

```
Game Spec (YAML) → compile → GameDef JSON
GameDef → initialState(def, seed) → kernel loop:
  legalMoves(def, state) → [Move, Move, ...] (15-39 moves for FITL)
  applyMove(def, state, move) → { state: GameState, triggerFirings: [...] }
  terminalResult(def, state) → null | TerminalResult
```

### 2.3 Kernel Cost Profile (Measured on FITL)

| Operation | Avg ms/call | % of kernel time | What it does |
|-----------|------------|------------------|--------------|
| `legalChoicesEvaluate` | **1,049** | **76.3%** | Classify one move as complete/pending/illegal by evaluating its decision tree |
| `applyMove` | 73 | 4.3% | Apply move effects (AST-interpreted), fire triggers, return new state |
| `legalMoves` | 39 | 2.2% | Enumerate all legal moves (check preconditions for each action) |
| `evaluateState` | 17 | 0.3% | Heuristic evaluation (per-player variable scoring) |
| `terminalResult` | 1 | 0.1% | Check victory conditions |

### 2.4 FITL Game Characteristics

| Property | Value |
|----------|-------|
| Players | 4 (US, ARVN, NVA, VC) — asymmetric |
| Map zones | ~50 (provinces, cities, lines-of-communication, off-map) |
| Token types | ~15 (troops, guerrillas, bases, rangers, tunnels, etc.) |
| Tokens in play | ~200+ |
| Action types | ~20+ (rally, march, attack, sweep, train, patrol, etc.) |
| Branching factor | 15-39 legal moves per decision point (measured by depth) |
| Decision depth | Many actions have 2-6 inline decisions (target spaces, pieces to move) |
| Trigger chains | Effects cascade through triggers, avg 2.5 per move, max 13 |
| State size | ~42,548 bytes (serialized via JSON.stringify) |
| State transitions | Immutable — full deep clone per `applyMove` |

---

## 3. MCTS Implementation

### 3.1 Overview

Standard UCT-based MCTS with these extensions:

- **ISUCT** (Information Set UCT): Availability-aware child selection for hidden-information games
- **Progressive widening**: `maxChildren = K × visits^α` (default K=2.0, α=0.5)
- **Decision nodes**: First-class tree nodes for incremental move building (mid-decision states)
- **Three rollout modes**: `legacy` (deep simulation), `hybrid` (shallow cutoff), `direct` (no simulation, heuristic evaluation only)
- **MAST** (Move Average Score Table): Empirical move statistics for rollout policy
- **Forced-sequence compression**: Skip allocation when exactly one legal move exists
- **Hoeffding-bound early stopping**: Confidence-based root stopping when best move is statistically separated
- **Solver integration**: Perfect-info 2-player deterministic solver (restricted mode)
- **Belief sampling**: Per-iteration state sampling for hidden-information games
- **Node pooling**: Pre-allocated node pool to reduce GC pressure

### 3.2 Core Search Pipeline

**`runSearch(root, def, state, observation, config, rng, rootLegalMoves, runtime, pool)`**

Main loop (up to `config.iterations`):
1. Check solver termination (root proven)
2. Check wall-clock deadline (`timeLimitMs`)
3. Check confidence-based stopping (Hoeffding bound)
4. Sample belief state (hidden info)
5. Run one iteration

**`runOneIteration()` pipeline:**

| Phase | Operation | Cost on FITL |
|-------|-----------|-------------|
| **Selection** | Walk tree via UCT, handle decision nodes, compress forced sequences | ~833 ms/iter (with classification) |
| **Expansion** | Progressive widening check, classify candidate, create child | Varies |
| **Simulation** | Rollout from expansion state (direct = skip, hybrid = N plies) | 0 ms (direct) to ~13,000 ms (hybrid) |
| **Evaluation** | Terminal → rewards, else → heuristic evaluation | ~17 ms |
| **Backpropagation** | Walk parent chain, increment visits, accumulate rewards | <1 ms |
| **MAST update** | Update move statistics if MAST policy enabled | <1 ms |

### 3.3 Selection Details

At each tree node during selection:

1. Get `legalMoves(def, state)` — cached by state hash
2. **Classify ALL moves** via `classifyMovesForSearch()` — calls `legalChoicesEvaluate()` for EACH move
3. Separate into `ready` (can apply directly) and `pending` (need decision tree expansion)
4. Build candidate key set, match against existing children for availability
5. If `shouldExpand()`: pick best unexpanded candidate, create child
6. If children exist: select via ISUCT (availability-aware UCT)

**The critical waste**: Step 2 calls `legalChoicesEvaluate()` for ALL 15-39 moves at EVERY tree node visit, even when progressive widening means only 1-2 children will be expanded. This is the primary optimization target.

### 3.4 Move Classification (`legalChoicesEvaluate`)

This is the bottleneck function. For each move, it:

1. Resolves the action definition from the GameDef
2. Builds runtime bindings for the move's parameters
3. Evaluates the action's **decision sequence** (the chain of `chooseN`/`chooseOne` decisions the player must make)
4. For each decision step:
   - Resolves the choice target kind (zones, tokens, players, etc.)
   - Enumerates legal options by evaluating condition ASTs against the game state
   - Checks minimum/maximum constraints
   - For pipeline-backed actions: evaluates pipeline predicates and cost validation
5. Returns `'complete'` (all decisions resolvable), `'pending'` (needs interactive choices), `'illegal'` (unsatisfiable), or `'pendingStochastic'` (involves randomness)

For FITL operations like `rally`, `march`, `attack`:
- The decision tree has 2-6 steps (pick target province, pick pieces, pick destination, etc.)
- Each step scans 50+ zones and 200+ tokens to enumerate legal options
- Precondition evaluation involves AST interpretation over the full game state
- **This is why a single call costs ~1,049 ms**

### 3.5 Decision Node Architecture

Decision nodes represent partially-built moves in the search tree:

```
State Node (root) ── child ──> State Node (after "pass")
                  ── child ──> Decision Root (for "rally")
                                  ── child ──> Decision Node (province=Saigon)
                                  ── child ──> Decision Node (province=Hue)
                                                 ── child ──> State Node (rally complete)
```

- Each unique `actionId` with pending decisions gets one decision root node
- Decision nodes share the parent state node's game state (no `applyMove` until move is complete)
- `expandDecisionNode()` discovers legal choices via `legalChoicesDiscover()`
- Decision widening cap: bypass progressive widening when fewer than `decisionWideningCap` options

**Current problem**: Pending moves (rally, march, attack — the core FITL operations) receive **0 visits** even after 50 iterations. The search budget is entirely consumed by materialization overhead on ready moves.

### 3.6 Progressive Widening

```
maxChildren(visits, K, alpha) = max(1, floor(K × visits^alpha))
```

Default: K=2.0, α=0.5 → `max(1, floor(2 × √visits))`

Expansion candidate priority:
1. Immediate terminal win (highest)
2. Highest one-step heuristic evaluation
3. PRNG tiebreak

### 3.7 ISUCT (Information-Set UCT)

Score per child:
```
mean_reward + C × sqrt(ln(parent.availability) / child.availability)
```

Uses `child.availability` (times legal in sampled worlds) instead of `child.visits` for the exploration denominator. This handles hidden-information games where not all children are legal in every sampled world.

### 3.8 State-Info Cache

Per-search L1 cache keyed by `stateHash` (bigint, Zobrist):

| Cached result | Benefit |
|--------------|---------|
| `terminalResult()` | Avoid re-checking victory conditions |
| `legalMoves()` | Avoid re-enumerating moves |
| `evaluateForAllPlayers()` | Avoid re-evaluating heuristic |
| `moveClassification` | **NEW (Phase 1)** — avoid re-classifying moves |

**Cache performance on FITL**: 13-23% hit rate. FITL states are highly diverse — each move creates a unique state hash. 4 players × high branching = enormous state space.

Entries with `stateHash === 0n` (hidden-info games) are never cached.

### 3.9 Rollout Modes

| Mode | Description | Cost on FITL |
|------|-------------|-------------|
| `legacy` | Full simulation to `maxSimulationDepth` plies | Unusable (~13s/iter) |
| `hybrid` | Simulate to `hybridCutoffDepth` plies, then evaluate | Unusable (~13s/iter for depth=4) |
| `direct` | No simulation — evaluate expansion state immediately | ~700-800 ms/iter (estimated) |

All presets have been switched to `direct` mode in Phase 1. The `legacy` and `hybrid` code paths are slated for removal in Phase 2.

### 3.10 Heuristic Evaluation Function

The `evaluateState` function (used in direct mode) works as follows:

```
For each player:
  1. Check terminal result → ±1,000,000,000
  2. If game has scoring expression → evaluate via AST, multiply by 100
  3. For each perPlayerVar (type=int):
     - Own variable: +10,000 × (value - min) / range
     - Each opponent: -2,500 × (value - min) / range
  4. Return raw score
```

The MCTS evaluation wrapper:
```
For each player: raw_score = evaluateState(def, state, player)
mean = average of all raw scores
Per player: sigmoid((raw - mean) / temperature)
→ returns [0,1] reward vector
```

Temperature default: 10,000. This compresses outputs strongly toward 0.5 — large absolute differences in raw scores are needed to produce meaningfully different rewards.

**Limitations**:
- Uses only `perPlayerVars` — no spatial analysis (zone control, adjacency, connectivity)
- No concept of piece strength, position quality, or strategic value
- No game-phase awareness (early/mid/late game)
- Temperature of 10,000 may be too high, compressing meaningful signal

### 3.11 Node Structure

```typescript
interface MctsNode {
  move: Move | null;              // Concrete move to this node (null = root)
  moveKey: MoveKey | null;        // Canonical dedup key
  parent: MctsNode | null;
  visits: number;                 // Simulation count
  availability: number;           // Times available in sampled worlds
  totalReward: number[];          // Per-player accumulated utility
  heuristicPrior: number[] | null;
  children: MctsNode[];
  provenResult: ProvenResult | null;
  nodeKind: 'state' | 'decision';
  decisionPlayer: PlayerId | null;
  partialMove: Move | null;
  decisionBinding: string | null;
}
```

Nodes are mutable (statistics updated in-place) for performance, but the input GameState is never mutated.

### 3.12 Move Key Deduplication

`canonicalMoveKey(move)` produces a deterministic string encoding:
- Params sorted alphabetically (order-independent)
- Compound moves recursively encoded
- Used for tree child deduplication, MAST statistics, visitor events

### 3.13 Confidence-Based Early Stopping

Uses Hoeffding's inequality:

Conditions to stop:
1. Both best and runner-up children have >= `rootStopMinVisits` visits
2. Best has > 2× runner-up's visits (visit-ratio guard)
3. Confidence intervals don't overlap (Hoeffding bound, delta = `rootStopConfidenceDelta`)

### 3.14 MAST (Move Average Score Table)

Per-move empirical statistics tracking:
- Track (totalUpdates, totalSuccess) per move key
- Warm-up phase: until `totalUpdates >= mastWarmUpThreshold`, explore uniformly
- Exploitation phase: select highest success-rate move with ε-greedy fallback
- Benefit: avoids expensive per-candidate `applyMove` calls in epsilon-greedy rollout policy

**Note**: MAST is only relevant for rollout modes. With direct mode, MAST is unused and slated for removal in Phase 2.

---

## 4. Profiling Data

### 4.1 Scenario S1: VC Faction, Turn 1 (10 iterations)

```
Legal moves: 15 (9 ready, 6 pending)
  pass: 1, event: 2, pivotalEvent: 1, vcTransferResources: 5 (all ready)
  rally: 1, march: 1, attack: 1, terror: 1, tax: 1, ambushVc: 1 (all pending)

Total wall-clock: 117,114 ms (11,711 ms/iteration)
Nodes allocated: 7 (root + 6 children)
Max tree depth: 1

Phase timing:
  Selection:   6,950 ms  (6.0%)
  Simulation: 109,194 ms (93.9%)  ← hybrid rollout, 4 plies/iter
  Evaluation:    174 ms  (0.1%)
  Backprop:        0 ms
```

**Per-kernel-call timing:**

| Operation | Total ms | Calls | Avg ms/call | % of measured |
|-----------|---------|-------|-------------|---------------|
| `materialize` | 52,438 | 50 | **1,049** | **76.3%** |
| `applyMove` | 2,923 | 40 | 73 | 4.3% |
| `legalMoves` | 1,519 | 39 | 39 | 2.2% |
| `evaluate` | 174 | 10 | 17 | 0.3% |
| `terminal` | 49 | 49 | 1 | 0.1% |

**State size**: 42,548 bytes
**Cache hit rate**: 13.3%
**Trigger firings**: avg 2.5/move, max 4
**Branching factor by depth**: d0=15, d1=19.2(max 28), d2=7, d3=6.1(max 10)
**Iteration timing**: p50=11,432ms, p95=19,118ms, stddev=4,050ms

### 4.2 Scenario S1: 50 Iterations

```
Total: 511,595 ms (10,232 ms/iter)
Nodes: 43, max depth: 2
Cache hit rate: 23.2% (improved with depth)

Root child visits (14 children):
  event (unshaded):        6
  vcTransferResources(4):  6
  pivotalEvent:            6
  vcTransferResources(3):  5
  event (shaded):          5
  vcTransferResources(2):  5
  vcTransferResources(5):  3
  pass:                    1
  D:rally:                 0  ← ZERO visits
  D:march:                 0  ← ZERO visits
  D:attack:                0  ← ZERO visits
  D:terror:                0
  D:tax:                   0
  D:ambushVc:              0
```

**Critical finding**: After 50 iterations (~8.5 minutes), pending moves (the core FITL operations) receive ZERO visits. The search never evaluates rally, march, attack, etc.

### 4.3 Scenario S3: NVA Faction, Turn 2 (10 iterations)

```
Legal moves: 19 (13 ready, 6 pending)
Total: 118,209 ms (11,821 ms/iter)
materialize: 937 ms/call (76%), applyMove: 82 ms/call (4.3%)
Branching: max 39 at depth 2, max 35 at depth 3
Trigger firings: max 13 per move (NVA actions)
```

### 4.4 Comparison to Games Where MCTS Works Well

| Property | Go / Chess | FITL (measured) | Gap |
|----------|-----------|-----------------|-----|
| State transition cost | <0.001 ms | ~73 ms (applyMove) | 73,000× |
| Move classification | N/A (all moves are ready) | ~1,049 ms/call | ∞ |
| State size | ~400 bytes | ~42,548 bytes | 106× |
| State cloning | Bitboard copy | Deep object clone (42 KB) | ~1000× |
| legalMoves enumeration | Bitboard ops, <0.001 ms | ~39 ms | 39,000× |
| Trigger cascades | None | Avg 2.5, max 13 | N/A |
| Iterations/second | ~500,000 (Go) | ~0.09 | 5,600,000× |

---

## 5. Current Optimization Plan (Spec 64)

### Phase 1: Classification Caching + Direct Mode (DONE)

- Classification cache added to `StateInfoCache` — root state classified once, reused
- All presets switched to `rolloutMode: 'direct'` — eliminates 93.8% of rollout time
- `background` preset added (200 iter, 30s, direct, heuristic alpha=0.4)
- New `classificationCacheHits` diagnostic counter

**Expected impact**: ~1.1 s/iteration (1× materialization + 1× applyMove + 1× eval). 25 iterations in ~28 s.

### Phase 2: Remove Dead Code + Consolidate (PLANNED)

- Remove `legacy` and `hybrid` rollout modes entirely
- Remove MAST statistics infrastructure
- Remove dead config fields (`hybridCutoffDepth`, `maxSimulationDepth`, `rolloutPolicy`, etc.)
- Collapse 4 presets to a single `DEFAULT_MCTS_CONFIG`
- Relocate `resolveDecisionBoundary()` (still needed for decision node completion during selection)

### Phase 3: Lazy/Deferred Materialization (PLANNED)

The key insight: during selection through already-expanded nodes, you need ZERO `legalChoicesEvaluate` calls.

**3a. Availability checking without full classification:**
```
1. Get legalMoves (cached)
2. Build moveKeySet from legalMoves via canonicalMoveKey (string ops only)
3. For each existing child: available if moveKeySet.has(child.moveKey)
4. Skip classification entirely
```

**3b. Incremental classification at expansion:**
```
1. Get unclassified moves (not matching any child's moveKey)
2. Classify ONE at a time via legalChoicesEvaluate
3. Stop when a ready or pending candidate is found
4. Cache partial classification
```

**3c. Pending move creation deferral:**
Only create decision root nodes when expansion budget allows, one at a time.

**Expected impact**: ~150 ms/iteration. 200 iterations in ~30 s. Pending moves finally get visited.

### Phase 4: Root Parallelization (OPTIONAL)

Fork RNG per worker, run independent `runSearch()` calls, merge root child visit counts.

**Expected impact**: 200 effective iterations in ~8-10 s with 4 workers.

---

## 6. Architectural Constraints for the Researcher

Any proposed optimization must respect these constraints:

1. **Game-agnostic**: Optimizations must work for all games, not just FITL. The engine cannot contain game-specific logic.

2. **Deterministic**: Same seed + same move sequence = identical result. Parallelization must use deterministic RNG forking (the kernel has `fork()` for this).

3. **Immutable state**: The kernel returns new state objects from `applyMove`. Mutation-based approaches would require a complete kernel rewrite — not in scope.

4. **AST-interpreted effects**: Game effects are defined in YAML, compiled to AST, and interpreted at runtime. A JIT compilation step could be added at game-load time, but the AST interpretation is the current architecture.

5. **Full legal move enumeration**: `legalMoves()` returns the complete set. Lazy/streaming enumeration would require kernel API changes.

6. **TypeScript/Node.js runtime**: No native extensions. Web Worker parallelism is available.

7. **Existing heuristic**: `evaluateState` uses per-player variables and optional scoring expressions. It does NOT analyze spatial position, piece relationships, or strategic patterns.

8. **The kernel is shared code**: Any kernel changes affect ALL games and ALL consumers (not just MCTS). Changes must be backward-compatible.

---

## 7. The Heuristic Evaluation Function (Detail)

This is critical for direct-mode MCTS quality. Here's the complete logic:

### 7.1 `evaluateState(def, state, playerId)` → raw score

```
1. Check terminal → ±1,000,000,000
2. If def.terminal.scoring exists:
   - Build eval context (adjacency graph, runtime table, bindings)
   - Evaluate scoring ValueExpr AST against state
   - Add score × 100
3. For each perPlayerVar (type=int):
   - range = max(1, variable.max - variable.min)
   - Own: score += trunc(10,000 × (ownValue - min) / range)
   - Each opponent: score -= trunc(2,500 × (opponentValue - min) / range)
4. Return raw score
```

### 7.2 `evaluateForAllPlayers(def, state, temperature)` → [0,1] reward vector

```
For each player: raw[i] = evaluateState(def, state, i)
mean = average(raw)
For each player: rewards[i] = sigmoid((raw[i] - mean) / temperature)
```

`sigmoid(x) = 1 / (1 + exp(-x))`

With temperature=10,000, a raw score difference of 10,000 between players produces:
- `sigmoid(1) ≈ 0.73` for the leader
- `sigmoid(-1) ≈ 0.27` for the trailing player

This is a relatively compressed signal. A player needs to be ahead by ~30,000 raw points to get a reward near 0.95.

### 7.3 Limitations for FITL

FITL's victory conditions are based on `perPlayerVars` (victory scores), which the heuristic captures directly. However:

- **No spatial awareness**: Controlling key provinces, holding cities, severing supply lines — none of this is in the heuristic
- **No tempo/initiative**: The turn order and card flow create significant tempo advantages not captured
- **No piece-strength model**: A guerrilla in a key province is worth more than one in a backwater
- **No commitment evaluation**: The heuristic doesn't distinguish between "safe" positions and "overextended" ones
- **Equal weighting**: All perPlayerVars get the same weight (10,000 own / 2,500 opponent per normalized unit)

---

## 8. Key Interfaces and Types

### 8.1 MctsConfig (Current, with Phase 1 changes)

```typescript
interface MctsConfig {
  iterations: number;                    // Hard cap (default 1500)
  minIterations: number;                 // Before early-stop (default 128)
  timeLimitMs?: number;                  // Wall-clock budget (ms)
  explorationConstant: number;           // C in UCT (default 1.4)
  maxSimulationDepth: number;            // Plies in rollout (default 48) ← DEAD after Phase 2
  progressiveWideningK: number;          // K (default 2.0)
  progressiveWideningAlpha: number;      // α ∈ [0,1] (default 0.5)
  templateCompletionsPerVisit: number;   // Completions per template (default 2)
  rolloutPolicy: 'random'|'epsilonGreedy'|'mast';  // ← DEAD after Phase 2
  rolloutEpsilon: number;               // ← DEAD after Phase 2
  rolloutCandidateSample: number;        // ← DEAD after Phase 2
  heuristicTemperature: number;          // Sigmoid scaling (default 10,000)
  solverMode: 'off'|'perfectInfoDeterministic2P';
  rolloutMode: 'legacy'|'hybrid'|'direct';  // ← Always 'direct' after Phase 1
  hybridCutoffDepth: number;             // ← DEAD after Phase 2
  mastWarmUpThreshold: number;           // ← DEAD after Phase 2
  compressForcedSequences?: boolean;     // Single-move shortcutting (default true)
  enableStateInfoCache?: boolean;        // Per-search cache (default true)
  maxStateInfoCacheEntries?: number;
  rootStopConfidenceDelta?: number;      // Hoeffding delta ∈ (0,1) (default 1e-3)
  rootStopMinVisits?: number;            // Min visits/child (default 16)
  heuristicBackupAlpha?: number;         // Blending weight [0,1] for heuristic prior
  decisionWideningCap?: number;          // Cap before widening (default 12)
  decisionDepthMultiplier?: number;      // Pool multiplier (default 4)
  visitor?: MctsSearchVisitor;           // Event observer
  diagnostics?: boolean;                 // Enable profiling
}
```

### 8.2 Move Classification

```typescript
interface MoveClassification {
  ready: ConcreteMoveCandidate[];   // Complete moves — can apply directly
  pending: Move[];                   // Need decision tree expansion
}

interface ConcreteMoveCandidate {
  move: Move;
  moveKey: MoveKey;  // Canonical string key for deduplication
}
```

### 8.3 Agent Interface

```typescript
interface Agent {
  chooseMove(args: {
    def: GameDef;
    state: GameState;
    observation: PlayerObservation;
    observer: PlayerId;
    rng: Rng;
  }): { move: Move; rng: Rng };
}
```

### 8.4 State Cache

```typescript
interface CachedStateInfo {
  terminal?: TerminalResult | null;
  legalMoves?: readonly Move[];
  rewards?: readonly number[];
  moveClassification?: MoveClassification;  // NEW in Phase 1
}

type StateInfoCache = Map<bigint, CachedStateInfo>;  // Keyed by stateHash (Zobrist)
```

### 8.5 Diagnostic Fields (Selected)

```typescript
interface MctsSearchDiagnostics {
  // Phase timing (ms)
  selectionTimeMs: number;
  expansionTimeMs: number;
  simulationTimeMs: number;
  evaluationTimeMs: number;
  backpropTimeMs: number;
  beliefSamplingTimeMs: number;

  // Kernel call counts
  legalMovesCallCount: number;
  applyMoveCallCount: number;
  terminalCallCount: number;
  materializeCallCount: number;
  evaluateCallCount: number;

  // Per-kernel-call timing (ms)
  legalMovesTimeMs: number;
  applyMoveTimeMs: number;
  terminalTimeMs: number;
  materializeTimeMs: number;
  evaluateTimeMs: number;

  // Cache
  cacheHits: number;
  cacheMisses: number;
  classificationCacheHits: number;  // NEW

  // Tree structure
  nodeCount: number;
  treeDepth: number;
  maxBranchingFactor: number;
  avgBranchingFactor: number;
  branchingFactorByDepth: Record<number, {avg: number; max: number; count: number}>;

  // Per-iteration timing
  iterationTimeP50Ms: number;
  iterationTimeP95Ms: number;
  iterationTimeMaxMs: number;
  iterationTimeStddevMs: number;

  // State size
  avgStateSizeBytes: number;
  maxStateSizeBytes: number;

  // Effect chains
  totalTriggerFirings: number;
  maxTriggerFiringsPerMove: number;
  avgTriggerFiringsPerMove: number;

  // Memory
  heapUsedAtStartBytes: number;
  heapUsedAtEndBytes: number;
  heapGrowthBytes: number;
}
```

---

## 9. Open Questions for the Researcher

### 9.1 Algorithmic Questions

1. **MCTS for expensive transitions**: Is there an MCTS variant designed for games where a single state transition costs seconds rather than microseconds? Most MCTS literature assumes sub-millisecond transitions.

2. **Minimum viable iteration count**: With 15-39 legal moves and expensive iterations, what is the theoretical minimum iteration count below which MCTS degrades to random play? Is there a principled way to determine this for a given branching factor?

3. **Move pruning before search**: Could a fast heuristic prune obviously bad moves before MCTS begins? (e.g., "pass" when strong operations are available). This would reduce the branching factor from 15-39 to 5-10.

4. **Evaluation function improvements**: The current heuristic only uses per-player variables. What game-agnostic evaluation features could improve move quality in direct mode? (Remember: must be game-agnostic — no FITL-specific logic.)

5. **RAVE/AMAF integration**: Would Rapid Action Value Estimation reduce the iteration count needed for reasonable play? How does RAVE interact with decision nodes and progressive widening?

### 9.2 Architecture Questions

6. **Structural sharing for state cloning**: Could persistent data structures (immutable maps with structural sharing) reduce the `applyMove` clone cost from O(state size) to O(change size)? What speedup is realistic for a ~42 KB state where a typical move changes <5% of the data?

7. **Effect AST JIT compilation**: Could compiling effect ASTs to JavaScript functions at game-load time eliminate interpreter overhead? This would be a one-time cost per game definition. Is this compatible with the game-agnostic constraint?

8. **Lazy legal move enumeration**: Instead of enumerating all legal moves upfront, could the kernel yield moves incrementally? This would allow MCTS to stop after finding enough candidates for progressive widening.

9. **Deterministic parallelization**: Root parallelization (independent trees per worker, merge visit counts) vs. leaf parallelization (parallel rollouts). Which is more viable for a deterministic engine with forked RNGs?

### 9.3 Alternative Approaches

10. **Hybrid LLM + MCTS**: Use an LLM to propose top-K moves from a state description, then run short MCTS verification. This reduces branching by ~5×. Is this viable for a game-agnostic engine?

11. **Neural evaluation function**: Could a lightweight neural network be trained on self-play data to replace the heuristic? Game-agnostic training via the engine's self-play infrastructure.

12. **Flat Monte Carlo**: No tree — just sample moves uniformly and evaluate. For very expensive transitions, is flat MC competitive with shallow MCTS?

13. **One-ply lookahead + sorting**: Apply each legal move once, evaluate the resulting state, pick the best. For FITL this costs ~15 × (39ms + 73ms + 17ms) ≈ 1.9 seconds. Is this good enough? Could it serve as a faster fallback agent?

### 9.4 Spec 64 Critique

14. **Phase 3 risks**: The lazy materialization approach avoids `legalChoicesEvaluate` during selection but still needs it at expansion. Are there edge cases where deferred classification leads to stale information (e.g., moves that were pending become illegal after tree growth)?

15. **Temperature tuning**: With temperature=10,000, the heuristic produces very compressed [0,1] rewards. Should this be tuned lower for direct mode where the heuristic is the only evaluation signal?

16. **Progressive widening parameters**: With expensive expansion, should K and α be tuned differently than for cheap-expansion games? Should expansion be even more conservative?

17. **Missing from spec**: Are there optimization opportunities the spec doesn't address? For example: transposition tables, move ordering heuristics, aspiration windows, or iterative deepening.

---

## 10. Summary of Key Numbers

| Metric | Value |
|--------|-------|
| Target decision time | 10-30 seconds (background), ~600ms (interactive) |
| Current decision time (fast preset, hybrid) | ~46 minutes |
| Current per-iteration cost (hybrid) | ~11,700 ms |
| Estimated per-iteration cost (direct, with classification caching) | ~700-1,100 ms |
| Estimated per-iteration cost (direct, with lazy materialization) | ~150 ms |
| Dominant bottleneck | `legalChoicesEvaluate`: 1,049 ms/call, 76% of kernel time |
| Secondary cost | `applyMove`: 73 ms/call, 4.3% of kernel time |
| FITL branching factor | 15-39 moves (depth-dependent) |
| FITL state size | ~42.5 KB |
| Ready vs pending moves | 9-13 ready, 6 pending (S1/S3) |
| Pending move visits after 50 iterations | **0** |
| Cache hit rate | 13-23% |
| Iteration timing variance | p95/p50 = 1.67× |
| Template completion success rate | 100% |
