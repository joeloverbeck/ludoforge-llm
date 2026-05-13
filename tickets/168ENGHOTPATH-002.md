# 168ENGHOTPATH-002: Phase 1 — persistent token-state-index

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/kernel/token-state-index.ts`, `packages/engine/src/kernel/gamedef-runtime.ts`
**Deps**: `archive/tickets/168ENGHOTPATH-001.md`

## Problem

`reports/turnperf-002-spec-167-baseline.md` records `tokenStateIndex:build` at `87.91 ms` (×2903 calls) and `tokenStateIndex:refreshCachedEntries` at `64.93 ms` (×10568 calls) per card — a combined `152.84 ms` (≈7.5% of elapsed). The current rebuild-from-scratch pattern wastes work across draft transitions where state changes are local and predictable. Spec 168 §3.2 prescribes a `runLocal` persistent mutable index keyed by canonical state hash, validated by an architectural-invariant equivalence test.

## Assumption Reassessment (2026-05-13)

1. `packages/engine/src/kernel/token-state-index.ts` is `408` lines — verified via `wc -l` earlier this session.
2. `packages/engine/src/kernel/gamedef-runtime.ts` exposes `forkGameDefRuntimeForRun(runtime)` per Spec 143 (archived) at lines 84-95 — verified via spec §2.4 + grep.
3. The Spec 143 `runLocal`/`sharedStructural` runtime contract supports adding new `runLocal` fields without disturbing existing structural members (`adjacencyGraph`, `runtimeTableIndex`, `alwaysCompleteActionIds`, `firstDecisionDomains`, `ruleCardCache`, `compiledLifecycleEffects`).
4. Canonical state hash is already computed for replay/zobrist purposes and is suitable as a cache key — verify exact accessor at impl time.

## Architecture Check

1. Cleaner than per-call rebuild because the cache key is a state hash already computed for replay; lookup is O(1) and deterministic. Cache misses fall back to the existing build path with no behavioral difference.
2. Preserves engine agnosticism (Foundation #1) — index structure is generic kernel code; cache is keyed on opaque state hash with no game-specific semantics.
3. **Foundation #11 Scoped Internal Mutation** is explicitly invoked: persistent mutable structure is internal to the eval-query subsystem, never aliased outside the eval-scope, never exposed across the public `applyMove(state) -> newState` contract. Public state remains immutable.
4. Per Spec 143 contract: `tokenStateIndexCache` is `runLocal` and forked per run via `forkGameDefRuntimeForRun(...)` — no cross-run aliasing, satisfying parallel-determinism guarantees from Spec 167 Phase 2.

## What to Change

### 1. Add `tokenStateIndexCache` runLocal field

Extend `GameDefRuntime` with a new `runLocal` field `tokenStateIndexCache` (LRU-bounded map from canonical state hash → persistent mutable token-state-index structure). Wire it into `forkGameDefRuntimeForRun(...)` so each run receives a fresh, isolated cache.

### 2. Implement bounded LRU eviction

Add a finite cap on `tokenStateIndexCache` (configurable via runtime constant; default chosen during impl based on Phase 1 measured working-set size from `reports/turnperf-NNN-spec-168-phase-1.md`). Eviction is deterministic LRU.

### 3. Cache lookup in token-state-index build/refresh paths

Modify the build/refresh entry points in `token-state-index.ts` to:
- On cache hit: return the persistent mutable structure (applying any deferred deltas)
- On cache miss: build fresh and store

The mutable structure's contract (which fields can be in-place updated) is internal to the eval-query subsystem — see Foundation #11 Scoped Internal Mutation citation in Architecture Check.

### 4. Equivalence test

Add `packages/engine/test/integration/persistent-token-state-index-equivalence.test.ts` (architectural-invariant class) — runs the FITL canary corpus with cache enabled vs. disabled, asserts byte-identical token-state-index across all calls. The test is the durability proof that the cache cannot diverge from the canonical build path.

### 5. Per-phase measurement report

After landing, re-run the Phase 0 fixture (`archive/tickets/168ENGHOTPATH-001.md`) and capture pre/post bucket decomposition into `reports/turnperf-NNN-spec-168-phase-1.md`. Acceptance: combined `tokenStateIndex:build + tokenStateIndex:refreshCachedEntries` ms drops by **≥ 50 ms**, with `tokenStateIndexBuildCount` decreasing correspondingly (specific count delta recorded in report).

## Files to Touch

- `packages/engine/src/kernel/token-state-index.ts` (modify)
- `packages/engine/src/kernel/gamedef-runtime.ts` (modify — add `runLocal` field + fork wiring)
- `packages/engine/test/integration/persistent-token-state-index-equivalence.test.ts` (new)
- `reports/turnperf-NNN-spec-168-phase-1.md` (new — measurements)

## Out of Scope

- Phase 2 query/filter plan changes (`tickets/168ENGHOTPATH-003`)
- Phase 3 zobrist digest cache (`tickets/168ENGHOTPATH-004`)
- Phase 4 bytecode input row cache (`tickets/168ENGHOTPATH-005`)
- Sharing index across runs (Spec 143 forbids; `runLocal` isolation is preserved)
- Persisting the cache to disk across process invocations (working-set fits in process memory per spec §2.1 evidence)

## Acceptance Criteria

### Tests That Must Pass

1. New `persistent-token-state-index-equivalence.test.ts` — cache hits byte-identical to fresh builds across canary corpus
2. Existing `arvn-tournament-parallel-determinism.test.ts` (Spec 167 Phase 2) green — proves `runLocal` isolation under concurrency
3. Existing `arvn-tournament-wasm-equivalence.test.ts` (Spec 167 Phase 0) green
4. Existing `policy-bytecode-equivalence.test.ts` green
5. Existing suite: `pnpm turbo test`

### Invariants

1. Public `applyMove(state) -> newState` contract preserved; no caller-visible mutation (Foundation #11)
2. `tokenStateIndexCache` is `runLocal` per Spec 143 — forked per run, isolated across concurrent workers
3. Determinism: same state → same index, regardless of cache hit/miss state
4. LRU eviction is deterministic (no wall-clock or insertion-order dependence on hash iteration)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/persistent-token-state-index-equivalence.test.ts` — Phase 1 architectural-invariant equivalence proof
2. Re-run `archive/tickets/168ENGHOTPATH-001.md` benchmark fixture; capture pre/post into `reports/turnperf-NNN-spec-168-phase-1.md`

### Commands

1. `pnpm -F @ludoforge/engine test packages/engine/test/integration/persistent-token-state-index-equivalence.test.ts`
2. `pnpm -F @ludoforge/engine test:perf`
3. `pnpm turbo test`
