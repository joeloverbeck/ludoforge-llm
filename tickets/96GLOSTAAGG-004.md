# 96GLOSTAAGG-004: Implement `globalZoneAgg` expression compilation and evaluation

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — agents (compilation + evaluation)
**Deps**: 96GLOSTAAGG-001, 96GLOSTAAGG-002, `packages/engine/src/agents/policy-expr.ts`, `packages/engine/src/agents/policy-evaluation-core.ts`

## Problem

There is no way for PolicyAgent state features to aggregate zone-level properties (runtime variables like opposition/support, or static attributes like population) across all board zones. The `globalZoneAgg` expression kind fills this gap — enabling features like "total opposition across all provinces" or "count of zones with population > 0".

## Assumption Reassessment (2026-03-30)

1. Zone variables live in `state.zoneVars[zoneId]` as `Readonly<Record<string, number>>` — confirmed in kernel types. These are runtime-mutable values (support, opposition, control).
2. Zone attributes live in `ZoneDef.attributes` as `Readonly<Record<string, AttributeValue>>` — confirmed in `types-core.ts`. These are static metadata (population, terrain values).
3. `AttributeValue` is `number | string | boolean` — confirmed. For numeric aggregation (`sum`, `min`, `max`), only numeric values are meaningful.
4. The helpers from 96GLOSTAAGG-002 (`matchesZoneFilter`, `matchesZoneScope`) are available for zone iteration filtering.
5. When `aggOp` is `count`, the result is the number of matching zones — `field` is ignored. This is a spec-defined behavior.

## Architecture Check

1. `globalZoneAgg` mirrors `globalTokenAgg` in structure but aggregates zone-level data instead of token data. The two-source design (`'variable'` for runtime zoneVars, `'attribute'` for static ZoneDef attributes) cleanly separates mutable and immutable data sources.
2. Pure read-only aggregation — Foundation #5 (determinism) and #7 (immutability) preserved.
3. Bounded: iterates `def.zones` — `O(zones)` per evaluation (Foundation #6).
4. No game-specific logic — `field`, `source`, and filters are all parameterized (Foundation #1).

## What to Change

### 1. Add `analyzeGlobalZoneAggOperator` to `policy-expr.ts`

YAML input shape:
```yaml
globalZoneAgg:
  source: variable        # 'variable' | 'attribute'
  field: opposition       # zone variable or attribute name
  aggOp: sum              # count | sum | min | max
  zoneFilter: { category: province }
  zoneScope: board        # optional, defaults to 'board'
```

Validation:
- `source` must be `'variable'` or `'attribute'`.
- `field` must be a non-empty string.
- `aggOp` must be one of `count | sum | min | max`.
- `field` is ignored when `aggOp` is `count` (but still required for structural consistency — validated as present but not used at runtime).
- `zoneFilter` is optional.
- `zoneScope` is optional (defaults to `'board'`).

Returns `PolicyExprAnalysis` with `valueType: 'number'`, `costClass: 'state'`.

### 2. Wire into `analyzePolicyExpr` dispatcher

Add `'globalZoneAgg'` to the `KnownOperator` set and the switch statement.

### 3. Add `evaluateGlobalZoneAggregate` to `policy-evaluation-core.ts`

Iterates `this.input.def.zones`, applies zone scope + zone filter. For each matching zone:

- **`source: 'variable'`**: reads `state.zoneVars[zoneId][field]` (number).
- **`source: 'attribute'`**: reads `zoneDef.attributes?.[field]`, coerces to number if possible.

Accumulates via aggOp. Returns 0 for empty results.

For `count`: counts matching zones (ignores field value).

### 4. Wire into `evaluateExpr` dispatcher

Add `case 'globalZoneAgg'` to the switch in `PolicyEvaluationContext.evaluateExpr`.

## Files to Touch

- `packages/engine/src/agents/policy-expr.ts` (modify) — add analyzer, wire into dispatcher
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify) — add evaluator, wire into dispatcher
- `packages/engine/test/unit/agents/policy-expr.test.ts` (modify) — compilation tests
- `packages/engine/test/unit/agents/policy-eval.test.ts` (modify) — evaluation tests

## Out of Scope

- `globalTokenAgg` expression (ticket 96GLOSTAAGG-003).
- `adjacentTokenAgg` expression (ticket 96GLOSTAAGG-005).
- Integration tests with FITL data (ticket 96GLOSTAAGG-006).
- Golden file updates (ticket 96GLOSTAAGG-006).
- Schema JSON updates.
- Any runner package changes.

## Acceptance Criteria

### Tests That Must Pass

1. Compilation: valid `globalZoneAgg` with `source: variable` compiles correctly.
2. Compilation: valid `globalZoneAgg` with `source: attribute` compiles correctly.
3. Compilation: missing `source` produces diagnostic error.
4. Compilation: missing `field` produces diagnostic error.
5. Compilation: invalid `aggOp` produces diagnostic error.
6. Compilation: `zoneScope` defaults to `'board'` when omitted.
7. Evaluation: sum zone variable across board zones with category filter returns correct total.
8. Evaluation: count zones matching a variable condition (e.g., `opposition > 0`).
9. Evaluation: min/max zone attribute across matching zones.
10. Evaluation: `source: attribute` reads from `zoneDef.attributes`, not `state.zoneVars`.
11. Evaluation: `source: variable` reads from `state.zoneVars`, not `zoneDef.attributes`.
12. Evaluation: empty results (no matching zones) returns 0.
13. Evaluation: `count` ignores `field` — counts matching zones.
14. Existing suite: `pnpm turbo test`

### Invariants

1. Aggregation is pure and deterministic (Foundation #5).
2. Iteration bounded by `def.zones.length` (Foundation #6).
3. No state mutation (Foundation #7).
4. No game-specific logic (Foundation #1).
5. Existing expression kinds are unmodified.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-expr.test.ts` — `describe('globalZoneAgg compilation')`:
   - Valid variable source, valid attribute source, missing source, missing field, invalid aggOp, default zoneScope
2. `packages/engine/test/unit/agents/policy-eval.test.ts` — `describe('globalZoneAgg evaluation')`:
   - Sum variable across provinces, count zones with variable condition, min/max attribute, source: variable vs attribute, empty results, count ignores field

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "globalZoneAgg"`
2. `pnpm turbo test`
3. `pnpm turbo typecheck`
