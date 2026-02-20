# SESSMGMT-007: Pre-Game Configuration Screen (Spec 43 D4)

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: SESSMGMT-004, SESSMGMT-005, SESSMGMT-006

## Problem

Before starting a game, the user needs to configure player count, seat assignments (human vs AI), and an optional seed. Currently the runner auto-starts with hardcoded seed and player from query params.

## What to Change

### 1. Create `packages/runner/src/ui/PreGameConfigScreen.tsx`

- **Player count slider**: Within the game's `playerMin`-`playerMax` range (from the bootstrap descriptor for the selected `gameId`).
- **Seat assignment table**: For each seat (0..playerCount-1):
  - Label: Uses `VisualConfigProvider.getFactionDisplayName(factionId)` for games with factions, else "Player N".
  - Dropdown: "Human" | "AI - Random" | "AI - Greedy".
- **Optional seed field**: Text input. Empty = random seed (generated from `crypto.getRandomValues`). Non-empty = parsed as BigInt for deterministic game.
- **"Start Game" button**: Calls `sessionStore.startGame(seed, playerConfig)` which transitions to `activeGame`.
- **"Back" button**: Calls `sessionStore.returnToMenu()` to return to `gameSelection`.

### 2. Create `packages/runner/src/ui/PreGameConfigScreen.module.css`

Basic styling for the config form.

### 3. Wire into `App.tsx`

Replace the `preGameConfig` placeholder from SESSMGMT-005 with `<PreGameConfigScreen />`.

## Files to Touch

- `packages/runner/src/ui/PreGameConfigScreen.tsx` (new)
- `packages/runner/src/ui/PreGameConfigScreen.module.css` (new)
- `packages/runner/src/App.tsx` (replace placeholder)
- `packages/runner/test/ui/PreGameConfigScreen.test.tsx` (new)

## Out of Scope

- Session store (done in SESSMGMT-004)
- Session router wiring (done in SESSMGMT-005)
- Game selection screen (done in SESSMGMT-006)
- Bridge creation on `activeGame` entry (handled in SESSMGMT-005's App.tsx refactor)
- Save/load (SESSMGMT-008, 009, 010)
- Replay (SESSMGMT-011, 012)
- Event log (SESSMGMT-013, 014)

## Acceptance Criteria

### Tests That Must Pass

1. **Player count slider**: Renders a slider with `min=playerMin` and `max=playerMax` from the bootstrap descriptor.
2. **Seat assignment table**: Renders one row per seat with a label and a dropdown.
3. **Faction display names**: When `VisualConfigProvider` has faction display names, they appear as seat labels.
4. **Default seat labels**: When no faction display names exist, seats are labeled "Player 0", "Player 1", etc.
5. **Dropdown options**: Each seat dropdown has "Human", "AI - Random", "AI - Greedy" options.
6. **Empty seed = random**: When seed field is empty, clicking "Start Game" generates a random BigInt seed.
7. **Provided seed = deterministic**: When seed field is "12345", clicking "Start Game" uses `12345n` as seed.
8. **Start Game transition**: Clicking "Start Game" calls `sessionStore.startGame(seed, playerConfig)`.
9. **Back button**: Clicking "Back" calls `sessionStore.returnToMenu()`.
10. **Existing runner tests**: `pnpm -F @ludoforge/runner test` passes.

### Invariants

1. Player count is always within `[playerMin, playerMax]` — slider enforces bounds.
2. At least one seat must be assigned "Human" (or the game cannot be played interactively — optionally enforced).
3. Seed field accepts any valid BigInt string — invalid input is rejected with a validation message.
4. `PlayerSeatConfig[]` produced by the screen matches the type from `session-types.ts`.
5. The screen reads game metadata from `listBootstrapDescriptors()` — no hardcoded game-specific logic.
