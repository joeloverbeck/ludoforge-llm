# 71OPSTOOCOM-003: Create `resolveCompanionActions` utility function

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: 71OPSTOOCOM-001 (needs `appendTooltipFrom` on `ActionGroupSynthesizeEntry`), 71OPSTOOCOM-002 (needs `hiddenActionsByClass` on `RenderModel` / `RenderAction` type)

## Problem

There is no utility to look up which hidden actions should appear as companion tooltip content for a given synthesized action group. This ticket creates a pure function that, given a group key, the action group policy, and the hidden actions map, returns the companion actions to display.

## Assumption Reassessment (2026-03-21)

1. `ActionGroupPolicy` type has `synthesize?: ActionGroupSynthesizeEntry[]` and `hide?: string[]` — confirmed.
2. After 71OPSTOOCOM-001, `ActionGroupSynthesizeEntry` will have optional `appendTooltipFrom?: string[]` — to be delivered.
3. After 71OPSTOOCOM-002, `RenderModel` will have `hiddenActionsByClass: ReadonlyMap<string, readonly RenderAction[]>` — to be delivered.
4. `VisualConfigProvider.getActionGroupPolicy()` returns `ActionGroupPolicy | undefined` — confirmed.
5. The utility is used in GameContainer (ticket 005) to resolve companion actions before passing to ActionTooltip.

## Architecture Check

1. A pure function with no side effects — easy to test, easy to compose.
2. Generic by design — works for any `appendTooltipFrom` configuration, not FITL-specific.
3. Placed alongside the render model utilities since it operates on render model data types.

## What to Change

### 1. Create `resolveCompanionActions` utility

Create a new file `packages/runner/src/model/resolve-companion-actions.ts` with:

```typescript
export function resolveCompanionActions(
  groupKey: string,
  policy: ActionGroupPolicy | null | undefined,
  hiddenActionsByClass: ReadonlyMap<string, readonly RenderAction[]>,
): readonly RenderAction[] {
  if (policy == null) return [];
  const rule = policy.synthesize?.find((r) => r.intoGroup === groupKey);
  if (rule?.appendTooltipFrom === undefined) return [];
  return rule.appendTooltipFrom.flatMap(
    (cls) => hiddenActionsByClass.get(cls) ?? [],
  );
}
```

### 2. Write unit tests

Cover all branches: no policy, no matching rule, no `appendTooltipFrom`, empty hidden map, populated hidden map with multiple classes.

## Files to Touch

- `packages/runner/src/model/resolve-companion-actions.ts` (new)
- `packages/runner/test/model/resolve-companion-actions.test.ts` (new)

## Out of Scope

- UI component changes (ActionTooltip, GameContainer — those are tickets 004 and 005)
- Any changes to `project-render-model.ts` or `render-model.ts`
- Any changes to the engine, kernel, or compiler
- Integration with the tooltip system (that's ticket 005)

## Acceptance Criteria

### Tests That Must Pass

1. **New test**: Returns empty array when `policy` is `null`
2. **New test**: Returns empty array when `policy` is `undefined`
3. **New test**: Returns empty array when no synthesize rule matches `groupKey`
4. **New test**: Returns empty array when matching rule has no `appendTooltipFrom`
5. **New test**: Returns empty array when `appendTooltipFrom` references a class not in `hiddenActionsByClass`
6. **New test**: Returns correct actions when `appendTooltipFrom` references a class present in `hiddenActionsByClass`
7. **New test**: Returns actions from multiple classes when `appendTooltipFrom` lists multiple classes
8. **New test**: Preserves action order — actions from the first listed class come before actions from the second
9. `pnpm turbo typecheck` — no type errors
10. `pnpm -F @ludoforge/runner test` — all pass

### Invariants

1. The function is pure — no side effects, no mutation of inputs
2. The return type is `readonly RenderAction[]` — always an array, never undefined
3. The function does not import any UI dependencies — it's a data utility

## Test Plan

### New/Modified Tests

1. `packages/runner/test/model/resolve-companion-actions.test.ts` (new) — Full branch coverage of the utility

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm turbo typecheck`
