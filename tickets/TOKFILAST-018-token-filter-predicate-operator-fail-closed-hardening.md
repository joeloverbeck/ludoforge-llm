# TOKFILAST-018: Harden Token-Filter Predicate Operator Contracts to Fail Closed

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel token-filter runtime + validator operator contract hardening
**Deps**: archive/tickets/TOKFILAST/TOKFILAST-009-token-filter-runtime-operator-fail-closed.md, archive/tickets/TOKFILAST/TOKFILAST-012-token-filter-validator-unsupported-operator-guard.md

## Problem

Boolean token-filter operators (`and|or|not`) are now fail-closed, but leaf predicate operators are not consistently fail-closed. Runtime predicate evaluation currently treats unknown predicate ops as membership-negation behavior, and validator coverage does not explicitly reject unsupported predicate operators.

## Assumption Reassessment (2026-03-06)

1. `matchesResolvedPredicate` in `packages/engine/src/kernel/query-predicate.ts` handles `eq|neq`, then falls through to membership handling and returns `op === 'in' ? contains : !contains`; this makes unsupported operators behave like `notIn`.
2. `validateTokenFilterPredicate` in `packages/engine/src/kernel/validate-gamedef-behavior.ts` validates token-filter property/value shapes but does not currently emit diagnostics for unsupported predicate operators when malformed objects bypass typing.
3. Existing unsupported-operator hardening tickets mostly cover boolean traversal operators (`and|or|not`), so predicate-op fail-open behavior is not yet covered by active ticket scope.

## Architecture Check

1. Explicit fail-closed predicate-op handling is cleaner than implicit fallback semantics and prevents malformed payloads from silently acquiring valid behavior.
2. The change remains entirely in agnostic kernel/runtime/validator infrastructure and does not introduce game-specific branching.
3. No backwards-compatibility aliases/shims are introduced; malformed predicate operators become deterministic errors/diagnostics.

## What to Change

### 1. Enforce predicate-op allow-list in runtime predicate evaluation

Update predicate evaluation dispatch to explicitly branch on `eq|neq|in|notIn` and throw deterministic `TYPE_MISMATCH` on unsupported operators.

### 2. Enforce predicate-op allow-list in validator diagnostics

Extend token-filter predicate validation to emit `DOMAIN_QUERY_INVALID` at `<path>.op` for unsupported predicate operators in malformed/casted inputs.

### 3. Add cross-surface regression coverage

Add runtime and validator tests for unsupported predicate operators on both query/effect token-filter surfaces, including nested paths.

## Files to Touch

- `packages/engine/src/kernel/query-predicate.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/test/unit/token-filter.test.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)
- `packages/engine/test/unit/eval-query.test.ts` (modify, if query-surface runtime assertions are needed)

## Out of Scope

- Traversal error-layer decoupling from eval contracts (`tickets/TOKFILAST-014-token-filter-traversal-error-boundary-decoupling.md`).
- Non-empty invariant contract work (`tickets/TOKFILAST-015-non-empty-invariant-error-contract-alignment.md`).

## Acceptance Criteria

### Tests That Must Pass

1. Unsupported token-filter predicate operators throw deterministic runtime `TYPE_MISMATCH` errors.
2. Validator emits deterministic `DOMAIN_QUERY_INVALID` diagnostics on `<path>.op` for unsupported token-filter predicate operators.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. Token-filter predicate operators are fail-closed at runtime and validator boundaries.
2. GameDef/runtime contracts remain game-agnostic and data-driven.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/token-filter.test.ts` — runtime fail-closed assertions for malformed predicate operators.
2. `packages/engine/test/unit/validate-gamedef.test.ts` — validator unsupported-predicate-op diagnostics/path assertions.
3. `packages/engine/test/unit/eval-query.test.ts` — query-surface runtime assertions for malformed predicate operators when applicable.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`
