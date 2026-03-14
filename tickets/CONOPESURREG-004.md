# CONOPESURREG-004: Refactor zone-selector-aliases.ts to use metadata-driven field-path traversal

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel refactor
**Deps**: CONOPESURREG-001, CONOPESURREG-002

## Problem

`zone-selector-aliases.ts` (lines ~198–247) contains a per-operator switch that independently encodes which fields of each condition operator contain `ZoneSel` nodes. This duplicates structural knowledge that is now captured in `CONDITION_OPERATOR_META`. The switch should be replaced with metadata-driven iteration over `zoneSelectorFields`, `valueFields` (which may contain nested zone selectors), and `nestedConditionFields`.

## Assumption Reassessment (2026-03-14)

1. The switch in `zone-selector-aliases.ts` handles conditions by walking operator-specific fields recursively to find `ZoneSel` nodes for alias expansion.
2. Operator-specific field paths (verified against code):
   - `'=='`, `'!='`, `'<'`, `'<='`, `'>'`, `'>='`: walks `left` and `right` (ValueExpr)
   - `'adjacent'`: walks `left` and `right` (ZoneSel)
   - `'connected'`: walks `from`, `to` (ZoneSel), optional `via` (ConditionAST)
   - `'zonePropIncludes'`: walks `zone` (ZoneSel) and `value` (ValueExpr)
   - `'markerStateAllowed'`: walks `space` (ZoneSel) and `state` (ValueExpr)
   - `'markerShiftAllowed'`: walks `space` (ZoneSel) and `delta` (NumericValueExpr)
   - `'and'`, `'or'`: walks `args` array (ConditionAST[])
   - `'not'`: walks `arg` (ConditionAST)
   - `'in'`: walks `item` and `set` (ValueExpr)
3. The exhaustiveness guard (`const exhaustive: never = condition`) at lines 242–245 ensures compile-time safety. After refactoring, this guard can be removed since metadata iteration covers all operators.

## Architecture Check

1. Metadata-driven traversal eliminates the duplicated field-path knowledge. When a new operator is added, only the metadata map needs updating — not this file.
2. The refactored code should remain readable — a generic loop over metadata fields with appropriate helper functions for each field type (ZoneSel, ValueExpr, ConditionAST).
3. If readability suffers, consider keeping the metadata-driven approach but with inline comments explaining the traversal. The spec explicitly warns against over-abstracting.

## What to Change

### 1. Import metadata

Add import of `CONDITION_OPERATOR_META` and `getConditionOperatorMeta` from `condition-operator-meta.ts`.

### 2. Replace per-operator switch with metadata-driven traversal

Replace the condition operator switch (lines ~198–247) with a generic traversal:

```
const meta = getConditionOperatorMeta(condition.op);
// Walk zoneSelectorFields → extract ZoneSel alias
// Walk valueFields → recurse into ValueExpr for nested ZoneSel
// Walk numericValueFields → recurse into NumericValueExpr for nested ZoneSel
// Walk nestedConditionFields → recurse into ConditionAST
```

Handle array fields (like `args` in `'and'`/`'or'`) correctly — the metadata should indicate whether a field is an array or scalar, or the traversal code should handle both.

### 3. Handle array vs scalar fields

The `args` field in `'and'`/`'or'` is an array of `ConditionAST`, while `arg` in `'not'` is a single `ConditionAST`. The metadata must distinguish these, or the traversal code must detect arrays at runtime. Choose the simpler approach.

## Files to Touch

- `packages/engine/src/kernel/zone-selector-aliases.ts` (modify)

## Out of Scope

- Modifying `validate-conditions.ts` (that is CONOPESURREG-005)
- Modifying `condition-operator-meta.ts` (if metadata changes are needed, go back to CONOPESURREG-001 or do a follow-up)
- Modifying `types-ast.ts`
- Modifying any other switch-based dispatch files
- Changing the zone-selector alias expansion logic itself — only the traversal method changes

## Acceptance Criteria

### Tests That Must Pass

1. All existing zone-selector alias tests pass unchanged — behavior is identical.
2. Zone alias expansion produces the same results for all condition operators as before the refactor.
3. No per-operator switch for field-path traversal remains in `zone-selector-aliases.ts` for conditions.
4. Existing suite: `pnpm -F @ludoforge/engine test` — no regressions.
5. `pnpm turbo typecheck` passes.
6. `pnpm turbo lint` passes.

### Invariants

1. Zone-selector alias expansion behavior is unchanged — same inputs produce same outputs.
2. `ConditionAST` union unchanged.
3. No game-specific logic introduced.
4. All other switch statements in other files remain untouched.

## Test Plan

### New/Modified Tests

1. No new test file needed. Existing zone-selector alias tests validate behavior. If coverage is thin for condition-specific alias expansion, add targeted test cases in the existing test file.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck && pnpm turbo lint`
