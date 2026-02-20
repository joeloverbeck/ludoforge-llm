# SESSMGMT-006: Game Selection Screen (Spec 43 D3)

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: SESSMGMT-003, SESSMGMT-005

## Problem

The runner currently has session routing (`gameSelection`/`preGameConfig`/`activeGame`/`replay`) and data-driven bootstrap discovery in place, but `gameSelection` is still rendered by a placeholder screen with only game-id buttons. The app needs a real landing page that is metadata-driven and structurally ready for saved games.

## Reassessed Assumptions (Code/Test Reality Check)

1. `App.tsx` does not always load from query parameters anymore. It already routes by `sessionStore.sessionState.screen`.
2. `session-store.ts` already implements `selectGame`, `returnToMenu`, `startReplay`, dirty tracking, and move accumulation.
3. Bootstrap discovery is already data-driven (`import.meta.glob`) in `bootstrap-registry.ts` (Spec 43 D2).
4. Current UI for session screens is intentionally placeholder-only:
   - `packages/runner/src/ui/screens/GameSelectionPlaceholder.tsx`
   - `packages/runner/src/ui/screens/PreGameConfigPlaceholder.tsx`
   - `packages/runner/src/ui/screens/ReplayPlaceholder.tsx`
5. Existing tests validate placeholder behavior (`packages/runner/test/ui/session-placeholders.test.tsx`) and App routing with placeholder test IDs.
6. Save/load manager from SESSMGMT-009 is not implemented yet; this ticket must not block on persistence.

## What to Change

### 1. Create `packages/runner/src/ui/GameSelectionScreen.tsx`

- Replace placeholder behavior with a real screen component.
- Lists games from `listBootstrapDescriptors()`, filtering out the `'default'` entry.
- Displays per game card: `name`, `description`, player range (`players.min`-`players.max`) from compiled `GameDef.metadata`.
- Click game card -> callback to `sessionStore.selectGame(gameId)` (navigation remains owned by App/session store).
- Saved games section:
  - Structure and UI are required now.
  - Integration with real persistence is deferred to SESSMGMT-009/010.
  - For this ticket, it is valid to render an empty-state message (`No saved games`) while loading from a save-manager boundary that safely returns an empty list.
- Per saved game row UI should include display name, game name, timestamp, and move count fields so later wiring does not require component redesign.
- Actions for resume/replay/delete may be rendered disabled or no-op placeholders until SESSMGMT-010/012, but the section shape must exist.

### 2. Create `packages/runner/src/ui/GameSelectionScreen.module.css`

Basic styling for game cards, saved games list, and layout.

### 3. Wire into `App.tsx`

Replace `GameSelectionPlaceholder` usage in the `gameSelection` route with `<GameSelectionScreen />`.

### 4. Replace Placeholder-Coupled Tests

- Add `packages/runner/test/ui/GameSelectionScreen.test.tsx` for the new component behavior.
- Update `packages/runner/test/ui/App.test.ts` expectations from placeholder test IDs to the new screen's test IDs/content.
- Remove or rewrite obsolete placeholder-only coverage in `packages/runner/test/ui/session-placeholders.test.tsx` so tests reflect current architecture.

## Files to Touch

- `packages/runner/src/ui/GameSelectionScreen.tsx` (new)
- `packages/runner/src/ui/GameSelectionScreen.module.css` (new)
- `packages/runner/src/App.tsx` (replace placeholder)
- `packages/runner/test/ui/GameSelectionScreen.test.tsx` (new)
- `packages/runner/test/ui/App.test.ts` (update existing routing assertions)
- `packages/runner/test/ui/session-placeholders.test.tsx` (remove/replace obsolete placeholder assertions)

## Out of Scope

- Bootstrap manifest changes (done in SESSMGMT-003)
- Session store (done in SESSMGMT-004)
- App routing (done in SESSMGMT-005)
- Pre-game config screen (SESSMGMT-007)
- Save/load persistence layer (SESSMGMT-009)
- Replay controller (SESSMGMT-011, 012)
- Event log panel (SESSMGMT-013, 014)
- Sophisticated styling or animations (keep it functional)
- Reworking the existing session state machine or active-game runtime architecture

## Acceptance Criteria

### Tests That Must Pass

1. **Renders game list**: Component renders a card for each non-default bootstrap descriptor with `name`, `description`, and player range.
2. **Filters default**: The `default` bootstrap entry does not appear in the game list.
3. **Game card click**: Clicking a game card invokes the selection callback with `gameId` (App wires this to `sessionStore.selectGame(gameId)`).
4. **Saved games section**: Component has a section for saved games that renders "No saved games" when the list is empty/unavailable.
5. **Existing runner tests**: `pnpm -F @ludoforge/runner test` passes.

### Invariants

1. Game list data comes from `listBootstrapDescriptors()` — no hardcoded game names.
2. Metadata displayed on game cards comes from compiled `GameDef.metadata` associated with bootstrap descriptors — no duplicated display metadata constants.
3. Saved games section is structurally ready for save data but does not crash when save manager APIs return empty/unavailable results.
4. Component does not call IndexedDB directly; persistence access stays behind save-manager APIs.
5. CSS module scoping prevents style leaks.

## Architectural Rationale

- This ticket should replace the temporary placeholder layer, not re-architect session routing again.
- Game-selection UI should consume canonical compiled metadata rather than adding new duplicated metadata sources.
- Keeping saved-games interactions behind a save-manager boundary now preserves clean layering and allows SESSMGMT-009/010 to plug in without reshaping the screen/component contract.

## Outcome

- **Completion date**: 2026-02-20
- **What actually changed**:
  - Added `packages/runner/src/ui/GameSelectionScreen.tsx` and `packages/runner/src/ui/GameSelectionScreen.module.css`.
  - Wired `App.tsx` to render `GameSelectionScreen` for the `gameSelection` route.
  - Extended bootstrap descriptors with canonical `gameMetadata` derived from fixture `GameDef.metadata` so the screen does not duplicate display constants.
  - Added a persistence boundary stub at `packages/runner/src/persistence/save-manager.ts` with `listSavedGames()` returning an empty list for now.
  - Removed obsolete `GameSelectionPlaceholder` and replaced placeholder-coupled coverage with real screen tests.
- **Deviations from original plan**:
  - Resume/replay/delete saved-game actions are rendered as disabled placeholders pending SESSMGMT-009/010/012 integration.
  - No IndexedDB wiring was added in this ticket to keep scope aligned with D3 and existing ticket decomposition.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
3. Component is a pure presentational React component — no direct IndexedDB calls (those go through the save manager).
4. CSS module scoping prevents style leaks.
