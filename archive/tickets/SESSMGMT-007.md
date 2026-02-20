# SESSMGMT-007: Pre-Game Configuration Screen (Spec 43 D4)

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: SESSMGMT-004, SESSMGMT-005, SESSMGMT-006

## Reassessed Baseline (Code + Tests)

The repository no longer matches this ticket's original assumptions in a few important ways:

1. Session routing is already active in `App.tsx` with `gameSelection -> preGameConfig -> activeGame -> replay`; `preGameConfig` currently renders `PreGameConfigPlaceholder`.
2. Session/store seed type is `number` (safe integer), not `bigint`:
   - `packages/runner/src/session/session-types.ts`
   - `packages/runner/src/session/session-store.ts`
   - `packages/runner/src/session/active-game-runtime.ts`
   - bridge/game store init paths
3. Existing tests already cover placeholder behavior (`packages/runner/test/ui/session-placeholders.test.tsx`) and app routing (`packages/runner/test/ui/App.test.ts`).
4. `VisualConfigProvider.getFactionDisplayName(factionId)` exists and is the right display-name source, but current bootstrap descriptor summaries do not expose faction ids for the pre-game screen.

## Scope Correction

This ticket now explicitly includes replacing the placeholder and adding descriptor-level faction-id summary support so pre-game seat labels stay data-driven without loading full game definitions in the pre-game screen.

### Why this scope update is architecturally better

- It keeps pre-game UI decoupled from full `GameDef` loading.
- It avoids duplicate game-def parsing before `activeGame` initialization.
- It remains engine-agnostic and data-driven: labels come from game data (`factions` + visual config), not hardcoded per game.

## Problem

Before starting a game, the user needs to configure player count, seat assignments (human vs AI), and an optional seed. Currently the runner auto-start path in pre-game uses placeholder defaults from descriptor seed/player only.

## What to Change

### 1. Extend bootstrap descriptor metadata summary for pre-game labels

Update bootstrap registry summary extraction so pre-game can render seat/faction names without loading full game definitions.

- Add optional faction id summary to descriptor metadata:
  - `packages/runner/src/bootstrap/bootstrap-registry.ts`
  - `BootstrapGameMetadataSummary` gains `factionIds: readonly string[]`
- Extract `factions[].id` from bootstrap fixture JSON when available; otherwise `[]`.
- Keep this generic (no per-game branching).

### 2. Create `packages/runner/src/ui/PreGameConfigScreen.tsx`

- **Player count control**: Within descriptor metadata range (`playerMin`-`playerMax`).
- **Seat assignment rows**: For each seat (`0..playerCount-1`):
  - Label resolution order:
    1. If descriptor `factionIds[seat]` exists and visual config has display name, use `VisualConfigProvider.getFactionDisplayName(factionId)`
    2. Else `formatIdAsDisplayName(factionId)` when faction id exists
    3. Else `Player N`
  - Role selector options: `Human`, `AI - Random`, `AI - Greedy`
- **Seed input (optional)**:
  - Empty => generate random non-negative safe integer seed from crypto-backed entropy.
  - Non-empty => parse as non-negative safe integer.
  - Invalid input => validation message and prevent start.
- **Start Game**:
  - Calls `sessionStore.startGame(seedNumber, playerConfig)`.
  - `playerConfig` must match `PlayerSeatConfig[]`.
  - Require at least one human seat; validation blocks start otherwise.
- **Back**:
  - Calls `sessionStore.returnToMenu()`.

### 3. Create `packages/runner/src/ui/PreGameConfigScreen.module.css`

Minimal, readable layout for the configuration form.

### 4. Wire into `App.tsx`

Replace `PreGameConfigPlaceholder` with `<PreGameConfigScreen />`.

### 5. Tests

- Add `packages/runner/test/ui/PreGameConfigScreen.test.tsx`.
- Update existing tests that reference placeholder-only behavior (`App.test.tsx`, placeholder test file) to reflect actual pre-game UI and transitions.
- Keep coverage focused on data-driven behavior and transition contracts.

## Files to Touch

- `packages/runner/src/bootstrap/bootstrap-registry.ts`
- `packages/runner/src/ui/PreGameConfigScreen.tsx` (new)
- `packages/runner/src/ui/PreGameConfigScreen.module.css` (new)
- `packages/runner/src/App.tsx`
- `packages/runner/test/ui/PreGameConfigScreen.test.tsx` (new)
- `packages/runner/test/ui/App.test.tsx`
- `packages/runner/test/ui/session-placeholders.test.tsx` (trim/remove pre-game placeholder assertions)

## Out of Scope

- Session store architecture and transition contract semantics (already in earlier tickets)
- Replay implementation (SESSMGMT-011, 012)
- Save/load implementation (SESSMGMT-008, 009, 010)
- Event log implementation (SESSMGMT-013, 014)
- Engine seed type migration (`number` -> `bigint`) across kernel/worker/runner (separate cross-cutting decision)

## Acceptance Criteria

### Tests That Must Pass

1. **Player count control bounds**: Enforces descriptor `playerMin` and `playerMax`.
2. **Seat rows**: Renders one row per current player count.
3. **Faction-aware labels**: Uses visual-config faction display names when available.
4. **Fallback labels**: Falls back to formatted faction id, then `Player N`.
5. **Seat type options**: Each seat selector has `Human`, `AI - Random`, `AI - Greedy`.
6. **Empty seed**: Start generates a random non-negative safe integer seed.
7. **Provided seed**: Valid numeric seed string is used verbatim.
8. **Invalid seed**: Invalid/unsafe seed blocks start with validation message.
9. **Human seat invariant**: Start blocked when zero human seats selected.
10. **Start transition**: Calls `sessionStore.startGame(seed, playerConfig)` and transitions in app flow.
11. **Back action**: Calls `sessionStore.returnToMenu()`.
12. **Runner tests**: `pnpm -F @ludoforge/runner test` passes.

### Invariants

1. Player count stays within `[playerMin, playerMax]`.
2. At least one seat is `human` before `startGame`.
3. Seed passed to session store is always a non-negative safe integer.
4. `PlayerSeatConfig[]` emitted by the screen conforms to `session-types.ts`.
5. The screen remains game-agnostic: metadata + visual config drive labels; no game-specific branches.

## Outcome

- **Completion date**: 2026-02-20
- **What changed**:
  - Added `PreGameConfigScreen` and styles.
  - Replaced `PreGameConfigPlaceholder` usage in `App.tsx`.
  - Extended bootstrap descriptor metadata summary with `factionIds` extracted from fixture `factions`.
  - Added comprehensive pre-game UI tests and updated related app/bootstrap/placeholder tests.
  - Tightened strict TS compatibility in touched paths (`GameContainer`, test typing).
- **Deviation from original plan**:
  - Original ticket assumed `bigint` seed contract; implementation kept architecture-consistent `number` safe-integer seed contract used across runner/bridge/session.
  - Added descriptor-level `factionIds` summary to avoid pre-game full-`GameDef` loading.
- **Verification**:
  - `pnpm -F @ludoforge/runner test` (pass)
  - `pnpm -F @ludoforge/runner lint` (pass)
  - `pnpm -F @ludoforge/runner typecheck` (pass)
