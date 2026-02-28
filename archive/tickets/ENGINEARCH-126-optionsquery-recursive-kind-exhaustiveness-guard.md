# ENGINEARCH-126: OptionsQuery Recursive-Kind Exhaustiveness Guard in Shared Walker

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel query traversal typing/guards
**Deps**: archive/tickets/ENGINEARCH-109-shared-options-query-recursion-walker.md

## Problem

`query-walk.ts` centralizes recursion, but leaf dispatch currently relies on a `default` branch with a type cast. This is safe for the current union, but it does not force explicit compile-time handling when a new recursive `OptionsQuery` form is introduced.

## Assumption Reassessment (2026-02-28)

1. `packages/engine/src/kernel/query-walk.ts` currently handles recursive forms (`concat`, `nextInOrderByCondition`) explicitly, then treats all remaining queries as leaves via cast.
2. `archive/tickets/ENGINEARCH-109...` established single-source recursion traversal but did not add a strict recursive-kind exhaustiveness contract.
3. `packages/engine/test/unit/types-exhaustive.test.ts` validates full `OptionsQuery` union exhaustiveness/counts but does not enforce recursive-vs-leaf partitioning.
4. `packages/engine/test/unit/kernel/query-kind-contract.test.ts` is the direct leaf-classification contract test and currently uses a runtime guard against recursive kinds.
5. Corrected scope: keep shared walker architecture, but harden it with compile-time recursive-kind exhaustiveness and explicit recursive/leaf partition contracts.

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

Add tests that lock traversal behavior and protect expected recursive/leaf partition assumptions at compile time.

## Files to Touch

- `packages/engine/src/kernel/query-walk.ts` (modify)
- `packages/engine/src/kernel/query-kind-contract.ts` (modify, if imports/types move)
- `packages/engine/test/unit/kernel/query-kind-contract.test.ts` (modify)
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

1. `packages/engine/test/unit/kernel/query-kind-contract.test.ts` — enforce leaf-only fixtures via compile-time `LeafOptionsQuery` typing (no runtime recursive guard).
1. `packages/engine/test/unit/kernel/query-walk.test.ts` — extend assertions around recursive-kind dispatch and traversal order.
2. `packages/engine/test/unit/types-exhaustive.test.ts` — enforce compile-time recursive/leaf partition expectations.

### Commands

1. `pnpm -F @ludoforge/engine typecheck`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine test`

## Outcome

- **Completion date**: 2026-02-28
- **What actually changed**:
  - Moved recursive/leaf `OptionsQuery` partition contracts into `packages/engine/src/kernel/query-kind-contract.ts` (`RecursiveOptionsQueryKind`, `RecursiveOptionsQuery`, `LeafOptionsQueryKind`, `LeafOptionsQuery`) and added a coverage type for recursive-kind alignment with recursive structure.
  - Refactored `packages/engine/src/kernel/query-walk.ts` to consume the shared contracts and removed cast-based default leaf dispatch.
  - Strengthened tests in `packages/engine/test/unit/kernel/query-walk.test.ts`, `packages/engine/test/unit/kernel/query-kind-contract.test.ts`, and `packages/engine/test/unit/types-exhaustive.test.ts` to lock recursive/leaf partition assumptions and compile-time guarantees.
- **Deviations from original plan**:
  - Scope correction before implementation: `query-kind-contract.test.ts` was added to the explicit test scope because it is the primary leaf-contract harness; the ticket had originally emphasized only `query-walk.test.ts` and `types-exhaustive.test.ts`.
- **Verification results**:
  - `pnpm -F @ludoforge/engine typecheck` passed.
  - `pnpm -F @ludoforge/engine test:unit` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
