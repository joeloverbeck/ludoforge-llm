# ENGINEARCH-137: OptionsQuery Recursive Dispatch Contract Without Predicate Drift

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel query traversal dispatch contract
**Deps**: archive/tickets/ENGINEARCH-126-optionsquery-recursive-kind-exhaustiveness-guard.md, archive/tickets/ENGINEARCH-127-shared-query-type-ownership-boundary.md

## Problem

`forEachOptionsQueryLeaf` currently relies on a custom type predicate to classify recursive queries. If a new recursive `OptionsQuery` kind is introduced and the predicate is not updated, the walker can silently misroute a recursive node through the leaf path.

## Assumption Reassessment (2026-02-28)

1. `packages/engine/src/kernel/query-walk.ts` currently uses `isRecursiveOptionsQuery` and non-recursive fallback leaf dispatch.
2. `packages/engine/src/kernel/query-partition-types.ts` now defines recursive/leaf partition types, but walker runtime dispatch still duplicates recursive-kind knowledge.
3. Corrected scope: harden walker dispatch so recursive-kind handling is single-source and compile-time enforced, not predicate-trust based.

## Architecture Check

1. A typed recursive handler map is cleaner than predicate + fallback because recursive-kind additions fail compilation until dispatch is implemented.
2. This remains fully game-agnostic and only concerns generic `OptionsQuery` traversal semantics in kernel code.
3. No backwards-compatibility aliasing/shims are introduced.

## What to Change

### 1. Replace predicate routing with typed dispatch ownership

Refactor walker internals to dispatch recursive kinds through a canonical typed handler map keyed by `RecursiveOptionsQueryKind` (or equivalent exhaustive contract), and remove drift-prone predicate ownership.

### 2. Enforce non-recursive leaf dispatch at compile-time

Make fallback leaf dispatch compile-time safe (no unchecked narrowing) so recursive forms cannot be treated as leaves when contracts drift.

### 3. Strengthen traversal contract tests

Add tests that fail if recursive kind registration and traversal dispatch diverge.

## Files to Touch

- `packages/engine/src/kernel/query-walk.ts` (modify)
- `packages/engine/src/kernel/query-partition-types.ts` (modify if shared dispatch contract types are needed)
- `packages/engine/test/unit/kernel/query-walk.test.ts` (modify)
- `packages/engine/test/unit/types-exhaustive.test.ts` (modify if additional compile-time drift guards are added)

## Out of Scope

- Query semantic behavior changes in `eval-query.ts`.
- Runtime-shape diagnostic policy changes.

## Acceptance Criteria

### Tests That Must Pass

1. Walker recursion behavior for current query kinds (`concat`, `nextInOrderByCondition`) remains unchanged.
2. Introducing a new recursive query kind without dispatch implementation causes compile-time failure.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Recursive traversal dispatch has a single canonical ownership point in kernel code.
2. Leaf visitor callbacks never receive recursive query variants.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/query-walk.test.ts` — enforce recursive dispatch registration and leaf-only callback behavior.
2. `packages/engine/test/unit/types-exhaustive.test.ts` — add compile-time guard(s) for recursive-dispatch contract completeness.

### Commands

1. `pnpm -F @ludoforge/engine typecheck`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine test`
