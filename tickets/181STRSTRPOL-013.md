# 181STRSTRPOL-013: Phase 0 follow-up — Reduce ARVN probe overhead below soft budget

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — probe harness, FITL policy-quality probe path, or targeted runner helpers as evidence dictates
**Deps**: `archive/tickets/181STRSTRPOL-005.md`

## Problem

`archive/tickets/181STRSTRPOL-005.md` integrated the Phase 0 probe budget gate, but the final focused 2026-05-18 rerun measured `arvn-action-distribution-not-dominated` at 797.43 ms per inspected decision. That is below the 10× hard-fail threshold and is therefore reported as `POLICY_PROFILE_QUALITY_REGRESSION`, but it misses Spec 181's intended 200 ms per-probe feedback-loop target. This ticket owns the non-overlapping performance reduction work so the budget signal becomes green instead of only reported.

## Assumption Reassessment (2026-05-18)

1. The budget gate now exists in `packages/engine/test/policy-profile-quality/probes/probe-budget.test.ts` and already reports the ARVN soft overrun deterministically through the `test:policy-profile-quality` lane.
2. The constructibility architectural probe passes the hard gate under the bounded run used by `architectural.probes.test.ts`; the current residual is specific to the ARVN distribution probe path.
3. Foundation #15 requires a root-cause performance fix rather than relaxing the budget threshold. Foundation #16 requires the fix to be proven by the budget gate, not by a one-off timing note.

## Architecture Check

1. Keep the distinction from `docs/FOUNDATIONS.md` Appendix: the ARVN overhead miss is a profile-quality regression signal unless the fix reveals an architectural-invariant bug.
2. Preserve Foundation #8 determinism. Any caching, sampling, replay-prefix shortening, or aggregation optimization must keep same probe definition + same engine + same seed producing the same assertion outcomes.
3. Preserve Foundation #9 auditability. If the runner stops early or reuses intermediate state, the result must still expose how many decisions were inspected and why the assertion window is satisfied.

## What to Change

### 1. Diagnose the ARVN probe cost

Measure where the ARVN distribution probe spends time: policy scoring, preview evaluation, repeated game loading/runtime creation, published decision application, assertion aggregation, or trace production. Keep the diagnosis bounded to the Phase 0 probe harness and ARVN distribution probe path.

### 2. Reduce the overhead without weakening the assertion

Apply the smallest root-cause fix that keeps the property assertion equivalent. Valid directions include reusing immutable loaded fixture/runtime setup, avoiding unnecessary trace or constructibility work, stopping exactly when `windowMinDecisions` is satisfied, or adding a deterministic replay prefix only if it still inspects the same intended main-phase ARVN decision window.

### 3. Prove the budget is green

Rerun the focused budget gate and record the final ARVN `durationPerDecisionMs`. The target is `≤ 200 ms` for `arvn-action-distribution-not-dominated` on the same command shape used by ticket 005.

## Files to Touch

- `packages/engine/test/policy-profile-quality/probes/probe-runner.ts` (modify if runner overhead is the root cause)
- `packages/engine/test/policy-profile-quality/probes/probe-budget.test.ts` (modify only if measurement/reporting needs a truthful field)
- `packages/engine/test/policy-profile-quality/probes/fire-in-the-lake/arvn-action-distribution.probe.ts` (modify only if the probe can be made equivalent with a cheaper deterministic binding)
- `packages/engine/test/policy-profile-quality/probes/README.md` (modify if the optimization changes author-facing budget guidance)

## Out of Scope

- Relaxing the 200 ms soft budget.
- Converting ARVN profile-quality overrun into an architectural-invariant hard gate.
- Phase 1 selector implementation or ARVN selector migration.
- Changing the ARVN distribution thresholds unless live evidence proves the original property assertion itself is wrong; use 1-3-1 before changing that contract.

## Acceptance Criteria

### Tests That Must Pass

1. `probe-budget.test.ts` reports `arvn-action-distribution-not-dominated` at `durationPerDecisionMs ≤ 200` without `POLICY_PROFILE_QUALITY_REGRESSION`.
2. `arvn-action-distribution-not-dominated` still passes its action-family distribution and `selectedNotByReason` assertions.
3. Existing focused probe runner tests still pass.

### Invariants

1. Probe assertion semantics are not weakened to meet the budget.
2. Probe results remain deterministic for the same seed/profile/state binding.
3. Any optimization preserves Foundation #9 traceability of the inspected decision window.

## Test Plan

### New/Modified Tests

1. Existing `packages/engine/test/policy-profile-quality/probes/probe-budget.test.ts` — final budget witness.
2. Existing `packages/engine/test/policy-profile-quality/probes/probe-runner.test.ts` — runner regression coverage if runner code changes.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine exec node --test dist/test/policy-profile-quality/probes/probe-budget.test.js dist/test/policy-profile-quality/probes/fire-in-the-lake.probes.test.js`
3. `pnpm -F @ludoforge/engine exec node --test dist/test/policy-profile-quality/probes/probe-runner.test.js`
