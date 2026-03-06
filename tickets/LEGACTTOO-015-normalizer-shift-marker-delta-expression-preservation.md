# LEGACTTOO-015: Normalizer — Shift Marker Delta Expression Preservation

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — `tooltip-ir.ts` (minor type extension), `tooltip-normalizer.ts` (two function updates)
**Deps**: archive/tickets/LEGACTTOO/LEGACTTOO-012-normalizer-transfer-amount-expr-and-moveall-filter.md

## Problem

`normalizeShiftMarker` and `normalizeShiftGlobalMarker` both coerce non-literal `delta` expressions to `0` via `typeof delta === 'number' ? delta : 0`. This is the exact same lossy pattern that LEGACTTOO-012 fixed for `normalizeTransferVar`. A binding like `{ ref: 'binding', name: 'shiftAmount' }` silently becomes `amount: 0` and `direction: '+'` in the `ShiftMessage`, losing the expression entirely.

Downstream tooltip renderers (LEGACTTOO-006/007) would produce "Shift support +0" instead of "Shift support by shiftAmount".

## Assumption Reassessment (2026-03-06)

1. `shiftMarker` in `types-ast.ts` has `delta: NumericValueExpr` — can be literal or expression.
2. `shiftGlobalMarker` in `types-ast.ts` has `delta: NumericValueExpr` — same contract.
3. `ShiftMessage` in `tooltip-ir.ts` has `amount: number` and `direction: string` — no way to represent non-literal deltas.
4. `stringifyNumericExpr` already exists in `tooltip-normalizer.ts` and was used by LEGACTTOO-012 for the same pattern.
5. No existing ticket covers this gap. LEGACTTOO-013 covers scope context (different concern). LEGACTTOO-014 covers dispatch refactoring (structural, no data loss fix).

## Architecture Check

1. Adding `deltaExpr?: string` to `ShiftMessage` follows the same optional-field extension pattern used by LEGACTTOO-012 (`amountExpr` on `TransferMessage`) and existing conventions (`toggle?` on `SetMessage`, `variant?` on `MoveMessage`, `filter?` on movement messages).
2. No game-specific logic introduced — expression stringification is purely structural.
3. No backwards-compatibility shims — existing consumers that don't use the new field continue unchanged.

## What to Change

### 1. Extend `ShiftMessage` in `tooltip-ir.ts`

Add `readonly deltaExpr?: string`. When `delta` is a literal number, `deltaExpr` is omitted. When `delta` is an expression, `amount` remains `0` (existing behavior) and `deltaExpr` captures the stringified expression.

### 2. Update `normalizeShiftMarker` in `tooltip-normalizer.ts`

When `delta` is non-literal, set `deltaExpr: stringifyNumericExpr(delta)`.

### 3. Update `normalizeShiftGlobalMarker` in `tooltip-normalizer.ts`

Same change as `normalizeShiftMarker`.

## Files to Touch

- `packages/engine/src/kernel/tooltip-ir.ts` (modify — add `deltaExpr` to `ShiftMessage`)
- `packages/engine/src/kernel/tooltip-normalizer.ts` (modify — two function updates)
- `packages/engine/test/unit/kernel/tooltip-normalizer.test.ts` (modify — add tests for new field)

## Out of Scope

- Content planner integration of `deltaExpr` (LEGACTTOO-006)
- Template rendering of `deltaExpr` (LEGACTTOO-007)
- Deep expression stringification beyond `stringifyNumericExpr`

## Acceptance Criteria

### Tests That Must Pass

1. `shiftMarker` with literal delta → `ShiftMessage` with `amount: N`, no `deltaExpr`
2. `shiftMarker` with binding expression → `ShiftMessage` with `amount: 0`, `deltaExpr: 'bindingName'`
3. `shiftGlobalMarker` with literal delta → `ShiftMessage` with `amount: N`, no `deltaExpr`
4. `shiftGlobalMarker` with binding expression → `ShiftMessage` with `amount: 0`, `deltaExpr: 'bindingName'`
5. Existing suite: `pnpm -F @ludoforge/engine test:unit`

### Invariants

1. Existing tests continue to pass without modification (new field is optional).
2. No game-specific logic in expression stringification.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/tooltip-normalizer.test.ts` — add 4 tests for delta expression preservation (2 shiftMarker, 2 shiftGlobalMarker: literal vs expression)

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm turbo typecheck`
