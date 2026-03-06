# CHOICEUI-011: Eliminate Throwaway Choice Option Formatting

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: CHOICEUI-010

## Problem

`deriveRenderChoiceOptions()` computes `formatChoiceValueFallback(option.value)` for every choice option's `displayName` (line 1208). Immediately after, `deriveChoiceUi` at lines 1334-1346 overwrites every option's `displayName` with the result from `resolveChoiceOption()`. The initial formatting work is discarded on every render cycle.

This two-pass pattern exists because `deriveRenderChoiceOptions` was the original options builder and `resolveChoiceOption` was added later to handle zone/token resolution. The intermediate step is now pure waste.

## Assumption Reassessment (2026-03-06)

1. `deriveRenderChoiceOptions` (line 1201): maps each `context.choicePending.options` entry into a `RenderChoiceOption`, calling `formatChoiceValueFallback` for `displayName` and hardcoding `target: { kind: 'scalar', entityId: null, displaySource: 'fallback' }`.
2. `deriveChoiceUi` (line 1334): calls `deriveRenderChoiceOptions(context).map(option => { const resolved = resolveChoiceOption(...); return { ...option, displayName: resolved.displayName, target: resolved.target }; })` — overwriting both `displayName` and `target`.
3. `deriveRenderChoiceOptions` is called only from `deriveChoiceUi` (line 1334). No other callers exist.
4. `resolveChoiceOption` already handles the fallback case internally (line 1232) — it calls `formatChoiceValueFallback` when resolution fails. So the initial formatting is truly redundant.

## Architecture Check

1. Inlining the option mapping into `deriveChoiceUi` eliminates the unnecessary intermediate allocation and makes the data flow single-pass. Each option is built once with its final resolved display name.
2. No game-specific branching — this is runner-layer derivation logic only.
3. No backwards-compatibility shims — `deriveRenderChoiceOptions` is a private function with a single call site.

## What to Change

### 1. Inline option construction into `deriveChoiceUi`

Replace the two-pass pattern:

```typescript
// Current (two-pass)
const options = deriveRenderChoiceOptions(context).map((option) => {
  const resolved = resolveChoiceOption(option.value, ...);
  return { ...option, displayName: resolved.displayName, target: resolved.target };
});
```

With single-pass construction:

```typescript
// Proposed (single-pass)
const options = context.choicePending.options.map((option) => {
  const resolved = resolveChoiceOption(option.value, pending.targetKinds, zonesById, tokensById, playersById);
  return {
    choiceValueId: serializeChoiceValueIdentity(option.value),
    value: option.value,
    displayName: resolved.displayName,
    target: resolved.target,
    legality: option.legality,
    illegalReason: option.illegalReason,
  };
});
```

### 2. Remove `deriveRenderChoiceOptions`

Delete the now-unused function.

## Files to Touch

- `packages/runner/src/model/derive-render-model.ts` (modify)

## Out of Scope

- Changing `resolveChoiceOption` behavior or signature.
- Modifying the `RenderChoiceOption` type.

## Acceptance Criteria

### Tests That Must Pass

1. All existing choice option rendering tests in `derive-render-model-state.test.ts` pass unchanged.
2. All `ChoicePanel.test.ts` tests pass unchanged.
3. Existing suite: `pnpm -F @ludoforge/runner test`.

### Invariants

1. `deriveChoiceUi` produces identical `RenderChoiceUi` output for the same inputs.
2. No intermediate `RenderChoiceOption[]` allocation with throwaway `displayName` values.
3. `formatChoiceValueFallback` continues to serve as the fallback inside `resolveChoiceOption` — it is not removed from the codebase.

## Test Plan

### New/Modified Tests

1. No new tests needed — this is a pure refactor with no behavioral change.

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`
