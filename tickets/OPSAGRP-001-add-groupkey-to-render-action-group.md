# OPSAGRP-001: Add groupKey to RenderActionGroup and fix data-testid fragility

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

`RenderActionGroup` only exposes `groupName`, which is a display-formatted string produced by `formatIdAsDisplayName`. The `ActionToolbar` component uses this display string in `data-testid` attributes (e.g. `action-Operation Plus Special Activity-train`), creating test IDs that contain spaces and break if display formatting changes. Programmatic consumers that need to distinguish group types (e.g. "is this the Op+SA group?") must string-match on a localization-fragile display name.

## Assumption Reassessment (2026-03-10)

1. `RenderActionGroup` in `packages/runner/src/model/render-model.ts` currently has only `groupName: string` and `actions: readonly RenderAction[]` — confirmed.
2. `deriveActionGroups` in `packages/runner/src/model/derive-render-model.ts` discards the raw map key (`groupKey`) during the final `.map()` — confirmed at line 1162.
3. `ActionToolbar.tsx` uses `group.groupName` in `data-testid` — confirmed at line 48 of modified file.

## Architecture Check

1. Adding a stable `groupKey` field separates identity (for programmatic use) from presentation (for display) — standard UI data modeling practice.
2. No game-specific logic introduced. The `groupKey` is whatever string the engine emits as `actionClass`, or `"Actions"` for the default bucket. The runner remains agnostic.
3. No backwards-compatibility shims — `groupName` stays for display, `groupKey` is additive.

## What to Change

### 1. Add `groupKey` to `RenderActionGroup`

In `packages/runner/src/model/render-model.ts`, add `readonly groupKey: string` to the `RenderActionGroup` interface.

### 2. Populate `groupKey` in `deriveActionGroups`

In `packages/runner/src/model/derive-render-model.ts`, the final `.map()` already has access to the raw `groupKey` from the Map entries. Include it in the returned object.

### 3. Use `groupKey` in `data-testid`

In `packages/runner/src/ui/ActionToolbar.tsx`, change `data-testid` from `` `action-${group.groupName}-${action.actionId}` `` to `` `action-${group.groupKey}-${action.actionId}` ``.

### 4. Update tests

Update `ActionToolbar.test.ts` test ID lookups to use the raw key (e.g. `action-Actions-move`) instead of the formatted name (e.g. `action-Core-move`). Add a unit test in `derive-render-model-state.test.ts` asserting `groupKey` is the raw string.

## Files to Touch

- `packages/runner/src/model/render-model.ts` (modify)
- `packages/runner/src/model/derive-render-model.ts` (modify)
- `packages/runner/src/ui/ActionToolbar.tsx` (modify)
- `packages/runner/test/model/derive-render-model-state.test.ts` (modify)
- `packages/runner/test/ui/ActionToolbar.test.ts` (modify)

## Out of Scope

- Changing the `groupName` formatting logic itself
- Internationalizing display names

## Acceptance Criteria

### Tests That Must Pass

1. `derive-render-model-state.test.ts` — action groups include both `groupKey` (raw) and `groupName` (formatted)
2. `ActionToolbar.test.ts` — `data-testid` attributes use stable keys without spaces
3. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. `groupKey` is always the raw string used as the Map key in `deriveActionGroups` (never display-formatted)
2. `groupName` continues to be the display-formatted version

## Test Plan

### New/Modified Tests

1. `packages/runner/test/model/derive-render-model-state.test.ts` — assert `groupKey` equals raw key for each group
2. `packages/runner/test/ui/ActionToolbar.test.ts` — update all `findElementByTestId` calls to use raw keys

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm turbo typecheck`
