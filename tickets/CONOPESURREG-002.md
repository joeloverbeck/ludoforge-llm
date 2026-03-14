# CONOPESURREG-002: Add metadata completeness and correctness tests

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — new test file
**Deps**: CONOPESURREG-001

## Problem

The metadata module from CONOPESURREG-001 must be proven correct against the actual `ConditionAST` type definition. Without completeness tests, metadata could drift from the AST union, silently breaking consumers that rely on it. This ticket adds the critical safety-net tests before any consumer is migrated.

## Assumption Reassessment (2026-03-14)

1. `ConditionAST` in `types-ast.ts` is a discriminated union with `op` as the discriminant field. Comparison operators (`'=='`, `'!='`, etc.) are grouped in one union member.
2. TypeScript can extract union discriminant values at the type level but not at runtime. Tests will need a strategy to verify completeness — either by importing a known complete set from tests or by using type-level assertions plus runtime spot-checks.
3. `boolean` is a `ConditionAST` member but is not an "operator" — it should be excluded from the metadata map. Tests must account for this.

## Architecture Check

1. Tests validate the metadata module independently before any consumer refactoring, reducing risk in subsequent tickets.
2. No production code changes — pure test addition.
3. No shims or compatibility layers.

## What to Change

### 1. Create completeness test file

Write tests proving:
- Every operator in `CONDITION_OPERATORS` is a valid `ConditionAST` op discriminant (type-level assertion or runtime check).
- Every `ConditionAST` op discriminant (except `boolean` literal) has a corresponding entry in `CONDITION_OPERATOR_META`.
- `CONDITION_OPERATORS` tuple length matches the number of entries in `CONDITION_OPERATOR_META`.
- No duplicate entries in `CONDITION_OPERATORS`.

### 2. Create field-path validity tests

Write tests proving:
- Every field listed in `valueFields`, `numericValueFields`, `zoneSelectorFields`, and `nestedConditionFields` for each operator actually exists on the corresponding `ConditionAST` variant.
- This requires constructing minimal AST nodes for each operator and verifying the declared fields are present.

### 3. Create type guard tests

- `isConditionOperator('==')` returns `true`
- `isConditionOperator('nonexistent')` returns `false`
- `isConditionOperator('')` returns `false`

## Files to Touch

- `packages/engine/test/unit/kernel/condition-operator-meta.test.ts` (new)

## Out of Scope

- Modifying the metadata module itself (bugs found here should be fixed in a follow-up or by returning to CONOPESURREG-001)
- Modifying `types-ast.ts`
- Any consumer refactoring (`compile-conditions.ts`, `zone-selector-aliases.ts`, `validate-conditions.ts`)
- Tests for runtime evaluation, display, or other switch-based consumers

## Acceptance Criteria

### Tests That Must Pass

1. Completeness: every `ConditionAST` op variant (excluding `boolean`) has metadata.
2. Completeness: every metadata entry's `op` is a valid `ConditionAST` discriminant.
3. Tuple/map size match: `CONDITION_OPERATORS.length === CONDITION_OPERATOR_META.size`.
4. No duplicates in `CONDITION_OPERATORS`.
5. Field validity: all declared field paths exist on their respective AST node types.
6. Type guard: `isConditionOperator` correctly classifies valid and invalid inputs.
7. Existing suite: `pnpm -F @ludoforge/engine test` — no regressions.

### Invariants

1. No production code modified.
2. `ConditionAST` unchanged.
3. Tests are deterministic and do not depend on external state.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/condition-operator-meta.test.ts` — completeness, field validity, type guard, no-duplicates assertions.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
