# 122CROSEAVIC-005: Evaluate `seatAgg` at runtime with seat-context binding

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — agents/policy-evaluation-core
**Deps**: `archive/tickets/122CROSEAVIC-002.md`, `archive/tickets/122CROSEAVIC-003.md`

## Problem

The policy expression evaluator has no case for `seatAgg`. Without runtime evaluation, compiled `seatAgg` expressions are dead code — they cannot produce values for scoring or conditioning.

This is the core ticket of the spec: it implements the seat iteration loop, seat-context binding, and aggregation logic that makes `seatAgg` functional.

## Assumption Reassessment (2026-04-09)

1. `PolicyEvaluationContext` class at `packages/engine/src/agents/policy-evaluation-core.ts:209` — confirmed. It manages evaluation state including caches, active state, and candidates.
2. `evaluateExpr()` method at line 396 uses a dual-layer switch on `expr.kind` — confirmed. Aggregation operators are handled as separate cases (lines 499-509), each delegating to a private method.
3. `CreatePolicyEvaluationContextInput` includes `seatId: string` (line 67) — confirmed. This is the acting player's seat, used to resolve `opponents` at evaluation time.
4. `GameDef.seats` is accessed via `this.input.def.seats` — confirmed. Provides the canonical seat order for deterministic iteration.
5. Empty-set semantics: existing aggregation operators return `undefined` for `min`/`max` on empty collections and `0` for `count`/`sum` — confirmed from `evaluateGlobalZoneAggregate()` (lines 592-640).

## Architecture Check

1. Follows the exact same dispatch pattern as existing aggregation operators: new `case 'seatAgg':` in the outer switch, delegating to a new private method `evaluateSeatAggregate()`.
2. Foundation 8 (Determinism): Iteration follows `GameDef.seats` canonical order. Same input → same output.
3. Foundation 12 (Compiler-Kernel Boundary): `opponents`/`all` are resolved here at evaluation time using `this.input.seatId`, which is state-dependent. Explicit seat lists from the IR are used as-is.
4. Foundation 11 (Immutability): The `currentSeatContext` field is a private mutable field on the class, scoped to a single evaluation call. This follows the existing pattern of `activeState` and `currentCandidates` — internal working state that doesn't leak outside the evaluation scope.

## What to Change

### 1. Add `currentSeatContext` field to `PolicyEvaluationContext`

Add `private currentSeatContext: string | undefined` to the class. This holds the currently iterated seat ID during `seatAgg` evaluation. It is set before evaluating the inner expression and cleared after.

### 2. Add `evaluateSeatAggregate()` private method

```
evaluateSeatAggregate(expr: Extract<AgentPolicyExpr, { kind: 'seatAgg' }>): PolicyValue
  1. Resolve the seat set:
     - 'opponents' → def.seats.filter(s => s.id !== this.input.seatId).map(s => s.id)
     - 'all' → def.seats.map(s => s.id)
     - readonly string[] → use as-is
  2. For each seatId in the resolved set:
     a. Save previous seatContext, set this.currentSeatContext = seatId
     b. Evaluate expr (recursive call to evaluateExpr)
     c. Restore previous seatContext
     d. Collect numeric result (skip undefined)
  3. Apply aggOp to collected results:
     - count → collected.length
     - sum → sum of collected values (0 if empty)
     - min → Math.min(...collected) (undefined if empty)
     - max → Math.max(...collected) (undefined if empty)
  4. Return aggregated value
```

### 3. Add switch case in `evaluateExpr()`

Add `case 'seatAgg': return this.evaluateSeatAggregate(expr);` after the `adjacentTokenAgg` case (line ~508).

### 4. Wire `$seat` resolution through `resolvePolicyRoleSelector()`

Ensure `resolvePolicyRoleSelector()` receives the current seat context (from ticket 002's `$seat` support). When the evaluator calls the reference resolver and `$seat` is encountered, it must resolve to `this.currentSeatContext`.

### 5. Unit tests

Test cases:
- **Basic**: `seatAgg { over: opponents, expr: victory.currentMargin.$seat, aggOp: max }` with 4-seat game returns the highest opponent margin.
- **All filters**: `opponents` excludes acting seat, `all` includes all seats, explicit list uses named seats.
- **All aggOps**: `min`, `max`, `sum`, `count` — each computes correctly over a known set of margins.
- **Preview context**: `seatAgg` with `preview.victory.currentMargin.$seat` resolves correctly in candidate feature evaluation.
- **Nested expressions**: `seatAgg` with `boolToNumber(gt(ref, 0))` inner expression compiles and evaluates.
- **Empty opponent set**: 1-seat game → `opponents` is empty → `count` returns 0, `sum` returns 0, `min`/`max` return `undefined`.
- **Deterministic order**: Verify iteration follows `GameDef.seats` canonical order (same results across repeated evaluations).

## Files to Touch

- `packages/engine/src/agents/policy-evaluation-core.ts` (modify)
- `packages/engine/test/unit/agents/policy-eval.test.ts` (modify — add seatAgg evaluation test suite)

## Out of Scope

- Compilation (ticket 003)
- Validation (ticket 004)
- Static analysis and diagnostics (ticket 006)
- Integration tests with real game profiles (ticket 007)

## Acceptance Criteria

### Tests That Must Pass

1. `seatAgg { over: opponents, aggOp: max }` returns the maximum margin among non-self seats.
2. `seatAgg { over: all, aggOp: count }` returns the total seat count.
3. Empty seat set returns correct defaults (0 for count/sum, undefined for min/max).
4. Preview-context `seatAgg` resolves `preview.victory.currentMargin.$seat` correctly.
5. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Evaluation of all existing expression operators unchanged.
2. `currentSeatContext` is always restored after `seatAgg` evaluation — no leaked state.
3. Iteration order is deterministic (Foundation 8).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-eval.test.ts` — add comprehensive `seatAgg` evaluation test suite

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
