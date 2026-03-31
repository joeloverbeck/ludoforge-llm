# 101STRACONPRO-004: Runtime evaluation & caching in policy-evaluation-core.ts

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — agents policy-evaluation-core.ts
**Deps**: `archive/tickets/101STRACONPRO-001.md`, `tickets/101STRACONPRO-003.md`

## Problem

The policy evaluation runtime does not know how to resolve `strategicCondition` refs. When `resolveRef` encounters a ref with `kind: 'strategicCondition'`, it must evaluate the condition's `target` or `proximity` expression against the current game state, cache the result per decision point, and return the appropriate value.

## Assumption Reassessment (2026-03-31)

1. `resolveRef` at `policy-evaluation-core.ts:649` is the central ref resolution dispatch. It matches on `ref.kind` and delegates to type-specific logic. Confirmed — adding a `'strategicCondition'` case follows the pattern.
2. `stateFeatureCache` at line 201 caches state feature values per decision point (`Map<string, PolicyValue>`). Confirmed — strategic conditions use the same caching lifecycle.
3. State features are evaluated once and cached: check cache → compute → store (lines 236-244). Confirmed — strategic conditions follow the same pattern.
4. `PolicyValue` is the union type for evaluation results (boolean, number, string, unknown). Confirmed.

## Architecture Check

1. Follows the exact caching pattern of state features — check cache, evaluate expression, store result. No new caching mechanism needed.
2. Condition evaluation is pure: read game state, evaluate expression, return result. No side effects.
3. Proximity clamping (`clamp(current / threshold, 0, 1)`) is a simple numeric operation — no game-specific logic.

## What to Change

### 1. Add `strategicConditionCache`

Add a dedicated cache map (or namespace within the existing `stateFeatureCache`):

```typescript
private readonly strategicConditionCache = new Map<string, PolicyValue>();
```

Clear it in the same lifecycle as `stateFeatureCache` (per decision point reset).

### 2. Add `resolveStrategicConditionRef` method

```typescript
private resolveStrategicConditionRef(
  conditionId: string,
  field: 'satisfied' | 'proximity'
): PolicyValue {
  const cacheKey = `${conditionId}.${field}`;
  if (this.strategicConditionCache.has(cacheKey)) {
    return this.strategicConditionCache.get(cacheKey)!;
  }

  const condition = this.catalog.library.strategicConditions[conditionId];
  // condition existence guaranteed by compilation

  let value: PolicyValue;
  if (field === 'satisfied') {
    value = this.evaluateExpr(condition.target, undefined);
  } else {
    // field === 'proximity'
    if (!condition.proximity) {
      value = { kind: 'unknown' }; // or 0 — should not happen if compiler validated
    } else {
      const current = this.evaluateExpr(condition.proximity.current, undefined);
      if (typeof current !== 'number') {
        value = { kind: 'unknown' };
      } else {
        value = Math.min(Math.max(current / condition.proximity.threshold, 0), 1);
      }
    }
  }

  this.strategicConditionCache.set(cacheKey, value);
  return value;
}
```

### 3. Add case to `resolveRef`

In the `resolveRef` switch/if chain, add:

```typescript
if (ref.kind === 'strategicCondition') {
  return this.resolveStrategicConditionRef(ref.conditionId, ref.field);
}
```

### 4. Cache lifecycle

Ensure `strategicConditionCache` is cleared at the same points as `stateFeatureCache` — typically at the start of each decision point evaluation.

## Files to Touch

- `packages/engine/src/agents/policy-evaluation-core.ts` (modify) — cache, `resolveStrategicConditionRef`, `resolveRef` case, cache lifecycle

## Out of Scope

- Type definitions (ticket 001)
- Compilation logic (ticket 002)
- Ref path parsing (ticket 003)
- Integration/FITL tests (ticket 005)
- Preview-based condition evaluation (`preview.condition.X.proximity`) — this is handled by the existing preview mechanism once the base evaluation works

## Acceptance Criteria

### Tests That Must Pass

1. `condition.X.satisfied` returns `true` when the target expression evaluates to true
2. `condition.X.satisfied` returns `false` when the target expression evaluates to false
3. `condition.X.proximity` returns 0.0 when current value is 0
4. `condition.X.proximity` returns 0.5 when current value is half of threshold
5. `condition.X.proximity` returns 1.0 when current value equals threshold
6. `condition.X.proximity` is clamped to 1.0 when current value exceeds threshold
7. `condition.X.proximity` is clamped to 0.0 when current value is negative
8. Condition values are cached: evaluating the same ref twice in one decision point calls the expression evaluator only once
9. Cache is cleared between decision points
10. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Strategic condition evaluation is state-scoped — same value for all candidates at a decision point
2. Proximity formula is always `clamp(current / threshold, 0, 1)`
3. No game-specific logic in evaluation code
4. Cache lifecycle matches state feature cache lifecycle

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-eval-strategic-condition.test.ts` — new file covering: boolean evaluation (true/false), proximity computation (boundary values), clamping behavior, caching verification, cache reset between decision points

### Commands

1. `node --test packages/engine/test/unit/agents/policy-eval-strategic-condition.test.ts`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`
