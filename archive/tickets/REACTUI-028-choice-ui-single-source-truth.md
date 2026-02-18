# REACTUI-028: Choice UI Single Source of Truth + Invalid-State Handling

**Status**: ✅ COMPLETED
**Spec**: 37 (State Management), 39 (React DOM UI)
**Priority**: P1
**Depends on**: REACTUI-024, REACTUI-023
**Estimated complexity**: M

---

## Reassessed Assumptions (2026-02-18)

- `renderModel.choiceUi` already exists and is consumed by bottom-bar routing (`packages/runner/src/ui/bottom-bar-mode.ts`) and `ChoicePanel`.
- Current bottom-bar derivation is **not** single-source yet for `confirmReady`: it still re-checks `selectedAction` and `partialMove`.
- No keyboard shortcut hook currently consumes bottom-bar/choice mode in this path, so keyboard gating is out of immediate implementation scope for this ticket.
- Existing tests currently encode legacy fallback behavior for inconsistent `confirmReady` state and must be updated.
- `RenderChoiceUi` currently has no explicit invalid branch; structurally impossible combinations silently degrade to other modes.

---

## Summary

Make `choiceUi` the sole authority for bottom-bar/choice-mode routing and add deterministic invalid-state projection in render-model derivation so impossible move-construction combinations never silently degrade into interactive UI.

---

## Scope (Updated)

- Extend `RenderChoiceUi` with an explicit non-interactive invalid branch carrying deterministic reason metadata.
- Update `deriveChoiceUi` to map structurally inconsistent move-construction inputs to `choiceUi.kind: 'invalid'`.
- Update bottom-bar derivation to route entirely from `renderModel.choiceUi.kind` (no secondary nullable-field reconfirmation).
- Update container + `ChoicePanel` branching to explicitly handle invalid mode as a fail-safe, non-interactive render.
- Ensure tests enforce exhaustive handling across all `choiceUi.kind` variants.

---

## Out of Scope

- New gameplay flows.
- Visual redesign of choice panel.
- Keyboard shortcut integration (no keyboard gating path exists yet in this module set).

---

## Implementation Notes

- Invalid-state reasons must be generic (engine-agnostic), deterministic, and not game-specific.
- `choiceUi` becomes the canonical UI-mode contract; store internals remain implementation details.
- Invalid branch is a fail-safe contract, not a replacement for store-level invariants.

---

## Tests that Must Pass / Be Updated

- `packages/runner/test/ui/bottom-bar-mode.test.ts`
  - routing is derived solely from `choiceUi.kind`.
  - inconsistent legacy fallback expectation is replaced with explicit invalid handling.
- `packages/runner/test/ui/GameContainer.test.ts`
  - exactly one branch renders per `choiceUi` variant, including invalid.
- `packages/runner/test/ui/ChoicePanel.test.ts`
  - invalid mode renders deterministic non-interactive output and no actionable controls.
- `packages/runner/test/model/derive-render-model-state.test.ts`
  - impossible source combinations map to explicit invalid choice state with deterministic reasons.
- `packages/runner/test/model/render-model-types.test.ts`
  - `RenderChoiceUi` variant coverage includes invalid.

---

## Invariants

- `choiceUi` is the single source of truth for choice/bottom-bar mode.
- Invalid combinations never silently degrade into interactive dead-end UI.
- Every `choiceUi.kind` is handled exhaustively in mode derivation and panel rendering.
- No game-specific conditions in mode orchestration or invalid reasons.

---

## Outcome

- **Completion date**: 2026-02-18
- **What changed**:
  - Added `RenderChoiceUi.kind: 'invalid'` with deterministic generic reason codes in the render-model contract.
  - Updated `deriveChoiceUi` to emit invalid state for structurally impossible combinations (missing action/move context, action/move mismatch).
  - Refactored bottom-bar mode derivation to consume only `renderModel.choiceUi.kind` (removed secondary checks against `selectedAction`/`partialMove`).
  - Added explicit invalid bottom-bar routing and fail-safe non-interactive rendering in `ChoicePanel`.
  - Updated model/UI tests to cover the invalid branch and single-source routing.
- **Deviations from original plan**:
  - Keyboard/context gating integration was explicitly left out because no keyboard gating hook currently exists in this module path.
- **Verification**:
  - `pnpm -F @ludoforge/runner test -- test/ui/bottom-bar-mode.test.ts test/ui/GameContainer.test.ts test/ui/ChoicePanel.test.ts test/model/derive-render-model-state.test.ts test/model/render-model-types.test.ts`
  - `pnpm turbo test`
  - `pnpm turbo lint`
