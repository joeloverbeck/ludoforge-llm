# 92ENUSTASNA-003: Thread snapshot through pipeline viability policy

**Status**: COMPLETED
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
4. Those public functions are shared across multiple kernel surfaces, not just `legal-moves.ts`. Confirmed callers currently include `apply-move.ts`, `free-operation-viability.ts`, `legal-choices.ts`, and `legal-moves.ts`.
5. `EnumerationStateSnapshot` and the optional `snapshot` parameter on `CompiledConditionPredicate` already exist in the codebase. This ticket is now strictly about threading that existing snapshot through `pipeline-viability-policy.ts`; it does not introduce the snapshot type or extend compiled-condition semantics.
6. This ticket only threads an opaque snapshot reference. It does not create new snapshot consumers and therefore should not introduce any dependency on the current composite-key `zoneTotals` accessor shape beyond passing the snapshot object through unchanged.
7. The current snapshot shape caches `activePlayerVars` for the player used when the snapshot was created. Some predicate evaluations run with `evalCtx.activePlayer` different from `state.activePlayer` because action execution can target a different executor. Therefore snapshot threading is only correct when `evalCtx.activePlayer === snapshot.activePlayer`.

## Architecture Check

1. Adding a new positional `snapshot` parameter to the public evaluation functions is not the cleanest fit for the current architecture. These APIs already accept an `options` object, and extending that object with `snapshot?: EnumerationStateSnapshot` is the more robust and extensible shape.
2. `evaluateCompiledPredicate` may continue to accept a direct `snapshot` argument internally, but the externally shared evaluation functions should thread snapshot through the existing `options` bag instead of growing another positional parameter.
3. No new module dependencies are needed beyond a type import of `EnumerationStateSnapshot`.
4. The snapshot is NOT stored on `ReadContext` or any kernel object — it is threaded through function-local options only. This satisfies the spec requirement: "No fields added to any hot-path kernel object."
5. Because `EnumerationStateSnapshot.activePlayerVars` is player-specific, `pipeline-viability-policy.ts` must gate snapshot use and fall back to raw-state compiled evaluation when the evaluation context's active player differs from `snapshot.activePlayer`. Broadening snapshot support to arbitrary execution players is a separate architectural follow-up.

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

Before calling the compiled closure with a snapshot, ensure the snapshot is eligible for the current evaluation context:

```typescript
const snapshotForEval = snapshot?.activePlayer === evalCtx.activePlayer ? snapshot : undefined;
return compiled(evalCtx.state, evalCtx.activePlayer, evalCtx.bindings, snapshotForEval);
```

### 2. Thread through internal `evaluatePredicate` and `evaluateDiscoveryPredicate`

Both gain access to `snapshot` and pass it to `evaluateCompiledPredicate`.

### 3. Thread through `evaluateCheckpointPredicateStatus` and `evaluateDiscoveryCheckpointPredicateStatus`

These internal orchestrators call `evaluatePredicate`/`evaluateDiscoveryPredicate` for legality and cost conditions. Extend their existing `options` flow to include `snapshot`, and thread it through both calls.

### 4. Thread through public evaluation functions

`evaluatePipelinePredicateStatus`, `evaluateStagePredicateStatus`, `evaluateDiscoveryPipelinePredicateStatus`, and `evaluateDiscoveryStagePredicateStatus` should keep their current positional signatures. Instead, extend their existing `options` object to:

```typescript
{
  readonly includeCostValidation?: boolean;
  readonly snapshot?: EnumerationStateSnapshot;
}
```

Each public function passes that `options.snapshot` value to its internal checkpoint function.

### 5. Import type

Add `import type { EnumerationStateSnapshot } from './enumeration-snapshot.js'`.

### 6. Update enumeration/discovery callers that already own the legal-move evaluation scope

Once the public predicate APIs accept `options.snapshot`, update the enumeration-side callers that can provide a pre-materialized snapshot. In the current architecture that means:

- `legal-moves.ts` for raw legal-move enumeration and free-operation template filtering
- `legal-choices.ts` only if it already has a snapshot in scope for the discovery path being evaluated

Execution-time callers such as `apply-move.ts` and `free-operation-viability.ts` should continue to omit `snapshot`.

## Files to Touch

- `packages/engine/src/kernel/pipeline-viability-policy.ts` (modify)
- `packages/engine/src/kernel/legal-moves.ts` (modify)
- `packages/engine/test/unit/kernel/pipeline-viability-policy.test.ts` (modify)

## Out of Scope

- Creating the snapshot module (ticket 001)
- Modifying compiled closure bodies (ticket 002)
- Changing snapshot structure or lazy accessor contracts
- Modifying `ReadContext`, `EffectCursor`, `GameDefRuntime`, or `Move` types
- Changing the non-compiled interpreter fallback path (`evalActionPipelinePredicate`)
- Modifying `action-pipeline-predicates.ts`
- Introducing any new snapshot-backed compiled accessors beyond what already exists in `condition-compiler.ts`

## Acceptance Criteria

### Tests That Must Pass

1. Unit test: pipeline viability evaluation passes `options.snapshot` to compiled predicates when provided
2. Unit test: pipeline viability evaluation still calls compiled predicates with `undefined` snapshot when not provided
3. Unit test: both execution and discovery predicate paths thread `options.snapshot` through compiled predicate evaluation
4. Existing targeted suite and broader engine checks pass
5. Unit test: when `options.snapshot.activePlayer !== evalCtx.activePlayer`, compiled predicate evaluation ignores the snapshot and uses raw state semantics

### Invariants

1. Public evaluation function positional signatures do not change; existing callers that omit `options.snapshot` continue to work identically.
2. No fields added to `ReadContext` or any other hot-path kernel object.
3. The non-compiled interpreter fallback path is completely unaffected.
4. `evaluateCompiledPredicate` remains a private (non-exported) function.
5. Execution-time evaluation surfaces that do not own an enumeration snapshot remain unchanged.
6. Snapshot use never changes predicate semantics for evaluation contexts whose execution player differs from the snapshot's player.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/pipeline-viability-policy.test.ts` — extend the existing policy test file with focused snapshot-threading coverage instead of creating a separate one-off test file.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/pipeline-viability-policy.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo typecheck`
5. `pnpm turbo lint`

## Outcome

- Completed: 2026-03-28
- What actually changed:
  - Extended `pipeline-viability-policy.ts` to thread `snapshot` through the existing predicate `options` bag instead of adding a new positional parameter.
  - Gated snapshot use so compiled predicates only receive it when `evalCtx.activePlayer === snapshot.activePlayer`.
  - Created the enumeration snapshot once per `enumerateRawLegalMoves` call and passed it through the legal-move discovery call sites that own that enumeration scope.
  - Added focused policy tests covering execution-path threading, discovery-path threading, no-snapshot fallback, and mismatched-player safety.
- Deviations from original plan:
  - The ticket originally proposed changing only `pipeline-viability-policy.ts` and adding a new positional `snapshot` argument on public evaluation functions. The final implementation kept the public positional signatures stable, used the existing `options` object as the extension point, and updated `legal-moves.ts` because enumeration is the caller that actually owns the snapshot.
  - The original ticket did not account for executor contexts where `evalCtx.activePlayer` differs from the snapshot player. The final implementation added an explicit safety guard instead of blindly passing the snapshot.
- Verification results:
  - `pnpm turbo build` ✅
  - `node --test packages/engine/dist/test/unit/kernel/pipeline-viability-policy.test.js` ✅
  - `pnpm -F @ludoforge/engine test` ✅
  - `pnpm turbo typecheck` ✅
  - `pnpm turbo lint` ✅
