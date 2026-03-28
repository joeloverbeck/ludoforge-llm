# 91FIRDECDOMCOM-005: Performance benchmark

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — tests only
**Deps**: tickets/91FIRDECDOMCOM-004.md

## Problem

Spec 91 estimates a 10-25% reduction in total benchmark time from the
first-decision domain compilation optimization. This ticket adds a
benchmark test that measures the actual impact, providing evidence for the
optimization's value and a regression gate for future changes.

## Assumption Reassessment (2026-03-28)

1. Spec 90 added `test/performance/compiled-condition-benchmark.test.ts` —
   same pattern applies here. Performance tests live under
   `packages/engine/test/performance/`.
2. The FITL benchmark uses `compileProductionSpec()` and plays N turns with
   `legalMoves` calls. Timing is captured via `performance.now()`.
3. The optimization's primary impact is on `legalMoves` call duration,
   specifically the admission check portion. Measuring total `legalMoves`
   time with and without the compiled checks quantifies the improvement.
4. "With and without" can be tested by: (a) running with compiled cache
   populated, vs (b) running with a no-op cache (all actions return
   `{ compilable: false }`). Alternatively, compare against a known
   baseline measurement.

## Architecture Check

1. Benchmark is a standalone test — no production code changes. F11
   (Testing as Proof) applied to performance claims.
2. Deterministic benchmark: fixed seed, fixed move sequence, fixed number
   of turns. Results are reproducible across runs (modulo system load).
3. Does NOT enforce a specific speedup threshold (hardware-dependent) but
   records the measurements for human review. A coverage assertion ensures
   the optimization is actually exercised.

## What to Change

### 1. Create benchmark test

```typescript
// first-decision-benchmark.test.ts
// 1. Compile FITL production spec → GameDef
// 2. Create GameDefRuntime (populates first-decision cache)
// 3. Run N turns of random play, measuring:
//    a. Total legalMoves time (with compiled checks)
//    b. Number of compiled fast rejections
//    c. Number of single-decision bypasses
//    d. Number of interpreter fallbacks
// 4. Log results as structured output for human review
// 5. Assert: compiled fast rejections > 0 (optimization is exercised)
// 6. Assert: total compilable action count matches coverage expectations
```

### 2. Add diagnostic counters (test-only)

The benchmark needs to count how many times each path is taken (fast
rejection, single-decision bypass, interpreter fallback). These counters
are test-only instrumentation — NOT added to production code.

Option A: The benchmark wraps `getCompiledFirstDecisionDomain` with a
counting proxy.
Option B: The benchmark uses a custom `LegalMoveEnumerationOptions`
callback (if the API supports it).

Prefer Option A to avoid any production API changes.

## Files to Touch

- `packages/engine/test/performance/first-decision-benchmark.test.ts` (new)

## Out of Scope

- Modifying any production code.
- Enforcing specific speedup thresholds in assertions (hardware-dependent).
- Optimizing the compiled closures themselves (that would be follow-up work).
- Benchmarking event card admission (not compiled per spec).
- Comparing against Spec 90 benchmark results (independent measurement).

## Acceptance Criteria

### Tests That Must Pass

1. Benchmark completes without errors for N turns of FITL random play
   (N >= 10, sufficient to exercise legalMoves multiple times).
2. At least 1 compiled fast rejection occurs during the benchmark run
   (optimization is exercised, not dead code).
3. Coverage assertion: number of compilable actions matches the coverage
   gate from 91FIRDECDOMCOM-004 (>= 30% of pipeline actions).
4. Structured output logged: total legalMoves time, rejection count,
   bypass count, fallback count, compilable action count.
5. Existing suite: `pnpm turbo test --force`

### Invariants

1. No production code is modified by this ticket.
2. Benchmark uses deterministic seed — results are reproducible.
3. Diagnostic counters are test-local — no instrumentation in production
   code paths.
4. The benchmark does NOT assert specific timing thresholds (these are
   hardware-dependent and would create flaky tests).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/performance/first-decision-benchmark.test.ts` —
   FITL benchmark measuring first-decision compilation impact.

### Commands

1. `pnpm -F @ludoforge/engine test 2>&1 | grep -E 'first-decision|benchmark|FAIL'`
2. `pnpm turbo test --force`
