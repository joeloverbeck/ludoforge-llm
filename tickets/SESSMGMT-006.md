# SESSMGMT-006: Game Selection Screen (Spec 43 D3)

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: SESSMGMT-003, SESSMGMT-005

## Problem

The runner needs a landing page that lists available games and saved games. Currently there is no game selection UI — the app always loads a game from query parameters.

## What to Change

### 1. Create `packages/runner/src/ui/GameSelectionScreen.tsx`

- Lists games from `listBootstrapDescriptors()`, filtering out the `'default'` entry.
- Displays per game card: `name`, `description`, player range (`playerMin`-`playerMax`).
- Click a game card -> `sessionStore.selectGame(gameId)` -> navigates to `preGameConfig`.
- Saved games section: queries `listSavedGames()` from the save manager (SESSMGMT-009). Until SESSMGMT-009 is implemented, this section should be empty or show a "No saved games" message (i.e., the component should be structurally ready for save data but tolerate an empty list).
- Per saved game: display name, game name, timestamp, move count.
- Click a saved game -> "Resume" or "Replay" options (wiring to actual resume/replay in SESSMGMT-010/012).
- Delete saved game button with confirmation dialog.

### 2. Create `packages/runner/src/ui/GameSelectionScreen.module.css`

Basic styling for game cards, saved games list, and layout.

### 3. Wire into `App.tsx`

Replace the `gameSelection` placeholder from SESSMGMT-005 with `<GameSelectionScreen />`.

## Files to Touch

- `packages/runner/src/ui/GameSelectionScreen.tsx` (new)
- `packages/runner/src/ui/GameSelectionScreen.module.css` (new)
- `packages/runner/src/App.tsx` (replace placeholder)
- `packages/runner/test/ui/GameSelectionScreen.test.tsx` (new)

## Out of Scope

- Bootstrap manifest changes (done in SESSMGMT-003)
- Session store (done in SESSMGMT-004)
- App routing (done in SESSMGMT-005)
- Pre-game config screen (SESSMGMT-007)
- Save/load persistence layer (SESSMGMT-009)
- Replay controller (SESSMGMT-011, 012)
- Event log panel (SESSMGMT-013, 014)
- Sophisticated styling or animations (keep it functional)

## Acceptance Criteria

### Tests That Must Pass

1. **Renders game list**: Component renders a card for each non-default bootstrap descriptor with `name`, `description`, and player range.
2. **Filters default**: The `default` bootstrap entry does not appear in the game list.
3. **Game card click**: Clicking a game card calls `sessionStore.selectGame(gameId)`.
4. **Saved games section**: Component has a section for saved games that renders "No saved games" when the list is empty.
5. **Existing runner tests**: `pnpm -F @ludoforge/runner test` passes.

### Invariants

1. Game list data comes from `listBootstrapDescriptors()` — no hardcoded game names.
2. Saved games section is structurally ready for save data but does not crash when no save manager is available.
3. Component is a pure presentational React component — no direct IndexedDB calls (those go through the save manager).
4. CSS module scoping prevents style leaks.
