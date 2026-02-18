# REACTUI-031: Generic Lasting Effect Render Contract

**Status**: ACTIVE
**Spec**: 37 (State Management), 39 (React DOM UI Layer)
**Priority**: P1
**Depends on**: REACTUI-012
**Estimated complexity**: M

---

## Summary

Remove game-shaped assumptions from lasting effect rendering by replacing the current fixed `RenderLastingEffect` fields with a generic, display-oriented contract that can represent any board/card game's effect metadata.

---

## What Needs to Change

- Replace the current `RenderLastingEffect` shape in `packages/runner/src/model/render-model.ts`:
  - remove hardcoded fields that encode one game's semantics (`sourceCardId`, `side`, `duration`).
  - introduce a generic projection contract (for example: `displayName` + `attributes` key/value rows, and stable `id`).
- Update effect derivation in `packages/runner/src/model/derive-render-model.ts` to project this generic contract without game-specific branches.
- Update `packages/runner/src/ui/ActiveEffectsPanel.tsx` to render only the generic contract from RenderModel.
- Update related tests and fixtures that currently depend on the old effect shape.

---

## Invariants

- RenderModel effect schema is game-agnostic and does not embed per-game semantics.
- `ActiveEffectsPanel` is display-only and consumes projection data without inferencing game rules.
- Effect ordering and IDs are deterministic across equivalent state inputs.
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
- `packages/runner/test/ui/GameContainer.test.ts`
  - side-panel composition still mounts ActiveEffectsPanel.
