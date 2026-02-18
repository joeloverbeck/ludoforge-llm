# REACTUI-007: ChoicePanel — Discrete Single-Select + Breadcrumb + Navigation

**Spec**: 39 (React DOM UI Layer) — Deliverable D5 (partial: Mode A + breadcrumb + nav)
**Priority**: P1
**Depends on**: REACTUI-003, REACTUI-006
**Estimated complexity**: L
**Status**: ✅ COMPLETED

---

## Summary

Create the ChoicePanel shell with breadcrumb navigation, cancel/back/confirm buttons, and Mode A (discrete single-select). This is the first half of the most complex UI component. Mode B (multi-select) and Mode C (numeric) are added in REACTUI-008.

---

## Reassessed Assumptions and Scope Corrections

### Corrected baseline assumptions (repo reality)

- Bottom-bar composition currently lives in `packages/runner/src/ui/GameContainer.tsx`; `UIOverlay` is a structural shell with a `bottomBarContent` slot. ChoicePanel integration belongs in `GameContainer`, not `UIOverlay`.
- Runner UI tests are currently `*.test.ts` contract tests (Node + `renderToStaticMarkup` / element tree assertions), not `*.test.tsx`.
- `RenderChoiceOption` exposes `legality: 'legal' | 'illegal' | 'unknown'` plus `illegalReason`, not a boolean `isLegal`.
- `renderModel.currentChoiceDomain` currently derives to `null` in `deriveRenderModel` and has no upstream runtime source yet; numeric mode remains a placeholder path for future work.

### Scope adjustments

- Implement D5 Mode A + breadcrumb + nav using current render-model contracts (`legality`, `illegalReason`, `choiceType`, `choiceBreadcrumb`, `selectedAction`/`partialMove` readiness).
- Integrate `<ChoicePanel store={store} />` in `GameContainer` bottom-bar composition alongside existing controls.
- Keep `UIOverlay` store-agnostic and unchanged.
- Add ticket acceptance tests in `packages/runner/test/ui/ChoicePanel.test.ts`.

### Architectural rationale

- Keeping orchestration in `GameContainer` and keeping `UIOverlay` purely structural is cleaner and more extensible than introducing store logic into `UIOverlay`.
- Rendering legality via the existing tri-state `legality` contract avoids UI/kernel schema drift and preserves forward compatibility for `unknown` legality.
- Confirm readiness should be derived from move-construction invariants (`selectedAction !== null`, `partialMove !== null`, `choiceType === null`) rather than inferred only from option/domain nullability.

---

## File List

### New files

| File | Purpose |
|------|---------|
| `packages/runner/src/ui/ChoicePanel.tsx` | Multi-mode choice panel with breadcrumb and navigation |
| `packages/runner/src/ui/ChoicePanel.module.css` | Choice panel layout, breadcrumb, option buttons |
| `packages/runner/test/ui/ChoicePanel.test.ts` | Contract tests for visibility, breadcrumb navigation, and Mode A behavior |

### Modified files

| File | Change |
|------|--------|
| `packages/runner/src/ui/GameContainer.tsx` | Mount `ChoicePanel` in the bottom bar region composition |
| `packages/runner/src/ui/ActionToolbar.tsx` | Hide toolbar while a move is being constructed (`selectedAction !== null`) |
| `packages/runner/src/ui/UndoControl.tsx` | Hide undo while a move is being constructed (`selectedAction !== null`) |
| `packages/runner/test/ui/ActionToolbar.test.ts` | Add visibility regression test for in-progress move construction |
| `packages/runner/test/ui/UndoControl.test.ts` | Add visibility regression test for in-progress move construction |

---

## Detailed Requirements

### ChoicePanel shell

- **Store selectors**: reads `renderModel.choiceBreadcrumb`, `renderModel.currentChoiceOptions`, `renderModel.currentChoiceDomain`, `renderModel.choiceType`, `renderModel.choiceMin`, `renderModel.choiceMax`, plus `selectedAction` and `partialMove` for confirm-ready visibility.
- **Visibility**: renders when a choice is pending (`choiceType !== null`) **or** when a move is fully constructed and waiting for confirm (`selectedAction !== null && partialMove !== null && choiceType === null`).
- **Bottom bar composition**: mounted by `GameContainer` with `ActionToolbar`/`UndoControl`; ChoicePanel renders `null` when hidden and naturally replaces action controls because those components self-hide when `choiceType !== null`.

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
  - `option.legality === 'legal'`: enabled, clickable. `onClick` dispatches `chooseOne(value)`.
  - `option.legality !== 'legal'`: visually muted, disabled, and shows `<IllegalityFeedback illegalReason={option.illegalReason} />`.
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
| `packages/runner/test/ui/ChoicePanel.test.ts` | Not visible when `choiceType` is null |
| `packages/runner/test/ui/ChoicePanel.test.ts` | Renders breadcrumb chips from `choiceBreadcrumb` |
| `packages/runner/test/ui/ChoicePanel.test.ts` | Breadcrumb rewind count helper and dispatch loop call `cancelChoice()` correct number of times |
| `packages/runner/test/ui/ChoicePanel.test.ts` | "Back" button dispatches `cancelChoice()` |
| `packages/runner/test/ui/ChoicePanel.test.ts` | "Cancel" button dispatches `cancelMove()` |
| `packages/runner/test/ui/ChoicePanel.test.ts` | Mode A: renders legal options as enabled buttons |
| `packages/runner/test/ui/ChoicePanel.test.ts` | Mode A: renders non-legal options as disabled with `IllegalityFeedback` |
| `packages/runner/test/ui/ChoicePanel.test.ts` | Mode A: clicking a legal option dispatches `chooseOne(value)` |
| `packages/runner/test/ui/ChoicePanel.test.ts` | "Back" button disabled when breadcrumb is empty |
| `packages/runner/test/ui/ChoicePanel.test.ts` | Confirm button renders only for confirm-ready moves and dispatches `confirmMove()` |
| `packages/runner/test/ui/ChoicePanel.test.ts` | Placeholder rendering for `chooseN` and numeric modes |

### Invariants

- Uses **Zustand selectors** for minimal re-renders. Does NOT subscribe to the entire store.
- No game-specific logic. All option labels come from `RenderChoiceOption.displayName`.
- `pointer-events: auto` on all interactive elements.
- `IllegalityFeedback` is imported from `./IllegalityFeedback` — no duplication of illegality rendering logic.
- Breadcrumb navigation uses `cancelChoice()` store action — does NOT directly manipulate `choiceStack`.
- Confirm readiness is derived from store move-construction state (`selectedAction`, `partialMove`, `choiceType`) and not hardcoded game rules.
- Placeholder text for modes B and C is clearly marked as temporary.

---

## Outcome

- **Completion date**: 2026-02-18
- **What changed vs originally planned**:
  - Added `ChoicePanel` with breadcrumb chips, back/cancel/confirm navigation, Mode A option rendering, and placeholders for Mode B/Mode C.
  - Mounted `ChoicePanel` in `GameContainer` bottom-bar composition while keeping `UIOverlay` structural/store-agnostic.
  - Added deterministic breadcrumb rewind helpers (`countChoicesToCancel`, `rewindChoiceToBreadcrumb`) to isolate and test cancel-loop logic.
  - Added `ChoicePanel` contract tests covering visibility, breadcrumb rendering/rewind behavior, navigation dispatches, legality rendering, confirm-ready behavior, placeholders, and pointer-event CSS contract.
  - Tightened bottom-bar behavior by hiding `ActionToolbar` and `UndoControl` while a move is being constructed, preventing overlap with confirm-ready ChoicePanel.
- **Deviations from original draft ticket**:
  - Corrected visibility model to include confirm-ready state (`selectedAction` + `partialMove`) rather than `choiceType`-only gating.
  - Corrected legality contract usage from boolean `isLegal` to tri-state `legality`.
  - Kept `UIOverlay` unchanged; integration occurred in `GameContainer`.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm turbo test` passed.
  - `pnpm turbo lint` passed.
  - `pnpm turbo typecheck` passed.
