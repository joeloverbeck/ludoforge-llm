# REACTUI-023: Bottom Bar Mode State Machine (Single Source of Truth)

**Status**: ✅ COMPLETED
**Spec**: 39 (React DOM UI)
**Priority**: P1
**Depends on**: REACTUI-005, REACTUI-007, REACTUI-014
**Estimated complexity**: M

---

## Summary

Centralize bottom-bar orchestration into one derived mode selector so exactly one mode branch is owned by `GameContainer` at a time (`actions`, `choicePending`, `choiceConfirm`, `aiTurn`).

---

## Assumptions Reassessment (2026-02-18)

- `GameContainer` currently mounts `ChoicePanel`, `ActionToolbar`, and `UndoControl` simultaneously in the bottom bar and delegates visibility to each component.
- Mode ownership is currently duplicated in multiple places:
  - `ActionToolbar` and `UndoControl` each infer visibility from `renderModel.choiceType`, active-player humanity, and `selectedAction`.
  - `ChoicePanel` infers visibility independently from `choiceType`, `selectedAction`, and `partialMove`.
- `packages/runner/test/ui/GameContainer.test.ts` currently validates lifecycle gating, but does **not** validate bottom-bar mode exclusivity.
- `AITurnOverlay` is not implemented yet in `packages/runner/src/ui/` (REACTUI-014 is pending), so `aiTurn` handling in this ticket must remain architecture-ready without requiring that overlay implementation.

These mismatches make the original ticket assumptions partially stale; scope below is corrected to match current code.

---

## What Needs to Change

- Add a derived bottom-bar mode helper in runner UI/store-facing logic (single source of truth).
- Update `GameContainer` bottom-bar composition to branch on one derived mode value and render exactly one branch.
- Keep `ActionToolbar`, `UndoControl`, and `ChoicePanel` presentational:
  - no ownership of cross-component bottom-bar orchestration.
  - only component-local guards for structurally required props/data.
- Include explicit confirm-ready handling (`selectedAction !== null`, `partialMove !== null`, `choiceType === null`) as a distinct mode from choice-pending.
- Include explicit `aiTurn` mode derivation now, but defer visual overlay implementation to REACTUI-014 (this ticket must not block on that component).

---

## Out of Scope

- Keyboard shortcut logic changes (REACTUI-018).
- Implementation of Mode B/Mode C inputs (REACTUI-008).

---

## Acceptance Criteria

### Tests that should pass

- `packages/runner/test/ui/GameContainer.test.ts`
  - verifies bottom-bar branch exclusivity across representative mode states.
- `packages/runner/test/ui/ActionToolbar.test.ts`
  - validates component-local rendering behavior only (no global mode ownership assertions).
- `packages/runner/test/ui/UndoControl.test.ts`
  - validates component-local rendering behavior only (no global mode ownership assertions).
- `packages/runner/test/ui/ChoicePanel.test.ts`
  - confirms pending vs confirm-ready rendering behavior and integration with container-owned mode selection.

### Invariants

- Exactly one bottom-bar mode is rendered at any time.
- Mode selection is computed in one place only.
- No game-specific branching in bottom-bar mode logic.
- Confirm-ready state cannot overlap with actions/undo rendering.
- `aiTurn` mode is explicitly representable even before REACTUI-014 UI is wired.

---

## Outcome

- **Completion date**: 2026-02-18
- **What changed**:
  - Added `deriveBottomBarMode()` (`hidden | actions | choicePending | choiceConfirm | aiTurn`) as the single mode selector.
  - Updated `GameContainer` to own bottom-bar branching and render exactly one branch.
  - Simplified `ActionToolbar`, `UndoControl`, and `ChoicePanel` to component-local/presentational behavior (no distributed orchestration ownership).
  - Added dedicated bottom-bar mode unit coverage and strengthened container/component tests for exclusivity and confirm-ready behavior.
- **Deviation from original plan**:
  - `aiTurn` remains a derived mode with no visual overlay branch yet because REACTUI-014 (`AITurnOverlay`) is still pending; this ticket intentionally stays architecture-ready without introducing placeholder overlay UI.
- **Verification**:
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
