# WRKBRIDGE-006: Bridge Integration Tests (D6)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: M
**Spec**: 36, Deliverable D6 (Unit Tests)
**Deps**: WRKBRIDGE-003 (bridge factory), WRKBRIDGE-004 (clone tests pass), WRKBRIDGE-005 (URL loading)

## Problem

The D6 test surface needs to reflect the current architecture: worker runtime behavior is implemented in `game-worker-api.ts` and tested directly in Node, while `game-bridge.ts` tests cover bridge factory wiring with mocked Worker/Comlink.

The remaining gap is not "create bridge tests from scratch"; it is to finish scenario coverage in existing worker tests and keep the bridge tests scoped to lifecycle wiring (`createGameBridge`, `terminate`, `proxy` re-export).

## Assumptions Reassessment (2026-02-17)

- `packages/runner/test/worker/game-bridge.test.ts` already exists and currently verifies bridge factory wiring. The prior assumption that this file must be created is incorrect.
- `packages/runner/test/worker/test-fixtures.ts` already exists and already provides a compiled minimal GameDef fixture. The prior assumption that `packages/runner/test/fixtures/` must be created is incorrect.
- Worker logic does not primarily live in `packages/runner/src/worker/game-worker.ts`; it lives in `packages/runner/src/worker/game-worker-api.ts`. `game-worker.ts` is a thin Comlink expose entrypoint.
- Most D6 scenarios are already covered in `packages/runner/test/worker/game-worker.test.ts` and `packages/runner/test/worker/clone-compat.test.ts`, but a subset remains untested (explicit init/reset variants and some positive-flow assertions).
- Runner tests execute in `environment: 'node'`. Full real-browser worker + Comlink e2e is out of scope for this ticket unless the test infra changes.

## Scope Decision

The updated scope is beneficial over the prior plan because it preserves the current clean architecture:
- Runtime behavior is validated where the logic lives (`game-worker-api.ts`).
- Bridge factory behavior stays isolated and deterministic in `game-bridge.test.ts`.
- No duplicate test suites for the same behavior.
- No premature browser-mode infra or brittle cross-environment coupling.

## What to Change

Expand existing worker tests to complete D6 coverage where missing.

### Test environment note
Primary path remains direct `createGameWorker()` tests in Node. Keep Comlink boundary coverage limited to existing bridge factory tests. Structured-clone behavior is already covered by WRKBRIDGE-004.

### Test categories and scenarios

#### Initialization
1. `init()` returns a valid GameState (already covered).
2. `init()` with explicit `playerCount` returns state with correct `state.playerCount` (add if missing).
3. `init()` with `enableTrace: false` disables trace by default for `applyMove()` (already covered).

#### Move enumeration
4. `legalMoves()` returns non-empty array for initial state (add explicit assertion if missing).
5. `enumerateLegalMoves()` returns `{ moves, warnings }` with correct shape (add explicit assertion if missing).
6. `enumerateLegalMoves()` supports budget options and deterministic truncation/warnings contract (add focused assertion if missing).

#### Move application
7. `applyMove()` returns `ApplyMoveResult` shape with `state`, `triggerFirings`, `warnings`, and `effectTrace` behavior (add explicit shape assertions if missing).
8. `applyMove()` with `{ trace: true }` includes `effectTrace` (already covered).
9. `applyMove()` with `{ trace: false }` omits `effectTrace` (already covered).
10. Multiple sequential `applyMove()` calls produce correct state progression (add explicit assertion if missing).

#### Choice system
11. `legalChoices()` returns expected `ChoiceRequest` variant for the current state (add explicit assertion if missing).

#### Batch execution
12. `playSequence()` success path returns one result per move (add if missing).
13. `playSequence()` callback receives correct indices (already partially covered; extend if needed).
14. `playSequence()` failure path preserves prior applied moves and consistent history (already covered).

#### Terminal
15. `terminalResult()` returns `null` for non-terminal state (add explicit assertion if missing).

#### State management
16. `getState()` equals the most recent state snapshot (add explicit assertion if missing).
17. `getMetadata()` returns expected metadata fields (already covered).
18. `getHistoryLength()` increments/decrements with apply/undo (already covered).

#### Undo
19. `undo()` restores the previous state (already covered).
20. `undo()` on initial state returns `null` (add if missing).

#### Reset
21. `reset()` clears history and reinitializes with same def (already covered).
22. `reset()` with new seed changes deterministic RNG state for the reinitialized game (add if missing).
23. `reset()` with new def uses new metadata/action surface (add if missing, with test fixture variant).
24. `reset()` with new `playerCount` applies new player count when valid for provided def (add if missing).

#### Error handling
25. Illegal move errors include `code: 'ILLEGAL_MOVE'` and non-empty `message` (already covered).
26. Pre-init guarded methods throw `NOT_INITIALIZED` (already covered).
27. Bridge-level `terminate()` behavior remains covered in `game-bridge.test.ts`; no new runtime assertions required in this ticket.

### Test fixture
- Reuse `packages/runner/test/worker/test-fixtures.ts`.
- Extend fixture helpers only if needed to test reset-with-new-def / playerCount variants.
- Keep fixtures deterministic and engine-agnostic.

## Files to Touch

- `packages/runner/test/worker/game-worker.test.ts` — extend D6 coverage for missing scenarios.
- `packages/runner/test/worker/test-fixtures.ts` — optional fixture variant(s) for reset/new-def/playerCount assertions.
- `packages/runner/test/worker/game-bridge.test.ts` — no required changes unless a gap is discovered in terminate/proxy coverage.

## Out of Scope

- Do NOT modify any engine code or kernel types.
- Do NOT modify worker/bridge runtime behavior unless a test exposes a real defect.
- Do NOT test React components or hooks (those are later specs).
- Do NOT test animation/effect trace consumption (that is Spec 40).
- Do NOT add Vitest browser-mode infrastructure in this ticket.

## Acceptance Criteria

### Tests that must pass
- D6 scenario coverage is complete across existing runner worker test files.
- `pnpm -F @ludoforge/runner test` passes.
- `pnpm -F @ludoforge/runner typecheck` passes.
- `pnpm -F @ludoforge/runner lint` passes.

### Invariants
- Tests use real kernel types from `@ludoforge/engine`.
- No engine source files are modified.
- Tests are deterministic — use fixed seeds for PRNG.
- Each test is independent (fresh `gameWorker` state per test, or per-test setup/teardown).
- Error assertions check both the `code` field and that `message` is a non-empty string.

## Outcome

- **Completion date**: 2026-02-17
- **What changed**:
  - Reassessed and corrected stale ticket assumptions (existing files, current worker-api architecture, and node-based test strategy).
  - Extended `packages/runner/test/worker/game-worker.test.ts` to close missing D6 scenarios:
    - explicit init player count
    - legal move/enumeration shape + budget truncation warning
    - applyMove result shape and sequential progression
    - legalChoices complete variant
    - playSequence success path + callback ordering
    - terminal null assertion
    - undo initial null
    - reset variants (new seed RNG-state change, new def surface, new player count)
  - Extended `packages/runner/test/worker/test-fixtures.ts` with additional fixture defs for reset/new-def/player-count scenarios.
- **Deviations from original plan**:
  - The original plan to create a new bridge integration test file was dropped because that file already existed and bridge wiring coverage was already present.
  - Real Worker+Comlink browser-mode integration was not added; current architecture keeps runtime coverage in direct worker-api tests under Node.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test` ✅
  - `pnpm -F @ludoforge/runner lint` ✅
  - `pnpm -F @ludoforge/runner typecheck` ✅
  - `pnpm turbo test` ✅
