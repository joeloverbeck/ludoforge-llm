# 90COMCONPRE-003: Compiled condition cache — WeakMap cache infrastructure

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — new kernel module
**Deps**: 90COMCONPRE-001, 90COMCONPRE-002

## Problem

Compiled condition predicates must be stored externally from `GameDefRuntime` — the `fitl-perf-optimization` campaign proved that adding ANY field to `GameDefRuntime` causes V8 hidden class deoptimization (2-7% regression). A module-level `WeakMap` cache, keyed on the immutable `def.actionPipelines` array reference, provides the storage.

## Assumption Reassessment (2026-03-28)

1. `getActionPipelineLookup` in `action-pipeline-lookup.ts` uses the exact `WeakMap<readonly ActionPipelineDef[], ...>` pattern keyed on `def.actionPipelines` — confirmed. This ticket follows the same pattern.
2. `ActionPipelineDef` has `legality: ConditionAST | null` and `costValidation: ConditionAST | null` fields — confirmed.
3. `ActionResolutionStageDef` has optional `legality?: ConditionAST | null` and `costValidation?: ConditionAST | null` fields — confirmed.
4. The cache must cover both pipeline-level and stage-level conditions, distinguished by cache key encoding (pipelineId + predicateName + optional stageIndex).
5. `AdjacencyGraph` and `RuntimeTableIndex` are available at compilation time (passed from `GameDefRuntime` fields).

## Architecture Check

1. **Why WeakMap**: Matches the proven-safe pattern from `action-pipeline-lookup.ts`. WeakMap allows GC of compiled predicates when the GameDef is no longer referenced. No global mutable state accumulation.
2. **Cache key encoding**: String-based key combining pipeline index, predicate name (`'legality'` or `'costValidation'`), and optional stage index. This is simple, collision-free, and allows O(1) lookup.
3. **Agnosticism preserved**: The cache iterates generic `ActionPipelineDef` arrays — no game-specific logic. Any game with pipeline conditions gets compiled predicates.

## What to Change

### 1. Create `compiled-condition-cache.ts`

Implement:
- `ConditionCacheKey` type (string encoding: `${pipelineIdx}:${predicate}` or `${pipelineIdx}:${predicate}:stage${stageIdx}`)
- Module-level `compiledPredicateCache: WeakMap<readonly ActionPipelineDef[], ReadonlyMap<ConditionCacheKey, CompiledConditionPredicate>>`
- `getCompiledPipelinePredicates(def, adjacencyGraph, runtimeTableIndex)` — public entry point, populates cache on first call
- `compilePipelineAndStagePredicates(def, adjacencyGraph, runtimeTableIndex)` — internal function that iterates all pipelines and stages, calls `tryCompileCondition` on each `legality` and `costValidation` ConditionAST, and builds the cache map

### 2. Export from kernel index

Add exports for `getCompiledPipelinePredicates` and `CompiledConditionPredicate` type.

## Files to Touch

- `packages/engine/src/kernel/compiled-condition-cache.ts` (new)
- `packages/engine/src/kernel/index.ts` (modify — add exports)
- `packages/engine/test/unit/compiled-condition-cache.test.ts` (new)

## Out of Scope

- Integration into pipeline-viability-policy.ts — ticket 004
- Modifying `GameDefRuntime` (explicitly forbidden by spec's V8 safety analysis)
- Compiling `applicability` conditions (different code path per spec scoping note)
- Compiling action-level `pre` conditions (not pipeline predicates)
- Performance benchmarking — ticket 005

## Acceptance Criteria

### Tests That Must Pass

1. `getCompiledPipelinePredicates` returns an empty map for a GameDef with no `actionPipelines`
2. `getCompiledPipelinePredicates` compiles pipeline-level `legality` conditions that match Tier 1/2/3 patterns
3. `getCompiledPipelinePredicates` compiles stage-level `legality` and `costValidation` conditions
4. Cache keys correctly distinguish pipeline-level from stage-level conditions (e.g., `0:legality` vs `0:legality:stage1`)
5. Non-compilable conditions (returning `null` from `tryCompileCondition`) are NOT stored in the cache map
6. WeakMap caching: second call with same `def.actionPipelines` reference returns identical map (reference equality)
7. WeakMap caching: call with different `def.actionPipelines` reference produces a separate map
8. Existing suite: `pnpm turbo test`

### Invariants

1. No fields added to `GameDefRuntime`, `EffectCursor`, `ReadContext`, or `Move`
2. Cache is populated once per unique `def.actionPipelines` reference — subsequent calls return cached result
3. Non-compilable conditions silently skip (no error thrown)
4. The cache map is `ReadonlyMap` — no mutation after construction

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compiled-condition-cache.test.ts` — tests for cache population, key encoding, WeakMap behavior, empty GameDef handling, mix of compilable and non-compilable conditions

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "compiled-condition-cache"`
2. `pnpm turbo test`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`
