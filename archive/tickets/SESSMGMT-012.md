# SESSMGMT-012: Replay Screen and Controls UI (Spec 43 D6 — UI layer)

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: Spec 43 D1 session router/state + Spec 43 D6 replay logic layer (already implemented in runner)

## Problem

The replay controller (SESSMGMT-011) provides the logic but the user needs a UI with a progress bar scrubber, step controls, play/pause, speed selector, and keyboard shortcuts.

## Assumption Reassessment (2026-02-20)

1. `App.tsx` already contains replay route wiring and currently renders `ReplayPlaceholder` (`packages/runner/src/ui/screens/ReplayPlaceholder.tsx`), not a replay runtime screen.
2. Session routing/store primitives are already implemented (`session-types` and `session-store`) and include `startReplay(...)`; this ticket must not duplicate router/store transitions.
3. Replay controller/store are implemented in `packages/runner/src/replay/`, but there is currently no runtime bridge between replay controller mutations and `GameStore` render state used by `GameContainer`.
4. `keyboard-coordinator` exists as a generic mechanism only; replay shortcut registration is not implemented.
5. Existing replay UI tests only validate the placeholder. The acceptance/test scope in this ticket was ahead of code reality and is corrected below.

## Architecture Check

1. The clean architecture is a dedicated replay runtime hook (`useReplayRuntime`) that encapsulates bridge/store/controller lifecycle, instead of embedding replay lifecycle orchestration inside `App.tsx` or `ReplayScreen`.
2. Replay state synchronization should be explicit and generic: replay controller emits state changes; replay runtime hydrates `GameStore` from bridge state/effects through generic store APIs (no game-specific branching).
3. Replay read-only mode must be a first-class `GameContainer` capability (explicit prop), not ad-hoc UI hiding in parent components.
4. No backward-compatibility aliasing/shims: replace placeholder usage in `App.tsx` directly with `ReplayScreen`.

## What to Change

### 1. Add replay runtime integration layer

- Create `packages/runner/src/session/replay-runtime.ts` with a `useReplayRuntime(sessionState)` hook.
- Responsibilities:
  - Build replay bootstrap config from `sessionState.replay`.
  - Create/destroy `GameBridge`, read-only `GameStore`, `ReplayController`, and `ReplayStore`.
  - Initialize replay to initial state (`seed` with no replayed moves).
  - Synchronize render state after replay controller operations by hydrating `GameStore` from bridge state + legal moves + terminal + landing trace.

### 2. Extend `GameStore` with replay-hydration API

- Add generic `hydrateFromReplayStep(...)` action in `packages/runner/src/store/game-store.ts` so replay runtime can update render model from bridge-driven replay operations.
- Inputs include current `GameState`, `LegalMoveEnumerationResult`, `TerminalResult | null`, and latest `effectTrace`/`triggerFirings`.
- Preserve agnostic boundaries: no game-specific payload fields or hardcoded IDs.

### 3. Create replay UI components

- Create `packages/runner/src/ui/ReplayControls.tsx` + `packages/runner/src/ui/ReplayControls.module.css`.
- UI contract:
  - Scrubber range is `[-1, totalMoves - 1]`.
  - Step controls: `|<<`, `<`, play/pause, `>`, `>>|`.
  - Speed selector: `0.5x`, `1x`, `2x`, `4x`.
  - Move counter text: `Initial State` at `-1`, otherwise `Move {index + 1} / {totalMoves}`.
  - Back button triggers `sessionStore.returnToMenu()`.

### 4. Create `packages/runner/src/ui/ReplayScreen.tsx`

- Render read-only `GameContainer` + `ReplayControls`.
- Use replay runtime hook output.
- Register replay keyboard shortcuts via `createKeyboardCoordinator(document)` while mounted:
  - Left arrow: step backward
  - Right arrow: step forward
  - Space: play/pause
  - Home: jump to start (`-1`)
  - End: jump to end (`totalMoves - 1`)
- Ignore shortcuts for editable targets.

### 5. Add read-only `GameContainer` mode

- Update `packages/runner/src/ui/GameContainer.tsx` to support a replay/read-only mode that hides action toolbar + choice panel + undo interactions while preserving board rendering and overlay context.

### 6. Wire into `App.tsx`

Replace the existing replay placeholder with `<ReplayScreen />`.

## Files to Touch

- `packages/runner/src/session/replay-runtime.ts` (new)
- `packages/runner/src/store/game-store.ts` (modify: replay-hydration action)
- `packages/runner/src/ui/ReplayControls.tsx` (new)
- `packages/runner/src/ui/ReplayControls.module.css` (new)
- `packages/runner/src/ui/ReplayScreen.tsx` (new)
- `packages/runner/src/ui/ReplayScreen.module.css` (new if needed)
- `packages/runner/src/ui/GameContainer.tsx` (modify: read-only mode)
- `packages/runner/src/App.tsx` (replace replay placeholder)
- `packages/runner/test/ui/ReplayControls.test.tsx` (new)
- `packages/runner/test/ui/ReplayScreen.test.tsx` (new)
- `packages/runner/test/session/replay-runtime.test.tsx` (new)
- `packages/runner/test/ui/App.test.ts` (modify replay route assertion/mocks)
- `packages/runner/test/ui/GameContainer.test.ts` (modify read-only behavior coverage)

## Out of Scope

- Replay controller logic (done in SESSMGMT-011)
- Save/load persistence (SESSMGMT-009, 010)
- Event log panel (SESSMGMT-013, 014)
- Session routing/store primitives (already present in current runner)
- Keyboard coordinator core algorithm changes (reuse existing coordinator API)

## Acceptance Criteria

### Tests That Must Pass

1. `ReplayControls` renders slider with `min=-1` and `max=totalMoves - 1`.
2. `ReplayControls` actions call replay-store methods (`jumpToMove`, `stepBackward`, `stepForward`, `play/pause`, `setSpeed`).
3. Move counter renders `Initial State` at index `-1` and `Move X / total` for replayed indices.
4. `ReplayScreen` keyboard shortcuts dispatch correct replay actions and ignore editable targets.
5. `ReplayScreen` back-to-menu action calls `sessionStore.returnToMenu()`.
6. `GameContainer` read-only mode hides action/choice controls while still rendering board/overlay structure.
7. Replay runtime synchronizes `GameStore` after replay controller mutations so rendered board state matches replay index.
8. Replay runtime terminates bridge/controller/coordinator on unmount/route exit.
9. Existing runner test suite passes: `pnpm -F @ludoforge/runner test`.
10. Runner lint passes: `pnpm -F @ludoforge/runner lint`.

### Invariants

1. Replay screen does not allow move submission — game container is read-only.
2. Keyboard shortcuts only active when replay screen is mounted (no conflicts with game mode).
3. Bridge and controller are destroyed on unmount — no leaked timers or workers.
4. Scrubber position always matches `replayStore.currentMoveIndex`.
5. Landing move trace from replay controller is propagated into replay render state (animation/event consumers stay consistent).

## Test Plan

### New/Modified Tests

1. `packages/runner/test/ui/ReplayControls.test.tsx` — replay control rendering + action wiring.
2. `packages/runner/test/ui/ReplayScreen.test.tsx` — keyboard shortcuts, back-to-menu flow, read-only container composition.
3. `packages/runner/test/session/replay-runtime.test.tsx` — bridge/controller/store lifecycle and state synchronization.
4. `packages/runner/test/ui/GameContainer.test.ts` — read-only mode hides action/choice UI.
5. `packages/runner/test/ui/App.test.ts` — replay route renders `ReplayScreen` path instead of placeholder.

### Commands

1. `pnpm -F @ludoforge/runner test -- replay/replay-store.test.ts replay/replay-controller.test.ts ui/ReplayControls.test.tsx ui/ReplayScreen.test.tsx session/replay-runtime.test.tsx`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner lint`

## Outcome

- **Completion date**: 2026-02-20
- **What changed**:
  - Added replay UI (`ReplayScreen`, `ReplayControls`) and replaced replay placeholder routing in `App.tsx`.
  - Added `useReplayRuntime` orchestration hook for replay bridge/store/controller lifecycle.
  - Added `GameStore.hydrateFromReplayStep(...)` to synchronize render-model state after replay-controller mutations.
  - Added read-only mode support to `GameContainer` to enforce non-interactive replay rendering.
  - Added replay keyboard shortcuts (Left/Right/Space/Home/End) scoped to replay mount.
  - Removed obsolete `ReplayPlaceholder` component and its placeholder test.
- **Deviation from originally planned ticket text**:
  - Added explicit replay-to-render-store synchronization work because controller/store wiring alone was insufficient for robust replay rendering with trace propagation.
  - Added a dedicated runtime hook (`session/replay-runtime.ts`) to keep lifecycle ownership out of `App.tsx`.
- **Verification**:
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
