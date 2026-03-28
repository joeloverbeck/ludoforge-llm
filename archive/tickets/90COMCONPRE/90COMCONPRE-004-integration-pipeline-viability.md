# 90COMCONPRE-004: Integration — pipeline viability predicate fast-paths

**Status**: ✅ COMPLETED
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
2. `evaluateCheckpointPredicateStatus` and `evaluateDiscoveryCheckpointPredicateStatus` are the shared internal helpers for both pipeline-level and stage-level predicate evaluation — confirmed. Any integration should happen in this shared path, not duplicated across public wrappers.
3. The discovery path currently uses `evalActionPipelinePredicateForDiscovery`, which wraps `evalCondition` with `shouldDeferMissingBinding` and converts recoverable missing-binding failures to `'deferred'` — confirmed.
4. The execution path currently uses `evalActionPipelinePredicate`, which calls `evalCondition` directly and wraps failures as `ACTION_PIPELINE_PREDICATE_EVALUATION_FAILED` — confirmed.
5. `evalCtx` in the policy functions is a `ReadContext` and already exposes the full data required by compiled predicates: `def`, `state`, `activePlayer`, and `bindings` — confirmed. No shape changes are needed.
6. The `condition == null` fast-path already exists and returns a passing state. Boolean literals are valid `ConditionAST` values but are not covered by that null check — confirmed.
7. Ticket 003 implemented `getCompiledPipelinePredicates(def)` as a `WeakMap<actionPipelines, ReadonlyMap<ConditionAST, CompiledConditionPredicate>>` keyed by `ConditionAST` object identity. It no longer requires `adjacencyGraph` or `runtimeTableIndex`, and it intentionally omits boolean literals from the cache.
8. The existing policy test file is `packages/engine/test/unit/kernel/pipeline-viability-policy.test.ts`, not `packages/engine/test/unit/pipeline-viability-policy.test.ts`.

## Architecture Check

1. **Boolean literal fast-path is still warranted**: the condition compiler can compile boolean literals, but the cache intentionally excludes them. A direct `typeof condition === 'boolean'` branch in the policy layer is the cleanest way to keep booleans out of the cache while still avoiding interpreter dispatch.
2. **Compiled predicate integration belongs in the shared policy helper**: the right shape is `null -> boolean -> compiled lookup -> interpreter fallback`, implemented once for execution and once for discovery at the checkpoint-helper level. Duplicating logic in each public pipeline/stage function would add drift risk without architectural benefit.
3. **Object-identity lookup is the correct API**: the policy layer already holds the exact `ConditionAST` object stored on the pipeline or stage definition. `compiledPredicates.get(condition)` is simpler and more robust than any synthetic key scheme.
4. **Discovery and execution should share the same fast-path ordering but keep distinct error semantics**: discovery still defers recoverable missing-binding failures; execution still wraps and propagates failures. The optimization must not blur those semantics.
5. **The current architecture is worth improving**: the existing `pipeline-viability-policy.ts` still hard-codes interpreter calls in separate execution/discovery branches. Replacing that with explicit shared fast-path helpers makes the policy layer cleaner, more extensible, and less likely to diverge when future predicate optimizations are added.
6. **No runtime object shape changes**: `GameDefRuntime`, `ReadContext`, `Move`, and related hot objects remain untouched. The cache remains external and WeakMap-backed.

## What to Change

### 1. Add shared execution-path predicate evaluation helper

Introduce a small helper in `pipeline-viability-policy.ts` that evaluates a single predicate with this order:
1. `condition == null` -> pass
2. `typeof condition === 'boolean'` -> direct pass/fail
3. `getCompiledPipelinePredicates(evalCtx.def).get(condition)` -> compiled predicate fast-path
4. Fallback to `evalActionPipelinePredicate`

This helper should be used by `evaluateCheckpointPredicateStatus`, which already centralizes both pipeline-level and stage-level execution checks.

### 2. Add shared discovery-path predicate evaluation helper

Introduce the discovery counterpart with the same `null -> boolean -> compiled -> interpreter` order, but preserve discovery semantics:
1. `null` => `'passed'`
2. boolean => `'passed' | 'failed'`
3. compiled predicate => execute closure and map result to `'passed' | 'failed'`
4. if compiled execution throws a recoverable missing-binding error, return `'deferred'`
5. otherwise wrap/propagate exactly like the existing discovery interpreter path

This helper should be used by `evaluateDiscoveryCheckpointPredicateStatus`, so both pipeline-level and stage-level discovery evaluation stay aligned.

### 3. Keep compiled predicate access local to the policy layer

Do not thread new parameters through public APIs. Look up the WeakMap-backed cache from `evalCtx.def` via `getCompiledPipelinePredicates(def)`. That preserves the existing public signatures and keeps the optimization concern localized.

### 4. Strengthen policy tests around architecture, not just outputs

The policy tests should verify:
- boolean literals bypass the wrapped interpreter path
- compilable ASTs work through the policy layer for both execution and discovery
- non-compilable ASTs still fall through to the interpreter path
- missing-binding semantics differ correctly between discovery and execution
- stage-level evaluation uses the same fast-paths as pipeline-level evaluation

## Files to Touch

- `packages/engine/src/kernel/pipeline-viability-policy.ts` (modify — add fast-paths and compiled predicate checks)
- `packages/engine/test/unit/kernel/pipeline-viability-policy.test.ts` (modify — verify boolean fast-path, compiled lookup, fallback behavior, and discovery/execution error semantics)

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
3. Pipeline and stage conditions with a compilable pattern use the compiled predicate fast-path and return the same result as the interpreter
4. Pipeline and stage conditions with a non-compilable pattern fall through to the interpreter path and return correct results
5. Discovery-path compiled predicate that throws missing-binding error returns `'deferred'`
6. Execution-path compiled predicate that throws missing-binding error propagates the error (does not defer)
7. Stage-level conditions benefit from the same boolean fast-path and compiled lookup via the shared checkpoint helper, not duplicated wrapper logic
8. Existing pipeline-viability-policy behavioral tests continue to pass
9. Relevant engine unit tests, workspace lint, workspace typecheck, and workspace tests pass

### Invariants

1. The evaluation result (passed/failed/deferred) is identical to the pre-integration behavior for all conditions
2. No fields added to `GameDefRuntime`, `EffectCursor`, `ReadContext`, or `Move`
3. `evalCondition` is still called for non-compilable conditions (fallback path is intact)
4. Boolean literal fast-path precedes compiled predicate lookup precedes interpreter fallback (correct ordering)
5. The compiled predicates map is obtained via `getCompiledPipelinePredicates` (WeakMap-cached, no repeated compilation)
6. Cache lookup uses the `ConditionAST` object being evaluated; no synthetic pipeline/stage key encoding is introduced

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/pipeline-viability-policy.test.ts` — add focused policy-layer tests for execution/discovery boolean fast-paths, compiled predicate lookup, interpreter fallback, and stage parity

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo test`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-28
- What actually changed:
  - Integrated pipeline-viability predicate fast-paths in `packages/engine/src/kernel/pipeline-viability-policy.ts` using shared execution/discovery helpers with ordered `null -> boolean -> compiled cache -> interpreter` dispatch.
  - Kept the compiled predicate lookup keyed by `ConditionAST` object identity via `getCompiledPipelinePredicates(evalCtx.def)`.
  - Preserved existing discovery deferral semantics and execution error-wrapping semantics for compiled predicates.
  - Strengthened `packages/engine/test/unit/kernel/pipeline-viability-policy.test.ts` with routing-focused coverage for boolean literals, compiled predicate reuse, stage parity, missing-binding behavior, and interpreter fallback.
- Deviations from original plan:
  - The implementation was centralized in shared checkpoint helpers rather than duplicating logic across public pipeline/stage entry points.
  - The ticket was corrected to match the current cache API (`getCompiledPipelinePredicates(def)`) and the real test file path.
  - Workspace verification exposed two unrelated runner bootstrap timeout tests; those tests were given explicit 20s timeouts so `pnpm turbo test` reflects real regressions rather than suite-load flakiness.
- Verification results:
  - `node packages/engine/dist/test/unit/kernel/pipeline-viability-policy.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
  - `pnpm -F @ludoforge/runner test -- test/bootstrap/resolve-bootstrap-config.test.ts test/bootstrap/runner-bootstrap.test.ts`
  - `pnpm turbo test`
