# 188FITLFOUFAC-008A: Generic profile plan-template isolation for authored faction skeletons

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — generic agent planner / compiler ownership only
**Deps**: `specs/188-fitl-four-faction-plan-migration-and-sequencing.md`

## Problem

Ticket 008's US skeleton authoring exposed a generic planner contract gap: authored plan templates are compiled into the shared policy catalog and can compete across profiles/seats during `proposeAdvisoryTurnPlan`. The live 008 attempt added US templates in YAML only, then `pnpm -F @ludoforge/engine test:policy-profile-quality` failed the existing ARVN witness because ARVN selected `us.trainAdvise` instead of `arvn.trainGovern`.

Spec 188 still requires US/NVA/VC skeletons to be authored as data. Before 008 can truthfully remain YAML-only, the planner must provide a generic profile/template isolation contract so one faction's authored skeleton cannot alter another faction's selected plan.

## Assumption Reassessment (2026-05-21)

1. `docs/FOUNDATIONS.md` #1 and #2 forbid FITL-specific engine branches, but they allow generic planner/compiler fixes needed to make authored GameSpecDoc data execute correctly.
2. A YAML scoring workaround would hide a generic architecture defect and conflict with Foundation #15's root-cause requirement.
3. The prerequisite is independent of US tactical content: it should prove profile/seat isolation using generic agent planner behavior and then rerun the existing ARVN regression witness.

## Architecture Check

1. Fix the generic plan-profile contract rather than adding faction-specific runtime code.
2. Keep GameSpecDoc as the rule-authoritative authoring surface; profile/template ownership must be represented or derived generically.
3. Do not introduce compatibility aliases or legacy fallback paths.

## What to Change

### 1. Isolate plan templates to the active profile/seat

Ensure `proposeAdvisoryTurnPlan` only considers plan templates that are valid for the effective profile/seat, or add the generic compiled ownership metadata needed to make that true. The solution must not inspect FITL faction ids or action names.

### 2. Add regression coverage

Add a generic unit or architecture test proving that adding another profile's template cannot change the active profile's selected plan. Include or preserve an integration witness that reproduces the Spec 188 failure shape: ARVN must still select `arvn.trainGovern` after US templates exist.

### 3. Preserve advisory profile-quality classification

The ARVN regression witness remains warning-class/profile-quality; any new architectural invariant for template isolation belongs in the normal unit/architecture lane.

## Files to Touch

- `packages/engine/src/agents/plan-proposal.ts` (modify, if the runtime planner owns the filter)
- `packages/engine/src/cnl/compile-agents.ts` (modify, if compiled profile ownership metadata is needed)
- `packages/engine/src/kernel/types-core.ts` / schema mirrors (modify only if a compiled contract field is added)
- `packages/engine/test/unit/agents/plan-proposal.test.ts` or an architecture equivalent (modify)
- `packages/engine/test/policy-profile-quality/arvn-us-rival-risk-flip.test.ts` (modify only if needed to preserve the regression witness)

## Out of Scope

- Authoring the US skeleton itself; that returns to `tickets/188FITLFOUFAC-008.md`.
- NVA/VC skeleton authoring (`009`, `010`).
- FITL-specific planner branches or template-id allowlists.

## Acceptance Criteria

### Tests That Must Pass

1. A focused generic planner/compiler test proves cross-profile templates cannot affect the active profile's proposal.
2. `node --test packages/engine/dist/test/policy-profile-quality/arvn-us-rival-risk-flip.test.js` passes after adding a cross-profile template fixture or after the 008 skeleton resumes.
3. Existing suite: `pnpm -F @ludoforge/engine test:all`.

### Invariants

1. No FITL-specific identifiers appear in engine/compiler implementation logic.
2. Profile/template isolation is generic and deterministic.
3. US/NVA/VC skeleton tickets can remain Tier-1 YAML authoring after this prerequisite lands.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/plan-proposal.test.ts` or equivalent — cross-profile template isolation.
2. `packages/engine/test/policy-profile-quality/arvn-us-rival-risk-flip.test.ts` — existing regression witness remains green.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test <focused compiled isolation test> packages/engine/dist/test/policy-profile-quality/arvn-us-rival-risk-flip.test.js`
2. `pnpm -F @ludoforge/engine test:all`
