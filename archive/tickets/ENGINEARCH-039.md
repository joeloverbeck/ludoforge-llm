# ENGINEARCH-039: Decouple zoneVar type metadata contracts from globalVar typing in validator context

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — validator type contract cleanup + targeted tests
**Deps**: none

## Problem

`ValidationContext.zoneVarTypesByName` is currently typed via `GameDef['globalVars'][number]['type']` to keep zoneVar boolean checks compilable after zoneVars became int-only. This is an architectural coupling smell and obscures ownership of zoneVar typing contracts.

## Assumption Reassessment (2026-02-26)

1. `GameDef.zoneVars` is now int-only by type/schema contract.
2. `validate-gamedef-behavior.ts` still contains boolean-target checks for zoneVar endpoints (`addVar`, `transferVar`) that are only reachable on degraded/invalid `GameDef` inputs.
3. `validate-gamedef.test.ts` currently asserts `ADDVAR_BOOLEAN_TARGET_INVALID` for boolean `zoneVars`, which conflicts with int-only structural ownership.
4. **Mismatch + correction**: validator context contracts must be explicit and self-owned (not coupled to unrelated globalVar type definitions), and invalid zoneVar type diagnostics should be owned by structure validation (`ZONE_VAR_TYPE_INVALID`) rather than downstream behavior checks.

## Architecture Check

1. Explicit, locally-owned type contracts are cleaner and safer than cross-domain type coupling hacks.
2. This is pure engine contract hygiene in agnostic validation code, with no game-specific behavior.
3. No backwards-compatibility aliases/shims are introduced.

## What to Change

### 1. Introduce explicit variable-type alias usage in validator context

Refactor validator context typing for scoped variable type maps to use explicit/shared variable-type contract types (for example `VariableDef['type']` or dedicated alias), not `globalVars` as a proxy.

### 2. Remove unreachable zoneVar boolean behavior diagnostics under int-only contract

Under int-only `zoneVars`, remove boolean-target checks for zoneVar endpoints in behavior validation (`addVar`, `transferVar`). Keep boolean-target diagnostics for `global` and `pvar` endpoints.

### 3. Add/adjust tests for diagnostic ownership

Ensure tests make diagnostic ownership explicit:
- invalid zoneVar type definitions produce `ZONE_VAR_TYPE_INVALID`;
- no redundant zoneVar boolean-target behavior diagnostics are emitted for those invalid definitions.

## Files to Touch

- `packages/engine/src/kernel/validate-gamedef-structure.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)

## Out of Scope

- CNL compiler diagnostic gating (covered separately)
- Game-specific rules or data changes
- Runtime semantics changes for valid int zoneVar operations

## Acceptance Criteria

### Tests That Must Pass

1. Validator context type maps are explicit and decoupled from globalVar type definitions.
2. Invalid zoneVar type diagnostics are owned by structure validation and remain deterministic/non-ambiguous.
3. Behavior validator no longer emits zoneVar-specific boolean-target diagnostics under invalid zoneVar type definitions.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Scoped variable type metadata contracts are explicit, local, and maintainable.
2. ZoneVar contract violations fail at the intended layer without hidden coupling.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — verify diagnostic ownership for invalid zoneVars definitions and downstream effects.
2. `packages/engine/test/unit/validate-gamedef.test.ts` — assert no regressions for valid zoneVar int operation flows.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test -- test/unit/validate-gamedef.test.ts`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-02-26
- What changed:
  - Updated validator context typing to decouple zoneVar type metadata from `globalVars` typing (`zoneVarTypesByName` is now explicitly int-only; shared var maps use explicit `VariableDef['type']` contract).
  - Removed unreachable zoneVar boolean-target diagnostics from behavior validation for `transferVar`.
  - Scoped `addVar` boolean-target diagnostics to `global`/`pvar` only (not `zoneVar`).
  - Updated zoneVar-related validator tests to assert structure-owned diagnostics for invalid zoneVar type definitions.
  - Added a transferVar-specific regression test for invalid boolean zoneVar definitions.
- Deviations from original plan:
  - Did not modify `types-core.ts`; extraction was unnecessary because existing shared types already supported explicit contracts.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `pnpm -F @ludoforge/engine test:unit -- dist/test/unit/validate-gamedef.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
