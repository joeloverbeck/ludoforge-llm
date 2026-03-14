# 63MCTSPERROLLFRESEA-004: Per-search state-info cache

**Status**: DONE
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `agents/mcts/state-cache.ts` (new), `agents/mcts/search.ts`, `agents/mcts/rollout.ts`, `agents/mcts/config.ts`
**Deps**: 63MCTSPERROLLFRESEA-001 (diagnostics accumulator for cache hit/miss counters)

## Problem

The search repeatedly computes `terminalResult()`, `legalMoves()`, and `evaluateForAllPlayers()` for states that have already been visited. These are pure functions of `GameDef` + `GameState` and produce deterministic results, so caching by `stateHash` is safe when `stateHash !== 0n`.

The previous spec only cached `evaluateForAllPlayers()` results. This ticket widens the cache to include `terminalResult()` and `legalMoves()`, which are also hot in the search loop.

## Assumption Reassessment (2026-03-14)

1. `GameState` has a `stateHash: bigint` field (Zobrist hash) — confirmed.
2. `stateHash === 0n` for hidden-information states where hashing is not meaningful — confirmed.
3. `terminalResult()`, `legalMoves()`, and `evaluateForAllPlayers()` are pure functions of `(def, state, runtime)` — confirmed.
4. JavaScript `Map` preserves insertion order — confirmed (ES2015+).
5. `NodePool` has a `capacity` field — confirmed.

## Architecture Check

1. Insertion-order eviction via `Map` is simpler than true LRU and equally effective for MCTS's unpredictable access patterns. No access-timestamp bookkeeping needed.
2. Cache is local to each `runSearch()` call — no cross-search leakage or stale data risk.
3. Skipping `stateHash === 0n` entries ensures hidden-information correctness.
4. No tree statistics are shared across transpositions — the cache stores only immutable state-derived facts.

## What to Change

### 1. Create `state-cache.ts` module

Define:
```ts
interface CachedStateInfo {
  readonly terminal?: TerminalResult | null;
  readonly legalMoves?: readonly Move[];
  readonly rewards?: readonly number[];
}

type StateInfoCache = Map<bigint, CachedStateInfo>;
```

Functions:
- `createStateInfoCache(): StateInfoCache` — creates an empty cache.
- `getOrComputeTerminal(cache, def, state, runtime, accum?): TerminalResult | null` — returns cached terminal result or computes, caches, and returns. Skips cache when `stateHash === 0n`. Increments `accum.stateCacheLookups`, `accum.stateCacheHits`, `accum.terminalCacheHits` when applicable.
- `getOrComputeLegalMoves(cache, def, state, runtime, accum?): readonly Move[]` — same pattern for legal moves. Increments `legalMovesCacheHits`.
- `getOrComputeRewards(cache, def, state, terminal, config, runtime, accum?): readonly number[]` — same pattern for evaluation rewards. Increments `rewardCacheHits`.
- `evictIfNeeded(cache, maxEntries): void` — if `cache.size >= maxEntries`, delete the first key (insertion-order eviction).

### 2. Add config fields in `config.ts`

- `enableStateInfoCache?: boolean` (default: `true`)
- `maxStateInfoCacheEntries?: number` (default: computed as `min(pool.capacity, iterations * 4)`)

Add validation for the new fields.

### 3. Wire cache into `search.ts`

- Create `StateInfoCache` at the start of `runSearch()` when `enableStateInfoCache` is true.
- Use `getOrComputeTerminal()` instead of raw `terminalResult()` calls during selection and expansion.
- Use `getOrComputeLegalMoves()` instead of raw `legalMoves()` calls.
- Use `getOrComputeRewards()` in leaf evaluation.
- Pass the cache to `simulateToCutoff()` / `rollout()` for use during simulation.
- Compute `maxStateInfoCacheEntries` from pool capacity and iteration count.

### 4. Wire cache into `rollout.ts`

- Accept `StateInfoCache` as a parameter in simulation functions.
- Use cached `terminalResult()` and `legalMoves()` during rollout plies.
- Increment diagnostics counters via the accumulator.

### 5. Wire cache counters into diagnostics

The `MutableDiagnosticsAccumulator` (from ticket 001) already has the cache counter fields. This ticket wires the actual increments.

## Files to Touch

- `packages/engine/src/agents/mcts/state-cache.ts` (new)
- `packages/engine/src/agents/mcts/config.ts` (modify)
- `packages/engine/src/agents/mcts/search.ts` (modify)
- `packages/engine/src/agents/mcts/rollout.ts` (modify)
- `packages/engine/src/agents/mcts/index.ts` (modify)
- `packages/engine/test/unit/agents/mcts/state-cache.test.ts` (new)
- `packages/engine/test/unit/agents/mcts/config.test.ts` (modify)

## Out of Scope

- Caching `materializeConcreteCandidates()` output (RNG-sensitive and visit-sensitive).
- Caching successor states from `applyMove()` (memory-heavy and unsafe across sampled worlds).
- Sharing node visit statistics across transpositions (different algorithmic change).
- True LRU eviction (insertion-order eviction is sufficient).
- MAST policy — that is 63MCTSPERROLLFRESEA-003.
- Forced-sequence compression — that is 63MCTSPERROLLFRESEA-005.
- Rollout mode refactor — that is 63MCTSPERROLLFRESEA-002.

## Acceptance Criteria

### Tests That Must Pass

1. **state-cache.test.ts**: `getOrComputeTerminal()` returns cached result on second call with same `stateHash`.
2. **state-cache.test.ts**: `getOrComputeTerminal()` bypasses cache when `stateHash === 0n`.
3. **state-cache.test.ts**: `getOrComputeLegalMoves()` returns cached result on second call with same `stateHash`.
4. **state-cache.test.ts**: `getOrComputeRewards()` returns cached result on second call with same `stateHash`.
5. **state-cache.test.ts**: `evictIfNeeded()` deletes the first (oldest) entry when capacity is reached.
6. **state-cache.test.ts**: Cache size never exceeds `maxStateInfoCacheEntries`.
7. **state-cache.test.ts**: Cache hit/miss counters in the diagnostics accumulator are correct after multiple lookups.
8. **config.test.ts**: `enableStateInfoCache` defaults to `true`.
9. **config.test.ts**: `maxStateInfoCacheEntries` validation rejects non-positive values.
10. Existing suite: `pnpm -F @ludoforge/engine test` — all existing tests pass.

### Invariants

1. Cache is local to each `runSearch()` call and destroyed after search completes.
2. Entries with `stateHash === 0n` are never cached.
3. Cached values are immutable (readonly types enforced by TypeScript).
4. No tree statistics (visits, rewards) are stored in the cache.
5. Determinism: cache lookup and eviction are deterministic (Map insertion order is deterministic).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/mcts/state-cache.test.ts` — new: unit tests for all cache functions, eviction, bypass, and counter wiring.
2. `packages/engine/test/unit/agents/mcts/config.test.ts` — modified: validation tests for new cache config fields.

### Commands

1. `pnpm turbo build && node --test packages/engine/dist/test/unit/agents/mcts/state-cache.test.js`
2. `pnpm turbo build && pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck && pnpm turbo lint`
