# CHOICEUI-002: Fix MultiSelectMode Stale State Bug

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None -- runner-only
**Deps**: None

## Problem

`MultiSelectMode` in `ChoicePanel.tsx` maintains local state (`selectedChoiceValueIds`) via `useState`. When the kernel transitions to a new `chooseN` decision with different bounds but overlapping option IDs, React preserves the component instance (same type + same position in tree), causing stale selections to carry over past the new decision's max.

The existing `useEffect` (lines 111-113) filters out options no longer in the legal set, but does not reset selections when the _decision itself_ changes.

## Assumption Reassessment (2026-03-05)

1. `MultiSelectMode` is defined at line 95 of `ChoicePanel.tsx` with `selectedChoiceValueIds` state at line 109.
2. `RenderChoiceUi` type in `render-model.ts` (lines 214-238) does not currently carry a `decisionId` on `discreteMany` or `discreteOne` variants.
3. `deriveRenderModel` in `derive-render-model.ts` constructs the `choiceUi` object but does not currently pass through `context.choicePending.decisionId`.

## Architecture Check

1. Using React `key` prop to force remount on decision change is the idiomatic React pattern for resetting local state on identity change. Cleaner than adding `useEffect` reset logic keyed on decisionId.
2. Adding `decisionId` to the render model makes the choice UI identity explicit in the data layer -- useful for future features (animation transitions, analytics).
3. No backwards-compatibility shims needed. The `decisionId` field is additive.

## What to Change

### 1. Add `decisionId` to `RenderChoiceUi` variants

In `render-model.ts`, add `readonly decisionId: string` to the `discreteOne` and `discreteMany` union members:

```typescript
| {
    readonly kind: 'discreteOne';
    readonly decisionId: string;
    readonly options: readonly RenderChoiceOption[];
  }
| {
    readonly kind: 'discreteMany';
    readonly decisionId: string;
    readonly options: readonly RenderChoiceOption[];
    readonly min: number | null;
    readonly max: number | null;
  }
```

### 2. Populate `decisionId` in `derive-render-model.ts`

In the code path that constructs `discreteOne` and `discreteMany` objects, set `decisionId: context.choicePending.decisionId`.

### 3. Pass `key` prop in `ChoicePanel.tsx`

On the `MultiSelectMode` render site (around line 367):

```tsx
<MultiSelectMode
  key={choiceUi.decisionId}
  choiceUi={choiceUi}
  chooseN={...}
/>
```

This forces React to unmount/remount the component when the decision changes, cleanly resetting all local state.

## Files to Touch

- `packages/runner/src/model/render-model.ts` (modify)
- `packages/runner/src/model/derive-render-model.ts` (modify)
- `packages/runner/src/ui/ChoicePanel.tsx` (modify)
- `packages/runner/test/ui/ChoicePanel.test.ts` (modify)
- `packages/runner/test/model/render-model-types.test.ts` (modify -- if type assertions exist)
- `packages/runner/test/ui/helpers/render-model-fixture.ts` (modify -- add `decisionId` to fixtures)

## Out of Scope

- Adding `decisionId` to the `numeric`, `confirmReady`, `none`, or `invalid` variants.
- Adding `RenderChoiceContext` header (CHOICEUI-006).
- Changing `MultiSelectMode` internal logic beyond adding the `key` prop.
- Changing breadcrumb behavior.

## Acceptance Criteria

### Tests That Must Pass

1. Regression test: when `choiceUi` transitions from one `discreteMany` decision to another with overlapping option IDs but different bounds, `selectedChoiceValueIds` resets to empty.
2. Existing `ChoicePanel` tests pass with `decisionId` added to test fixtures.
3. Existing suite: `pnpm -F @ludoforge/runner test`.

### Invariants

1. `RenderChoiceUi` type remains a discriminated union on `kind`.
2. `MultiSelectMode` still correctly tracks selections within a single decision (no behavior change for same-decision interactions).
3. `deriveRenderModel` determinism: same inputs produce same `decisionId` in output.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/ui/ChoicePanel.test.ts` -- regression test: render `discreteMany`, simulate decision transition, verify selection state resets.
2. `packages/runner/test/ui/helpers/render-model-fixture.ts` -- add `decisionId` to `discreteOne`/`discreteMany` fixture helpers.
3. `packages/runner/test/model/render-model-types.test.ts` -- verify `decisionId` present on `discreteOne`/`discreteMany` variants.

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm turbo typecheck`

## Outcome

**Completed**: 2026-03-05

### What actually changed
- `render-model.ts`: Added `readonly decisionId: string` to `discreteOne` and `discreteMany` variants of `RenderChoiceUi`.
- `derive-render-model.ts`: Populated `decisionId: pending.decisionId` in both `discreteMany` and `discreteOne` return paths of `deriveChoiceUi`.
- `ChoicePanel.tsx`: Added `key={choiceUi.decisionId}` to `<MultiSelectMode>`.
- Updated `decisionId` in test fixtures across 7 test files: `ChoicePanel.test.ts`, `render-model-types.test.ts`, `derive-render-model-state.test.ts`, `bottom-bar-mode.test.ts`, `GameContainer.test.ts`, `useKeyboardShortcuts.test.ts`.
- Added regression test verifying selection state resets when `decisionId` changes.

### Deviations from original plan
- `render-model-fixture.ts` did NOT need modification — its default `choiceUi: { kind: 'none' }` has no `decisionId` requirement; overrides in individual tests handle it.
- The ticket listed 6 files to touch; 9 files were actually modified (3 additional test files the ticket didn't anticipate: `bottom-bar-mode.test.ts`, `GameContainer.test.ts`, `useKeyboardShortcuts.test.ts`).
- Also created CHOICEUI-009 ticket for the same fix on `NumericMode` (same class of bug, scoped out of this ticket).

### Verification
- 1386 tests passed (1 new regression test), 6 pre-existing failures (unrelated `matchesAllTokenFilterPredicates`).
- 9 pre-existing type errors (unrelated `TokenFilterExpr`), zero new type errors.
