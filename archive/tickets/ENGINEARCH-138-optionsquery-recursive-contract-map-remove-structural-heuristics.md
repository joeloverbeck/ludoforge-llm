# ENGINEARCH-138: OptionsQuery Recursive Contract Map Without Structural Heuristics

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel query typing contract hardening
**Deps**: archive/tickets/ENGINEARCH-126-optionsquery-recursive-kind-exhaustiveness-guard.md, archive/tickets/ENGINEARCH-127-shared-query-type-ownership-boundary.md

## Problem

`RecursiveOptionsQueryKindCoverage` currently infers recursive coverage from structural fields (`source` / `sources`). This is brittle: future leaf variants that happen to include similarly named fields can create false-positive coupling in recursion contracts.

## Assumption Reassessment (2026-02-28)

1. `packages/engine/src/kernel/query-partition-types.ts` currently derives coverage via `StructuredRecursiveOptionsQuery` field-shape extraction.
2. Structural heuristics are less robust than explicit canonical maps keyed by query kind because they encode implicit assumptions about field names.
3. `packages/engine/src/kernel/query-walk.ts` already uses an explicit recursive dispatch map keyed by recursive kind; traversal dispatch is not the architectural weak point for this ticket.
4. Corrected scope: replace structural recursion inference with explicit kind-based contract mapping in the partition-typing module, while preserving existing walker behavior.

## Architecture Check

1. Explicit kind-to-contract maps are cleaner and more extensible than shape-based heuristics because intent is declarative and reviewable.
2. This is fully game-agnostic and only affects generic query typing contracts in kernel code.
3. No backwards-compatibility aliasing/shims are introduced.

## What to Change

### 1. Remove structural recursive coverage heuristic

Delete `StructuredRecursiveOptionsQuery`-style field-shape inference and replace it with an explicit canonical recursive contract map/type.

### 2. Encode leaf/recursive partition from canonical kind map

Derive partition checks from explicit kind ownership so recursive/leaf boundaries are driven by one contract authority.
Use an explicit query-kind partition map (covering all `OptionsQuery['query']` kinds) to keep completeness checks compile-time enforceable without structural heuristics.

### 3. Tighten compile-time type tests

Add compile-time tests that guarantee: no overlap between partitions, no missing recursive kinds, and no extraneous recursive entries.

## Files to Touch

- `packages/engine/src/kernel/query-partition-types.ts` (modify)
- `packages/engine/test/unit/types-exhaustive.test.ts` (modify)
- `packages/engine/test/unit/kernel/query-kind-contract.test.ts` (optional; touch only if imports/contracts change)

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
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion date**: 2026-02-28
- **What actually changed**:
  - Replaced structural recursive-kind inference in `packages/engine/src/kernel/query-partition-types.ts` with an explicit canonical `OptionsQueryKindPartitionMap` that enumerates all query kinds and partitions them as `recursive` vs `leaf`.
  - Added compile-time coverage contract `OptionsQueryKindPartitionCoverage` to guarantee partition-map keys stay aligned with `OptionsQuery['query']`.
  - Updated `RecursiveOptionsQueryKindCoverage` to validate kind/type alignment from explicit kind ownership rather than structural field extraction.
  - Strengthened `packages/engine/test/unit/types-exhaustive.test.ts` to assert the new partition-map coverage contract.
- **Deviations from original plan**:
  - `packages/engine/test/unit/kernel/query-kind-contract.test.ts` did not need changes because contract assertions remained valid after partition ownership changes.
  - Scope was corrected before implementation to reflect that `query-walk.ts` already had explicit recursive dispatch mapping and was not the architectural weak point.
- **Verification results**:
  - `pnpm -F @ludoforge/engine build` passed.
  - `pnpm -F @ludoforge/engine typecheck` passed.
  - `pnpm -F @ludoforge/engine test:unit` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
