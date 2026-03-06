# TOKFILAST-036: Harden Validator/Runtime Predicate Boundary Policy Test with AST Provenance Checks

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: Yes — lint/policy test robustness
**Deps**: archive/tickets/TOKFILAST-026-decouple-validator-from-query-predicate-runtime-module.md

## Problem

The current validator/runtime predicate boundary guard uses regex on raw source text. This is fragile and can fail on harmless import formatting changes while missing deeper provenance cases that AST checks should enforce.

## Assumption Reassessment (2026-03-06)

1. `packages/engine/test/unit/lint/validator-runtime-import-boundary-policy.test.ts` currently validates import shape via regex string matching.
2. The test intent is architectural (provenance and boundary), but implementation checks syntax formatting details (specifier order/shape).
3. Existing active tickets (`027`-`035`) do not cover hardening this specific test to AST-level provenance analysis.

## Architecture Check

1. AST-based policy checks are more robust and maintainable than regex checks for architectural boundaries.
2. This keeps validator/runtime boundaries enforceable without constraining unrelated code formatting.
3. No runtime behavior changes, no aliases/shims, and no game-specific logic are introduced.

## What to Change

### 1. Replace regex import assertions with AST provenance checks

Parse `validate-gamedef-behavior.ts` and assert `isPredicateOp`/`PREDICATE_OPERATORS` are imported from `./predicate-op-contract.js` and not from `./query-predicate.js`.

### 2. Keep re-export guard checks AST-based

Retain/strengthen checks that `query-predicate.ts` does not export predicate-op contract symbols.

## Files to Touch

- `packages/engine/test/unit/lint/validator-runtime-import-boundary-policy.test.ts` (modify)
- `packages/engine/test/helpers/kernel-source-ast-guard.ts` (modify, if additional helper utilities are needed)

## Out of Scope

- Predicate-op contract semantics.
- Validator diagnostic message semantics.

## Acceptance Criteria

### Tests That Must Pass

1. Policy test validates import provenance via AST, independent of import specifier ordering/formatting.
2. Policy still fails when validator imports predicate-op contract symbols from runtime evaluator modules.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. Validator/runtime module boundaries remain mechanically enforced.
2. Game-agnostic architecture remains intact with no game-specific leaks.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/lint/validator-runtime-import-boundary-policy.test.ts` — replace regex checks with AST-based provenance checks.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`
