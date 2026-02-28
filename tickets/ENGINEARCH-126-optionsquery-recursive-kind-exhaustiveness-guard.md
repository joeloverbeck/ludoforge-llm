# ENGINEARCH-126: OptionsQuery Recursive-Kind Exhaustiveness Guard in Shared Walker

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel query traversal typing/guards
**Deps**: archive/tickets/ENGINEARCH-109-shared-options-query-recursion-walker.md

## Problem

`query-walk.ts` centralizes recursion, but leaf dispatch currently relies on a `default` branch with a type cast. This is safe for the current union, but it does not force explicit compile-time handling when a new recursive `OptionsQuery` form is introduced.

## Assumption Reassessment (2026-02-28)

1. `packages/engine/src/kernel/query-walk.ts` currently handles recursive forms (`concat`, `nextInOrderByCondition`) explicitly, then treats all remaining queries as leaves via cast.
2. `archive/tickets/ENGINEARCH-109...` established single-source recursion traversal but did not add a strict recursive-kind exhaustiveness contract.
3. Corrected scope: keep shared walker architecture, but harden it with compile-time recursive-kind exhaustiveness so future recursive variants require explicit traversal handling.

## Architecture Check

1. Explicit recursive-kind exhaustiveness is cleaner than cast-based defaults because new recursive query forms fail compilation until traversal semantics are defined.
2. This remains game-agnostic; contracts apply only to generic `OptionsQuery` structure and never to game-specific GameSpecDoc/visual-config content.
3. No compatibility aliases/shims: the walker remains the only recursion authority.

## What to Change

### 1. Add recursive-kind type contract

Define explicit recursive-kind and leaf-kind type aliases for `OptionsQuery` within shared query typing.

### 2. Enforce exhaustive recursive handling in walker

Refactor walker branching to guarantee compile-time failure when an unhandled recursive variant is added.

### 3. Expand guard-focused tests

Add tests that lock traversal behavior and protect expected leaf/recursive partition assumptions.

## Files to Touch

- `packages/engine/src/kernel/query-walk.ts` (modify)
- `packages/engine/src/kernel/query-kind-contract.ts` (modify, if imports/types move)
- `packages/engine/test/unit/kernel/query-walk.test.ts` (modify)
- `packages/engine/test/unit/types-exhaustive.test.ts` (modify)

## Out of Scope

- Runtime-shape API surface unification between `query-shape-inference.ts` and `query-runtime-shapes.ts` (tracked separately).
- Any evaluator behavior changes in `eval-query.ts`.

## Acceptance Criteria

### Tests That Must Pass

1. Shared walker traversal behavior is unchanged for current recursive query forms.
2. Type-level checks fail compile-time if recursive-kind coverage drifts.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Every recursive `OptionsQuery` variant must be explicitly handled in one place.
2. Leaf contract inference (`query-kind-contract`) only accepts non-recursive query variants.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/query-walk.test.ts` — extend assertions around recursive-kind dispatch and traversal order.
2. `packages/engine/test/unit/types-exhaustive.test.ts` — enforce compile-time recursive/leaf partition expectations.

### Commands

1. `pnpm -F @ludoforge/engine typecheck`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine test`
