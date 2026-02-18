# REACTUI-031: Generic Lasting Effect Render Contract

**Status**: ✅ COMPLETED
**Spec**: 37 (State Management), 39 (React DOM UI Layer)
**Priority**: P1
**Depends on**: REACTUI-012
**Estimated complexity**: M

---

## Summary

Remove game-shaped assumptions from lasting effect rendering by replacing the current fixed `RenderLastingEffect` fields with a generic, display-oriented contract that can represent any board/card game's effect metadata.

## Assumption Reassessment (2026-02-18)

- Verified current runner code still hardcodes game-shaped lasting-effect fields in `RenderLastingEffect` (`sourceCardId`, `side`, `duration`) and in `ActiveEffectsPanel`.
- Verified derivation currently applies game-specific naming policy (`cardTitleById` lookup by `sourceCardId`) inside `deriveActiveEffects`.
- Verified listed tests exist, but test-impact scope was incomplete:
  - `packages/runner/test/ui/helpers/render-model-fixture.ts` must be updated because UI tests consume the shared `RenderModel` fixture shape.
- Verified no additional production call sites outside `render-model`, `derive-render-model`, and `ActiveEffectsPanel` rely on old fields.

This ticket is still valid, but scope is tightened below to enforce a deterministic generic projection boundary.

---

## What Needs to Change

- Replace the current `RenderLastingEffect` shape in `packages/runner/src/model/render-model.ts`:
  - remove hardcoded fields that encode one game's semantics (`sourceCardId`, `side`, `duration`).
  - introduce a generic projection contract:
    - stable `id`
    - `displayName`
    - deterministic `attributes` rows (label/value pairs) suitable for direct rendering
  - no alias/back-compat fields for removed shape.
- Update effect derivation in `packages/runner/src/model/derive-render-model.ts` to project this generic contract without game-specific branches.
  - keep derivation deterministic (stable row ordering for equivalent inputs).
  - include sparse/fallback handling so optional/missing effect metadata still projects predictably.
- Update `packages/runner/src/ui/ActiveEffectsPanel.tsx` to render only the generic contract from RenderModel.
- Update related tests and fixtures that currently depend on the old effect shape, including:
  - `packages/runner/test/model/derive-render-model-state.test.ts`
  - `packages/runner/test/model/render-model-types.test.ts`
  - `packages/runner/test/ui/ActiveEffectsPanel.test.ts`
  - `packages/runner/test/ui/helpers/render-model-fixture.ts`
  - `packages/runner/test/ui/GameContainer.test.ts` (verification-only unless fixture contract requires edits)

---

## Invariants

- RenderModel effect schema is game-agnostic and does not embed per-game semantics.
- `ActiveEffectsPanel` is display-only and consumes projection data without inferencing game rules.
- Effect ordering and IDs are deterministic across equivalent state inputs.
- Effect attribute rows are deterministic across equivalent state inputs.
- No back-compat aliases for old fields in runner UI code.

---

## Tests that Should Pass

- `packages/runner/test/model/derive-render-model-state.test.ts`
  - active effects project into the new generic contract deterministically.
  - missing optional metadata still yields stable fallback projection.
- `packages/runner/test/model/render-model-types.test.ts`
  - RenderModel sample data validates against the updated effect contract.
- `packages/runner/test/ui/ActiveEffectsPanel.test.ts`
  - renders effect rows from generic attributes.
  - returns `null` when no active effects.
- `packages/runner/test/ui/helpers/render-model-fixture.ts`
  - shared fixture remains valid for updated `RenderModel` contract.
- `packages/runner/test/ui/GameContainer.test.ts`
  - side-panel composition still mounts ActiveEffectsPanel.

---

## Outcome

- **Completion date**: 2026-02-18
- **What changed**:
  - Replaced `RenderLastingEffect` game-shaped fields with a generic contract (`id`, `displayName`, `attributes[]`).
  - Updated render-model derivation to emit deterministic, primitive-only lasting effect attribute rows and preserve stable IDs/order.
  - Updated `ActiveEffectsPanel` to render generic attributes only (display consumer, no side/source/duration assumptions).
  - Updated impacted model/UI tests and added explicit regression coverage for deterministic attribute projection and non-display payload exclusion.
  - Updated ticket assumptions/scope before implementation to reflect actual impacted fixture/test surface.
- **Deviations from original plan**:
  - None functionally; scope clarification added one missed impacted fixture path (`packages/runner/test/ui/helpers/render-model-fixture.ts`) and added stricter deterministic projection constraint.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test` ✅
  - `pnpm turbo test` ✅
  - `pnpm turbo lint` ✅
  - `pnpm -F @ludoforge/runner typecheck` ⚠️ fails due pre-existing unrelated `test/ui/VariablesPanel.test.ts` StoreApi typing in this branch.
