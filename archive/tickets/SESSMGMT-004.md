# SESSMGMT-004: Session Types and Session Store (Spec 43 D1 — types and store)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: SESSMGMT-003

## Reassessed Assumptions (2026-02-20)

1. `App.tsx` still renders `GameContainer` unconditionally with eager bootstrap and game-store initialization; no app-level session router exists yet.
2. Runner/game-worker/game-store APIs use `seed: number` (`resolveBootstrapConfig`, `GameWorkerAPI.init`, `createGameStore.initGame`). The original ticket’s `bigint` seed in session state would add avoidable type friction and adapter logic.
3. Session routing and game lifecycle are intentionally separate (Spec 43). Therefore session-store transition rules must not depend on runtime lifecycle internals (for example, “`newGame` only when terminal” is a caller/UI policy concern to be enforced in later tickets).
4. There is no existing `packages/runner/src/session/` module and no session-store tests; the proper new test location is `packages/runner/test/session/`.

## Problem

The runner lacks a session-level state machine above game lifecycle state. Without a dedicated session store, navigation across game selection, pre-game configuration, active play, and replay cannot be modeled cleanly or validated via deterministic transition guards.

## Scope (Updated)

Implement a standalone, testable session domain module (`session-types` + `session-store`) with strict transition validation and move-dirty tracking, while keeping it independent from bridge/game-store internals.

## What to Change

### 1. Create `packages/runner/src/session/session-types.ts`

Define the discriminated union for app screen state:

```typescript
import type { Move } from '@ludoforge/engine/runtime';

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
  readonly seed: number;
  readonly playerConfig: readonly PlayerSeatConfig[];
}

export interface ReplayState {
  readonly screen: 'replay';
  readonly gameId: string;
  readonly seed: number;
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

Implement a Zustand store factory:

- `createSessionStore()` returns `StoreApi<SessionStore>` via `create<SessionStore>()`
- State:
  - `sessionState: SessionState` — initial `{ screen: 'gameSelection' }`
  - `unsavedChanges: boolean` — initial `false`
  - `moveAccumulator: readonly Move[]` — initial `[]`

Actions:
- `selectGame(gameId: string)` — `gameSelection` -> `preGameConfig`
- `startGame(seed: number, playerConfig: readonly PlayerSeatConfig[])` — `preGameConfig` -> `activeGame`
- `returnToMenu()` — any screen -> `gameSelection`, reset `unsavedChanges` + `moveAccumulator`
- `startReplay(gameId: string, seed: number, moveHistory: readonly Move[])` — `gameSelection` -> `replay`
- `newGame()` — `activeGame` -> `preGameConfig` (same `gameId`)
- `recordMove(move: Move)` — append to accumulator, set `unsavedChanges = true`
- `markSaved()` — set `unsavedChanges = false`

Transition validation:
- Invalid source screen for any action throws with explicit transition error.
- Keep guard logic local to session store; do not inspect game-store lifecycle or bridge state.

### 3. Add tests: `packages/runner/test/session/session-store.test.ts`

Add focused unit tests for initial state, valid transitions, invalid transitions, and dirty/move accumulator behavior.

## Files to Touch

- `packages/runner/src/session/session-types.ts` (new)
- `packages/runner/src/session/session-store.ts` (new)
- `packages/runner/test/session/session-store.test.ts` (new)

## Out of Scope

- `App.tsx` refactoring and router wiring (SESSMGMT-005)
- UI components/screens (SESSMGMT-006/007/008)
- Unsaved-changes dialog UX
- Save/load persistence (SESSMGMT-009/010)
- Replay controller UI (SESSMGMT-011/012)

## Architectural Assessment

Compared to current architecture, this deliverable is beneficial and should be implemented as-is with the corrections above:

- It establishes a clean separation of concerns: app/session navigation state is isolated from the game execution store.
- Transition guards encode navigation invariants in one place, reducing UI-level branching and accidental invalid flows.
- A factory-based store (`createSessionStore`) keeps the module composable and testable, avoiding global singleton coupling.
- Using `number` seed keeps compatibility with existing runner/worker contracts and avoids unnecessary adapters.

No cleaner alternative in the current codebase provides the same robustness with less complexity.

## Acceptance Criteria

### Tests That Must Pass

1. Initial state is `{ screen: 'gameSelection' }`, `unsavedChanges = false`, `moveAccumulator = []`.
2. `selectGame('fitl')` from `gameSelection` transitions to `preGameConfig` with `gameId: 'fitl'`.
3. `startGame(42, [...])` from `preGameConfig` transitions to `activeGame` with correct seed/playerConfig.
4. `returnToMenu()` from each screen transitions to `gameSelection` and resets dirty/accumulator state.
5. `startReplay('fitl', 42, moves)` from `gameSelection` transitions to `replay` with correct payload.
6. `newGame()` from `activeGame` transitions to `preGameConfig` with same `gameId`.
7. `recordMove(move)` appends to `moveAccumulator` and sets `unsavedChanges = true`.
8. `markSaved()` sets `unsavedChanges = false` without clearing `moveAccumulator`.
9. Invalid transition examples throw (for example `selectGame` from `activeGame`, `startGame` from `gameSelection`, `newGame` from `replay`).
10. `createSessionStore()` returns independent store instances (no cross-instance state leakage).

### Invariants

1. `SessionState` is discriminated by `screen`.
2. Session store has no imports from bridge/game-store modules.
3. `returnToMenu()` always clears move accumulator and unsaved state.
4. `PlayerSeatConfig.type` is `'human' | 'ai-random' | 'ai-greedy'`.
5. Transition errors are explicit and deterministic.

## Outcome

- **Completion date**: 2026-02-20
- **What was changed**:
  - Added `packages/runner/src/session/session-types.ts` with `AppScreen`, `SessionState`, and `PlayerSeatConfig` definitions.
  - Added `packages/runner/src/session/session-store.ts` with a factory-based Zustand store, strict transition validation, and dirty/move-accumulator actions.
  - Added `packages/runner/test/session/session-store.test.ts` with 12 unit tests covering initial state, valid/invalid transitions, state reset semantics, dirty tracking, and store instance isolation.
- **Deviations from original plan**:
  - Replaced `bigint` seed with `number` to align with existing runner and worker contracts.
  - Clarified `newGame()` as an `activeGame -> preGameConfig` session transition without terminal-lifecycle coupling (terminal gating is deferred to UI/game-store integration ticket).
  - Kept this ticket scoped to session module + tests only; router/UI wiring remains for follow-up tickets.
- **Verification results**:
  - `pnpm -F @ludoforge/runner exec vitest run test/session/session-store.test.ts`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner lint`
  - `pnpm -F @ludoforge/runner typecheck`
