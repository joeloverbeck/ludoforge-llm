# CHOICEUI-007: Breadcrumb Name Resolution

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None -- runner-only
**Deps**: CHOICEUI-005

## Problem

Breadcrumb pills in the choice flow are opaque in two ways:

1. **Raw zone IDs instead of display names**: `formatChoiceValueFallback()` formats zone ID arrays like `["da-nang:none", "kontum:none"]` as `[Da Nang None, Kontum None, ...]`. The `:none` suffix and lack of proper display name lookup make the breadcrumb hard to read.

2. **No decision name context**: Breadcrumb pills show only the chosen value (e.g., "Da Nang, Kontum") without indicating which decision parameter they answered (e.g., "Target Spaces: Da Nang, Kontum").

## Assumption Reassessment (2026-03-06)

1. `formatChoiceValueFallback()` in `choice-value-utils.ts` (line 42) handles arrays by mapping through `formatChoiceScalar()`, which calls `formatIdAsDisplayName()` on string values -- producing "Da Nang None" from "da-nang:none".
2. `deriveChoiceBreadcrumb()` in `derive-render-model.ts` (line 1187) uses `formatChoiceValueFallback()` for `chosenDisplayName`.
3. `RenderChoiceStep` in `render-model.ts` (line 187) has `displayName` (decision name) and `chosenDisplayName` (chosen value), but `ChoicePanel.tsx` (line 340) only renders `step.chosenDisplayName`.
4. The `zonesById` map is already built at line 111 of `derive-render-model.ts` -- just needs passing to `deriveChoiceBreadcrumb`.
5. `formatChoiceValueFallback()` remains in use by `resolveChoiceOption()` and `deriveRenderChoiceOptions()` -- it is not a backward-compat artifact.

## Architecture Check

1. Adding `formatChoiceValueResolved()` follows the existing pattern in `choice-value-utils.ts` -- a pure formatting function alongside the existing fallback formatter.
2. Passing `zonesById` to the breadcrumb derivation is consistent with how `deriveRenderModel()` already uses zone data for other derivations.
3. Showing `"{displayName}: {chosenDisplayName}"` in breadcrumbs is a rendering change only -- the data model already has both fields.

## What Changed

### 1. Added `formatChoiceValueResolved()` to `choice-value-utils.ts`

```typescript
export function formatChoiceValueResolved(
  value: MoveParamValue,
  displayNameById: ReadonlyMap<string, { readonly displayName: string }>,
): string
```

Logic:
- For scalar string values: look up `displayNameById.get(value)?.displayName`, fallback to `formatIdAsDisplayName(value)`.
- For arrays: map each element through the same scalar resolution, join with ", " (no brackets -- the pill provides visual containment).
- For non-string scalars (number, boolean): delegate to existing `formatChoiceScalar()`.

### 2. Updated breadcrumb derivation in `derive-render-model.ts`

- `deriveChoiceBreadcrumb` now accepts `zonesById` parameter (already built at line 111).
- Replaced `formatChoiceValueFallback(step.value)` with `formatChoiceValueResolved(step.value, zonesById)` for `chosenDisplayName`.

### 3. Updated breadcrumb rendering in `ChoicePanel.tsx`

Changed breadcrumb pill text from `{step.chosenDisplayName}` to `{step.displayName}: {step.chosenDisplayName}`.

## Files Touched

- `packages/runner/src/model/choice-value-utils.ts` (modified)
- `packages/runner/src/model/derive-render-model.ts` (modified)
- `packages/runner/src/ui/ChoicePanel.tsx` (modified)
- `packages/runner/test/model/choice-value-utils.test.ts` (modified)
- `packages/runner/test/model/derive-render-model-state.test.ts` (modified)
- `packages/runner/test/ui/ChoicePanel.test.ts` (modified)

## Out of Scope

- Breadcrumb iteration grouping with indentation (CHOICEUI-008).
- Adding `iterationGroupId` or `iterationLabel` to `RenderChoiceStep` (CHOICEUI-008).
- Token ID resolution (only zone IDs are resolved in this ticket).
- Choice context header changes (CHOICEUI-006).

## Acceptance Criteria

### Tests That Must Pass

1. `formatChoiceValueResolved("da-nang:none", zonesMap)` returns `"Da Nang"` when zone exists in map. ✅
2. `formatChoiceValueResolved("unknown-zone:none", zonesMap)` falls back to `formatIdAsDisplayName()` result. ✅
3. `formatChoiceValueResolved(["da-nang:none", "kontum:none"], zonesMap)` returns `"Da Nang, Kontum"`. ✅
4. `formatChoiceValueResolved(42, zonesMap)` returns `"42"` (numeric passthrough). ✅
5. `formatChoiceValueResolved(true, zonesMap)` returns `"True"` (boolean passthrough). ✅
6. Breadcrumb pills render as `"{displayName}: {chosenDisplayName}"` in `ChoicePanel`. ✅
7. Existing breadcrumb rewind behavior (click to undo) is unchanged. ✅
8. Existing suite: `pnpm -F @ludoforge/runner test`. ✅ (1437 tests pass)

### Invariants

1. `formatChoiceValueFallback()` is not modified -- it still exists for `resolveChoiceOption()` and `deriveRenderChoiceOptions()` callers. ✅
2. `RenderChoiceStep` type is not changed in this ticket (type changes deferred to CHOICEUI-008). ✅
3. Breadcrumb click handlers and `rewindChoiceToBreadcrumb()` logic are unchanged. ✅
4. Determinism: same zone data + same choice values produce same breadcrumb text. ✅

## Outcome

**What was actually changed vs originally planned:**

All three planned changes were implemented as specified. One minor deviation: `formatChoiceValueResolved` uses `displayNameById` as parameter name (instead of `zonesById`) since the map interface `ReadonlyMap<string, { readonly displayName: string }>` is generic enough to accept any entity with a display name -- this makes it naturally extensible for future token resolution without API changes. Array formatting omits the `[...]` brackets that `formatChoiceValueFallback` uses, since breadcrumb pills already provide visual containment.

Updated the `derive-render-model-state.test.ts` expected value for array breadcrumb formatting (brackets removed). Added 7 new unit tests for `formatChoiceValueResolved` covering zone hit, zone miss, mixed arrays, numeric passthrough, boolean passthrough, and empty map fallback.
