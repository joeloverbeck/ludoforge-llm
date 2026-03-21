# Texas Hold'em Simulation Performance Optimization — Design

## Problem

FITL agent-evolution campaigns require running full game simulations many times
with different seeds. FITL games have many decision points (chooseN, chooseOne),
triggers, and effect chains, making simulations slow. Before tackling FITL agent
evolution, we optimize the simulation engine using Texas Hold'em as a benchmark —
it exercises the same kernel code paths with fewer decisions.

## Approach

A new improve-loop campaign (`campaigns/texas-perf-optimization/`) that
iteratively optimizes engine production code, guided by profiling data.

## Campaign Structure

```
campaigns/texas-perf-optimization/
├── program.md           # Campaign specification (lower-is-better metric)
├── harness.sh           # BUILD → GATE → RUNNER×3 → PARSE
├── run-benchmark.mjs    # Custom timed game loop with per-function breakdown
├── results.tsv          # Experiment log
└── musings.md           # Reflection log
```

## Key Design Decisions

1. **Metric direction**: `combined_duration_ms` (lower is better) — inverted
   from agent-evolution's `win_rate` (higher is better).

2. **Median-of-3 runs**: Each harness invocation runs the benchmark 3 times
   and takes the median to reduce timing noise. MAD is computed for confidence.

3. **Determinism verification**: All 3 runs must produce identical stateHash
   XOR fingerprints. Catches non-determinism introduced by optimizations.

4. **Custom timed game loop**: The benchmark reimplements `simulator.ts`'s game
   loop with `performance.now()` around each kernel call, since ESM namespace
   objects are frozen and can't be monkey-patched.

5. **Tests are mutable**: Radical production code changes are allowed (and
   encouraged). If tests break due to API changes, they must be fixed — but
   assertions must never be weakened.

6. **Profiling-first OBSERVE protocol**: The agent must read per-function
   breakdown before forming hypotheses. Never assume bottlenecks.

## Baseline Profile (verified)

50 Texas Hold'em games, 12,647 total moves, median of 3 runs:

| Function | Time (ms) | % of Total |
|----------|-----------|------------|
| applyMove | 24,591 | 66.5% |
| agentChooseMove | 10,806 | 29.2% |
| legalMoves | 977 | 2.6% |
| compilation | 287 | 0.8% |
| computeDeltas | 214 | 0.6% |
| terminalResult | 26 | 0.07% |
| **Total** | **36,991** | **100%** |

MAD: 96.55ms (0.26%) — excellent measurement stability.

## Mutable Boundary

All production engine code (`kernel/`, `sim/`, `agents/`, `cnl/`), plus test
files when production changes require it. GameSpecDoc data is immutable.

## Experiment Categories

caching, algorithm, allocation, hot-loop, trigger-dispatch, agent-lookahead,
compilation, profiling-infra, combined.

## Constraints

- Determinism preserved (stateHash check)
- All tests pass (after any needed updates)
- Engine agnosticism maintained
- Alignment with FOUNDATIONS.md
- No new runtime deps, no GameSpecDoc changes
