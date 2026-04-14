# 131POLFALREG-003: Bounded Spec 130 follow-up narrowing (conditional)

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — TBD based on audit findings
**Deps**: `tickets/131POLFALREG-002.md`

## Problem

If the fallback-threading removal (ticket 001) does not fully recover the benchmark regression to within noise of the `14a33c29` baseline, residual slowdown from Spec 130 commits remains. This ticket performs a bounded, evidence-driven audit of Spec 130 commits (`700bc128` through `fb2acad4`) to isolate any additional regression sources.

**Gate condition**: Close this ticket without implementation if `tickets/131POLFALREG-002.md` profiling shows recovery to within ~2-3% of the `14a33c29` baseline (`14090.38ms`).

## Assumption Reassessment (2026-04-14)

1. Spec 130 commits span from `700bc128` (+5.08%) through `fb2acad4` (+6.22%), fluctuating around the slower plateau established by `971992fc` — confirmed from spec benchmark evidence table.
2. The benchmark harness and tooling exist and are functional — confirmed in reassessment.
3. The residual regression magnitude (if any) will be known from ticket 002's gate results before this ticket begins.

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

For each commit showing measurable regression, run V8 profiling:

```bash
node --prof campaigns/fitl-perf-optimization/run-benchmark.mjs --seeds 3 --players 4 --max-turns 200
node --prof-process isolate-*.log
```

Identify the specific hot-path change causing the regression.

### 3. Apply targeted fix

Based on profiling evidence, apply a targeted fix following the same principles as ticket 001:
- Narrow hot-path shapes
- Move cold-path work out of hot paths
- Avoid V8 hidden class deoptimization patterns

### 4. Re-benchmark

Verify the fix recovers the residual regression to within noise of the `14a33c29` baseline.

## Files to Touch

- TBD — depends on which Spec 130 commit(s) are identified as regression sources
- `campaigns/fitl-perf-optimization/run.log.runner.*` (modify — benchmark output)

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

1. TBD — depends on the specific changes identified by profiling. Any modified function gets updated tests.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
4. `node campaigns/fitl-perf-optimization/run-benchmark.mjs --seeds 3 --players 4 --max-turns 200`
5. `bash campaigns/fitl-perf-optimization/harness.sh`
