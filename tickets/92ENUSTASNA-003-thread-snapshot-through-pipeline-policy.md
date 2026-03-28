# 92ENUSTASNA-003: Thread snapshot through pipeline viability policy

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — pipeline-viability-policy function signatures
**Deps**: 92ENUSTASNA-002

## Problem

`evaluateCompiledPredicate` in `pipeline-viability-policy.ts` calls compiled closures but does not pass the snapshot parameter. The snapshot must be threaded from the public evaluation functions down to the internal `evaluateCompiledPredicate` call so compiled closures can read pre-materialized state.

## Assumption Reassessment (2026-03-28)

1. `evaluateCompiledPredicate` is a private function at line 56 of `pipeline-viability-policy.ts` — confirmed. It calls `compiled(evalCtx.state, evalCtx.activePlayer, evalCtx.bindings)`.
2. `evaluateCompiledPredicate` is called from two internal functions: `evaluatePredicate` (line 82) and `evaluateDiscoveryPredicate` (line 108) — confirmed.
3. The public API surface is: `evaluatePipelinePredicateStatus`, `evaluateStagePredicateStatus`, `evaluateDiscoveryPipelinePredicateStatus`, `evaluateDiscoveryStagePredicateStatus` — confirmed at lines 162-196.
4. These public functions are called from `legal-moves.ts` — confirmed (4 call sites).
5. This ticket only threads an opaque snapshot parameter. It does not create new snapshot consumers and therefore should not introduce any dependency on the current composite-string `zoneTotals` accessor shape.

## Architecture Check

1. Adding an optional `snapshot` parameter to the internal helpers and public evaluation functions is a clean extension. All existing callers that don't pass snapshot continue to work (optional parameter defaults to `undefined`).
2. No new module dependencies — `EnumerationStateSnapshot` is only used as a type import.
3. The snapshot is NOT stored on `ReadContext` or any kernel object — it is passed as a separate parameter. This satisfies the spec requirement: "No fields added to any hot-path kernel object."

## What to Change

### 1. Update `evaluateCompiledPredicate`

Add optional `snapshot` parameter, pass to compiled closure:

```typescript
const evaluateCompiledPredicate = (
  condition: Exclude<ConditionAST, boolean>,
  evalCtx: ReadContext,
  snapshot?: EnumerationStateSnapshot,
): boolean | undefined => {
  const compiled = getCompiledPipelinePredicates(evalCtx.def).get(condition);
  if (compiled === undefined) {
    return undefined;
  }
  return compiled(evalCtx.state, evalCtx.activePlayer, evalCtx.bindings, snapshot);
};
```

### 2. Thread through internal `evaluatePredicate` and `evaluateDiscoveryPredicate`

Both gain an optional `snapshot` parameter and pass it to `evaluateCompiledPredicate`.

### 3. Thread through `evaluateCheckpointPredicateStatus` and `evaluateDiscoveryCheckpointPredicateStatus`

These internal orchestrators call `evaluatePredicate`/`evaluateDiscoveryPredicate` for legality and cost conditions — thread snapshot through both calls.

### 4. Thread through public evaluation functions

`evaluatePipelinePredicateStatus`, `evaluateStagePredicateStatus`, `evaluateDiscoveryPipelinePredicateStatus`, `evaluateDiscoveryStagePredicateStatus` each gain an optional `snapshot` parameter and pass it to their internal checkpoint function.

### 5. Import type

Add `import type { EnumerationStateSnapshot } from './enumeration-snapshot.js'`.

## Files to Touch

- `packages/engine/src/kernel/pipeline-viability-policy.ts` (modify)

## Out of Scope

- Creating the snapshot module (ticket 001)
- Modifying compiled closure bodies (ticket 002)
- Modifying `legal-moves.ts` to create and pass the snapshot (ticket 004)
- Modifying `ReadContext`, `EffectCursor`, `GameDefRuntime`, or `Move` types
- Changing the non-compiled interpreter fallback path (`evalActionPipelinePredicate`)
- Modifying `action-pipeline-predicates.ts`
- Introducing any new zone-total snapshot consumer; that work must wait for `92ENUSTASNA-007`

## Acceptance Criteria

### Tests That Must Pass

1. Unit test: `evaluateCompiledPredicate` passes snapshot to compiled closure when provided
2. Unit test: `evaluateCompiledPredicate` passes `undefined` snapshot when not provided (backwards compatibility)
3. Unit test: `evaluateDiscoveryPipelinePredicateStatus` threads snapshot through to compiled predicate evaluation
4. Existing suite: `pnpm turbo test --force`

### Invariants

1. All existing callers of public evaluation functions that do NOT pass a snapshot parameter continue to work identically — no behavioral change.
2. No fields added to `ReadContext` or any other hot-path kernel object.
3. The non-compiled interpreter fallback path is completely unaffected.
4. `evaluateCompiledPredicate` remains a private (non-exported) function.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/pipeline-viability-snapshot-threading.test.ts` — verifies snapshot is threaded through evaluation functions to compiled closures using mock compiled predicates.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/pipeline-viability-snapshot-threading.test.js`
3. `pnpm turbo test --force`
4. `pnpm turbo typecheck`
