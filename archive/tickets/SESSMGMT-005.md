# SESSMGMT-005: App.tsx Session Router and Navigation Integration (Spec 43 D1 — wiring)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: SESSMGMT-004

## Problem

`App.tsx` currently creates a game bridge and store unconditionally and renders `GameContainer` directly. It needs to route between screens based on the session store's `AppScreen` state, creating/destroying game bridges per-session.

## Assumption Reassessment (2026-02-20)

The original ticket assumptions were partially stale versus the current codebase:

1. Session primitives are already implemented.
   - `packages/runner/src/session/session-types.ts` and `packages/runner/src/session/session-store.ts` already exist.
   - `packages/runner/test/session/session-store.test.ts` already covers core state-machine transitions.
2. Bootstrap discovery work from Spec 43 D2 is already implemented.
   - `packages/runner/src/bootstrap/bootstrap-registry.ts` already uses `import.meta.glob` for visual configs.
3. UI file paths in this ticket were outdated.
   - `TerminalOverlay` is at `packages/runner/src/ui/TerminalOverlay.tsx` (not `ui/overlays/...`).
   - There is no `packages/runner/src/ui/Toolbar.tsx`; adding Quit must be done in existing active-game UI composition.
4. Seed typing in active session state currently uses `number` (not `bigint`) in session store/types and game-store APIs.
   - D1 wiring in this ticket should remain consistent with current runner APIs.
5. Replay screen implementation is not present yet (SESSMGMT-012).
   - D1 should route to a replay placeholder and preserve clean lifecycle boundaries without implementing replay runtime behavior here.

## Updated Scope (D1 Wiring Only)

This ticket now focuses on integrating existing D1 primitives into app/runtime wiring and UI navigation:

1. Refactor `App.tsx` into an app-level session router using the existing session store.
2. Instantiate game bridge + game store only while `sessionState.screen === 'activeGame'`.
3. Ensure bridge termination and active-game runtime teardown on screen exit/unmount.
4. Wire terminal navigation actions:
   - `Return to Menu` -> `sessionStore.returnToMenu()`
   - `New Game` -> `sessionStore.newGame()`
5. Add active-game Quit flow with unsaved-changes confirmation:
   - Quit control in active-game UI
   - new `UnsavedChangesDialog` component
6. Keep `gameSelection`, `preGameConfig`, and `replay` as placeholders in this ticket (full screens remain in SESSMGMT-006/007/012).

## What to Change

### 1. Refactor `packages/runner/src/App.tsx`

- Import and use the existing session store from `packages/runner/src/session/session-store.ts`.
- Route based on `sessionStore.sessionState.screen`:
  - `'gameSelection'` -> render `<GameSelectionScreen />` (placeholder div until SESSMGMT-006)
  - `'preGameConfig'` -> render `<PreGameConfigScreen />` (placeholder div until SESSMGMT-007)
  - `'activeGame'` -> render `<GameContainer />` (creates bridge/store on entry, destroys on exit/unmount)
  - `'replay'` -> render `<ReplayScreen />` (placeholder div until SESSMGMT-012)
- Game bridge and game store are created ONLY when entering `activeGame` in this ticket.
- On screen exit: bridge cleanup (terminate worker, reset game store).
- Move the current `useEffect` init logic into the `activeGame` screen entry.

### 2. Modify `packages/runner/src/ui/TerminalOverlay.tsx`

- Add a "Return to Menu" button alongside the existing "New Game" button.
- "Return to Menu" calls `sessionStore.returnToMenu()`.
- "New Game" calls `sessionStore.newGame()` (transitions to `preGameConfig` with the same game).

### 3. Add "Quit" button to game toolbar

- Add a "Quit" button in active-game UI composition (`GameContainer.tsx` surface is acceptable because no standalone toolbar component currently exists).
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
- `packages/runner/test/ui/App.test.ts` (update for router/lifecycle expectations)
- `packages/runner/test/ui/TerminalOverlay.test.tsx` (update for new buttons)
- `packages/runner/test/ui/UnsavedChangesDialog.test.tsx` (new)

## Out of Scope

- Session store creation/type definitions (already implemented)
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

## Architecture Notes

- Prefer a strict app-level boundary: session router owns navigation and active runtime lifecycle; `GameContainer` remains focused on rendering/interactions for an already-initialized game store.
- Avoid alias/back-compat shims in D1. If an old flow (e.g., full-page reload for "New Game") is replaced by session actions, remove the old behavior.
- Keep D1 generic: no game-specific routing branches or hardcoded IDs in runtime wiring.

## Outcome

- **Completion date**: 2026-02-20
- **Implemented**:
  - `App.tsx` now uses the existing session store as an app-level router.
  - Active game runtime (bridge + game store) is created only on `activeGame` entry and terminated on exit.
  - Placeholder screens wired for `gameSelection`, `preGameConfig`, and `replay`.
  - Terminal overlay now provides `Return to Menu` and `New Game` session actions (removed page-reload fallback).
  - Active-game Quit control added via `GameContainer`, with unsaved-changes confirmation dialog (`UnsavedChangesDialog`).
  - Test suite updated/expanded for routing lifecycle, terminal buttons, and dialog behavior.
- **Deviations from original plan**:
  - Replay runtime bridge/store creation was not implemented in D1; replay remains a placeholder (kept aligned with SESSMGMT-012 scope).
  - Existing `session` primitives were reused instead of creating new ones, since they already existed in the codebase.
- **Verification**:
  - `pnpm -F @ludoforge/runner test -- App TerminalOverlay UnsavedChangesDialog GameContainer` (passed; Vitest executed full runner test suite)
  - `pnpm -F @ludoforge/runner lint` (passed)
