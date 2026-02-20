# SESSMGMT-011: Replay Controller and Store (Spec 43 D6 — logic layer)

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: Spec 43 D1 session router/state (already implemented in runner)

## Problem

The runner needs a replay system that can step forward, backward, and jump to any move in a completed game. This ticket implements the replay controller logic and its Zustand store.

## Assumption Reassessment (2026-02-20)

1. Replay route state already exists in session types/store and `App.tsx` currently renders a replay placeholder.
2. Runner seed contracts use `number` non-negative safe integers (pre-game/session state), not `bigint`.
3. `GameWorkerAPI.playSequence()` does not accept per-call trace options; it always uses worker-level trace mode from `init()`/`reset()` options.
4. Session architecture already includes `startReplay(gameId, seed, moveHistory)` and replay state in `session-store`/`session-types`; this ticket must not duplicate routing primitives.
5. Ticket references to older setup tickets (`SESSMGMT-004`, `SESSMGMT-005`) are stale relative to the current repository state.

## Architecture Check

1. Controller + dedicated replay store is cleaner than embedding replay logic into `App.tsx` or `session-store`; it isolates deterministic replay mechanics from navigation and persistence concerns.
2. Replay logic remains generic and game-agnostic: it replays `Move[]` against `GameDef`/seed through the bridge with no game-specific IDs, branches, or visual assumptions.
3. No backwards-compatibility aliases/shims: new replay modules are first-class runner primitives and existing placeholder paths are replaced later by dependent UI tickets.

## What to Change

### 1. Create `packages/runner/src/replay/replay-controller.ts`

```typescript
export interface ReplayController {
  readonly totalMoves: number;
  readonly currentMoveIndex: number;  // -1 = initial state, 0 = after first move
  readonly isPlaying: boolean;
  readonly playbackSpeed: number;     // 0.5, 1, 2, 4

  stepForward(): Promise<void>;
  stepBackward(): Promise<void>;
  jumpToMove(index: number): Promise<void>;
  play(): void;
  pause(): void;
  setSpeed(speed: number): void;
  destroy(): void;
}
```

Implementation details:
- **`stepForward()`**: Apply `moveHistory[currentMoveIndex + 1]` via `bridge.applyMove(..., { trace: true }, ...)`. Animation plays for this move.
- **`stepBackward()`**: Deterministically rewind by reinitializing via `bridge.init(def, seed, { enableTrace: false }, ...)`, replaying prefix moves with `bridge.applyMove(..., { trace: false }, ...)`, then enabling trace for future landing moves.
- **`jumpToMove(index)`**:
  - If `index === -1`: deterministic reset to initial state.
  - If `index >= 0`: reset with trace disabled, replay moves `[0..index-1]` with `{ trace: false }`, then apply landing move `index` with `{ trace: true }`.
- **`play()`**: Start auto-advance interval. Calls `stepForward()` at intervals based on `playbackSpeed`.
- **`pause()`**: Clear auto-advance interval.
- **`setSpeed(speed)`**: Update interval timing. Valid speeds: 0.5, 1, 2, 4.
- **`destroy()`**: Clear interval, clean up references.

Note: This ticket intentionally avoids `playSequence()` for trace-sensitive stepping because the current worker API does not expose per-call trace control for sequence playback.

Factory function:

```typescript
export function createReplayController(
  bridge: GameBridge,
  gameDef: GameDef,
  seed: number,
  moveHistory: readonly Move[],
  onStateChange: () => void, // called after each replay state update
): ReplayController;
```

### 2. Create `packages/runner/src/replay/replay-store.ts`

Zustand store for replay UI state:
- `currentMoveIndex: number` (initial: -1)
- `isPlaying: boolean` (initial: false)
- `playbackSpeed: number` (initial: 1)
- `totalMoves: number`
- Actions that delegate to the `ReplayController` and update store state.
- Store does not own session navigation or persistence responsibilities.

## Files to Touch

- `packages/runner/src/replay/replay-controller.ts` (new)
- `packages/runner/src/replay/replay-store.ts` (new)
- `packages/runner/test/replay/replay-controller.test.ts` (new)
- `packages/runner/test/replay/replay-store.test.ts` (new)

## Out of Scope

- Replay UI components (SESSMGMT-012)
- Save/load persistence (SESSMGMT-009, 010)
- Event log panel (SESSMGMT-013, 014)
- App/session routing primitives (already present in current runner)

## Acceptance Criteria

### Tests That Must Pass

1. **Initial state**: `currentMoveIndex === -1`, `isPlaying === false`, `playbackSpeed === 1`.
2. **`stepForward`**: From index -1, after `stepForward()`, `currentMoveIndex === 0`. The move is applied with trace.
3. **`stepForward` at end**: At `currentMoveIndex === totalMoves - 1`, `stepForward()` is a no-op.
4. **`stepBackward`**: From index 2, after `stepBackward()`, `currentMoveIndex === 1`. Game is reset and replayed to move 1.
5. **`stepBackward` at start**: At `currentMoveIndex === -1`, `stepBackward()` is a no-op.
6. **`jumpToMove`**: From index -1, `jumpToMove(5)` results in `currentMoveIndex === 5`. Moves 0-4 applied without trace, move 5 with trace.
7. **`jumpToMove(0)`**: Resets and applies first move with trace.
8. **`play`**: After `play()`, `isPlaying === true`. Controller auto-advances.
9. **`pause`**: After `play()` then `pause()`, `isPlaying === false`. Auto-advance stops.
10. **`setSpeed`**: Setting speed to 2 doubles playback rate. Setting to 0.5 halves it.
11. **`destroy`**: After `destroy()`, auto-advance interval is cleared.
12. **Existing runner tests**: `pnpm -F @ludoforge/runner test` passes.

### Invariants

1. `currentMoveIndex` is always in range `[-1, totalMoves - 1]`.
2. `stepForward` and `jumpToMove` apply the landing move with trace enabled (for animation).
3. `stepBackward` and the bulk portion of `jumpToMove` apply prefix moves without trace (for speed and deterministic reconstruction).
4. `play()` auto-advance stops when reaching the last move.
5. The controller does not own the bridge — it receives it as a dependency.
6. Replay controller never calls `sessionStore.recordMove()` — replay moves are not accumulated.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/replay/replay-controller.test.ts` — verifies deterministic stepping/jumping semantics, trace mode behavior, playback timing controls, bounds, and cleanup.
2. `packages/runner/test/replay/replay-store.test.ts` — verifies store defaults and delegation to controller actions while preserving replay-state invariants.

### Commands

1. `pnpm -F @ludoforge/runner test -- replay/replay-controller.test.ts replay/replay-store.test.ts`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner lint`

## Outcome

- **Completion date**: 2026-02-20
- **What changed**:
  - Added `packages/runner/src/replay/replay-controller.ts` with deterministic replay stepping/jumping/playback logic.
  - Added `packages/runner/src/replay/replay-store.ts` Zustand store that delegates to controller actions and syncs replay UI state.
  - Added `packages/runner/test/replay/replay-controller.test.ts` and `packages/runner/test/replay/replay-store.test.ts` covering core replay behavior and invariants.
- **Deviation from original plan**:
  - Replaced planned `playSequence(..., trace disabled)` usage with trace-controlled `applyMove()` loops after deterministic reset, because current bridge `playSequence()` does not support per-call trace options.
- **Verification**:
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
