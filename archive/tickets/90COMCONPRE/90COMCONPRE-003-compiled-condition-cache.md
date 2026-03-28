# 90COMCONPRE-003: Compiled condition cache infrastructure

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes
**Deps**: 90COMCONPRE-001, 90COMCONPRE-002

## Problem

The condition compiler from 001-002 already exists, but pipeline and stage predicates still have no runtime cache that can be reused by later integration work. We need a V8-safe cache that keeps compiled predicates outside `GameDefRuntime` while matching the existing `WeakMap`-backed lookup pattern used elsewhere in the kernel.

## Assumption Reassessment (2026-03-28)

1. `packages/engine/src/kernel/condition-compiler.ts` already exists and exports `tryCompileCondition` plus `CompiledConditionPredicate`. The original ticket assumption that this work needed new compiler infrastructure was incorrect.
2. `packages/engine/src/kernel/action-pipeline-lookup.ts` already establishes the approved storage pattern: a module-level `WeakMap` keyed by `def.actionPipelines`.
3. `ActionPipelineDef.legality` and `ActionPipelineDef.costValidation` are `ConditionAST | null`.
4. `ActionResolutionStageDef.legality` and `ActionResolutionStageDef.costValidation` are `ConditionAST | null | undefined`.
5. The existing compiler does not need `GameDef`, `AdjacencyGraph`, or `RuntimeTableIndex` inputs for the currently supported predicate tiers. The original ticket’s assumption that those runtime resources were required for cache construction was incorrect.
6. `packages/engine/src/kernel/pipeline-viability-policy.ts` does not currently carry stage indexes through the evaluation path. A cache design that depends on synthetic `pipelineIdx/stageIdx` string keys would force unnecessary plumbing.

## Architecture Check

1. **WeakMap remains the right outer cache**: It preserves the V8-safe “no new runtime fields” rule and allows compiled predicates to be reclaimed when the owning `actionPipelines` array becomes unreachable.
2. **Condition-object keys are cleaner than encoded string keys**: the evaluation path already has the exact `ConditionAST` object being checked. Using object identity avoids synthetic key generation, avoids stage-index threading, and naturally covers both pipeline-level and stage-level predicates.
3. **Boolean literals should not be stored in the cache**: `true`/`false` conditions are cheap enough to handle directly at the call site. The cache should store compiled AST objects only.
4. **This ticket should stay infrastructure-only**: wiring the cache into predicate evaluation belongs to 004. Keeping this ticket focused avoids mixing storage concerns with runtime integration behavior.

## What to Change

### 1. Create `compiled-condition-cache.ts`

Implement:
- a module-level `WeakMap<readonly ActionPipelineDef[], ReadonlyMap<ConditionAST, CompiledConditionPredicate>>`
- `getCompiledPipelinePredicates(def)` as the public entry point
- an internal builder that walks every pipeline and stage condition, runs `tryCompileCondition`, and stores only successfully compiled non-boolean `ConditionAST` objects

### 2. Export the cache API from the kernel index

Add exports for the new cache module. Do not duplicate exports that already come from `condition-compiler.ts`.

### 3. Add focused unit tests

Cover:
- empty/no-pipeline defs
- pipeline-level and stage-level storage
- non-compilable conditions skipped
- boolean literal conditions skipped
- `WeakMap` reuse for the same `actionPipelines` reference
- separate cache entries for distinct `actionPipelines` references

## Files to Touch

- `packages/engine/src/kernel/compiled-condition-cache.ts` (new)
- `packages/engine/src/kernel/index.ts` (modify)
- `packages/engine/test/unit/kernel/compiled-condition-cache.test.ts` (new)

## Out of Scope

- Integration into `pipeline-viability-policy.ts` or any other predicate call site
- New compiler tiers or changes to `condition-compiler.ts`
- Modifying `GameDefRuntime`, `ReadContext`, `EffectCursor`, or `Move`
- Compiling `applicability` conditions
- Benchmarking and equivalence/performance proof work from 005

## Acceptance Criteria

### Tests That Must Pass

1. `getCompiledPipelinePredicates` returns an empty map for a `GameDef` with no `actionPipelines`
2. compilable pipeline-level `legality` and `costValidation` conditions are stored
3. compilable stage-level `legality` and `costValidation` conditions are stored
4. non-compilable conditions are omitted
5. boolean literal conditions are omitted
6. a second call with the same `def.actionPipelines` reference returns the identical map instance
7. a different `def.actionPipelines` reference produces a different cache entry
8. existing relevant engine tests continue to pass

### Invariants

1. No fields are added to `GameDefRuntime`, `ReadContext`, `EffectCursor`, or `Move`
2. Cache population happens once per unique `def.actionPipelines` reference
3. The returned cache is read-only after construction
4. Cache lookup is based on `ConditionAST` object identity, not encoded path strings

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/compiled-condition-cache.test.ts` — cache population, omitted cases, and `WeakMap` reuse behavior

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "compiled-condition-cache|condition compiler"`
2. `pnpm turbo test`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-28
- What actually changed: added `packages/engine/src/kernel/compiled-condition-cache.ts`, exported it from the kernel index, and added focused unit coverage in `packages/engine/test/unit/kernel/compiled-condition-cache.test.ts`
- Deviation from original plan: the cache was implemented as `WeakMap<actionPipelines, ReadonlyMap<ConditionAST, CompiledConditionPredicate>>` keyed by condition-object identity, not synthetic string keys. This better matches the current evaluation architecture because stage indexes are not threaded through predicate evaluation.
- Additional reassessment outcome: the ticket was corrected to reflect that `condition-compiler.ts` already existed and that cache construction does not currently require `GameDef`, `AdjacencyGraph`, or `RuntimeTableIndex`
- Verification results: targeted Node tests for compiled-condition-cache, condition-compiler, and pipeline-viability-policy passed; `pnpm turbo test`, `pnpm turbo typecheck`, and `pnpm turbo lint` all passed
