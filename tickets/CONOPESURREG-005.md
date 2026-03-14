# CONOPESURREG-005: Refactor validate-conditions.ts structural field walking to use metadata

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel refactor
**Deps**: CONOPESURREG-001, CONOPESURREG-002

## Problem

`validate-conditions.ts` (lines ~20–137) contains a switch statement that independently encodes which fields of each condition operator contain nested `ConditionAST`, `ValueExpr`, `NumericValueExpr`, and `ZoneSel` nodes. The structural field-walking portion of this switch duplicates knowledge now captured in `CONDITION_OPERATOR_META`. The generic traversal should use metadata, while operator-specific validation logic (marker lattice checks, connected literal-only constraints, etc.) remains in targeted branches.

## Assumption Reassessment (2026-03-14)

1. The switch in `validate-conditions.ts` handles two concerns interleaved:
   - **Structural traversal**: recursing into child nodes (ValueExpr, ZoneSel, ConditionAST) for generic validation (e.g., variable reference checks).
   - **Operator-specific validation**: marker lattice state validation for `markerStateAllowed` (lines 74–84), comparison operators' marker state literal handling (lines 91–135), `'and'`/`'or'` non-empty args check (lines 31–45), `'connected'` via-field optionality.
2. The spec explicitly says: "use metadata for structural field walking, keeping only operator-specific validation logic (e.g., `markerStateAllowed` lattice checks, `connected` literal-only constraints) in targeted branches."
3. The refactored code must separate generic traversal (metadata-driven) from operator-specific checks (kept as explicit branches/conditions).

## Architecture Check

1. This is the most nuanced refactoring ticket. The key design decision is how to split generic traversal from operator-specific checks without making the code harder to follow.
2. Recommended approach: extract a generic `validateConditionFields(condition, meta, ...)` function that walks all declared fields, then call operator-specific validation after the generic walk for operators that need it.
3. Operator-specific branches that remain:
   - `'and'`/`'or'`: non-empty `args` check
   - `'markerStateAllowed'`: marker lattice state validation
   - `'markerShiftAllowed'`: numeric delta validation specifics (if any beyond generic)
   - Comparison operators (`'=='` etc.): marker state literal handling on `left`/`right`
   - `'connected'`: `via` optionality and literal-only constraints

## What to Change

### 1. Import metadata

Add import of `CONDITION_OPERATOR_META`, `getConditionOperatorMeta` from `condition-operator-meta.ts`.

### 2. Extract generic field validation

Create a helper function (local or exported) that, given a `ConditionAST` node and its metadata:
- Iterates `valueFields` and validates each `ValueExpr` child.
- Iterates `numericValueFields` and validates each `NumericValueExpr` child.
- Iterates `zoneSelectorFields` and validates each `ZoneSel` child.
- Iterates `nestedConditionFields` and recursively validates each `ConditionAST` child (handling arrays like `args`).

### 3. Keep operator-specific validation as targeted branches

After generic traversal, apply operator-specific checks where needed:
- `'and'`/`'or'`: validate `args.length > 0`.
- `'markerStateAllowed'`: validate marker lattice state references.
- Comparison ops: validate marker state literal patterns on `left`/`right`.
- `'connected'`: validate `via` optionality and literal constraints.

### 4. Remove the per-operator switch for structural walking

The existing exhaustive switch for field-path traversal is replaced by metadata iteration. Operator-specific checks can be a smaller switch, `if` chain, or map lookup — whichever is most readable.

## Files to Touch

- `packages/engine/src/kernel/validate-conditions.ts` (modify)

## Out of Scope

- Modifying `zone-selector-aliases.ts` (that is CONOPESURREG-004)
- Modifying `condition-operator-meta.ts` (if metadata changes are needed, go back to CONOPESURREG-001)
- Modifying `types-ast.ts`
- Modifying any other switch-based dispatch files (`eval-condition.ts`, `ast-to-display.ts`, etc.)
- Changing the operator-specific validation rules themselves — only how structural traversal is performed changes

## Acceptance Criteria

### Tests That Must Pass

1. All existing `validate-conditions` tests pass unchanged — validation behavior is identical.
2. Invalid conditions still produce the same error messages/diagnostics.
3. Marker lattice validation still catches invalid marker state references.
4. Comparison operator marker state literal handling still works correctly.
5. Existing suite: `pnpm -F @ludoforge/engine test` — no regressions.
6. `pnpm turbo typecheck` passes.
7. `pnpm turbo lint` passes.

### Invariants

1. Validation behavior is unchanged — same valid inputs pass, same invalid inputs fail with the same errors.
2. Operator-specific validation logic (lattice checks, literal constraints) is preserved — not lost in the generic traversal.
3. `ConditionAST` union unchanged.
4. No game-specific logic introduced.
5. All other files remain untouched.

## Test Plan

### New/Modified Tests

1. No new test file needed. Existing validation tests cover the behavior. If coverage is thin for specific operator validation edge cases (e.g., `markerStateAllowed` lattice checks), add targeted test cases in the existing test file.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck && pnpm turbo lint`
