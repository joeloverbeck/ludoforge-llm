# 210FITLCOMP-004: Promote shared Monsoon-paired fixtures (×4)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — test-only
**Deps**: `tickets/210FITLCOMP-001.md`

## Problem

The `shared-monsoon-awareness-{us,arvn,nva,vc}.test.ts` witnesses assert structurally. Spec 210 §2(4) requires a **paired** executed-outcome fixture: the same board with Monsoon false/true, asserting Sweep/March-style setup is preferred when legal, and a competent legal fallback is selected under Monsoon (not merely "not Sweep/March").

## Assumption Reassessment (2026-06-03)

1. The four fixtures exist, tagged `architectural-invariant`. Monsoon state is observable via the `monsoonNow` `stateFeature` (derived from `schedule.distance.toBoundary.coupEntry.cards`). Confirmed.
2. Monsoon blocks certain free-operation grants (`allowDuringMonsoon`) — the fallback branch must assert a *positive* competent legal choice, per spec §2(4). The fallback must be a real selected move, not an absence.
3. Promotion pattern + primitives established by 001.

## Architecture Check

1. In-place promotion per 001 (FOUNDATIONS #14).
2. The paired (false/true) construction proves a behavioral contrast, not a single-state snapshot — strengthens the competence claim (FOUNDATIONS #16).
3. No engine changes (FOUNDATIONS #1).

## What to Change

### 1. Promote the four Monsoon fixtures as paired runs

For each `shared-monsoon-awareness-{us,arvn,nva,vc}.test.ts`: build one curated board, run it twice (Monsoon false then true) through the live frontier; in the false run prove Sweep/March setup is selected (`assertPlanTraceChain` + `assertOutcomeDeltas`); in the true run prove a competent legal fallback is selected (positive outcome delta, not just absence of Sweep/March), with the Monsoon-illegal Sweep/March as the adversarial root absent from the frontier or rejected; `assertReplayIdentity` for both runs; `assertPreviewStatuses`. Update markers to `@proof-tier: executed-outcome` + `@proof-tier: adversarial`.

## Files to Touch

- `packages/engine/test/policy-profile-quality/shared-monsoon-awareness-us.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/shared-monsoon-awareness-arvn.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/shared-monsoon-awareness-nva.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/shared-monsoon-awareness-vc.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/shared-competence-helpers.ts` (read — created by 001)

## Out of Scope

- Other shared intents and faction fixtures.
- `92-agents.md` features — ticket 010.
- Adding shared primitives to `shared-competence-helpers.ts` (keep curated states inline to avoid collision with 002/003/005).

## Acceptance Criteria

### Tests That Must Pass

1. Each fixture, Monsoon=false, selects and executes the Sweep/March setup with a proven outcome delta.
2. Each fixture, Monsoon=true, selects and executes a competent legal fallback with a positive outcome delta (not merely the absence of Sweep/March).
3. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/shared-monsoon-awareness-us.test.js`

### Invariants

1. `@proof-tier: executed-outcome` + `adversarial`; original path/`describe` preserved (FOUNDATIONS #14).
2. Both paired runs replay identically (FOUNDATIONS #8).
3. Decisive preview refs `ready` or explicitly traced (FOUNDATIONS #20).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/policy-profile-quality/shared-monsoon-awareness-{us,arvn,nva,vc}.test.ts` — promoted to paired executed-outcome fixtures.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/shared-monsoon-awareness-us.test.js packages/engine/dist/test/policy-profile-quality/shared-monsoon-awareness-arvn.test.js packages/engine/dist/test/policy-profile-quality/shared-monsoon-awareness-nva.test.js packages/engine/dist/test/policy-profile-quality/shared-monsoon-awareness-vc.test.js`
2. `pnpm turbo lint typecheck && pnpm turbo test`
