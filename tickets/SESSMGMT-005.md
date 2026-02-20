# SESSMGMT-005: App.tsx Session Router and Navigation Integration (Spec 43 D1 — wiring)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: SESSMGMT-004

## Problem

`App.tsx` currently creates a game bridge and store unconditionally and renders `GameContainer` directly. It needs to route between screens based on the session store's `AppScreen` state, creating/destroying game bridges per-session.

## What to Change

### 1. Refactor `packages/runner/src/App.tsx`

- Import and use the session store from SESSMGMT-004.
- Route based on `sessionStore.sessionState.screen`:
  - `'gameSelection'` -> render `<GameSelectionScreen />` (placeholder div until SESSMGMT-006)
  - `'preGameConfig'` -> render `<PreGameConfigScreen />` (placeholder div until SESSMGMT-007)
  - `'activeGame'` -> render `<GameContainer />` (creates bridge/store on mount, destroys on unmount)
  - `'replay'` -> render `<ReplayScreen />` (placeholder div until SESSMGMT-012)
- Game bridge and game store are created ONLY when entering `activeGame` or `replay` — destroyed when leaving.
- On screen exit: bridge cleanup (terminate worker, reset game store).
- Move the current `useEffect` init logic into the `activeGame` screen entry.

### 2. Modify `packages/runner/src/ui/TerminalOverlay.tsx`

- Add a "Return to Menu" button alongside the existing "New Game" button.
- "Return to Menu" calls `sessionStore.returnToMenu()`.
- "New Game" calls `sessionStore.newGame()` (transitions to `preGameConfig` with the same game).

### 3. Add "Quit" button to game toolbar

- Add a "Quit" button to the game UI (either in `GameContainer.tsx` or `ActionToolbar.tsx`, whichever is architecturally appropriate).
- "Quit" triggers an unsaved-changes confirmation dialog when `sessionStore.unsavedChanges === true`, then calls `sessionStore.returnToMenu()`.

### 4. Create `packages/runner/src/ui/UnsavedChangesDialog.tsx` (new)

- Simple confirmation modal: "You have unsaved progress. Discard and return to menu?"
- "Discard" button -> `sessionStore.returnToMenu()`
- "Cancel" button -> closes dialog

## Files to Touch

- `packages/runner/src/App.tsx` (refactor)
- `packages/runner/src/ui/TerminalOverlay.tsx` (add buttons)
- `packages/runner/src/ui/TerminalOverlay.module.css` (style new buttons if needed)
- `packages/runner/src/ui/GameContainer.tsx` (add Quit button or slot for it)
- `packages/runner/src/ui/UnsavedChangesDialog.tsx` (new)
- `packages/runner/src/ui/UnsavedChangesDialog.module.css` (new)
- `packages/runner/test/ui/TerminalOverlay.test.tsx` (update for new buttons)
- `packages/runner/test/ui/UnsavedChangesDialog.test.tsx` (new)

## Out of Scope

- Session store creation (done in SESSMGMT-004)
- Game selection screen implementation (SESSMGMT-006)
- Pre-game config screen implementation (SESSMGMT-007)
- Save/load dialogs (SESSMGMT-009, 010)
- Replay screen implementation (SESSMGMT-012)
- Event log panel (SESSMGMT-013, 014)

## Acceptance Criteria

### Tests That Must Pass

1. **App routes to game selection**: When session state is `gameSelection`, the game selection placeholder renders.
2. **App routes to active game**: When session state is `activeGame`, `GameContainer` renders and bridge is created.
3. **Bridge cleanup on exit**: When transitioning from `activeGame` to `gameSelection`, the bridge's `terminate()` is called.
4. **Terminal overlay buttons**: "Return to Menu" button exists in terminal overlay and calls `returnToMenu()`.
5. **Terminal overlay buttons**: "New Game" button exists and calls `newGame()`.
6. **Quit button**: A "Quit" button exists in the active game UI.
7. **Unsaved changes dialog**: When `unsavedChanges === true` and Quit is pressed, the dialog appears.
8. **Unsaved changes dialog — Discard**: Clicking "Discard" calls `returnToMenu()`.
9. **Unsaved changes dialog — Cancel**: Clicking "Cancel" closes the dialog without navigating.
10. **Existing runner tests**: `pnpm -F @ludoforge/runner test` passes.

### Invariants

1. Game bridge and game store are NEVER created for `gameSelection` or `preGameConfig` screens.
2. Bridge is always terminated when leaving `activeGame` screen.
3. The unsaved-changes dialog only appears when `unsavedChanges === true`.
4. `TerminalOverlay` still renders correctly for all terminal types (win, draw, score, lossAll).
5. `ErrorBoundary` still wraps the entire app.
