# 65MCTSCHODECARC-002: Array-Valued Move Params for `chooseN` Decision Nodes

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/agents/mcts/decision-expansion.ts`
**Deps**: 65MCTSCHODECARC-001

## Problem

`advancePartialMove` (via `advanceMainParams` and `advanceCompoundSAParams`) stores `chooseN` option values as bare scalars in `move.params[decisionKey]`. The kernel's `applyChooseN` requires `Array.isArray(move.params[bind])`. This ticket fixes the param storage to produce arrays for `chooseN` decisions.

## What to Change

### 1. Modify `advanceMainParams`

When the decision type is `chooseN`, accumulate into an array instead of overwriting:

```typescript
function advanceMainParams(
  partialMove: Move,
  decisionKey: string,
  value: MoveParamValue,
  decisionType?: 'chooseOne' | 'chooseN',  // NEW
): Move {
  if (decisionType === 'chooseN') {
    const existing = partialMove.params[decisionKey];
    const currentArray = Array.isArray(existing) ? existing : [];
    return {
      ...partialMove,
      params: { ...partialMove.params, [decisionKey]: [...currentArray, value] },
    };
  }
  return {
    ...partialMove,
    params: { ...partialMove.params, [decisionKey]: value },
  };
}
```

### 2. Modify `advanceCompoundSAParams`

Same array-accumulation logic for compound special-activity params when `decisionType === 'chooseN'`.

### 3. Modify `advancePartialMove`

Thread `decisionType` through to the underlying `advanceMainParams` / `advanceCompoundSAParams` calls.

### 4. Update call sites in `expandDecisionNode` / `expandPendingDecision`

Pass `request.type` when calling `advancePartialMove` so the function knows whether to accumulate or overwrite.

## Files to Touch

- `packages/engine/src/agents/mcts/decision-expansion.ts` (modify — `advanceMainParams`, `advanceCompoundSAParams`, `advancePartialMove`, call sites)

## Out of Scope

- Incremental selection tree structure / confirm nodes (ticket 003)
- `postCompleteSelectedMove` changes (ticket 004)
- Test fixtures (ticket 005)
- Kernel or compiler changes
- `chooseOne` behavior (must remain scalar)

## Acceptance Criteria

### Tests That Must Pass

1. Existing `decision-expansion.test.ts` tests for `chooseOne` still pass (scalar params unchanged)
2. A new unit test verifies that expanding a `chooseN` decision node produces `partialMove.params[bind]` as an array
3. A new unit test verifies that successive `chooseN` expansions accumulate values: `[]` → `['a']` → `['a', 'b']`
4. `pnpm turbo build` — no type errors
5. `pnpm turbo typecheck` — clean
6. `pnpm turbo lint` — clean

### Invariants

1. `chooseOne` expansion still produces scalar `move.params[decisionKey] = value`
2. `chooseN` expansion always produces `Array.isArray(move.params[decisionKey]) === true`
3. Compound SA params follow the same scalar/array distinction
4. Forced-sequence compression (single-option bypass) works correctly for both decision types
5. No kernel, compiler, or agent interface changes

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/mcts/decision-expansion.test.ts` — add tests:
   - `advanceMainParams` with `chooseN` produces array
   - `advanceMainParams` with `chooseOne` produces scalar (regression)
   - `advancePartialMove` accumulates array across multiple calls for `chooseN`

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern="decision-expansion"` (targeted)
2. `pnpm turbo build && pnpm turbo typecheck && pnpm turbo lint && pnpm turbo test`
