# 128FULSCODRA-007: Performance benchmarking gate

**Status**: BLOCKED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — benchmarking only
**Deps**: `archive/tickets/128FULSCODRA-006.md`, `tickets/128FULSCODRA-008.md`

## Problem

Spec 128's stated goal is 8-12% reduction in `combined_duration_ms` by eliminating ~12% CPU overhead from object allocation/copying. After all conversion tickets are complete and determinism is proven, the actual performance impact must be measured to validate the optimization's effectiveness and detect any V8 JIT regressions introduced by the code changes.

## Assumption Reassessment (2026-04-14)

1. The live benchmark harness is `campaigns/fitl-perf-optimization/harness.sh`; it rebuilds the engine, runs the full `pnpm turbo test` gate, executes 3 benchmark runs, checks deterministic `state_hash`, and reports the median `combined_duration_ms`. Confirmed.
2. The campaign's durable result log is `campaigns/fitl-perf-optimization/results.tsv`, whose current baseline row is `13755.39ms`. Confirmed.
3. V8 profiling data in Spec 128 still identifies object-allocation builtins (`Scavenger::ScavengeObject`, `CreateDataProperty`, `CloneObjectIC`) as the motivating bottleneck. Confirmed.
4. The live benchmark harness output does not expose per-phase timing beyond the aggregate per-function buckets in JSON and the deterministic state-hash guard, so the hidden-class regression check here is indirect: benchmark outcome plus representative `--prof` hotspot inspection. Confirmed.

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

Document benchmark results in the campaign result log:
- Pre-conversion baseline vs post-conversion median
- Percentage improvement
- V8 profiling delta
- Any unexpected observations

## Files to Touch

- `campaigns/fitl-perf-optimization/results.tsv` (append result row)
- `tickets/128FULSCODRA-007.md` (mark complete and record outcome)

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

1. `bash campaigns/fitl-perf-optimization/harness.sh`
2. `bash campaigns/fitl-perf-optimization/checks.sh`
3. `node --prof campaigns/fitl-perf-optimization/run-benchmark.mjs --seeds 3 --players 4 --max-turns 200`
4. `node --prof-process isolate-*.log`

## Outcome So Far (2026-04-14)

- Completed the measurement-owned work: ran the live FITL benchmark harness, the correctness guard, and a representative `node --prof` capture on the benchmark runner.
- The benchmark gate did not meet acceptance. The live median was `15152.90ms` versus the campaign baseline `13755.39ms`, a `+10.16%` regression rather than the required `>1%` improvement.
- Determinism held in the benchmark harness: `errors=0`, `games_completed=3`, `total_moves=600`, and the harness accepted the repeated-run `state_hash` check.
- The representative processed V8 profile still shows allocation-related builtins in the hotspot set: `CreateDataProperty 4.8%`, `CloneObjectIC 1.5%`, and `CloneObjectIC_Slow 1.1%`. This is indirect evidence only; the current benchmark surface does not prove the exact regression source.
- Ticket `128FULSCODRA-008` now owns the regression investigation and performance recovery required before this measurement gate can be rerun to completion.
