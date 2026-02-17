# REACTUI-005: ActionToolbar and UndoControl

**Spec**: 39 (React DOM UI Layer) — Deliverables D4, D7
**Priority**: P1
**Depends on**: REACTUI-003
**Estimated complexity**: M
**Status**: ✅ COMPLETED

---

## Summary

Create the `ActionToolbar` (grouped legal actions) and `UndoControl` (undo button), and mount them in the bottom bar during the "human turn + no pending choice" state.

---

## Reassessed Assumptions and Scope Corrections

### Corrected baseline assumptions (repo reality)

- `UIOverlay` currently exists as a **store-agnostic structural shell** with semantic regions and no props.
- `GameContainer` currently renders `<UIOverlay />` directly; adding bottom-bar components requires integration changes.
- Runner UI tests are configured as Node + server-render contract tests with `include: ['test/**/*.test.ts']`; acceptance tests must be `*.test.ts` (not `*.test.tsx`).
- The reliable "choice pending" signal for UI gating is `renderModel.choiceType !== null` (not `choiceStack.length > 0`).

### Scope corrections

- Preserve `UIOverlay` as a structural component by adding a **bottom bar slot prop** (`bottomBarContent`) instead of coupling `UIOverlay` directly to store/state.
- Compose bottom bar controls in `GameContainer` via the slot:
  - `<ActionToolbar store={store} />`
  - `<UndoControl store={store} />`
- Visibility for both controls is derived from `renderModel` only:
  - active player is human
  - `choiceType === null`

### Architectural rationale

- Slot-based composition keeps orchestration centralized while preventing `UIOverlay` from becoming a stateful "god component" as more panel tickets land.
- Using one shared visibility predicate in both controls keeps behavior deterministic with current architecture and avoids hidden coupling to internal store fields.
- This architecture is cleaner and more extensible than directly wiring store dependencies into `UIOverlay` for each new panel.

---

## File List

### New files

| File | Purpose |
|------|---------|
| `packages/runner/src/ui/ActionToolbar.tsx` | Grouped action buttons from `RenderActionGroup[]` |
| `packages/runner/src/ui/ActionToolbar.module.css` | Toolbar layout and button styling |
| `packages/runner/src/ui/UndoControl.tsx` | Undo button |
| `packages/runner/src/ui/UndoControl.module.css` | Undo button styling |
| `packages/runner/test/ui/ActionToolbar.test.ts` | ActionToolbar behavior/contract tests |
| `packages/runner/test/ui/UndoControl.test.ts` | UndoControl behavior/contract tests |

### Modified files

| File | Change |
|------|--------|
| `packages/runner/src/ui/GameContainer.tsx` | Compose bottom bar controls and pass to UIOverlay slot |
| `packages/runner/src/ui/UIOverlay.tsx` | Add `bottomBarContent` slot rendering |
| `packages/runner/test/ui/UIOverlay.test.ts` | Verify bottom bar slot rendering contract |

---

## Detailed Requirements

### ActionToolbar (D4)

- **Store selector**: reads `renderModel.actionGroups`, `renderModel.choiceType`, `renderModel.activePlayerID`, `renderModel.players`.
- **Visibility**: renders `null` unless all are true:
  - `renderModel !== null`
  - active player exists and `isHuman === true`
  - `choiceType === null`
  - at least one action exists across groups
- Renders each `RenderActionGroup` as a labeled group.
- Each `RenderAction` rendered as a `<button>`:
  - `isAvailable === true`: enabled, clickable, dispatches `store.getState().selectAction(actionId)`.
  - `isAvailable === false`: disabled with muted styling and `aria-disabled="true"`.
- Number hint badges (`1`, `2`, ...) appear in visual order; keyboard handling remains REACTUI-018.
- Parent overlay remains non-interactive; all interactive toolbar elements must set `pointer-events: auto`.

### UndoControl (D7)

- **Store selector**: reads `renderModel.choiceType`, `renderModel.activePlayerID`, `renderModel.players`.
- **Visibility**: renders `null` unless active player is human and `choiceType === null`.
- Renders an "Undo" button that dispatches `store.getState().undo()`.
- Interactive root/button must set `pointer-events: auto`.

### Bottom-bar integration

- In `GameContainer`, compose:
  ```tsx
  <UIOverlay
    bottomBarContent={
      <>
        <ActionToolbar store={store} />
        <UndoControl store={store} />
      </>
    }
  />
  ```
- `UIOverlay` remains structural and store-agnostic; it only renders provided bottom bar content.

---

## Out of Scope

- ChoicePanel (REACTUI-007/008)
- AITurnOverlay (REACTUI-014)
- Keyboard shortcuts (REACTUI-018) — buttons show number hints but do not handle keydown
- Animation on action selection (Spec 40)
- Centralized bottom-bar state machine orchestration (future consolidation ticket)

---

## Acceptance Criteria

### Tests that must pass

| Test file | Test |
|-----------|------|
| `packages/runner/test/ui/ActionToolbar.test.ts` | Renders action buttons from `RenderActionGroup` data |
| `packages/runner/test/ui/ActionToolbar.test.ts` | Disabled actions render with `aria-disabled="true"` |
| `packages/runner/test/ui/ActionToolbar.test.ts` | Clicking available action dispatches `selectAction` |
| `packages/runner/test/ui/ActionToolbar.test.ts` | Hidden when `choiceType` is non-null |
| `packages/runner/test/ui/ActionToolbar.test.ts` | Hidden when active player is not human |
| `packages/runner/test/ui/ActionToolbar.test.ts` | Groups actions by `groupName` |
| `packages/runner/test/ui/ActionToolbar.test.ts` | Number hints render in flattened visual order |
| `packages/runner/test/ui/UndoControl.test.ts` | Renders undo button when human turn + no pending choice |
| `packages/runner/test/ui/UndoControl.test.ts` | Clicking undo dispatches `undo()` |
| `packages/runner/test/ui/UndoControl.test.ts` | Hidden when choice is pending |
| `packages/runner/test/ui/UndoControl.test.ts` | Hidden when active player is not human |
| `packages/runner/test/ui/UIOverlay.test.ts` | Renders provided `bottomBarContent` inside bottom region |

### Invariants

- Components use **Zustand selectors** and do not subscribe to the entire store.
- No game-specific logic; action labels come from `RenderAction.displayName`.
- No store mutations outside store action dispatch (`selectAction`, `undo`).
- `UIOverlay` remains a structural shell and does not receive/store-read game state.
- `ActionToolbar` and `UndoControl` remain independent siblings.

---

## Outcome

- **Completion date**: 2026-02-17
- **What changed vs originally planned**:
  - Implemented `ActionToolbar` and `UndoControl` with human-turn/no-choice visibility gating from `renderModel`.
  - Added bottom-bar slot composition to `UIOverlay` and integrated controls from `GameContainer`.
  - Added new UI contract tests for toolbar/undo behavior and updated `UIOverlay` tests for slot rendering.
- **Deviations from original draft ticket**:
  - Kept `UIOverlay` store-agnostic via `bottomBarContent` slot instead of wiring store logic into `UIOverlay`.
  - Corrected acceptance tests to `*.test.ts` (current runner Vitest config) rather than `*.test.tsx`.
  - Corrected pending-choice detection to `renderModel.choiceType` rather than `choiceStack` access.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm turbo test` passed.
  - `pnpm turbo lint` passed.
  - `pnpm turbo typecheck` passed.
