# FITLRULES2-010: Turn-Flow Action Class Contract Synchronization

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — CNL/kernel schema contracts and schema artifacts
**Deps**: `specs/00-fitl-implementation-order.md`

## Problem

`turnFlow.actionClassByActionId` is now part of the turn-flow architecture, but schema contracts are not fully synchronized. This creates drift between compile/runtime type contracts and generated schema artifacts.

## Assumption Reassessment (2026-02-23)

1. `GameSpecDoc` and `TurnFlowDef` now declare `actionClassByActionId` as required.
2. Kernel Zod turn-flow schema and generated `GameDef.schema.json` still omit this field from turnFlow required contract.
3. Mismatch correction: ticket scope must include schema-source changes and artifact regeneration, not only TypeScript interfaces.

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

Strengthen tests that validate schema/contract expectations so future turn-flow field additions cannot drift silently.

## Files to Touch

- `packages/engine/src/kernel/schemas-extensions.ts` (modify)
- `packages/engine/schemas/GameDef.schema.json` (modify, generated)
- `packages/engine/test/unit/compile-top-level.test.ts` (modify)
- `packages/engine/test/unit/validate-spec.test.ts` (modify)

## Out of Scope

- Changing turn-flow runtime legality behavior
- Reclassifying existing action ids
- Runner/UI changes

## Acceptance Criteria

### Tests That Must Pass

1. Compiling a card-driven spec without `actionClassByActionId` produces blocking diagnostics.
2. Runtime `GameDef` validation accepts turnFlow only when `actionClassByActionId` exists with valid class literals.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `actionClassByActionId` is required in all card-driven turn-flow schema layers.
2. `GameDef` runtime/schema contract remains game-agnostic and contains no FITL-specific branching.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-spec.test.ts` — assert missing/invalid `actionClassByActionId` fails structural validation.
2. `packages/engine/test/unit/compile-top-level.test.ts` — assert compile+cross-validate behavior remains blocking for malformed map.

### Commands

1. `pnpm turbo schema:artifacts`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine lint`
