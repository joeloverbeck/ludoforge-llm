# CHOICEUI-009: Fix NumericMode Stale State on Decision Transition

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: CHOICEUI-002

## Problem

`NumericMode` in `ChoicePanel.tsx` maintains local state (`useState<number>(domain.min)`) for the slider/input value. When the kernel transitions between two `numeric` decisions with identical or overlapping domain ranges, React preserves the component instance, and the previous slider value carries over to the new decision.

The existing `useEffect` only re-clamps the value when `domain` changes — same-domain transitions silently retain stale values. This is the same class of bug that CHOICEUI-002 fixed for `MultiSelectMode`.

## Assumption Reassessment (2026-03-06)

1. `NumericMode` is defined in `ChoicePanel.tsx` with `useState<number>(domain.min)` local state and a `useEffect` that re-clamps when `domain` changes. **Confirmed.**
2. `RenderChoiceUi` `numeric` variant currently has only `kind` and `domain` — no `decisionId`. **Confirmed.**
3. ~~`ChoicePendingRequest` in the engine already carries `decisionId` on all pending requests, so the data is available in `deriveChoiceUi`.~~ **Corrected:** `deriveChoiceUi` has **no code path that produces the `numeric` variant**. The `numeric` variant is a forward-looking type — the type, UI component, and bottom-bar routing all exist, but no derivation path populates it yet. `ChoicePendingRequest` only has `type: 'chooseOne' | 'chooseN'`, which map to `discreteOne`/`discreteMany`.
4. CHOICEUI-002 added `decisionId` to `discreteOne` and `discreteMany` but explicitly scoped out `numeric`. **Confirmed.**

## Architecture Check

1. Adding `decisionId` to the `numeric` variant completes the pattern established by CHOICEUI-002. All choice-active variants (`discreteOne`, `discreteMany`, `numeric`) will carry decision identity, making the data model consistent.
2. Using React `key` prop on `NumericMode` (same pattern as `MultiSelectMode`) is idiomatic and requires zero internal component changes.
3. No game-specific logic involved — this is purely a runner-layer UI state management fix.
4. No backwards-compatibility shims; the field is additive to the type.
5. **No derivation change needed** — `deriveChoiceUi` does not produce `numeric` variants yet. When a derivation path is added in the future, it must populate `decisionId`. The type contract now enforces this.

## What Changed

### 1. Added `decisionId` to `numeric` variant in `render-model.ts`

```typescript
| {
    readonly kind: 'numeric';
    readonly decisionId: string;
    readonly domain: RenderChoiceDomain;
  }
```

### 2. ~~Populate `decisionId` in `deriveChoiceUi`~~ — NOT NEEDED

Original ticket assumed `deriveChoiceUi` produces `numeric` variants. Investigation revealed it does not — the `numeric` variant is forward-looking infrastructure. No derivation code was changed.

### 3. Passed `key` prop on `NumericMode` in `ChoicePanel.tsx`

```tsx
<NumericMode
  key={choiceUi.decisionId}
  choiceUi={choiceUi}
  chooseOne={...}
/>
```

## Files Touched

- `packages/runner/src/model/render-model.ts` (modified — added `decisionId` to `numeric` variant)
- `packages/runner/src/ui/ChoicePanel.tsx` (modified — added `key={choiceUi.decisionId}` to `NumericMode`)
- `packages/runner/test/ui/ChoicePanel.test.ts` (modified — updated 3 `numeric` fixtures with `decisionId`, added regression test)
- `packages/runner/test/model/render-model-types.test.ts` (modified — updated `numeric` fixture with `decisionId`)

## Files NOT Touched (corrected from original)

- `packages/runner/src/model/derive-render-model.ts` — no change needed; no `numeric` derivation path exists

## Out of Scope

- Adding `decisionId` to `confirmReady`, `none`, or `invalid` variants (these have no local state to reset).
- Changes to `MultiSelectMode` (already fixed by CHOICEUI-002).

## Acceptance Criteria

### Tests That Must Pass

1. Regression test: when `choiceUi` transitions from one `numeric` decision to another with the same domain, the slider value resets to `domain.min`. ✅
2. Existing `ChoicePanel` tests pass with `decisionId` added to `numeric` test fixtures. ✅
3. Existing suite: `pnpm -F @ludoforge/runner test` — 147 files, 1444 tests pass. ✅
4. `pnpm -F @ludoforge/runner typecheck` — clean. ✅

### Invariants

1. `RenderChoiceUi` type remains a discriminated union on `kind`. ✅
2. `NumericMode` still correctly tracks value within a single decision. ✅
3. `deriveRenderModel` determinism: same inputs produce same `decisionId` in output. ✅ (N/A — numeric not yet derived)

## Outcome

**What changed vs originally planned:**

- **Type change**: Done as planned — added `decisionId: string` to the `numeric` variant of `RenderChoiceUi`.
- **Component key**: Done as planned — added `key={choiceUi.decisionId}` to `NumericMode` in `ChoicePanel.tsx`.
- **Derivation change**: **Dropped** — investigation revealed `deriveChoiceUi` never produces `numeric` variants. The `numeric` type is forward-looking infrastructure with no current derivation path. The type contract now enforces that any future derivation must include `decisionId`.
- **Test updates**: Done as planned — updated 3 existing numeric fixtures + 1 type fixture with `decisionId`, added 1 regression test for stale state on decision transition.
- **Files touched**: 4 (not 5) — `derive-render-model.ts` was not modified.
