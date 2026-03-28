# 92ENUSTASNA-006: Benchmark regression test for snapshot optimization

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — test-only
**Deps**: archive/tickets/92ENUSTASNA/92ENUSTASNA-005-equivalence-tests.md, archive/tickets/92ENUSTASNA/92ENUSTASNA-008-generalize-snapshot-player-access.md

## Problem

Spec 92 acceptance criterion #7 requires a benchmark that proves the finalized enumeration snapshot architecture is beneficial or, at minimum, not meaningfully slower than the raw compiled-predicate path it replaced.

The original ticket proposal assumed the clean way to measure this was a dual-path `legalMoves` benchmark. That assumption is wrong for the current codebase. `legalMoves` now has one canonical architecture and always creates a snapshot inside `enumerateRawLegalMoves`. Adding a test-only "disable snapshot" switch or alternate enumeration path would weaken the architecture just to benchmark it.

## Assumption Reassessment (2026-03-28)

1. The repo already has a real performance test lane under `packages/engine/test/performance/` and `pnpm -F @ludoforge/engine test:performance` — confirmed.
2. `compileProductionSpec()` and the production compiled-predicate helpers already exist and are the right starting point for a FITL benchmark corpus — confirmed in `packages/engine/test/helpers/production-spec-helpers.ts` and `packages/engine/test/helpers/compiled-condition-production-helpers.ts`.
3. `legalMoves(def, state)` is not the right benchmark boundary for an A/B comparison because there is no architecturally clean snapshot-disabled enumeration path in production code.
4. The real optimization boundary is compiled predicate evaluation with and without the optional `EnumerationStateSnapshot` argument. That is exactly where Spec 92 changes behavior.
5. FITL's production compiled predicate corpus is still useful, but by itself it does not cover every current snapshot consumer shape. Archived ticket `92ENUSTASNA-005` already documented that FITL production coverage is mostly `gvar` plus binding-driven predicates, while focused unit tests own executor-shifted `pvar(active)` and compiled aggregate zone-total parity.
6. Therefore the durable benchmark architecture is:
   - production FITL compiled predicate corpus for real-world coverage
   - focused benchmark samples for executor-shifted `pvar(active)` and aggregate zone-total access
   - same-process comparison of compiled-with-snapshot vs compiled-without-snapshot
7. This ticket is still not justification for preserving the composite-string `zoneTotals` API long term; if a cleaner aggregate contract lands later, the benchmark should follow that final architecture rather than freezing today's representation.

## Architecture Check

1. This remains a pure test ticket. No production code should change.
2. A benchmark at the compiled-predicate boundary is more beneficial than a `legalMoves` A/B harness because it measures exactly where snapshot behavior diverges without introducing a second enumeration architecture.
3. The benchmark should model real snapshot usage by creating one snapshot per state and reusing it across multiple compiled predicate evaluations for that state.
4. Timing assertions should stay advisory, not hard-gated by CI, because absolute performance thresholds are hardware-sensitive. The benchmark must still emit a parseable regression summary so the acceptance criterion is verifiable on the current machine.

## What to Change

### 1. Add an enumeration snapshot benchmark file

Create `packages/engine/test/performance/enumeration-snapshot-benchmark.test.ts`.

Benchmark structure:
- compile FITL production spec once, outside the timed region
- reuse the existing deterministic FITL production predicate corpus from the test helpers
- group production samples by state so the snapshot path creates one snapshot per state and reuses it for all predicates on that state
- add a small focused corpus for the snapshot surfaces FITL production does not currently stress well:
  - executor-shifted `pvar(active)`
  - compiled aggregate zone-total access
- run enough iterations to reduce noise
- record:
  - `raw_compiled_duration_ms`
  - `snapshot_compiled_duration_ms`
  - `combined_duration_ms`
  - `delta_pct`
  - a simple verdict such as `improved`, `within_threshold`, or `regressed`

### 2. Keep the benchmark self-validating

Before or during measurement, the benchmark should prove that the raw and snapshot paths evaluate the same samples successfully:
- same boolean outcomes
- same error-class counts where relevant
- deterministic corpus and iteration counts

### 3. Report, do not create a fake CI baseline system

The benchmark should run under the existing performance lane and standalone via `node --test`.

It should compare snapshot timings against the raw compiled path measured in the same process. Do not add stored-machine baselines, config files, or a test-only runtime flag to turn snapshots off inside `legalMoves`.

## Files to Touch

- `tickets/92ENUSTASNA-006-benchmark-regression-test.md` (modify)
- `packages/engine/test/performance/enumeration-snapshot-benchmark.test.ts` (new)

## Out of Scope

- Modifying production enumeration code
- Adding a snapshot-disable flag, alternate `legalMoves` path, or benchmark-only runtime toggle
- Establishing CI baseline storage or cross-machine threshold infrastructure
- Redesigning snapshot player access itself; that belongs in `92ENUSTASNA-008`
- Redesigning aggregate snapshot APIs; future architectural improvements should update the benchmark rather than preserve current shapes for compatibility

## Acceptance Criteria

### Tests That Must Pass

1. The benchmark test runs without errors on the FITL production predicate corpus plus focused snapshot samples.
2. The benchmark reports parseable same-process timing data for compiled-without-snapshot vs compiled-with-snapshot evaluation, including `combined_duration_ms` and `delta_pct`.
3. The benchmark setup proves raw and snapshot paths stay semantically aligned for the measured corpus.
4. The reported result for the current run is either:
   - `improved` (snapshot path faster by at least 1%), or
   - `within_threshold` (snapshot path within +/-1% of raw compiled baseline), or
   - explicitly flagged as `regressed` for follow-up review.
5. Existing suite: `pnpm turbo test --force`
6. `pnpm turbo lint`
7. `pnpm turbo typecheck`

### Invariants

1. No production code modified by this ticket.
2. The benchmark corpus is deterministic.
3. The implementation does not introduce a second snapshot-disabled legal-moves architecture.
4. Existing benchmark files are not weakened or repurposed.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/performance/enumeration-snapshot-benchmark.test.ts` — same-process benchmark comparing compiled predicate evaluation with and without `EnumerationStateSnapshot`, using FITL production predicates plus focused `pvar(active)` and aggregate samples.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/performance/enumeration-snapshot-benchmark.test.js`
3. `pnpm turbo test --force`
4. `pnpm turbo lint`
5. `pnpm turbo typecheck`

## Outcome

- Completion date: 2026-03-28
- What changed:
  The ticket was corrected before implementation to match the actual architecture: instead of inventing a snapshot-disabled `legalMoves` comparison path, the final benchmark measures the real Spec 92 optimization boundary, compiled predicate evaluation with and without `EnumerationStateSnapshot`. The implementation added `packages/engine/test/performance/enumeration-snapshot-benchmark.test.ts`, which benchmarks the FITL production compiled predicate corpus plus focused executor-shifted `pvar(active)` and aggregate zone-total samples, and emits a parseable same-process timing summary including `combined_duration_ms`, `delta_pct`, and a verdict.
- Deviations from original plan:
  The original plan proposed an end-to-end `legalMoves` benchmark and implied a separate baseline path. That was not the clean architecture. The final implementation kept one canonical enumeration path and benchmarked the exact contract boundary where snapshot behavior diverges.
- Verification results:
  `pnpm turbo build` passed.
  `node --test packages/engine/dist/test/performance/enumeration-snapshot-benchmark.test.js` passed.
  `pnpm turbo test --force` passed.
  `pnpm turbo lint` passed.
  `pnpm turbo typecheck` passed.
