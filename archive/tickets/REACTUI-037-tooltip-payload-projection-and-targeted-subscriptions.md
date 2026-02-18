# REACTUI-037: Tooltip Payload Projection + Targeted Subscriptions

**Status**: ✅ COMPLETED
**Spec**: 39 (React DOM UI Layer) — D19 hardening
**Priority**: P2
**Depends on**: REACTUI-016
**Estimated complexity**: M

---

## What Needs To Change

- Introduce a game-agnostic tooltip payload projection layer.
  - `TooltipLayer` should render a normalized payload, not directly format `RenderZone`/`RenderToken` internals inline.
- Move tooltip data shaping into a projector utility/module near model/UI boundary.
- Narrow tooltip subscriptions so open tooltip reacts only to hovered entity payload changes, not whole `zones`/`tokens` array identity churn.
- Keep renderer generic: rows/sections are data-driven, with no game-specific branching.

Likely files:
- `packages/runner/src/ui/TooltipLayer.tsx`
- `packages/runner/src/model/` (new tooltip projection utility)
- `packages/runner/test/ui/TooltipLayer.test.ts`
- `packages/runner/test/model/` (new projection tests)

---

## Assumption Reassessment (2026-02-18)

- `TooltipLayer` currently reads `renderModel.zones` + `renderModel.tokens` directly and formats rows inline in the component. The ticket assumption that projection is missing is correct.
- Existing tooltip tests mock `zustand.useStore` as `selector(store.getState())`, so they cannot validate real subscription behavior or rerender suppression. The ticket must require at least one real subscription-driven test.
- `deriveRenderModel()` recreates zone/token objects each derivation, so a naive selector-by-reference is insufficient. Subscription narrowing must be based on hovered-entity payload/signature stability rather than array/object identity alone.
- Spec 39 D19 mentions legal choice explanations in tooltip copy, but the current `RenderModel` has no dedicated hovered-entity legality explanation payload. This ticket should not invent new game-specific legality logic; scope remains projection/subscription hardening for existing zone/token data.

---

## Updated Scope

- Add a model-level tooltip projection module that converts hovered zone/token data into a normalized, renderer-agnostic payload.
- Refactor `TooltipLayer` to render only normalized payload rows/sections.
- Add a hovered-target-specific tooltip selector/signature path so unrelated store updates do not rerender an open tooltip when payload is unchanged.
- Add/strengthen tests in model + UI to cover payload projection and subscription behavior with a real zustand subscription path.

Out of scope for this ticket:
- New legality explanation generation in kernel/render-model.
- Game-specific tooltip formats.

---

## Invariants

- Tooltip rendering remains game-agnostic and does not encode per-game logic.
- Tooltip component receives normalized payload and does not own data-shaping policy.
- Unrelated RenderModel updates do not cause unnecessary tooltip recomputation/rerender for unchanged hovered entity payload.

---

## Tests That Must Pass

- `packages/runner/test/model/*tooltip*.test.ts` (new)
  - Projects zone hover into normalized tooltip payload.
  - Projects token hover into normalized tooltip payload.
  - Handles missing/invalid hover target with null payload.
- `packages/runner/test/ui/TooltipLayer.test.ts`
  - Renders normalized payload correctly for zone and token cases.
  - Uses real store subscription behavior to prove unrelated updates do not rerender when hovered payload is unchanged.
  - Still honors pointer-events and Floating UI positioning contract.

---

## Outcome

- **Completion date**: 2026-02-18
- **What changed**:
  - Added `packages/runner/src/model/tooltip-payload.ts` with game-agnostic tooltip payload projection plus hovered-target payload signature selector.
  - Refactored `packages/runner/src/ui/TooltipLayer.tsx` to render normalized payload rows/sections and subscribe via hovered-target payload signature, not direct zone/token array slices.
  - Updated `packages/runner/src/model/derive-render-model.ts` and `packages/runner/src/store/game-store.ts` to apply structural sharing for unchanged `zones`/`tokens` entities between derivations, reducing identity churn at the source.
  - Added `packages/runner/test/model/tooltip-payload.test.ts`.
  - Added `packages/runner/test/model/derive-render-model-structural-sharing.test.ts`.
  - Reworked `packages/runner/test/ui/TooltipLayer.test.ts` to validate normalized rendering and real zustand subscription behavior for unchanged payload updates.
- **Deviation from original plan**:
  - Scope explicitly excluded legal-choice explanation generation because current `RenderModel` does not expose a dedicated hovered-entity legality payload and ticket remains game-agnostic.
- **Verification**:
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner lint`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm turbo test`
  - `pnpm turbo lint`
  - `pnpm turbo typecheck`
