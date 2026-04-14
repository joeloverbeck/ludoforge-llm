# 131POLFALREG-002: Benchmark recovery gate — verify regression recovery

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — benchmark measurement only
**Deps**: `archive/tickets/131POLFALREG-001.md`

## Problem

After removing the fallback-threading optimization (ticket 001), we need benchmark evidence that the +11.34% regression introduced by commit `971992fc` has been recovered. Without this gate, we cannot determine whether the refactoring achieved its goal or whether residual Spec 130 regressions remain.

This is a profiling gate ticket. Its outcome determines whether ticket 003 (bounded Spec 130 follow-up) is needed.

## Assumption Reassessment (2026-04-14)

1. `campaigns/fitl-perf-optimization/run-benchmark.mjs` exists and accepts `--seeds`, `--players`, `--max-turns` flags — confirmed.
2. `campaigns/fitl-perf-optimization/harness.sh` exists (143 lines, immutable evaluation harness) — confirmed.
3. `campaigns/fitl-perf-optimization/checks.sh` exists (9 lines, typecheck + lint guard) — confirmed.
4. Baseline reference: commit `14a33c29` measured `14090.38ms` combined duration. Current HEAD (`fb2acad4`) measured `14966.89ms` (+6.22%).

## Architecture Check

1. No code changes — this is a measurement-only ticket. The architecture check is that we use the existing immutable benchmark harness, not ad hoc scripts.
2. No game-specific logic introduced.
3. No backwards-compatibility concerns.

## What to Change

### 1. Run pre-refactor baseline

Use the already-recorded pre-refactor and pre-ticket-001 benchmark evidence as the "before" measurement surface:

```bash
node campaigns/fitl-perf-optimization/run-benchmark.mjs --seeds 3 --players 4 --max-turns 200
```

### 2. Run post-refactor benchmark

After ticket 001 lands, run the same benchmark on the updated HEAD:

```bash
bash campaigns/fitl-perf-optimization/checks.sh
bash campaigns/fitl-perf-optimization/harness.sh
node campaigns/fitl-perf-optimization/run-benchmark.mjs --seeds 3 --players 4 --max-turns 200
```

### 3. Compare results

Compare `combined_duration_ms` against:
- Current HEAD (pre-refactor)
- `14a33c29` baseline (`14090.38ms`)

### 4. Record outcome

Update run log files with benchmark results. Determine gate outcome:
- **Pass**: post-refactor measurement is within noise of `14a33c29` baseline (~2-3% tolerance). Close ticket 003 as unnecessary.
- **Partial**: measurable improvement but still >3% above baseline. Ticket 003 proceeds with bounded Spec 130 audit.
- **Fail**: no measurable improvement. Reassess root cause analysis.

## Files to Touch

- `campaigns/fitl-perf-optimization/run.log.gate` (modify — record gate results)
- `campaigns/fitl-perf-optimization/run.log.runner.1` (modify — benchmark output)
- `campaigns/fitl-perf-optimization/run.log.runner.2` (modify — benchmark output)
- `campaigns/fitl-perf-optimization/run.log.runner.3` (modify — benchmark output)

## Out of Scope

- Code changes to the engine
- Profiling-guided micro-optimizations
- Spec 130 commit-level bisection (that is ticket 003 if needed)

## Acceptance Criteria

### Tests That Must Pass

1. `bash campaigns/fitl-perf-optimization/checks.sh` passes (typecheck + lint)
2. `pnpm -F @ludoforge/engine test` passes (correctness gate before benchmarking)
3. Benchmark completes without errors for 3 seeds

### Invariants

1. **Foundation 8 (Determinism)**: benchmark runs with identical seeds must produce identical game traces (verified by state hashes in harness output)
2. **Foundation 16 (Testing as Proof)**: recovery is accepted only with benchmark evidence, not assumptions

## Test Plan

### New/Modified Tests

1. No new tests — this is a measurement ticket. Manual verification commands below.

### Commands

1. `bash campaigns/fitl-perf-optimization/checks.sh`
2. `pnpm -F @ludoforge/engine test`
3. `node campaigns/fitl-perf-optimization/run-benchmark.mjs --seeds 3 --players 4 --max-turns 200`
4. `bash campaigns/fitl-perf-optimization/harness.sh`

## Outcome

**Completed**: 2026-04-14

- Ran the ticket-owned correctness and benchmark gate commands on current `HEAD` after the fallback-threading removal from archived ticket `131POLFALREG-001`.
- Updated the campaign-owned benchmark logs: `campaigns/fitl-perf-optimization/run.log.gate` and `campaigns/fitl-perf-optimization/run.log.runner.{1,2,3}`.
- Gate result: **FAIL**. The harness median was `15630.48ms`, which is `+10.93%` slower than the `14a33c29` baseline (`14090.38ms`) and `+4.43%` slower than the previously recorded post-refactor `fb2acad4` measurement (`14966.89ms`).
- Determinism held in the harness-owned proof surface: all three runs produced the same `state_hash` fingerprint `dbca86daa0157586`, with `games_completed=3`, `errors=0`, and `total_moves=600`.
- The dominant measured bucket remained `agentChooseMove_ms` (`9990.2ms` on the median harness run), which keeps the downstream investigation boundary with `tickets/131POLFALREG-003.md`.

### Boundary Notes

- Semantic correction: the ticket's original "run pre-refactor baseline before starting" wording was stale once `131POLFALREG-001` had already landed. The live gate compared current measurements against the recorded baseline evidence and fresh campaign logs instead.
- No code changes were made in this ticket. No schema or generated artifact surfaces changed outside the owned campaign logs.
- Downstream action: `tickets/131POLFALREG-003.md` remains required and now has the live benchmark gate result it was waiting on.

### Verification Run

1. `pnpm -F @ludoforge/engine test`
2. `bash campaigns/fitl-perf-optimization/checks.sh`
3. `node campaigns/fitl-perf-optimization/run-benchmark.mjs --seeds 3 --players 4 --max-turns 200`
4. `bash campaigns/fitl-perf-optimization/harness.sh`
