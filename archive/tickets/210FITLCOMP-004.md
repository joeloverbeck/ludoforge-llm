# 210FITLCOMP-004: Promote shared Monsoon-paired fixtures (×4)

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — GameSpecDoc data + tests
**Deps**: `archive/tickets/210FITLCOMP-001.md`

## Problem

The `shared-monsoon-awareness-{us,arvn,nva,vc}.test.ts` witnesses assert structurally. Spec 210 §2(4) requires a **paired** executed-outcome fixture: the same board with Monsoon false/true, asserting Sweep/March-style setup is preferred when legal, and a competent legal fallback is selected under Monsoon (not merely "not Sweep/March").

## Assumption Reassessment (2026-06-03)

1. The four fixtures exist, tagged `architectural-invariant`. Monsoon state is observable via the `monsoonNow` `stateFeature` (derived from `schedule.distance.toBoundary.coupEntry.cards`). Confirmed.
2. Monsoon blocks certain free-operation grants (`allowDuringMonsoon`) — the fallback branch must assert a *positive* competent legal choice, per spec §2(4). The fallback must be a real selected move, not an absence.
3. Live proof exposed four GameSpecDoc gaps that made the paired contrast impossible or incomplete: `monsoonNow` treated a two-card Coup distance as Monsoon, VC `marchSpread` was not suppressed by the Monsoon doctrine, US build-support did not enable `us.sweepAirStrike`, and ARVN selective violence was lower-priority than Train. Per Foundations #1/#2, these are profile-data fixes in `92-agents.md`, not engine changes.
4. Promotion pattern + primitives established by 001.

## Architecture Check

1. In-place promotion per 001 (FOUNDATIONS #14).
2. The paired (false/true) construction proves a behavioral contrast, not a single-state snapshot — strengthens the competence claim (FOUNDATIONS #16).
3. Rule-authoritative profile tuning stays in GameSpecDoc YAML (FOUNDATIONS #2); no engine changes (FOUNDATIONS #1).

## What to Change

### 1. Promote the four Monsoon fixtures as paired runs

For each `shared-monsoon-awareness-{us,arvn,nva,vc}.test.ts`: build one curated board, run it twice (Monsoon false then true) through the live frontier; in the false run prove Sweep/March setup is selected (`assertPlanTraceChain` + `assertOutcomeDeltas`); in the true run prove a competent legal fallback is selected (positive outcome delta, not just absence of Sweep/March), with the Monsoon-illegal Sweep/March as the adversarial root absent from the frontier or rejected; `assertReplayIdentity` for both runs; `assertPreviewStatuses`. Update markers to `@proof-tier: executed-outcome` + `@proof-tier: adversarial`.

## Files to Touch

- `packages/engine/test/policy-profile-quality/shared-monsoon-awareness-us.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/shared-monsoon-awareness-arvn.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/shared-monsoon-awareness-nva.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/shared-monsoon-awareness-vc.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/shared-competence-helpers.ts` (read — created by 001)
- `packages/engine/test/policy-profile-quality/shared-doctrine-witness-helpers.ts` (modify expected Monsoon suppression list)
- `data/games/fire-in-the-lake/92-agents.md` (modify profile data only, no new features)
- Generated artifacts and drifted references touched as needed after GameSpecDoc changes.

## Out of Scope

- Other shared intents and faction fixtures.
- New `92-agents.md` features — ticket 010. This ticket may still tune existing profile/data entries when live paired proof shows the current encoding contradicts Spec 210.
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

## Outcome

Completed: 2026-06-04

Implemented the approved option 1 boundary: the four shared Monsoon witnesses now run paired clear/Monsoon live-frontier fixtures with executed outcomes, replay identity, preview-status checks, selected-template/root assertions, and Monsoon-suppressed template assertions. The shared helper gained a reusable `assertFitlMonsoonPairCase` path plus a non-Coup lookahead helper for the clear branch.

GameSpecDoc profile data was corrected in `data/games/fire-in-the-lake/92-agents.md`: `monsoonNow` now activates only on immediately visible Coup lookahead, VC `marchSpread` is suppressed by `shared.monsoonOperationalRestriction`, US build-support enables `us.sweepAirStrike`, and ARVN selective violence has the same priority tier as Train. These were not new feature additions; they were existing-profile corrections required for the paired proof and aligned with Foundations #1/#2.

Deviations from the original ticket: the original "test-only" wording was too narrow. The ticket was updated before archival to record the user-approved Foundations-aligned option 1 and the necessary GameSpecDoc data corrections.

Generated artifact provenance:
- artifact path(s): `packages/engine/schemas/GameDef.schema.json`, `packages/engine/test/fixtures/trace/policy-preview-inner-fitl-canary.json`
- generation command: `pnpm -F @ludoforge/engine run schema:artifacts`; golden refreshed from the retained capture path in `packages/engine/test/integration/policy-preview-inner-fitl-canary-golden.test.ts`
- canonical inputs: current GameSpecDoc/profile data, compiled schema contracts, FITL canary seed/profile fixture
- expected refresh reason: intentional profile trajectory/schema drift after `92-agents.md` Monsoon/profile corrections
- generator durability: retained generator: `packages/engine/scripts/schema-artifacts.mjs`; retained canary capture: `packages/engine/test/integration/policy-preview-inner-fitl-canary-golden.test.ts`
- hygiene proof: `git diff --check` passed; `pnpm turbo test` passed and includes `schema:artifacts:check`

Verification:
- `pnpm -F @ludoforge/engine build` passed.
- `node --test packages/engine/dist/test/policy-profile-quality/shared-monsoon-awareness-us.test.js packages/engine/dist/test/policy-profile-quality/shared-monsoon-awareness-arvn.test.js packages/engine/dist/test/policy-profile-quality/shared-monsoon-awareness-nva.test.js packages/engine/dist/test/policy-profile-quality/shared-monsoon-awareness-vc.test.js` passed 4/4 after final helper cleanup.
- `pnpm turbo lint typecheck` passed.
- `pnpm turbo test` passed: 5/5 Turbo tasks successful; engine default lane summary `191/191 files passed`.
- `git diff --check` passed.
