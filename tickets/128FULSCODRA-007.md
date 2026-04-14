# 128FULSCODRA-007: Performance benchmarking gate

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — benchmarking only
**Deps**: `tickets/128FULSCODRA-006.md`

## Problem

Spec 128's stated goal is 8-12% reduction in `combined_duration_ms` by eliminating ~12% CPU overhead from object allocation/copying. After all conversion tickets are complete and determinism is proven, the actual performance impact must be measured to validate the optimization's effectiveness and detect any V8 JIT regressions introduced by the code changes.

## Assumption Reassessment (2026-04-13)

1. The `fitl-perf-optimization` campaign harness exists and measures `combined_duration_ms` across 3 seeds x 3 runs (median). Confirmed — this is the standard measurement tool for kernel performance.
2. V8 profiling data showed ~12% CPU in object allocation/copying builtins. Confirmed per spec source data.
3. Constraint 4 (No V8 Hidden Class Regression): `DraftTracker` is created once per `applyMoveCore` scope and accessed via explicit helpers — it doesn't participate in inline-cache-sensitive sites. This should be verified by the benchmark.

## Architecture Check

1. This is a measurement-only ticket — no code changes, only benchmark execution and result recording.
2. The acceptance threshold is >1% improvement in `combined_duration_ms` (per Spec 128 Constraint 4). The 8-12% target is aspirational; >1% validates the architectural direction is sound.
3. If benchmarking shows regression, the ticket requires investigation and a report — not automatic revert. The architectural change reduces GC pressure regardless of wall-clock measurement noise.

## What to Change

### 1. Run performance benchmark

Execute the `fitl-perf-optimization` campaign harness:
- 3 seeds × 3 runs per seed
- Record median `combined_duration_ms`
- Compare against the pre-conversion baseline (from campaign history)

### 2. V8 profiling verification

Run a V8 CPU profile on one representative seed to verify:
- Reduction in `Scavenger::ScavengeObject` (GC) percentage
- Reduction in `CreateDataProperty` percentage
- Reduction in `CloneObjectIC` percentage
- No new hot spots introduced by COW helper overhead

### 3. Record results

Document benchmark results in the campaign's experiment log:
- Pre-conversion baseline vs post-conversion median
- Percentage improvement
- V8 profiling delta
- Any unexpected observations

## Files to Touch

- Campaign experiment log (record results)

## Out of Scope

- Modifying kernel code based on benchmark results (would be a separate spec/ticket)
- Optimizing COW helper performance (premature until measured)
- Reverting changes if improvement is marginal (the architectural change is sound regardless)

## Acceptance Criteria

### Tests That Must Pass

1. All existing tests pass (prerequisite — verified by ticket 006)
2. stateHash determinism preserved across benchmark runs (same seed = same hash)
3. Benchmark shows >1% improvement in `combined_duration_ms` (validates architectural direction)

### Invariants

1. Foundation 8 (Determinism): stateHash consistency across all benchmark seeds and runs
2. No V8 hidden class regressions: benchmark does not show >2% regression in any individual phase timing

## Test Plan

### New/Modified Tests

1. No new test files — this ticket uses the existing campaign harness

### Commands

1. Run campaign harness (specific command depends on campaign setup)
2. `pnpm -F @ludoforge/engine test` (verify tests still pass)
3. V8 profiling: `node --prof` on a representative seed, then `node --prof-process`
