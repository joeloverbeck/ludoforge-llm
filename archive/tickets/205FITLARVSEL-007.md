# 205FITLARVSEL-007: Prerequisite cleanup for selector value-one invariant

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — YAML game-data only
**Deps**: `archive/tickets/205FITLARVSEL-002.md`, `archive/tickets/205FITLARVSEL-004.md`

## Problem

205FITLARVSEL-005 must add a faction-agnostic invariant that rejects standalone selector `quality.components[].value: 1` scoring constants across every `data/games/<game>/*-agents.md` file. The post-002/004 codebase still has existing selector-library constants outside the five ARVN selectors cleaned by 002, so 005 cannot land truthfully yet.

Structural inventory on 2026-06-01 found these blocking components in `data/games/fire-in-the-lake/92-agents.md`:

1. `arvn.transportDestination.threatenedReinforcementRoute` (`weight: 0`)
2. `us.sweepExposureSpace.exposeBeforeAirStrike`
3. `us.adviseTargetSpace.indigenousForceMultiplier`
4. `us.airLiftOrigin.overcommittedUSPresence`
5. `us.airLiftDestination.decisiveConcentration`
6. `nva.infiltrateTargetSpace.vcBaseTakeover`
7. `nva.terrorSupportDenialSpace.rallyPreparation`
8. `nva.terrorSupportReductionTarget.rallyPreparation`
9. `vc.rallyBaseOrUndergroundSpace.undergroundReset`
10. `vc.marchPoliticalCellSpace.undergroundCellSpread`
11. `vc.subvertArvnControlSpace.controlBreak`
12. `vc.ambushSurgicalTargetSpace.coinPieceThreat`
13. `vc.locAmbushPlatform.adjacentPoliticalThreat`

## Assumption Reassessment (2026-06-01)

1. `tickets/205FITLARVSEL-005.md` explicitly excludes modifying selector bodies, so this cleanup is split into a prerequisite owner instead of widening 005.
2. The inventory is structural: it parses the YAML block and walks `agents.library.selectors.*.quality.components[]`; comments and unrelated `value: 1` occurrences are not counted.
3. `data/games/texas-holdem/92-agents.md`, `data/games/generic-control/92-agents.md`, and `data/games/fire-in-the-lake/94-diagnostic-agents.md` have no selector-library scalar `value: 1` components in the same structural scan.
4. The cleanup should remain authored game data. No compiler/runtime enforcement belongs here; 005 owns the forward-protection test, and 006 owns final re-attestation.

## Architecture Check

1. Replaces placeholder constants with item-local or route-local selector expressions, preserving Foundation #15 by removing a known architectural shortcut rather than allowlisting it.
2. Keeps game-specific policy semantics in GameSpecDoc YAML and does not add engine-specific branches (Foundation #1).
3. Preserves selector IDs and removes no selectors, so downstream role-template references remain stable (Foundation #14).
4. Makes 005's faction-agnostic invariant meaningful: once this lands, a strict structural test can reject future placeholder constants without grandfathering existing rows.

## What to Change

### 1. Replace every current selector-library scalar `value: 1`

In `data/games/fire-in-the-lake/92-agents.md`, replace the 13 listed components with bounded selector expressions using existing generic constructs such as `zoneProp`, `lookup`, `zoneTokenAgg`, `tokenProp`, route-pair fields, projected margin refs, or existing state features.

The replacement values must be local to the selector item where practical. For the zero-weight `arvn.transportDestination.threatenedReinforcementRoute`, keep scoring behavior unchanged while avoiding a scalar placeholder.

### 2. Preserve existing selector boundaries

Do not rename selector IDs. Do not alter role-template references. Do not add guardrails or strategy modules.

### 3. Re-run the structural inventory

After edits, rerun a structural YAML inventory over every `data/games/*/*-agents.md` file and confirm no `agents.library.selectors.*.quality.components[].value === 1` entries remain.

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify) — replace current selector-library placeholder constants
- `tickets/205FITLARVSEL-005.md` (modify) — add dependency on this prerequisite cleanup
- `tickets/205FITLARVSEL-006.md` (modify) — add dependency on this prerequisite cleanup before final re-attestation
- `specs/205-fitl-arvn-selector-cleanup.md` (modify) — add this ticket to the series list and clarify the 005 prerequisite

## Out of Scope

- Adding the invariant test itself — owned by 205FITLARVSEL-005.
- Final regression re-attestation — owned by 205FITLARVSEL-006.
- Transport postState origin-control constraint — owned by 205FITLARVSEL-003.
- Compiler-level enforcement of the invariant.
- Renaming selectors or changing plan-template role references.

## Acceptance Criteria

### Tests That Must Pass

1. Structural inventory over all `data/games/*/*-agents.md` files reports zero selector-library components with scalar `value: 1`.
2. FITL production GameSpec compiles cleanly.
3. Focused policy-profile witnesses covering the touched faction areas pass.
4. `pnpm turbo build` passes.
5. `pnpm turbo lint && pnpm turbo typecheck` pass.

### Invariants

1. Selector IDs are unchanged.
2. No selector-library component in any game-data agents file has `value` equal to scalar `1`.
3. Foundation #1 — all game-specific scoring remains in YAML data, not engine code.

## Test Plan

### New/Modified Tests

1. None directly authored here. 205FITLARVSEL-005 owns the durable invariant test once this prerequisite cleanup is clean.

### Commands

1. Structural YAML inventory command over `data/games/*/*-agents.md`
2. `pnpm turbo build`
3. Focused policy-profile witness commands for the touched selectors
4. `pnpm turbo lint`
5. `pnpm turbo typecheck`

## Outcome

Completed on 2026-06-01.

Replaced all 13 live selector-library scalar `value: 1` components found by the structural inventory in `data/games/fire-in-the-lake/92-agents.md`. The replacements use local selector expressions where the selector item exposes enough context:

1. `arvn.transportDestination.threatenedReinforcementRoute` keeps zero-weight scoring behavior while using the route-destination authored-space expression.
2. US/NVA/VC zone selectors now use `zoneTokenAgg`, `adjacentTokenAgg`, and booleanized local token-count predicates instead of standalone constants.
3. `us.airLiftDestination.decisiveConcentration` uses existing `feature.projectedUsMargin`; the current route-pair item exposes the combined route key, not separate origin/destination keys, so a destination-only local decomposition is not available in this ticket's YAML-only scope.

Proof:

1. Structural inventory over `data/games/generic-control/92-agents.md`, `data/games/texas-holdem/92-agents.md`, `data/games/fire-in-the-lake/92-agents.md`, and `data/games/fire-in-the-lake/94-diagnostic-agents.md`: `selector value-one inventory clean across 4 files`.
2. `pnpm -F @ludoforge/engine build`
3. `node --test dist/test/integration/production-spec-strict-binding-regression.test.js dist/test/policy-profile-quality/us-sweep-airstrike-prefers-zero-pop-or-trail.test.js dist/test/policy-profile-quality/us-advise-airlift-force-multiplier.test.js dist/test/policy-profile-quality/us-airlift-assault-no-control-abandonment.test.js dist/test/policy-profile-quality/nva-march-infiltrate-steal-vc-base.test.js dist/test/policy-profile-quality/nva-vc-rival-suppresses-terror.test.js dist/test/policy-profile-quality/vc-march-spreads-underground.test.js dist/test/policy-profile-quality/vc-subvert-drops-arvn-patronage.test.js dist/test/policy-profile-quality/vc-attack-only-with-ambush.test.js`
4. `pnpm turbo build`
5. `pnpm turbo lint`
6. `pnpm turbo typecheck`
