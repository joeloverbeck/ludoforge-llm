# FITL Performance Optimization Campaign Design

**Date**: 2026-03-26
**Approach**: Clone-and-Adapt from Texas perf-optimization campaign

## Context

The improve-loop skill runs an autonomous optimization loop against a fixed evaluation harness. The Texas Hold'em campaign (`campaigns/texas-perf-optimization/`) established the pattern: compile + simulate N games, measure wall-clock time, profile per-function breakdowns, and iteratively optimize the engine code.

FITL is far more complex than Texas Hold'em (130 event cards, 4 factions, nested trigger chains, complex operations). Running a full FITL game takes significantly longer. We need a campaign that balances iteration speed (more experiments per session) with measurement fidelity.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Game count per harness run | 3 games | Fast iterations. Smoke test showed ~82s/game; 3 games × 3 runs = ~12 min benchmark |
| Max turns per game | 200 | Matches existing FITL benchmark tests |
| Seed range | 1000-1002 | Same offset pattern as Texas |
| Harness runs (median) | 3 | Noise reduction via MAD |
| Correctness gate | Full test suite (`pnpm turbo test`) | Same engine code; changes could break Texas too |
| Mutable scope | kernel/ + sim/ + agents/ + cnl/ + tests + schemas | Same as Texas; same engine code |
| Experiment categories | Same 9 as Texas | Profiling will reveal FITL-specific hotspots organically |
| MAX_ITERATIONS | Unlimited | Run until externally interrupted |
| Compiled vs interpreted dual mode | Dropped | Texas-specific concern; FITL only needs compiled path |

## Campaign Structure

```
campaigns/fitl-perf-optimization/
├── program.md              # Instruction spec
├── harness.sh              # Evaluation harness (IMMUTABLE)
├── run-benchmark.mjs       # FITL benchmark runner
├── results.tsv             # Experiment log (header only)
├── musings.md              # Structured reflection
├── checkpoints.jsonl       # Restore points (empty)
├── lessons.jsonl           # Per-campaign lessons (empty)
├── intermediates.jsonl     # Intermediate metrics (empty)
```

## Benchmark Runner (run-benchmark.mjs)

Adapted from Texas runner:
- Entrypoint: `data/games/fire-in-the-lake.game-spec.md`
- Defaults: `--seeds 3`, `--players 4`, `--max-turns 200`
- Single mode (compiled only) — no dual compiled/interpreted comparison
- Same profiler integration (createPerfProfiler with all static buckets)
- Same JSON output format: `combined_duration_ms`, `compilation_ms`, `per_function`, `state_hash`
- Same error handling: 10% error threshold, determinism fingerprint

## Harness (harness.sh)

Identical pipeline to Texas:
1. BUILD: `pnpm -F @ludoforge/engine build`
2. GATE: `pnpm turbo test` (full test suite)
3. RUNNER: 3 runs x `run-benchmark.mjs --seeds 3 --players 4 --max-turns 200`
4. PARSE: Determinism check + median + MAD computation
5. Output: `key=value` format

## Configuration (program.md)

Same thresholds as Texas:
- NOISE_TOLERANCE = 0.01 (1%)
- ABORT_THRESHOLD = 0.05 (5%)
- PLATEAU_THRESHOLD = 5
- MAX_IMPROVEMENT_PCT = 30
- REGRESSION_CHECK_INTERVAL = 5
- PIVOT_CHECK_INTERVAL = 10
- HARNESS_RUNS = 3
- HARNESS_SEEDS = 1
- meta_improvement = false
- METRIC_DIRECTION = lower-is-better

## Root Cause Hypotheses

Same engine code as Texas, but FITL's complexity shifts the bottleneck profile:

1. **Trigger dispatch linear scan** — FITL has ~100+ triggers vs ~10 for Texas
2. **Effect chain depth** — FITL operations have nested forEach loops creating intermediate state copies
3. **Condition evaluation overhead** — Complex aggregate counts, zone filters, terrain checks evaluated 200+ times/move
4. **Agent lookahead redundancy** — PolicyAgent runtime reconstruction per evaluation
5. **Compilation cost** — FITL spec much larger (130 events, macros); may dominate for 5-game runs
6. **Zobrist hash recomputation** — Full recompute vs incremental update
7. **legalMoves combinatorial explosion** — Many parameter combinations for FITL operations

**Rule**: Never assume bottlenecks. Always profile first.

## Key Differences from Texas Campaign

| Aspect | Texas | FITL |
|--------|-------|------|
| Game spec | texas-holdem.game-spec.md | fire-in-the-lake.game-spec.md |
| Games per run | 50 | 3 |
| Max turns | 10,000 | 200 |
| Compiled vs interpreted | Dual mode | Compiled only |
| Expected per-experiment time | ~2-5 min | ~20-25 min (build + gate + 3 games × 3 runs) |
