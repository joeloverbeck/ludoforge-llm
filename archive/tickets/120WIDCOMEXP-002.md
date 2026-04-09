# 120WIDCOMEXP-002: Widen value expr compiler — complex expressions

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/kernel/condition-compiler.ts`
**Deps**: None

## Problem

`tryCompileValueExpr` returns `null` for arithmetic (`_t: 6`), concat (`_t: 3`), and if-then-else (`_t: 4`) expressions. These are composite node types that compose child value expressions. Since the compiler already handles child references (literals, gvar, pvar, binding), adding composite support unlocks compilation for a large class of derived expressions used in cost calculations, display strings, and conditional values.

## Assumption Reassessment (2026-04-09)

1. `tryCompileValueExpr` switch at line 199 has `case 2` (references) and `case 5` (aggregate count), with `default: return null` at line 208 — confirmed.
2. AST tags: `_t: 6` = OP (arithmetic), `_t: 3` = CONCAT, `_t: 4` = IF — confirmed in `types-ast.ts` lines 71-78.
3. Arithmetic shape: `{ _t: 6, op: '+'/'-'/'*'/'/'/'floorDiv'/'ceilDiv'/'min'/'max', left: ValueExpr, right: ValueExpr }` — confirmed in `types-ast.ts`.
4. Concat shape: `{ _t: 3, concat: ValueExpr[] }` — confirmed, with interpreter semantics in `eval-value.ts`: scalar children join as a string, scalar-array children flatten, and mixed scalar/scalar-array parts throw `TYPE_MISMATCH`.
5. If-then-else shape: `{ _t: 4, if: { when: ConditionAST, then: ValueExpr, else: ValueExpr } }` — confirmed.
6. `tryCompileCondition` already exists (line 212) and handles boolean/comparison ops — available for if-then-else condition compilation.

## Architecture Check

1. Each new case recursively calls `tryCompileValueExpr` (and `tryCompileCondition` for if-then-else) on children. If any child returns `null`, the parent returns `null`. This preserves the all-or-nothing compilation contract.
2. Mutual recursion between `tryCompileValueExpr` (if-then-else) and `tryCompileCondition` (comparison operands) is safe because AST depth is finite (Foundation 10).
3. No game-specific logic — compiles generic AST operators.

## What to Change

### 1. Add arithmetic case (`_t: 6`) to `tryCompileValueExpr`

Add `case 6` that:
- Calls `tryCompileValueExpr` on `expr.left` and `expr.right`
- If either returns `null`, return `null`
- Returns an accessor that applies the live operator family (`+`, `-`, `*`, `/`, `floorDiv`, `ceilDiv`, `min`, `max`) to the two child accessor results
- Matches interpreter integer semantics exactly, including `Math.trunc` for `/` and division-by-zero error behavior

### 2. Add concat case (`_t: 3`) to `tryCompileValueExpr`

Add `case 3` that:
- Calls `tryCompileValueExpr` on each element in `expr.concat`
- If any returns `null`, return `null`
- Returns an accessor that matches interpreter concat semantics exactly:
  - all scalar children join as a string
  - all scalar-array children flatten into one scalar-array
  - mixed scalar/scalar-array parts throw `TYPE_MISMATCH`

### 3. Add if-then-else case (`_t: 4`) to `tryCompileValueExpr`

Add `case 4` that:
- Calls `tryCompileCondition` on `expr.if.when`
- Calls `tryCompileValueExpr` on `expr.if.then` and `expr.if.else`
- If any returns `null`, return `null`
- Returns an accessor that evaluates the condition, then returns the appropriate branch value

### 4. Parity tests

For each new case:
- Construct AST with compilable children
- Evaluate via interpreter (`evalValue`)
- Evaluate via compiled accessor
- Assert identical results
- Test nested compositions (e.g., arithmetic inside if-then-else)
- Test null-return when children are non-compilable

## Files to Touch

- `packages/engine/src/kernel/condition-compiler.ts` (modify)
- `packages/engine/test/unit/kernel/condition-compiler.test.ts` (modify — add parity tests)

## Out of Scope

- New reference types (ticket 001)
- Condition compiler widening (ticket 003)
- Token filter compiler (ticket 004)
- Application site integration (ticket 006)

## Acceptance Criteria

### Tests That Must Pass

1. Parity test: arithmetic `+`, `/`, `floorDiv`, `ceilDiv`, `min`, and `max` with compilable children — compiled matches interpreter
2. Parity test: concat with scalar children joins as a string — compiled matches interpreter
3. Parity test: concat with scalar-array children flattens arrays — compiled matches interpreter
4. Error parity test: concat with mixed scalar and scalar-array children throws `TYPE_MISMATCH`
5. Parity test: if-then-else with compilable condition and branches — compiled matches interpreter
6. Parity test: nested composition (arithmetic inside if-then-else) — compiled matches interpreter
7. Null-return test: arithmetic with non-compilable child returns `null`
8. Null-return test: concat with non-compilable child returns `null`
9. Null-return test: if-then-else with non-compilable condition returns `null`
10. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `tryCompileValueExpr` returns `null` for any node type it cannot fully compile — no partial compilation
2. Division always uses `Math.trunc` for `/`; other arithmetic operators match the interpreter's live semantics exactly (Foundation 8)
3. Concat preserves scalar vs scalar-array behavior and throws on mixed parts exactly like the interpreter
4. Compiled accessor results are identical to interpreter results for all inputs (Foundation 8)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/condition-compiler.test.ts` — parity tests for 3 composite node types + null-return tests + nested composition tests

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/condition-compiler.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo test`

## Outcome

- Completed: 2026-04-09
- Added compiled `tryCompileValueExpr` support for concat (`_t: 3`), if-then-else (`_t: 4`), and the full live arithmetic operator family (`+`, `-`, `*`, `/`, `floorDiv`, `ceilDiv`, `min`, `max`) in `packages/engine/src/kernel/condition-compiler.ts`.
- Extended `packages/engine/test/unit/kernel/condition-compiler.test.ts` with parity coverage for scalar concat, scalar-array concat, nested if/arithmetic composition, division-by-zero and mixed-concat error parity, plus residual null-return cases for non-compilable children.
- Deviations from original plan: the ticket's original arithmetic and concat scope was stale relative to the live `ValueExpr` and interpreter contract. Before implementation, the ticket was amended to match the authoritative runtime semantics and the live unit-test path/verification commands.
- Verification:
  - `pnpm -F @ludoforge/engine build`
  - `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/condition-compiler.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo test`
