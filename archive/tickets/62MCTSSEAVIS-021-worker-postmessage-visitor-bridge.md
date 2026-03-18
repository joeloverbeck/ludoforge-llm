# 62MCTSSEAVIS-021: Worker postMessage Visitor Bridge

**Status**: NOT IMPLEMENTED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner only
**Deps**: 62MCTSSEAVIS-003

## Problem

The worker needs to forward MCTS search progress to the main thread for the AITurnOverlay dashboard. The visitor runs inside the Web Worker; Comlink doesn't support streaming callbacks for an in-progress RPC. Raw `postMessage` provides a reliable side channel.

## What to Change

### 1. Create visitor in `createGameWorker().requestAgentMove()`

Inside the worker's `requestAgentMove` handler:
- Create a `MctsSearchVisitor` that buffers events into local accumulators
- Set up `setInterval(250)` (4 Hz) to dispatch `MctsProgressSnapshot` via `self.postMessage()`
- Clear interval on search completion
- Forward `searchComplete` immediately (not batched)

### 2. Define MctsProgressSnapshot type

```typescript
interface MctsProgressSnapshot {
  readonly type: 'mctsProgress';
  readonly iteration: number;
  readonly totalIterations: number;
  readonly elapsedMs: number;
  readonly iterationsPerSec: number;
  readonly topActions: readonly { actionId: string; visits: number; pct: number }[];
  readonly treeDepth: number;
  readonly nodesAllocated: number;
  readonly decisionDepthMax: number;
}
```

### 3. Use Option A (raw postMessage alongside Comlink)

The `requestAgentMove()` call remains a Comlink RPC returning the final result. Thinking events flow through a separate raw `postMessage` channel.

## Files to Touch

- `packages/runner/src/worker/game-worker-api.ts` (modify)
- `packages/runner/src/worker/types.ts` or equivalent (modify — add MctsProgressSnapshot type)

## Out of Scope

- Store integration (62MCTSSEAVIS-022)
- AITurnOverlay UI (62MCTSSEAVIS-024)
- Engine-side visitor changes
- Non-MCTS agent types

## Acceptance Criteria

### Tests That Must Pass

1. Unit test: visitor accumulates events and dispatches snapshot at 250ms intervals
2. Unit test: `MctsProgressSnapshot` contains correct fields
3. Unit test: interval is cleared on search completion
4. Unit test: `searchComplete` event is forwarded immediately (not batched)
5. Unit test: non-MCTS agent moves do not emit progress messages
6. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. `requestAgentMove()` Comlink RPC contract unchanged — still returns final Move
2. Progress messages flow through raw `postMessage`, not Comlink
3. 4 Hz throttling regardless of search speed
4. No flooding of main thread

## Test Plan

### New/Modified Tests

1. `packages/runner/test/worker/mcts-progress.test.ts` — snapshot dispatch, throttling, cleanup

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm turbo build && pnpm turbo typecheck`

## Archival Note

Archived on 2026-03-18 as part of the MCTS retirement cleanup. This work item remained unfinished and was removed from the active planning surface so the repository no longer presents MCTS as current architecture.
