# WORKER-021: Make worker init/reset state updates transactional

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

`createGameWorker` assigns `def` and `runtime` before `initialState(...)` succeeds. If initialization throws, internal worker fields can be partially updated, reducing robustness and making failure recovery ambiguous.

## Assumption Reassessment (2026-02-25)

1. In `packages/runner/src/worker/game-worker-api.ts`, `initState` currently mutates `def`/`runtime` before computing initial state.
2. `reset` and `loadFromUrl` both reuse `initState`, so partial-mutation risk is shared.
3. Mismatch: no tests currently validate worker invariants after init failure; scope corrected to include failure-state tests.

## Architecture Check

1. Transactional local-first compute then commit is cleaner than eager mutation and prevents torn worker state.
2. This is purely lifecycle hardening and does not add game-specific logic; runtime/kernel remain generic.
3. No backwards-compatibility shims are introduced; behavior is tightened in place.

## What to Change

### 1. Refactor `initState` to commit atomically

Compute `nextRuntime`, `nextInit`, and next history/trace locals first; only assign `def`, `runtime`, `state`, `history`, and `enableTrace` after successful computation.

### 2. Add failure-path tests

Simulate initialization failure and verify worker remains in consistent pre-init or prior-init state.

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
2. `packages/runner/test/worker/game-worker.test.ts` — add reset/load failure consistency test.

### Commands

1. `pnpm -F @ludoforge/runner test -- test/worker/game-worker.test.ts`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner test`
