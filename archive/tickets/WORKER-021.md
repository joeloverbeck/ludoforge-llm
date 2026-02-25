# WORKER-021: Make worker init/reset state updates transactional

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

`createGameWorker` assigns `def` and `runtime` before `initialState(...)` succeeds. If initialization throws, internal worker fields can be partially updated, reducing robustness and making failure recovery ambiguous.

## Assumption Reassessment (2026-02-25)

1. In `packages/runner/src/worker/game-worker-api.ts`, `initState` still mutates `def`/`runtime` before `initialState(...)` succeeds.
2. `reset` and `loadFromUrl` both delegate to `initState`, so the same partial-mutation risk exists on those paths.
3. `init` wraps failures with `INTERNAL_ERROR`, but `reset` currently does not use the same mapping wrapper; this creates inconsistent error semantics for equivalent initialization failures.
4. Mismatch: no tests currently validate worker invariants after initialization failure; scope corrected to include failure-state tests and error-shape parity assertions.

## Architecture Check

1. Transactional local-first compute then commit is cleaner than eager mutation and prevents torn worker state.
2. This is purely lifecycle hardening and does not add game-specific logic; runtime/kernel remain generic.
3. No backwards-compatibility shims are introduced; behavior is tightened in place.

## What to Change

### 1. Refactor `initState` to commit atomically

Compute `nextRuntime`, `nextInit`, and next history/trace locals first; only assign `def`, `runtime`, `state`, `history`, and `enableTrace` after successful computation.

### 2. Align `reset` failure semantics with `init`

Run `reset` initialization through `withInternalErrorMapping` so initialization failures map to `INTERNAL_ERROR` consistently.

### 3. Add failure-path tests

Simulate initialization failure and verify worker remains in consistent pre-init or prior-init state, plus `reset` error-shape parity with `init`.

## Files to Touch

- `packages/runner/src/worker/game-worker-api.ts` (modify)
- `packages/runner/test/worker/game-worker.test.ts` (modify)

## Out of Scope

- Changing operation-stamp semantics.
- Altering engine-side `initialState` behavior.

## Acceptance Criteria

### Tests That Must Pass

1. Failed init does not leave partially updated worker state.
2. Failed reset/load init path preserves prior valid state (or deterministic not-initialized state).
3. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Worker internal state transitions are atomic across init/reset/load paths.
2. Worker API remains game-agnostic and contract-compatible with store orchestration.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/worker/game-worker.test.ts` — add init-failure atomicity test.
2. `packages/runner/test/worker/game-worker.test.ts` — add reset/load failure consistency and `INTERNAL_ERROR` parity test.

### Commands

1. `pnpm -F @ludoforge/runner test -- test/worker/game-worker.test.ts`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner test`

## Outcome

- **Completion date**: 2026-02-25
- **What changed**:
  - Updated `initState` in the worker to use compute-then-commit initialization, preventing partial field mutation when initialization fails.
  - Updated `reset` to use `withInternalErrorMapping`, aligning init/reset failure semantics.
  - Added failure-path regression tests covering init failure atomicity, reset failure atomicity, and load-from-URL initialization failure atomicity.
- **Deviation from original plan**:
  - Expanded scope to include reset error-shape parity (`INTERNAL_ERROR`) after reassessment uncovered inconsistency with `init`.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test -- test/worker/game-worker.test.ts` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
