# REACTUI-005: ActionToolbar and UndoControl

**Spec**: 39 (React DOM UI Layer) — Deliverables D4, D7
**Priority**: P1
**Depends on**: REACTUI-003
**Estimated complexity**: M

---

## Summary

Create the ActionToolbar (displays available actions grouped by `RenderActionGroup`) and UndoControl (undo button). These two components always appear together in the bottom bar when it's the human player's turn and no choice is pending.

---

## File List

### New files

| File | Purpose |
|------|---------|
| `packages/runner/src/ui/ActionToolbar.tsx` | Grouped action buttons from `RenderActionGroup[]` |
| `packages/runner/src/ui/ActionToolbar.module.css` | Toolbar layout and button styling |
| `packages/runner/src/ui/UndoControl.tsx` | Undo button |
| `packages/runner/src/ui/UndoControl.module.css` | Undo button styling |

### Modified files

| File | Change |
|------|--------|
| `packages/runner/src/ui/UIOverlay.tsx` | Mount `ActionToolbar` + `UndoControl` in the bottom bar region |

---

## Detailed Requirements

### ActionToolbar (D4)

- **Store selector**: reads `renderModel.actionGroups` via `useStore(store, s => s.renderModel?.actionGroups ?? [])`.
- **Visibility**: hidden when a choice is pending (`choiceType !== null`) or when the active player is not human. Check `renderModel.choiceType` and `renderModel.players` + `renderModel.activePlayerID`.
- Renders each `RenderActionGroup` as a labeled group.
- Each `RenderAction` rendered as a `<button>`:
  - `isAvailable === true`: enabled, clickable. `onClick` dispatches `store.getState().selectAction(actionId)`.
  - `isAvailable === false`: disabled, muted styling, `aria-disabled="true"`.
- Groups collapse to a single row if few actions, expand to multiple rows if many.
- Each button has `pointer-events: auto` (parent overlay is `pointer-events: none`).
- Keyboard number hints: show `1`, `2`, ... labels on buttons (visual hint for keyboard shortcut). Actual keyboard handling is REACTUI-018.

### UndoControl (D7)

- **Store selector**: reads `choiceStack` length (if >0, a choice is pending — hide undo) and active player human status.
- Renders an "Undo" button that dispatches `store.getState().undo()`.
- Visible **only** when: human turn, no choice pending, no AI turn.
- Sits beside ActionToolbar in the bottom bar.
- Has `pointer-events: auto`.

### UIOverlay integration

- In the bottom bar region, render:
  ```tsx
  <ActionToolbar store={store} />
  <UndoControl store={store} />
  ```
- These are mounted unconditionally; they handle their own visibility internally.

---

## Out of Scope

- ChoicePanel (REACTUI-007/008)
- AITurnOverlay (REACTUI-015)
- Keyboard shortcuts (REACTUI-018) — buttons show number hints but don't handle keydown
- Animation on action selection (Spec 40)
- Bottom bar state machine orchestration — each component gates itself for now

---

## Acceptance Criteria

### Tests that must pass

| Test file | Test |
|-----------|------|
| `packages/runner/test/ui/ActionToolbar.test.tsx` | Renders action buttons from RenderActionGroup data |
| `packages/runner/test/ui/ActionToolbar.test.tsx` | Disabled actions have `aria-disabled="true"` |
| `packages/runner/test/ui/ActionToolbar.test.tsx` | Clicking an available action dispatches `selectAction` |
| `packages/runner/test/ui/ActionToolbar.test.tsx` | Does not render when `choiceType` is non-null |
| `packages/runner/test/ui/ActionToolbar.test.tsx` | Does not render when active player is not human |
| `packages/runner/test/ui/ActionToolbar.test.tsx` | Groups actions by `groupName` |
| `packages/runner/test/ui/UndoControl.test.tsx` | Renders undo button when human turn + no choice pending |
| `packages/runner/test/ui/UndoControl.test.tsx` | Clicking undo dispatches `undo()` |
| `packages/runner/test/ui/UndoControl.test.tsx` | Hidden when choice is pending |
| `packages/runner/test/ui/UndoControl.test.tsx` | Hidden when active player is not human |

### Invariants

- Components use **Zustand selectors** — they do NOT subscribe to the entire store.
- No game-specific logic. Action labels come entirely from `RenderAction.displayName`.
- `pointer-events: auto` on all interactive elements.
- No mutations to store state outside of dispatching store actions.
- ActionToolbar does not know about UndoControl, and vice versa. They are independent siblings in the bottom bar.
