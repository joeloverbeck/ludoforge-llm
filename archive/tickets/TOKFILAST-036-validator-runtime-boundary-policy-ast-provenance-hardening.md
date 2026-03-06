# TOKFILAST-036: Harden Validator/Runtime Predicate Boundary Policy Test with AST Provenance Checks

**Status**: ✅ COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: Yes — lint/policy test robustness
**Deps**: archive/tickets/TOKFILAST-026-decouple-validator-from-query-predicate-runtime-module.md

## Problem

The current validator/runtime predicate boundary guard uses regex on raw source text. This is fragile and can fail on harmless import formatting changes while missing deeper provenance cases that AST checks should enforce.

## Assumption Reassessment (2026-03-06)

1. `packages/engine/test/unit/lint/validator-runtime-import-boundary-policy.test.ts` is mixed-mode today:
   - validator import provenance is enforced with regex on raw source text
   - runtime re-export guard is already AST-based
2. The regex assertion is syntactic and brittle (ordering/formatting sensitive) even though the policy itself is architectural.
3. Canonical source paths are:
   - validator module: `packages/engine/src/kernel/validate-gamedef-behavior.ts`
   - runtime module: `packages/engine/src/kernel/query-predicate.ts`
4. Current canonical import path for validator predicate-op contracts is `../contracts/index.js`.
5. Existing active tickets (`TOKFILAST-035`..`TOKFILAST-038`) do not cover this lint-policy hardening.

## Architecture Check

1. AST-based policy checks are more robust and maintainable than regex checks for architectural boundaries.
2. This keeps validator/runtime boundaries enforceable without constraining unrelated code formatting.
3. No runtime behavior changes, no aliases/shims, and no game-specific logic are introduced.

## What to Change

### 1. Replace regex import assertions with AST provenance checks

Parse `validate-gamedef-behavior.ts` and assert `isPredicateOp`/`PREDICATE_OPERATORS` are imported from `../contracts/index.js` and not from `./query-predicate.js`.

### 2. Keep re-export guard checks AST-based

Retain/strengthen checks that `query-predicate.ts` does not export predicate-op contract symbols.

## Files to Touch

- `packages/engine/test/unit/lint/validator-runtime-import-boundary-policy.test.ts` (modify)
- `packages/engine/test/helpers/kernel-source-ast-guard.ts` (modify only if additional helper utilities are needed)

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

## Outcome

- Completion date: 2026-03-06
- What changed:
  - Replaced regex-based import provenance assertions in `packages/engine/test/unit/lint/validator-runtime-import-boundary-policy.test.ts` with AST-based checks.
  - Added strict AST checks that `isPredicateOp` and `PREDICATE_OPERATORS` are imported from `../contracts/index.js` without aliasing.
  - Kept and preserved AST-based guard that `query-predicate.ts` does not re-export predicate-op contract symbols.
  - Added AST-level module boundary assertion that `validate-gamedef-behavior.ts` has no import from `./query-predicate.js`.
- Deviations from original plan:
  - No helper changes were required in `packages/engine/test/helpers/kernel-source-ast-guard.ts`; existing helper APIs were sufficient.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `pnpm -F @ludoforge/engine test:unit` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
