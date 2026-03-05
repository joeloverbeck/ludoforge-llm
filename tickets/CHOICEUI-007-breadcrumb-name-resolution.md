# CHOICEUI-007: Breadcrumb Name Resolution

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None -- runner-only
**Deps**: CHOICEUI-005

## Problem

Breadcrumb pills in the choice flow are opaque in two ways:

1. **Raw zone IDs instead of display names**: `formatChoiceValueFallback()` formats zone ID arrays like `["da-nang:none", "kontum:none"]` as `[Da Nang None, Kontum None, ...]`. The `:none` suffix and lack of proper display name lookup make the breadcrumb hard to read.

2. **No decision name context**: Breadcrumb pills show only the chosen value (e.g., "Da Nang, Kontum") without indicating which decision parameter they answered (e.g., "Target Spaces: Da Nang, Kontum").

## Assumption Reassessment (2026-03-05)

1. `formatChoiceValueFallback()` in `choice-value-utils.ts` (line 42) handles arrays by mapping through `formatChoiceScalar()`, which calls `formatIdAsDisplayName()` on string values -- producing "Da Nang None" from "da-nang:none".
2. `deriveChoiceBreadcrumb()` in `derive-render-model.ts` uses `formatChoiceValueFallback()` for `chosenDisplayName`.
3. `RenderChoiceStep` in `render-model.ts` (line 177) has `displayName` (decision name) and `chosenDisplayName` (chosen value), but `ChoicePanel.tsx` (line 320) only renders `step.chosenDisplayName`.
4. The `RenderZone` type has `id` and `displayName` -- the zone map is already available during render model derivation.

## Architecture Check

1. Adding `formatChoiceValueResolved()` follows the existing pattern in `choice-value-utils.ts` -- a pure formatting function alongside the existing fallback formatter.
2. Passing `zonesById` to the breadcrumb derivation is consistent with how `deriveRenderModel()` already uses zone data for other derivations.
3. Showing `"{displayName}: {chosenDisplayName}"` in breadcrumbs is a rendering change only -- the data model already has both fields.

## What to Change

### 1. Add `formatChoiceValueResolved()` to `choice-value-utils.ts`

```typescript
export function formatChoiceValueResolved(
  value: MoveParamValue,
  zonesById: ReadonlyMap<string, { readonly displayName: string }>,
): string
```

Logic:
- For scalar string values: look up `zonesById.get(value)?.displayName`, fallback to `formatIdAsDisplayName(value)`.
- For arrays: map each element through the same scalar resolution, join with ", ".
- For non-string scalars (number, boolean): delegate to existing `formatChoiceScalar()`.

### 2. Update breadcrumb derivation in `derive-render-model.ts`

In the code path that builds `RenderChoiceStep` objects (the `deriveChoiceBreadcrumb` function or equivalent):

- Build a `zonesById` map from the already-derived `zones` array: `new Map(zones.map(z => [z.id, z]))`.
- Replace `formatChoiceValueFallback(choice.value)` with `formatChoiceValueResolved(choice.value, zonesById)` for `chosenDisplayName`.

### 3. Update breadcrumb rendering in `ChoicePanel.tsx`

Change the breadcrumb pill text from:
```tsx
{step.chosenDisplayName}
```
to:
```tsx
{step.displayName}: {step.chosenDisplayName}
```

This adds decision name context to each pill (e.g., "Target Spaces: Da Nang, Kontum" instead of just "Da Nang, Kontum").

## Files to Touch

- `packages/runner/src/model/choice-value-utils.ts` (modify)
- `packages/runner/src/model/derive-render-model.ts` (modify)
- `packages/runner/src/ui/ChoicePanel.tsx` (modify)
- `packages/runner/test/model/choice-value-utils.test.ts` (modify)
- `packages/runner/test/ui/ChoicePanel.test.ts` (modify)

## Out of Scope

- Breadcrumb iteration grouping with indentation (CHOICEUI-008).
- Adding `iterationGroupId` or `iterationLabel` to `RenderChoiceStep` (CHOICEUI-008).
- Token ID resolution (only zone IDs are resolved in this ticket).
- Modifying `formatChoiceValueFallback()` (it remains for backward compatibility in non-breadcrumb contexts).
- Choice context header changes (CHOICEUI-006).

## Acceptance Criteria

### Tests That Must Pass

1. `formatChoiceValueResolved("da-nang:none", zonesMap)` returns `"Da Nang"` when zone exists in map.
2. `formatChoiceValueResolved("unknown-zone:none", zonesMap)` falls back to `formatIdAsDisplayName()` result.
3. `formatChoiceValueResolved(["da-nang:none", "kontum:none"], zonesMap)` returns `"Da Nang, Kontum"`.
4. `formatChoiceValueResolved(42, zonesMap)` returns `"42"` (numeric passthrough).
5. `formatChoiceValueResolved(true, zonesMap)` returns `"True"` (boolean passthrough).
6. Breadcrumb pills render as `"{displayName}: {chosenDisplayName}"` in `ChoicePanel`.
7. Existing breadcrumb rewind behavior (click to undo) is unchanged.
8. Existing suite: `pnpm -F @ludoforge/runner test`.

### Invariants

1. `formatChoiceValueFallback()` is not modified -- it still exists for any non-breadcrumb callers.
2. `RenderChoiceStep` type is not changed in this ticket (type changes deferred to CHOICEUI-008).
3. Breadcrumb click handlers and `rewindChoiceToBreadcrumb()` logic are unchanged.
4. Determinism: same zone data + same choice values produce same breadcrumb text.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/model/choice-value-utils.test.ts` -- unit tests for `formatChoiceValueResolved`: zone hit, zone miss, array, numeric, boolean.
2. `packages/runner/test/ui/ChoicePanel.test.ts` -- breadcrumb rendering tests: verify pill text includes decision name prefix.

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm turbo typecheck`
