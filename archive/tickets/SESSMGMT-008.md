# SESSMGMT-008: Move Accumulation in Active Game Runtime (Spec 43 D5 — move capture wiring)

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: SESSMGMT-004

## Reassessed Assumptions (2026-02-20)

1. `session-store` and session router already exist (`packages/runner/src/session/session-store.ts`, `packages/runner/src/App.tsx`), and `recordMove` is currently unused by gameplay wiring.
2. Move mutation does not happen in `game-bridge.ts`; the bridge only wraps the worker. Real move application happens in `game-store.ts` (`confirmMove` for human, `resolveAiStep` for AI).
3. Wiring session concerns into `game-bridge.ts` would couple transport to app/session state and is architecturally weaker than hooking at the game-store mutation boundary.
4. Replay is currently represented by a placeholder route and does not use active-game runtime wiring; move recording must therefore be injected only for active gameplay and not as a global side effect.

## Problem

Session-level move accumulation is defined (`recordMove`, `moveAccumulator`, `unsavedChanges`) but gameplay execution paths do not emit applied moves into the session store. As a result, save/replay inputs are incomplete.

## Scope (Updated)

Add a narrow, explicit move-applied callback seam at the game-store mutation boundary and inject `sessionStore.recordMove` from active-game runtime. Record both human and AI applied moves in-order, only for active gameplay.

## What to Change

### 1. Add move-applied callback seam to game store

In `packages/runner/src/store/game-store.ts`:
- Extend `createGameStore` with an optional options argument, for example:
  - `onMoveApplied?: (move: Move) => void`
- Invoke the callback only after a move is successfully committed to store state (i.e., after stale-operation guards pass):
  - Human flow: `confirmMove`
  - AI flow: `resolveAiStep`
- Keep callback invocation outside bridge/worker modules.

### 2. Inject session recording from active game runtime

In `packages/runner/src/session/active-game-runtime.ts`:
- Pass a callback into `createGameStore` that calls `sessionStore.getState().recordMove(move)`.
- Scope injection to active-game runtime only.

In `packages/runner/src/App.tsx`:
- Pass `sessionStore` (or equivalent callback source) into `useActiveGameRuntime` so runtime wiring can record moves without importing session store globally.

### 3. Add/adjust tests for move accumulation behavior

Update runner tests to verify:
- Human applied move is recorded.
- AI applied move is recorded.
- Mixed sequence preserves exact order.
- First recorded move sets `unsavedChanges = true`.
- Stale/aborted operations do not produce false move recordings.

## Files to Touch

- `packages/runner/src/store/game-store.ts`
- `packages/runner/src/session/active-game-runtime.ts`
- `packages/runner/src/App.tsx`
- `packages/runner/test/store/game-store.test.ts`
- `packages/runner/test/session/active-game-runtime.test.tsx`
- `packages/runner/test/ui/App.test.ts`
- Optional additional tests under `packages/runner/test/store/` for stale-op protection

## Out of Scope

- Session store creation or transition guards (SESSMGMT-004 complete)
- Save/load persistence implementation details (SESSMGMT-009/010)
- Replay controller implementation (SESSMGMT-011/012)
- Game selection/pre-game configuration UX changes

## Architectural Assessment

Compared to the current architecture, this updated approach is more robust and extensible:

- It preserves clean boundaries: bridge remains transport-only, game-store remains gameplay mutation boundary, session-store remains app/session concern.
- It avoids hidden global coupling by using explicit dependency injection (`onMoveApplied`) rather than importing session store inside core store/bridge modules.
- It naturally supports future consumers (analytics, telemetry, deterministic audit logs) by reusing the same callback seam.
- It keeps replay-safe behavior by attaching recording only in active gameplay runtime wiring.

No backward-compatibility aliases are required; this should be implemented as the canonical path.

## Acceptance Criteria

### Tests That Must Pass

1. **Human move recorded**: After `confirmMove`, `moveAccumulator` contains that move.
2. **AI move recorded**: After `resolveAiStep`/`resolveAiTurn` applies a move, `moveAccumulator` contains that move.
3. **Move sequence order**: For a mixed human+AI sequence, `moveAccumulator` equals the exact applied order.
4. **Unsaved flag**: After first recorded move, `unsavedChanges === true`.
5. **No stale leakage**: Stale or cancelled operations do not append phantom moves.
6. **Runner suite**: `pnpm -F @ludoforge/runner test` passes.

### Invariants

1. Every successfully applied gameplay move (human and AI) is recorded exactly once.
2. Recording occurs only after successful state mutation commit for the current operation.
3. Replay paths do not implicitly record moves through global side effects.
4. Bridge module remains session-agnostic.

## Outcome

- **Completion date**: 2026-02-20
- **What was changed**:
  - Added an optional `onMoveApplied` callback seam to `createGameStore` and wired callback emission after committed human (`confirmMove`) and AI (`resolveAiStep`) move applications.
  - Injected `sessionStore.recordMove` from `App` into `useActiveGameRuntime`, then into `createGameStore`, keeping bridge code session-agnostic.
  - Added and updated tests covering human move capture, AI move capture, mixed ordering, stale-operation callback suppression, runtime callback wiring, and session dirty/accumulator updates via the runtime callback.
- **Deviations from original plan**:
  - No changes were made to `game-bridge.ts`; all move-capture wiring was implemented at the game-store mutation boundary for cleaner architecture.
  - Scope expanded slightly to include stale-operation callback suppression tests to protect ordering/invariant correctness.
- **Verification results**:
  - `pnpm -F @ludoforge/runner exec vitest run test/store/game-store.test.ts test/store/game-store-async-serialization.test.ts test/session/active-game-runtime.test.tsx test/ui/App.test.ts`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner lint`
  - `pnpm -F @ludoforge/runner typecheck`
