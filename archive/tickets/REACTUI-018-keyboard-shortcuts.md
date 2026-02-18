# REACTUI-018: Keyboard Shortcuts Hook

**Status**: ✅ COMPLETED
**Spec**: 39 (React DOM UI Layer) — Keyboard Shortcuts section
**Priority**: P2
**Depends on**: REACTUI-003, REACTUI-005, REACTUI-007, REACTUI-014, REACTUI-023
**Estimated complexity**: M

---

## Summary

Create a dedicated `useKeyboardShortcuts` hook and mount it in `GameContainer` so keyboard behavior is centralized, deterministic, and aligned with the bottom-bar state machine introduced in REACTUI-023.

---

## Assumptions Reassessment (2026-02-18)

- `GameContainer` currently derives context via `deriveBottomBarState(renderModel)`.
  - The older assumption that `deriveBottomBarState` takes `selectedAction` and `partialMove` is stale.
- `ActionToolbar` currently dispatches `selectAction(actionId)`, not an action object.
  - Number-key shortcuts must map to the Nth flattened action and dispatch its `actionId`.
  - To stay behaviorally consistent with mouse interaction, keyboard selection must skip unavailable actions (`isAvailable === false`).
- AI skip already exists as `resolveAiTurn()` on the store and is wired in `AITurnOverlay`.
  - The shortcut contract should call `resolveAiTurn()` (not an undefined `skip/fast-forward` API).
- There is existing canvas keyboard interaction (`attachKeyboardSelect`) with document-level listeners.
  - The new hook must avoid double-handling when an earlier listener already consumed the event (`event.defaultPrevented === true`).
- No `useKeyboardShortcuts` hook or keyboard-shortcut-specific UI tests currently exist.

These mismatches make parts of the original ticket assumptions stale; scope below is corrected.

---

## File List

### New files

| File | Purpose |
|------|---------|
| `packages/runner/src/ui/useKeyboardShortcuts.ts` | Custom hook for keyboard shortcuts owned by DOM UI orchestration |
| `packages/runner/test/ui/useKeyboardShortcuts.test.ts` | Hook behavior tests across bottom-bar contexts |

### Modified files

| File | Change |
|------|--------|
| `packages/runner/src/ui/GameContainer.tsx` | Mount `useKeyboardShortcuts(store)` in active lifecycle branch |
| `packages/runner/src/input/keyboard-coordinator.ts` | Central keyboard coordinator for shared document listener routing |
| `packages/runner/src/canvas/GameCanvas.tsx` | Register canvas keyboard-select handler through coordinator when available |
| `packages/runner/src/canvas/interactions/keyboard-select.ts` | Expose pure keydown handler for coordinator routing |
| `packages/runner/test/input/keyboard-coordinator.test.ts` | Coordinator behavior tests (priority, pre-handled events, cleanup) |
| `packages/runner/test/canvas/GameCanvas.test.ts` | Coverage for coordinator-based canvas keyboard wiring |

---

## Detailed Requirements

### Hook: `useKeyboardShortcuts(store: GameStore)`

Attach one `keydown` listener on `document`. For each event, read fresh state via `store.getState()` and gate behavior by `deriveBottomBarState(renderModel)`.

| Key | Context | Action |
|-----|---------|--------|
| `Escape` | `choicePending` / `choiceConfirm` / `choiceInvalid` | `cancelMove()` |
| `Backspace` | `choicePending` / `choiceConfirm` / `choiceInvalid` | `cancelChoice()` |
| `Enter` | `choiceConfirm` | `confirmMove()` |
| `1`-`9` | `actions` | Select Nth flattened action and dispatch `selectAction(actionId)` when action exists and is available |
| `Z` | `actions` | `undo()` |
| `Space` (`' '`, `'Spacebar'`) | `aiTurn` | `resolveAiTurn()` |

### Context detection

- Always derive context from `deriveBottomBarState(renderModel)`.
- For number-key mapping, flatten `renderModel.actionGroups[].actions[]` in rendered order (same order as `ActionToolbar`).

### Guard conditions

- Ignore events when `event.defaultPrevented === true`.
- Ignore events from editable/form targets (`input`, `textarea`, `select`, `[contenteditable=true]`) to avoid interfering with choice numeric input and other text entry.
- Number keys: only dispatch when index is in bounds and action `isAvailable === true`.
- Do not call `preventDefault()` when no shortcut action is dispatched.

### GameContainer integration

- Mount `useKeyboardShortcuts(store)` inside `GameContainer` only in active lifecycle rendering (`playing` / `terminal`), not in loading/error branches.

---

## Out of Scope

- Custom keybinding configuration
- Key repeat tuning/debouncing
- Gamepad support
- Accessibility focus-order/tab-navigation changes
- Mobile virtual keyboard behavior

---

## Acceptance Criteria

### Tests that must pass

| Test file | Test |
|-----------|------|
| `packages/runner/test/ui/useKeyboardShortcuts.test.ts` | Escape dispatches `cancelMove()` in choice modes |
| `packages/runner/test/ui/useKeyboardShortcuts.test.ts` | Backspace dispatches `cancelChoice()` in choice modes |
| `packages/runner/test/ui/useKeyboardShortcuts.test.ts` | Enter dispatches `confirmMove()` only in `choiceConfirm` |
| `packages/runner/test/ui/useKeyboardShortcuts.test.ts` | Number keys dispatch `selectAction(actionId)` for in-bounds available actions only |
| `packages/runner/test/ui/useKeyboardShortcuts.test.ts` | Number keys ignore out-of-bounds and unavailable actions |
| `packages/runner/test/ui/useKeyboardShortcuts.test.ts` | Z dispatches `undo()` only in `actions` |
| `packages/runner/test/ui/useKeyboardShortcuts.test.ts` | Space dispatches `resolveAiTurn()` only in `aiTurn` |
| `packages/runner/test/ui/useKeyboardShortcuts.test.ts` | Events are ignored for form/editable targets |
| `packages/runner/test/ui/useKeyboardShortcuts.test.ts` | Events are ignored when `defaultPrevented` is already true |
| `packages/runner/test/ui/useKeyboardShortcuts.test.ts` | Listener is cleaned up on unmount |
| `packages/runner/test/input/keyboard-coordinator.test.ts` | Priority routing uses one handler path and prevents default when handled |
| `packages/runner/test/canvas/GameCanvas.test.ts` | Canvas keyboard-select uses shared coordinator path when provided |

### Invariants

- Keyboard routing is centralized via `KeyboardCoordinator` when mounted through `GameContainer` (single shared document listener for DOM and canvas keyboard handlers).
- Keyboard gating derives mode from `deriveBottomBarState(renderModel)` only (no duplicate mode heuristics).
- Uses `store.getState()` on each keydown to avoid stale closure behavior.
- No game-specific logic; action mapping is data-driven from `actionGroups`.
- `preventDefault()` is applied only when a shortcut is actually handled.

---

## Outcome

- **Completion date**: 2026-02-18
- **What changed**:
  - Added `useKeyboardShortcuts(store, enabled?, keyboardCoordinator?)` with mode gating via `deriveBottomBarState(renderModel)`.
  - Added `KeyboardCoordinator` and wired both DOM shortcut handling and canvas keyboard-select through the same shared keydown pipeline in `GameContainer`.
  - Refactored canvas keyboard-select handling to expose a pure keydown handler usable by coordinator orchestration.
  - Wired keyboard shortcut activation from `GameContainer` using lifecycle/error-aware `enabled` control.
  - Added `packages/runner/test/ui/useKeyboardShortcuts.test.ts` covering all key mappings, mode guards, form/editable target filtering, `defaultPrevented` behavior, and listener cleanup.
  - Added coordinator and canvas integration tests to lock in single-pipeline behavior.
- **Deviation from original plan**:
  - Hook includes an explicit `enabled` parameter so `GameContainer` can keep hook calls unconditional (React hook rules) while still constraining active behavior to playing/terminal lifecycle.
  - `Space` is implemented against existing store API `resolveAiTurn()` (not a separate skip alias), matching current architecture.
  - Implemented an additional architectural hardening step beyond the original ticket: unified keyboard dispatch for canvas + DOM through one coordinator to avoid multi-listener ordering conflicts.
- **Verification**:
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
