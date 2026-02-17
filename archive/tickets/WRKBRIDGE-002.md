# WRKBRIDGE-002: Implement GameWorker Entry Point (D1 + D5)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: M
**Spec**: 36, Deliverables D1 (Worker Entry Point) + D5 (Error Propagation)
**Deps**: `comlink` dependency is already present in `packages/runner/package.json`

## Problem

The runner currently has no Web Worker bridge implementation. Spec 36 requires a typed worker API that wraps kernel execution and keeps mutable game state inside the worker boundary.

## Assumption Reassessment

1. **Original assumption**: one file (`game-worker.ts`) can hold all worker logic and be directly tested.
   - **Observed discrepancy**: module-level `expose(...)` side effects make Node/Vitest unit testing brittle (worker globals are not always present in `environment: 'node'`).
   - **Correction**: split into a pure API module + thin worker entrypoint.

2. **Original assumption**: tests are out of scope for this ticket.
   - **Observed discrepancy**: this leaves core invariants (error mapping, history consistency, trace behavior) unverified and conflicts with hard-test expectations.
   - **Correction**: include targeted worker API tests in this ticket.

3. **Original assumption**: D5 only needs `applyMove()` error mapping.
   - **Observed discrepancy**: unwrapped throws from other worker methods would leak non-structured errors.
   - **Correction**: all public methods must emit structured-clone-safe `WorkerError` values.

## Architectural Decision (updated scope)

Implement a two-layer worker architecture:

1. `packages/runner/src/worker/game-worker-api.ts`
   - Contains `createGameWorker()` and all stateful logic.
   - Exports `GameWorkerAPI`, `WorkerError`, `GameMetadata`, `BridgeInitOptions`.
   - No worker-global side effects.

2. `packages/runner/src/worker/game-worker.ts`
   - Thin runtime entrypoint only.
   - Instantiates API object and calls `expose(...)`.

This is more robust and extensible than a single side-effect-heavy module:
- deterministic unit testing in Node,
- cleaner separation of concerns,
- easier future evolution (`loadFromUrl`, additional bridge methods) without runtime coupling.

## What to Change

1. Implement worker API logic in `game-worker-api.ts`:
   - Internal `_def`, `_state`, `_history`, `_enableTrace` state.
   - Methods:
     - `init`
     - `legalMoves`
     - `enumerateLegalMoves`
     - `legalChoices`
     - `applyMove`
     - `playSequence`
     - `terminalResult`
     - `getState`
     - `getMetadata`
     - `getHistoryLength`
     - `undo`
     - `reset`

2. Implement structured error mapping (`WorkerError`):
   - Codes: `ILLEGAL_MOVE`, `VALIDATION_FAILED`, `NOT_INITIALIZED`, `INTERNAL_ERROR`.
   - `assertInitialized` failures -> `NOT_INITIALIZED`.
   - move execution legality failures (`applyMove`, `playSequence`) -> `ILLEGAL_MOVE`.
   - unexpected failures -> `INTERNAL_ERROR`.
   - errors must remain plain object values (structured-clone safe).

3. Implement worker entrypoint in `game-worker.ts`:
   - Construct worker via `createGameWorker()`.
   - `expose(gameWorker)` at module level.

4. Add tests (now in scope):
   - `packages/runner/test/worker/game-worker.test.ts`.
   - Cover invariants:
     - not-initialized guard,
     - trace default + per-call override,
     - history increment/decrement,
     - `applyMove` rollback on illegal move,
     - `playSequence` partial-apply semantics and failure behavior,
     - `reset` and `undo` semantics,
     - `getMetadata` shape correctness.

## Files to Touch

- `packages/runner/src/worker/game-worker-api.ts` — **NEW FILE**
- `packages/runner/src/worker/game-worker.ts` — **NEW FILE**
- `packages/runner/test/worker/game-worker.test.ts` — **NEW FILE**

## Out of Scope

- No engine/kernel source changes.
- No main-thread bridge factory implementation (`WRKBRIDGE-003`).
- No URL loading (`WRKBRIDGE-005`).
- No Comlink browser integration tests (`WRKBRIDGE-006`).

## Acceptance Criteria

### Checks that must pass
- `pnpm -F @ludoforge/runner test`
- `pnpm -F @ludoforge/runner typecheck`
- `pnpm -F @ludoforge/runner lint`
- `pnpm turbo build`

### Invariants
- Kernel imports come from `@ludoforge/engine` only.
- `WorkerError`, `GameMetadata`, `BridgeInitOptions` are plain interfaces.
- `GameWorkerAPI` exported as a type.
- `game-worker.ts` remains a thin Comlink entrypoint with `expose(...)`.
- Worker state consistency: failed move applications do not leave extra history entries.
- No engine source files modified.

## Outcome

- **Completion date**: 2026-02-17
- **What changed**:
  - Implemented worker logic in `packages/runner/src/worker/game-worker-api.ts` via `createGameWorker()`.
  - Added Comlink entrypoint in `packages/runner/src/worker/game-worker.ts` with `expose(gameWorker)`.
  - Added worker invariants test suite in `packages/runner/test/worker/game-worker.test.ts`.
  - Preserved engine-agnostic boundary: all runtime logic consumes shared kernel APIs from `@ludoforge/engine`.
- **Deviations from original ticket draft**:
  - Updated architecture from single-file worker implementation to a split API/entrypoint design for testability and long-term maintainability.
  - Expanded scope to include targeted tests (original draft marked tests out of scope).
- **Verification**:
  - Passed `pnpm -F @ludoforge/runner test`.
  - Passed `pnpm -F @ludoforge/runner typecheck`.
  - Passed `pnpm -F @ludoforge/runner lint`.
  - Passed `pnpm turbo build`.
