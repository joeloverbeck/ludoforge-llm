# Spec 63: MCTS Performance — Rollout-Free Search + Optimizations

## Summary

MCTS agent E2E tests have never passed CI. Each of the three CI lanes (fast, default, strong) has a 15-minute timeout, and the MCTS test suites exceed this budget. A previous optimization campaign (`prod-perf-mcts-agent`) achieved only 2.4% improvement and failed because it changed shared MCTS code in ways that only benefited the `fast` profile while degrading `default` and `strong` profiles.

This spec replaces the rollout-based simulation phase with direct leaf evaluation, adds early termination on decisive visits, introduces an evaluation cache, and adds per-phase profiling infrastructure. These are structural, algorithmic changes that benefit all profiles equally.

## Problem

### Bottleneck analysis

The rollout phase in `runOneIteration()` (search.ts:189–205) dominates per-iteration cost at 70–80%:

- **Fast profile** (depth 16, random rollout): each iteration executes ~16 plies of `legalMoves → materializeConcreteCandidates → applyMove`. Per ply: 3 kernel calls minimum.
- **Default profile** (depth 48, epsilon-greedy): each ply calls `applyMove` up to 7 times (6 candidate evaluations via `evaluateState` + 1 chosen move). Per ply: ~8 kernel calls.
- **Strong profile** (depth 64, epsilon-greedy, 4 template completions): same as default but deeper and wider. Per ply: ~10 kernel calls.

The rollout phase is ~10–50x more expensive than selection + expansion + backpropagation combined. Selection traverses existing tree nodes (cheap pointer chasing). Expansion allocates one node and applies one move. Backpropagation walks the parent chain (O(tree depth), no kernel calls). The rollout, by contrast, runs a full simulation loop with kernel calls at every ply.

### Previous campaign failure

The `prod-perf-mcts-agent` branch attempted parameter-level optimizations (reducing candidate samples, lowering simulation depth) that were profile-dependent. Changes that sped up `fast` degraded `default`/`strong` because those profiles rely on deeper rollouts for evaluation quality. The lesson: optimizations must be structural (benefiting the algorithm itself) rather than parameter-dependent.

### CI timeout evidence

Each lane (`engine-mcts-e2e-fast.yml`, `engine-mcts-e2e-default.yml`, `engine-mcts-e2e-strong.yml`) has `timeout-minutes: 15`. The MCTS E2E tests consistently exceed this, preventing any MCTS-touching PR from passing CI.

## Goals

1. Reduce per-iteration cost by eliminating the rollout simulation phase.
2. Ensure all three MCTS profiles (fast, default, strong) benefit equally from the optimization.
3. Preserve determinism: same seed + same config = same result.
4. Provide per-phase profiling data for future optimization campaigns.
5. Add early termination to avoid wasting iterations when the outcome is already decided.
6. Cache repeated evaluations of the same state.
7. Get all three MCTS E2E CI lanes under 15 minutes.

## Non-Goals

1. Changing profile parameters (iterations, exploration constant, etc.).
2. Implementing neural network evaluation (AlphaZero-style learned heuristics).
3. Parallelizing MCTS iterations (multi-threaded search).
4. Removing `rollout.ts` — it is retained as a standalone module for potential future use.
5. Changing the ISUCT selection formula or progressive widening logic.

## Approach: Rollout-Free MCTS

### Literature backing

Modern MCTS implementations (AlphaGo Zero, MuZero, Polygames, Leela Chess Zero) all use leaf evaluation instead of rollouts. The rollout was the original UCT approach (Kocsis & Szepesvári, 2006) but has been superseded by direct heuristic evaluation at leaf nodes, which produces more informative value estimates per iteration at a fraction of the computational cost.

### Core change

Replace the rollout call in `runOneIteration()` (search.ts:189–205) with direct leaf evaluation:

**Current code** (search.ts:189–205):
```ts
// ── Simulation (rollout) ─────────────────────────────────────────────
const rolloutResult = rollout(def, currentState, currentRng, config, runtime);
currentRng = rolloutResult.rng;

// ── Evaluation ───────────────────────────────────────────────────────
let rewards: readonly number[];
if (rolloutResult.terminal !== null) {
  rewards = terminalToRewards(rolloutResult.terminal, sampledState.playerCount);
} else {
  const endTerminal = terminalResult(def, rolloutResult.state, runtime);
  if (endTerminal !== null) {
    rewards = terminalToRewards(endTerminal, sampledState.playerCount);
  } else {
    rewards = evaluateForAllPlayers(def, rolloutResult.state, config.heuristicTemperature, runtime);
  }
}
```

**New code**:
```ts
// ── Leaf evaluation (replaces rollout) ───────────────────────────────
let rewards: readonly number[];
const leafTerminal = terminalResult(def, currentState, runtime);
if (leafTerminal !== null) {
  rewards = terminalToRewards(leafTerminal, currentState.playerCount);
} else {
  rewards = evaluateForAllPlayers(def, currentState, config.heuristicTemperature, runtime);
}
```

### Cost reduction

| Phase | Before (per iteration) | After (per iteration) |
|-------|------------------------|----------------------|
| Selection | ~1–5 `applyMove` calls (tree traversal) | Same |
| Expansion | 1 `applyMove` + 1 `legalMoves` + 1 `materialize` | Same |
| Simulation | 16–64 plies × (1–7 `applyMove` + `legalMoves` + `materialize`) | **Eliminated** |
| Evaluation | 1 `terminalResult` + possibly `evaluateForAllPlayers` | 1 `terminalResult` + possibly `evaluateForAllPlayers` |
| Backprop | O(tree depth) additions | Same |

Per-iteration kernel calls drop from ~20–450+ to ~5–10. This is a 4–90x reduction depending on profile.

### Profile-agnostic benefit

The rollout elimination is structural — it removes code from the iteration pipeline. Unlike parameter tuning, every profile benefits equally because the rollout phase is removed entirely, not shortened.

### RNG impact

The `rollout()` function consumes RNG state during simulation. Removing it changes the RNG consumption pattern per iteration, which means:
- **Traces will differ** from the rollout-based version (different moves chosen at the root).
- **Determinism is preserved**: same seed + same config = same result under the new algorithm.
- Golden test values for MCTS determinism tests must be updated.

The RNG fork chain is unchanged — `runSearch()` still forks per iteration, and the iteration-local RNG is consumed by belief sampling and the selection/expansion phase. The leaf evaluation (`evaluateForAllPlayers`) is pure and consumes no RNG.

## Supporting Optimizations

### Early termination on decisive visits

After `minIterations` have been completed and at least 50% of the iteration budget is consumed, if the best root child has more than 2x the visits of the runner-up, terminate search early.

**Location**: `runSearch()` while loop (search.ts:254 area).

```ts
// Early termination: decisive visit ratio
if (iterations >= config.minIterations && iterations >= config.iterations / 2) {
  const children = root.children;
  if (children.length >= 2) {
    let bestVisits = 0;
    let runnerUpVisits = 0;
    for (const child of children) {
      if (child.visits > bestVisits) {
        runnerUpVisits = bestVisits;
        bestVisits = child.visits;
      } else if (child.visits > runnerUpVisits) {
        runnerUpVisits = child.visits;
      }
    }
    if (bestVisits > 2 * runnerUpVisits) {
      break;
    }
  }
}
```

This is deterministic: visit counts depend on the deterministic RNG fork chain. The 2x ratio threshold is conservative — it means the best child has received more than double the visits of any other child, making it extremely unlikely that additional iterations would change the decision.

### Evaluation cache by stateHash

Cache `evaluateForAllPlayers()` results keyed by `stateHash` to avoid re-evaluating the same position reached via different move orders (transpositions).

**Location**: `runOneIteration()` in search.ts, around the leaf evaluation code.

```ts
// Evaluation cache lookup (skip for belief-sampled states with hash 0n)
const cacheKey = currentState.stateHash;
let rewards: readonly number[];
const leafTerminal = terminalResult(def, currentState, runtime);
if (leafTerminal !== null) {
  rewards = terminalToRewards(leafTerminal, currentState.playerCount);
} else if (cacheKey !== 0n && evalCache.has(cacheKey)) {
  rewards = evalCache.get(cacheKey)!;
} else {
  rewards = evaluateForAllPlayers(def, currentState, config.heuristicTemperature, runtime);
  if (cacheKey !== 0n) {
    evalCache.set(cacheKey, rewards);
  }
}
```

Design constraints:
- Cache type: `Map<bigint, readonly number[]>`.
- Scope: local to each `runSearch()` call (passed into `runOneIteration()`). Not shared across search calls.
- Skip caching when `stateHash === 0n` — this indicates a belief-sampled state where the hash is not meaningful.
- No size limit needed — cache lifetime is bounded by the search call, and distinct positions encountered per search are bounded by iterations × tree depth.

### Profiling infrastructure

Extend `MctsSearchDiagnostics` (diagnostics.ts) with per-phase timing:

```ts
export interface MctsSearchDiagnostics {
  // ... existing fields ...
  readonly totalTimeMs?: number;

  // New per-phase timing (cumulative across all iterations)
  readonly selectionTimeMs?: number;
  readonly expansionTimeMs?: number;
  readonly evaluationTimeMs?: number;
  readonly backpropTimeMs?: number;
  readonly beliefSamplingTimeMs?: number;
}
```

**Implementation approach**:
- Add `performance.now()` bracketing around each phase within `runOneIteration()`.
- Accumulate timings in a mutable accumulator object passed through the search loop.
- Only active when `config.diagnostics === true` (existing flag).
- Convert accumulated timings into the diagnostics result in `collectDiagnostics()`.

This provides data for future optimization campaigns without affecting production search performance.

## Implementation Tickets

### MCTSPERF-001: Profiling baseline

**Goal**: Add per-phase timing to diagnostics and capture baseline performance numbers.

**Files to modify**:
- `packages/engine/src/agents/mcts/diagnostics.ts` — extend `MctsSearchDiagnostics` with per-phase timing fields
- `packages/engine/src/agents/mcts/search.ts` — add timing instrumentation (guarded by `config.diagnostics`)

**Files to create**:
- `packages/engine/test/unit/agents/mcts/diagnostics-timing.test.ts` — verify timing fields are populated when diagnostics enabled

**Acceptance criteria**:
- `MctsSearchDiagnostics` includes `selectionTimeMs`, `expansionTimeMs`, `evaluationTimeMs`, `backpropTimeMs`, `beliefSamplingTimeMs`
- Fields are only populated when `config.diagnostics === true`
- Existing diagnostics tests continue to pass
- Baseline timing captured in a benchmark test for before/after comparison

### MCTSPERF-002: Rollout-free search

**Goal**: Replace the rollout call with direct leaf evaluation in `runOneIteration()`.

**Files to modify**:
- `packages/engine/src/agents/mcts/search.ts` — replace lines 189–205 with leaf evaluation (~20 lines changed); remove `rollout` import
- `packages/engine/test/unit/agents/mcts/search.test.ts` — update tests that assert on rollout behavior; update determinism golden values

**Files NOT modified**:
- `packages/engine/src/agents/mcts/rollout.ts` — retained as standalone module, not deleted

**Acceptance criteria**:
- `runOneIteration()` no longer calls `rollout()`
- `rollout.ts` is not imported by `search.ts`
- All unit tests in `test/unit/agents/mcts/` pass
- Determinism preserved: same seed → same move (golden values updated)
- `pnpm turbo typecheck` passes

### MCTSPERF-003: Early termination

**Goal**: Add decisive-visit-ratio early termination to `runSearch()`.

**Files to modify**:
- `packages/engine/src/agents/mcts/search.ts` — add early termination check in the `while` loop after the existing wall-clock check

**Files to create**:
- `packages/engine/test/unit/agents/mcts/early-termination.test.ts` — test that search terminates early when visit ratio exceeds threshold

**Acceptance criteria**:
- Search terminates early when `bestVisits > 2 * runnerUpVisits` and `iterations >= minIterations` and `iterations >= iterations / 2`
- When conditions are not met, search runs to completion (no regression)
- Deterministic — same seed produces same iteration count
- Unit tests verify both early-exit and full-run scenarios

### MCTSPERF-004: Evaluation cache

**Goal**: Cache `evaluateForAllPlayers()` results by `stateHash` to avoid redundant evaluation of transpositions.

**Files to modify**:
- `packages/engine/src/agents/mcts/search.ts` — add `evalCache` parameter to `runOneIteration()`, create cache in `runSearch()`, use cache in leaf evaluation
- `packages/engine/test/unit/agents/mcts/search.test.ts` — test cache hit/miss behavior

**Acceptance criteria**:
- Cache keyed by `stateHash` (`Map<bigint, readonly number[]>`)
- States with `stateHash === 0n` bypass cache
- Cache is local to each `runSearch()` call
- Determinism preserved (cache is populated deterministically)
- Unit tests verify cache hit avoids re-evaluation

### MCTSPERF-005: Validation & CI

**Goal**: Run all MCTS E2E tests and verify CI compliance.

**Files to verify** (read-only — no modifications expected):
- `packages/engine/test/e2e/mcts/*.ts` — all E2E test files
- `.github/workflows/engine-mcts-e2e-fast.yml`
- `.github/workflows/engine-mcts-e2e-default.yml`
- `.github/workflows/engine-mcts-e2e-strong.yml`

**Files to modify** (if needed):
- E2E test golden values — determinism assertions will need updated expected values since the algorithm changed
- E2E test timeout expectations — tests may need adjusted iteration counts if the faster search changes convergence behavior

**Acceptance criteria**:
- `pnpm turbo test` — all engine tests pass
- `pnpm turbo typecheck` — no type errors
- `pnpm turbo lint` — no lint errors
- E2E MCTS tests: each lane completes under 15 minutes
- Determinism tests: same seed produces same move (with updated golden values)
- Wall-clock improvement measured and documented (expected: 4–50x per-iteration speedup depending on profile)

## Determinism Guarantee

The MCTS agent's determinism contract is: same seed + same config = same result. This spec preserves that contract:

1. **RNG fork chain unchanged**: `runSearch()` forks one RNG per iteration. The iteration-local RNG is consumed by belief sampling and selection/expansion. This structure does not change.
2. **Leaf evaluation is pure**: `evaluateForAllPlayers()` calls `evaluateState()` for each player — no RNG consumption, no side effects.
3. **Cache is deterministic**: The evaluation cache is populated in iteration order, which is deterministic. Cache hits return the same values that would have been computed.
4. **Early termination is deterministic**: Visit counts are determined by the deterministic RNG fork chain. The termination condition is a pure function of visit counts.

**Breaking change**: Traces will differ from the rollout-based version because RNG consumption per iteration changes (rollout consumed RNG for simulation steps; leaf evaluation does not). This is an expected algorithmic change, not a determinism violation. Golden test values must be updated.

## Risk Mitigation

### Heuristic quality

The rollout-free approach depends on `evaluateState()` providing meaningful position assessments. If the heuristic is too coarse, per-iteration play quality may degrade. However:
- More iterations within the same wall-clock budget compensates for lower per-iteration quality.
- The 4–50x speedup means 4–50x more iterations, which improves tree coverage substantially.
- Modern MCTS literature confirms that even simple heuristics outperform random rollouts when iteration count is sufficient.

### Config escape hatch

A future ticket could add a `leafEvalOnly: boolean` config field (defaulting to `true`) to allow re-enabling rollouts if needed. This spec does not implement the config flag — it simply retains `rollout.ts` as a standalone module. The escape hatch is the ability to re-import and call `rollout()` in `runOneIteration()` if evaluation-only proves insufficient for a specific game.

### Retained modules

`rollout.ts` is not deleted or modified. Its exports (`rollout`, `RolloutResult`) remain available. The only change is that `search.ts` no longer imports or calls it.

## Verification Checklist

- [ ] `pnpm turbo build` — compiles without errors
- [ ] `pnpm turbo test` — all engine tests pass (with updated golden values)
- [ ] `pnpm turbo typecheck` — no type errors
- [ ] `pnpm turbo lint` — no lint errors
- [ ] E2E MCTS fast lane < 15 min
- [ ] E2E MCTS default lane < 15 min
- [ ] E2E MCTS strong lane < 15 min
- [ ] Determinism: same seed → same move (golden values updated for new algorithm)
- [ ] Profiling data captured with `config.diagnostics: true`
- [ ] `rollout.ts` retained as standalone module (not imported by `search.ts`)

## File Impact Summary

| File | Change Type | Ticket |
|------|-------------|--------|
| `packages/engine/src/agents/mcts/diagnostics.ts` | Modify — extend interface | MCTSPERF-001 |
| `packages/engine/src/agents/mcts/search.ts` | Modify — core algorithm change | MCTSPERF-001, 002, 003, 004 |
| `packages/engine/src/agents/mcts/evaluate.ts` | Read-only reference | — |
| `packages/engine/src/agents/mcts/rollout.ts` | Decoupled (no modification) | MCTSPERF-002 |
| `packages/engine/src/agents/mcts/config.ts` | Read-only reference | — |
| `packages/engine/test/unit/agents/mcts/diagnostics-timing.test.ts` | Create | MCTSPERF-001 |
| `packages/engine/test/unit/agents/mcts/search.test.ts` | Modify — update golden values | MCTSPERF-002, 004 |
| `packages/engine/test/unit/agents/mcts/early-termination.test.ts` | Create | MCTSPERF-003 |
| `packages/engine/test/e2e/mcts/*.ts` | Modify — update golden values | MCTSPERF-005 |
| `.github/workflows/engine-mcts-e2e-*.yml` | Read-only reference | — |
