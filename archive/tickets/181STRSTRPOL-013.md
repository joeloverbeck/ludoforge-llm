# 181STRSTRPOL-013: Phase 0 follow-up — Reduce ARVN probe overhead below soft budget

**Status**: COMPLETED
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
4. Approved boundary reset (2026-05-18): after making the probe runner honor `probe.seat`, the budget/probe path exposed `MICROTURN_CONSTRUCTIBILITY_INVARIANT: no simple actionSelection moves are currently bridgeable` while canonical/default non-target seats drive the environment. The user confirmed Option 1 after a `docs/FOUNDATIONS.md` reassessment: this ticket owns fixing that constructibility blocker before claiming the ARVN budget probe is complete, because Foundations #5, #15, #16, and #18 make the published frontier validity a prerequisite to a truthful probe witness.
5. Approved boundary reset (2026-05-18): after the constructibility fix, a seat-correct full-game probe still measured the ARVN window at ~1716 ms per inspected decision. The user confirmed Option 1 to use pinned replay/state windows for the same canonical ARVN main-phase decisions. The implementation uses serialized states captured from the public kernel/policy path, `maxMatchesPerSeed: 1`, and lightweight selected-reason metadata so the probe keeps the 100-decision action distribution and `selectedNotByReason` assertions without paying unrelated full-game drive or summary-trace costs.

## Architecture Check

1. Keep the distinction from `docs/FOUNDATIONS.md` Appendix: the ARVN overhead miss is a profile-quality regression signal unless the fix reveals an architectural-invariant bug.
2. Preserve Foundation #8 determinism. Any caching, sampling, replay-prefix shortening, or aggregation optimization must keep same probe definition + same engine + same seed producing the same assertion outcomes.
3. Preserve Foundation #9 auditability. If the runner stops early or reuses intermediate state, the result must still expose how many decisions were inspected and why the assertion window is satisfied.

## What to Change

### 1. Diagnose the ARVN probe cost

Measure where the ARVN distribution probe spends time: policy scoring, preview evaluation, repeated game loading/runtime creation, published decision application, assertion aggregation, or trace production. Keep the diagnosis bounded to the Phase 0 probe harness and ARVN distribution probe path.

### 2. Reduce the overhead without weakening the assertion

Apply the smallest root-cause fix that keeps the property assertion equivalent. Valid directions include reusing immutable loaded fixture/runtime setup, avoiding unnecessary trace or constructibility work, stopping exactly when `windowMinDecisions` is satisfied, or adding a deterministic replay prefix only if it still inspects the same intended main-phase ARVN decision window.

If the optimized runner surfaces a constructibility invariant failure before the ARVN assertion window completes, fix that canonical drive/published-frontier blocker in this ticket before the final budget proof. Do not replace it with a deterministic environment-driver shortcut unless a new user-approved boundary reset explicitly narrows the probe semantics.

### 3. Prove the budget is green

Rerun the focused budget gate and record the final ARVN `durationPerDecisionMs`. The target is `≤ 200 ms` for `arvn-action-distribution-not-dominated` on the same command shape used by ticket 005.

## Files to Touch

- `packages/engine/test/policy-profile-quality/probes/probe-runner.ts` (modify if runner overhead is the root cause)
- `packages/engine/test/policy-profile-quality/probes/probe-budget.test.ts` (modify only if measurement/reporting needs a truthful field)
- `packages/engine/test/policy-profile-quality/probes/fire-in-the-lake/arvn-action-distribution.probe.ts` (modify only if the probe can be made equivalent with a cheaper deterministic binding)
- `packages/engine/test/policy-profile-quality/probes/README.md` (modify if the optimization changes author-facing budget guidance)
- Kernel/action publication or policy-drive files (modify only if the seat-correct probe path proves the constructibility blocker is the root cause)
- `packages/engine/test/fixtures/policy-profile-quality/fitl-arvn-action-distribution-windows.json` (serialized canonical ARVN decision windows)
- `packages/engine/src/agents/*` and `packages/engine/src/kernel/types-core.ts` (lightweight selected-reason plumbing)

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
4. Any constructibility blocker exposed by the seat-correct probe run is fixed or otherwise classified with a user-approved boundary reset before terminal status.

### Invariants

1. Probe assertion semantics are not weakened to meet the budget.
2. Probe results remain deterministic for the same seed/profile/state binding.
3. Any optimization preserves Foundation #9 traceability of the inspected decision window.
4. Published action frontiers remain constructible; the probe runner may not hide a Foundation #18 violation behind a budget-only closeout.

## Test Plan

### New/Modified Tests

1. Existing `packages/engine/test/policy-profile-quality/probes/probe-budget.test.ts` — final budget witness.
2. Existing `packages/engine/test/policy-profile-quality/probes/probe-runner.test.ts` — runner regression coverage if runner code changes.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine exec node --test dist/test/policy-profile-quality/probes/probe-budget.test.js dist/test/policy-profile-quality/probes/fire-in-the-lake.probes.test.js`
3. `pnpm -F @ludoforge/engine exec node --test dist/test/policy-profile-quality/probes/probe-runner.test.js`

## Outcome

Completed on 2026-05-18. The ARVN probe now binds to 100 serialized canonical main-phase ARVN decision windows, contributes exactly one inspected decision per sample, and evaluates lightweight selected-reason metadata without default summary trace construction. The seat-correct constructibility blocker was fixed by making FITL `coupVictoryCheck` repeatable for the coup-victory seat pass and by stopping probe publication at terminal states.

Focused proof:

1. `pnpm -F @ludoforge/engine build` — passed.
2. `pnpm -F @ludoforge/engine exec node --test dist/test/policy-profile-quality/probes/probe-budget.test.js dist/test/policy-profile-quality/probes/fire-in-the-lake.probes.test.js dist/test/policy-profile-quality/probes/probe-runner.test.js` — passed, 14 tests; `arvn-action-distribution-not-dominated` budget duration was ~10004 ms for 100 inspected decisions (~100.04 ms/decision), with no `POLICY_PROFILE_QUALITY_REGRESSION`.
