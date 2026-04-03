# 64COMEXPEVA-003: Profiling gate — measure Phase 1 token filter impact

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — profiling only
**Deps**: `archive/tickets/64COMEXPEVA-002.md`, `specs/64-compiled-expression-evaluation.md`

## Problem

The token filter compilation (001+002) must demonstrate measurable improvement before proceeding to Phase 2. Without a profiling gate, we risk investing in condition compiler extensions that may not help (the prior campaign proved compiled effects were 12-16% slower than the optimized interpreter).

## Assumption Reassessment (2026-04-03)

1. `perf` is installed at `/usr/local/bin/perf` version 6.6.123. Verified.
2. `--perf-basic-prof` maps V8 JIT addresses to JS function names. Verified this session.
3. FITL 3-seed benchmark runner at `campaigns/fitl-perf-optimization/run-benchmark.mjs`. Verified.
4. Pre-compilation baseline: `foldTokenFilterExpr` at 4.63% CPU. Measured this session.

## Architecture Check

1. No code changes — profiling exercise only.
2. No game-specific logic.
3. No backwards-compatibility concerns.

## What to Change

### 1. Run perf profiling with compiled token filters active

```bash
pnpm -F @ludoforge/engine build
perf record -g -o /tmp/perf-tokenfilter-compiled.data -- \
  node --perf-basic-prof campaigns/fitl-perf-optimization/run-benchmark.mjs \
  --seeds 1 --players 4 --max-turns 200
perf report -i /tmp/perf-tokenfilter-compiled.data --stdio --sort=symbol --no-children
```

### 2. Compare foldTokenFilterExpr CPU before and after

Extract `foldTokenFilterExpr` percentage from the new profile. Compare against baseline 4.63%.

### 3. Run FITL 3-seed benchmark for wall-clock comparison

```bash
node campaigns/fitl-perf-optimization/run-benchmark.mjs --seeds 3 --players 4 --max-turns 200
```

Compare `combined_duration_ms` against the current best (115150ms).

### 4. Apply gate decision

- If `foldTokenFilterExpr` CPU dropped by ≥2% AND `combined_duration_ms` improved: **PROCEED** to Phase 2 (ticket 004).
- If improvement is below threshold: **REVERT** tickets 001+002. Close remaining tickets (004, 005) as "not actionable." Archive the spec.

## Files to Touch

- No files modified — profiling output only

## Out of Scope

- Any code changes
- Condition compiler extensions (ticket 004)

## Acceptance Criteria

### Tests That Must Pass

1. No tests to run — no code changes
2. Existing suite unmodified: `pnpm turbo test`

### Invariants

1. No files in `packages/engine/src/` are modified
2. Profiling report includes before/after comparison table

## Test Plan

### New/Modified Tests

1. None — profiling ticket

### Commands

1. `perf record -g -o /tmp/perf-tokenfilter-compiled.data -- node --perf-basic-prof campaigns/fitl-perf-optimization/run-benchmark.mjs --seeds 1 --players 4 --max-turns 200`
2. `node campaigns/fitl-perf-optimization/run-benchmark.mjs --seeds 3 --players 4 --max-turns 200`
