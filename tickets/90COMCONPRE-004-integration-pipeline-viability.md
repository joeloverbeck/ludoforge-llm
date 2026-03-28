# 90COMCONPRE-004: Integration — boolean literal fast-path + compiled predicate lookup

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — modify kernel pipeline evaluation
**Deps**: 90COMCONPRE-003

## Problem

The condition compiler (001-002) and cache (003) exist but are not wired into the pipeline predicate evaluation path. This ticket integrates them by adding:
1. A boolean literal fast-path (`typeof condition === 'boolean'`) before any function call
2. A compiled predicate lookup before falling through to the interpreter

Both apply to pipeline-level and stage-level evaluation, in both discovery and execution paths.

## Assumption Reassessment (2026-03-28)

1. `evaluateDiscoveryPipelinePredicateStatus` and `evaluateDiscoveryStagePredicateStatus` are the discovery-path entry points in `pipeline-viability-policy.ts` — confirmed.
2. `evaluateCheckpointPredicateStatus` is the internal function handling both pipeline and stage predicates — confirmed. It delegates to `evalCondition` via `evalActionPipelinePredicate`.
3. The discovery path uses `evalActionPipelinePredicateForDiscovery` which wraps `evalCondition` with `shouldDeferMissingBinding` catch — confirmed.
4. The execution path uses `evalActionPipelinePredicate` which calls `evalCondition` directly and throws on failure — confirmed.
5. `evalCtx` in the pipeline evaluation functions is a `ReadContext` containing `def`, `state`, `activePlayer`, `bindings`, `adjacencyGraph`, `runtimeTableIndex` — confirmed. All needed fields are accessible.
6. The `condition == null` check already exists for null conditions returning `'passed'` — confirmed. Boolean `true` is not caught by this check.

## Architecture Check

1. **Boolean literal fast-path**: `typeof condition === 'boolean'` is a zero-overhead check that eliminates function call dispatch for ~40% of FITL pipeline conditions that are `legality: true`. This is the simplest possible optimization with the highest ROI.
2. **Compiled predicate integration**: The compiled predicate lookup happens AFTER the boolean literal check and BEFORE the interpreter fallback. This is a clean fast-path chain: `null check -> boolean check -> compiled check -> interpreter`.
3. **Discovery vs execution semantics preserved**: In discovery mode, compiled predicates that throw missing-binding errors are caught by the existing `shouldDeferMissingBinding` wrapper. In execution mode, missing-binding errors propagate as real errors (same as interpreter).
4. **No changes to existing interpreter functions**: `evalCondition`, `evalValue`, `resolveRef` are untouched. The integration only modifies the caller path in `pipeline-viability-policy.ts`.

## What to Change

### 1. Add boolean literal fast-path to `evalDiscoveryPredicate`

Before the existing `evalActionPipelinePredicateForDiscovery` call, add:
```typescript
if (typeof condition === 'boolean') return condition ? 'passed' : 'failed';
```

### 2. Add compiled predicate lookup to `evalDiscoveryPredicate`

After the boolean literal check, look up the compiled predicate:
```typescript
const compiled = compiledPredicates?.get(cacheKey);
if (compiled !== undefined) {
  try {
    return compiled(evalCtx.state, evalCtx.activePlayer, evalCtx.bindings) ? 'passed' : 'failed';
  } catch (e) {
    if (shouldDeferMissingBinding(e, MISSING_BINDING_POLICY_CONTEXTS.PIPELINE_DISCOVERY_PREDICATE)) {
      return 'deferred';
    }
    throw e;
  }
}
```

### 3. Apply same pattern to stage-level evaluation

The stage-level functions (`evaluateDiscoveryStagePredicateStatus`, `evaluateStagePredicateStatus`) need the same boolean literal fast-path and compiled predicate lookup, using the stage-indexed cache key.

### 4. Apply to execution path

The execution path (`evaluateCheckpointPredicateStatus` or `evaluatePipelinePredicateStatus`) also gets:
- Boolean literal fast-path
- Compiled predicate lookup (no try/catch for deferred — missing bindings are real errors in execution)

### 5. Thread compiled predicates map

The compiled predicates map needs to be accessible in the evaluation functions. Options:
- Pass it as a parameter (cleanest, no hidden state)
- Look it up from `evalCtx.def` via `getCompiledPipelinePredicates` (uses cached WeakMap, zero extra cost after first call)

The second option is preferred — it requires no signature changes to the evaluation functions and leverages the WeakMap cache.

## Files to Touch

- `packages/engine/src/kernel/pipeline-viability-policy.ts` (modify — add fast-paths and compiled predicate checks)
- `packages/engine/test/unit/pipeline-viability-policy.test.ts` (modify or new — test boolean literal fast-path and compiled predicate integration)

## Out of Scope

- Modifying `evalCondition`, `evalValue`, `resolveRef`, or `createEvalContext`
- Modifying `action-pipeline-predicates.ts` (the `shouldDeferMissingBinding` contract is already correct)
- Adding fields to `GameDefRuntime`, `EffectCursor`, `ReadContext`, or `Move`
- Compiling `applicability` conditions
- Performance benchmarking — ticket 005

## Acceptance Criteria

### Tests That Must Pass

1. Pipeline condition `legality: true` (boolean literal) returns `'passed'` without calling `evalCondition`
2. Pipeline condition `legality: false` (boolean literal) returns `'failed'` without calling `evalCondition`
3. Pipeline condition with a compilable pattern uses the compiled predicate and returns correct result
4. Pipeline condition with a non-compilable pattern falls through to interpreter and returns correct result
5. Discovery-path compiled predicate that throws missing-binding error returns `'deferred'`
6. Execution-path compiled predicate that throws missing-binding error propagates the error (does not defer)
7. Stage-level conditions also benefit from boolean literal fast-path and compiled predicate lookup
8. All existing pipeline-viability-policy tests continue to pass unchanged
9. Existing suite: `pnpm turbo test`

### Invariants

1. The evaluation result (passed/failed/deferred) is identical to the pre-integration behavior for all conditions
2. No fields added to `GameDefRuntime`, `EffectCursor`, `ReadContext`, or `Move`
3. `evalCondition` is still called for non-compilable conditions (fallback path is intact)
4. Boolean literal fast-path precedes compiled predicate lookup precedes interpreter fallback (correct ordering)
5. The compiled predicates map is obtained via `getCompiledPipelinePredicates` (WeakMap-cached, no repeated compilation)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/pipeline-viability-policy.test.ts` — test boolean literal fast-path for both discovery and execution paths; test compiled predicate integration with mock compiled closures; test fallback to interpreter for non-compilable conditions

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "pipeline-viability"`
2. `pnpm turbo test`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`
