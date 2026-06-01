# 204FITLVCCOM-007: P3 - Bind completed VC doctrine into vc-baseline

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None - YAML authoring in `data/games/fire-in-the-lake/92-agents.md`
**Deps**: `archive/tickets/204FITLVCCOM-004.md`, `tickets/204FITLVCCOM-005.md`, `tickets/204FITLVCCOM-006.md`

## Problem

Tickets 003-006 author the selectors, templates, strategy modules, postures, and guardrails required by Spec 204, but `vc-baseline.use` must explicitly bind the completed doctrine before the VC agent can use it. Until the profile lists the new templates, modules, and guardrail, the library additions compile but do not affect baseline play.

## Assumption Reassessment (2026-06-01)

1. `vc-baseline` is the active VC profile binding under `data/games/fire-in-the-lake/92-agents.md`.
2. Spec 204 §4.6 requires adding the new strategy modules, plan templates, and guardrail while preserving all existing shared and VC entries.
3. Tickets 005 and 006 must land first so this ticket can bind only fully authored artifacts.

## Architecture Check

1. Profile binding remains declarative GameSpecDoc data and keeps engine/runtime logic game-agnostic.
2. Activation is isolated in one ticket so any profile-quality drift is attributable to the binding step.
3. The binding appends concrete authored IDs and introduces no aliases or compatibility paths.

## What to Change

### 1. Update `vc-baseline.use.guardrails`

Add `vc.avoidTaxWhenSupportShiftIsTooCostly` while preserving:

- `dropPassWhenOtherMovesExist`
- `vc.avoidConventionalAttackWithoutAmbush`
- `vc.protectBasesFromNvaInfiltrate`
- `vc.avoidHighPopTaxWithoutPoliticalPlan`

### 2. Update `vc-baseline.use.strategyModules`

Add the modules from ticket 005:

- `vc.oppositionEngine`
- `vc.baseNetwork`
- `vc.subvertPatronage`
- `vc.agitationReadiness`
- `vc.nvaRivalRisk`

### 3. Update `vc-baseline.use.planTemplates`

Add the templates from ticket 004:

- `vc.rallyBaseNetwork`
- `vc.rallyTax`
- `vc.marchSpread`
- `vc.attackAmbush`
- `vc.agitationPrep`

Preserve the existing five VC templates.

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify)

## Out of Scope

- Authoring new selectors/templates/modules/postures/guardrails; owned by prior tickets.
- Adding the full new witness suite; owned by ticket 008.
- Tuning thresholds unless build or existing witnesses prove the Spec 204 defaults unconstructible.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine build`
2. `node --test dist/test/policy-profile-quality/vc-avoids-conventional-attack-without-ambush.test.js dist/test/policy-profile-quality/vc-protects-bases-from-nva-infiltrate.test.js` from `packages/engine` after build
3. `pnpm run check:ticket-deps`

### Invariants

1. All newly bound IDs resolve to authored library entries.
2. Existing shared and VC bindings remain present.
3. Existing two VC witnesses remain green under the expanded bound profile.

## Test Plan

### New/Modified Tests

- None. This ticket activates authored artifacts and relies on existing VC regressions; expanded witness coverage is ticket 008.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `cd packages/engine && node --test dist/test/policy-profile-quality/vc-avoids-conventional-attack-without-ambush.test.js dist/test/policy-profile-quality/vc-protects-bases-from-nva-infiltrate.test.js`
3. `pnpm run check:ticket-deps`
