# 120WIDCOMEXP-003: Widen condition compiler — in, zonePropIncludes, marker ops

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/kernel/condition-compiler.ts`
**Deps**: `archive/tickets/120WIDCOMEXP-001.md`

## Problem

`tryCompileCondition` returns `null` for `in`, `zonePropIncludes`, `markerStateAllowed`, and `markerShiftAllowed` conditions. These are high-frequency conditions in FITL (faction membership checks, terrain tag queries, marker lattice constraints). Without compiled versions, every condition tree containing these ops falls back entirely to the interpreter, even when all other nodes in the tree are compilable.

## Assumption Reassessment (2026-04-09)

1. `tryCompileCondition` switch at line 219 handles `==`, `!=`, `<`, `<=`, `>`, `>=`, `and`, `or`, `not` — confirmed. All other ops hit the implicit `default: return null`.
2. `evalCondition` in `eval-condition.ts` handles `in`, `zonePropIncludes`, `markerStateAllowed`, `markerShiftAllowed` — confirmed. These provide the reference semantics.
3. `in` condition shape: `{ op: 'in', left: ValueExpr, right: ValueExpr }` — item membership in a set/array.
4. `zonePropIncludes` shape: `{ op: 'zonePropIncludes', zone: ValueExpr, prop: string, value: ValueExpr }` — checks if a zone property array includes a value.
5. `markerStateAllowed` / `markerShiftAllowed` use marker lattice data from `GameDef` — these need `def` access. Current compiled predicate signature does not include `def`. Need to verify how the existing pipeline compilation handles this.

## Architecture Check

1. Each new case calls `tryCompileValueExpr` on its operands. If any operand returns `null`, the condition returns `null`. Follows the established all-or-nothing pattern.
2. Marker lattice ops need `GameDef` access for the lattice definition. The compiled predicate signature `(state, activePlayer, bindings, snapshot?)` does not include `def`. Two clean options: (a) capture `def` at compilation time as a closure variable (since `GameDef` is immutable per-game), or (b) extend the accessor signature. Option (a) is preferred — it follows V8 JIT safety constraint #1 (don't add fields to hot-path interfaces) and the lattice data is constant per GameDef.
3. No game-specific logic — `in`, zone property inclusion, and marker lattice constraints are generic DSL operations.

## What to Change

### 1. Add `in` case to `tryCompileCondition`

Add `case 'in'` that:
- Compiles `left` (item) and `right` (set) via `tryCompileValueExpr`
- If either returns `null`, return `null`
- Returns a predicate that checks `Array.isArray(right) ? right.includes(left) : left === right`

### 2. Add `zonePropIncludes` case to `tryCompileCondition`

Add `case 'zonePropIncludes'` that:
- Compiles the zone and value operands via `tryCompileValueExpr`
- If either returns `null`, return `null`
- Returns a predicate that looks up the zone property array from `def` (captured at compile time) and checks inclusion

### 3. Add `markerStateAllowed` case to `tryCompileCondition`

Add `case 'markerStateAllowed'` that:
- Compiles marker, space, and state operands via `tryCompileValueExpr`
- If any returns `null`, return `null`
- Captures the marker lattice definition from `GameDef` at compile time
- Returns a predicate that checks the lattice constraint

Note: `tryCompileCondition` currently takes only a `ConditionAST` parameter. If marker ops need `GameDef` access at compile time, the function signature may need a `def` parameter. Evaluate whether to add it to `tryCompileCondition` or to create a `tryCompileConditionWithDef` variant that delegates to the existing function for non-marker cases. The implementation ticket should decide based on the cleanest integration.

### 4. Add `markerShiftAllowed` case to `tryCompileCondition`

Same pattern as `markerStateAllowed` but checks lattice transition validity instead of absolute state validity.

### 5. Parity tests

For each new case:
- Construct condition AST with compilable operands
- Evaluate via `evalCondition` (interpreter)
- Evaluate via compiled predicate
- Assert identical boolean results
- Cover: match (true), no-match (false), boundary cases

## Files to Touch

- `packages/engine/src/kernel/condition-compiler.ts` (modify)
- `packages/engine/test/kernel/condition-compiler.test.ts` (modify — add parity tests)

## Out of Scope

- `adjacent` / `connected` conditions — deferred per spec (low frequency, high complexity)
- Application site integration (ticket 006)
- Cache changes (ticket 005)

## Acceptance Criteria

### Tests That Must Pass

1. Parity test: `in` with scalar item and scalar array — compiled matches interpreter
2. Parity test: `in` with non-member — returns `false` in both paths
3. Parity test: `zonePropIncludes` with matching zone property — compiled matches interpreter
4. Parity test: `markerStateAllowed` with valid state — compiled matches interpreter
5. Parity test: `markerStateAllowed` with invalid state — returns `false` in both paths
6. Parity test: `markerShiftAllowed` with valid transition — compiled matches interpreter
7. Null-return test: `in` with non-compilable operand returns `null`
8. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `tryCompileCondition` returns `null` for any condition it cannot fully compile
2. Compiled predicates produce identical boolean results to `evalCondition` for all inputs (Foundation 8)
3. Marker lattice data captured at compile time is immutable — no mutation risk (Foundation 11)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/kernel/condition-compiler.test.ts` — parity tests for 4 new condition ops + null-return tests

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern="condition-compiler"`
2. `pnpm turbo test`
