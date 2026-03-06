# LEGACTTOO-012: Normalizer — Transfer Amount Expression & moveAll Filter Preservation

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — `tooltip-ir.ts` (minor type extension), `tooltip-normalizer.ts` (two function updates)
**Deps**: archive/tickets/LEGACTTOO/LEGACTTOO-004-core-normalizer-variable-token-marker-rules.md

## Problem

Two normalizer rules silently discard information from the EffectAST:

1. `normalizeTransferVar` converts non-literal `amount` expressions to `0`, which is semantically misleading. A binding like `{ ref: 'binding', name: 'x' }` becomes `amount: 0` in the `TransferMessage`, losing the expression entirely.
2. `normalizeMoveAll` ignores the optional `filter?: ConditionAST` field on the `moveAll` AST node. "Move all tokens matching condition X" becomes "move all", losing the filter.

Both cause downstream tooltip renderers (LEGACTTOO-006/007) to produce inaccurate or incomplete text.

## Assumption Reassessment (2026-03-06)

1. `TransferMessage` in `tooltip-ir.ts` has `amount: number` — no way to represent non-literal amounts.
2. `moveAll` in `types-ast.ts` has `readonly filter?: ConditionAST` — an optional condition that restricts which tokens move.
3. `MoveMessage`, `PlaceMessage`, `RemoveMessage` have no `filter` field to capture this information.
4. The normalizer is a leaf-effect-only module — it doesn't need to evaluate conditions, just preserve them as strings.

## Architecture Check

1. Adding optional fields to existing IR types is non-breaking and follows the extensibility pattern already used (`toggle?: boolean` on `SetMessage`, `variant?: 'adjacent'` on `MoveMessage`).
2. No game-specific logic introduced — filter stringification is purely structural.
3. No backwards-compatibility shims — existing consumers that don't use the new fields continue working unchanged.

## What to Change

### 1. Extend `TransferMessage` in `tooltip-ir.ts`

Add `readonly amountExpr?: string` for non-literal amounts. When `amount` is a literal number, `amountExpr` is omitted. When `amount` is an expression, `amount` is set to `0` (existing behavior) and `amountExpr` captures the stringified expression.

### 2. Add `filter` field to `PlaceMessage`, `MoveMessage`, `RemoveMessage` in `tooltip-ir.ts`

Add `readonly filter?: string` to all three types. Populated by `normalizeMoveAll` when the AST node has a `filter` field.

### 3. Update `normalizeTransferVar` in `tooltip-normalizer.ts`

When `amount` is non-literal, set `amountExpr: stringifyNumericExpr(amount)`.

### 4. Update `normalizeMoveAll` in `tooltip-normalizer.ts`

When `payload.moveAll.filter` is defined, stringify it and include `filter` in the output message. Use a simple `'<condition>'` placeholder or a shallow stringification of the condition AST.

## Files to Touch

- `packages/engine/src/kernel/tooltip-ir.ts` (modify — add `amountExpr` to `TransferMessage`, `filter` to movement messages)
- `packages/engine/src/kernel/tooltip-normalizer.ts` (modify — two function updates)
- `packages/engine/test/unit/kernel/tooltip-normalizer.test.ts` (modify — add tests for new fields)

## Out of Scope

- Deep condition AST stringification (use `'<condition>'` placeholder for now)
- Content planner integration (LEGACTTOO-006)
- Template rendering of these new fields (LEGACTTOO-007)

## Acceptance Criteria

### Tests That Must Pass

1. `transferVar` with literal amount → `TransferMessage` with `amount: N`, no `amountExpr`
2. `transferVar` with binding expression → `TransferMessage` with `amount: 0`, `amountExpr: 'bindingName'`
3. `moveAll` without filter → no `filter` field on output message
4. `moveAll` with filter → `filter: '<condition>'` on output message
5. Existing suite: `pnpm -F @ludoforge/engine test:unit`

### Invariants

1. Existing tests continue to pass without modification (new fields are optional).
2. No game-specific logic in filter stringification.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/tooltip-normalizer.test.ts` — add 4 tests for expression preservation (2 transfer, 2 moveAll filter)

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm turbo typecheck`

## Outcome

**Completion date**: 2026-03-06

- **What actually changed**:
  - `packages/engine/src/kernel/tooltip-ir.ts` — added `amountExpr?: string` to `TransferMessage`, `filter?: string` to `PlaceMessage`, `MoveMessage`, `RemoveMessage`
  - `packages/engine/src/kernel/tooltip-normalizer.ts` — updated `normalizeTransferVar` to capture non-literal amount expressions via `stringifyNumericExpr`; updated `normalizeMoveAll` to propagate `filter: '<condition>'` when the AST node has a `filter` field
  - `packages/engine/test/unit/kernel/tooltip-normalizer.test.ts` — added 4 new tests (2 transfer expression, 2 moveAll filter)
- **Deviation from plan**: None. All changes matched the ticket scope exactly.
