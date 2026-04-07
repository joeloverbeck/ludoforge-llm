# 118PROBOUCAT-004: Internalize `eval-query.ts` 2 catch blocks into result-returning functions

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel eval-query module
**Deps**: None

## Problem

`eval-query.ts` has 2 catch blocks (lines ~46 and ~587) that call `isRecoverableEvalResolutionError` and return plain fallback values (`null` and `[]` respectively) instead of `ProbeResult`. These are internal evaluation helpers where the catch-classify pattern can be internalized into result-returning wrapper functions, eliminating the try-catch from callers.

## Assumption Reassessment (2026-04-07)

1. `eval-query.ts` exists at `packages/engine/src/kernel/eval-query.ts` — confirmed.
2. Catch block at line ~46: wraps a `typeof bound === 'number' ? bound : evalValue(bound, ctx)` call, catches `isRecoverableEvalResolutionError`, returns `null` — confirmed.
3. Catch block at line ~587: wraps an eval call, catches `isRecoverableEvalResolutionError`, returns `[]` — confirmed.
4. `isRecoverableEvalResolutionError` is defined in `eval-error-classification.ts:20-26`, checks for `DIVISION_BY_ZERO`, `MISSING_BINDING`, or `MISSING_VAR` error codes — confirmed.
5. Both catch sites have exactly one caller each — the blast radius is localized.

## Architecture Check

1. Internalizing the try-catch into a result-returning function is cleaner — callers get a value or `null`/`[]` without needing to know about error classification.
2. No game-specific logic — these are generic evaluation helpers operating on value expressions.
3. No backwards-compatibility shims — the old try-catch callers are replaced with the new wrapper calls.

## What to Change

### 1. Add `tryResolveIntDomainBound` (or similar) for the line ~46 catch block

Create a result-returning wrapper that internalizes the try-catch:

```typescript
export const tryResolveIntDomainBound = (
  bound: NumericValueExpr,
  ctx: ReadContext,
): number | null => {
  try {
    const value = typeof bound === 'number' ? bound : evalValue(bound, ctx);
    return typeof value === 'number' && Number.isSafeInteger(value) ? value : null;
  } catch (error) {
    if (isRecoverableEvalResolutionError(error)) return null;
    throw error;
  }
};
```

Replace the caller to use this wrapper instead of its own try-catch.

### 2. Add result-returning wrapper for the line ~587 catch block

Same pattern — create a wrapper that returns `readonly T[]` or `[]` on recoverable errors. The exact name should match the function's purpose (examine the call site to determine the right name).

Replace the caller to use this wrapper.

### 3. Unit tests for new wrappers

Test each wrapper:
- Returns the expected value on success
- Returns `null`/`[]` on recoverable eval errors (MISSING_BINDING, MISSING_VAR, DIVISION_BY_ZERO)
- Re-throws non-recoverable errors

## Files to Touch

- `packages/engine/src/kernel/eval-query.ts` (modify)
- `packages/engine/test/kernel/eval-query.test.ts` (modify — add wrapper tests)

## Out of Scope

- Changing `isRecoverableEvalResolutionError` signature or behavior
- Migrating catch blocks in other files
- Making `evalValue` or `evalCondition` themselves result-returning (that would be Group C scope)
- Group A, C, or D migration work

## Acceptance Criteria

### Tests That Must Pass

1. New wrapper returns expected value on successful evaluation
2. New wrapper returns `null`/`[]` for recoverable errors (MISSING_BINDING, MISSING_VAR, DIVISION_BY_ZERO)
3. New wrapper re-throws non-recoverable errors
4. `isRecoverableEvalResolutionError` is no longer called in catch blocks in `eval-query.ts` — it is internalized in the wrappers
5. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. No behavioral change — same inputs produce the same outputs
2. Non-recoverable errors still propagate unchanged
3. No catch blocks remain for the 2 migrated sites in `eval-query.ts`

## Test Plan

### New/Modified Tests

1. `packages/engine/test/kernel/eval-query.test.ts` — unit tests for `tryResolveIntDomainBound` and the second wrapper

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo test --force`
