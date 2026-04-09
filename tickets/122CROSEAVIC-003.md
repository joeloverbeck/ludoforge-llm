# 122CROSEAVIC-003: Compile `seatAgg` from authored YAML to IR

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — cnl/compile-agents
**Deps**: `archive/tickets/122CROSEAVIC-001.md`, `tickets/122CROSEAVIC-002.md`

## Problem

The agent expression compiler does not recognize `seatAgg` in authored YAML. Profile authors cannot use seat-level aggregation until the compiler can parse `seatAgg { over, expr, aggOp }` and emit the corresponding `AgentPolicyExpr` variant.

## Assumption Reassessment (2026-04-09)

1. Agent expression compiler lives at `packages/engine/src/cnl/compile-agents.ts` (2501 lines) — confirmed. Expression compilation uses a recursive pattern matching authored YAML nodes.
2. `AGGREGATE_OPS` set in compile-agents.ts (line 57) defines `['max', 'min', 'count', 'any', 'all', 'rankDense', 'rankOrdinal']` — this is for `candidateAggregates`, not for zone/token aggregation. The `seatAgg` operator uses `AgentPolicyZoneTokenAggOp` (`'sum' | 'count' | 'min' | 'max'`), validated via `isAgentPolicyZoneTokenAggOp()` from policy-contract.ts.
3. `GameDef.seats` is optional (`readonly seats?: readonly SeatDef[]` at types-core.ts:760) — compilation must fail if `seatAgg` is used when seats is undefined.
4. `$seat` placeholder parsing is handled by policy-surface.ts (ticket 002) — the compiler needs to pass `$seat` through to the surface parser when compiling the inner `expr`.

## Architecture Check

1. Follows the existing expression compilation pattern — recursive descent from authored YAML to `AgentPolicyExpr` nodes. No special-casing beyond what other aggregation operators require.
2. Game-agnostic: `over: 'opponents'` and `over: 'all'` are stored as keywords in the IR. Explicit seat lists are validated against `GameDef.seats` at compile time but are not game-specific engine code.
3. Foundation 12 (Compiler-Kernel Boundary): The compiler validates `over` keywords, validates explicit seat lists against declared seats, and validates `aggOp`. Runtime resolution of `opponents`/`all` to concrete seat sets is deferred to the evaluator (ticket 005).

## What to Change

### 1. Add `seatAgg` expression compilation (compile-agents.ts)

When the expression compiler encounters a `seatAgg` key in the authored YAML:

1. Extract `over`, `expr`, and `aggOp` fields.
2. Validate `over`:
   - `'opponents'` or `'all'` → store as keyword string in IR.
   - Array of strings → validate each seat name against `GameDef.seats`. Emit compile error if any seat name is not found.
3. Validate `aggOp` using `isAgentPolicyZoneTokenAggOp()` — must be one of `'sum' | 'count' | 'min' | 'max'`.
4. Recursively compile `expr` — the inner expression may contain `$seat` references which the surface parser (ticket 002) handles.
5. Emit the `{ kind: 'seatAgg', over, expr, aggOp }` IR node.

### 2. Add seats-required validation

If `seatAgg` is used but `GameDef.seats` is undefined or empty, emit a compile error with a descriptive message: "seatAgg requires GameDef.seats to be defined."

### 3. Unit tests for seatAgg compilation

Test cases:
- `seatAgg { over: opponents, expr: { ref: victory.currentMargin.$seat }, aggOp: max }` → compiles to correct IR node.
- `seatAgg { over: all, ... }` → compiles with `over: 'all'`.
- `seatAgg { over: [us, nva, vc], ... }` → compiles with explicit seat list validated against GameDef.seats.
- Invalid `aggOp` (e.g., `'avg'`) → compile error.
- Invalid seat name in explicit list → compile error.
- `seatAgg` used without `GameDef.seats` defined → compile error.
- Nested `seatAgg` with arithmetic inner expression → compiles correctly.

## Files to Touch

- `packages/engine/src/cnl/compile-agents.ts` (modify)
- `packages/engine/test/unit/compile-agents-authoring.test.ts` (modify — add seatAgg compilation tests)

## Out of Scope

- Runtime evaluation of `seatAgg` (ticket 005)
- Static analysis of `seatAgg` for dependency tracking (ticket 006)
- Validation that `$seat` only appears within `seatAgg.expr` (ticket 004)

## Acceptance Criteria

### Tests That Must Pass

1. Authored YAML with `seatAgg { over: opponents, expr: ..., aggOp: max }` compiles to an `AgentPolicyExpr` node with `kind: 'seatAgg'`.
2. Explicit seat list `[us, nva, vc]` is validated against `GameDef.seats` and stored as `readonly string[]`.
3. Invalid `aggOp` values produce a compile error.
4. Missing `GameDef.seats` with `seatAgg` usage produces a compile error.
5. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Compilation of all existing expression operators unchanged.
2. `over: 'opponents'` and `over: 'all'` remain as keyword strings in the IR — not resolved to concrete seat lists at compile time.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-agents-authoring.test.ts` — add `seatAgg` compilation test suite

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
