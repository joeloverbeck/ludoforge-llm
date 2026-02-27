# RUNBRIDGEFATAL-001: Replay Runtime Fatal Worker Error Parity

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: none

## Problem

Bridge fatal worker error propagation was added for active game runtime, but replay runtime still does not subscribe to `bridgeHandle.onFatalError`. Worker startup/message-channel failures in replay mode can therefore fail silently or degrade UX consistency.

## Assumption Reassessment (2026-02-27)

1. Assumption checked: both active and replay runtime surfaces handle bridge fatal errors consistently.
2. Current code check: `useActiveGameRuntime` wires `onFatalError`; `useReplayRuntime` does not.
3. Mismatch: replay path lacks the new failure channel. Scope correction: add equivalent subscription/cleanup in replay runtime and tests.

## Architecture Check

1. Cleaner than leaving mode-specific behavior divergence because bridge lifecycle concerns should be uniformly handled at runtime boundaries.
2. Preserves boundary: this is runner orchestration only; no game data/model logic change.
3. No backwards-compatibility shims; this is direct parity with current active runtime contract.

## What to Change

### 1. Subscribe replay runtime to bridge fatal errors

In `useReplayRuntime`, register `bridgeHandle.onFatalError` and route to `store.reportBootstrapFailure`.

### 2. Ensure teardown detaches listener

Ensure cleanup detaches listener before bridge termination to prevent stale callbacks.

### 3. Add replay fatal error tests

Add/extend session tests to cover worker startup/message-channel failure reporting for replay flow.

## Files to Touch

- `packages/runner/src/session/replay-runtime.ts` (modify)
- `packages/runner/test/session/replay-runtime.test.tsx` (modify)
- `packages/runner/test/worker/game-bridge.test.ts` (modify if additional assertions are needed)

## Out of Scope

- Changes to engine kernel behavior.
- Broader session state redesign.

## Acceptance Criteria

### Tests That Must Pass

1. Replay runtime reports bootstrap failure when bridge fatal listener fires.
2. Replay runtime detaches fatal listener on unmount/teardown.
3. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Active and replay runtime fatal error handling semantics remain aligned.
2. No game-specific logic leaks into bridge/runtime infrastructure.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/session/replay-runtime.test.tsx` — fatal worker error subscription + cleanup assertions.
2. `packages/runner/test/worker/game-bridge.test.ts` — listener behavior parity checks where relevant.

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm turbo test`

## Outcome

**Completed**: 2026-02-27

**What changed**:
- `packages/runner/src/session/replay-runtime.ts`: Added `bridgeHandle.onFatalError` subscription (mirroring active-game-runtime.ts pattern) and `detachFatalErrorListener()` call in cleanup.
- `packages/runner/test/session/replay-runtime.test.tsx`: Added `onFatalError` mock to bridge handle, added two new tests: fatal error subscription during replay and detach on teardown.

**Deviations**: None. Implementation matched the ticket plan exactly.
