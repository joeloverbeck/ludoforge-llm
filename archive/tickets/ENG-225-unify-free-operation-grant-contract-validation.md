# ENG-225: Unify Free-Operation Grant Contract Validation Across Event, Effect, and GameDef Paths

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — compiler, shared GameDef validation, schema contract parity, and grant contract tests
**Deps**: archive/tickets/ENG-223-resume-card-flow-after-required-grant-resolution.md, packages/engine/src/cnl/compile-event-cards.ts, packages/engine/src/kernel/validate-gamedef-behavior.ts, packages/engine/src/kernel/schemas-extensions.ts

## Problem

`postResolutionTurnFlow` was introduced as the explicit contract for required free-operation grants that must resume canonical card flow. That contract is currently enforced for effect-issued `grantFreeOperation`, but not consistently across event-card `freeOperationGrants`, raw `GameDef` validation, and schema-level validation. As a result, the same semantic rule can be accepted or rejected depending on which ingestion path produced the grant. That is not a robust architecture for a game-agnostic engine.

## Assumption Reassessment (2026-03-09)

1. `grantFreeOperation` effect lowering/runtime now requires `postResolutionTurnFlow` when `completionPolicy: required` and rejects the inverse pairing.
2. Event-card `freeOperationGrants` currently have three relevant paths:
   - `compile-event-cards.ts` lowers `zoneFilter` only and does not enforce semantic grant coupling.
   - `cnl/cross-validate.ts` validates event-grant seat/action references only and does not enforce `completionPolicy`/`postResolutionTurnFlow` coupling.
   - `validate-gamedef-behavior.ts` already uses a shared free-operation grant validator for some generic grant invariants, but that validator currently omits the `completionPolicy`/`postResolutionTurnFlow` contract.
3. Mismatch: the repository does not have one canonical free-operation grant contract surface. Instead, generic grant validation is split across:
   - effect lowering (`compile-effects.ts`)
   - runtime effect application (`effects-turn-flow.ts`)
   - partial shared `GameDef` validation (`validate-gamedef-behavior.ts`)
   - structural schemas (`schemas-ast.ts`, `schemas-extensions.ts`)
4. Correction: define one canonical reusable grant-contract helper for the shared semantic invariant and apply it where early diagnostics or runtime safety are required. Do not treat `compile-event-cards.ts` as the primary semantic enforcement point unless the compile pipeline cannot surface the shared validator early enough.

## Architecture Check

1. One shared validator for free-operation grant contracts is cleaner than re-encoding the same invariant separately in effect lowering, event lowering, runtime validation, and ad hoc tests. It reduces drift and makes future contract extensions explicit.
2. This keeps game-specific behavior in `GameSpecDoc` data while preserving a game-agnostic `GameDef`/kernel/simulator contract surface. The engine should validate generic grant semantics once, not per game or per ingestion path.
3. No backwards-compatibility aliasing or fallback behavior should be introduced. Invalid grant shapes should fail validation rather than silently defaulting to detached semantics.
4. Reassessment: duplicating the coupling check in `compile-event-cards.ts` and `cnl/cross-validate.ts` would not be cleaner architecture by itself. The ideal architecture is:
   - one reusable semantic contract helper
   - optional thin adapters where different layers need different error-reporting shapes
   - structural schema checks kept close to schemas
   - runtime assertions kept as a defensive backstop, not the primary source of truth

## What to Change

### 1. Centralize free-operation grant contract validation

Extract the shared validation rules for free-operation grant contracts into one canonical helper/module that covers:
- allowed enum/value checks
- `completionPolicy: required` requiring explicit `postResolutionTurnFlow`
- `postResolutionTurnFlow` being illegal unless `completionPolicy: required`
- any other shared grant-coupling rules that are currently duplicated or path-specific

Use that shared validator from:
- effect lowering / effect runtime validation
- shared GameDef validation for event-card grants
- behavioral GameDef validation for raw runtime inputs
- event-card compile/cross-validation only if needed as a thin adapter for earlier compiler diagnostics

### 2. Close schema and GameDef parity gaps

Update schema-level and GameDef-level validation so invalid required-grant shapes are rejected before runtime execution. `schemas-extensions.ts` and `schemas-ast.ts` both currently expose this grant shape, so both schema surfaces must be reassessed. If JSON Schema cannot express the full coupling ergonomically, keep the schema as structurally strict as practical and enforce the remaining semantic coupling in the shared validator and `assertValidatedGameDef`.

### 3. Strengthen regression coverage around ingestion-path parity

Add tests proving the same required-grant contract is enforced consistently for:
- `grantFreeOperation` effects
- event-card `freeOperationGrants`
- direct `GameDef` validation
- schema/parity fixtures where applicable

## Files to Touch

- `packages/engine/src/cnl/compile-event-cards.ts` (modify)
- `packages/engine/src/cnl/cross-validate.ts` (reassess; modify only if an adapter is justified)
- `packages/engine/src/cnl/compile-effects.ts` (modify)
- `packages/engine/src/kernel/effects-turn-flow.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/src/kernel/schemas-extensions.ts` (modify)
- `packages/engine/src/kernel/schemas-ast.ts` (modify if shared helper contract changes)
- `packages/engine/src/contracts/turn-flow-free-operation-grant-contract.ts` (modify if shared helper lives here)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)
- `packages/engine/test/unit/json-schema.test.ts` (modify)
- `packages/engine/test/unit/compile-effects.test.ts` (modify)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify only if needed for parity coverage)

## Out of Scope

- Overlapping-grant outcome-policy selection and consumption semantics already tracked in `tickets/ENG-224-strengthen-required-outcome-enforcement-for-overlapping-grants.md`.
- Re-encoding specific FITL cards already tracked in `tickets/ENG-204-ia-drang-reencode-on-grant-contracts.md`.
- New grant behavior modes beyond codifying the existing `resumeCardFlow` contract.

## Acceptance Criteria

### Tests That Must Pass

1. Event-card `freeOperationGrants` with `completionPolicy: required` and no `postResolutionTurnFlow` are rejected by the canonical validation path.
2. Direct `GameDef` validation rejects required grants missing `postResolutionTurnFlow` and rejects `postResolutionTurnFlow` on non-required grants.
3. Defensive runtime validation remains aligned with the same canonical contract semantics.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Required free-operation grant semantics are defined once and enforced identically regardless of whether the grant originates from event data, effect data, or direct `GameDef` construction.
2. The engine remains fully game-agnostic: no card ids, faction names, or simulator-side special cases are introduced to recover from invalid grant data.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — assert shared GameDef validation rejects missing/illegal `postResolutionTurnFlow` pairings on event-card grants.
2. `packages/engine/test/unit/json-schema.test.ts` — tighten schema/parity fixtures on both schema surfaces so contract shape drift is caught at the artifact boundary where practical.
3. `packages/engine/test/unit/compile-effects.test.ts` — keep effect-lowering parity aligned with the shared validator after extraction.
4. `packages/engine/test/unit/effects-turn-flow.test.ts` — keep runtime enforcement aligned with the same canonical contract assumptions.
5. `packages/engine/test/unit/schemas-ast.test.ts` — add or update schema-ast coverage if the effect/event AST surface is tightened there rather than solely in `json-schema.test.ts`.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/validate-gamedef.test.js packages/engine/dist/test/unit/json-schema.test.js packages/engine/dist/test/unit/compile-effects.test.js packages/engine/dist/test/unit/effects-turn-flow.test.js`
3. `pnpm -F @ludoforge/engine lint`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm run check:ticket-deps`

## Outcome

- Completion date: 2026-03-09
- What actually changed:
  - Added a canonical shared free-operation grant contract helper in `packages/engine/src/contracts/turn-flow-free-operation-grant-contract.ts`.
  - Rewired `compile-effects.ts`, `validate-gamedef-behavior.ts`, and `effects-turn-flow.ts` to consume the shared helper instead of carrying separate semantic coupling logic.
  - Added a shared Zod adapter so `schemas-ast.ts` and `schemas-extensions.ts` enforce the same contract at the `validateGameDefBoundary` layer.
  - Regenerated `packages/engine/schemas/*.schema.json` artifacts and updated grant-parity tests to assert the new shared-helper architecture.
- Deviations from original plan:
  - `compile-event-cards.ts` and `cnl/cross-validate.ts` did not need semantic contract changes. They remain focused on lowering and identifier cross-reference work, while the shared validator owns grant semantics.
  - Generated draft-07 JSON schema artifacts remain structurally permissive for the `completionPolicy`/`postResolutionTurnFlow` coupling because Zod `superRefine` does not round-trip into JSON Schema. The canonical enforcement therefore lives in the shared helper plus Zod boundary/runtime validation rather than artifact-only JSON Schema.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test dist/test/unit/validate-gamedef.test.js dist/test/unit/json-schema.test.js dist/test/unit/compile-effects.test.js dist/test/unit/effects-turn-flow.test.js` (run from `packages/engine/`)
  - `pnpm -F @ludoforge/engine lint`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm run check:ticket-deps`
