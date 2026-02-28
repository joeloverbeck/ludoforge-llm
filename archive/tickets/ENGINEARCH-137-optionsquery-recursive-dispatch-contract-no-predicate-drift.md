# ENGINEARCH-137: OptionsQuery Recursive Dispatch Contract Without Predicate Drift

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel query traversal dispatch contract
**Deps**: archive/tickets/ENGINEARCH-126-optionsquery-recursive-kind-exhaustiveness-guard.md, archive/tickets/ENGINEARCH-127-shared-query-type-ownership-boundary.md

## Problem

`forEachOptionsQueryLeaf` currently relies on a custom type predicate to classify recursive queries. If a new recursive `OptionsQuery` kind is introduced and the predicate is not updated, the walker can silently misroute a recursive node through the leaf path.

## Assumption Reassessment (2026-02-28)

1. `packages/engine/src/kernel/query-walk.ts` currently uses `isRecursiveOptionsQuery` and non-recursive fallback leaf dispatch.
2. `packages/engine/src/kernel/query-partition-types.ts` and `packages/engine/test/unit/types-exhaustive.test.ts` already enforce recursive/leaf partition coverage at the type level, but that coverage is not currently tied to walker dispatch-key ownership.
3. Corrected scope: harden walker dispatch so recursive-kind handling is single-source and compile-time enforced at the walker boundary, not predicate-trust based.
4. `ENGINEARCH-138` separately addresses structural-heuristic drift in partition coverage; this ticket should not duplicate that contract rewrite.

## Architecture Check

1. A typed recursive handler map is cleaner than predicate + fallback because recursive-kind additions fail compilation until dispatch is implemented.
2. This remains fully game-agnostic and only concerns generic `OptionsQuery` traversal semantics in kernel code.
3. No backwards-compatibility aliasing/shims are introduced.

## What to Change

### 1. Replace predicate routing with typed dispatch ownership

Refactor walker internals to dispatch recursive kinds through a canonical typed handler map keyed by `RecursiveOptionsQueryKind`, and remove drift-prone predicate ownership.

### 2. Enforce non-recursive leaf dispatch at compile-time

Make fallback leaf dispatch compile-time safe without unchecked narrowing so recursive forms cannot be treated as leaves when contracts drift.

### 3. Strengthen traversal contract tests

Add tests/type-guards that fail if recursive kind registration and walker dispatch ownership diverge.

## Files to Touch

- `packages/engine/src/kernel/query-walk.ts` (modify)
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
3. Recursive dispatch key registration remains exactly aligned with `RecursiveOptionsQueryKind`.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/query-walk.test.ts` — enforce recursive dispatch registration and leaf-only callback behavior.
2. `packages/engine/test/unit/types-exhaustive.test.ts` — add compile-time guard(s) for recursive-dispatch contract completeness.

### Commands

1. `pnpm -F @ludoforge/engine typecheck`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion Date**: 2026-02-28
- **What Changed**:
  - Replaced predicate-based recursive query routing in `query-walk.ts` with a canonical typed recursive dispatch map keyed by `RecursiveOptionsQueryKind`.
  - Added a compile-time coverage type (`RecursiveOptionsQueryDispatchCoverage`) to keep recursive dispatch keys exactly aligned with recursive kind ownership.
  - Hardened leaf fallback dispatch to use compile-time-safe leaf narrowing.
  - Strengthened tests:
    - `query-walk.test.ts`: added top-level leaf dispatch assertion.
    - `types-exhaustive.test.ts`: added compile-time assertion for recursive dispatch coverage.
- **Deviations From Original Plan**:
  - No change was required in `query-partition-types.ts`; existing partition contracts were sufficient once walker dispatch coverage was anchored in `query-walk.ts`.
- **Verification Results**:
  - `pnpm -F @ludoforge/engine typecheck` passed.
  - `pnpm -F @ludoforge/engine test:unit` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
