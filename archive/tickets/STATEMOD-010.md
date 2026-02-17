# STATEMOD-010: Init Failure Must Reset Store Session State

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: M
**Spec**: 37 — State Management & Render Model
**Deps**: None

## Objective

Ensure `initGame()` failure cannot leave stale session data in store state. A failed initialization must leave the store in a clean, idle, non-renderable state with only structured error metadata preserved.

## Reassessed Assumptions (Current Code/Test Reality)

- `packages/runner/src/store/game-store.ts` sets `gameLifecycle: 'initializing'` and `loading: true` before invoking `bridge.init(...)`.
- On success, `initGame()` populates session state and derives `renderModel` correctly.
- Prior to this ticket, failure set only `{ error, gameLifecycle: 'idle' }`; stale session fields could remain and keep `renderModel` non-null.
- Existing tests covered lifecycle/loading/error capture but did not assert session reset semantics after failed re-init.

## Scope Update

This ticket changes store reset behavior and related tests only. It does not change engine kernel/worker contracts.

1. Update `initGame()` failure handling in `packages/runner/src/store/game-store.ts` to hard-reset all session-bound store fields to initial values while preserving normalized `WorkerError`.
2. Keep lifecycle/loading semantics explicit and deterministic:
- transition `idle -> initializing`
- on failure transition to `idle`
- ensure `loading` always returns to `false`.
3. Preserve structured error normalization through `toWorkerError(...)`.

## Architecture Decision

Adopt an explicit store-owned session reset path in `initGame()` failure handling (single source of truth for session teardown). This is preferred over partial patching because it prevents stale projections (`renderModel`) and stale context leaks, and is more extensible for future session-bound fields.

## Invariants That Must Pass

- After failed `initGame()`, store has `gameLifecycle === 'idle'`.
- After failed `initGame()`, `renderModel === null` and session-bound fields are reset (`gameDef`, `gameState`, `playerID`, `legalMoveResult`, `choicePending`, move-construction fields, `effectTrace`, `triggerFirings`, `terminal`, `playerSeats`).
- `error` remains a structured `WorkerError` from `toWorkerError(...)`.
- Store remains fully usable for a subsequent successful `initGame()` call.

## Tests That Must Pass

- Existing: `pnpm -F @ludoforge/runner test`
- Existing: `pnpm -F @ludoforge/runner lint`
- Existing: `pnpm -F @ludoforge/runner typecheck`
- New/updated tests in `packages/runner/test/store/game-store.test.ts`:
- failed `initGame()` after prior successful game clears stale state snapshot
- failed `initGame()` keeps structured `WorkerError` while clearing render/session fields
- retry `initGame()` after failure succeeds and rebuilds render model

## Outcome

- **Completion date**: 2026-02-17
- **What changed**:
- Added an explicit `resetSessionState()` helper in `packages/runner/src/store/game-store.ts` and used it in `initGame()` failure handling so failed init clears all session-bound fields before deriving render model.
- Refactored store mutation paths to use explicit transition builders (`buildInitSuccessState`, `buildInitFailureState`, `buildStateMutationState`) so init/mutation lifecycle semantics are centralized and extensible.
- Added three tests in `packages/runner/test/store/game-store.test.ts` covering stale-state clearing after failed re-init, structured error preservation with reset fields, and successful retry after failure.
- **Deviations from original plan**:
- Ticket was first corrected to reflect actual baseline coverage and failure behavior before implementation.
- **Verification**:
- `pnpm -F @ludoforge/runner test` passed.
- `pnpm -F @ludoforge/runner lint` passed.
- `pnpm -F @ludoforge/runner typecheck` passed.
