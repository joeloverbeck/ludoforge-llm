# 62MCTSSEAVIS-003: Wire Visitor into Search Loop

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — agents/mcts/search.ts
**Deps**: 62MCTSSEAVIS-001, 62MCTSSEAVIS-002

## Problem

The search loop (`runSearch()` / `runOneIteration()`) has no visitor emission points. This ticket adds `searchStart`, `iterationBatch`, and `searchComplete` event emissions — the three lifecycle events that bracket every search.

## What to Change

### 1. Emit `searchStart` at beginning of `runSearch()`

After computing legal moves and pool capacity, emit:
```typescript
if (config.visitor?.onEvent) {
  config.visitor.onEvent({
    type: 'searchStart',
    totalIterations: config.iterations,
    legalMoveCount: legalMoves.length,
    concreteCount, templateCount,
    poolCapacity,
  });
}
```

### 2. Accumulate iteration data, emit `iterationBatch` every 50 iterations

Track `fromIteration`, root child count, nodes allocated, elapsed time. Every 50 iterations (or at search end), emit batch event with top children sorted by visits.

### 3. Emit `searchComplete` at end of search

Map `rootStopReason` from diagnostics to `stopReason` field. Include best action and visit count.

### 4. Guard all emissions with `if (config.visitor?.onEvent)`

Single conditional check — zero overhead when no visitor.

## Files to Touch

- `packages/engine/src/agents/mcts/search.ts` (modify)

## Out of Scope

- Expansion/materialization visitor events (62MCTSSEAVIS-004)
- Decision node events (62MCTSSEAVIS-010)
- `rootCandidates` event (62MCTSSEAVIS-013)
- CiDiagnosticsReporter (62MCTSSEAVIS-005)
- Any changes to search algorithm logic — only add observer emissions

## Acceptance Criteria

### Tests That Must Pass

1. Unit test: search with visitor collects exactly 1 `searchStart` event
2. Unit test: search with 200 iterations emits `iterationBatch` events every 50 iterations (4 batches)
3. Unit test: `iterationBatch.topChildren` is sorted by visits descending
4. Unit test: search emits exactly 1 `searchComplete` event with correct `stopReason`
5. Unit test: search without visitor (`visitor: undefined`) runs identically — no errors, no events
6. Unit test: `searchComplete.bestActionId` matches the actual selected move
7. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Visitor emissions are non-blocking (synchronous, no await)
2. Search behavior is identical with or without visitor (no conditional logic changes)
3. `iterationBatch` events cover all iterations (no gaps between `fromIteration`/`toIteration`)
4. `searchComplete.stopReason` matches `MctsSearchDiagnostics.rootStopReason` vocabulary exactly

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/mcts/search-visitor.test.ts` — visitor emission tests with mock visitor

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-path-pattern search`
2. `pnpm turbo build && pnpm turbo typecheck`

## Outcome

- **Completion date**: 2026-03-16
- **What changed**:
  - `packages/engine/src/agents/mcts/search.ts` — added `searchStart`, `iterationBatch` (every 50 iterations), and `searchComplete` visitor emissions to `runSearch()`, guarded by `if (onEvent !== undefined)`. Added `getTopChildren()` helper. Pool wrapper tracks `nodesAllocated` without modifying `NodePool` interface.
  - `packages/engine/test/unit/agents/mcts/search-visitor.test.ts` — 16 tests across 5 suites covering all acceptance criteria.
- **Deviations from original plan**: None. Only `search.ts` was modified as specified. Pool allocation tracking done via an inline wrapper object rather than modifying `node-pool.ts`.
- **Verification results**: All 16 new tests pass. All 12 existing search tests pass (no regressions). `pnpm turbo build && pnpm turbo typecheck` clean.
