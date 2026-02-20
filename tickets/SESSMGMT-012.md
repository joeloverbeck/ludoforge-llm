# SESSMGMT-012: Replay Screen and Controls UI (Spec 43 D6 — UI layer)

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: SESSMGMT-011

## Problem

The replay controller (SESSMGMT-011) provides the logic but the user needs a UI with a progress bar scrubber, step controls, play/pause, speed selector, and keyboard shortcuts.

## Assumption Reassessment (2026-02-20)

1. `App.tsx` already contains replay route wiring and currently renders `ReplayPlaceholder`.
2. Session routing/store primitives are already implemented; this ticket should focus on replay UI composition and wiring to the replay controller/store.
3. Dependency on `SESSMGMT-005` is stale and removed.

## What to Change

### 1. Create `packages/runner/src/ui/ReplayControls.tsx`

- **Progress bar / scrubber**: Range slider from -1 (initial state) to `totalMoves - 1`. Dragging or clicking jumps to that move via `jumpToMove()`.
- **Step buttons**: `|<<` (jump to start, index -1), `<` (step backward), `>` (step forward), `>>|` (jump to end, index totalMoves - 1).
- **Play/Pause toggle**: Start/stop auto-advance.
- **Speed selector**: 0.5x, 1x, 2x, 4x buttons or dropdown.
- **Move counter**: "Move 15 / 237" (or "Initial State" when at -1).
- **"Back to Menu" button**: Calls `sessionStore.returnToMenu()`.

### 2. Create `packages/runner/src/ui/ReplayControls.module.css`

### 3. Create `packages/runner/src/ui/ReplayScreen.tsx`

Wrapper component that:
- Creates a game bridge and game store in read-only mode.
- Initializes the replay controller with the session state's seed + moveHistory.
- Renders `<GameContainer />` (read-only: no action toolbar, no choice panel) + `<ReplayControls />`.
- Destroys bridge and controller on unmount.

### 4. Register keyboard shortcuts

Integrate with the existing keyboard coordinator (`packages/runner/src/input/keyboard-coordinator.ts`):
- **Left arrow**: step backward
- **Right arrow**: step forward
- **Space**: play/pause toggle
- **Home**: jump to start
- **End**: jump to end

### 5. Wire into `App.tsx`

Replace the existing replay placeholder with `<ReplayScreen />`.

## Files to Touch

- `packages/runner/src/ui/ReplayControls.tsx` (new)
- `packages/runner/src/ui/ReplayControls.module.css` (new)
- `packages/runner/src/ui/ReplayScreen.tsx` (new)
- `packages/runner/src/ui/ReplayScreen.module.css` (new, if needed)
- `packages/runner/src/App.tsx` (replace replay placeholder)
- `packages/runner/src/input/keyboard-coordinator.ts` (add replay shortcuts or make them configurable)
- `packages/runner/test/ui/ReplayControls.test.tsx` (new)
- `packages/runner/test/ui/ReplayScreen.test.tsx` (new)

## Out of Scope

- Replay controller logic (done in SESSMGMT-011)
- Save/load persistence (SESSMGMT-009, 010)
- Event log panel (SESSMGMT-013, 014)
- Session routing/store primitives (already present in current runner)
- Animation system modifications (replay uses existing GSAP animation infrastructure)

## Acceptance Criteria

### Tests That Must Pass

1. **Progress bar renders**: Slider renders with `min=-1` and `max=totalMoves - 1`.
2. **Scrubber jump**: Moving slider to position 10 calls `jumpToMove(10)`.
3. **Step forward button**: Clicking `>` calls `stepForward()`.
4. **Step backward button**: Clicking `<` calls `stepBackward()`.
5. **Jump to start**: Clicking `|<<` calls `jumpToMove(-1)` (or equivalent reset).
6. **Jump to end**: Clicking `>>|` calls `jumpToMove(totalMoves - 1)`.
7. **Play/Pause toggle**: Clicking play starts auto-advance; clicking again pauses.
8. **Speed selector**: Selecting "2x" calls `setSpeed(2)`.
9. **Move counter**: Shows "Move 15 / 237" when at index 15.
10. **Move counter initial**: Shows "Initial State" or "Move 0 / 237" when at index -1.
11. **Keyboard shortcuts**: Left/Right arrows, Space, Home, End trigger correct controller actions.
12. **Back to Menu**: Clicking "Back to Menu" calls `sessionStore.returnToMenu()`.
13. **Read-only game container**: Action toolbar and choice panel are hidden during replay.
14. **Bridge cleanup**: Bridge is terminated when leaving replay screen.
15. **Existing runner tests**: `pnpm -F @ludoforge/runner test` passes.

### Invariants

1. Replay screen does not allow move submission — game container is read-only.
2. Keyboard shortcuts only active when replay screen is mounted (no conflicts with game mode).
3. Bridge and controller are destroyed on unmount — no leaked timers or workers.
4. Scrubber position always matches `replayStore.currentMoveIndex`.
5. Animation plays for the landing move after jump/step-forward (uses trace from controller).
