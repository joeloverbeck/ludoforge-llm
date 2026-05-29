# 202FITLUSCOMP-006: P4 — US profile-quality witness suite (§7)

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Large
**Engine Changes**: None
**Deps**: `archive/tickets/202FITLUSCOMP-005.md`

## Problem

The completed `us-baseline` doctrine needs profile-quality witnesses proving it meets the `reports/fitl-competent-agent-ai.md` §1 competence requirements one-to-one. Spec 202 §7 specifies 10 scenario witnesses + 1 architectural-invariant binding check. The spec bundles these as a single P4 deliverable (one reviewable test-authoring unit), and P4 is also where the §4.3 thresholds (`totalSupport < 30`, `availableUsTroops < 4`, `aid < 15`) are calibrated against the four-profile convergence canary.

## Assumption Reassessment (2026-05-29)

1. Witness home is `packages/engine/test/policy-profile-quality/` (verified — existing US witnesses live there). None of the 11 proposed filenames currently exist (no collision).
2. Per `.claude/rules/testing.md`, every test file declares a `// @test-class:` marker: scenario/seed-specific witnesses are `convergence-witness`; `us-templates-bind-shared-modules` is `architectural-invariant`.
3. `us-airlift-train-not-enabled.test.ts` is a new witness asserting the `us.airLiftTrain` exclusion; the existing `us-advise-airlift-force-multiplier.test.ts:26,41` also asserts it as a side-condition — if redundant, fold into the existing witness rather than shipping both.

## Architecture Check

1. Profile-quality witnesses live in `policy-profile-quality/` (not `determinism/`) per the FOUNDATIONS appendix — they emit `POLICY_PROFILE_QUALITY_REGRESSION` warnings, not blocking determinism failures. This preserves the determinism-proof vs. quality-witness separation (Foundation 16).
2. Architectural properties (binding completeness) are proven by an automated `architectural-invariant` test, not asserted (Foundation 16).
3. No engine change; witnesses exercise the authored profile through the standard agent protocol (Foundation 5).

## What to Change

### 1. Author 10 scenario witnesses (convergence-witness)

`us-immediate-win-by-support`, `us-blocks-vc-near-win`, `us-blocks-nva-near-win`, `us-train-pacify-high-pop-support`, `us-train-advise-beats-plain-train`, `us-sweep-airstrike-prefers-zero-pop-or-trail`, `us-airlift-assault-no-control-abandonment`, `us-patrol-protects-high-econ-loc`, `us-avoid-arvn-kingmaking`, `us-airlift-train-not-enabled` — each `.test.ts` carrying `// @test-class: convergence-witness`.

### 2. Author 1 architectural-invariant witness

`us-templates-bind-shared-modules.test.ts` (`// @test-class: architectural-invariant`) — verifies `us-baseline` binds `shared.immediateWin`, `shared.blockCurrentLeader`, `shared.nearCoupConcreteSwing`, `shared.eventDirectSwing`.

### 3. Calibrate §4.3 thresholds

Tune `totalSupport`/`availableUsTroops`/`aid` thresholds against the four-profile convergence canary; update the values in `92-agents.md`.

## Files to Touch

- `packages/engine/test/policy-profile-quality/us-immediate-win-by-support.test.ts` (new)
- `packages/engine/test/policy-profile-quality/us-blocks-vc-near-win.test.ts` (new)
- `packages/engine/test/policy-profile-quality/us-blocks-nva-near-win.test.ts` (new)
- `packages/engine/test/policy-profile-quality/us-train-pacify-high-pop-support.test.ts` (new)
- `packages/engine/test/policy-profile-quality/us-train-advise-beats-plain-train.test.ts` (new)
- `packages/engine/test/policy-profile-quality/us-sweep-airstrike-prefers-zero-pop-or-trail.test.ts` (new)
- `packages/engine/test/policy-profile-quality/us-airlift-assault-no-control-abandonment.test.ts` (new)
- `packages/engine/test/policy-profile-quality/us-patrol-protects-high-econ-loc.test.ts` (new)
- `packages/engine/test/policy-profile-quality/us-avoid-arvn-kingmaking.test.ts` (new)
- `packages/engine/test/policy-profile-quality/us-airlift-train-not-enabled.test.ts` (new — or folded into the existing witness per §2 reassessment)
- `packages/engine/test/policy-profile-quality/us-templates-bind-shared-modules.test.ts` (new)
- `data/games/fire-in-the-lake/92-agents.md` (modify — threshold calibration only)

## Out of Scope

- Authoring/binding any doctrine construct (done in 002–005); only threshold values may change here.
- Replay-identity reattestation against the full canary set (ticket 007).

## Acceptance Criteria

### Tests That Must Pass

1. All 10 scenario witnesses pass; the architectural-invariant binding witness passes.
2. Every new test file declares exactly one `// @test-class:` marker.
3. `pnpm turbo build` byte-identical after calibration; existing US witnesses still pass.

### Invariants

1. Profile-quality witnesses live only under `policy-profile-quality/`, never `determinism/` (Foundation 16 appendix).
2. Calibration changes thresholds only — no construct shape changes.

## Test Plan

### New/Modified Tests

1. The 11 witnesses above — each rationale is its mapped §1 competence requirement (per Spec 202 §7).

### Commands

1. `pnpm -F @ludoforge/engine build && node --test 'dist/test/policy-profile-quality/us-*.test.js'`
2. `pnpm turbo build && pnpm turbo test`
