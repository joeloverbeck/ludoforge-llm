# SESSMGMT-011: Replay Controller and Store (Spec 43 D6 — logic layer)

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: SESSMGMT-004, SESSMGMT-005

## Problem

The runner needs a replay system that can step forward, backward, and jump to any move in a completed game. This ticket implements the replay controller logic and its Zustand store.

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
- **`stepForward()`**: Apply `moveHistory[currentMoveIndex + 1]` via `bridge.applyMove()` with trace enabled. Animation plays for this move.
- **`stepBackward()`**: Reset game via `bridge.init(def, seed)`, then `bridge.playSequence(moveHistory[0..currentIndex-1])` with trace disabled.
- **`jumpToMove(index)`**: Reset via `bridge.init(def, seed)`, then:
  - If `index > 0`: `bridge.playSequence(moveHistory[0..index-1])` with trace disabled (fast, no animation).
  - Apply `moveHistory[index]` with trace enabled (animation plays for the landing move).
- **`play()`**: Start auto-advance interval. Calls `stepForward()` at intervals based on `playbackSpeed`.
- **`pause()`**: Clear auto-advance interval.
- **`setSpeed(speed)`**: Update interval timing. Valid speeds: 0.5, 1, 2, 4.
- **`destroy()`**: Clear interval, clean up references.

Factory function:

```typescript
export function createReplayController(
  bridge: GameBridge,
  gameDef: GameDef,
  seed: bigint,
  moveHistory: readonly Move[],
  onStateChange: () => void, // called after each state update
): ReplayController;
```

### 2. Create `packages/runner/src/replay/replay-store.ts`

Zustand store for replay UI state:
- `currentMoveIndex: number` (initial: -1)
- `isPlaying: boolean` (initial: false)
- `playbackSpeed: number` (initial: 1)
- `totalMoves: number`
- Actions that delegate to the `ReplayController` and update store state.

## Files to Touch

- `packages/runner/src/replay/replay-controller.ts` (new)
- `packages/runner/src/replay/replay-store.ts` (new)
- `packages/runner/test/replay/replay-controller.test.ts` (new)
- `packages/runner/test/replay/replay-store.test.ts` (new)

## Out of Scope

- Replay UI components (SESSMGMT-012)
- Save/load persistence (SESSMGMT-009, 010)
- Event log panel (SESSMGMT-013, 014)
- App.tsx routing for replay screen (done in SESSMGMT-005)
- Session store changes (done in SESSMGMT-004)

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
3. `stepBackward` and the bulk portion of `jumpToMove` apply moves without trace (for speed).
4. `play()` auto-advance stops when reaching the last move.
5. The controller does not own the bridge — it receives it as a dependency.
6. Replay controller never calls `sessionStore.recordMove()` — replay moves are not accumulated.
