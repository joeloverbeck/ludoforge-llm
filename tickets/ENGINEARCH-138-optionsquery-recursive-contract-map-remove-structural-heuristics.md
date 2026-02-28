# ENGINEARCH-138: OptionsQuery Recursive Contract Map Without Structural Heuristics

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel query typing contract hardening
**Deps**: archive/tickets/ENGINEARCH-126-optionsquery-recursive-kind-exhaustiveness-guard.md, tickets/ENGINEARCH-127-shared-query-type-ownership-boundary.md

## Problem

`RecursiveOptionsQueryKindCoverage` currently infers recursive coverage from structural fields (`source` / `sources`). This is brittle: future leaf variants that happen to include similarly named fields can create false-positive coupling in recursion contracts.

## Assumption Reassessment (2026-02-28)

1. `packages/engine/src/kernel/query-kind-contract.ts` currently derives coverage via `StructuredRecursiveOptionsQuery` field-shape extraction.
2. Structural heuristics are less robust than explicit canonical maps keyed by query kind because they encode implicit assumptions about field names.
3. Corrected scope: replace structural recursion inference with explicit kind-based contract mapping that cannot be perturbed by unrelated leaf field changes.

## Architecture Check

1. Explicit kind-to-contract maps are cleaner and more extensible than shape-based heuristics because intent is declarative and reviewable.
2. This is fully game-agnostic and only affects generic query typing contracts in kernel code.
3. No backwards-compatibility aliasing/shims are introduced.

## What to Change

### 1. Remove structural recursive coverage heuristic

Delete `StructuredRecursiveOptionsQuery`-style field-shape inference and replace it with an explicit canonical recursive contract map/type.

### 2. Encode leaf/recursive partition from canonical kind map

Derive partition checks from explicit kind ownership so recursive/leaf boundaries are driven by one contract authority.

### 3. Tighten compile-time type tests

Add compile-time tests that guarantee: no overlap between partitions, no missing recursive kinds, and no extraneous recursive entries.

## Files to Touch

- `packages/engine/src/kernel/query-kind-contract.ts` (modify)
- `packages/engine/src/kernel/query-types.ts` (modify if ENGINEARCH-127 lands first)
- `packages/engine/test/unit/types-exhaustive.test.ts` (modify)
- `packages/engine/test/unit/kernel/query-kind-contract.test.ts` (modify if assertions move)

## Out of Scope

- Traversal algorithm changes in walker recursion order.
- Query runtime behavior changes in evaluator.

## Acceptance Criteria

### Tests That Must Pass

1. Recursive/leaf kind partition remains correct and exhaustive for current `OptionsQuery` union.
2. Structural field additions on leaf variants cannot accidentally alter recursive-kind coverage contracts.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Recursive-kind contract is explicit and canonical (no structural inference heuristics).
2. Partition coverage checks remain compile-time enforceable.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/types-exhaustive.test.ts` — assert explicit recursive contract map completeness and partition exclusivity.
2. `packages/engine/test/unit/kernel/query-kind-contract.test.ts` — preserve contract behavior while validating new explicit coverage mechanism.

### Commands

1. `pnpm -F @ludoforge/engine typecheck`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine test`
