# REACTUI-008: ChoicePanel — Multi-Select + Numeric Input Modes

**Spec**: 39 (React DOM UI Layer) — Deliverable D5 (partial: Mode B + Mode C)
**Priority**: P1
**Depends on**: REACTUI-007
**Estimated complexity**: M

---

## Summary

Add Mode B (multi-select with checkboxes) and Mode C (numeric input with slider) to the existing ChoicePanel. Remove the temporary placeholder text added in REACTUI-007.

---

## File List

### Modified files

| File | Change |
|------|--------|
| `packages/runner/src/ui/ChoicePanel.tsx` | Add Mode B and Mode C rendering branches |
| `packages/runner/src/ui/ChoicePanel.module.css` | Add styles for checkboxes, count indicator, slider, quick-select buttons |

---

## Detailed Requirements

### Mode B — Multi-select

- Active when: `choiceType === 'chooseN'` AND `currentChoiceOptions !== null`.
- Each `RenderChoiceOption` rendered as a toggleable checkbox button.
- **Local state**: tracks which options are currently selected (array of values).
- **Count indicator**: "Selected: X of Y-Z" showing selected count vs `choiceMin`-`choiceMax` range.
- **Min/max enforcement**:
  - Cannot deselect below `choiceMin` (if already at min).
  - Cannot select above `choiceMax`.
- **"Confirm selection"** button:
  - Enabled only when selected count is within `[choiceMin, choiceMax]` bounds.
  - Dispatches `chooseN(selectedValues)`.
- Illegal options (`isLegal === false`): visually muted, non-selectable, show `<IllegalityFeedback>`.

### Mode C — Numeric input

- Active when: `choiceType === 'chooseOne'` AND `currentChoiceDomain !== null`.
- Reads `RenderChoiceDomain.min`, `max`, `step`.
- **Slider** (`<input type="range">`): `min`, `max`, `step` from domain.
- **Direct number input** (`<input type="number">`): synced with slider.
- **Quick-select buttons**: 25%, 50%, 75%, Max. Each sets the value to `Math.round(min + fraction * (max - min))` rounded to nearest `step`.
- **Confirm button**: dispatches `chooseOne(numericValue)`. Always enabled (since any value within domain is valid).
- **Local state**: current numeric value (initialized to `min`).

### Remove placeholders

- Delete the "Multi-select coming soon" and "Numeric input coming soon" placeholder text from REACTUI-007.

---

## Out of Scope

- Breadcrumb and navigation buttons (already in REACTUI-007)
- Discrete single-select mode (already in REACTUI-007)
- Keyboard shortcuts (REACTUI-018)
- Animation (Spec 40)
- Drag-and-drop for multi-select

---

## Acceptance Criteria

### Tests that must pass

| Test file | Test |
|-----------|------|
| `packages/runner/test/ui/ChoicePanel.test.tsx` | Mode B: renders checkbox-style buttons for each option |
| `packages/runner/test/ui/ChoicePanel.test.tsx` | Mode B: shows count indicator "Selected: X of Y-Z" |
| `packages/runner/test/ui/ChoicePanel.test.tsx` | Mode B: confirm disabled when selected count < choiceMin |
| `packages/runner/test/ui/ChoicePanel.test.tsx` | Mode B: confirm disabled when selected count > choiceMax |
| `packages/runner/test/ui/ChoicePanel.test.tsx` | Mode B: confirm enabled when selected count within bounds |
| `packages/runner/test/ui/ChoicePanel.test.tsx` | Mode B: dispatches `chooseN(selectedValues)` on confirm |
| `packages/runner/test/ui/ChoicePanel.test.tsx` | Mode B: illegal options are muted and non-selectable |
| `packages/runner/test/ui/ChoicePanel.test.tsx` | Mode C: renders slider with min/max/step from domain |
| `packages/runner/test/ui/ChoicePanel.test.tsx` | Mode C: renders number input synced with slider |
| `packages/runner/test/ui/ChoicePanel.test.tsx` | Mode C: quick-select buttons set correct fraction values |
| `packages/runner/test/ui/ChoicePanel.test.tsx` | Mode C: dispatches `chooseOne(numericValue)` on confirm |
| `packages/runner/test/ui/ChoicePanel.test.tsx` | No placeholder text remains for modes B or C |

### Invariants

- Multi-select state is **local** to the component (React `useState`), not stored in Zustand.
- Numeric input state is **local** to the component.
- `chooseN` is dispatched with an array of `MoveParamValue` scalars — not the full `RenderChoiceOption` objects.
- `chooseOne` for numeric is dispatched with a single number value.
- Min/max bounds are enforced in the UI — the component does NOT allow dispatching out-of-bounds values.
- No game-specific logic. Domain labels come from RenderModel data.
- Slider `step` attribute is set from `RenderChoiceDomain.step`.
