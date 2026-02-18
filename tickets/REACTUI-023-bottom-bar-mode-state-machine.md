# REACTUI-023: Bottom Bar Mode State Machine (Single Source of Truth)

**Status**: PENDING
**Spec**: 39 (React DOM UI)
**Priority**: P1
**Depends on**: REACTUI-005, REACTUI-007, REACTUI-014
**Estimated complexity**: M

---

## Summary

Centralize bottom-bar orchestration into one derived mode selector so exactly one mode is rendered at a time (`actions`, `choicePending`, `choiceConfirm`, `aiTurn`).

---

## What Needs to Change

- Add a derived bottom-bar mode helper in runner UI/store-facing logic (single source of truth).
- Stop distributing visibility decisions across `ActionToolbar`, `UndoControl`, and `ChoicePanel`.
- Update `GameContainer` bottom-bar composition to branch on one mode value and render exactly one branch.
- Keep components presentational: pass only required inputs; no duplicated mode computations.
- Include explicit handling for confirm-ready state (`selectedAction !== null`, `partialMove !== null`, `choiceType === null`).

---

## Out of Scope

- Keyboard shortcut logic changes (REACTUI-018).
- Implementation of Mode B/Mode C inputs (REACTUI-008).

---

## Acceptance Criteria

### Tests that should pass

- `packages/runner/test/ui/GameContainer.test.ts`
  - verifies exactly one bottom-bar mode is visible per state.
- `packages/runner/test/ui/ActionToolbar.test.ts`
  - no longer duplicates bottom-bar mode ownership checks beyond component-local rendering behavior.
- `packages/runner/test/ui/UndoControl.test.ts`
  - same as above.
- `packages/runner/test/ui/ChoicePanel.test.ts`
  - confirms bottom-bar mode integration for pending vs confirm-ready states.

### Invariants

- Exactly one bottom-bar mode is rendered at any time.
- Mode selection is computed in one place only.
- No game-specific branching in bottom-bar mode logic.
- Confirm-ready state cannot overlap with actions/undo rendering.

