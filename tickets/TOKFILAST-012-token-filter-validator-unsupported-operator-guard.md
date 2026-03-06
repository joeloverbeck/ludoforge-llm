# TOKFILAST-012: Restore Validator Rejection for Unsupported TokenFilterExpr Operators

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel validation guard + unit coverage
**Deps**: tickets/TOKFILAST-009-token-filter-runtime-operator-fail-closed.md, tickets/TOKFILAST-011-token-filter-empty-args-surface-coverage-hardening.md

## Problem

After traversal unification, behavior validation no longer emits `DOMAIN_QUERY_INVALID` for unsupported token-filter operators when `args` is non-empty. Invalid operators can pass validator checks and only fail (or misbehave) later at runtime.

## Assumption Reassessment (2026-03-06)

1. `validateTokenFilterExpr` in `packages/engine/src/kernel/validate-gamedef-behavior.ts` now traverses with `walkTokenFilterExpr` and validates zero-arity, but does not explicitly reject non-`and|or|not` operators.
2. Existing tests in `packages/engine/test/unit/validate-gamedef.test.ts` assert empty-args rejection paths but do not assert unsupported-operator rejection paths.
3. Current active tickets do not cover validator-side unsupported-operator rejection; `TOKFILAST-009` is runtime fail-closed only.

## Architecture Check

1. Rejecting malformed operators at validation boundary is cleaner and safer than relying on downstream runtime behavior.
2. This change is generic expression-contract enforcement in agnostic kernel validation and does not add game-specific logic.
3. No backwards-compatibility aliases/shims are introduced; unsupported operators become explicit validation errors.

## What to Change

### 1. Reinstate explicit operator validation in token-filter behavior validator

Update `validateTokenFilterExpr` to emit deterministic `DOMAIN_QUERY_INVALID` for any token-filter node with unsupported operator values, including nested nodes.

### 2. Preserve deterministic nested diagnostic paths

Ensure unsupported-operator diagnostics include fully-qualified nested filter paths consistent with current path conventions (`.arg`, `.args[n]`).

### 3. Add explicit unsupported-operator regression tests

Add tests for at least one query surface and one effect surface using malformed operators to guarantee validator rejection and path stability.

## Files to Touch

- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)

## Out of Scope

- Runtime evaluator fail-closed behavior (`TOKFILAST-009`).
- Token-filter canonicalization changes at compile/lowering boundary (`TOKFILAST-007`).

## Acceptance Criteria

### Tests That Must Pass

1. Unsupported token-filter operators in behavior surfaces produce `DOMAIN_QUERY_INVALID` diagnostics.
2. Diagnostics include stable nested paths for malformed operators.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. Validator rejects malformed token-filter operators before runtime execution.
2. Validation remains game-agnostic and independent from GameSpecDoc game-specific content.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — add unsupported-operator rejection/path assertions for nested token-filter nodes.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`
