# ACTTOOSYS-004: Worker API — describeAction Method

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: ACTTOOSYS-003

## Problem

The runner needs to call the engine's `describeAction` from the main thread, but the engine runs in a Web Worker. The `GameWorkerAPI` interface must be extended with a `describeAction` method that the main thread can call via Comlink, receiving a serializable `AnnotatedActionDescription`.

## Assumption Reassessment (2026-02-27)

1. `GameWorkerAPI` interface is defined in `packages/runner/src/worker/game-worker-api.ts:76-104`. It currently has 14 methods (init, legalMoves, enumerateLegalMoves, legalChoices, applyMove, applyTemplateMove, playSequence, terminalResult, getState, getMetadata, getHistoryLength, undo, reset, loadFromUrl). Confirmed.
2. Worker closure variables include `def`, `state`, `runtime`, `history`, `enableTrace`, `latestMutationStamp`. The `runtime` is cached: `runtime ??= createGameDefRuntime(nextDef)` in `initState()`. Confirmed.
3. `assertInitialized(def, state)` returns `{ def, state }` or throws `WorkerError('NOT_INITIALIZED')`. Confirmed.
4. `withInternalErrorMapping<T>(run: () => T): T` catches errors and wraps them as `WorkerError('INTERNAL_ERROR')`. Confirmed — suitable for read-only operations.
5. `describeAction` from engine is exported from `@ludoforge/engine/runtime` (after ACTTOOSYS-003). It requires `ActionDef` and `AnnotationContext { def, state, activePlayer, runtime }`.
6. `AnnotatedActionDescription` type is exported from `@ludoforge/engine/runtime` (after ACTTOOSYS-001).
7. Actions are identified by `ActionId` (string brand). `ActionDef.id` is of type `ActionId`. Worker receives `actionId: string` and must find the matching `ActionDef` in `def.actions`.

## Architecture Check

1. Read-only operation: `describeAction` does not modify `state`, does not need `ensureFreshMutation`, does not need `OperationStamp`. This matches the pattern of `getState()`, `getMetadata()`, `terminalResult()`.
2. Returns `null` for unknown action IDs — defensive, does not throw.
3. Reuses the existing cached `runtime` variable. If `runtime` is null (shouldn't happen if game is initialized, but defensively), constructs it via `createGameDefRuntime`.
4. No new dependencies — uses only existing imports plus the new engine exports.

## What to Change

### 1. Extend `GameWorkerAPI` interface

In `packages/runner/src/worker/game-worker-api.ts`, add to the interface:

```typescript
describeAction(actionId: string): Promise<AnnotatedActionDescription | null>;
```

### 2. Implement in `createGameWorker()`

Inside the returned object literal in `createGameWorker()`, add:

```typescript
async describeAction(actionId: string): Promise<AnnotatedActionDescription | null> {
  return withInternalErrorMapping(() => {
    const current = assertInitialized(def, state);
    const actionDef = current.def.actions.find(a => String(a.id) === actionId);
    if (!actionDef) return null;
    const currentRuntime = runtime ?? createGameDefRuntime(current.def);
    return engineDescribeAction(actionDef, {
      def: current.def,
      state: current.state,
      activePlayer: current.state.activePlayer,
      runtime: currentRuntime,
    });
  });
},
```

Import `describeAction as engineDescribeAction` and `AnnotatedActionDescription` from `@ludoforge/engine/runtime`. Also import `createGameDefRuntime` if not already imported.

### 3. Add import for `AnnotatedActionDescription`

Add to the existing engine imports at the top of the file. `createGameDefRuntime` may already be imported — verify and add if missing.

## Files to Touch

- `packages/runner/src/worker/game-worker-api.ts` (modify)

## Out of Scope

- Bridge layer changes (ACTTOOSYS-005)
- UI hook or component code
- Modifying any existing worker methods
- Adding mutation guards or operation stamps (this is read-only)
- Handling Comlink serialization explicitly (Comlink handles structured clone automatically for plain objects)

## Acceptance Criteria

### Tests That Must Pass

1. **Valid action ID**: Calling `describeAction('some-valid-id')` on an initialized worker returns an `AnnotatedActionDescription` with non-empty `sections`.
2. **Unknown action ID**: Calling `describeAction('nonexistent')` returns `null`.
3. **Uninitialized worker**: Calling `describeAction` before `init()` throws a `WorkerError` with code `'NOT_INITIALIZED'`.
4. **Type-check**: `pnpm -F @ludoforge/runner typecheck` passes — the new method signature is type-safe.
5. Existing suite: `pnpm -F @ludoforge/runner test` — no regressions in existing worker tests.

### Invariants

1. `describeAction` is read-only — it does not modify `state`, `def`, `runtime`, `history`, or `latestMutationStamp`.
2. `describeAction` does not require an `OperationStamp`.
3. The return value is structured-clone-safe (guaranteed by `AnnotatedActionDescription` design in ACTTOOSYS-001).
4. No new worker closure variables introduced.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/worker/game-worker-api.test.ts` (modify) — add test cases for `describeAction`: valid ID, unknown ID, uninitialized state. Use the existing test pattern of initializing the worker with a minimal GameDef fixture.

### Commands

1. `pnpm -F @ludoforge/runner typecheck`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm turbo build`
