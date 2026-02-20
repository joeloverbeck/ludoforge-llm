# SESSMGMT-010: Save/Load UI Dialogs (Spec 43 D5 — UI layer)

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: SESSMGMT-009

## Problem

The persistence layer (SESSMGMT-009) provides CRUD operations and `GameSelectionScreen` already renders saved-game summary rows, but resume/replay/delete are currently inert and there is no in-game save/load UI.

## Assumption Reassessment (2026-02-20)

1. Session routing, unsaved-changes handling, and move accumulation are already implemented (`App.tsx`, `session-store`, `useActiveGameRuntime`).
2. `SESSMGMT-009` now persists `seed` as `number` (non-negative safe integer), and `listSavedGames()` returns summary rows (not full `SavedGameRecord` payloads).
3. `GameSelectionScreen` already renders saved-games rows but action buttons are currently disabled placeholders.
4. Replay route state exists and `App.tsx` already routes to replay, but UI is currently a placeholder (`ReplayPlaceholder`).
5. Resume reconstruction should be implemented in the runtime/store path (`useActiveGameRuntime` + game store initialization), not ad-hoc in `App.tsx`.
6. References in older ticket text to SESSMGMT-005/006/008 are stale relative to current codebase and should not drive this ticket.

## What to Change

### 1. Create `packages/runner/src/ui/SaveGameDialog.tsx`

Modal dialog:
- Text input for save name (required, non-empty after trim).
- Save button persists `SavedGameRecord` via `saveGame()` using current active session data:
  - `gameId`, `seed`, `playerConfig` from session state
  - `moveHistory` from `sessionStore.moveAccumulator`
  - `gameName` from bootstrap descriptor metadata
  - `playerId` from active game store current player
  - `isTerminal` from active game lifecycle/terminal state
- On success: call `sessionStore.markSaved()` and close dialog.
- Cancel closes without writing.
- Show saving state while request is in-flight.

### 2. Create `packages/runner/src/ui/SaveGameDialog.module.css`

### 3. Create `packages/runner/src/ui/LoadGameDialog.tsx`

Modal dialog listing saves (current game filter optional):
- Per save: display name, timestamp, move count, and terminal status.
- Resume button:
  - `loadGame(id)` to fetch full record.
  - If non-terminal: hand off to shared resume flow.
  - If terminal: disabled.
- Replay button:
  - `loadGame(id)` and hand off to shared replay flow.
- Delete button:
  - confirmation required before `deleteSavedGame(id)`.
  - refresh list after deletion.

### 4. Create `packages/runner/src/ui/LoadGameDialog.module.css`

### 5. Add Save/Load triggers to active game UI

- Add Save and Load buttons to `GameContainer` top controls (next to Quit).
- Wire to open/close `SaveGameDialog` and `LoadGameDialog`.

### 6. Wire saved-game actions in `GameSelectionScreen`

- Keep existing saved-games section.
- Enable Resume/Replay/Delete buttons.
- Use shared App/session callbacks for resume/replay/delete routing instead of screen-specific transition logic.

### 7. Resume flow implementation (runtime/store)

For non-terminal resume:
1. Load full `SavedGameRecord` via `loadGame(id)`.
2. Transition session to `activeGame` with loaded `seed` + `playerConfig` + `moveHistory` bootstrap payload.
3. On active runtime initialization, reconstruct state with `bridge.init(gameDef, seed)` + `bridge.playSequence(moveHistory)`.
4. Pre-populate `sessionStore.moveAccumulator` with loaded `moveHistory` and `unsavedChanges = false`.
5. Continue play from reconstructed state.

For terminal save:
- Resume remains disabled; replay is available and routes to replay state with saved seed + move history.

## Files to Touch

- `packages/runner/src/ui/SaveGameDialog.tsx` (new)
- `packages/runner/src/ui/SaveGameDialog.module.css` (new)
- `packages/runner/src/ui/LoadGameDialog.tsx` (new)
- `packages/runner/src/ui/LoadGameDialog.module.css` (new)
- `packages/runner/src/ui/GameContainer.tsx` (Save/Load triggers)
- `packages/runner/src/App.tsx` (dialog integration + shared resume/replay wiring)
- `packages/runner/src/ui/GameSelectionScreen.tsx` (enable saved-game action wiring)
- `packages/runner/src/session/session-types.ts` (active-game resume bootstrap payload)
- `packages/runner/src/session/session-store.ts` (resume transition + accumulator preload)
- `packages/runner/src/session/active-game-runtime.ts` (resume reconstruction via `playSequence`)
- `packages/runner/src/store/game-store.ts` (runtime bootstrap helper for move-history reconstruction)
- `packages/runner/test/ui/SaveGameDialog.test.tsx` (new)
- `packages/runner/test/ui/LoadGameDialog.test.tsx` (new)
- `packages/runner/test/ui/GameSelectionScreen.test.tsx` (update)
- `packages/runner/test/session/session-store.test.ts` (update)
- `packages/runner/test/session/active-game-runtime.test.tsx` (update)
- `packages/runner/test/ui/App.test.ts` (update)

## Out of Scope

- Dexie database schema and CRUD internals (SESSMGMT-009)
- Replay controller/scrubber implementation (SESSMGMT-011, SESSMGMT-012)
- Event log implementation (SESSMGMT-013, SESSMGMT-014)
- Cloud save, file export, user accounts

## Acceptance Criteria

### Tests That Must Pass

1. Save dialog renders with name input and Save/Cancel buttons.
2. Save dialog blocks empty names and allows non-empty names.
3. Successful save writes via save manager and clears `unsavedChanges`.
4. Load dialog lists saves with timestamp/move count/terminal badge.
5. Resume reconstructs non-terminal saves via `init + playSequence` path.
6. After resume, `sessionStore.moveAccumulator` starts with loaded `moveHistory`.
7. Terminal saves do not allow resume and provide replay action.
8. Delete requires confirmation and removes the row.
9. `GameSelectionScreen` saved-game actions are wired (not disabled placeholders).
10. Existing runner tests pass: `pnpm -F @ludoforge/runner test`.

### Invariants

1. Save dialog never writes with an empty/whitespace-only name.
2. Resume reconstruction uses `bridge.playSequence()` (no manual action-loop replay in UI components).
3. `seed`, `moveHistory`, and `playerConfig` roundtrip unchanged through save/load.
4. Delete confirmation is required before destructive persistence action.
5. Persistence operations go only through save manager APIs (no direct Dexie calls from UI/session code).

## Outcome

- **Completion date**: 2026-02-20
- **What changed**:
  - Added `SaveGameDialog` and `LoadGameDialog` UI components with dedicated styles.
  - Added Save/Load controls to active-game top controls in `GameContainer`.
  - Wired saved-game Resume/Replay/Delete actions in `GameSelectionScreen` (removed disabled placeholders).
  - Added a dedicated resume transition in `session-store` (`resumeGame`) that preloads `moveAccumulator` from saved move history.
  - Extended active-game session state with `initialMoveHistory` bootstrap payload.
  - Updated runtime bootstrapping to reconstruct resumed games through `bridge.init + bridge.playSequence` via new `game-store` action `initGameFromHistory`.
  - Allowed `startReplay` transitions from active game in addition to game selection to support in-game load flows.
  - Added/updated runner tests for dialogs and resume wiring.
- **Deviations vs original plan**:
  - Resume reconstruction was implemented in runtime/store (`useActiveGameRuntime` + `game-store`) instead of `App.tsx` orchestration to keep bootstrap logic centralized and reusable.
  - `GameSelectionScreen` uses shared App-level save-record routing callbacks; full load/delete persistence logic remains encapsulated in dialog/save-manager layers.
- **Verification**:
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
