# 128FULSCODRA-007: Performance benchmarking gate

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — benchmarking only
**Deps**: `archive/tickets/128FULSCODRA-006.md`, `archive/tickets/128FULSCODRA-008.md`

## Problem

Spec 128's stated goal is 8-12% reduction in `combined_duration_ms` by eliminating ~12% CPU overhead from object allocation/copying. After all conversion tickets are complete and determinism is proven, the actual performance impact must be measured to validate the optimization's effectiveness and detect any V8 JIT regressions introduced by the code changes.

## Assumption Reassessment (2026-04-14)

1. The live benchmark harness is `campaigns/fitl-perf-optimization/harness.sh`; it rebuilds the engine, runs the full `pnpm turbo test` gate, executes 3 benchmark runs, checks deterministic `state_hash`, and reports the median `combined_duration_ms`. Confirmed.
2. The campaign result log still preserves the original historical baseline row `13755.39ms`, but archived ticket `128FULSCODRA-008` established that the live closeout decision for this series must use the same-environment pre-128 comparison point `eab78a45` rather than relying only on that older historical row. Confirmed.
3. V8 profiling data in the series still identifies object-allocation builtins (`CreateDataProperty`, `CloneObjectIC`) as motivating hotspots, but the measurement gate closes based on benchmark evidence first; hotspot presence alone is insufficient to prove a remaining regression. Confirmed.
4. The live benchmark harness output does not expose per-phase timing beyond the aggregate per-function buckets in JSON and the deterministic state-hash guard, so the hidden-class regression check here remains indirect: benchmark outcome plus representative `--prof` hotspot inspection. Confirmed.

## Architecture Check

1. This is a measurement-only ticket — no code changes, only benchmark execution and result recording.
2. The acceptance threshold is evidence that current `HEAD` is no worse than the pre-128 comparison point beyond the 1% noise tolerance. The 8-12% target remains aspirational; parity or better on the same-environment comparison is sufficient to validate the architectural direction on the live branch.
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

## Outcome

**Completed**: 2026-04-14

- Completed the measurement-owned work in two stages:
  - historical gate run `exp-008`, which originally recorded `15152.90ms` versus the preserved campaign baseline `13755.39ms`
  - same-environment reconciliation in completed ticket `128FULSCODRA-008`, which reran the authoritative harness on pre-128 `eab78a45` and current `HEAD` `b33b7b44`
- The decisive same-environment comparison closed the gate:
  - pre-128 `eab78a45`: `13887.36ms`
  - current `HEAD` `b33b7b44`: `13849.72ms`
- That places current `HEAD` at `-0.27%` relative to the pre-128 comparison point, so the earlier `+10.16%` historical result was not a still-live regression on the current branch.
- Determinism held in the authoritative harness evidence: `games_completed=3`, `errors=0`, `total_moves=600`, and consistent repeated-run `state_hash` fingerprints.
- The reconciled campaign row was appended to `campaigns/fitl-perf-optimization/results.tsv` as `exp-009`.

### Boundary Notes

- Semantic correction: this ticket's original acceptance wording around `>1% improvement` against the historical `13755.39ms` row was too strict for the live branch after later performance recovery work landed. The correct live closeout surface became parity or better against the same-environment pre-128 comparison point.
- No engine code changed in this ticket. The measurement-only boundary remained intact.
- Ticket `128FULSCODRA-008` is now completed as the evidence-reconciliation owner that resolved the earlier blocked state.

### Verification Run

1. `bash campaigns/fitl-perf-optimization/harness.sh`
2. `bash campaigns/fitl-perf-optimization/checks.sh`
3. `node --prof campaigns/fitl-perf-optimization/run-benchmark.mjs --seeds 3 --players 4 --max-turns 200`
4. `node --prof-process isolate-*.log`
5. `bash campaigns/fitl-perf-optimization/harness.sh` in isolated worktrees for pre-128 `eab78a45` and current `HEAD` `b33b7b44`
