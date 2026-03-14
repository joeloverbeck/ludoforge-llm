# Campaign: prod-perf-mcts-agent

## Objective

Minimize the combined wall-clock time of the MCTS fast-profile e2e test suite through algorithmic optimization of the MCTS agent code. Target improvements include caching, redundant-work elimination, smarter data structures, and convergence shortcuts — NOT parameter reduction.

The harness runs the fast-profile MCTS e2e test file directly (without `RUN_MCTS_E2E=1`), so only the 3 core smoke tests execute:
- 2-player fast game (200 turns, seed 201) — main workload
- Determinism check (10 turns, seed 501) — lightweight
- Timing bounds (200 turns, seed 701) — secondary workload

The fast preset uses random rollout with no evaluateState in the hot path. It runs 200 iterations per move with 16-ply simulation depth. With ~200 turns per game, the dominant cost is the iteration loop in `search.ts` (selection → expansion → rollout → backprop). Any algorithmic speedup here cascades to all 3 presets.

## Primary Metric

`combined_duration_ms` — lower is better. Measurements within 1% of each other are considered equal (noise tolerance).

## Secondary Metric

`lines_delta` — net lines-of-code change across mutable files. Negative = simplification = good.

## Mutable System (files the agent MAY modify)

- `packages/engine/src/agents/mcts/search.ts`
- `packages/engine/src/agents/mcts/rollout.ts`
- `packages/engine/src/agents/mcts/expansion.ts`
- `packages/engine/src/agents/mcts/belief.ts`
- `packages/engine/src/agents/mcts/isuct.ts`
- `packages/engine/src/agents/mcts/evaluate.ts`
- `packages/engine/src/agents/mcts/materialization.ts`
- `packages/engine/src/agents/mcts/node.ts`
- `packages/engine/src/agents/mcts/node-pool.ts`
- `packages/engine/src/agents/mcts/config.ts`
- `packages/engine/src/agents/mcts/move-key.ts`
- `packages/engine/src/agents/mcts/mcts-agent.ts`
- `packages/engine/src/agents/mcts/solver.ts`
- `packages/engine/src/agents/mcts/diagnostics.ts`
- `packages/engine/src/agents/mcts/index.ts`
- `packages/engine/src/agents/evaluate-state.ts`

## Immutable System (files the agent MUST NOT modify)

- `campaigns/prod-perf-mcts-agent/harness.sh`
- All test files under `packages/engine/test/`
- All test helpers under `packages/engine/test/helpers/`
- All kernel code under `packages/engine/src/kernel/`
- All compiler code under `packages/engine/src/cnl/`
- Config preset parameter values in `config.ts`: the numeric values that define fast/default/strong iteration counts, depths, exploration constants, rollout policies, and time limits MUST NOT change. The preset tiers must retain their competitive meaning.
- Config validation logic in `config.ts`
- Everything under `data/`
- `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, and all build config
- `packages/runner/` (runner package)

## Constraints

1. All engine tests must pass (full suite gate). The harness enforces this.
2. No behavioral changes — the kernel must remain deterministic. Same seed + same moves = same state.
3. No new runtime dependencies.
4. No changes to public API signatures (exported types, function signatures) that would break tests.
5. Preserve all existing test contracts — optimizations must be internal (algorithmic, caching, data structure).
6. **No parameter-reduction shortcuts.** The campaign targets algorithmic improvements, NOT reducing search depth, iteration counts, candidate counts, or rollout depth. Preset tiers (fast/default/strong) must retain their competitive meaning and identical parameter values.
7. Config preset parameter values are immutable even though `config.ts` itself is in the mutable scope (structural refactors of the config module are allowed as long as the preset values and validation logic are preserved).

## Accept/Reject Logic

```
IF harness fails (crash, test failures, no metric):
    REJECT (allow up to 3 trivial-fix retries per experiment)

IF combined_duration_ms improved by >1%:
    IF improvement <2% AND lines_delta > +20:
        REJECT (not worth the complexity)
    ELSE:
        ACCEPT

IF combined_duration_ms within 1% (equal):
    IF lines_delta < 0 (fewer lines):
        ACCEPT (simplification)
    ELSE:
        REJECT

IF combined_duration_ms worsened by >1%:
    REJECT
```

## Root Causes to Seed (starting hypotheses)

1. **Redundant belief sampling**: `sampleBeliefState()` called every iteration even when no hidden info exists or state hasn't changed since last sample. Could detect and skip.
2. **No legal-move caching at root**: Root node's legal moves recomputed on every iteration's selection pass. Could compute once and reuse across iterations for the same root state.
3. **Expansion priority full-simulation**: `selectExpansionCandidate()` applies every candidate move and runs `evaluateState()` to score priority. Could use cheaper proxy heuristics or skip priority scoring when few candidates exist.
4. **Rollout epsilon-greedy evaluation overhead**: `evaluateState()` called for every sampled candidate at every rollout depth step in epsilon-greedy mode. Could cache state evaluations, batch-evaluate, or use simpler approximations.
5. **Template materialization redundancy**: `materializeConcreteCandidates()` re-materializes template completions that may have been computed in prior iterations for the same node. Could cache by move key.
6. **Move key serialization cost**: `MoveKey` uses JSON canonical serialization for deduplication. Could use structural hashing, interning, or faster serialization.
7. **Node pool initialization overhead**: Pool pre-allocates based on worst-case (`max(iterations+1, rootLegalMoveCount*4)`). Node initialization of unused slots may waste cycles.
8. **No early confidence termination**: Could detect when the best child's visit-count lead is statistically dominant and exit iterations early, independent of wall-clock — a "soft convergence" check after `minIterations`.

## Autonomy Directive

Once the loop begins, run indefinitely. Do NOT ask for permission to continue. Do NOT stop when easy ideas run out — re-read files, combine near-misses, try radical alternatives. The loop runs until externally interrupted.
