# ACTTOOLTIP-010: Strengthen type-level contracts for macro-origin annotation policy fields

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/cnl/binder-surface-registry.ts` typing and policy contracts
**Deps**: None

## Problem

Macro-origin policy registries still allow free-form string field names (`bindFields`, `bindField`, `macroOriginField`). This leaves room for typos or stale field names that are detected only via runtime behavior checks, not by TypeScript at declaration time.

## Assumption Reassessment (2026-02-27)

1. `MACRO_ORIGIN_NODE_BINDING_ANNOTATION_SPECS` and `REDUCE_MACRO_ORIGIN_BINDING_ANNOTATION_SPECS` currently type policy fields as `string` — confirmed.
2. `expand-effect-macros.ts` consumes these registries as authoritative annotation dispatch inputs — confirmed (`annotateControlFlowMacroOrigins`, `annotateReduceMacroOrigins`).
3. Existing tests in `binder-surface-registry.test.ts` already enforce runtime alignment between policy entries and declared binder paths — confirmed; ticket scope corrected to focus on compile-time contract hardening, not missing runtime checks.
4. There is currently no negative type-level assertion that intentionally fails on invalid policy field names — confirmed.

## Architecture Check

1. Stronger compile-time policy contracts are beneficial versus current architecture because they move failure detection from runtime tests to declaration-time type checking.
2. The robust shape is a discriminated policy contract where `effectKind` determines the allowed `bindFields` union, avoiding uncoupled string lists.
3. No backward-compatibility aliases should be introduced; invalid policy entries should fail to compile.
4. Change remains game-agnostic and contained to compiler/typing contracts.

## What to Change

### 1. Replace free-form policy field strings with strict literal unions

- Introduce strict type-level contracts for:
  - node-level macro-origin annotation bind fields (coupled to each effect kind)
  - reduce bind fields and reduce macro-origin output fields
- Apply these contracts to `MacroOriginNodeBindingAnnotationSpec` and `ReduceMacroOriginBindingAnnotationSpec`.

### 2. Preserve `as const` + `satisfies` registry declarations

- Keep policy registries as literal arrays with `satisfies` checks so each entry is checked without widening.

### 3. Add compile-time negative type assertions for policy contracts

- Extend unit tests with `@ts-expect-error` assertions proving mis-typed policy fields are rejected by TypeScript.

## Files to Touch

- `packages/engine/src/cnl/binder-surface-registry.ts` (modify)
- `packages/engine/test/unit/binder-surface-registry.test.ts` (modify: add type-level assertions)

## Out of Scope

- Semantics changes to macro-origin annotation behavior
- Changes to AST/runtime payload shapes
- Game data (`GameSpecDoc`, YAML assets) content changes

## Acceptance Criteria

### Tests That Must Pass

1. Mis-typed node-level policy field names fail at compile time.
2. Mis-typed reduce policy `bindField` and `macroOriginField` names fail at compile time.
3. Existing macro-origin behavior/alignment tests remain green.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Macro-origin policy registries are no longer free-form string contracts.
2. `effectKind` and `bindFields` are type-coupled for node-level policy entries.
3. GameDef/simulation behavior remains unchanged.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/binder-surface-registry.test.ts`
   - Add `@ts-expect-error` negative assertions for invalid policy field literals.
   - Keep existing runtime behavior assertions intact.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo lint`

## Outcome

- **Completion date**: 2026-02-27
- **What changed**:
  - Replaced free-form `string` policy contracts with discriminated, effect-coupled literal unions in `binder-surface-registry.ts`.
  - Added strict reduce bind-field to macro-origin-field type mapping (compile-time enforced pairing).
  - Strengthened `binder-surface-registry.test.ts` with `@ts-expect-error` negative type assertions for invalid node and reduce policy entries.
- **Deviations from original plan**:
  - None in behavior/runtime semantics. Scope was refined to explicitly include compile-time negative assertions after reassessing existing runtime coverage.
- **Verification results**:
  - `pnpm -F @ludoforge/engine build` passed.
  - `pnpm -F @ludoforge/engine test` passed (304/304).
  - `pnpm turbo lint` passed.
