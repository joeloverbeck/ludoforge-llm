# 122CROSEAVIC-006: Add `seatAgg` to static analyzer and diagnostics

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — agents/policy-expr, agents/policy-diagnostics
**Deps**: `archive/tickets/122CROSEAVIC-001.md`

## Problem

The policy expression static analyzer (`policy-expr.ts`) and diagnostic formatter (`policy-diagnostics.ts`) do not recognize the `seatAgg` variant. Without analyzer support, `seatAgg` expressions are invisible to compile-time dependency tracking. Without diagnostic support, `seatAgg` nodes produce incomplete or missing output in diagnostic logs.

## Assumption Reassessment (2026-04-09)

1. `KnownOperator` union and `KNOWN_OPERATORS` set in `packages/engine/src/agents/policy-expr.ts` (lines 54-117) — confirmed. All expression kinds are listed here for static analysis dispatch.
2. `analyzePolicyExpr()` dispatches on `expr.kind` — confirmed. Each aggregation operator has a corresponding `analyze*Operator()` function (e.g., `analyzeGlobalTokenAggOperator()` at line ~1010).
3. `packages/engine/src/agents/policy-diagnostics.ts` formats expression nodes for diagnostic output — confirmed.

## Architecture Check

1. Follows the exact pattern of existing aggregation operator analysis — add to known operators, implement an analysis function that tracks dependencies in the inner expression.
2. The `seatAgg` inner `expr` may reference `$seat`-bound surfaces — the analyzer should track these as seat-context-dependent references.
3. No backwards-compatibility shims.

## What to Change

### 1. Add `seatAgg` to static analyzer (policy-expr.ts)

1. Add `'seatAgg'` to the `KnownOperator` union type.
2. Add `'seatAgg'` to the `KNOWN_OPERATORS` set.
3. Implement `analyzeSeatAggOperator()`:
   - Recursively analyze the inner `expr` for dependencies and references.
   - Track that references within the inner `expr` may use `$seat` context.
   - Return dependency metadata consistent with other aggregation operators.
4. Add the `case 'seatAgg':` dispatch in the main analysis function.

### 2. Add diagnostic output for `seatAgg` (policy-diagnostics.ts)

Add formatting for `seatAgg` expression nodes in the diagnostic output. Include `over`, `aggOp`, and a recursive format of the inner `expr`.

### 3. Unit tests

Test cases:
- `seatAgg` expression is recognized by the static analyzer.
- Dependencies within the inner `expr` are tracked correctly.
- Diagnostic output for `seatAgg` includes `over`, `aggOp`, and inner expression.

## Files to Touch

- `packages/engine/src/agents/policy-expr.ts` (modify)
- `packages/engine/src/agents/policy-diagnostics.ts` (modify)
- `packages/engine/test/unit/agents/policy-expr.test.ts` (modify — add seatAgg analysis tests)

## Out of Scope

- Compilation (ticket 003)
- Runtime evaluation (ticket 005)
- Validation (ticket 004)

## Acceptance Criteria

### Tests That Must Pass

1. `seatAgg` is included in `KNOWN_OPERATORS`.
2. `analyzeSeatAggOperator()` correctly tracks dependencies in the inner expression.
3. Diagnostic output for a `seatAgg` node is well-formed and includes all fields.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. All existing operator analysis and diagnostic formatting unchanged.
2. Static analysis of `seatAgg` tracks the same dependency metadata as other aggregation operators.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-expr.test.ts` — add `seatAgg` static analysis tests

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
