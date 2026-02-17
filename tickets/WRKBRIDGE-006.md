# WRKBRIDGE-006: Bridge Integration Tests (D6)

**Status**: PENDING
**Priority**: HIGH
**Effort**: M
**Spec**: 36, Deliverable D6 (Unit Tests)
**Deps**: WRKBRIDGE-003 (bridge factory), WRKBRIDGE-004 (clone tests pass), WRKBRIDGE-005 (URL loading)

## Problem

The complete bridge needs integration tests that verify the end-to-end flow: main thread → Comlink → Worker → kernel → response. These tests exercise the `GameWorkerAPI` through the Comlink proxy, validating that all methods work correctly, errors propagate properly, and state management (history, undo, reset) behaves as specified.

## What to Change

Create `packages/runner/test/worker/game-bridge.test.ts` with tests covering all scenarios from Spec 36 D6.

### Test environment note
These tests run the actual Worker + Comlink pipeline. This requires either:
- A browser-like test environment (e.g., Vitest with `jsdom` or `happy-dom` + Worker polyfill), OR
- Vitest's `browser` mode, OR
- Testing the `gameWorker` object directly (without Comlink) as a pragmatic alternative for Node.js.

**Recommended approach**: Test the `gameWorker` object directly for logic coverage (Node.js, no browser needed), plus a minimal Vitest browser-mode test (or manual verification) for the Comlink serialization layer. The clone-compat tests (WRKBRIDGE-004) already verify serialization safety.

### Test categories and scenarios

#### Initialization
1. `init()` returns a valid GameState (non-null, has expected fields).
2. `init()` with explicit `playerCount` returns state with correct `state.playerCount`.
3. `init()` with `enableTrace: false` — subsequent `applyMove()` returns `effectTrace: undefined`.

#### Move enumeration
4. `legalMoves()` returns non-empty array for initial state.
5. `enumerateLegalMoves()` returns `{ moves, warnings }` with correct shape.
6. `enumerateLegalMoves()` with budget options respects limits (if applicable to fixture game).

#### Move application
7. `applyMove()` returns `ApplyMoveResult` with all four fields: state, triggerFirings, warnings, effectTrace.
8. `applyMove()` with `{ trace: true }` includes `effectTrace` (non-undefined).
9. `applyMove()` with `{ trace: false }` — `effectTrace` is undefined.
10. Multiple sequential `applyMove()` calls produce correct state progression (state changes between moves).

#### Choice system
11. `legalChoices()` returns correct `ChoiceRequest` variant for the game state (test with a partial move if applicable).

#### Batch execution
12. `playSequence()` returns correct number of `ApplyMoveResult` entries (one per move).
13. `playSequence()` with `onStep` callback fires for each move with correct index (0, 1, 2...).
14. `playSequence()` stops and throws on illegal move — prior moves are applied, state is consistent.

#### Terminal
15. `terminalResult()` returns null for non-terminal state.

#### State management
16. `getState()` returns current state snapshot (same as last `applyMove()` result state).
17. `getMetadata()` returns correct fields: gameId (string), playerCount (number), phaseNames (string[]), actionNames (string[]), zoneNames (string[]).
18. `getHistoryLength()` increments with each `applyMove()` and decrements with `undo()`.

#### Undo
19. `undo()` restores previous state (deepEqual with state before last move).
20. `undo()` on initial state (no moves applied) returns null.

#### Reset
21. `reset()` clears history and reinitializes with same def (historyLength=0, state is fresh initial).
22. `reset()` with new seed produces different initial state (different `stateHash`).
23. `reset()` with new def loads the new game (if fixture supports multiple defs).
24. `reset()` with new `playerCount` changes `state.playerCount`.

#### Error handling
25. Illegal move error includes `code: 'ILLEGAL_MOVE'` and descriptive `message`.
26. Methods called before `init()` throw with `code: 'NOT_INITIALIZED'`.
27. After `terminate()` is called (or the worker object is cleared), no further calls succeed.

### Test fixture
- Use a minimal test GameDef. Options:
  - Compile a small spec from `packages/engine/test/fixtures/` via the engine's compiler.
  - Hand-craft a minimal valid GameDef JSON that has at least one action, one zone, and produces legal moves.
  - Use the Texas Hold'em or FITL production spec if a helper is available.
- The fixture must support: legal moves from initial state, at least one move that changes state, and a non-terminal initial state.

## Files to Touch

- `packages/runner/test/worker/game-bridge.test.ts` — **NEW FILE**
- `packages/runner/test/fixtures/` — **NEW DIRECTORY** (if a test fixture GameDef is needed)

## Out of Scope

- Do NOT modify any engine code or kernel types.
- Do NOT modify the worker or bridge source files (those are WRKBRIDGE-002/003/005).
- Do NOT test React components or hooks (those are later specs).
- Do NOT test animation/effect trace consumption (that is Spec 40).
- Do NOT implement Vitest browser-mode infrastructure if it's not already set up — test the `gameWorker` object directly in Node.js as the primary path.

## Acceptance Criteria

### Tests that must pass
- All 27 test scenarios pass.
- `pnpm -F @ludoforge/runner test` (or equivalent) runs the test file and reports all green.

### Invariants
- Tests use real kernel types from `@ludoforge/engine`.
- No engine source files are modified.
- Tests are deterministic — use fixed seeds for PRNG.
- Each test is independent (fresh `gameWorker` state per test, or per-test setup/teardown).
- Error assertions check both the `code` field and that `message` is a non-empty string.
