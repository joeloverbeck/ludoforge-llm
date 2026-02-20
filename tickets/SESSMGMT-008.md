# SESSMGMT-008: Move Accumulation in Game Bridge (Spec 43 D5 — bridge wiring)

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: SESSMGMT-004

## Problem

The session store (SESSMGMT-004) defines `recordMove()` and `moveAccumulator` for tracking moves during play, but nothing calls `recordMove()` yet. The game bridge needs to call `sessionStore.recordMove(move)` after each `applyMove()` response so moves accumulate for save/replay.

## What to Change

### 1. Wire `recordMove` into the bridge or game store

After each successful `applyMove()` call that returns from the worker, call `sessionStore.recordMove(move)` with the move that was just applied.

The exact integration point depends on where moves are dispatched:
- If moves flow through `game-store.ts`'s `applyMove` action, add the `recordMove` call there.
- If moves flow through `game-bridge.ts`, add it there.
- The session store must be injected or imported — choose the approach that minimizes coupling.

### 2. Wire `recordMove` for AI moves

When AI agents apply moves during AI turn playback, those moves must also be recorded via `recordMove()`.

## Files to Touch

- `packages/runner/src/bridge/game-bridge.ts` OR `packages/runner/src/store/game-store.ts` (whichever handles move application — add `recordMove` call)
- `packages/runner/test/` — update or add tests for move accumulation

## Out of Scope

- Session store creation (done in SESSMGMT-004)
- Save/load UI (SESSMGMT-009, 010)
- Replay controller (SESSMGMT-011, 012)
- Game selection or pre-game config screens

## Acceptance Criteria

### Tests That Must Pass

1. **Human move recorded**: After a human move is applied via the bridge, `sessionStore.moveAccumulator` contains that move.
2. **AI move recorded**: After an AI move is applied, `sessionStore.moveAccumulator` contains that move.
3. **Move sequence**: After 5 moves (mix of human and AI), `moveAccumulator` contains exactly 5 moves in order.
4. **Unsaved flag**: After the first `recordMove`, `sessionStore.unsavedChanges === true`.
5. **Existing runner tests**: `pnpm -F @ludoforge/runner test` passes.

### Invariants

1. Every move applied during gameplay (human and AI) is recorded in `moveAccumulator`.
2. Moves are recorded in the exact order they were applied.
3. `recordMove` is never called during replay mode (replay has its own move sequencing).
4. The wiring does not add runtime overhead beyond the append operation.
