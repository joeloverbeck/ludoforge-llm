# CONOPESURREG-001: Add condition operator metadata and replace duplicated condition surface knowledge

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new kernel module plus targeted kernel/CNL consumer refactors
**Deps**: None

## Problem

Condition operator identity and structural field-path knowledge is duplicated across multiple files. No single module answers "what condition operators exist and what are their field shapes?" Per [specs/62-condition-operator-surface-registry.md](../specs/62-condition-operator-surface-registry.md), the right fix is a metadata-only leaf module in `kernel/` and direct adoption by the two current duplication sites.

## Assumption Reassessment (2026-03-14)

1. The `ConditionAST` discriminated union in [`packages/engine/src/kernel/types-ast.ts`](../packages/engine/src/kernel/types-ast.ts) uses these op discriminants: `'and'`, `'or'`, `'not'`, `'=='`, `'!='`, `'<'`, `'<='`, `'>'`, `'>='`, `'in'`, `'adjacent'`, `'connected'`, `'zonePropIncludes'`, `'markerStateAllowed'`, `'markerShiftAllowed'`, plus `boolean` literals.
2. [`packages/engine/src/cnl/compile-conditions.ts`](../packages/engine/src/cnl/compile-conditions.ts) currently maintains a duplicate `SUPPORTED_CONDITION_OPS` list. The ticket must remove that duplication instead of adding a second canonical list beside it.
3. [`packages/engine/src/kernel/zone-selector-aliases.ts`](../packages/engine/src/kernel/zone-selector-aliases.ts) and [`packages/engine/src/kernel/validate-conditions.ts`](../packages/engine/src/kernel/validate-conditions.ts) each currently encode operator-specific structural traversal knowledge inline.
4. There is no existing `condition-operator-meta.ts` file in the codebase.

## Architecture Check

1. A metadata-only module is the lightest viable abstraction because it centralizes only duplicated operator identity and structural field paths, without owning evaluation, lowering, display, or humanization behavior.
2. The module lives in `kernel/` as a leaf file with no imports from CNL or other kernel modules beyond `types-ast.ts` types. This preserves the kernel's agnostic boundary while allowing CNL and kernel validators to consume the same canonical surface.
3. Existing switch-based semantic dispatch remains in place. The architecture should not drift toward a mega-registry that mixes compile-time, runtime, and presentation concerns.
4. No backwards-compatibility shims. New module, direct import by consumers.

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

### 2. Replace the duplicate CNL operator list

- Remove `SUPPORTED_CONDITION_OPS` from [`packages/engine/src/cnl/compile-conditions.ts`](../packages/engine/src/cnl/compile-conditions.ts).
- Import the canonical operator identity from `condition-operator-meta.ts` for unsupported-operator diagnostics.

### 3. Refactor structural traversal consumers

- Refactor [`packages/engine/src/kernel/zone-selector-aliases.ts`](../packages/engine/src/kernel/zone-selector-aliases.ts) to derive condition field walking from operator metadata instead of a per-operator switch.
- Refactor [`packages/engine/src/kernel/validate-conditions.ts`](../packages/engine/src/kernel/validate-conditions.ts) to use metadata for generic structural walking while retaining targeted operator-specific validation branches where behavior is truly semantic.

### 4. Per-operator metadata entries

Populate the metadata map with correct field paths for each operator. Examples:
- `'=='`: `{ category: 'comparison', valueFields: ['left', 'right'] }`
- `'adjacent'`: `{ category: 'spatial', zoneSelectorFields: ['left', 'right'] }`
- `'and'`: `{ category: 'boolean', nestedConditionFields: ['args'] }` (note: `args` is an array field)
- `'markerStateAllowed'`: `{ category: 'marker', zoneSelectorFields: ['space'], valueFields: ['state'] }`
- `'connected'`: `{ category: 'spatial', zoneSelectorFields: ['from', 'to'], nestedConditionFields: ['via'] }`

Verify every field path against the actual `ConditionAST` type definitions in `types-ast.ts`.

## Files to Touch

- `packages/engine/src/kernel/condition-operator-meta.ts` (new)
- `packages/engine/src/cnl/compile-conditions.ts`
- `packages/engine/src/kernel/zone-selector-aliases.ts`
- `packages/engine/src/kernel/validate-conditions.ts`
- `packages/engine/test/unit/kernel/condition-operator-meta.test.ts` (new)
- Relevant existing tests under `packages/engine/test/unit/` for CNL lowering, zone-selector aliases, and GameDef validation as needed

## Out of Scope

- Modifying `types-ast.ts` or the `ConditionAST` union in any way
- Modifying any switch-based dispatch files (`eval-condition.ts`, `ast-to-display.ts`, etc.)
- Runtime evaluation, CNL lowering, display, blocker extraction, or humanization logic
- Game-specific rule changes

## Acceptance Criteria

### Tests That Must Pass

1. `isConditionOperator` returns `true` for every operator in the tuple and `false` for non-operators.
2. `getConditionOperatorMeta` returns metadata for every operator.
3. `CONDITION_OPERATORS` tuple has no duplicates.
4. Every `ConditionOperator` in the tuple is a valid `ConditionAST['op']` discriminant.
5. [`packages/engine/src/cnl/compile-conditions.ts`](../packages/engine/src/cnl/compile-conditions.ts) no longer maintains its own hard-coded `SUPPORTED_CONDITION_OPS` list.
6. Condition traversal in [`packages/engine/src/kernel/zone-selector-aliases.ts`](../packages/engine/src/kernel/zone-selector-aliases.ts) is derived from metadata rather than a per-operator switch.
7. Structural walking in [`packages/engine/src/kernel/validate-conditions.ts`](../packages/engine/src/kernel/validate-conditions.ts) uses metadata while preserving targeted semantic validation checks.
8. Existing suite: `pnpm turbo test` — no regressions.
9. `pnpm turbo typecheck` passes.
10. `pnpm turbo lint` passes.

### Invariants

1. `condition-operator-meta.ts` is a leaf module — it imports only from `types-ast.ts` (for type references) and has no other kernel/CNL imports.
2. `ConditionAST` discriminated union in `types-ast.ts` is unchanged.
3. Existing semantic switches outside the two duplication sites remain explicit and local.
4. No game-specific logic introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/condition-operator-meta.test.ts` — unit tests for operator identity, type guard, metadata completeness, and field-path validity.
2. `packages/engine/test/unit/compile-conditions.test.ts` — strengthen coverage to prove unsupported-condition diagnostics use the canonical operator set.
3. `packages/engine/test/unit/kernel/zone-selector-aliases.test.ts` — strengthen coverage for metadata-driven traversal across nested condition/value/query shapes.
4. `packages/engine/test/unit/validate-gamedef.test.ts` — strengthen coverage for metadata-driven structural validation where condition operands recurse through shared field metadata.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

## Outcome

- Completed: 2026-03-14
- What changed:
  - Added `packages/engine/src/kernel/condition-operator-meta.ts` as the canonical condition-operator identity and structural metadata leaf module.
  - Removed the duplicate `SUPPORTED_CONDITION_OPS` list from `packages/engine/src/cnl/compile-conditions.ts` in favor of the canonical registry.
  - Refactored `packages/engine/src/kernel/zone-selector-aliases.ts` and `packages/engine/src/kernel/validate-conditions.ts` to use metadata-driven structural traversal while preserving explicit semantic validation branches.
  - Hardened `packages/engine/src/kernel/boolean-arity-policy.ts` so malformed boolean nodes report diagnostics instead of throwing.
  - Added and strengthened unit coverage for operator metadata, CNL unsupported-operator diagnostics, metadata-driven alias traversal, and malformed boolean-condition validation.
- Deviations from original plan:
  - The ticket was corrected before implementation because it originally scoped the work too narrowly and pointed at the wrong CNL file path.
  - A small shared-validator robustness fix (`isNonEmptyArray`) was added because the refactor exposed an existing malformed-node crash.
- Verification results:
  - `node --test packages/engine/dist/test/unit/kernel/condition-operator-meta.test.js packages/engine/dist/test/unit/kernel/zone-selector-aliases.test.js packages/engine/dist/test/unit/compile-conditions.test.js packages/engine/dist/test/unit/validate-gamedef.test.js`
  - `pnpm turbo test`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
