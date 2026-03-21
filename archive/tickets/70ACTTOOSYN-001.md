# 70ACTTOOSYN-001: Add scalarArray branch to tooltip value stringifiers

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel tooltip-value-stringifier
**Deps**: None

## Problem

`{ scalarArray: ['city', 'province'] }` is a valid `ValueExpr` shape used in compiled conditions and tooltip-facing selector/filter expressions, but both `stringifyValueExpr` and `humanizeValueExpr` in `tooltip-value-stringifier.ts` lack a handler for it. They fall through to the debug fallback, producing `expr(scalarArray)` in user-visible tooltip text instead of a joined scalar list such as `"City or Province"`.

## Assumption Reassessment (2026-03-20)

1. `stringifyValueExpr` has a final fallback at ~line 302 using `expr(${keys.join(', ')})` — confirmed by codebase exploration.
2. `humanizeValueExpr` has a final fallback at ~line 419 — confirmed.
3. `scalarArray` is not currently handled by either function — confirmed; no `scalarArray` branch exists.
4. `ScalarValue` and `ScalarArrayValue` already exist in `packages/engine/src/kernel/types-ast.ts`; `ValueExpr` already includes `{ readonly scalarArray: ScalarArrayValue }` — confirmed.
5. The ticket’s original test path assumption was wrong: the relevant unit test file is `packages/engine/test/unit/kernel/tooltip-value-stringifier.test.ts`, not `packages/engine/test/unit/tooltip-value-stringifier.test.ts`.
6. Spec 70 contains broader synopsis/action-summary work, but that architecture is already partially present in the codebase:
   - `SummaryMessage` already exists in tooltip IR.
   - Macro-origin summaries already flow through tooltip normalization.
   - Template realization already supports summary lines.
   This ticket should not reopen that broader design unless a separate, current defect is proven.

## Architecture Check

1. This is a pure bug fix — add a missing `ValueExpr` discriminant handler to two existing dispatch functions.
2. No game-specific logic: `scalarArray` is a generic `ValueExpr` shape. Labels come from verbalization, not hardcoded.
3. No shims or backward-compatibility hacks — add the branch before the existing fallback and keep unknown-shape fallback behavior unchanged.
4. This is more beneficial than the current architecture because it makes the stringifiers closer to exhaustive over `ValueExpr`, which is cleaner and more robust than relying on a debug fallback for a first-class AST variant.
5. A larger refactor toward fully exhaustive discriminant handling could be worthwhile later, but it is out of scope for this ticket. The smallest durable fix here is to handle `scalarArray` explicitly where the bug occurs.

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
- `packages/engine/test/unit/kernel/tooltip-value-stringifier.test.ts` (modify — add scalarArray tests)

## Out of Scope

- The broader action-summary/synopsis architecture described in `specs/70-action-tooltip-synopsis-and-humanization.md`
- Other unhandled `ValueExpr` shapes (if any exist)
- Refactoring the stringifiers into a fully exhaustive matcher
- Changing tooltip-normalizer, content-planner, template-realizer, or verbalization schemas
- Changing any game data files
- Visual styling of tooltips in the runner

## Acceptance Criteria

### Tests That Must Pass

1. `stringifyValueExpr({ scalarArray: ['city', 'province'] })` returns `'city or province'`
2. `stringifyValueExpr({ scalarArray: [1, 2, 3] })` returns `'1 or 2 or 3'`
3. `stringifyValueExpr({ scalarArray: ['single'] })` returns `'single'`
4. `humanizeValueExpr({ scalarArray: ['city', 'province'] }, ctx)` resolves labels via `resolveLabel` and joins with `' or '`
5. `humanizeValueExpr({ scalarArray: ['city'] }, ctx)` resolves a single label without trailing `' or '`
6. Existing focused tooltip/stringifier suite still passes.
7. Engine package suite still passes.

### Invariants

1. All existing `stringifyValueExpr` and `humanizeValueExpr` tests continue to pass unchanged.
2. The fallback branch (`expr(...)`) is still reachable for truly unknown shapes — the new branch only fires when `'scalarArray' in expr` is true.
3. No mutation — both functions remain pure.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/tooltip-value-stringifier.test.ts` — add a `scalarArray` describe block covering multi-item, single-item, and numeric arrays for both `stringifyValueExpr` and `humanizeValueExpr`.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/tooltip-value-stringifier.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo test`
5. `pnpm turbo typecheck`
6. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-20
- What actually changed:
  - Corrected the ticket’s assumptions and scope to match the current tooltip architecture and real test locations.
  - Added explicit `scalarArray` handling to `stringifyValueExpr` and `humanizeValueExpr`.
  - Added focused unit coverage for string arrays, numeric arrays, single-item arrays, and the no-debug-placeholder invariant.
- Deviations from original plan:
  - No broader synopsis/action-summary work was implemented. Reassessment showed that this ticket should stay scoped to the missing `scalarArray` handler and that the larger Spec 70 summary pipeline work is separate.
- Verification results:
  - `pnpm turbo build`
  - `node --test packages/engine/dist/test/unit/kernel/tooltip-value-stringifier.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo test`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
