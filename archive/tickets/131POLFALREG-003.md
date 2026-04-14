# 131POLFALREG-003: Bounded Spec 130 follow-up narrowing (conditional)

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — benchmark narrowing only
**Deps**: `archive/tickets/131POLFALREG-002.md`

## Problem

If the fallback-threading removal (ticket 001) does not fully recover the benchmark regression to within noise of the `14a33c29` baseline, residual slowdown from Spec 130 commits remains. This ticket performs a bounded, evidence-driven audit of Spec 130 commits (`700bc128` through `fb2acad4`) to isolate any additional regression sources.

**Gate condition**: Close this ticket without implementation if `archive/tickets/131POLFALREG-002.md` profiling shows recovery to within ~2-3% of the `14a33c29` baseline (`14090.38ms`).

## Assumption Reassessment (2026-04-14)

1. The spec's recorded Spec 130 benchmark table is historical evidence only; same-environment reruns are required before treating any later Spec 130 commit as a live residual regression source.
2. The benchmark harness and tooling exist and are functional — confirmed in reassessment.
3. Archived ticket `131POLFALREG-002` reported a failing gate result, but that measurement must be treated as re-checkable rather than definitive if same-environment reruns disagree.

## Architecture Check

1. Any fixes identified by this audit must follow the same architectural principles: no hot-path object widening, no compatibility shims, no benchmark-only hacks.
2. Changes must preserve engine agnosticism — Spec 130 commits are in the agent layer, not the kernel.
3. Foundation 15 (Architectural Completeness) — fixes must address root causes identified by profiling, not guess at symptoms.

## What to Change

### 1. Bisect Spec 130 commits

Using the benchmark harness, measure each Spec 130 commit individually to identify which specific commit(s) contribute to residual regression:

- `700bc128` (first Spec 130 commit)
- `752d35dc`
- `08c1f2a3`
- `5713399c`
- `fb2acad4` (final Spec 130 commit)

### 2. Profile the identified commit(s)

For each commit showing measurable regression, run V8 profiling only if the harness sweep still shows a live residual regression after the same-environment comparison:

```bash
node --prof campaigns/fitl-perf-optimization/run-benchmark.mjs --seeds 3 --players 4 --max-turns 200
node --prof-process isolate-*.log
```

Identify the specific hot-path change causing the regression.

### 3. Apply targeted fix

Based on profiling evidence, apply a targeted fix only if the bounded narrowing still shows a real residual regression on current `HEAD`:
- Narrow hot-path shapes
- Move cold-path work out of hot paths
- Avoid V8 hidden class deoptimization patterns

### 4. Re-benchmark

Verify the live current `HEAD` result against the same-environment `14a33c29` baseline before keeping this ticket open for a code fix.

## Files to Touch

- No engine source files were changed
- `campaigns/fitl-perf-optimization/run.log.runner.*` (modify — benchmark output)
- `campaigns/fitl-perf-optimization/run.log.gate` (modify — benchmark output)

## Out of Scope

- Reverting Spec 128 draft-state changes
- Reverting the already-fixed fallback-threading regression (ticket 001)
- Broad Spec 130 redesign — only targeted fixes for identified regressions
- New feature work or architectural changes beyond regression recovery

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine test` — all existing tests pass after any fixes
2. Benchmark shows recovery to within ~2-3% of `14a33c29` baseline
3. Existing suite: `pnpm turbo test`

### Invariants

1. **Foundation 8 (Determinism)**: identical seeds produce identical game traces
2. **Foundation 14 (No Backwards Compatibility)**: no compatibility shims for any removed optimization
3. **Foundation 15 (Architectural Completeness)**: fixes address profiling-identified root causes, not symptoms
4. **Foundation 16 (Testing as Proof)**: every fix validated by benchmark evidence

## Test Plan

### New/Modified Tests

1. No new tests — this ticket closed on benchmark evidence without a code change.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
4. `node campaigns/fitl-perf-optimization/run-benchmark.mjs --seeds 3 --players 4 --max-turns 200`
5. `bash campaigns/fitl-perf-optimization/harness.sh`

## Outcome

**Completed**: 2026-04-14

- Ran the ticket-owned bounded Spec 130 harness sweep in isolated temp worktrees for `700bc128`, `752d35dc`, `08c1f2a3`, `5713399c`, and `fb2acad4`, then reran current `HEAD` plus the clean `14a33c29` baseline in the same environment.
- Same-environment harness medians:
  - `14a33c29`: `14435.91ms`
  - `700bc128`: `14574.75ms`
  - `752d35dc`: `14636.97ms`
  - `08c1f2a3`: `13897.08ms`
  - `5713399c`: `14374.40ms`
  - `fb2acad4`: `14341.11ms`
  - current `HEAD` (`48a04c41`): `14571.49ms`
- Those reruns show no residual Spec 130 regression requiring a code fix. The final Spec 130 commit (`fb2acad4`) is slightly faster than the same-environment baseline, and current `HEAD` is only `+0.94%` slower than that baseline.
- Reran the repository-owned campaign harness on current `HEAD` to update the authoritative logs in this checkout. That repo-owned rerun recorded `combined_duration_ms=14202.54`, which is `+0.80%` versus the ticket's recorded historical baseline `14090.38ms`, with `games_completed=3`, `errors=0`, `total_moves=600`, and deterministic `state_hash` fingerprint `dbca86daa0157586`.
- Because the live reruns satisfy the ticket's recovery threshold, this ticket closes without profiling deeper or applying any engine changes.

### Boundary Notes

- Semantic correction: the archived `131POLFALREG-002` failure result was not reproducible under the same-environment reruns used here, so it was treated as historical evidence rather than as a blocking live verdict.
- No engine, schema, or generated artifact files changed in this ticket. The owned repo artifacts are the refreshed campaign logs only.
- No follow-up Spec 130 fix ticket is required from this bounded narrowing pass.

### Verification Run

1. `bash campaigns/fitl-perf-optimization/harness.sh` in isolated worktrees for `700bc128`, `752d35dc`, `08c1f2a3`, `5713399c`, `fb2acad4`, current `HEAD`, and `14a33c29`
2. `bash campaigns/fitl-perf-optimization/harness.sh`
3. `bash campaigns/fitl-perf-optimization/checks.sh`
