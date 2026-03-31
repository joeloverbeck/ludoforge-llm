# 101STRACONPRO-003: Ref path parsing for `condition.*` in policy-surface.ts

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — agents policy-surface.ts
**Deps**: `archive/tickets/101STRACONPRO-001.md`

## Problem

The policy surface ref path parser does not recognize `condition.COND_ID.satisfied` or `condition.COND_ID.proximity` paths. These ref paths must be parsed and resolved to `CompiledAgentPolicyRef` values with kind `'strategicCondition'` so that policy expressions can reference strategic condition state.

## Assumption Reassessment (2026-03-31)

1. `policy-surface.ts` parses ref paths using string prefix matching. `victory.currentMargin.` at line 99 and `activeCard.hasTag.` at line 151 are the established patterns. Confirmed — `condition.` will follow the same approach.
2. The parser splits ref paths into segments, validates against the compiled catalog, and produces `CompiledAgentPolicyRef` values. Confirmed.
3. After ticket 001, the `CompiledAgentPolicyRef` union includes the `{ kind: 'strategicCondition'; conditionId: string; field: 'satisfied' | 'proximity' }` variant.

## Architecture Check

1. Follows the exact pattern of `victory.currentMargin.SEAT` and `activeCard.hasTag.TAG` parsing — prefix match, extract ID, validate against catalog, return typed ref.
2. Ref paths are generic string patterns — no game-specific knowledge in the parser.
3. No backwards-compatibility shims.

## What to Change

### 1. Parse `condition.COND_ID.FIELD` ref paths

In the ref path resolution function in `policy-surface.ts`, add a branch:

```typescript
if (refPath.startsWith('condition.')) {
  const rest = refPath.slice('condition.'.length);
  const dotIdx = rest.indexOf('.');
  if (dotIdx === -1) {
    // emit diagnostic: missing field after condition ID
  }
  const conditionId = rest.slice(0, dotIdx);
  const field = rest.slice(dotIdx + 1);
  // Validate conditionId exists in catalog.library.strategicConditions
  // Validate field is 'satisfied' or 'proximity'
  // If field is 'proximity', validate condition has proximity defined
  // Return { kind: 'strategicCondition', conditionId, field }
}
```

### 2. Type inference for ref

- `condition.COND_ID.satisfied` → type `boolean`
- `condition.COND_ID.proximity` → type `number`

### 3. Visibility classification

Strategic condition refs are state-scoped (evaluated once per decision point, shared across candidates). They should be classified with the same visibility/cost as state features.

## Files to Touch

- `packages/engine/src/agents/policy-surface.ts` (modify) — ref path parsing for `condition.*`

## Out of Scope

- Type definitions (ticket 001)
- Compilation logic (ticket 002)
- Runtime evaluation (ticket 004)
- Integration tests (ticket 005)

## Acceptance Criteria

### Tests That Must Pass

1. `condition.vcPivotalReady.satisfied` parses to `{ kind: 'strategicCondition', conditionId: 'vcPivotalReady', field: 'satisfied' }` with boolean type
2. `condition.vcPivotalReady.proximity` parses to `{ kind: 'strategicCondition', conditionId: 'vcPivotalReady', field: 'proximity' }` with number type
3. `condition.nonExistent.satisfied` produces a diagnostic (unknown condition ID)
4. `condition.vcPivotalReady.badField` produces a diagnostic (invalid field)
5. `condition.vcPivotalReady` (no field) produces a diagnostic
6. Condition without `proximity` defined: `condition.X.proximity` produces a diagnostic
7. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Ref path parsing follows the same prefix-match pattern as `victory.currentMargin.*` and `activeCard.hasTag.*`
2. No game-specific identifiers in parsing logic
3. Type inference is consistent: `satisfied` → boolean, `proximity` → number

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-surface-strategic-condition.test.ts` — new file covering: valid ref parsing, unknown condition diagnostic, invalid field diagnostic, missing field diagnostic, proximity-without-definition diagnostic, type inference correctness

### Commands

1. `node --test packages/engine/test/unit/agents/policy-surface-strategic-condition.test.ts`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`

## Outcome

- **Completion date**: 2026-03-31
- **What changed**:
  - `packages/engine/src/agents/policy-surface.ts` — added `parseStrategicConditionRef()` function with `ParsedStrategicConditionRef`, `StrategicConditionParseError`, `StrategicConditionRefField` types. Standalone function parsing `condition.COND_ID.FIELD` ref paths with full validation and type inference.
  - `packages/engine/src/cnl/compile-agents.ts` — refactored inline `condition.*` parsing in `resolveRef` to call `parseStrategicConditionRef`, preserving lazy compilation.
  - `packages/engine/test/unit/agents/policy-surface-strategic-condition.test.ts` — new test file covering all 6 acceptance criteria.
- **Deviations from original plan**: Ticket described adding a branch inside `parseAuthoredPolicySurfaceRef`, but that function returns `ResolvedPolicySurfaceRef` (surface refs only), which cannot hold `{ kind: 'strategicCondition' }`. Per FOUNDATIONS.md #15 (Architectural Completeness), a new standalone `parseStrategicConditionRef` function was created instead. The existing inline parsing in `compile-agents.ts` (from ticket 002) was refactored to call it.
- **Verification**: `pnpm turbo typecheck` pass, `pnpm turbo lint` pass, `pnpm -F @ludoforge/engine test` 5340/5340 pass.
