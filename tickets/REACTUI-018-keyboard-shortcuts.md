# REACTUI-018: Keyboard Shortcuts Hook

**Spec**: 39 (React DOM UI Layer) — Keyboard Shortcuts section
**Priority**: P2
**Depends on**: REACTUI-003, REACTUI-005, REACTUI-007, REACTUI-014
**Estimated complexity**: M

---

## Summary

Create the `useKeyboardShortcuts` hook and mount it in `GameContainer`. Implements all keyboard shortcuts specified in Spec 39: Escape, Backspace, Enter, 1-9, Z, Space.

---

## File List

### New files

| File | Purpose |
|------|---------|
| `packages/runner/src/ui/useKeyboardShortcuts.ts` | Custom hook for keyboard event handling |

### Modified files

| File | Change |
|------|--------|
| `packages/runner/src/ui/GameContainer.tsx` | Mount `useKeyboardShortcuts(store)` |

---

## Detailed Requirements

### Hook: `useKeyboardShortcuts(store: GameStore)`

Attaches a single `keydown` listener on `document` (or the game container element). Reads store state to determine context and dispatches appropriate actions.

| Key | Context | Action |
|-----|---------|--------|
| `Escape` | Choice pending (`choiceType !== null`) | `cancelMove()` |
| `Backspace` | Choice pending | `cancelChoice()` |
| `Enter` | Choice ready to confirm (move fully constructed) | `confirmMove()` |
| `1`-`9` | Action toolbar visible (human turn, no choice pending) | `selectAction(actionGroups[N-1])` — select the Nth action across all groups |
| `Z` | Human turn, no choice pending | `undo()` |
| `Space` | AI turn (active player is not human) | Skip/fast-forward AI turn |

### Context detection

The hook reads from the store (via `store.getState()` on each keydown — not via subscription, to avoid stale closures):

- `renderModel.choiceType` — whether a choice is pending
- `renderModel.actionGroups` — available actions for number keys
- `renderModel.activePlayerID` + `renderModel.players` — whether it's a human or AI turn
- `selectedAction` + `choicePending` — whether a move is fully constructed

### Guard conditions

- Number keys (1-9): only dispatch if the index is within bounds of available actions.
- Enter: only dispatch if the move is fully constructed and ready to confirm.
- Z: only dispatch if it's the human's turn and no choice is pending.
- Space: only dispatch if it's an AI turn.
- All keys: do nothing if the target element is an `<input>`, `<textarea>`, or `<select>` (avoid interfering with form inputs in ChoicePanel numeric mode).

### GameContainer integration

- Add `useKeyboardShortcuts(store)` call inside `GameContainer`, after the lifecycle check (only active during `playing`/`terminal` states).

---

## Out of Scope

- Custom keybinding configuration
- Key repeat handling (debouncing)
- Gamepad input
- Accessibility keyboard navigation (tab order — that's handled by semantic HTML)
- Mobile virtual keyboard

---

## Acceptance Criteria

### Tests that must pass

| Test file | Test |
|-----------|------|
| `packages/runner/test/ui/useKeyboardShortcuts.test.ts` | Escape dispatches `cancelMove()` when choice is pending |
| `packages/runner/test/ui/useKeyboardShortcuts.test.ts` | Escape does nothing when no choice is pending |
| `packages/runner/test/ui/useKeyboardShortcuts.test.ts` | Backspace dispatches `cancelChoice()` when choice is pending |
| `packages/runner/test/ui/useKeyboardShortcuts.test.ts` | Enter dispatches `confirmMove()` when move is ready |
| `packages/runner/test/ui/useKeyboardShortcuts.test.ts` | Enter does nothing when move is not ready |
| `packages/runner/test/ui/useKeyboardShortcuts.test.ts` | Number keys 1-9 dispatch `selectAction` for the Nth action |
| `packages/runner/test/ui/useKeyboardShortcuts.test.ts` | Number key out of bounds does nothing |
| `packages/runner/test/ui/useKeyboardShortcuts.test.ts` | Z dispatches `undo()` on human turn, no choice pending |
| `packages/runner/test/ui/useKeyboardShortcuts.test.ts` | Z does nothing during AI turn |
| `packages/runner/test/ui/useKeyboardShortcuts.test.ts` | Space triggers skip during AI turn |
| `packages/runner/test/ui/useKeyboardShortcuts.test.ts` | Space does nothing during human turn |
| `packages/runner/test/ui/useKeyboardShortcuts.test.ts` | Keys ignored when focus is on input/textarea/select |
| `packages/runner/test/ui/useKeyboardShortcuts.test.ts` | Listener cleaned up on unmount |

### Invariants

- **Single listener**: one `keydown` handler on `document`, not per-component listeners.
- Uses `store.getState()` on each keydown — NOT stale closure state.
- Does NOT interfere with browser defaults (does not `preventDefault` on keys that have no game action in the current context).
- Does NOT call `preventDefault` on form elements (input, textarea, select).
- Cleanup: removes listener on component unmount.
- No game-specific logic. Action indices are derived from `actionGroups` array.
