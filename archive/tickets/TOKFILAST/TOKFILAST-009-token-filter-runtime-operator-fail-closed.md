# TOKFILAST-009: Fail Closed on Unsupported TokenFilterExpr Operators at Runtime

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel token-filter runtime guardrails
**Deps**: archive/tickets/TOKFILAST-003-token-filter-boolean-arity-guards.md, archive/tickets/TOKFILAST/TOKFILAST-004-token-filter-expression-traversal-unification.md

## Problem

The malformed-operator fallback is now centralized in shared token-filter traversal utilities (`foldTokenFilterExpr`/`walkTokenFilterExpr`), where any non-`and`/`not` operator falls through to `or` semantics. Unsafe/unvalidated runtime objects can still be evaluated with unintended behavior instead of failing deterministically.

## Assumption Reassessment (2026-03-06)

1. `matchesTokenFilterExpr` already has explicit `and` and `or` handlers with arity guards, so the previous assumption about direct fallback in this function is stale (`packages/engine/src/kernel/token-filter.ts`).
2. Fallback-to-`or` behavior still exists in shared utilities used by runtime and canonicalization paths (`packages/engine/src/kernel/token-filter-expr-utils.ts`).
3. Behavior validation currently enforces boolean-arity constraints but does not explicitly emit unsupported-operator diagnostics when malformed objects bypass schema typing (`packages/engine/src/kernel/validate-gamedef-behavior.ts`).
4. Schema boundaries (`TokenFilterExprSchema`) already reject unsupported operators for validated inputs; the remaining risk is unsafe cast/unvalidated runtime payloads (`packages/engine/src/kernel/schemas-ast.ts`).

## Architecture Check

1. Guarding unsupported operators in shared token-filter traversal utilities is cleaner than adding one-off checks in each caller because it centralizes invariants and prevents drift.
2. This remains generic agnostic-kernel behavior and introduces no game-specific branches.
3. No backwards-compatibility aliasing is introduced; malformed operators fail closed.

## What to Change

### 1. Enforce explicit token-filter operator handling in shared traversal utilities

Update `foldTokenFilterExpr` (and traversal helpers used by validation) to fail closed on unsupported operators instead of treating them as `or`.

### 2. Strengthen runtime + validation tests for malformed operator inputs

Add tests proving malformed operators do not evaluate as `or`, and instead surface deterministic runtime errors and validator diagnostics.

## Files to Touch

- `packages/engine/src/kernel/token-filter-expr-utils.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/test/unit/token-filter.test.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)

## Out of Scope

- Authoring/lint-level static guards (covered separately by `TOKFILAST-008`).
- Compiler/lowering canonicalization of token-filter AST (covered separately by `TOKFILAST-007`).

## Acceptance Criteria

### Tests That Must Pass

1. Runtime evaluation throws deterministic eval errors when `TokenFilterExpr.op` is not one of `and|or|not` and not a leaf predicate.
2. No malformed operator path can silently evaluate using `or` semantics.
3. Behavior validation emits deterministic `DOMAIN_QUERY_INVALID` diagnostics for unsupported token-filter operators when malformed objects bypass static typing.
4. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. Runtime expression evaluator fails closed on malformed operators.
2. GameDef/simulation contracts remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/token-filter.test.ts` — add malformed-operator runtime assertions (fail-closed behavior).
2. `packages/engine/test/unit/validate-gamedef.test.ts` — add unsupported-operator diagnostics assertions for malformed token-filter trees.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-03-06
- What changed:
  - `foldTokenFilterExpr` now throws deterministic `TYPE_MISMATCH` eval errors for unsupported token-filter operators instead of falling back to `or`.
  - `walkTokenFilterExpr` no longer traverses malformed boolean nodes as implicit `or` shapes.
  - Behavior validation now emits `DOMAIN_QUERY_INVALID` on `filter.op` for unsupported token-filter operators in malformed/cast inputs.
  - Added runtime and validator unit tests that assert fail-closed behavior for malformed operators.
- Deviations from original plan:
  - Scope shifted from `matchesTokenFilterExpr` to shared traversal utilities because that is where fallback semantics actually lived.
  - Added explicit validator unsupported-operator diagnostics coverage to align validation/runtime invariants.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `pnpm -F @ludoforge/engine test:unit` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
