# 96GLOSTAAGG-003: Implement `globalTokenAgg` expression compilation and evaluation

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — agents (compilation + evaluation)
**Deps**: 96GLOSTAAGG-001, 96GLOSTAAGG-002, `packages/engine/src/agents/policy-expr.ts`, `packages/engine/src/agents/policy-evaluation-core.ts`

## Problem

There is no way for PolicyAgent state features to aggregate tokens across all board zones. The existing `zoneTokenAgg` only operates on a single named zone. The `globalTokenAgg` expression kind must be compilable from YAML and evaluable at runtime to count/sum/min/max tokens matching a filter across all (or filtered) board zones.

## Assumption Reassessment (2026-03-30)

1. `analyzePolicyExpr` in `policy-expr.ts` dispatches on a `KnownOperator` set and a switch statement — new expression kinds must be added to both.
2. The existing `analyzeZoneTokenAggOperator` pattern (validate fields, resolve zone source, return typed `AgentPolicyExpr` node) serves as the template for the new analyzer.
3. `PolicyEvaluationContext.evaluateExpr` dispatches on `expr.kind` — new cases must be added.
4. The helpers from 96GLOSTAAGG-002 (`matchesTokenFilter`, `matchesZoneFilter`, `matchesZoneScope`, `resolveTokenFilter`) are available.
5. `GameDef.zones` is the array of `ZoneDef` used for iteration — confirmed in `types-core.ts`.
6. `state.zones[zoneId]` returns the token array for a zone — confirmed in kernel types.

## Architecture Check

1. `globalTokenAgg` follows the same compilation pattern as `zoneTokenAgg` (field validation → typed AST node) and the same evaluation pattern (iterate collection → apply filter → accumulate). The code structure mirrors existing patterns exactly.
2. The expression is a pure read-only aggregation over finite collections (Foundation #5 determinism, #6 bounded computation, #7 immutability).
3. Cost class is `'state'` — evaluated once per policy evaluation, cached. No candidate-level dependency.
4. No game-specific logic: token filter uses generic `type`/`props`, zone filter uses generic `category`/`attribute`/`variable`. Foundation #1 preserved.

## What to Change

### 1. Add `analyzeGlobalTokenAggOperator` to `policy-expr.ts`

YAML input shape:
```yaml
globalTokenAgg:
  tokenFilter: { type: "base", props: { seat: { eq: self } } }
  aggOp: count
  prop: strength         # required for sum/min/max, ignored for count
  zoneFilter: { category: province }
  zoneScope: board       # optional, defaults to 'board'
```

Validation:
- `aggOp` must be one of `count | sum | min | max`.
- `prop` is required when `aggOp` is `sum | min | max`; optional for `count`.
- `tokenFilter` is optional (undefined = match all tokens).
- `zoneFilter` is optional (undefined = all zones in scope).
- `zoneScope` is optional (defaults to `'board'`).
- `tokenFilter.props` values must have `{ eq: <literal> }` shape.

Returns `PolicyExprAnalysis` with `valueType: 'number'`, `costClass: 'state'`.

### 2. Wire into `analyzePolicyExpr` dispatcher

Add `'globalTokenAgg'` to the `KnownOperator` set and the switch statement.

### 3. Add `evaluateGlobalTokenAggregate` to `policy-evaluation-core.ts`

Iterates `this.input.def.zones`, applies zone scope + zone filter, then iterates tokens in matching zones, applies token filter, and accumulates via aggOp.

Returns `number` (count) or `number` (sum/min/max of `token.props[prop]`). Returns 0 for empty results.

### 4. Wire into `evaluateExpr` dispatcher

Add `case 'globalTokenAgg'` to the switch in `PolicyEvaluationContext.evaluateExpr`.

## Files to Touch

- `packages/engine/src/agents/policy-expr.ts` (modify) — add analyzer, wire into dispatcher
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify) — add evaluator, wire into dispatcher
- `packages/engine/test/unit/agents/policy-expr.test.ts` (modify) — compilation tests
- `packages/engine/test/unit/agents/policy-eval.test.ts` (modify) — evaluation tests

## Out of Scope

- `globalZoneAgg` expression (ticket 96GLOSTAAGG-004).
- `adjacentTokenAgg` expression (ticket 96GLOSTAAGG-005).
- Integration tests with FITL data (ticket 96GLOSTAAGG-006).
- Golden file updates (ticket 96GLOSTAAGG-006).
- Refactoring existing `zoneTokenAgg` to use new helpers.
- Schema JSON updates.
- Any runner package changes.

## Acceptance Criteria

### Tests That Must Pass

1. Compilation: valid `globalTokenAgg` YAML compiles to correct `AgentPolicyExpr` node with all fields.
2. Compilation: missing `aggOp` produces diagnostic error.
3. Compilation: `aggOp: sum` without `prop` produces diagnostic error.
4. Compilation: `aggOp: count` without `prop` compiles successfully.
5. Compilation: invalid `tokenFilter.props` shape produces diagnostic error.
6. Compilation: `zoneScope` defaults to `'board'` when omitted.
7. Evaluation: count tokens matching type filter across 3 zones returns correct count.
8. Evaluation: sum token prop values across zones with zone filter returns correct sum.
9. Evaluation: min/max token prop across zones returns correct extrema.
10. Evaluation: empty state (no matching tokens) returns 0.
11. Evaluation: `zoneScope: 'board'` excludes aux zones; `zoneScope: 'all'` includes them.
12. Evaluation: `'self'` in token filter props resolves to evaluating player's ID.
13. Existing suite: `pnpm turbo test`

### Invariants

1. Aggregation is a pure function of game state — deterministic (Foundation #5).
2. Iteration is bounded by `def.zones.length * maxTokensPerZone` (Foundation #6).
3. No state mutation (Foundation #7).
4. No game-specific logic (Foundation #1).
5. Existing expression kinds (`literal`, `param`, `ref`, `op`, `zoneProp`, `zoneTokenAgg`) are unmodified.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-expr.test.ts` — `describe('globalTokenAgg compilation')`:
   - Valid count expression, valid sum expression, missing aggOp, missing prop for sum, invalid tokenFilter, default zoneScope, explicit zoneScope
2. `packages/engine/test/unit/agents/policy-eval.test.ts` — `describe('globalTokenAgg evaluation')`:
   - Count across 3 board zones with type filter, sum with prop and zone filter, min/max, empty state, zone scope board vs all, self resolution in token filter

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "globalTokenAgg"`
2. `pnpm turbo test`
3. `pnpm turbo typecheck`
