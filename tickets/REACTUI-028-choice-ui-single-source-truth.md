# REACTUI-028: Choice UI Single Source of Truth + Invalid-State Handling

**Status**: PENDING
**Spec**: 37 (State Management), 39 (React DOM UI)
**Priority**: P1
**Depends on**: REACTUI-024, REACTUI-023
**Estimated complexity**: M

---

## Summary

Make `choiceUi` the only bottom-bar/choice-mode authority. Eliminate secondary mode checks from UI orchestration and add explicit invalid-state handling for structurally impossible combinations.

---

## What Needs to Change

- Update bottom-bar derivation to trust `renderModel.choiceUi.kind` directly for choice-mode routing.
- Remove redundant reconfirmation logic based on `selectedAction`/`partialMove` where it duplicates `choiceUi`.
- Add explicit invalid choice UI representation (for example: `choiceUi.kind: 'invalid'` with a deterministic reason payload), or equivalent deterministic fallback contract.
- Update `ChoicePanel`/container branching to handle the invalid branch explicitly (non-interactive fail-safe rendering).
- Ensure keyboard/context gating logic (existing or future, e.g. REACTUI-018) consumes the same single authority.

---

## Out of Scope

- Implementation of new gameplay flows.
- Visual redesign of choice panel.

---

## Tests that Should Pass

- `packages/runner/test/ui/bottom-bar-mode.test.ts`
  - mode derivation is driven solely by `choiceUi.kind`.
  - no divergent outcomes from secondary nullable-field checks.
- `packages/runner/test/ui/GameContainer.test.ts`
  - exactly one bottom-bar branch renders for each `choiceUi` variant, including invalid state.
- `packages/runner/test/ui/ChoicePanel.test.ts`
  - invalid branch has no actionable controls and deterministic output.
- `packages/runner/test/model/derive-render-model-state.test.ts`
  - impossible source combinations map to explicit invalid/fallback choice state.

---

## Invariants

- `choiceUi` is the single source of truth for choice/bottom-bar mode.
- Invalid combinations never silently degrade into interactive dead-end UI.
- Every `choiceUi.kind` is handled exhaustively in mode derivation and panel rendering.
- No game-specific conditions in mode orchestration.

