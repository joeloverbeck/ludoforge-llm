# TOKFILAST-004: Unify Token Filter Expression Traversal Utilities

**Status**: COMPLETED (2026-03-06)
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — shared kernel traversal utility + call-site refactors
**Deps**: archive/tickets/TOKFILAST-001-token-query-filter-expression-unification.md, archive/tickets/TOKFILAST-003-token-filter-boolean-arity-guards.md

## Problem

`TokenFilterExpr` recursion is currently duplicated across multiple kernel modules (evaluation, validation, hidden-info canonicalization, zone-alias extraction). This creates drift risk: future expression-shape changes can be applied inconsistently, causing subtle behavioral divergence.

## Assumption Reassessment (2026-03-06)

1. `matchesTokenFilterExpr` recurses in `packages/engine/src/kernel/token-filter.ts`.
2. `validateTokenFilterExpr` recurses independently in `packages/engine/src/kernel/validate-gamedef-behavior.ts`.
3. `canonicalizeTokenFilterExpr` recurses independently in `packages/engine/src/kernel/hidden-info-grants.ts`.
4. `collectTokenFilterAliases` recurses independently in `packages/engine/src/kernel/zone-selector-aliases.ts`.
5. `tokenFilterPredicateCount` recurses independently in `packages/engine/src/kernel/eval-query.ts` for query-budget accounting.

### Reassessment Outcome

1. Assumptions (1)-(5) are accurate against current HEAD.
2. `canonicalizeTokenFilterPredicates` in `packages/engine/src/kernel/hidden-info-grants.ts` is currently exported but has no call sites in `packages/engine/src` or `packages/engine/test`.
3. Validator recursion (`validateTokenFilterExpr`) is in scope for refactor but current test scope underspecifies direct validator regression coverage.

## Architecture Check

1. A shared traversal primitive (visitor/fold helpers) is cleaner and more extensible than repeated hand-rolled recursion.
2. The utility remains generic kernel infrastructure, preserving GameDef/runtime agnosticism and keeping game-specific rules in GameSpecDoc.
3. No backwards-compatibility aliasing/shims are introduced; this is an internal refactor with behavior parity.

## What to Change

### 1. Introduce shared token-filter traversal helpers

Add a dedicated kernel module for generic `TokenFilterExpr` traversal (e.g., walk/map/fold helpers for leaf vs boolean nodes).

### 2. Refactor existing call sites to consume shared helper

Replace local recursive implementations in:
- `token-filter.ts`
- `validate-gamedef-behavior.ts`
- `hidden-info-grants.ts`
- `zone-selector-aliases.ts`
- `eval-query.ts`

### 3. Remove obsolete legacy helper surface

Delete the unused exported helper `canonicalizeTokenFilterPredicates` from `hidden-info-grants.ts` (no alias/shim replacement).

## Files to Touch

- `packages/engine/src/kernel/token-filter-expr-utils.ts` (new)
- `packages/engine/src/kernel/token-filter.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/src/kernel/hidden-info-grants.ts` (modify)
- `packages/engine/src/kernel/zone-selector-aliases.ts` (modify)
- `packages/engine/src/kernel/eval-query.ts` (modify)
- `packages/engine/test/unit/token-filter.test.ts` (modify)
- `packages/engine/test/unit/hidden-info-grants.test.ts` (modify)
- `packages/engine/test/unit/kernel/zone-selector-aliases.test.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)
- `packages/engine/test/unit/eval-query.test.ts` (modify)

## Out of Scope

- Authoring syntax migration for CNL token filters (tracked by `TOKFILAST-002`).
- Any game-data or visual-config changes.

## Acceptance Criteria

### Tests That Must Pass

1. Existing token-filter evaluation behavior remains unchanged under shared traversal helpers.
2. Hidden-info canonicalization and zone-alias extraction keep current semantics.
3. Validator diagnostics for nested/boolean token-filter expressions remain stable.
4. Query-budget predicate counting semantics remain stable for nested/boolean token-filter expressions.
5. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. `TokenFilterExpr` tree handling is centralized in one reusable utility layer.
2. No game-specific branching is added to kernel traversal logic.
3. No backwards-compatibility aliasing/shims for removed traversal helper surface.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/token-filter.test.ts` — verify parity of expression evaluation paths after traversal refactor.
2. `packages/engine/test/unit/hidden-info-grants.test.ts` — verify canonical key stability for equivalent expression trees.
3. `packages/engine/test/unit/kernel/zone-selector-aliases.test.ts` — verify alias extraction still traverses nested boolean token filters.
4. `packages/engine/test/unit/validate-gamedef.test.ts` — verify nested token-filter validation still emits expected diagnostics and paths.
5. `packages/engine/test/unit/eval-query.test.ts` — verify token-filter query-budget accounting remains stable with nested boolean expressions.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`

## Outcome

Implemented vs planned:

1. Added `packages/engine/src/kernel/token-filter-expr-utils.ts` with shared fold/walk/path helpers and reused it across all targeted token-filter recursion sites.
2. Refactored traversal call sites in `token-filter.ts`, `validate-gamedef-behavior.ts`, `hidden-info-grants.ts`, `zone-selector-aliases.ts`, and `eval-query.ts`.
3. Removed the unused exported legacy helper `canonicalizeTokenFilterPredicates` from `hidden-info-grants.ts` without alias/shim replacement.
4. Extended tests in the planned files to cover nested boolean traversal parity, canonicalization stability, alias extraction recursion, validator nested-path diagnostics, and warning-context predicate counting.
5. Verified with `pnpm -F @ludoforge/engine build`, `pnpm -F @ludoforge/engine test:unit`, and `pnpm -F @ludoforge/engine lint` (all passing).
