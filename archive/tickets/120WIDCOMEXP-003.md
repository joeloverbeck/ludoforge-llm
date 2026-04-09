# 120WIDCOMEXP-003: Widen condition compiler — in, zonePropIncludes, marker ops

**Status**: COMPLETED
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
4. `zonePropIncludes` shape: `{ op: 'zonePropIncludes', zone: ZoneSel, prop: string, value: ValueExpr }` — confirmed in `types-ast.ts`; the zone operand is a selector string, not a `ValueExpr`.
5. `markerStateAllowed` / `markerShiftAllowed` shapes use `space: ZoneSel`, `marker: string`, and dynamic `state` / `delta` value expressions — confirmed in `types-ast.ts`.
6. The current compiled predicate signature only accepts `(state, activePlayer, bindings, snapshot?)`, but `zonePropIncludes` and especially `marker*` depend on broader `ReadContext` state (`def`, adjacency/runtime resources, nested constraint evaluation). The authoritative boundary for this ticket is therefore a `ReadContext`-based compiled closure surface, not ad hoc `def` capture.

## Architecture Check

1. Each new case calls `tryCompileValueExpr` on its value operands. If any operand returns `null`, the condition returns `null`. Follows the established all-or-nothing pattern.
2. `zonePropIncludes` and `marker*` need live `ReadContext`, not just `(state, activePlayer, bindings)`: they depend on `ctx.def`, selector/runtime helpers, and marker constraint evaluation through existing `space-marker-rules.ts` helpers. The clean boundary is to update compiled condition/value closures to accept `ReadContext` directly, plus optional snapshot.
3. This preserves architectural completeness better than special-casing `def` capture: compiled closures can mirror interpreter semantics directly without inventing a second mini-context contract.
4. No game-specific logic — `in`, zone property inclusion, and marker lattice constraints are generic DSL operations.

## What to Change

### 1. Add `in` case to `tryCompileCondition`

Add `case 'in'` that:
- Compiles `item` and `set` via `tryCompileValueExpr`
- If either returns `null`, return `null`
- Returns a predicate that uses the same membership semantics as `evalCondition`

### 2. Add `zonePropIncludes` case to `tryCompileCondition`

Add `case 'zonePropIncludes'` that:
- Uses the static `ZoneSel` directly
- Compiles the value operand via `tryCompileValueExpr`
- If the value returns `null`, return `null`
- Returns a predicate that mirrors `evalCondition` zone lookup and array-membership behavior via `ReadContext`

### 3. Add `markerStateAllowed` case to `tryCompileCondition`

Add `case 'markerStateAllowed'` that:
- Uses the static `space` and `marker` operands directly
- Compiles the `state` value via `tryCompileValueExpr`
- If the value returns `null`, return `null`
- Returns a predicate that mirrors `evalCondition` marker-lattice behavior via `ReadContext` and existing `space-marker-rules.ts` helpers

### 4. Add `markerShiftAllowed` case to `tryCompileCondition`

Same pattern as `markerStateAllowed` but compiles `delta` and checks lattice transition validity instead of absolute state validity.

### 5. Parity tests

For each new case:
- Construct condition AST with compilable operands
- Evaluate via `evalCondition` (interpreter)
- Evaluate via compiled predicate
- Assert identical boolean results
- Cover: match (true), no-match (false), boundary cases

## Files to Touch

- `packages/engine/src/kernel/condition-compiler.ts` (modify)
- `packages/engine/test/unit/kernel/condition-compiler.test.ts` (modify — add parity tests)

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
3. Compiled condition/value closures consume `ReadContext` directly rather than a narrower ad hoc runtime argument list

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/condition-compiler.test.ts` — parity tests for 4 new condition ops + null-return tests

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/condition-compiler.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo test`

## Outcome

- Completed: 2026-04-09
- Changed: widened compiled condition and compiled value-accessor closures to consume `ReadContext` directly, added compiled support for `in`, `zonePropIncludes`, `markerStateAllowed`, and `markerShiftAllowed`, updated pipeline viability to use the new compiled predicate contract, and extended parity/integration/benchmark coverage for the affected call sites.
- Deviations from original plan: the original ticket assumed `zonePropIncludes.zone` and marker `space` were `ValueExpr`s and implied narrower predicate arguments. During reassessment, the ticket was corrected to the live `ZoneSel` shapes and the implementation absorbed the architectural contract change to `ReadContext`-based compiled closures. Directly affected sibling tickets `120WIDCOMEXP-005` and `120WIDCOMEXP-006` were updated to stay coherent with that contract.
- Verification:
  - `pnpm -F @ludoforge/engine build`
  - `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/condition-compiler.test.js`
  - `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/compiled-condition-cache.test.js`
  - `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/pipeline-viability-policy.test.js`
  - `pnpm -F @ludoforge/engine exec node --test dist/test/integration/compiled-condition-equivalence.test.js`
  - `pnpm -F @ludoforge/engine exec node --test dist/test/performance/compiled-condition-benchmark.test.js`
  - `pnpm -F @ludoforge/engine exec node --test dist/test/performance/enumeration-snapshot-benchmark.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm run check:ticket-deps`
  - `pnpm turbo test`
