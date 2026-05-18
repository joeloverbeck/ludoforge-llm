# 181STRSTRPOL-003: Phase 0 — ARVN action-distribution probe (75%-Govern witness)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/test/policy-profile-quality/probes/fire-in-the-lake/` only (no engine src changes)
**Deps**: `archive/tickets/181STRSTRPOL-002.md`

## Problem

`reports/fitl-arvn-preview-opponent-margin-uniform-2026-05-17.md` documented ARVN selecting Govern 75% of decisions across 15 seeds (159 main-phase decisions), with NVA projected margin 100% uniform and VC projected margin 95.5% uniform. The discovery was an ad-hoc aggregation script. This ticket encodes that finding as a Phase 0 probe so the regression is caught deterministically in <200 ms instead of via a 15-seed tournament + manual trace review. Spec 181 §4.1 specifies the exact probe shape; spec §8 Phase 0 acceptance (b) requires this probe to ship.

## Assumption Reassessment (2026-05-18)

1. The `arvn-evolved` profile lives at `data/games/fire-in-the-lake/92-agents.md` (or equivalent — confirm path during implementation). Verified by Step 2 verification this session.
2. The 15-seed corpus referenced by the May-17 report uses seeds `1000..1014` (or equivalent — confirm against the trigger report's verbatim seed list during implementation). Adjust if the report names a different range.
3. The `'main'` phase id used in `decisionFilter` matches the canonical FITL phase id; confirm via `data/games/fire-in-the-lake/<phase>.md` and adjust if the canonical phase id differs.
4. Assertion kinds `actionFamilyDistributionBelow` and `selectedNotByReason` (ticket 002) are live and tested.

## Architecture Check

1. The probe is data — it lives under `packages/engine/test/policy-profile-quality/probes/fire-in-the-lake/` because it is game-specific. The runner that drives it (001) is game-agnostic (Foundation #1).
2. Threshold encoded as a property assertion (`actionFamilyDistributionBelow threshold: 0.60`) rather than an exact-action witness (`must pick Train at seed X, ply Y`). Per Spec 181 §4 / proposal §9.4, property assertions resist overfitting and remain meaningful across profile evolutions that legitimately shift the action mix.
3. Severity `profileQuality`: failure emits `POLICY_PROFILE_QUALITY_REGRESSION` (matches Appendix). This is a profile-maintainer signal, not an engine determinism failure — keeps the existing separation per Spec 162 / Spec 136 / Spec 139.

## What to Change

### 1. Probe file

Create `packages/engine/test/policy-profile-quality/probes/fire-in-the-lake/arvn-action-distribution.probe.ts`:

```ts
import { defineProbe } from '../../define-probe';

export const arvnActionDistributionNotDominated = defineProbe({
  id: 'arvn-action-distribution-not-dominated',
  game: 'fire-in-the-lake',
  profile: 'arvn-evolved',
  seat: 'ARVN',
  stateBinding: {
    scenario: 'fitl-default',                          // confirm canonical scenario id
    seedRange: { start: 1000, end: 1014 },              // verify against trigger report
    decisionFilter: { phase: 'main' },                  // verify canonical phase id
  },
  decisionBinding: {
    contextKind: 'actionSelection',
    occurrence: 'every',
  },
  assertions: [
    {
      kind: 'actionFamilyDistributionBelow',
      family: 'any',
      threshold: 0.60,                                  // 75% Govern observed; gate at 60%
      windowMinDecisions: 100,                          // 159 observed; require ≥ 100
    },
    {
      kind: 'selectedNotByReason',
      reason: 'tiebreakAfterPreviewNoSignal',
      maxRate: 0.10,                                    // tighten if baseline rate is < 10%
    },
  ],
  severity: 'profileQuality',
  tags: ['arvn-evolved', 'action-distribution', 'spec-181-phase-0'],
});
```

### 2. Per-game probe collector

Ensure `packages/engine/test/policy-profile-quality/probes/fire-in-the-lake.probes.test.ts` (the per-game wrapper introduced in 001) discovers `*.probe.ts` files under `probes/fire-in-the-lake/` and iterates them through `runProbe`. If the wrapper from 001 already does this generically, no change here.

### 3. Calibration

After running the probe once against the current `arvn-evolved` profile, document the observed baseline distribution and `tiebreakAfterPreviewNoSignal` rate in a comment in the probe file. If the May-17 report's specific seed range produces a dominant rate < 60% in current code (e.g., post-180 changes shifted distribution), reset the threshold to `baseline + 5%` and document the calibration date.

## Files to Touch

- `packages/engine/test/policy-profile-quality/probes/fire-in-the-lake/arvn-action-distribution.probe.ts` (new)
- `packages/engine/test/policy-profile-quality/probes/fire-in-the-lake.probes.test.ts` (modify — only if 001's wrapper needs explicit probe-file registration; otherwise unchanged)

## Out of Scope

- Architectural-invariant probes (004 owns these).
- Cookbook entry for the assertion kinds (covered by 002).
- Profile mutation to fix the distribution (012 owns the ARVN migration that should improve the distribution after selectors land).

## Acceptance Criteria

### Tests That Must Pass

1. `fire-in-the-lake.probes.test.ts` — probe runs to completion against current `arvn-evolved` and produces a deterministic outcome.
2. Outcome is `pass` (if profile has improved post-180) or emits `POLICY_PROFILE_QUALITY_REGRESSION` (if 75%-Govern behavior persists) — either is acceptable; the gate is that the harness produces a deterministic, named signal rather than a tournament-tail squint.
3. Per-probe overhead < 200 ms (validated by 005's budget gate; this ticket just authors the probe).
4. Existing suite: `pnpm turbo test`

### Invariants

1. Probe data file references only game-data-authored identifiers (profile id, seat id, scenario id, phase id, action tags) — no engine src changes (Foundation #1, #2).
2. Property-form assertions only — no `must pick Train at seed 1003` exact-action witnesses (per spec §4 anti-overfit guidance).
3. Severity is `profileQuality` — does NOT block CI even when failing.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/policy-profile-quality/probes/fire-in-the-lake/arvn-action-distribution.probe.ts` — single probe file; exercised by the per-game wrapper test.

### Commands

1. `pnpm -F @ludoforge/engine test -- fire-in-the-lake.probes`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
