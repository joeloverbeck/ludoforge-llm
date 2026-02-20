# SESSMGMT-010: Save/Load UI Dialogs (Spec 43 D5 — UI layer)

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: SESSMGMT-005, SESSMGMT-008, SESSMGMT-009

## Problem

The persistence layer (SESSMGMT-009) provides CRUD operations, and the bridge wiring (SESSMGMT-008) accumulates moves. Now the user needs UI to save and load games.

## What to Change

### 1. Create `packages/runner/src/ui/SaveGameDialog.tsx`

Modal dialog:
- Text input for save name (required, non-empty).
- "Save" button: collects current `gameId`, `seed`, `moveAccumulator`, `playerConfig` from the session store, game name from bootstrap descriptor, `isTerminal` from game store. Calls `saveGame()`. On success, calls `sessionStore.markSaved()` and closes dialog.
- "Cancel" button: closes dialog without saving.
- Show loading state while saving.

### 2. Create `packages/runner/src/ui/SaveGameDialog.module.css`

### 3. Create `packages/runner/src/ui/LoadGameDialog.tsx`

Modal dialog listing saved games:
- Per save: display name, timestamp (formatted), move count, terminal status badge.
- "Resume" button: calls `loadGame(id)`, reconstructs game via bridge (`init + playSequence`), navigates to `activeGame`. If `isTerminal`, disable Resume and show "Replay" only.
- "Replay" button: navigates to `replay` with the save's seed + moveHistory via `sessionStore.startReplay()`.
- "Delete" button with confirmation.

### 4. Create `packages/runner/src/ui/LoadGameDialog.module.css`

### 5. Add Save/Load triggers to game UI

- Add a "Save" button to the game toolbar/UI that opens `SaveGameDialog`.
- Add a "Load" button to the game toolbar/UI that opens `LoadGameDialog`.
- Or alternatively: Add "Save" to the terminal overlay (save completed game).
- The Game Selection Screen (SESSMGMT-006) saved games section should also use `LoadGameDialog`'s resume/replay logic. Update the wiring if needed.

### 6. Resume flow implementation

When resuming from a save:
1. `loadGame(id)` retrieves the `SavedGameRecord`.
2. Call `sessionStore.startGame(BigInt(record.seed), record.playerConfig)` to transition to `activeGame`.
3. On `activeGame` mount, instead of normal init, use `bridge.init(gameDef, seed)` + `bridge.playSequence(moveHistory)` to reconstruct state.
4. Pre-populate `sessionStore.moveAccumulator` with the loaded `moveHistory`.
5. If `isTerminal === false`, human can continue playing.
6. If `isTerminal === true`, redirect to replay instead.

## Files to Touch

- `packages/runner/src/ui/SaveGameDialog.tsx` (new)
- `packages/runner/src/ui/SaveGameDialog.module.css` (new)
- `packages/runner/src/ui/LoadGameDialog.tsx` (new)
- `packages/runner/src/ui/LoadGameDialog.module.css` (new)
- `packages/runner/src/ui/GameContainer.tsx` or toolbar (add Save/Load buttons)
- `packages/runner/src/ui/TerminalOverlay.tsx` (optionally add "Save" button)
- `packages/runner/src/App.tsx` (resume flow: detect loaded game, use playSequence)
- `packages/runner/src/ui/GameSelectionScreen.tsx` (wire saved games resume/replay)
- `packages/runner/test/ui/SaveGameDialog.test.tsx` (new)
- `packages/runner/test/ui/LoadGameDialog.test.tsx` (new)

## Out of Scope

- Dexie database schema (done in SESSMGMT-009)
- Save manager CRUD (done in SESSMGMT-009)
- Move accumulation wiring (done in SESSMGMT-008)
- Session store (done in SESSMGMT-004)
- Replay controller (SESSMGMT-011, 012)
- Event log (SESSMGMT-013, 014)
- Cloud save, file export, user accounts

## Acceptance Criteria

### Tests That Must Pass

1. **Save dialog renders**: Save dialog shows a name input and Save/Cancel buttons.
2. **Save dialog validation**: Empty name shows validation error; non-empty name enables Save.
3. **Save persists**: After saving, `listSavedGames()` includes the new save with correct data.
4. **Save marks clean**: After successful save, `sessionStore.unsavedChanges === false`.
5. **Load dialog lists saves**: Load dialog shows all saved games with display name, timestamp, and move count.
6. **Resume flow**: Clicking "Resume" on a non-terminal save reconstructs game state and enters `activeGame`.
7. **Resume pre-populates accumulator**: After resume, `sessionStore.moveAccumulator` contains the loaded moveHistory.
8. **Terminal save shows Replay only**: For a terminal save, "Resume" is disabled and "Replay" is available.
9. **Delete with confirmation**: Deleting a save requires confirmation and removes it from the list.
10. **Existing runner tests**: `pnpm -F @ludoforge/runner test` passes.

### Invariants

1. Save dialog never saves with an empty name.
2. Resume flow uses `bridge.playSequence()` — it does not manually loop `applyMove()`.
3. Saved game data roundtrips correctly: seed, moveHistory, playerConfig all match after load.
4. Delete confirmation prevents accidental data loss.
5. No direct IndexedDB calls — all persistence goes through the save manager.
