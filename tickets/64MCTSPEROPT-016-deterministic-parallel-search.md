# 64MCTSPEROPT-016: Deterministic Root Parallelization

**Status**: PENDING
**Priority**: LOW
**Effort**: Large
**Engine Changes**: Yes — new parallel search module
**Deps**: 64MCTSPEROPT-004, 64MCTSPEROPT-007, 64MCTSPEROPT-009

## Problem

For background/analysis budgets (10-30+ seconds), parallelizing search across multiple workers can improve wall-clock performance. The spec (section 3.13, Phase 6) requires deterministic root parallelization: fixed iteration budgets split upfront, deterministic RNG forking, stable merge order.

## Assumption Reassessment (2026-03-17)

1. `fork()` in `packages/engine/src/kernel/prng.ts` provides deterministic RNG forking — **confirmed**.
2. `runSearch()` in `search.ts` accepts config and returns results — the unit of work per worker.
3. No parallel search infrastructure exists currently.
4. Spec says Phase 6 is optional and comes after Phases 2-4 metrics confirm single-threaded improvement.

## Architecture Check

1. Deterministic parallelism: split iterations upfront, fork RNG, merge by stable key order.
2. Time-budget racing is NOT allowed when determinism is required.
3. The merged result is not a reusable full tree — only root-level visit/reward aggregates.
4. Parallel search is an accelerator, not a substitute for core algorithm fixes.

## What to Change

### 1. Create `parallel.ts` (new file)

Implement:
- `splitSearchBudget(totalIterations, workerCount)`: divide iterations evenly across workers.
- `forkWorkerRngs(baseRng, workerCount)`: deterministic RNG forking per worker.
- `mergeRootResults(results)`: merge root child visits, rewards by stable `moveKey` order.

### 2. Add `parallelWorkers` config field

Add `parallelWorkers?: number` to `MctsConfig`. Default: `undefined` (single-threaded). When set, enables deterministic parallel search.

### 3. Implement parallel search dispatch in `mcts-agent.ts`

When `parallelWorkers > 1`:
- Split iteration budget.
- Fork RNG for each worker.
- Run `runSearch()` per worker (sequentially in single-threaded runtime, or via worker threads if available).
- Merge root results.
- Select best move from merged root.

### 4. Add determinism tests

Run parallel search twice with same seed + same worker count → identical results.

### 5. Add wall-clock benchmarks for background profile

Optional longer-running test comparing single-worker vs multi-worker background search.

## Files to Touch

- `packages/engine/src/agents/mcts/parallel.ts` (new)
- `packages/engine/src/agents/mcts/config.ts` (modify — add `parallelWorkers`)
- `packages/engine/src/agents/mcts/mcts-agent.ts` (modify — parallel dispatch)
- `packages/engine/src/agents/mcts/index.ts` (modify — export parallel module)

## Out of Scope

- Worker thread infrastructure (Node.js `worker_threads`) — initial implementation runs workers sequentially in the same thread (still deterministic, just not yet concurrent).
- Time-budget racing across workers.
- Cross-search tree merging (only root-level merge).
- All Phase 2-4 work.

## Acceptance Criteria

### Tests That Must Pass

1. `splitSearchBudget(100, 4)` → `[25, 25, 25, 25]`.
2. `forkWorkerRngs()` produces deterministic, distinct RNGs.
3. `mergeRootResults()` combines visits and rewards by stable `moveKey` order.
4. Determinism test: same seed + same worker count → identical merged result.
5. `parallelWorkers: 1` behaves identically to no-parallel search.
6. `pnpm -F @ludoforge/engine test` — full suite passes.
7. `pnpm turbo typecheck` passes.

### Invariants

1. Determinism preserved: same seed + same worker count = same result.
2. Merged result is root-level only — not a reusable full tree.
3. If caller demands strict determinism, no time-budget racing.
4. Single-threaded behavior unchanged when `parallelWorkers` is undefined.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/mcts/parallel.test.ts` (new) — budget splitting, RNG forking, merging, determinism.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
