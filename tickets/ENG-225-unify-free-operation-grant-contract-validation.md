# ENG-225: Unify Free-Operation Grant Contract Validation Across Event, Effect, and GameDef Paths

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — compiler, shared GameDef validation, schema contract parity, and grant contract tests
**Deps**: archive/tickets/ENG-223-resume-card-flow-after-required-grant-resolution.md, packages/engine/src/cnl/compile-event-cards.ts, packages/engine/src/kernel/validate-gamedef-behavior.ts, packages/engine/src/kernel/schemas-extensions.ts

## Problem

`postResolutionTurnFlow` was introduced as the explicit contract for required free-operation grants that must resume canonical card flow. That contract is currently enforced for effect-issued `grantFreeOperation`, but not consistently across event-card `freeOperationGrants`, raw `GameDef` validation, and schema-level validation. As a result, the same semantic rule can be accepted or rejected depending on which ingestion path produced the grant. That is not a robust architecture for a game-agnostic engine.

## Assumption Reassessment (2026-03-09)

1. `grantFreeOperation` effect lowering/runtime now requires `postResolutionTurnFlow` when `completionPolicy: required` and rejects the inverse pairing.
2. Event-card `freeOperationGrants` still flow through `compile-event-cards` and shared GameDef validation without equivalent `completionPolicy`/`postResolutionTurnFlow` coupling checks.
3. Mismatch: the repository now has two different free-operation grant contract surfaces. Correction: define one canonical shared grant-contract validator and apply it uniformly to effect lowering, event lowering, GameDef validation, and schema/parity tests.

## Architecture Check

1. One shared validator for free-operation grant contracts is cleaner than re-encoding the same invariant separately in effect lowering, event lowering, runtime validation, and ad hoc tests. It reduces drift and makes future contract extensions explicit.
2. This keeps game-specific behavior in `GameSpecDoc` data while preserving a game-agnostic `GameDef`/kernel/simulator contract surface. The engine should validate generic grant semantics once, not per game or per ingestion path.
3. No backwards-compatibility aliasing or fallback behavior should be introduced. Invalid grant shapes should fail validation rather than silently defaulting to detached semantics.

## What to Change

### 1. Centralize free-operation grant contract validation

Extract the shared validation rules for free-operation grant contracts into one canonical helper/module that covers:
- allowed enum/value checks
- `completionPolicy: required` requiring explicit `postResolutionTurnFlow`
- `postResolutionTurnFlow` being illegal unless `completionPolicy: required`
- any other shared grant-coupling rules that are currently duplicated or path-specific

Use that shared validator from:
- effect lowering / effect runtime validation
- event-card grant lowering
- behavioral GameDef validation for raw runtime inputs

### 2. Close schema and GameDef parity gaps

Update schema-level and GameDef-level validation so invalid required-grant shapes are rejected before runtime execution. If JSON Schema cannot express the full coupling ergonomically, keep the schema as structurally strict as practical and enforce the remaining semantic coupling in the shared validator and `assertValidatedGameDef`.

### 3. Strengthen regression coverage around ingestion-path parity

Add tests proving the same required-grant contract is enforced consistently for:
- `grantFreeOperation` effects
- event-card `freeOperationGrants`
- direct `GameDef` validation
- schema/parity fixtures where applicable

## Files to Touch

- `packages/engine/src/cnl/compile-event-cards.ts` (modify)
- `packages/engine/src/cnl/compile-effects.ts` (modify)
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
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Required free-operation grant semantics are defined once and enforced identically regardless of whether the grant originates from event data, effect data, or direct `GameDef` construction.
2. The engine remains fully game-agnostic: no card ids, faction names, or simulator-side special cases are introduced to recover from invalid grant data.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — assert shared GameDef validation rejects missing/illegal `postResolutionTurnFlow` pairings on event-card grants.
2. `packages/engine/test/unit/json-schema.test.ts` — tighten schema/parity fixtures so contract shape drift is caught at the artifact boundary where practical.
3. `packages/engine/test/unit/compile-effects.test.ts` — keep effect-lowering parity aligned with the shared validator after extraction.
4. `packages/engine/test/unit/effects-turn-flow.test.ts` — keep runtime enforcement aligned with the same canonical contract assumptions.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/validate-gamedef.test.js packages/engine/dist/test/unit/json-schema.test.js packages/engine/dist/test/unit/compile-effects.test.js packages/engine/dist/test/unit/effects-turn-flow.test.js`
3. `pnpm -F @ludoforge/engine lint`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm run check:ticket-deps`
