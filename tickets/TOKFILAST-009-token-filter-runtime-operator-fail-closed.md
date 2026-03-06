# TOKFILAST-009: Fail Closed on Unsupported TokenFilterExpr Operators at Runtime

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel token-filter runtime guardrails
**Deps**: archive/tickets/TOKFILAST-003-token-filter-boolean-arity-guards.md, archive/tickets/TOKFILAST/TOKFILAST-004-token-filter-expression-traversal-unification.md

## Problem

`matchesTokenFilterExpr` currently treats any non-`and`/`not` operator as the `or` branch at runtime. Malformed unvalidated expressions can be evaluated with unintended semantics instead of failing deterministically.

## Assumption Reassessment (2026-03-06)

1. `matchesTokenFilterExpr` explicitly handles leaf, `not`, and `and`, then falls through to `some(...)` without explicitly validating `op` (`packages/engine/src/kernel/token-filter.ts`).
2. Behavior validation already rejects unsupported operators with deterministic `DOMAIN_QUERY_INVALID` diagnostics (`packages/engine/src/kernel/validate-gamedef-behavior.ts`).
3. Mismatch: runtime currently depends on upstream validation correctness; malformed runtime input can bypass validator and get incorrect fallback semantics.

## Architecture Check

1. Runtime fail-closed operator handling is safer and cleaner than implicit fallback behavior.
2. This is generic expression validation in agnostic kernel code; no game-specific logic is introduced.
3. No backwards-compatibility aliasing or shim behavior is introduced; unsupported operators become explicit runtime errors.

## What to Change

### 1. Add explicit token-filter operator guard in runtime evaluator

In `matchesTokenFilterExpr`, explicitly branch for `or`, and throw deterministic eval errors for any unsupported/non-object shape.

### 2. Strengthen runtime tests for malformed operator inputs

Add tests proving malformed operators do not evaluate as `or`, and instead throw expected error codes.

## Files to Touch

- `packages/engine/src/kernel/token-filter.ts` (modify)
- `packages/engine/test/unit/token-filter.test.ts` (modify)

## Out of Scope

- Authoring/lint-level static guards (covered separately by `TOKFILAST-008`).
- Compiler/lowering canonicalization of token-filter AST (covered separately by `TOKFILAST-007`).

## Acceptance Criteria

### Tests That Must Pass

1. Runtime evaluation throws deterministic eval errors when `TokenFilterExpr.op` is not one of `and|or|not` and not a leaf predicate.
2. No malformed operator path can silently evaluate using `or` semantics.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. Runtime expression evaluator fails closed on malformed operators.
2. GameDef/simulation contracts remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/token-filter.test.ts` — add malformed-operator runtime assertions (fail-closed behavior).

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`
