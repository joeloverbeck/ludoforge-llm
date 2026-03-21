# 71OPSTOOCOM-002: Preserve hidden actions in RenderModel via `hiddenActionsByClass`

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: 71OPSTOOCOM-001 (needs `appendTooltipFrom` field on synthesize entry type, though this ticket's logic doesn't read it yet)

## Problem

When `projectActionGroups` encounters an action whose `actionClass` is in the `hide` set, it drops the action entirely (`continue`). This means the tooltip system has no access to hidden actions (e.g., special activities). This ticket preserves hidden actions in a new `hiddenActionsByClass` map on `RenderModel` so downstream consumers can reference them.

## Assumption Reassessment (2026-03-21)

1. `RenderModel` is defined in `packages/runner/src/model/render-model.ts` with ~24 fields including `actionGroups: readonly RenderActionGroup[]` at line 94 — confirmed.
2. `projectActionGroups` in `packages/runner/src/model/project-render-model.ts` (lines 138-193) skips hidden actions at lines 157-165 — confirmed.
3. `projectRenderModel` (lines 31-102) calls `projectActionGroups` at line 79 and spreads the result into the return object — confirmed.
4. `RenderAction` has `actionId`, `displayName`, `isAvailable`, and optional `actionClass` — confirmed.
5. `VisualConfigProvider` has `getActionDisplayName(actionId)` method — confirmed.
6. `formatIdAsDisplayName` is imported and used in the projection file — confirmed.

## Architecture Check

1. Adding a `ReadonlyMap` field to `RenderModel` is backwards-compatible — all existing consumers ignore unknown fields. Consumers that destructure will need updating only if they spread the full model (none do).
2. The map is keyed by `actionClass` string, making it generic — not FITL-specific. Any game with `hide` rules will benefit.
3. No shims — the field is new and always populated (empty map when nothing is hidden).

## What to Change

### 1. Add `hiddenActionsByClass` to `RenderModel` — `render-model.ts`

Add a new readonly field after `actionGroups`:

```typescript
readonly hiddenActionsByClass: ReadonlyMap<string, readonly RenderAction[]>;
```

### 2. Update `projectActionGroups` return type and logic — `project-render-model.ts`

Change the function to return `{ actionGroups, hiddenActionsByClass }` instead of just the groups array.

At the hidden-action branch (lines 157-165), instead of bare `continue`, collect into a map:

```typescript
if (actionClass !== undefined && hiddenClasses.has(actionClass)) {
  const bucket = hiddenByClass.get(actionClass) ?? [];
  hiddenByClass.set(actionClass, [...bucket, {
    ...action,
    displayName: visualConfigProvider.getActionDisplayName(action.actionId)
      ?? formatIdAsDisplayName(action.actionId),
  }]);
  continue;
}
```

Initialize `hiddenByClass` as `new Map<string, RenderAction[]>()` at the top of the function.

### 3. Wire into `projectRenderModel` — `project-render-model.ts`

Where `projectRenderModel` calls `projectActionGroups`, destructure the result into `{ actionGroups, hiddenActionsByClass }` and include `hiddenActionsByClass` in the returned `RenderModel` object.

### 4. Update any call site that expects the old return shape

Check if `projectActionGroups` is called elsewhere. If only from `projectRenderModel`, no other changes needed.

## Files to Touch

- `packages/runner/src/model/render-model.ts` (modify — add field)
- `packages/runner/src/model/project-render-model.ts` (modify — logic + return shape)
- `packages/runner/test/model/project-render-model.test.ts` or new test file (modify/new — tests for hiddenActionsByClass)

## Out of Scope

- Reading `appendTooltipFrom` from the synthesize rule (that's ticket 003's resolveCompanionActions)
- Any UI component changes (ActionTooltip, GameContainer)
- Any CSS changes
- Engine, kernel, or compiler changes
- Changes to `useActionTooltip` hook or bridge

## Acceptance Criteria

### Tests That Must Pass

1. **New test**: When `projectActionGroups` is given actions with an `actionClass` in the `hide` set, `hiddenActionsByClass` contains those actions keyed by class, with correct `displayName` and `isAvailable`
2. **New test**: When no actions are hidden, `hiddenActionsByClass` is an empty map
3. **New test**: Hidden actions are NOT present in the returned `actionGroups` (existing behavior preserved)
4. **New test**: Actions hidden by class still get `displayName` resolved via `getActionDisplayName` with fallback to `formatIdAsDisplayName`
5. Existing suite: `pnpm -F @ludoforge/runner test` — all pass
6. `pnpm turbo typecheck` — no type errors from the new field

### Invariants

1. `actionGroups` output must be identical to before — hidden actions still excluded from groups
2. `hiddenActionsByClass` keys are exactly the hidden `actionClass` values — no extra, no missing
3. `RenderModel` remains a plain readonly data structure — no methods, no side effects
4. `hiddenActionsByClass` is always present (never `undefined`) — empty map when nothing hidden

## Test Plan

### New/Modified Tests

1. `packages/runner/test/model/project-render-model-actions.test.ts` (new) — Dedicated test file for `projectActionGroups` with synthesize + hide policy:
   - Hidden actions collected by class
   - Empty map when no hide policy
   - Display name resolution for hidden actions
   - Existing action groups unchanged

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm turbo typecheck`
3. `pnpm turbo build`
