# ENGINEARCH-141: Pipeline Regression Coverage for Choice-Options Noise Suppression

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — integration/regression coverage for validator and compile surfaces at their actual architecture boundaries
**Deps**: archive/tickets/ENGINEARCH-128-choice-options-runtime-shape-diagnostic-boundary-and-noise-control.md

## Problem

Noise suppression for secondary choice-options runtime-shape diagnostics is unit-covered in validator tests, but integration-level regression coverage for surfaced validator behavior is missing.

## Assumption Reassessment (2026-02-28)

1. `packages/engine/test/unit/validate-gamedef.test.ts` currently asserts suppression on invalid options-query paths.
2. `compileGameSpecToGameDef(...)` emits `CNL_COMPILER_*` and `CNL_XREF_*` diagnostics during compilation/cross-validation, and compilation errors can prevent `validateGameDefBoundary(...)` diagnostics from surfacing in the same run.
3. `EFFECT_CHOICE_OPTIONS_RUNTIME_SHAPE_INVALID` suppression is therefore a `validateGameDef(...)` boundary contract, not a compile-surface contract.
4. Mismatch corrected: `packages/engine/test/integration/cross-validate-production.test.ts` is about production `CNL_XREF_*` coverage and is not the right location. Validator suppression coverage belongs in a kernel-integration test that directly exercises `validateGameDef(...)`.
5. Existing compiler-surface behavior is already covered in unit tests (`packages/engine/test/unit/compile-effects.test.ts`) for `CNL_COMPILER_CHOICE_OPTIONS_RUNTIME_SHAPE_INVALID`; this ticket keeps compiler checks as non-goal verification only.

## Architecture Check

1. Integration contract tests reduce drift risk between validator internals and surfaced validator API behavior.
2. This remains game-agnostic engine validation coverage; no game-specific branching is introduced in GameDef/runtime/simulator.
3. No backwards-compatibility aliases/shims; enforce current strict policy end-to-end.

## What to Change

### 1. Add integration regression for validator suppression behavior

Introduce an integration test that composes/validates a definition with an invalid options query and asserts:
- primary query-validation diagnostics are present
- secondary `EFFECT_CHOICE_OPTIONS_RUNTIME_SHAPE_INVALID` at the same path is absent

### 2. Keep compile surface unaffected

Do not change compiler behavior; existing compiler diagnostics/tests remain authoritative for `CNL_COMPILER_CHOICE_OPTIONS_RUNTIME_SHAPE_INVALID`.

## Files to Touch

- `packages/engine/test/integration/core-types-validation.integration.test.ts` (add integration regression coverage for `validateGameDef(...)` suppression contract)
- `packages/engine/test/unit/validate-gamedef.test.ts` (no change expected; existing suppression unit coverage already present)
- `packages/engine/test/unit/compile-effects.test.ts` (no change expected; existing compiler-surface coverage already present)

## Out of Scope

- Any GameSpecDoc or visual-config changes.
- Runtime query-shape inference logic changes.
- Diagnostic taxonomy changes.

## Acceptance Criteria

### Tests That Must Pass

1. Integration validator test fails if suppression policy regresses in surfaced validator diagnostics.
2. Primary query-validation diagnostics still surface for invalid options queries.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Validator suppression remains path-scoped and deterministic.
2. GameDef/simulator remain game-agnostic; no game-specific policy branches.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/core-types-validation.integration.test.ts` — enforce suppression contract at the `validateGameDef(...)` integration boundary with realistic GameDef fixtures.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/core-types-validation.integration.test.js`
3. `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
4. `node --test packages/engine/dist/test/unit/compile-effects.test.js`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion date**: 2026-02-28
- **What actually changed**:
  - Added integration regression coverage in `packages/engine/test/integration/core-types-validation.integration.test.ts` to lock the `validateGameDef(...)` suppression contract:
    - primary `REF_RUNTIME_TABLE_MISSING` diagnostics still surface for invalid `assetRows` options table references
    - secondary `EFFECT_CHOICE_OPTIONS_RUNTIME_SHAPE_INVALID` diagnostics are suppressed on the same invalid options paths
  - Reassessed and corrected ticket assumptions/scope to match architecture boundaries:
    - validator suppression is a `validateGameDef(...)` surface contract
    - compile/cross-validate surfaces remain covered by existing compiler unit tests and were not changed
- **Deviations from original plan**:
  - Original target integration file (`cross-validate-production.test.ts`) was incorrect for this contract and was not modified.
  - Final implementation used `core-types-validation.integration.test.ts` as the proper integration boundary for validator diagnostics.
- **Verification results**:
  - `pnpm -F @ludoforge/engine build` ✅
  - `node --test dist/test/integration/core-types-validation.integration.test.js` (from `packages/engine`) ✅
  - `node --test dist/test/unit/validate-gamedef.test.js` (from `packages/engine`) ✅
  - `node --test dist/test/unit/compile-effects.test.js` (from `packages/engine`) ✅
  - `pnpm -F @ludoforge/engine test` ✅ (`# pass 324`, `# fail 0`)
  - `pnpm -F @ludoforge/engine lint` ✅
