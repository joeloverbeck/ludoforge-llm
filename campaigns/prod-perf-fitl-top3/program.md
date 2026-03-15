# Campaign: prod-perf-fitl-top3

## Objective

Minimize the combined wall-clock time of the 3 slowest FITL integration test suites by optimizing production engine code (hot paths in compiler, kernel, evaluation).

## Primary Metric

`combined_duration_ms` — lower is better. Measurements within 1% of each other are considered equal (noise tolerance).

## Secondary Metric

`lines_delta` — net lines-of-code change across mutable files. Negative = simplification = good.

## Mutable System (files the agent MAY modify)

All files under `packages/engine/src/` (the entire production codebase).

## Immutable System (files the agent MUST NOT modify)

- `campaigns/prod-perf-fitl-top3/harness.sh`
- All test files under `packages/engine/test/`
- All test helpers under `packages/engine/test/helpers/`
- Everything under `data/`
- `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, and all build config
- `packages/runner/` (runner package)

## Constraints

1. All engine tests must pass (full suite gate). The harness enforces this.
2. No behavioral changes — the kernel must remain deterministic. Same seed + same moves = same state.
3. No new runtime dependencies.
4. No changes to public API signatures (exported types, function signatures) that would break tests.
5. Preserve all existing test contracts — optimizations must be internal (algorithmic, caching, data structure).

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

1. **Adjacency graph rebuilding**: `buildAdjacencyGraph()` in `kernel/spatial.ts` may be rebuilt per `legalMoves()` call instead of being cached on the game definition. O(|zones|^2) for FITL's 20+ zones.
2. **Runtime table index rebuilding**: `buildRuntimeTableIndex()` in `kernel/runtime-table-index.ts` — similar caching opportunity. Expensive per-call but should be immutable once built.
3. **Effect AST tree-walking interpretation**: `effects.ts` (~700 lines) walks effect ASTs recursively. Could benefit from flattening or pre-compilation of hot effect chains.
4. **Condition evaluation overhead**: `evalCondition()` in `eval-condition.ts` is called heavily during move enumeration and effect application. Repeated evaluation of identical conditions on unchanged state.
5. **Token selection in evalQuery**: Zone scans with adjacency checks in `eval-query.ts` — could benefit from indexed lookups instead of linear scans.
6. **Compiler pass overhead**: `compiler-core.ts` orchestrates multiple expansion and lowering passes. Template/macro expansion may traverse the spec more times than necessary.
7. **Deep object creation in immutable patterns**: Spread operators on large GameDef/GameState objects in tight loops (effect application, move enumeration).
8. **Zobrist hashing per move**: `zobrist.ts` hash computation — profile whether it's significant.

## Experiment Categories

- caching: Memoization, lazy initialization, precomputation, result caching
- algorithmic: Better algorithms, reduced complexity, faster paths
- data-structure: More efficient data structures, indexing, lookup optimization
- compiler-pass: Reducing redundant compilation passes, merging traversals
- immutable-pattern: Reducing spread/clone overhead, structural sharing
- spatial: Spatial query optimization, adjacency caching, graph traversal
- evaluation: Condition evaluation shortcuts, short-circuit optimization
- other: Anything not fitting above

## Early Abort

ABORT_THRESHOLD = 0.05  # abort if 5% worse than best after any checkpoint

## Plateau Detection

PLATEAU_THRESHOLD = 5  # consecutive rejects before strategy shift

## Noise Reduction

HARNESS_RUNS = 1  # number of harness executions per experiment (median taken)

## Autonomy Directive

Once the loop begins, run indefinitely. Do NOT ask for permission to continue. Do NOT stop when easy ideas run out — re-read files, combine near-misses, try radical alternatives. The loop runs until externally interrupted.
