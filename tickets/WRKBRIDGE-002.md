# WRKBRIDGE-002: Implement GameWorker Entry Point (D1 + D5)

**Status**: PENDING
**Priority**: HIGH
**Effort**: S
**Spec**: 36, Deliverables D1 (Worker Entry Point) + D5 (Error Propagation)
**Deps**: WRKBRIDGE-001 (comlink installed)

## Problem

The runner needs a Web Worker entry point that wraps the kernel's public API (initialState, legalMoves, enumerateLegalMoves, legalChoices, applyMove, terminalResult) via Comlink. The worker owns all mutable game state — the main thread never holds GameState directly.

## What to Change

Create `packages/runner/src/worker/game-worker.ts` implementing the `GameWorkerAPI` as specified in Spec 36 D1. This file:

1. Imports kernel functions and types from `@ludoforge/engine` (never redefines them locally).
2. Maintains internal `_def`, `_state`, `_history[]`, `_enableTrace` fields.
3. Exposes methods: `init`, `legalMoves`, `enumerateLegalMoves`, `legalChoices`, `applyMove`, `playSequence`, `terminalResult`, `getState`, `getMetadata`, `getHistoryLength`, `undo`, `reset`.
4. Defines and uses `WorkerError` interface (structured-clone safe) with codes: `ILLEGAL_MOVE`, `VALIDATION_FAILED`, `NOT_INITIALIZED`, `INTERNAL_ERROR`.
5. Defines `GameMetadata` interface (readonly fields: gameId, playerCount, phaseNames, actionNames, zoneNames).
6. Defines `BridgeInitOptions` interface (playerCount?, enableTrace?).
7. Uses `assertInitialized` guard that throws `NOT_INITIALIZED` WorkerError.
8. Uses `toWorkerError` factory for consistent error serialization.
9. Calls `expose(gameWorker)` at module level.
10. Exports `GameWorkerAPI` type for use by the bridge.

### Error code mapping (D5)
- Kernel `applyMove` throws → catch and re-throw as `ILLEGAL_MOVE` WorkerError.
- `assertInitialized` failure → `NOT_INITIALIZED`.
- Future: GameDef validation failure → `VALIDATION_FAILED` (not wired yet — that's D4 in WRKBRIDGE-005).

### Key implementation details
- On `applyMove` failure, roll back the `_history.push()` to keep state consistent.
- `playSequence` iterates moves, pushing history for each, rolling back on failure.
- `_enableTrace` defaults to `true` (animation system needs traces). Per-call `{ trace: false }` overrides.
- `getMetadata()` extracts lightweight info from `_def` and `_state` — no heavy objects.

## Files to Touch

- `packages/runner/src/worker/game-worker.ts` — **NEW FILE**

## Out of Scope

- Do NOT modify any engine code.
- Do NOT create the main-thread bridge (`game-bridge.ts`) — that is WRKBRIDGE-003.
- Do NOT implement URL-based GameDef loading (D4) — that is WRKBRIDGE-005.
- Do NOT write tests — that is WRKBRIDGE-004 and WRKBRIDGE-006.
- Do NOT modify `vite.config.ts` (Vite handles `new Worker(new URL(...))` natively).

## Acceptance Criteria

### Tests that must pass
- `pnpm -F @ludoforge/runner typecheck` passes (the new file compiles without errors).
- `pnpm turbo build` succeeds (runner build includes the worker file).

### Invariants
- All kernel imports use `@ludoforge/engine` — no local type redefinitions.
- `WorkerError`, `GameMetadata`, `BridgeInitOptions` are plain object interfaces (no classes, no methods — structured-clone safe).
- `GameWorkerAPI` is exported as a type (not a class).
- The file ends with `expose(gameWorker)` — Comlink wiring.
- No kernel source files are modified.
