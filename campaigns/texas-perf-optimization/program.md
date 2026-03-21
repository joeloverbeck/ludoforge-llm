# Campaign: texas-perf-optimization

## Objective

Minimize the total wall-clock time to compile and simulate 50 Texas Hold'em
tournament games (seeds 1000-1049, 4 players each, max 10000 turns per game).

**Lower is better.** This is the inverse direction from the agent-evolution
campaign (which maximized win rate).

The purpose of this campaign is to reduce simulation runtime so that future
FITL agent-evolution campaigns (which require full campaign simulations with
many decision points) become tractable.

## Primary Metric

`combined_duration_ms` — total time for one-time compilation + 50 game
simulations. Lower is better. Measurements within 1% of each other are
considered equal (noise tolerance due to OS scheduling, GC pauses, etc.).

## Secondary Metrics (diagnostic, not for accept/reject)

- `compilation_ms` — one-time spec compilation
- `terminalResult_ms` — cumulative time in terminalResult() calls
- `legalMoves_ms` — cumulative time in legalMoves() calls
- `applyMove_ms` — cumulative time in applyMove() calls
- `agentChooseMove_ms` — cumulative time in agent.chooseMove() calls
- `computeDeltas_ms` — cumulative time in computeDeltas() calls
- `games_completed`, `errors`, `total_moves`
- `mad_ms`, `mad_pct` — measurement noise indicators

## Mutable System

### Production Engine Code (primary target)

- All files under `packages/engine/src/kernel/` — state init, legal moves,
  apply move, eval condition, eval value, trigger dispatch, terminal detection,
  spatial queries, hash computation, gamedef-runtime
- All files under `packages/engine/src/sim/` — simulator, delta computation
- All files under `packages/engine/src/agents/` — agent evaluation, state
  scoring, policy eval, policy expression system
- All files under `packages/engine/src/cnl/` — compilation pipeline (one-time
  cost but still measurable)

### Test Files (when production changes require it)

- All files under `packages/engine/test/` — tests MAY be modified when
  production code changes break them. Tests must still verify correctness,
  but they must not constrain the implementation. Fix tests to match new
  APIs/behavior. Never weaken assertions, never delete tests without
  replacement, never skip tests.

### Schema Files (when type changes require it)

- `packages/engine/schemas/` — when production type changes require schema
  updates

### Radical Changes Policy

**Radical changes are encouraged** as long as they:
- Align with `docs/FOUNDATIONS.md` (engine agnosticism, determinism, bounded
  computation, immutability)
- Are justified by profiling data (measured bottleneck, not guesswork)
- Pass the determinism check (same seed + same actions = identical stateHash)
- All tests pass after any necessary test updates

The test gate is a correctness gate, not a change-avoidance gate. If a radical
optimization changes function signatures, data structures, or internal APIs,
the corresponding tests MUST be updated to match — but the harness still
requires all tests to pass before accepting.

### Profiling Instrumentation Policy (IMPORTANT)

**Opt-in profiling instrumentation may be added to ANY depth of the codebase.**
This is not limited to the harness or benchmark scripts — profiling hooks may
be added to kernel internals, effect handlers, condition evaluators, selector
resolvers, agent evaluation, or any other hot path. The only requirements are:

1. **Opt-in**: zero overhead when the profiler is not provided. A single
   `profiler !== undefined` guard per instrumentation point is acceptable.
2. **Alignment with `docs/FOUNDATIONS.md`**: profiling is a measurement
   side-channel — it must NOT affect determinism, game state, or move
   enumeration.
3. **Permanent**: profiling instrumentation is valuable infrastructure that
   persists across experiments. Commit it separately from optimization
   experiments so it survives reverts.

**Never guess bottlenecks. Always profile first.** The campaign's biggest wins
(exp-021: -19.6%, exp-031: -3.6%) were discovered by profiling, not by
theorizing about what "should" be slow. If an optimization hypothesis is not
backed by profiling data identifying the specific hot path, add profiling
instrumentation before implementing the optimization.

## Immutable System

- All GameSpecDoc data (`data/games/*`) — the game rules are fixed
- `docs/FOUNDATIONS.md` — architectural commandments (read for guidance,
  never modify)
- `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, and all build config
- Everything under `packages/runner/` (the UI runner)

## Constraints

1. **Determinism**: same seed + same actions = identical stateHash (verified
   by harness across 3 runs per experiment)
2. **Correctness**: full test suite must pass — but tests are mutable. If a
   radical optimization changes APIs/behavior, fix the tests to verify the
   NEW behavior correctly. Never weaken assertions, never delete tests
   without replacement, never skip tests.
3. **Engine agnosticism**: no game-specific optimizations in kernel code
4. **Kernel purity**: no side effects (internal caching/memoization is fine
   if externally pure)
5. **Immutability**: state transitions return new objects (internal transient
   mutation with final freeze is acceptable if it improves performance — the
   external contract must remain immutable)
6. **No new runtime dependencies**
7. **No GameSpecDoc changes**
8. **Alignment with docs/FOUNDATIONS.md**
9. **Radical changes welcome**: deep structural changes (data structure
   replacements, algorithm rewrites, API signature changes) are explicitly
   allowed as long as constraints 1-8 hold. The limiting factor is profiling
   evidence + FOUNDATIONS alignment, not test stability.

## Accept/Reject Logic

```
IF harness fails (crash, build failure, test failure, runner failure):
    REJECT (allow up to 3 trivial-fix retries per experiment)

IF combined_duration_ms decreased by >1% (improvement):
    IF improvement >30% (MAX_IMPROVEMENT_PCT):
        FLAG as suspicious — verify determinism (stateHash check)
        IF determinism preserved: ACCEPT with note
        ELSE: REJECT
    ELSE:
        ACCEPT

IF combined_duration_ms within 1% of best (equal):
    IF lines_delta < 0 (fewer lines = simplification):
        ACCEPT
    ELSE:
        REJECT

IF combined_duration_ms increased by >1%:
    REJECT
```

## Root Causes to Seed

Starting hypotheses for the first experiments (derived from hot-path
profiling analysis — verify with actual profiling data before acting):

1. **Redundant runtime construction in agent lookahead**: `evaluateState()`
   may call `terminalResult(def, state)` without passing `runtime`, causing
   `buildAdjacencyGraph` and `buildRuntimeTableIndex` to be reconstructed on
   every lookahead evaluation (~50× per agent turn).
2. **Trigger dispatch is a linear scan**: `dispatchTriggers` iterates ALL
   `def.triggers` for every event. For games with many triggers, indexing
   by event type would reduce iterations.
3. **computeDeltas allocates heavily**: `delta.ts` creates sorted key arrays,
   new arrays, and delta objects on every move — even when tracing is not
   needed. Conditional or lazy delta computation could help.
4. **Immutable state spread on every effect**: each effect application creates
   a new state object via spread. For chains of effects, intermediate objects
   are immediately discarded. Batching or transient mutation with final freeze.
5. **Zobrist hash recomputation**: `computeFullHash` may recompute from
   scratch rather than incrementally updating based on the state diff.
6. **legalMoves combinatorial expansion**: parameter expansion in legalMoves()
   can produce large candidate sets. Early pruning of impossible parameter
   combinations could reduce work.
7. **evalCondition/evalValue resource allocation**: these functions (called
   200+ times per move) may create fresh resource objects on every call.
   Pooling or reusing these could reduce allocation pressure.

**Important**: these are hypotheses, not conclusions. The OBSERVE phase MUST
read actual profiling data (per-function breakdown from harness output) before
forming experiment hypotheses. Never assume bottlenecks — profile first.

## Experiment Categories

- `caching` — memoization, runtime object reuse, graph caching, eval context
  pooling, pre-computed lookup tables
- `algorithm` — algorithmic improvements (better data structures, index-based
  lookup vs linear scan, hash-based dispatch)
- `allocation` — reducing object allocation (object pooling, reusing buffers,
  reducing spread copies, avoiding intermediate objects)
- `hot-loop` — inner loop optimizations (early exits, short-circuit
  evaluation, branch ordering, loop unrolling)
- `trigger-dispatch` — trigger matching optimization (event-type indexing,
  pre-filtering, trigger partitioning)
- `agent-lookahead` — agent evaluation efficiency (passing runtime through,
  caching state evaluations, pruning candidate moves)
- `compilation` — one-time compilation speedups (if compilation_ms is
  significant relative to simulation time)
- `profiling-infra` — improving measurement granularity (must pair with an
  actual optimization; infrastructure-only changes without performance impact
  will be REJECTED)
- `combined` — multi-category changes that combine approaches from different
  categories

### Special Rules for Categories

- **profiling-infra** experiments MUST be paired with a production code change
  that uses the new measurement capability. Infrastructure-only changes with
  no performance impact will show no metric improvement and will be REJECTED.
- All production code changes must pass the full existing test suite (after
  any necessary test updates).
- During OBSERVE, read the per-function breakdown from the latest harness
  output to guide hypothesis generation.

## Thresholds

```
NOISE_TOLERANCE = 0.01          # 1% — measurements within 1% are equal
ABORT_THRESHOLD = 0.05          # reject if 5% slower than best (mid-experiment)
PLATEAU_THRESHOLD = 5           # consecutive rejects before strategy shift
MAX_IMPROVEMENT_PCT = 30        # flag gains >30% as suspicious
REGRESSION_CHECK_INTERVAL = 5   # re-verify baseline every 5 accepts
PIVOT_CHECK_INTERVAL = 10       # PROCEED/REFINE/PIVOT every 10 experiments
```

## Configuration

```
HARNESS_RUNS = 3                # 3 runs per experiment, take median
HARNESS_SEEDS = 1               # seeds handled internally by run-benchmark.mjs
meta_improvement = false        # meta-loop disabled for this campaign
```

## OBSERVE Phase Protocol (profiling-first)

During OBSERVE, the agent MUST:

1. Read the per-function breakdown from the latest harness output (the
   key=value lines emitted by harness.sh)
2. Identify which function consumes the most time (highest `*_ms` value)
3. Read the source code of that function before forming a hypothesis
4. Formulate hypothesis about WHY it is slow, not just THAT it is slow
5. Propose an optimization that targets the measured bottleneck
6. Never optimize a function that is not in the top 3 by time consumption
   unless there is a specific algorithmic insight that applies

The agent SHOULD also:
- Check `results.tsv` and `lessons.jsonl` for patterns in what has worked
- Look for near-miss stashes (`git stash list`) that could be combined
- Consider whether the current bottleneck function is limited by I/O,
  allocation, computation, or architecture — this guides category selection

## Autonomy Directive

Once the loop begins, run indefinitely. Do NOT ask for permission to
continue. Do NOT stop when easy ideas run out — re-read profiling data,
combine near-misses, try radical alternatives, consult lessons. The loop
runs until externally interrupted.
