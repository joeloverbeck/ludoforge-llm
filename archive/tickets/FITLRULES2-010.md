# FITLRULES2-010: Turn-Flow Action Class Contract Synchronization

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — CNL/kernel schema contracts and schema artifacts
**Deps**: `specs/00-fitl-implementation-order.md`

## Problem

`turnFlow.actionClassByActionId` is now part of the turn-flow architecture, but schema contracts are not fully synchronized. This creates drift between compile/runtime type contracts and generated schema artifacts.

## Assumption Reassessment (2026-02-23)

1. `GameSpecDoc` and `TurnFlowDef` now declare `actionClassByActionId` as required.
2. Kernel `TurnFlowSchema` and generated `GameDef.schema.json` still omit this field from `turnFlow` properties/required contract.
3. Existing compile/validation coverage already checks missing/malformed `actionClassByActionId` at `GameSpecDoc` level (`compile-turn-flow` and `validate-extensions` paths are already enforced).
4. Real test gap is runtime/schema-layer parity: top-level schema fixtures and `validateGameDef` cast-based coverage do not currently guarantee this field is required by `GameDef` schema contract.
5. Mismatch correction: scope must prioritize schema-source + artifact sync and runtime-contract tests, not duplicate compile-level checks.

## Architecture Check

1. A single synchronized contract across TS types, Zod schemas, and JSON schema artifacts is cleaner and more robust than allowing inferred or partially-declared structure.
2. This keeps game-specific data in `GameSpecDoc` while preserving game-agnostic runtime validation in `GameDef`/kernel.
3. No backward-compatibility path: missing `actionClassByActionId` remains invalid.

## What to Change

### 1. Update kernel turn-flow schema contract

Add `actionClassByActionId` to `TurnFlowSchema` with value type constrained to turn-flow action classes.

### 2. Regenerate schema artifacts

Run schema artifact generation to ensure `packages/engine/schemas/GameDef.schema.json` reflects required `actionClassByActionId` property and required-list membership.

### 3. Add schema-contract tests

Strengthen runtime schema/contract tests so future turn-flow required fields cannot drift silently between TS type declarations and `GameDef` schema artifacts.

## Files to Touch

- `packages/engine/src/kernel/schemas-extensions.ts` (modify)
- `packages/engine/schemas/GameDef.schema.json` (modify, generated)
- `packages/engine/test/unit/schemas-top-level.test.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)

## Out of Scope

- Changing turn-flow runtime legality behavior
- Reclassifying existing action ids
- Runner/UI changes

## Acceptance Criteria

### Tests That Must Pass

1. Compiling a card-driven spec without `actionClassByActionId` produces blocking diagnostics.
2. Runtime `GameDef` schema parsing rejects card-driven `turnFlow` when `actionClassByActionId` is missing.
3. Runtime `GameDef` validation accepts card-driven `turnFlow` only when `actionClassByActionId` exists with valid class literals.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `actionClassByActionId` is required in all card-driven turn-flow schema layers (`GameSpecDoc` validation, kernel Zod schemas, generated `GameDef` JSON schema).
2. `GameDef` runtime/schema contract remains game-agnostic and contains no FITL-specific branching.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-spec.test.ts` — assert missing/invalid `actionClassByActionId` fails structural validation.
2. `packages/engine/test/unit/schemas-top-level.test.ts` — assert `GameDefSchema` rejects card-driven `turnFlow` when `actionClassByActionId` is omitted.
3. `packages/engine/test/unit/validate-gamedef.test.ts` — assert `validateGameDef` surfaces schema diagnostics for missing card-driven `actionClassByActionId` via boundary validation path.

### Commands

1. `pnpm turbo schema:artifacts`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion date**: 2026-02-23
- **What changed**:
  - Added `actionClassByActionId` as a required property in kernel `TurnFlowSchema`.
  - Regenerated schema artifacts so `packages/engine/schemas/GameDef.schema.json` now includes `turnFlow.actionClassByActionId` in both properties and required fields.
  - Updated runtime schema fixture/tests to include the required field and added a regression test that fails when the field is omitted.
  - Updated `validate-gamedef` turnFlow fixtures to keep tests aligned with the required contract.
- **Deviations from original plan**:
  - Shifted test emphasis from compile/validate-spec duplication to runtime schema parity, because compile-level enforcement already existed.
  - Added fixture hygiene updates in `validate-gamedef` tests to prevent future false negatives as contract strictness increases.
- **Verification results**:
  - `pnpm turbo schema:artifacts` ✅
  - `pnpm -F @ludoforge/engine test` ✅ (253/253 passing)
  - `pnpm -F @ludoforge/engine lint` ✅
