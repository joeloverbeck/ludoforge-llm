# 191PLAROLSEM-003: Compound-sequencing witness validation + FITL profile corrections

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `cnl` (plan-template validator; possibly compile-agent-plan-templates); `data/games/fire-in-the-lake` (corrective profile fixes)
**Deps**: `specs/191-plan-role-semantic-integrity.md`

## Problem

`root.compound` (`specialTags`, `timing`, `interruptAfterStage`) is copied verbatim through `compile-agent-plan-templates.ts:93–100` and never cross-checked against any action's actual special-activity grant semantics. `validate-agent-plan-templates.ts` validates roles, selectors, caps, step role references, and fallback cycles — but never `root.compound`. So a template can describe a sequencing pattern (e.g., interrupt-after-stage timing) that no legal continuation actually grants, and compilation accepts it. Spec 191 §4.3.

## Assumption Reassessment (2026-05-22)

1. `compile-agent-plan-templates.ts:93–100` copies `root.compound.specialTags`/`timing`/`interruptAfterStage` with no validation — verified this session.
2. `validate-agent-plan-templates.ts` contains no reference to `compound`/`specialTags`/`interruptAfterStage` (grep returned zero, 2026-05-22) — confirms the metadata is unvalidated.
3. `data/games/fire-in-the-lake/92-agents.md` authors ≈23 `compound`-family field occurrences (verified 2026-05-22) — real templates to validate; corrections land here if any describe ungrantable sequencing.

## Architecture Check

1. Proving `root.compound` against ≥1 legal continuation witness in authored conformance fixtures (Foundation #16) turns descriptive metadata into a proven property — a template that no action can satisfy fails compilation rather than misleading the controller.
2. Generic: validation operates on the compiled action surface and continuation frontier the engine already produces; "Sweep"/"Raid"/etc. remain authored tags, not engine concepts (Foundation #1).
3. No shim: ungrantable compound metadata is rejected (and failing authored templates corrected in the same change), not silently carried (Foundation #14).

## What to Change

### 1. Compound-sequencing witness validation

In `validate-agent-plan-templates.ts`, for each template whose `root` declares `specialTags`/`timing`/`interruptAfterStage`, require at least one legal continuation witness (in the authored conformance fixtures) that exhibits the described special-activity timing and continuation path. Fail compilation with a template-named diagnostic when none exists.

### 2. Witness fixture wiring

Provide/extend the conformance fixtures the validator consults to confirm grantable continuations (see `packages/engine/test/architecture/fixtures/` and the integration fixtures). Keep fixtures generic; FITL specifics stay in authored data.

### 3. Corrective FITL profile fixes

Run the new validation against `data/games/fire-in-the-lake/92-agents.md`; fix any authored compound template whose declared timing/continuation no action grants.

## Files to Touch

- `packages/engine/src/cnl/validate-agent-plan-templates.ts` (modify — compound witness validation)
- `packages/engine/src/cnl/compile-agent-plan-templates.ts` (modify — only if compound metadata needs surfacing for the validator)
- `packages/engine/test/architecture/fixtures/` (new/modify — continuation witness fixture, conventional placement)
- `data/games/fire-in-the-lake/92-agents.md` (modify — corrections to any of the ≈23 authored `compound` values that fail the new validation; exact set determined when validation is implemented)
- `packages/engine/test/unit/cnl/agent-plan-template-validate.test.ts` (modify — ungrantable-compound diagnostic)

## Out of Scope

- Role-constraint registry (191PLAROLSEM-001) and step-match validation (191PLAROLSEM-002) — separate phases. Shares `validate-agent-plan-templates.ts`; serialize implementation.
- Changing compound execution/timing semantics — this ticket validates, it does not alter, the controller's compound handling.

## Acceptance Criteria

### Tests That Must Pass

1. A template whose `root.compound` describes a timing/continuation no action grants fails compilation with a template-named diagnostic.
2. A template whose compound metadata matches a legal continuation witness compiles successfully.
3. The FITL profile compiles after any corrections; existing compound-using witnesses still pass.
4. Existing suite: `pnpm -F @ludoforge/engine test:all`.

### Invariants

1. No compiled template carries `root.compound` metadata unprovable against a legal continuation witness.
2. No FITL profile authored compound template is left failing the new validation (Foundation #14).
3. Determinism: compile-twice byte-identity preserved; diagnostics replay byte-identically.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/agent-plan-template-validate.test.ts` — ungrantable-compound rejection + valid-compound acceptance.
2. `packages/engine/test/architecture/fixtures/` — continuation witness fixture supporting the validation.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test dist/test/unit/cnl/agent-plan-template-validate.test.js`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
