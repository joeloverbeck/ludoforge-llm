# CHOICEUI-009: Fix NumericMode Stale State on Decision Transition

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: CHOICEUI-002

## Problem

`NumericMode` in `ChoicePanel.tsx` maintains local state (`useState<number>(domain.min)`) for the slider/input value. When the kernel transitions between two `numeric` decisions with identical or overlapping domain ranges, React preserves the component instance, and the previous slider value carries over to the new decision.

The existing `useEffect` only re-clamps the value when `domain` changes — same-domain transitions silently retain stale values. This is the same class of bug that CHOICEUI-002 fixed for `MultiSelectMode`.

## Assumption Reassessment (2026-03-05)

1. `NumericMode` is defined in `ChoicePanel.tsx` with `useState<number>(domain.min)` local state and a `useEffect` that re-clamps when `domain` changes.
2. `RenderChoiceUi` `numeric` variant currently has only `kind` and `domain` — no `decisionId`.
3. `ChoicePendingRequest` in the engine already carries `decisionId` on all pending requests, so the data is available in `deriveChoiceUi`.
4. CHOICEUI-002 added `decisionId` to `discreteOne` and `discreteMany` but explicitly scoped out `numeric`.

## Architecture Check

1. Adding `decisionId` to the `numeric` variant completes the pattern established by CHOICEUI-002. All choice-active variants (`discreteOne`, `discreteMany`, `numeric`) will carry decision identity, making the data model consistent.
2. Using React `key` prop on `NumericMode` (same pattern as `MultiSelectMode`) is idiomatic and requires zero internal component changes.
3. No game-specific logic involved — this is purely a runner-layer UI state management fix.
4. No backwards-compatibility shims; the field is additive to the type.

## What to Change

### 1. Add `decisionId` to `numeric` variant in `render-model.ts`

```typescript
| {
    readonly kind: 'numeric';
    readonly decisionId: string;
    readonly domain: RenderChoiceDomain;
  }
```

### 2. Populate `decisionId` in `deriveChoiceUi` in `derive-render-model.ts`

The `numeric` variant is not currently derived from `deriveChoiceUi` — numeric choices use `chooseOne` with a domain. Verify where the `numeric` variant is constructed and add `decisionId: pending.decisionId` there.

### 3. Pass `key` prop on `NumericMode` in `ChoicePanel.tsx`

```tsx
<NumericMode
  key={choiceUi.decisionId}
  choiceUi={choiceUi}
  chooseOne={...}
/>
```

## Files to Touch

- `packages/runner/src/model/render-model.ts` (modify)
- `packages/runner/src/model/derive-render-model.ts` (modify)
- `packages/runner/src/ui/ChoicePanel.tsx` (modify)
- `packages/runner/test/ui/ChoicePanel.test.ts` (modify — update `numeric` fixtures, add regression test)
- `packages/runner/test/model/render-model-types.test.ts` (modify — update `numeric` fixture)

## Out of Scope

- Adding `decisionId` to `confirmReady`, `none`, or `invalid` variants (these have no local state to reset).
- Changes to `MultiSelectMode` (already fixed by CHOICEUI-002).

## Acceptance Criteria

### Tests That Must Pass

1. Regression test: when `choiceUi` transitions from one `numeric` decision to another with the same domain, the slider value resets to `domain.min`.
2. Existing `ChoicePanel` tests pass with `decisionId` added to `numeric` test fixtures.
3. Existing suite: `pnpm -F @ludoforge/runner test`.

### Invariants

1. `RenderChoiceUi` type remains a discriminated union on `kind`.
2. `NumericMode` still correctly tracks value within a single decision.
3. `deriveRenderModel` determinism: same inputs produce same `decisionId` in output.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/ui/ChoicePanel.test.ts` — regression test: render `numeric`, change slider, transition to new `numeric` decision with same domain, verify value resets to `domain.min`.
2. `packages/runner/test/ui/ChoicePanel.test.ts` — update existing `numeric` test fixtures with `decisionId`.
3. `packages/runner/test/model/render-model-types.test.ts` — update `numeric` variant fixture with `decisionId`.

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`
