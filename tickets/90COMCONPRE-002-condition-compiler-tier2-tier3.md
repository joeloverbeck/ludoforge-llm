# 90COMCONPRE-002: Condition compiler — Tier 2 aggregate counts + Tier 3 boolean combinations

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — extend kernel module
**Deps**: 90COMCONPRE-001

## Problem

Tier 1 covers scalar comparisons (gvar, pvar, binding). This ticket adds:
- **Tier 2**: Aggregate count checks — `count tokens in zone > 0` patterns, which are common in FITL pipeline legality conditions.
- **Tier 3**: Boolean combinations — `and`/`or`/`not` over compilable sub-conditions.

Together with Tier 1, these tiers cover ~85% of FITL pipeline conditions.

## Assumption Reassessment (2026-03-28)

1. `ValueExpr` with `_t: 5` is the aggregate tag, containing `{ aggregate: { op: 'count'|'sum'|'min'|'max', query: QuerySpec, valueExpr?: ValueExpr } }` — confirmed in `types-ast.ts`.
2. `ConditionAST` supports `{ op: 'and', args: [...] }`, `{ op: 'or', args: [...] }`, and `{ op: 'not', arg: ... }` — confirmed.
3. Simple aggregate count queries (count tokens in a specific zone) can be compiled to direct state lookups without calling `evalQuery`. More complex queries (with filters, nested value expressions) should fall through as non-compilable.
4. `and`/`or` compilation is all-or-nothing per the spec: if ALL args compile, combine; if ANY arg fails, the whole `and`/`or` returns `null`. No partial compilation.

## Architecture Check

1. **Tier 2 design**: Only compiles the simplest aggregate pattern — `count` with a direct zone reference and no complex filters. This covers the most common FITL pattern (`count troops in province > 0`) while keeping the compiler simple. Complex aggregates fall through to the interpreter.
2. **Tier 3 design**: Recursive compilation of `and`/`or`/`not`. Short-circuit semantics preserved: `&&` for `and`, `||` for `or`. The all-or-nothing approach avoids partial compilation complexity.
3. **Agnosticism preserved**: All patterns are generic ConditionAST shapes — no game-specific logic.

## What to Change

### 1. Add Tier 2: `tryCompileAggregateCount`

In `condition-compiler.ts`, add a function that recognizes aggregate count patterns in `ValueExpr`:
- Aggregate with `op: 'count'` and a simple zone query (zone specified as a literal string)
- Compiles to direct state lookup: `(state) => state.zones[zoneId]?.tokens.length ?? 0` (or equivalent based on actual zone token storage)
- Returns `null` for complex queries (filters, nested expressions, non-literal zone references)

Wire this into `tryCompileValueExpr` for `_t: 5` (AGGREGATE) tag.

### 2. Add Tier 3: `and`/`or`/`not` compilation

In `tryCompileCondition`:
- `op: 'and'`: recursively compile all args. If all succeed, return `(s, p, b) => compiled_1(s,p,b) && compiled_2(s,p,b) && ...`
- `op: 'or'`: recursively compile all args. If all succeed, return `(s, p, b) => compiled_1(s,p,b) || compiled_2(s,p,b) || ...`
- `op: 'not'`: compile the single arg. If it succeeds, return `(s, p, b) => !compiled(s,p,b)`
- If any sub-condition fails to compile, return `null` for the whole expression

## Files to Touch

- `packages/engine/src/kernel/condition-compiler.ts` (modify — add Tier 2/3)
- `packages/engine/test/unit/condition-compiler.test.ts` (modify — add Tier 2/3 tests)

## Out of Scope

- Complex aggregate patterns (sum, min, max, filtered queries, nested value expressions)
- Spatial condition operators (`adjacent`, `connected`, `zonePropIncludes`, `markerStateAllowed`, `markerShiftAllowed`)
- The `in` operator
- Partial compilation of `and`/`or` (mixing compiled and interpreted sub-conditions)
- WeakMap cache infrastructure — ticket 003
- Integration into pipeline-viability-policy.ts — ticket 004
- Modifying `evalCondition`, `evalValue`, `resolveRef`, or any existing kernel function

## Acceptance Criteria

### Tests That Must Pass

1. `tryCompileValueExpr` returns a compiled accessor for `{ _t: 5, aggregate: { op: 'count', query: { query: 'tokens', zone: 'some-zone' } } }` that returns the correct token count
2. `tryCompileValueExpr` returns `null` for complex aggregate patterns (e.g., with filters or non-literal zone refs)
3. `tryCompileCondition` for `{ op: 'and', args: [compilable_1, compilable_2] }` returns a closure that short-circuits correctly
4. `tryCompileCondition` for `{ op: 'or', args: [compilable_1, compilable_2] }` returns a closure that short-circuits correctly
5. `tryCompileCondition` for `{ op: 'not', arg: compilable }` returns a closure that negates correctly
6. `tryCompileCondition` for `{ op: 'and', args: [compilable, NON_compilable] }` returns `null` (all-or-nothing)
7. Nested boolean combinations work (e.g., `and(or(a, b), not(c))` when all leaves are compilable)
8. Existing suite: `pnpm turbo test`

### Invariants

1. Compiled Tier 2/3 closures produce identical boolean results to `evalCondition` for the same inputs
2. Short-circuit evaluation order matches JavaScript `&&`/`||` semantics
3. No partial compilation — `and`/`or` either fully compiles or returns `null`
4. No fields added to `GameDefRuntime` or any hot-path object

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/condition-compiler.test.ts` — extend with Tier 2 aggregate count tests and Tier 3 boolean combination tests, including edge cases (empty and/or args, deeply nested, mixed compilable/non-compilable)

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "condition-compiler"`
2. `pnpm turbo test`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`
