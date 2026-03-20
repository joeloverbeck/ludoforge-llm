# 70ACTTOOSYN-001: Add scalarArray branch to tooltip value stringifiers

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel tooltip-value-stringifier
**Deps**: None

## Problem

`{ scalarArray: ['city', 'province'] }` is a valid `ValueExpr` shape used in zone selector filters, but both `stringifyValueExpr` and `humanizeValueExpr` in `tooltip-value-stringifier.ts` lack a handler for it. They fall through to the debug fallback, producing `expr(scalarArray)` in user-visible tooltip text instead of `"City or Province"`.

## Assumption Reassessment (2026-03-20)

1. `stringifyValueExpr` has a final fallback at ~line 302 using `expr(${keys.join(', ')})` — confirmed by codebase exploration.
2. `humanizeValueExpr` has a final fallback at ~line 419 — confirmed.
3. `scalarArray` is not currently handled by either function — confirmed; no `scalarArray` branch exists.
4. `ScalarValue` type exists and is the element type of `scalarArray` arrays — verify at implementation time.

## Architecture Check

1. This is a pure bug fix — adds a missing discriminant handler to two existing switch-like dispatch functions.
2. No game-specific logic: `scalarArray` is a generic `ValueExpr` shape. Labels come from verbalization, not hardcoded.
3. No shims or backward-compatibility hacks — just a new branch before the existing fallback.

## What to Change

### 1. `stringifyValueExpr` — add scalarArray branch

Before the final fallback (`expr(${keys.join(', ')})`), add:

```typescript
if ('scalarArray' in expr) {
  const items = expr.scalarArray as readonly ScalarValue[];
  return items.map(String).join(' or ');
}
```

### 2. `humanizeValueExpr` — add scalarArray branch

Before the final fallback, add:

```typescript
if ('scalarArray' in expr) {
  const items = expr.scalarArray as readonly ScalarValue[];
  return items.map((item) => resolveLabel(String(item), ctx, count)).join(' or ');
}
```

## Files to Touch

- `packages/engine/src/kernel/tooltip-value-stringifier.ts` (modify)
- `packages/engine/test/unit/tooltip-value-stringifier.test.ts` (modify — add scalarArray tests)

## Out of Scope

- Other unhandled ValueExpr shapes (if any exist)
- Refactoring the fallback mechanism itself
- Changing tooltip-normalizer, content-planner, or template-realizer
- Changing any game data files
- Visual styling of tooltips in the runner

## Acceptance Criteria

### Tests That Must Pass

1. `stringifyValueExpr({ scalarArray: ['city', 'province'] })` returns `'city or province'`
2. `stringifyValueExpr({ scalarArray: [1, 2, 3] })` returns `'1 or 2 or 3'`
3. `stringifyValueExpr({ scalarArray: ['single'] })` returns `'single'`
4. `humanizeValueExpr({ scalarArray: ['city', 'province'] }, ctx)` resolves labels via `resolveLabel` and joins with `' or '`
5. `humanizeValueExpr({ scalarArray: ['city'] }, ctx)` resolves a single label without trailing `' or '`
6. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. All existing `stringifyValueExpr` and `humanizeValueExpr` tests continue to pass unchanged.
2. The fallback branch (`expr(...)`) is still reachable for truly unknown shapes — the new branch only fires when `'scalarArray' in expr` is true.
3. No mutation — both functions remain pure.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/tooltip-value-stringifier.test.ts` — add a `scalarArray` describe block covering multi-item, single-item, and numeric arrays for both `stringifyValueExpr` and `humanizeValueExpr`.

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "scalarArray"`
2. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
