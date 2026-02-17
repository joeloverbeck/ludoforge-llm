# REACTUI-019: Store Async Operation Serialization and Stale-Result Guard

**Status**: ✅ COMPLETED
**Spec**: 39 (React DOM UI Layer), 37 (State Management & Render Model), 36 (Worker Bridge)
**Priority**: P0
**Depends on**: REACTUI-004
**Estimated complexity**: M

---

## Summary

Harden `createGameStore` async behavior so overlapping async actions cannot commit stale state. Add operation/session sequencing to enforce deterministic state transitions under rapid user input and async worker timing.

---

## Reassessed Assumptions (2026-02-17)

- `packages/runner/src/store/game-store.ts` currently uses `runBridge()` with a global `loading` toggle and no operation/session staleness guard.
- There is no dedicated async serialization suite yet. Current coverage lives in `packages/runner/test/store/game-store.test.ts`.
- `cancelMove` is synchronous (local state reset only). Interleaving risk exists when earlier async operations resolve after local resets or newer async intents.
- `REACTUI-022` already plans a broad async interleaving regression suite. This ticket should establish the store-side guard architecture plus focused baseline regression tests; `REACTUI-022` can expand breadth later.

---

## What Needs to Change

### Store concurrency model

- Add explicit async operation control in `packages/runner/src/store/game-store.ts`:
  - Session epoch (increments on each `initGame` start and invalidates prior async commits).
  - Monotonic operation sequence/token for async actions.
  - Central commit guard utility that applies state only when `(epoch, opToken)` is current.
- Define a clear policy:
  - `initGame` invalidates all prior in-flight operations.
  - Non-init actions (`selectAction`, `chooseOne`, `chooseN`, `confirmMove`, `cancelChoice`, `undo`) must not apply results if superseded by newer operations or session reset.
- Keep store actions game-agnostic; no game-specific branches.

### Architecture guardrails

- Prefer one generic async-operation guard mechanism reused by all async store actions (avoid per-action ad hoc stale checks).
- No backwards-compat alias layer: stale operations are ignored by design and tests should lock this in.
- Keep worker contract unchanged (store orchestration change only).

### Lifecycle/loading semantics

- Preserve existing lifecycle transitions while adding serialization:
  - `initGame` still enters `initializing`, then `playing|terminal|idle`.
  - Allow `initializing -> initializing` for superseding/restarting `initGame` while a prior init is in-flight.
- Ensure `loading` reflects only the latest active operation context; stale operations finishing late must not clear loading/error for newer operations.

### Error semantics

- Late failures from stale operations must not overwrite current session error state.
- Current-session failures must still map to structured `WorkerError`.

---

## Out of Scope

- UI redesign.
- Worker-side scheduling primitives.
- Multiplayer/network sync.

---

## Acceptance Criteria

### Tests that should pass

- `packages/runner/test/store/game-store-async-serialization.test.ts` (new, focused guard coverage)
  - `initGame` called twice quickly: first completion cannot overwrite second.
  - stale `selectAction` resolution after `cancelMove` does not restore stale choice state.
  - stale `confirmMove` result after newer `initGame` does not mutate current session.
  - stale rejection does not overwrite current session error/lifecycle.
  - stale completion cannot incorrectly flip `loading` to false while newer op is pending.
- `packages/runner/test/store/game-store.test.ts`
  - Existing behavior tests continue to pass unchanged in meaning.

### Invariants

- Deterministic last-intent-wins behavior for overlapping async actions.
- No stale async result can mutate store state.
- `loading` reflects active current-session operation state only.
- No game-specific logic added to store orchestration.

---

## Outcome

- **Completion date**: 2026-02-17
- **What changed**:
  - Implemented centralized async operation guarding in `createGameStore` using session epoch + operation token + active operation kind.
  - Added stale-commit protection for all async store actions and stale-error suppression for superseded operations.
  - Added `cancelMove` invalidation for in-flight action operations so late results cannot restore canceled move state.
  - Added focused regression suite: `packages/runner/test/store/game-store-async-serialization.test.ts`.
  - Updated lifecycle matrix to allow `initializing -> initializing` for superseded `initGame` calls.
- **Deviations from original plan**:
  - Ticket assumptions were corrected first to reflect current repository state (missing async suite, current `runBridge` model, and lifecycle transition constraint).
  - Lifecycle transition update was added explicitly after reassessment showed double-init behavior was structurally blocked.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test` passed (273 tests).
  - `pnpm -F @ludoforge/runner lint` passed.
