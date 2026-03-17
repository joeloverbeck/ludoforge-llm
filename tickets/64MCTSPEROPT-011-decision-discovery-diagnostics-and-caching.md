# 64MCTSPEROPT-011: Decision Discovery Diagnostics and Caching

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — diagnostics, caching for decision discovery
**Deps**: 64MCTSPEROPT-008 (pending families receiving visits triggers discovery)

## Problem

Once pending moves receive visits, `legalChoicesDiscover()` becomes a hot path — it enumerates decision options for pending operations. The spec (section 3.9) requires instrumenting this now (before it becomes a bottleneck) and adding sound caching keyed by `DecisionKey` from Spec 62.

## Assumption Reassessment (2026-03-17)

1. `legalChoicesDiscover()` exists in `packages/engine/src/kernel/legal-choices.ts` — need to verify.
2. `DecisionKey` from Spec 62 exists in `packages/engine/src/kernel/decision-scope.ts` — **confirmed**.
3. `decision-expansion.ts` handles decision tree expansion — this is where discovery is called.
4. `LegalChoicesRuntimeOptions` supports `chainCompoundSA: boolean` — **confirmed** in spec.

## Architecture Check

1. Diagnostics now prevent discovery from becoming a surprise bottleneck later.
2. `DecisionKey`-based caching is sound: it uniquely identifies decision instances within a move tree.
3. No cross-cache of hidden-info states without valid determinized hash.

## What to Change

### 1. Add decision discovery diagnostics to accumulator

Add to `MutableDiagnosticsAccumulator`:
- `decisionDiscoverCallCount: number`
- `decisionDiscoverTimeMs: number`
- `decisionDiscoverCacheHits: number`

Add to `MctsSearchDiagnostics`:
- Same fields as readonly.

### 2. Instrument `legalChoicesDiscover()` call sites

In `decision-expansion.ts`, wrap discovery calls with timing and counting instrumentation.

### 3. Add decision discovery cache

Create a bounded cache keyed by a combination of `stateHash` + `DecisionKey`:
- Only cache when `stateHash !== 0n` (no hidden-info cross-caching).
- Bounded by a configurable max (default: same as state-info cache max).
- Store discovery results (option lists).

### 4. Add per-depth option count diagnostics

Track how many options are discovered at each decision depth, for tuning `decisionWideningCap`.

### 5. Update `collectDiagnostics()` to merge new fields

## Files to Touch

- `packages/engine/src/agents/mcts/diagnostics.ts` (modify — new discovery fields, collection)
- `packages/engine/src/agents/mcts/decision-expansion.ts` (modify — instrument and cache discovery)
- `packages/engine/src/agents/mcts/state-cache.ts` (modify — decision discovery cache or separate cache)

## Out of Scope

- Kernel-side classification optimization (ticket 64MCTSPEROPT-012)
- Compiled decision plans / predicate caches (ticket 64MCTSPEROPT-012)
- Changes to `legalChoicesDiscover()` implementation itself (kernel code)
- Family widening (Phase 3 tickets)

## Acceptance Criteria

### Tests That Must Pass

1. With `diagnostics: true`, `decisionDiscoverCallCount` is populated after search with pending moves.
2. `decisionDiscoverTimeMs` is non-zero when discovery is called.
3. Cache hit: same `stateHash + DecisionKey` on second call returns cached result and increments `decisionDiscoverCacheHits`.
4. Cache miss: different `DecisionKey` or different `stateHash` triggers fresh discovery.
5. Cache bounded: inserting beyond max evicts oldest entry.
6. `stateHash === 0n`: discovery is never cached.
7. `pnpm -F @ludoforge/engine test` — full suite passes.
8. `pnpm turbo typecheck` passes.

### Invariants

1. Discovery cache does not cross-cache hidden-info states.
2. Cache bounded — no unbounded growth.
3. Diagnostics are zero-cost when `diagnostics: false`.
4. `DecisionKey` from Spec 62 is the cache key component, not an ad-hoc tuple.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/mcts/decision-discovery-cache.test.ts` (new) — caching, eviction, hidden-info safety.
2. `packages/engine/test/unit/agents/mcts/diagnostics.test.ts` (new or modify) — verify new fields populated.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
