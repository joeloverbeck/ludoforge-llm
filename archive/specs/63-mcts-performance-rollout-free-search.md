# Spec 63: MCTS Performance — Hybrid Leaf Evaluation + Search Optimizations

**Status**: ✅ COMPLETED

## Summary

MCTS E2E lanes are timing out because the simulation phase is far too expensive, especially in the `default` and `strong` presets where epsilon-greedy rollouts repeatedly score successor states at every ply.

The previous rollout-free proposal correctly identified the hotspot, but it made one unsafe assumption for a universal agent: that the current generic static evaluator is strong enough to replace all forward simulation. That is too aggressive for the current codebase.

This spec replaces the rollout-free proposal with a three-mode design:

- `legacy` — current full-rollout behavior, preserved for A/B tests and as an escape hatch
- `hybrid` — shallow cutoff simulation followed by direct leaf evaluation; this becomes the default for all presets
- `direct` — zero-simulation leaf evaluation, kept behind a flag for experiments only

The performance work is structural and profile-agnostic:

1. Replace long rollouts with shallow cutoff simulations.
2. Replace expensive epsilon-greedy playout scoring with a cheap MAST-guided playout policy.
3. Add a capped per-search state-info cache.
4. Compress forced sequences and add a concrete-move fast path.
5. Replace naive visit-ratio stopping with confidence-based root stopping.
6. Extend diagnostics with timings, kernel-call counts, cache metrics, and stop reasons.

The goal is to get all three CI lanes under 15 minutes without hard-wiring the agent into a brittle no-rollout regime.

## Problem

### Bottleneck analysis

The hot path is still `runOneIteration()` in `search.ts`.

The current cost profile is dominated by the simulation phase:

| Profile | Current simulation behavior | Main cost driver |
|---|---|---|
| `fast` | up to 16-ply random rollout | repeated `legalMoves -> materializeConcreteCandidates -> applyMove` |
| `default` | up to 48-ply epsilon-greedy rollout | repeated candidate scoring: multiple `applyMove` + `evaluateState` per ply |
| `strong` | up to 64-ply epsilon-greedy rollout | same as `default`, but deeper and with wider template completion |

Selection, expansion, and backpropagation are comparatively cheap. The rollout dominates wall-clock time because it re-enters kernel logic at every ply.

### Why the original rollout-free proposal is too risky

The earlier proposal removes rollout entirely and always evaluates the leaf directly. That is attractive for speed, but it is too brittle as the universal default because:

1. `evaluateState()` is generic, not learned, and not game-specific.
2. In Texas Hold’em, that evaluator is too shallow to stand in for genuine lookahead everywhere.
3. Hidden-information search already uses belief sampling, which means many states do not have a reusable canonical hash.
4. A weak direct evaluator can cause the tree to converge quickly to the wrong move, just faster.

For a universal agent, “faster wrong answers” is not a valid win.

### Why the current supporting optimizations also need revision

The supporting ideas in the previous spec were directionally good, but still incomplete:

- **Evaluation cache** was too narrow. Caching only `evaluateForAllPlayers()` leaves a lot of repeated `terminalResult()` and `legalMoves()` work on the table.
- **Visit-ratio stopping** was too naive. Root action selection is a best-arm identification problem; visit ratio alone is not a strong enough stopping rule.
- **Profiling** was too narrow. Per-phase timings help, but kernel-call counts and cache-hit metrics are more actionable for this codebase.
- **Rollout removal** made rollout-specific parameters inert. That is acceptable only if the new algorithm is clearly stronger or clearly safer. It is neither today.

## Goals

1. Reduce per-iteration cost substantially.
2. Preserve robustness across hidden-information and multi-player games.
3. Benefit all three named presets structurally, not by one-off tuning.
4. Preserve determinism: same seed + same config = same result.
5. Provide actionable diagnostics for future optimization work.
6. Keep a safe fallback path to the current algorithm.
7. Get all three MCTS E2E CI lanes under 15 minutes.

## Non-Goals

1. Neural-network evaluation.
2. Multi-threaded or root-parallel MCTS.
3. Sharing tree statistics across transpositions.
4. Full transposition-table graph search.
5. Tree reuse across turns.
6. Re-tuning `explorationConstant`, `progressiveWideningK`, `progressiveWideningAlpha`, or `heuristicTemperature` in phase 1.
7. Removing `rollout.ts`.

## Approach

## 1. Replace “rollout-free by default” with three rollout modes

Add a new config field:

```ts
export type MctsRolloutMode = 'legacy' | 'hybrid' | 'direct';

export interface MctsConfig {
  // existing fields ...

  readonly rolloutMode?: MctsRolloutMode; // default: 'hybrid'

  // Used only in hybrid mode.
  readonly hybridCutoffDepth?: number;
  readonly rootStopConfidenceDelta?: number; // default: 1e-3
  readonly rootStopMinVisits?: number; // default: 16

  readonly enableStateInfoCache?: boolean; // default: true
  readonly maxStateInfoCacheEntries?: number; // default: min(pool.capacity, iterations * 4)

  readonly compressForcedSequences?: boolean; // default: true
}
```

Existing `rolloutPolicy` is extended to support `'mast'`:

```ts
export type MctsRolloutPolicy = 'random' | 'epsilonGreedy' | 'mast';
```

### Preset mapping

The named presets become:

| Preset | `rolloutMode` | `rolloutPolicy` | `hybridCutoffDepth` |
|---|---|---|---|
| `fast` | `hybrid` | `mast` | `4` |
| `default` | `hybrid` | `mast` | `6` |
| `strong` | `hybrid` | `mast` | `8` |

Notes:

- `legacy` mode preserves the current behavior exactly enough for regression testing and A/B comparison.
- `hybrid` is the new default for all named presets.
- `direct` exists for experiment and benchmarking only. It is not the default and no named preset should use it in phase 1.

## 2. Hybrid search loop

The core change is not “delete rollout.” The core change is “make rollout cheap, shallow, and optional.”

### `legacy` mode

Current behavior:

- selection
- expansion
- full rollout using the existing rollout depth and policy
- terminal/direct evaluation at the rollout endpoint
- backpropagation

### `direct` mode

Experimental mode:

- selection
- expansion
- terminal check at leaf
- direct `evaluateForAllPlayers()` at leaf if non-terminal
- backpropagation

This mode is not the default. It exists to benchmark the upside of zero simulation, not to define the new universal baseline.

### `hybrid` mode

New default behavior:

- selection
- expansion
- shallow cutoff simulation
- direct terminal / heuristic evaluation at the cutoff state
- backpropagation

The cutoff simulation:

1. stops at terminal states,
2. stops at no-move or no-candidate states,
3. stops after `hybridCutoffDepth` plies,
4. uses a cheap playout policy (`mast` by default),
5. does **not** repeatedly `applyMove()` and `evaluateState()` on every candidate during the playout.

### New `runOneIteration()` shape

```ts
export function runOneIteration(
  root: MctsNode,
  sampledState: GameState,
  rng: Rng,
  def: GameDef,
  config: MctsConfig,
  rootLegalMoves: readonly Move[],
  runtime: GameDefRuntime,
  pool: NodePool,
  stateInfoCache: StateInfoCache,
  mastStats: MastStats,
  solverActive: boolean = false,
): { readonly rng: Rng } {
  let currentNode = root;
  let currentState = sampledState;
  let currentRng = rng;
  const traversedMoveKeys: string[] = [];

  // Selection + expansion with:
  // - cached legalMoves / terminal lookups
  // - concrete-move fast path
  // - forced-sequence compression
  // - existing ISUCT / solver logic

  // Simulation / leaf evaluation
  let simulationResult: SimulationResult;
  switch (config.rolloutMode) {
    case 'legacy':
      simulationResult = legacyRollout(
        def, currentState, currentRng, config, runtime, mastStats, stateInfoCache,
      );
      break;
    case 'direct':
      simulationResult = {
        state: currentState,
        rng: currentRng,
        terminal: getTerminalCached(def, currentState, runtime, stateInfoCache),
        traversedMoveKeys: [],
      };
      break;
    case 'hybrid':
    default:
      simulationResult = simulateToCutoff(
        def, currentState, currentRng, config, runtime, mastStats, stateInfoCache,
      );
      break;
  }

  currentRng = simulationResult.rng;

  const rewards = evaluateLeaf(
    def,
    simulationResult.state,
    simulationResult.terminal,
    config,
    runtime,
    stateInfoCache,
  );

  backpropagate(currentNode, rewards);

  updateMastStats(
    mastStats,
    traversedMoveKeys.concat(simulationResult.traversedMoveKeys),
    rewards,
  );

  if (solverActive) {
    // unchanged
  }

  return { rng: currentRng };
}
```

## 3. Replace expensive epsilon-greedy playout scoring with MAST in hybrid mode

The current `default` and `strong` profiles are slow largely because epsilon-greedy rollout selection repeatedly scores candidate successors by applying them and evaluating the result.

That is exactly the wrong thing to keep if the goal is to save rollout cost.

### New rule

In `hybrid` mode, the default playout policy is `mast`.

MAST keeps cheap per-move statistics collected during the search. Action choice during playout becomes:

- look up the move key,
- read the average reward for the current player,
- choose best-known move with probability `1 - rolloutEpsilon`,
- choose uniformly random otherwise.

### MAST keying

Reuse `move-key.ts` and key statistics by player + canonical move key:

```ts
type MastKey = `${number}:${string}`;

interface MastEntry {
  readonly visits: number;
  readonly rewardSums: readonly number[];
}
```

Selection score for current player `p`:

```ts
mean = rewardSums[p] / visits
```

### Determinism and scope

- `mastStats` is local to a single `runSearch()` call.
- Updates happen in deterministic iteration order.
- Unseen moves fall back to random behavior.

### Why this matters

The important speed property is simple:

- `mast` playout selection should do map lookups only.
- `mast` playout selection should **not** call `applyMove()` or `evaluateState()` for every candidate.

That removes the worst default/strong rollout multiplier while still retaining a forward-simulation signal.

## 4. Add a capped per-search state-info cache

The old proposal cached only `evaluateForAllPlayers()` results. That leaves too much repeated work untouched.

### New cache contents

Create a per-search cache keyed by canonical `stateHash`:

```ts
export interface CachedStateInfo {
  readonly terminal?: TerminalResult | null;
  readonly legalMoves?: readonly Move[];
  readonly rewards?: readonly number[];
}

export type StateInfoCache = LruMap<bigint, CachedStateInfo>;
```

### What gets cached

Cache these only when `stateHash !== 0n`:

1. `terminalResult()`
2. `legalMoves()`
3. final leaf reward vectors from `evaluateForAllPlayers()`

### What does **not** get cached

Do **not** cache:

- `materializeConcreteCandidates()` output
- successor states from `applyMove()`
- node visit statistics across transpositions

Reasons:

- template completion is RNG-sensitive and visit-sensitive,
- cached successor states are memory-heavy and unsafe across sampled worlds,
- merging node statistics across paths is a different, riskier algorithmic change.

### Size limit

The cache is capped:

```ts
maxStateInfoCacheEntries = min(pool.capacity, config.iterations * 4)
```

Use simple LRU or insertion-order eviction.

### Hidden-information constraint

When `stateHash === 0n`, bypass the cache completely.

This spec explicitly does **not** assume that cache hit rate will be high in ISMCTS. Cache hit rate must be measured and reported.

## 5. Compress forced sequences and add a concrete-move fast path

These are pure engineering wins and do not depend on game-specific knowledge.

### Forced-sequence compression

When a state has exactly one concrete candidate, advance immediately without allocating a new node for that forced state.

Pseudo-code:

```ts
if (config.compressForcedSequences && candidates.length === 1) {
  const only = candidates[0];
  traversedMoveKeys.push(moveKeyFor(only.move));
  currentState = applyMove(def, currentState, only.move, runtime);
  continue;
}
```

Rules:

- still check terminal after each forced move,
- still respect solver logic,
- still count compressed plies in diagnostics.

### Concrete-move fast path

When `legalMoves()` already returns only concrete moves, skip `materializeConcreteCandidates()` and wrap them directly as candidates.

Pseudo-code:

```ts
function materializeOrFastPath(...) {
  if (allMovesConcrete(movesAtNode)) {
    return {
      candidates: movesAtNode.map(asConcreteCandidate),
      rng,
    };
  }
  return materializeConcreteCandidates(...);
}
```

This saves materialization overhead in games that do not rely heavily on template completion.

## 6. Replace visit-ratio stopping with confidence-based root stopping

The old proposal used:

- `iterations >= minIterations`
- 50% budget spent
- `bestVisits > 2 * runnerUpVisits`

That is too blunt.

### New rule

After `minIterations`, stop early only when the best root child is both:

1. well-sampled, and
2. statistically separated from the runner-up.

Use the root player’s reward dimension and a Hoeffding bound:

```ts
const radius = Math.sqrt(Math.log(1 / delta) / (2 * visits));
```

Stop condition:

```ts
best.visits >= rootStopMinVisits &&
runnerUp.visits >= rootStopMinVisits &&
(bestMean - bestRadius) > (runnerUpMean + runnerUpRadius) &&
best.visits > 2 * runnerUp.visits
```

Defaults:

- `rootStopConfidenceDelta = 1e-3`
- `rootStopMinVisits = 16`

### Why keep the visit-ratio guard at all

The confidence test is the real stop condition. The visit-ratio guard remains as a conservative extra filter to avoid noisy early exits.

### Stop precedence

The `runSearch()` loop now stops in this order:

1. solver-proven root
2. wall-clock deadline after `minIterations`
3. confidence-based root stop
4. iteration budget exhaustion

## 7. Extend diagnostics to include counts, spans, and stop reasons

Per-phase timings stay, but they are not enough.

### New diagnostics

```ts
export interface MctsSearchDiagnostics {
  // existing fields...
  readonly totalTimeMs?: number;

  readonly selectionTimeMs?: number;
  readonly expansionTimeMs?: number;
  readonly simulationTimeMs?: number;
  readonly evaluationTimeMs?: number;
  readonly backpropTimeMs?: number;
  readonly beliefSamplingTimeMs?: number;

  readonly legalMovesCalls?: number;
  readonly materializeCalls?: number;
  readonly applyMoveCalls?: number;
  readonly terminalCalls?: number;
  readonly evaluateStateCalls?: number;

  readonly stateCacheLookups?: number;
  readonly stateCacheHits?: number;
  readonly terminalCacheHits?: number;
  readonly legalMovesCacheHits?: number;
  readonly rewardCacheHits?: number;

  readonly forcedMovePlies?: number;
  readonly hybridRolloutPlies?: number;

  readonly avgSelectionDepth?: number;
  readonly avgLeafRewardSpan?: number;

  readonly rolloutMode?: 'legacy' | 'hybrid' | 'direct';
  readonly rootStopReason?: 'none' | 'solver' | 'time' | 'confidence' | 'iterations';
}
```

### Instrumentation rules

- enabled only when `config.diagnostics === true`
- use `performance.now()` for phase timings
- use integer counters for kernel-call and cache metrics
- collect leaf reward span as `max(rewards) - min(rewards)` for each evaluated leaf

### Why the counters matter

Timings answer “where is the time going?”
Counters answer “why is the time going there?”

This spec needs both.

## Expected performance shape

This spec intentionally avoids promising exact speedups before measurement, but the cost shape changes materially:

| Phase | Before | After |
|---|---|---|
| Selection | repeated kernel calls | same or lower with state cache + forced-sequence compression |
| Expansion | one-step expansion | same |
| Simulation (`fast`) | up to 16 plies | up to 4 plies |
| Simulation (`default`) | up to 48 plies with repeated candidate scoring | up to 6 plies with cheap MAST lookups |
| Simulation (`strong`) | up to 64 plies with repeated candidate scoring | up to 8 plies with cheap MAST lookups |
| Evaluation | terminal + heuristic fallback | same, but cached |
| Backprop | same | same |

The important change is that the default and strong presets stop paying the “multiple successor evaluations per rollout ply” tax.

## Implementation Tickets

### MCTSPERF-001: Diagnostics baseline

**Goal**: add actionable performance instrumentation before changing search behavior.

**Files to modify**
- `packages/engine/src/agents/mcts/diagnostics.ts`
- `packages/engine/src/agents/mcts/search.ts`
- `packages/engine/src/agents/mcts/rollout.ts`

**Files to create**
- `packages/engine/test/unit/agents/mcts/diagnostics-timing.test.ts`
- `packages/engine/test/unit/agents/mcts/diagnostics-counters.test.ts`

**Acceptance criteria**
- per-phase timings are populated when diagnostics are enabled
- kernel-call counters are populated when diagnostics are enabled
- cache counters and stop reason are populated when diagnostics are enabled
- diagnostics are absent or undefined when disabled
- existing diagnostics behavior is not regressed

### MCTSPERF-002: Rollout modes + hybrid default

**Goal**: replace the unconditional rollout-free proposal with `legacy` / `hybrid` / `direct` modes.

**Files to modify**
- `packages/engine/src/agents/mcts/config.ts`
- `packages/engine/src/agents/mcts/search.ts`
- `packages/engine/src/agents/mcts/rollout.ts`
- `packages/engine/test/unit/agents/mcts/search.test.ts`

**Files to create**
- `packages/engine/test/unit/agents/mcts/hybrid-search.test.ts`

**Acceptance criteria**
- `rolloutMode` supports `legacy`, `hybrid`, `direct`
- named presets use `hybrid`
- `legacy` preserves current search behavior for regression comparison
- `direct` exists but no named preset uses it
- `hybrid` caps simulation depth at `hybridCutoffDepth`
- determinism is preserved within each mode

### MCTSPERF-003: MAST rollout policy

**Goal**: replace expensive rollout candidate scoring with a cheap information-reuse playout policy.

**Files to modify**
- `packages/engine/src/agents/mcts/config.ts`
- `packages/engine/src/agents/mcts/rollout.ts`
- `packages/engine/src/agents/mcts/search.ts`

**Files to create**
- `packages/engine/src/agents/mcts/mast.ts`
- `packages/engine/test/unit/agents/mcts/mast.test.ts`

**Acceptance criteria**
- `rolloutPolicy` supports `'mast'`
- hybrid presets use `'mast'`
- MAST keys are based on `playerId + canonicalMoveKey`
- unseen moves fall back to random behavior
- MAST action selection does not call `applyMove()` or `evaluateState()` per candidate
- MAST updates are deterministic

### MCTSPERF-004: State-info cache

**Goal**: cache reusable immutable state facts, not tree statistics.

**Files to modify**
- `packages/engine/src/agents/mcts/search.ts`
- `packages/engine/src/agents/mcts/rollout.ts`
- `packages/engine/src/agents/mcts/config.ts`

**Files to create**
- `packages/engine/src/agents/mcts/state-cache.ts`
- `packages/engine/test/unit/agents/mcts/state-cache.test.ts`

**Acceptance criteria**
- cache stores `terminal`, `legalMoves`, and final reward vectors
- cache is local to each `runSearch()` call
- entries with `stateHash === 0n` bypass the cache
- cache size is capped
- cache hit/miss counters are reported in diagnostics
- no tree statistics are shared across transpositions

### MCTSPERF-005: Forced-sequence compression + concrete fast path

**Goal**: stop wasting tree budget on states with no real choice.

**Files to modify**
- `packages/engine/src/agents/mcts/search.ts`
- `packages/engine/src/agents/mcts/rollout.ts`
- `packages/engine/src/agents/mcts/materialization.ts`

**Files to create**
- `packages/engine/test/unit/agents/mcts/forced-sequence-compression.test.ts`
- `packages/engine/test/unit/agents/mcts/materialization-fastpath.test.ts`

**Acceptance criteria**
- one-candidate chains are advanced inline when enabled
- forced states do not allocate extra nodes
- concrete-move-only states bypass materialization
- compressed plies are counted in diagnostics
- determinism is preserved

### MCTSPERF-006: Confidence-based root stop

**Goal**: add a safer early-stop rule at the root.

**Files to modify**
- `packages/engine/src/agents/mcts/config.ts`
- `packages/engine/src/agents/mcts/search.ts`
- `packages/engine/src/agents/mcts/diagnostics.ts`

**Files to create**
- `packages/engine/test/unit/agents/mcts/root-confidence-stop.test.ts`

**Acceptance criteria**
- root stop is based on confidence separation, not visits alone
- root stop checks both best child and runner-up
- root stop respects `minIterations`
- root stop emits `rootStopReason = 'confidence'`
- same seed + same config => same iteration count

### MCTSPERF-007: Validation, campaign bench, and CI gating

**Goal**: prove that `hybrid` is faster and not catastrophically weaker than `legacy`.

**Files to modify**
- `packages/engine/test/e2e/mcts/*.ts`
- `packages/engine/test/e2e/mcts/texas-holdem-mcts-campaign-bench.test.ts`
- `.github/workflows/engine-mcts-e2e-fast.yml`
- `.github/workflows/engine-mcts-e2e-default.yml`
- `.github/workflows/engine-mcts-e2e-strong.yml`

**Files to create**
- `packages/engine/test/e2e/mcts/texas-holdem-mcts-mode-compare.test.ts`

**Validation rules**
- benchmark all three modes: `legacy`, `hybrid`, `direct`
- benchmark all three named presets
- benchmark on Texas Hold’em and at least one second compiled game if available
- record:
  - wall-clock time
  - iterations per second
  - kernel-call counts
  - cache hit rates
  - root stop reason distribution
  - move agreement rate vs legacy
  - head-to-head score / win rate vs legacy on a fixed-seed corpus

**Acceptance criteria**
- `hybrid` is faster than `legacy` on all three presets
- all three CI lanes complete under 15 minutes with named presets
- `hybrid` is not more than 5% weaker than `legacy` on the fixed-seed campaign bench
- `direct` remains experimental unless it also passes the same quality bar
- determinism tests are parameterized by mode and updated accordingly

### MCTSPERF-008: Optional follow-up — implicit heuristic backups

**Goal**: keep a stronger hybridization path ready if shallow simulation still underuses the heuristic.

This ticket is conditional. It should be implemented only if:

- `hybrid` hits the speed target, but
- quality still regresses enough that `legacy` would otherwise remain the default.

**Files likely to modify**
- `packages/engine/src/agents/mcts/node.ts`
- `packages/engine/src/agents/mcts/search.ts`
- `packages/engine/src/agents/mcts/isuct.ts`
- `packages/engine/src/agents/mcts/config.ts`

**Acceptance criteria**
- heuristic leaf values are stored separately from Monte Carlo reward statistics
- selection can blend the two with a config-gated alpha
- `alpha = 0` preserves phase-1 behavior exactly
- quality bench shows improvement before any named preset enables it

## Determinism guarantee

This spec preserves the determinism contract:

1. `runSearch()` still forks one RNG per iteration.
2. All three rollout modes are deterministic with respect to their local RNG streams.
3. MAST statistics are local to the search and updated in deterministic order.
4. State-info cache keys and eviction are deterministic.
5. Confidence-based root stopping is a pure function of deterministic search statistics.
6. Forced-sequence compression changes tree shape only where there is no choice.

Important note:

- `legacy`, `hybrid`, and `direct` produce different traces.
- That is expected.
- Determinism is guaranteed **within a mode**, not across modes.

## Risk mitigation

### Heuristic quality risk

Mitigation:

- `hybrid`, not `direct`, is the default.
- `legacy` remains available.
- `direct` is benchmark-only until it proves safe.

### Cache hit uncertainty in ISMCTS

Mitigation:

- skip `stateHash === 0n`
- cap cache size
- require cache-hit diagnostics
- do not count on cache as a guaranteed speedup

### Progressive widening interaction

Faster iterations may widen the tree sooner. This spec does not retune widening in phase 1.

Mitigation:

- keep current `K` and `alpha`
- add diagnostics for expansion width / selection depth
- revisit only if campaign data shows widening explosion

### Quality regression risk

Mitigation:

- benchmark `legacy` vs `hybrid` vs `direct`
- do not promote `direct`
- keep `legacy` as fallback if `hybrid` misses the quality bar

## Verification checklist

- [ ] `pnpm turbo build` passes
- [ ] `pnpm turbo test` passes
- [ ] `pnpm turbo typecheck` passes
- [ ] `pnpm turbo lint` passes
- [ ] `legacy` mode preserves current regression baseline
- [ ] `hybrid` mode is faster than `legacy` in campaign bench for `fast`
- [ ] `hybrid` mode is faster than `legacy` in campaign bench for `default`
- [ ] `hybrid` mode is faster than `legacy` in campaign bench for `strong`
- [ ] MCTS E2E fast lane < 15 min
- [ ] MCTS E2E default lane < 15 min
- [ ] MCTS E2E strong lane < 15 min
- [ ] `hybrid` is not >5% weaker than `legacy` on fixed-seed bench
- [ ] `direct` remains experimental unless it meets the same quality bar
- [ ] same seed + same config + same mode => same move
- [ ] diagnostics report timings, counters, cache hits, and stop reason

## File impact summary

| File | Change type | Ticket |
|---|---|---|
| `packages/engine/src/agents/mcts/config.ts` | Modify | 002, 003, 004, 006 |
| `packages/engine/src/agents/mcts/search.ts` | Modify | 001, 002, 003, 004, 005, 006 |
| `packages/engine/src/agents/mcts/rollout.ts` | Modify | 001, 002, 003, 005 |
| `packages/engine/src/agents/mcts/diagnostics.ts` | Modify | 001, 006 |
| `packages/engine/src/agents/mcts/materialization.ts` | Modify | 005 |
| `packages/engine/src/agents/mcts/mast.ts` | Create | 003 |
| `packages/engine/src/agents/mcts/state-cache.ts` | Create | 004 |
| `packages/engine/src/agents/mcts/node.ts` | Read-only in phase 1; modify only if ticket 008 lands | 008 |
| `packages/engine/test/unit/agents/mcts/diagnostics-timing.test.ts` | Create | 001 |
| `packages/engine/test/unit/agents/mcts/diagnostics-counters.test.ts` | Create | 001 |
| `packages/engine/test/unit/agents/mcts/hybrid-search.test.ts` | Create | 002 |
| `packages/engine/test/unit/agents/mcts/mast.test.ts` | Create | 003 |
| `packages/engine/test/unit/agents/mcts/state-cache.test.ts` | Create | 004 |
| `packages/engine/test/unit/agents/mcts/forced-sequence-compression.test.ts` | Create | 005 |
| `packages/engine/test/unit/agents/mcts/materialization-fastpath.test.ts` | Create | 005 |
| `packages/engine/test/unit/agents/mcts/root-confidence-stop.test.ts` | Create | 006 |
| `packages/engine/test/e2e/mcts/*.ts` | Modify | 007 |
| `packages/engine/test/e2e/mcts/texas-holdem-mcts-mode-compare.test.ts` | Create | 007 |
| `.github/workflows/engine-mcts-e2e-*.yml` | Read-only unless timeout harness needs minor wiring | 007 |

## Bottom line

The performance issue is real, but the original spec over-corrected. The correct move is not “delete rollout everywhere.” The correct move is:

- keep legacy mode,
- make hybrid mode the default,
- make simulation cheap,
- measure everything,
- gate rollout-free direct evaluation behind benchmarks.

That gives you a much better chance of shipping a faster MCTS without sawing off the branch the universal agent is sitting on.