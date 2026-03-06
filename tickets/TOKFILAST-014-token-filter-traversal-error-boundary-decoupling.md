# TOKFILAST-014: Decouple Token-Filter Traversal Errors from Eval-Layer Error Contracts

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel token-filter utility/error-boundary cleanup
**Deps**: archive/tickets/TOKFILAST-013-token-filter-traversal-utility-fail-closed-hardening.md

## Problem

`token-filter-expr-utils` is shared traversal infrastructure used by runtime, validation, and canonicalization paths, but it currently throws `typeMismatchError` from the eval layer. That couples a generic utility to eval-specific error semantics and weakens layering.

## Assumption Reassessment (2026-03-06)

1. `token-filter-expr-utils.ts` imports `typeMismatchError` from `eval-error.ts` and throws it for unsupported operators.
2. Non-eval call sites (`hidden-info-grants.ts` canonicalization) depend on the same traversal utility.
3. Mismatch: shared utility currently exports eval-layer behavior through its throw path, which is broader coupling than needed.

## Architecture Check

1. A utility-local traversal error contract is cleaner than importing eval-layer types into shared traversal logic.
2. This preserves game-agnostic boundaries: token-filter utility remains generic kernel infrastructure, with no GameSpecDoc/GameDef game-specific branching.
3. No backwards-compatibility aliasing is introduced; unsupported operators still fail closed, but through cleaner layering.

## What to Change

### 1. Introduce utility-local token-filter traversal error contract

Add a dedicated error constructor/type guard in token-filter utility scope (or a small sibling module) for malformed traversal nodes.

### 2. Map utility errors at eval-facing boundaries

At eval-facing call sites, map traversal errors to deterministic eval error codes (`TYPE_MISMATCH`) so runtime error contracts stay stable.

### 3. Add focused tests for boundary behavior

Add utility-level tests for traversal error shape and call-site tests that verify eval-facing behavior remains deterministic.

## Files to Touch

- `packages/engine/src/kernel/token-filter-expr-utils.ts` (modify)
- `packages/engine/src/kernel/token-filter.ts` (modify)
- `packages/engine/src/kernel/eval-query.ts` (modify)
- `packages/engine/test/unit/kernel/token-filter-expr-utils.test.ts` (new)
- `packages/engine/test/unit/token-filter.test.ts` (modify)
- `packages/engine/test/unit/eval-query.test.ts` (modify)

## Out of Scope

- Broad expression error-system redesign outside token-filter traversal.
- Game-specific token-filter semantics in GameDef/runtime.

## Acceptance Criteria

### Tests That Must Pass

1. Traversal utility throws a utility-local malformed-node error for unsupported token-filter operators.
2. Eval-facing token-filter APIs still surface deterministic `TYPE_MISMATCH` behavior for malformed operators.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. Shared token-filter traversal utilities do not import eval-layer error constructors.
2. Token-filter runtime/validation behavior remains game-agnostic and fail-closed.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/token-filter-expr-utils.test.ts` — assert utility-local malformed-node error contract and traversal behavior.
2. `packages/engine/test/unit/token-filter.test.ts` — assert eval-facing runtime still reports deterministic `TYPE_MISMATCH`.
3. `packages/engine/test/unit/eval-query.test.ts` — assert query surfaces preserve deterministic malformed-operator failures.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`
