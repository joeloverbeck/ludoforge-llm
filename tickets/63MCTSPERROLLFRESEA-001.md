# 63MCTSPERROLLFRESEA-001: Mutable diagnostics accumulator + per-phase timing + kernel-call counters

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `agents/mcts/diagnostics.ts`, `agents/mcts/search.ts`, `agents/mcts/rollout.ts`
**Deps**: None (first ticket in dependency chain)

## Problem

Current `MctsSearchDiagnostics` only records `iterations`, `nodesAllocated`, `maxTreeDepth`, `rootChildVisits`, and `totalTimeMs`. Per-phase timings and kernel-call counts are missing, making it impossible to identify which MCTS phase is the actual bottleneck or measure the impact of subsequent optimizations.

Diagnostics are collected post-hoc by `collectDiagnostics()` walking the tree. The new counters (per-phase timings, kernel-call counts, cache hit/miss) must be collected **during** the hot loop, which requires a mutable accumulator threaded through `runOneIteration()`.

## Assumption Reassessment (2026-03-14)

1. `MctsSearchDiagnostics` currently has 5 fields (`iterations`, `nodesAllocated`, `maxTreeDepth`, `rootChildVisits`, `totalTimeMs`) — confirmed via codebase exploration.
2. `collectDiagnostics()` runs post-hoc via iterative BFS — confirmed.
3. `diagnostics.ts` uses `Date.now()` for `totalTimeMs` — spec requires migration to `performance.now()`.
4. `config.diagnostics?: boolean` already exists and gates diagnostic collection — confirmed.

## Architecture Check

1. A mutable accumulator is the correct pattern here: the hot loop runs thousands of iterations, and immutable snapshots per iteration would be prohibitively expensive. This follows the existing MCTS convention where `MctsNode` statistics are mutable.
2. No game-specific logic introduced — purely engine-internal instrumentation.
3. No backwards-compatibility shims needed. `MctsSearchDiagnostics` is extended with optional fields only.

## What to Change

### 1. Create `MutableDiagnosticsAccumulator` type in `diagnostics.ts`

Add a mutable accumulator interface with:
- Per-phase timing fields: `selectionTimeMs`, `expansionTimeMs`, `simulationTimeMs`, `evaluationTimeMs`, `backpropTimeMs`, `beliefSamplingTimeMs`
- Kernel-call counters: `legalMovesCalls`, `materializeCalls`, `applyMoveCalls`, `terminalCalls`, `evaluateStateCalls`
- Cache counters (zeroed here, wired in 63MCTSPERROLLFRESEA-004): `stateCacheLookups`, `stateCacheHits`, `terminalCacheHits`, `legalMovesCacheHits`, `rewardCacheHits`
- Compressed-ply counters: `forcedMovePlies`, `hybridRolloutPlies`
- Aggregation arrays: `leafRewardSpans`, `selectionDepths`

Add a `createAccumulator()` factory function.

### 2. Extend `MctsSearchDiagnostics` interface

Add all new optional fields from spec section 7:
- Per-phase timings (6 fields)
- Kernel-call counters (5 fields)
- Cache counters (5 fields)
- Compressed-ply counters (2 fields)
- Derived averages: `avgSelectionDepth`, `avgLeafRewardSpan`
- Mode/stop metadata: `rolloutMode`, `rootStopReason`

### 3. Migrate `Date.now()` to `performance.now()`

Replace `Date.now()` usage in `diagnostics.ts` and `search.ts` with `performance.now()`. This changes `totalTimeMs` from integer to float — test assertions must use approximate comparison.

### 4. Wire accumulator through `search.ts`

- Create the accumulator at the start of `runSearch()` when `config.diagnostics === true`.
- Pass it to `runOneIteration()`.
- Wrap selection, expansion, simulation, evaluation, and backpropagation phases with `performance.now()` timing.
- Increment kernel-call counters at call sites for `legalMoves()`, `materializeConcreteCandidates()`, `applyMove()`, `terminalResult()`, `evaluateForAllPlayers()`.
- Merge the accumulator into the final `MctsSearchDiagnostics` in `collectDiagnostics()`.

### 5. Wire accumulator through `rollout.ts`

- Pass the accumulator to `rollout()`.
- Increment `applyMoveCalls` and `terminalCalls` inside the rollout loop.

## Files to Touch

- `packages/engine/src/agents/mcts/diagnostics.ts` (modify)
- `packages/engine/src/agents/mcts/search.ts` (modify)
- `packages/engine/src/agents/mcts/rollout.ts` (modify)
- `packages/engine/test/unit/agents/mcts/diagnostics-timing.test.ts` (new)
- `packages/engine/test/unit/agents/mcts/diagnostics-counters.test.ts` (new)

## Out of Scope

- Rollout mode refactor (`legacy`/`hybrid`/`direct`) — that is 63MCTSPERROLLFRESEA-002.
- State-info cache — that is 63MCTSPERROLLFRESEA-004.
- MAST rollout policy — that is 63MCTSPERROLLFRESEA-003.
- Forced-sequence compression — that is 63MCTSPERROLLFRESEA-005.
- Confidence-based root stopping — that is 63MCTSPERROLLFRESEA-006.
- Re-tuning any MCTS numeric parameters.
- Changing `MctsConfig` fields beyond `diagnostics` wiring.
- Modifying any files outside `agents/mcts/`.

## Acceptance Criteria

### Tests That Must Pass

1. **diagnostics-timing.test.ts**: When `config.diagnostics === true`, `runSearch()` returns diagnostics with all 6 per-phase timing fields populated (each `>= 0`).
2. **diagnostics-timing.test.ts**: `totalTimeMs` is a float (from `performance.now()`), not an integer.
3. **diagnostics-timing.test.ts**: Sum of per-phase timings does not exceed `totalTimeMs` (accounting for inter-phase overhead).
4. **diagnostics-counters.test.ts**: Kernel-call counters (`legalMovesCalls`, `applyMoveCalls`, `terminalCalls`, `evaluateStateCalls`, `materializeCalls`) are positive integers after a multi-iteration search.
5. **diagnostics-counters.test.ts**: When `config.diagnostics === false` or `undefined`, none of the new diagnostic fields are present.
6. **diagnostics-counters.test.ts**: `avgSelectionDepth` and `avgLeafRewardSpan` are computed as averages of accumulated arrays.
7. Existing suite: `pnpm -F @ludoforge/engine test` — all existing MCTS tests pass unchanged.

### Invariants

1. Determinism: same seed + same config = same search result. Diagnostics collection must not alter the RNG stream or search decisions.
2. The accumulator is created once per `runSearch()` call and is not shared across calls.
3. `MctsSearchDiagnostics` remains a readonly interface — the mutable accumulator is internal only.
4. All new `MctsSearchDiagnostics` fields are optional (`?:`) to preserve backward compatibility with existing consumers.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/mcts/diagnostics-timing.test.ts` — validates per-phase timing population, `performance.now()` migration, and timing consistency.
2. `packages/engine/test/unit/agents/mcts/diagnostics-counters.test.ts` — validates kernel-call counters, derived averages, and diagnostics-off behavior.

### Commands

1. `pnpm turbo build && node --test packages/engine/dist/test/unit/agents/mcts/diagnostics-timing.test.js`
2. `pnpm turbo build && node --test packages/engine/dist/test/unit/agents/mcts/diagnostics-counters.test.js`
3. `pnpm turbo build && pnpm -F @ludoforge/engine test`
4. `pnpm turbo typecheck && pnpm turbo lint`
