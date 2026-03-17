# 62MCTSSEAVIS-022: aiThinking Zustand Store Slice

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner only
**Deps**: 62MCTSSEAVIS-021

## Problem

The runner store needs an `aiThinking` state slice to hold MCTS search progress data for the AITurnOverlay dashboard. The bridge must listen for `mctsProgress` and `mctsSearchComplete` messages and update the store.

## What to Change

### 1. Define AiThinkingState interface

```typescript
interface AiThinkingState {
  readonly isThinking: boolean;
  readonly progress: number;           // 0-1
  readonly iteration: number;
  readonly totalIterations: number;
  readonly iterationsPerSec: number;
  readonly elapsedMs: number;
  readonly topActions: readonly {
    actionId: string;
    displayName: string;
    visits: number;
    pct: number;
  }[];
  readonly treeDepth: number;
  readonly nodesAllocated: number;
}
```

### 2. Add slice to Zustand store

Add `aiThinking` slice with:
- `setMctsProgress(snapshot)` — updates from `mctsProgress` messages
- `setMctsComplete()` — resets `isThinking` to false
- `startAiThinking()` — sets `isThinking` to true, resets fields

### 3. Bridge listener

In the game bridge, listen for `mctsProgress` and `mctsSearchComplete` raw `postMessage` events. Map `actionId` to `displayName` using GameDef metadata. Update store.

## Files to Touch

- `packages/runner/src/store/store-types.ts` (modify — add AiThinkingState)
- `packages/runner/src/store/game-store.ts` (modify — add aiThinking slice)
- `packages/runner/src/bridge/game-bridge.ts` or equivalent (modify — add message listener)

## Out of Scope

- AITurnOverlay UI (62MCTSSEAVIS-024)
- Action display name utility (62MCTSSEAVIS-023)
- Worker-side changes (already in 62MCTSSEAVIS-021)
- Non-MCTS AI progress

## Acceptance Criteria

### Tests That Must Pass

1. Unit test: `startAiThinking()` sets `isThinking: true` and resets all fields
2. Unit test: `setMctsProgress()` updates progress, iteration, topActions, etc.
3. Unit test: `setMctsComplete()` sets `isThinking: false`
4. Unit test: `progress` is calculated as `iteration / totalIterations` (clamped 0-1)
5. Unit test: bridge listener processes `mctsProgress` messages correctly
6. Unit test: bridge ignores non-MCTS messages
7. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Store updates are immutable (new objects, no mutation)
2. `aiThinking` slice is independent — no coupling to game state slice
3. Existing store slices unchanged
4. Bridge listener does not interfere with Comlink RPC

## Test Plan

### New/Modified Tests

1. `packages/runner/test/store/ai-thinking.test.ts` — slice CRUD operations
2. `packages/runner/test/bridge/mcts-bridge.test.ts` — message listener

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm turbo build && pnpm turbo typecheck`
