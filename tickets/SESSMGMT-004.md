# SESSMGMT-004: Session Types and Session Store (Spec 43 D1 — types and store)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: SESSMGMT-003

## Problem

`App.tsx` renders `GameContainer` unconditionally — there is no session-level navigation. The runner needs an `AppScreen` state machine that routes between game selection, pre-game config, active game, and replay screens, and tracks unsaved changes and move accumulation.

## What to Change

### 1. Create `packages/runner/src/session/session-types.ts`

Define the discriminated union for app screen state:

```typescript
export type AppScreen = 'gameSelection' | 'preGameConfig' | 'activeGame' | 'replay';

export interface GameSelectionState {
  readonly screen: 'gameSelection';
}

export interface PreGameConfigState {
  readonly screen: 'preGameConfig';
  readonly gameId: string;
}

export interface ActiveGameState {
  readonly screen: 'activeGame';
  readonly gameId: string;
  readonly seed: bigint;
  readonly playerConfig: readonly PlayerSeatConfig[];
}

export interface ReplayState {
  readonly screen: 'replay';
  readonly gameId: string;
  readonly seed: bigint;
  readonly moveHistory: readonly Move[];
}

export type SessionState =
  | GameSelectionState
  | PreGameConfigState
  | ActiveGameState
  | ReplayState;

export interface PlayerSeatConfig {
  readonly playerId: number;
  readonly type: 'human' | 'ai-random' | 'ai-greedy';
}
```

### 2. Create `packages/runner/src/session/session-store.ts`

Zustand store with:

- `sessionState: SessionState` — initial: `{ screen: 'gameSelection' }`
- `unsavedChanges: boolean` — tracks whether active game has unsaved moves
- `moveAccumulator: readonly Move[]` — accumulates moves during play for save/replay

Navigation actions:
- `selectGame(gameId: string)` — `gameSelection` -> `preGameConfig`
- `startGame(seed: bigint, playerConfig: PlayerSeatConfig[])` — `preGameConfig` -> `activeGame`
- `returnToMenu()` — any screen -> `gameSelection` (caller handles unsaved-changes confirmation)
- `startReplay(gameId: string, seed: bigint, moveHistory: Move[])` — `gameSelection` -> `replay`
- `newGame()` — `activeGame` (terminal) -> `preGameConfig` (same game)
- `recordMove(move: Move)` — appends to `moveAccumulator`, sets `unsavedChanges = true`
- `markSaved()` — sets `unsavedChanges = false`

Transition validation: each navigation action should throw if called from an invalid source screen (e.g., `selectGame` only valid from `gameSelection`).

## Files to Touch

- `packages/runner/src/session/session-types.ts` (new)
- `packages/runner/src/session/session-store.ts` (new)
- `packages/runner/test/session/session-store.test.ts` (new — unit tests)

## Out of Scope

- `App.tsx` refactoring (SESSMGMT-005)
- UI components for any screens (SESSMGMT-006, 007, 008)
- Terminal overlay / toolbar modifications (SESSMGMT-005)
- Save/load persistence (SESSMGMT-009, 010)
- Replay controller (SESSMGMT-011, 012)

## Acceptance Criteria

### Tests That Must Pass

1. **Initial state**: Store starts at `{ screen: 'gameSelection' }`.
2. **`selectGame` transition**: From `gameSelection`, calling `selectGame('fitl')` transitions to `{ screen: 'preGameConfig', gameId: 'fitl' }`.
3. **`startGame` transition**: From `preGameConfig`, calling `startGame(42n, [...])` transitions to `activeGame` with correct seed and playerConfig.
4. **`returnToMenu` transition**: From any screen, transitions to `gameSelection` and resets `unsavedChanges` to `false` and `moveAccumulator` to `[]`.
5. **`startReplay` transition**: From `gameSelection`, transitions to `replay` with correct seed and moveHistory.
6. **`newGame` transition**: From `activeGame`, transitions to `preGameConfig` with the same `gameId`.
7. **`recordMove`**: Appends move to `moveAccumulator`, sets `unsavedChanges = true`.
8. **`markSaved`**: Sets `unsavedChanges = false` without clearing `moveAccumulator`.
9. **Invalid transition**: `selectGame` from `activeGame` throws an error.
10. **Invalid transition**: `startGame` from `gameSelection` throws an error.

### Invariants

1. `SessionState` is a proper discriminated union on the `screen` field.
2. `returnToMenu()` always resets move accumulator and unsaved flag.
3. `PlayerSeatConfig.type` is a union of `'human' | 'ai-random' | 'ai-greedy'`.
4. Store is created via Zustand `create()` and follows project conventions (no middleware beyond what's needed).
5. No imports from game-store or bridge modules — session store is independent.
