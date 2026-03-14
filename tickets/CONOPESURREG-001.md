# CONOPESURREG-001: Create condition-operator-meta.ts with canonical operator set and structural metadata

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new kernel module
**Deps**: None

## Problem

Condition operator identity and structural field-path knowledge is duplicated across multiple files. No single module answers "what condition operators exist and what are their field shapes?" This ticket creates that module as a metadata-only leaf file in `kernel/`.

## Assumption Reassessment (2026-03-14)

1. The `ConditionAST` discriminated union in `types-ast.ts` (lines 138–175) uses these op discriminants: `'and'`, `'or'`, `'not'`, `'=='`, `'!='`, `'<'`, `'<='`, `'>'`, `'>='`, `'in'`, `'adjacent'`, `'connected'`, `'zonePropIncludes'`, `'markerStateAllowed'`, `'markerShiftAllowed'`, plus `boolean` literals.
2. The spec's proposed `CONDITION_OPERATORS` array used placeholder names (`'eq'`, `'neq'`, `'includes'`, `'isEmpty'`). The real implementation must use the actual AST op strings listed above.
3. There is no existing `condition-operator-meta.ts` file in the codebase.

## Architecture Check

1. A metadata-only module is the lightest viable abstraction — it declares identity and structure without owning behavior.
2. The module lives in `kernel/` as a leaf file with no imports from CNL or other kernel modules beyond `types-ast.ts` types. This preserves the kernel's agnostic boundary.
3. No backwards-compatibility shims. New module, direct import by consumers.

## What to Change

### 1. Create `condition-operator-meta.ts`

Define:
- `CONDITION_OPERATORS` — a `readonly` tuple of all condition op strings matching `ConditionAST`'s union discriminants (excluding `boolean` literal, which is not an operator).
- `ConditionOperator` — derived union type from the tuple.
- `isConditionOperator(op: string): op is ConditionOperator` — type guard.
- `ConditionOperatorMeta` interface with fields:
  - `op: ConditionOperator`
  - `category: 'boolean' | 'comparison' | 'spatial' | 'marker' | 'membership'`
  - `valueFields?: readonly string[]` — fields containing `ValueExpr`
  - `numericValueFields?: readonly string[]` — fields containing `NumericValueExpr`
  - `zoneSelectorFields?: readonly string[]` — fields containing `ZoneSel`
  - `nestedConditionFields?: readonly string[]` — fields containing nested `ConditionAST`
- `CONDITION_OPERATOR_META` — `ReadonlyMap<ConditionOperator, ConditionOperatorMeta>` populated for all operators.
- `getConditionOperatorMeta(op: ConditionOperator): ConditionOperatorMeta` — lookup helper.

### 2. Per-operator metadata entries

Populate the metadata map with correct field paths for each operator. Examples:
- `'=='`: `{ category: 'comparison', valueFields: ['left', 'right'] }`
- `'adjacent'`: `{ category: 'spatial', zoneSelectorFields: ['left', 'right'] }`
- `'and'`: `{ category: 'boolean', nestedConditionFields: ['args'] }` (note: `args` is an array field)
- `'markerStateAllowed'`: `{ category: 'marker', zoneSelectorFields: ['space'], valueFields: ['state'] }`
- `'connected'`: `{ category: 'spatial', zoneSelectorFields: ['from', 'to'], nestedConditionFields: ['via'] }`

Verify every field path against the actual `ConditionAST` type definitions in `types-ast.ts`.

## Files to Touch

- `packages/engine/src/kernel/condition-operator-meta.ts` (new)

## Out of Scope

- Modifying `types-ast.ts` or the `ConditionAST` union in any way
- Modifying any consumer files (`compile-conditions.ts`, `zone-selector-aliases.ts`, `validate-conditions.ts`)
- Modifying any switch-based dispatch files (`eval-condition.ts`, `ast-to-display.ts`, etc.)
- Runtime evaluation, CNL lowering, display, blocker extraction, or humanization logic
- Game-specific rule changes

## Acceptance Criteria

### Tests That Must Pass

1. `isConditionOperator` returns `true` for every operator in the tuple and `false` for non-operators.
2. `getConditionOperatorMeta` returns metadata for every operator.
3. `CONDITION_OPERATORS` tuple has no duplicates.
4. Every `ConditionOperator` in the tuple is a valid `ConditionAST['op']` discriminant.
5. Existing suite: `pnpm turbo test` — no regressions.
6. `pnpm turbo typecheck` passes.
7. `pnpm turbo lint` passes.

### Invariants

1. `condition-operator-meta.ts` is a leaf module — it imports only from `types-ast.ts` (for type references) and has no other kernel/CNL imports.
2. `ConditionAST` discriminated union in `types-ast.ts` is unchanged.
3. No game-specific logic introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/condition-operator-meta.test.ts` — unit tests for operator identity, type guard, metadata completeness, and field-path validity.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck && pnpm turbo lint`
