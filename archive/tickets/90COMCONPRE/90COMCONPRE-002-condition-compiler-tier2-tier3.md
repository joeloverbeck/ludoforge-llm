# 90COMCONPRE-002: Condition compiler — Tier 2 aggregate counts + Tier 3 boolean combinations

**Status**: ✅ COMPLETED
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

1. `ValueExpr` with `_t: 5` is the aggregate tag, but its concrete shapes are stricter than the original ticket implied: `count` carries only `{ op: 'count', query: OptionsQuery }`, while `sum`/`min`/`max` additionally require `bind` and `valueExpr`. Tier 2 should only target the `count` branch.
2. The simple zone-token aggregate shape in the current AST is `{ _t: 5, aggregate: { op: 'count', query: { query: 'tokensInZone', zone, filter? } } }`, not `{ query: 'tokens', zone: ... }`.
3. `OptionsQuery.zone` is a `ZoneRef`, so not every zone selector is statically compilable. Tier 2 should only compile a direct string zone selector and must return `null` for `{ zoneExpr: ... }` and any filtered token query.
4. The interpreter throws `MISSING_VAR` when a referenced zone is absent from `state.zones`. The compiled Tier 2 closure must preserve that behavior; a permissive `?.length ?? 0` fast-path would be incorrect.
5. `ConditionAST` supports `{ op: 'and', args: NonEmptyReadonlyArray<ConditionAST> }`, `{ op: 'or', args: NonEmptyReadonlyArray<ConditionAST> }`, and `{ op: 'not', arg: ConditionAST }`. Empty `and`/`or` arrays are not representable and should not appear in this ticket’s scope or tests.
6. Kernel unit coverage for this module lives in `packages/engine/test/unit/kernel/condition-compiler.test.ts`, and engine test scripts run against built `dist/` output. The ticket’s original test path and targeted command were inaccurate.
7. `and`/`or` compilation should remain all-or-nothing: if every child compiles, combine them; if any child does not compile, return `null` for the whole boolean expression.

## Architecture Check

1. **Tier 2 design**: Only compile the narrow, structurally stable aggregate shape that maps cleanly to existing kernel state: `count(tokensInZone(<static zone>))` with no token filter. That is the smallest addition that materially improves coverage without duplicating `evalQuery`’s broader semantics inside the compiler.
2. **Tier 2 robustness requirement**: Reuse a shared internal "zone count" accessor shape instead of inventing a second aggregate-specific lookup path with different error behavior. This keeps compiled aggregate semantics aligned with the existing interpreter contract and creates a cleaner extension point if future tickets add `zoneCount` or other direct count-like refs.
3. **Tier 3 design**: Recursive compilation of `and`/`or`/`not`, preserving JavaScript short-circuit behavior via ordered closure composition. All-or-nothing remains the right boundary here; partial compilation would complicate the architecture without establishing a durable abstraction.
4. **Architectural judgment**: These changes are worthwhile relative to the current architecture because they extend an already clean compiler boundary introduced in ticket 001. They do not contaminate the interpreter, do not add aliasing or compatibility layers, and they increase future extensibility only if the compiler stays strict about which AST shapes it owns.
5. **Agnosticism preserved**: All compiled patterns are generic ConditionAST / OptionsQuery shapes — no game-specific logic.

## What to Change

### 1. Add Tier 2: `tryCompileAggregateCount`

In `condition-compiler.ts`, add a function that recognizes aggregate count patterns in `ValueExpr`:
- Accept only `aggregate.op === 'count'` with `aggregate.query.query === 'tokensInZone'`
- Accept only a direct string `query.zone` selector and no `query.filter`
- Compile to a direct zone-token-count accessor over `state.zones[zoneId]`
- Preserve interpreter-visible missing-zone behavior (`MISSING_VAR`) when `state.zones[zoneId]` is absent
- Return `null` for all other aggregate shapes, including filtered token queries, dynamic zone refs, `tokensInMapSpaces`, and non-`count` aggregates

Wire this into `tryCompileValueExpr` for `_t: 5` (AGGREGATE) tag.

### 2. Add Tier 3: `and`/`or`/`not` compilation

In `tryCompileCondition`:
- `op: 'and'`: recursively compile all args. If all succeed, return `(s, p, b) => compiled_1(s,p,b) && compiled_2(s,p,b) && ...`
- `op: 'or'`: recursively compile all args. If all succeed, return `(s, p, b) => compiled_1(s,p,b) || compiled_2(s,p,b) || ...`
- `op: 'not'`: compile the single arg. If it succeeds, return `(s, p, b) => !compiled(s,p,b)`
- If any sub-condition fails to compile, return `null` for the whole expression

## Files to Touch

- `packages/engine/src/kernel/condition-compiler.ts` (modify — add Tier 2/3)
- `packages/engine/test/unit/kernel/condition-compiler.test.ts` (modify — add Tier 2/3 tests)

## Out of Scope

- Complex aggregate patterns (sum, min, max, filtered queries, dynamic `zoneExpr` refs, `tokensInMapSpaces`, nested value expressions)
- Spatial condition operators (`adjacent`, `connected`, `zonePropIncludes`, `markerStateAllowed`, `markerShiftAllowed`)
- The `in` operator
- Partial compilation of `and`/`or` (mixing compiled and interpreted sub-conditions)
- WeakMap cache infrastructure — ticket 003
- Integration into pipeline-viability-policy.ts — ticket 004
- Modifying `evalCondition`, `evalValue`, `resolveRef`, or any existing kernel function

## Acceptance Criteria

### Tests That Must Pass

1. `tryCompileValueExpr` returns a compiled accessor for `{ _t: 5, aggregate: { op: 'count', query: { query: 'tokensInZone', zone: 'some-zone' } } }` that returns the correct token count
2. The compiled Tier 2 accessor throws the same `MISSING_VAR` error class as the interpreter when the referenced zone is absent from `state.zones`
3. `tryCompileValueExpr` returns `null` for non-compilable aggregate patterns (for example filtered `tokensInZone`, dynamic `{ zoneExpr: ... }`, `tokensInMapSpaces`, or non-`count` aggregates)
4. `tryCompileCondition` for `{ op: 'and', args: [compilable_1, compilable_2] }` returns a closure that short-circuits correctly
5. `tryCompileCondition` for `{ op: 'or', args: [compilable_1, compilable_2] }` returns a closure that short-circuits correctly
6. `tryCompileCondition` for `{ op: 'not', arg: compilable }` returns a closure that negates correctly
7. `tryCompileCondition` for `{ op: 'and', args: [compilable, NON_compilable] }` returns `null` (all-or-nothing)
8. Nested boolean combinations work (for example `and(or(a, b), not(c))`) when all leaves are compilable
9. Existing suite: `pnpm turbo test`

### Invariants

1. Compiled Tier 2/3 closures produce identical results and matching error behavior to the interpreter for the AST shapes they support
2. Short-circuit evaluation order matches JavaScript `&&`/`||` semantics
3. No partial compilation — `and`/`or` either fully compiles or returns `null`
4. No fields added to `GameDefRuntime` or any hot-path object

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/condition-compiler.test.ts` — extend with Tier 2 aggregate count tests and Tier 3 boolean combination tests, including matching missing-zone error behavior, nested boolean compositions, and mixed compilable/non-compilable trees

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/condition-compiler.test.js`
3. `pnpm turbo test`
4. `pnpm turbo typecheck`
5. `pnpm turbo lint`

## Outcome

- Completed: 2026-03-28
- What actually changed:
  - Extended `packages/engine/src/kernel/condition-compiler.ts` with Tier 2 compilation for the narrow, direct `count(tokensInZone(<static zone>))` shape.
  - Added Tier 3 compilation for all-or-nothing `and` / `or` / `not` condition trees.
  - Preserved interpreter-visible missing-zone behavior for compiled aggregate counts instead of introducing a permissive zero-default shortcut.
  - Expanded `packages/engine/test/unit/kernel/condition-compiler.test.ts` to cover aggregate count compilation, missing-zone invariants, short-circuit behavior, nested boolean trees, and explicit non-compilable fallthrough cases.
- Deviations from the original ticket text:
  - Tightened Tier 2 scope to the real AST shape used by the engine: `tokensInZone`, not a generic `tokens` query.
  - Excluded empty-args boolean edge cases because `ConditionAST` encodes `and` / `or` args as non-empty arrays.
  - Corrected the test file path and targeted validation command to the repo’s built-`dist` Node test workflow.
- Verification:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/kernel/condition-compiler.test.js`
  - `pnpm turbo test`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
