# 210FITLCOMP-003: Promote shared near-Coup concrete-swing fixtures (×4)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — test-only
**Deps**: `tickets/210FITLCOMP-001.md`

## Problem

The `shared-near-coup-concrete-swing-{us,arvn,nva,vc}.test.ts` witnesses assert structurally via `assertSharedModuleWitness(file, faction, 'concreteCoupSwing')`. Spec 210 §2(3) requires executed-outcome proof that, with a Coup imminent, the agent selects a concrete swing that changes the Coup-scored property over a tempting speculative setup.

## Assumption Reassessment (2026-06-03)

1. The four fixtures exist, tagged `architectural-invariant`, binding `concreteCoupSwing` (scoreGroupId `concreteCoupSwing`). Confirmed.
2. Coup proximity is observable via `distanceToCoup` / `schedule.distance.toBoundary.coupEntry.cards` (used in `92-agents.md` `stateFeatures`). Confirmed.
3. Promotion pattern + primitives established by 001.

## Architecture Check

1. In-place promotion per 001 (FOUNDATIONS #14).
2. No engine changes (FOUNDATIONS #1).
3. `assertOutcomeDeltas` proves the Coup-scored property changed — behavioral proof beyond the structural witness (FOUNDATIONS #16).

## What to Change

### 1. Promote the four near-Coup fixtures

For each `shared-near-coup-concrete-swing-{us,arvn,nva,vc}.test.ts`: build a Coup-imminent curated state with a concrete swing available and a tempting speculative setup; run the live frontier; `assertPlanTraceChain` (binds `<faction>.concreteCoupSwing`); `assertAdversarialAlternativeAvoided` (speculative setup is the trap); `assertOutcomeDeltas` proving the selected plan changes the Coup-scored property; `assertPreviewStatuses`; `assertReplayIdentity`. Update markers to `@proof-tier: executed-outcome` + `@proof-tier: adversarial`.

## Files to Touch

- `packages/engine/test/policy-profile-quality/shared-near-coup-concrete-swing-us.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/shared-near-coup-concrete-swing-arvn.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/shared-near-coup-concrete-swing-nva.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/shared-near-coup-concrete-swing-vc.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/shared-competence-helpers.ts` (read — created by 001)

## Out of Scope

- Other shared intents and faction fixtures.
- `92-agents.md` features — ticket 010.
- Adding shared primitives to `shared-competence-helpers.ts` (keep curated states inline to avoid collision with 002/004/005).

## Acceptance Criteria

### Tests That Must Pass

1. Each fixture executes a turn near Coup and proves the selected concrete swing changes the Coup-scored property.
2. Each fixture proves the speculative setup is present and rejected.
3. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/shared-near-coup-concrete-swing-us.test.js`

### Invariants

1. `@proof-tier: executed-outcome` + `adversarial`; original path/`describe` preserved (FOUNDATIONS #14).
2. Decisive preview refs `ready` or explicitly traced (FOUNDATIONS #20).
3. Replay identity holds (FOUNDATIONS #8).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/policy-profile-quality/shared-near-coup-concrete-swing-{us,arvn,nva,vc}.test.ts` — promoted.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/shared-near-coup-concrete-swing-us.test.js packages/engine/dist/test/policy-profile-quality/shared-near-coup-concrete-swing-arvn.test.js packages/engine/dist/test/policy-profile-quality/shared-near-coup-concrete-swing-nva.test.js packages/engine/dist/test/policy-profile-quality/shared-near-coup-concrete-swing-vc.test.js`
2. `pnpm turbo lint typecheck && pnpm turbo test`
