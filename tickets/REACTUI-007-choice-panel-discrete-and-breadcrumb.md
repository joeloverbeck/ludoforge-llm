# REACTUI-007: ChoicePanel — Discrete Single-Select + Breadcrumb + Navigation

**Spec**: 39 (React DOM UI Layer) — Deliverable D5 (partial: Mode A + breadcrumb + nav)
**Priority**: P1
**Depends on**: REACTUI-003, REACTUI-006
**Estimated complexity**: L

---

## Summary

Create the ChoicePanel shell with breadcrumb navigation, cancel/back/confirm buttons, and Mode A (discrete single-select). This is the first half of the most complex UI component. Mode B (multi-select) and Mode C (numeric) are added in REACTUI-008.

---

## File List

### New files

| File | Purpose |
|------|---------|
| `packages/runner/src/ui/ChoicePanel.tsx` | Multi-mode choice panel with breadcrumb and navigation |
| `packages/runner/src/ui/ChoicePanel.module.css` | Choice panel layout, breadcrumb, option buttons |

### Modified files

| File | Change |
|------|--------|
| `packages/runner/src/ui/UIOverlay.tsx` | Mount `ChoicePanel` in the bottom bar region |

---

## Detailed Requirements

### ChoicePanel shell

- **Store selectors**: reads `renderModel.choiceBreadcrumb`, `renderModel.currentChoiceOptions`, `renderModel.currentChoiceDomain`, `renderModel.choiceType`, `renderModel.choiceMin`, `renderModel.choiceMax`.
- **Visibility**: renders only when `choiceType !== null` (a choice is pending).
- **Replaces** ActionToolbar in the bottom bar when visible (ActionToolbar self-hides when `choiceType !== null`).

### Breadcrumb

- Renders `RenderChoiceStep[]` from `choiceBreadcrumb` as horizontal chips.
- Each chip shows `chosenDisplayName`.
- Clicking a previous chip dispatches `cancelChoice()` repeatedly to navigate back to that step. Implementation: dispatch `cancelChoice()` N times where N = (total steps - clicked step index).
- Current (incomplete) step shown as active/highlighted.

### Navigation buttons

- **"Back"** button: dispatches `cancelChoice()`. Disabled if `choiceBreadcrumb.length === 0`.
- **"Cancel"** button: dispatches `cancelMove()`. Always enabled.
- **"Confirm"** button: dispatches `confirmMove()`. Visible **only** when all required choices are made (i.e., `currentChoiceOptions === null && currentChoiceDomain === null && choiceType === null` after the last choice is made — the store transitions to "ready to confirm"). Implementation note: the store's `choicePending` being null while `selectedAction` is non-null means the move is fully constructed.

### Mode A — Discrete single-select

- Active when: `choiceType === 'chooseOne'` AND `currentChoiceOptions !== null`.
- Renders each `RenderChoiceOption` as a button:
  - `isLegal === true`: enabled, clickable. `onClick` dispatches `chooseOne(value)`.
  - `isLegal === false`: visually muted, shows `<IllegalityFeedback illegalReason={option.illegalReason} />`.
- Display text: `option.displayName`.

### Mode B / Mode C placeholders

- If `choiceType === 'chooseN'`, render a placeholder text: "Multi-select coming soon" (REACTUI-008).
- If `choiceType === 'chooseOne'` AND `currentChoiceDomain !== null`, render a placeholder text: "Numeric input coming soon" (REACTUI-008).

---

## Out of Scope

- Multi-select mode (REACTUI-008)
- Numeric input mode (REACTUI-008)
- Keyboard shortcuts for confirm/cancel (REACTUI-018)
- Animation on choice transitions (Spec 40)
- Canvas highlighting of choice-relevant zones/tokens (Spec 38 interaction layer)

---

## Acceptance Criteria

### Tests that must pass

| Test file | Test |
|-----------|------|
| `packages/runner/test/ui/ChoicePanel.test.tsx` | Not visible when `choiceType` is null |
| `packages/runner/test/ui/ChoicePanel.test.tsx` | Renders breadcrumb chips from `choiceBreadcrumb` |
| `packages/runner/test/ui/ChoicePanel.test.tsx` | Clicking breadcrumb chip dispatches `cancelChoice()` correct number of times |
| `packages/runner/test/ui/ChoicePanel.test.tsx` | "Back" button dispatches `cancelChoice()` |
| `packages/runner/test/ui/ChoicePanel.test.tsx` | "Cancel" button dispatches `cancelMove()` |
| `packages/runner/test/ui/ChoicePanel.test.tsx` | Mode A: renders legal options as enabled buttons |
| `packages/runner/test/ui/ChoicePanel.test.tsx` | Mode A: renders illegal options as disabled with `IllegalityFeedback` |
| `packages/runner/test/ui/ChoicePanel.test.tsx` | Mode A: clicking a legal option dispatches `chooseOne(value)` |
| `packages/runner/test/ui/ChoicePanel.test.tsx` | "Back" button disabled when breadcrumb is empty |

### Invariants

- Uses **Zustand selectors** for minimal re-renders. Does NOT subscribe to the entire store.
- No game-specific logic. All option labels come from `RenderChoiceOption.displayName`.
- `pointer-events: auto` on all interactive elements.
- `IllegalityFeedback` is imported from `./IllegalityFeedback` — no duplication of illegality rendering logic.
- Breadcrumb navigation uses `cancelChoice()` store action — does NOT directly manipulate `choiceStack`.
- Placeholder text for modes B and C is clearly marked as temporary.
