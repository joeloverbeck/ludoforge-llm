# TOKFILAST-019: Harden Token-Filter Predicate Node Shape and Fold Error Path Contracts

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — shared token-filter traversal utility contract + focused tests
**Deps**: archive/tickets/TOKFILAST-013-token-filter-traversal-utility-fail-closed-hardening.md, archive/tickets/TOKFILAST/TOKFILAST-014-token-filter-traversal-error-boundary-decoupling.md

## Problem

Current traversal predicate detection accepts any object containing `prop`, which allows malformed predicate-like nodes to bypass fail-closed operator checks. In addition, `foldTokenFilterExpr` malformed-node errors currently report root path context even when failures occur in nested nodes, reducing path-fidelity for diagnostics and future boundary mapping.

## Assumption Reassessment (2026-03-06)

1. `isTokenFilterPredicateExpr` in `packages/engine/src/kernel/token-filter-expr-utils.ts` currently checks only for `'prop' in expr`, without requiring valid predicate shape (`op` + `value`).
2. `foldTokenFilterExpr` currently throws malformed-node errors with `path: []`, so nested malformed-node location is not preserved in error context.
3. `validateGameDef` already has extensive token-filter traversal diagnostics via `walkTokenFilterExpr`; fold-path hardening primarily affects runtime error contexts (`matchesTokenFilterExpr`, `canonicalTokenFilterKey`) and traversal utility tests.

## Architecture Check

1. A strict predicate-node guard in shared traversal infrastructure is cleaner than relying on downstream assumptions at each caller.
2. Path-aware fold error context improves debuggability and enables robust, deterministic mapping at boundaries without game-specific logic.
3. No backwards-compatibility aliases/shims are introduced; malformed predicate-like nodes fail closed with explicit contracts.

## What to Change

### 1. Introduce strict predicate-node shape guard in traversal utility

Require predicate nodes to satisfy the expected structural contract (`prop` + valid `op` + `value`) before treating them as leaf predicates.

### 2. Make fold traversal error context path-aware

Thread path context through `foldTokenFilterExpr` recursion so malformed nested nodes report deterministic `.arg/.args[n]` location metadata.

### 3. Extend utility contract tests for malformed predicate nodes and fold paths

Add focused utility and runtime tests that assert malformed predicate-like nodes fail closed and nested fold failures carry deterministic path context.

## Files to Touch

- `packages/engine/src/kernel/token-filter-expr-utils.ts` (modify)
- `packages/engine/test/unit/kernel/token-filter-expr-utils.test.ts` (modify)
- `packages/engine/test/unit/token-filter.test.ts` (modify)
- `packages/engine/test/unit/hidden-info-grants.test.ts` (modify, if canonicalization traversal error context coverage is added)

## Out of Scope

- Predicate-op runtime/validator allow-list enforcement (`archive/tickets/TOKFILAST/TOKFILAST-018-token-filter-predicate-operator-fail-closed-hardening.md`).
- Broader eval error boundary decoupling beyond token-filter traversal (`archive/tickets/TOKFILAST/TOKFILAST-014-token-filter-traversal-error-boundary-decoupling.md`).

## Acceptance Criteria

### Tests That Must Pass

1. Malformed predicate-like token-filter nodes are rejected deterministically by traversal helpers.
2. Nested malformed nodes reported by `foldTokenFilterExpr` include deterministic path metadata.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. Shared token-filter traversal accepts only well-formed predicate/boolean node shapes.
2. Error context remains deterministic and game-agnostic for malformed traversal nodes.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/token-filter-expr-utils.test.ts` — malformed predicate-node fail-closed and fold nested-path context assertions.
2. `packages/engine/test/unit/token-filter.test.ts` — nested malformed token-filter expression/type-mismatch path assertions through runtime fold callers.
3. `packages/engine/test/unit/hidden-info-grants.test.ts` — traversal error path assertions for canonical token-filter key folding.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion Date**: 2026-03-06
- **What Changed**:
  - Hardened `isTokenFilterPredicateExpr` to require full predicate shape (`prop` string + supported predicate `op` + `value`) rather than accepting any object with `prop`.
  - Refactored `foldTokenFilterExpr` to preserve traversal path context through recursion so malformed nested nodes surface deterministic `.arg/.args[n]` path metadata.
  - Added coverage for malformed predicate-like nodes and nested fold-path propagation in utility and runtime tests.
- **Deviations From Original Plan**:
  - Reassessed scope before implementation: `validateGameDef` path mapping changes were unnecessary because validator traversal already uses `walkTokenFilterExpr`.
  - Added/strengthened runtime caller tests (`token-filter`, `hidden-info-grants`) instead of touching `validate-gamedef` tests.
- **Verification Results**:
  - `pnpm -F @ludoforge/engine build` passed.
  - `pnpm -F @ludoforge/engine test:unit` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
