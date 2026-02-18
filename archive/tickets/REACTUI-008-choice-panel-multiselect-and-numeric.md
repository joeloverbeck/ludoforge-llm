# REACTUI-008: ChoicePanel — Multi-Select + Numeric Input Modes

**Status**: ✅ COMPLETED
**Spec**: 39 (React DOM UI Layer) — Deliverable D5 (partial: Mode B + Mode C)
**Priority**: P1
**Depends on**: REACTUI-007
**Estimated complexity**: M

---

## Summary

Implement ChoicePanel Mode B (`discreteMany`) and Mode C (`numeric`) using the current `renderModel.choiceUi` contract. Remove REACTUI-007 placeholders.

---

## Assumptions Reassessed (Code/Test Reality)

- ChoicePanel does **not** read legacy fields like `choiceType`, `currentChoiceOptions`, or `currentChoiceDomain`. It reads `renderModel.choiceUi.kind`.
- Option legality is encoded as `RenderChoiceOption.legality` (`'legal' | 'illegal' | 'unknown'`) plus `illegalReason`, not `isLegal`.
- Multi-select bounds are `min: number | null` and `max: number | null` on `choiceUi.kind === 'discreteMany'`.
- The UI test file is `packages/runner/test/ui/ChoicePanel.test.ts` (not `.tsx`).
- Current `deriveRenderModel` intentionally maps choose-one pending states to `discreteOne` (including empty-option states), so Mode C is a valid UI branch for `choiceUi.kind === 'numeric'` but may not yet be produced by runtime-driven flows.

---

## Updated Scope

- Add robust Mode B behavior for `choiceUi.kind === 'discreteMany'`.
- Add robust Mode C behavior for `choiceUi.kind === 'numeric'`.
- Keep all state local to ChoicePanel for these two modes.
- Do **not** change engine/store/render-model derivation in this ticket.
- Do **not** introduce compatibility aliases to legacy field names.

---

## File List

### Modified files

| File | Change |
|------|--------|
| `packages/runner/src/ui/ChoicePanel.tsx` | Implement Mode B + Mode C interactions and remove placeholders |
| `packages/runner/src/ui/ChoicePanel.module.css` | Add styles for multi-select and numeric controls |
| `packages/runner/test/ui/ChoicePanel.test.ts` | Replace placeholder tests with behavior tests for Mode B + Mode C |

---

## Detailed Requirements

### Mode B — Multi-select

- Active when: `choiceUi.kind === 'discreteMany'`.
- Each `RenderChoiceOption` rendered as a toggleable checkbox button.
- **Local state**: tracks selected option values as scalar `MoveParamValue` entries.
- **Count indicator**: deterministic count text derived from nullable `min`/`max`.
- **Min/max enforcement**:
  - Selection cannot exceed effective max.
  - Confirm only enabled when selected count is within effective bounds.
- **"Confirm selection"** button:
  - Enabled only when selected count is within computed min/max bounds.
  - Dispatches `chooseN(selectedValues)`.
- Illegal/unknown options (`legality !== 'legal'`): visually muted, non-selectable, show `<IllegalityFeedback>`.

### Mode C — Numeric input

- Active when: `choiceUi.kind === 'numeric'`.
- Reads `choiceUi.domain.min`, `max`, `step`.
- **Slider** (`<input type="range">`): `min`, `max`, `step` from domain.
- **Direct number input** (`<input type="number">`): synced with slider.
- **Quick-select buttons**: 25%, 50%, 75%, Max. Values snap to valid step increments.
- **Confirm button**: dispatches `chooseOne(numericValue)` as a scalar number.
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
| `packages/runner/test/ui/ChoicePanel.test.ts` | Mode B: renders toggle controls for each option |
| `packages/runner/test/ui/ChoicePanel.test.ts` | Mode B: shows deterministic selected-count indicator with bounds |
| `packages/runner/test/ui/ChoicePanel.test.ts` | Mode B: confirm disabled/enabled according to effective min/max |
| `packages/runner/test/ui/ChoicePanel.test.ts` | Mode B: dispatches `chooseN(selectedValues)` on confirm |
| `packages/runner/test/ui/ChoicePanel.test.ts` | Mode B: non-legal options remain non-selectable and show illegality feedback |
| `packages/runner/test/ui/ChoicePanel.test.ts` | Mode C: renders slider + number input using domain min/max/step |
| `packages/runner/test/ui/ChoicePanel.test.ts` | Mode C: slider and number input remain synchronized and clamped |
| `packages/runner/test/ui/ChoicePanel.test.ts` | Mode C: quick-select buttons produce valid stepped values |
| `packages/runner/test/ui/ChoicePanel.test.ts` | Mode C: dispatches `chooseOne(numericValue)` on confirm |
| `packages/runner/test/ui/ChoicePanel.test.ts` | No placeholder text remains for modes B or C |

### Invariants

- Multi-select state is **local** to the component (React `useState`), not stored in Zustand.
- Numeric input state is **local** to the component.
- `chooseN` is dispatched with an array of `MoveParamValue` scalars — not the full `RenderChoiceOption` objects.
- `chooseOne` for numeric is dispatched with a single number value.
- Bounds are enforced in the UI; the component does not dispatch out-of-range counts/values.
- No game-specific logic. Domain labels come from RenderModel data.
- Slider `step` attribute is set from `RenderChoiceDomain.step`.

---

## Outcome

- **Completion date**: 2026-02-18
- **What changed**:
  - Re-aligned ticket assumptions/scope to current `RenderModel.choiceUi` architecture (no legacy field aliases).
  - Implemented ChoicePanel Mode B (`discreteMany`) with local selection state, deterministic bounds handling, illegality gating, and `chooseN` dispatch.
  - Implemented ChoicePanel Mode C (`numeric`) with local numeric state, slider/number synchronization, stepped quick-selects, and `chooseOne` dispatch.
  - Removed REACTUI-007 placeholder copy for Mode B/Mode C.
  - Replaced placeholder assertions with interaction-focused tests covering bounds, legality, dispatch payloads, and numeric stepping.
- **Deviation from original plan**:
  - Added `react-test-renderer` test dependency (plus types) so hook-based local state could be tested without weakening component architecture.
  - Corrected acceptance test file extension from `.tsx` to `.ts`.
- **Verification**:
  - `pnpm -F @ludoforge/runner lint` ✅
  - `pnpm -F @ludoforge/runner test` ✅
  - `pnpm -F @ludoforge/runner typecheck` ⚠️ fails due pre-existing errors in `packages/runner/src/worker/game-worker-api.ts` (required parameter after optional parameter at lines 60 and 249), unrelated to this ticket.
