# 92ENUSTASNA-006: Benchmark regression test for snapshot optimization

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — test-only
**Deps**: tickets/92ENUSTASNA-005-equivalence-tests.md, archive/tickets/92ENUSTASNA/92ENUSTASNA-008-generalize-snapshot-player-access.md

## Problem

The spec's acceptance criterion #7 requires a performance benchmark proving either >=1% improvement in `combined_duration_ms` OR no regression (within +/-1% of baseline) when the equivalence test passes. This validates that the snapshot optimization provides measurable benefit (or at least does no harm) in production-representative workloads.

## Assumption Reassessment (2026-03-28)

1. Existing performance benchmarks exist in `packages/engine/test/performance/` — confirmed from project structure.
2. `compileProductionSpec()` is available for FITL production spec compilation.
3. `legalMoves(def, state)` is the primary benchmark target — it internally creates and uses the snapshot.
4. The benchmark should measure wall-clock time for `legalMoves` across multiple game states with multiple iterations to reduce noise.
5. The benchmark should measure the final intended snapshot architecture, including the player-generalized path from `92ENUSTASNA-008`, not just the temporary guarded subset currently present in production.
6. This ticket still should not be treated as justification for keeping the composite-string `zoneTotals` API when future aggregate consumers are added.

## Architecture Check

1. This is a pure test ticket — no production code changes.
2. The benchmark complements the equivalence test: equivalence proves correctness, the benchmark proves no performance regression for the finalized snapshot architecture.
3. Benchmark methodology: measure `legalMoves` duration across a fixed set of game states, multiple iterations, report mean and P95.

## What to Change

### 1. Create benchmark test

Benchmark structure:
- Compile FITL production spec once (excluded from timing)
- Generate 5 distinct game states from different seeds (initial + 10/20/30/40 random moves)
- For each state, call `legalMoves(def, state)` 50 iterations
- Record per-state mean duration
- Report combined mean duration across all states
- Assert: combined mean duration is within acceptable bounds (no regression > 1% vs. a recorded baseline, OR show improvement)

### 2. Baseline capture approach

The benchmark should:
- Run deterministically (fixed seeds, fixed move counts)
- Output timing results in a parseable format
- Be runnable as part of `test:performance` or standalone

**Note**: The exact baseline threshold depends on hardware. The test should report results and optionally compare against a stored baseline. The primary acceptance criterion is that the test runs without errors and produces timing data — the >=1% improvement or no-regression check may be a manual review step rather than a hard assertion (given CI hardware variance).

## Files to Touch

- `packages/engine/test/performance/enumeration-snapshot-benchmark.test.ts` (new)

## Out of Scope

- Modifying any production code
- Modifying existing benchmarks
- Establishing CI baseline infrastructure (this is a reportable benchmark, not a CI gate)
- Redesigning snapshot player access itself; that belongs in `92ENUSTASNA-008`
- Optimizing snapshot creation itself beyond the architecture already chosen (if benchmark shows no benefit, that's an acceptable result per AC#7)
- Benchmarking future structured zone-total consumers before `92ENUSTASNA-007` is implemented

## Acceptance Criteria

### Tests That Must Pass

1. Benchmark test runs without errors on FITL production spec.
2. Benchmark produces timing data for `legalMoves` across 5+ game states, 50+ iterations each.
3. Benchmark reports combined mean and P95 duration in a parseable format.
4. Result: either >=1% improvement in combined duration, OR no regression (within +/-1% of baseline) when equivalence test passes.
5. Existing suite: `pnpm turbo test --force`

### Invariants

1. No production code modified by this ticket.
2. Benchmark is deterministic — same seeds, same move sequences, reproducible results.
3. Benchmark does not modify or weaken any existing test or benchmark.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/performance/enumeration-snapshot-benchmark.test.ts` — timed `legalMoves` benchmark across multiple FITL game states with configurable iteration count.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/performance/enumeration-snapshot-benchmark.test.js`
3. `pnpm turbo test --force`
