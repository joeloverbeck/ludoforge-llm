# REACTUI-020: Explicit Worker Bridge Contract (No ReturnType Coupling)

**Status**: ✅ COMPLETED
**Spec**: 36 (Worker Bridge), 37 (State Management)
**Priority**: P1
**Depends on**: REACTUI-004
**Estimated complexity**: S

---

## Summary

Replace inferred bridge typing (`ReturnType<typeof createGameWorker>`) with an explicit `GameWorkerAPI` interface shared by worker implementation, bridge wrapper, and store consumer.

---

## What Needs to Change

- In `packages/runner/src/worker/game-worker-api.ts`:
  - Define/export explicit `interface GameWorkerAPI` with async method signatures.
  - Make `createGameWorker()` return `GameWorkerAPI`.
  - Remove `type GameWorkerAPI = ReturnType<typeof createGameWorker>`.
- In `packages/runner/src/worker/game-worker.ts` and `packages/runner/src/bridge/game-bridge.ts`:
  - Consume the explicit interface only.
- In tests using stubs/mocks:
  - Update typings to conform to explicit interface.

---

## Out of Scope

- API behavior changes.
- New worker methods.

---

## Acceptance Criteria

### Tests that should pass

- `packages/runner/test/worker/game-worker.test.ts`
- `packages/runner/test/worker/game-bridge.test.ts`
- `packages/runner/test/store/game-store.test.ts`
- `packages/runner/test/ui/App.test.ts`

### Invariants

- Single authoritative worker contract definition.
- No consumer depends on implementation-inferred API shape.
- Async signatures remain consistent across worker, bridge, store, and tests.

---

## Outcome

- **Completion date**: 2026-02-17
- **What was actually changed**:
  - Added explicit `GameWorkerAPI` interface in `packages/runner/src/worker/game-worker-api.ts`.
  - Updated `createGameWorker()` to return `GameWorkerAPI`.
  - Removed inferred contract alias (`ReturnType<typeof createGameWorker>`).
  - Updated `packages/runner/src/bridge/game-bridge.ts` and `packages/runner/src/worker/game-worker.ts` to consume/re-export the explicit interface directly.
- **Deviations from original plan**:
  - No functional deviations; implementation matched planned scope as a typing-contract refactor.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
