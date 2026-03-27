# 87UNIVIAPIP-002: Add discoveryCache to ResolveMoveDecisionSequenceOptions and cache lookup in resolveMoveDecisionSequence

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel/move-decision-sequence.ts
**Deps**: archive/tickets/87UNIVIAPIP-001.md

## Problem

`resolveMoveDecisionSequence` (move-decision-sequence.ts:42-138) calls `legalChoicesDiscover` on every iteration of its decision-probing loop (line 62). When a `DiscoveryCache` is available from prior enumeration, the first call per move could be served from cache, eliminating redundant partial effect execution.

## Assumption Reassessment (2026-03-27)

1. `resolveMoveDecisionSequence` calls `legalChoicesDiscover(def, state, move, ...)` at line 62 inside a `for` loop — confirmed.
2. The first iteration uses the original `baseMove` (line 59: `let move = baseMove`). Subsequent iterations use a mutated move with params filled in — confirmed.
3. The cache only helps on the **first iteration** (step 0) when `move === baseMove`. After that, the move has new params and won't match the cache key — this is correct and expected.
4. `ResolveMoveDecisionSequenceOptions` is defined at line 21 with `choose`, `budgets`, `onWarning` — confirmed.
5. `ResolveMoveDecisionSequenceOptions` is an options bag on the cold path — adding a field won't affect V8 hidden classes on hot-path objects — confirmed per spec V8 safety analysis.

## Architecture Check

1. Adding an optional `discoveryCache` field to an existing options interface is the minimal change — no new function signatures, no wrapper functions.
2. The cache lookup is a simple `Map.get` check before the existing `legalChoicesDiscover` call — a 2-line change in the loop body.
3. No shims or compatibility aliases — callers that omit `discoveryCache` get identical behavior.

## What to Change

### 1. Add `discoveryCache` to `ResolveMoveDecisionSequenceOptions`

```typescript
export interface ResolveMoveDecisionSequenceOptions {
  readonly choose?: (request: ChoicePendingRequest) => MoveParamValue | undefined;
  readonly budgets?: Partial<MoveEnumerationBudgets>;
  readonly onWarning?: (warning: RuntimeWarning) => void;
  readonly discoveryCache?: DiscoveryCache;
}
```

### 2. Cache lookup in `resolveMoveDecisionSequence` loop

Replace line 62:

```typescript
const request = legalChoicesDiscover(def, state, move, { ... }, runtime);
```

With:

```typescript
const cached = options?.discoveryCache?.get(move);
const request = cached ?? legalChoicesDiscover(def, state, move, {
  onDeferredPredicatesEvaluated: (count) => {
    deferredPredicatesEvaluated += count;
  },
}, runtime);
```

**Important**: When a cache hit occurs, `deferredPredicatesEvaluated` is NOT incremented for the cached call's predicates. This is safe because:
- The deferred predicate budget was already checked during enumeration when the original call was made.
- The budget in `resolveMoveDecisionSequence` is a separate budget instance scoped to this resolve call.
- A cache hit on step 0 means the exact same `ChoiceRequest` is returned — the resolve loop processes it identically.

## Files to Touch

- `packages/engine/src/kernel/move-decision-sequence.ts` (modify) — add `discoveryCache` field to `ResolveMoveDecisionSequenceOptions`, add cache lookup in `resolveMoveDecisionSequence` loop

## Out of Scope

- `legal-moves.ts` — callers are NOT updated here (that's 87UNIVIAPIP-003 and 87UNIVIAPIP-004)
- `apply-move.ts` — `probeMoveViability` is NOT changed here (that's 87UNIVIAPIP-004)
- `decision-sequence-satisfiability.ts` — no changes
- The `classifyMoveDecisionSequenceSatisfiability` function — already handled in 87UNIVIAPIP-001
- Any hot-path object shapes

## Acceptance Criteria

### Tests That Must Pass

1. All existing tests that call `resolveMoveDecisionSequence` pass unchanged (cache is optional, defaults to undefined → no cache lookup).
2. `pnpm turbo test` passes with no regressions.
3. `pnpm turbo typecheck` passes.

### Invariants

1. When `discoveryCache` is omitted or undefined, behavior is identical to current code.
2. When a cache hit occurs, the returned `ChoiceRequest` is the exact same object that was stored during enumeration — no cloning, no transformation.
3. No new fields on Move, MoveEnumerationState, ClassifiedMove, EffectCursor, ReadContext, or GameDefRuntime.
4. The `resolveMoveDecisionSequence` function signature remains backwards-compatible (optional field in existing options bag).

## Test Plan

### New/Modified Tests

1. No new tests required in this ticket — cache correctness is tested in 87UNIVIAPIP-005.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
