# TOKFILAST-007: Canonicalize Trivial TokenFilterExpr Boolean Wrappers at Lowering Boundary

**Status**: PENDING
**Priority**: LOW
**Effort**: Medium
**Engine Changes**: Yes — CNL lowering normalization for token filter expressions
**Deps**: archive/tickets/TOKFILAST-003-token-filter-boolean-arity-guards.md, tickets/TOKFILAST-004-token-filter-expression-traversal-unification.md, archive/tickets/TOKFILAST-002-cnl-lowering-and-no-shim-migration.md

## Problem

After no-shim migration, GameSpecDoc authors often encode single-clause filters as `{ op: and, args: [predicate] }`. This is valid but noisy and causes unnecessary AST nesting, making authored data and compiled snapshots harder to read.

## Assumption Reassessment (2026-03-06)

1. Token filter lowering now accepts canonical `TokenFilterExpr` and rejects legacy arrays.
2. Many production/test filter nodes currently use single-argument boolean wrappers (primarily `and`) that are semantically redundant.
3. No active ticket in `tickets/*` currently targets token-filter AST canonicalization at compiler boundary.

## Architecture Check

1. Compiler-side canonicalization yields cleaner, smaller ASTs and simpler downstream diffs while preserving semantics.
2. This is a generic CNL lowering normalization and does not introduce game-specific behavior into GameDef/runtime.
3. No compatibility aliases/shims are introduced; accepted syntax remains canonical expression-only.

## What to Change

### 1. Add token-filter AST normalization pass in CNL lowering

Normalize token-filter expressions after lowering:
- collapse `{ op: and, args: [x] }` to `x`
- collapse nested same-op trees where safe (for example `and` inside `and`, `or` inside `or`)
- preserve `not` semantics and ordering guarantees

### 2. Apply normalization consistently on all token-filter surfaces

Ensure query/effect surfaces that call token-filter lowerers emit normalized AST.

### 3. Strengthen tests for normalized shape parity

Add shape assertions proving equivalent inputs lower to identical normalized output.

## Files to Touch

- `packages/engine/src/cnl/compile-conditions.ts` (modify)
- `packages/engine/src/cnl/compile-effects.ts` (modify, if needed)
- `packages/engine/test/unit/compile-conditions.test.ts` (modify)
- `packages/engine/test/unit/compile-effects.test.ts` (modify, if needed)
- `packages/engine/test/integration/compile-pipeline.test.ts` (modify, if needed)

## Out of Scope

- Reintroducing legacy array filter syntax.
- Runtime/evaluator semantic changes for token filters.

## Acceptance Criteria

### Tests That Must Pass

1. Single-arg boolean wrappers normalize to direct predicate nodes in lowered AST.
2. Nested same-op token filter trees flatten deterministically where semantics are unchanged.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Filter semantics are preserved exactly under normalization.
2. GameDef/runtime remains game-agnostic with no game-specific branches.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-conditions.test.ts` — canonicalization shape assertions.
2. `packages/engine/test/unit/compile-effects.test.ts` — reveal/conceal canonicalization assertions (if applicable).
3. `packages/engine/test/integration/compile-pipeline.test.ts` — optional integration shape sanity check.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine test`
