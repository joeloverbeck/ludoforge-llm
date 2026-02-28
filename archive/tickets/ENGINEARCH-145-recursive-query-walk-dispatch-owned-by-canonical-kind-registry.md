# ENGINEARCH-145: Recursive Query-Walk Dispatch Ownership Must Derive from Canonical Kind Registry

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel query traversal ownership cleanup
**Deps**: archive/tickets/ENGINEARCH-138-optionsquery-recursive-contract-map-remove-structural-heuristics.md, archive/tickets/ENGINEARCH-144-leaf-query-contract-map-total-no-runtime-assertions.md

## Problem

Recursive/leaf query-kind partition ownership is canonical in `query-kind-map.ts` (surfaced via `query-partition-types.ts`), but `query-walk.ts` still duplicates recursive traversal dispatch ownership across three local maintenance surfaces:

1. recursive dispatch object keys,
2. `walkRecursiveOptionsQuery` switch cases,
3. recursive branches in `forEachOptionsQueryLeaf`.

Behavior is correct today, but this split increases drift risk when recursive kinds are added/removed.

## Assumption Reassessment (2026-02-28)

1. `packages/engine/src/kernel/query-walk.ts` currently defines recursive handlers for `concat` and `nextInOrderByCondition` in `recursiveOptionsQueryDispatch` and also repeats those kinds in two switches.
2. Canonical recursive-kind ownership is currently derived from `OPTIONS_QUERY_KIND_CONTRACT_MAP` through `RecursiveOptionsQueryKind` (`query-partition-types.ts`).
3. Discrepancy in original assumption wording: ownership is not split between `query-kind-map.ts` and independent recursive-kind typing anymore; the remaining duplication is inside `query-walk.ts` dispatch surfaces.
4. Corrected scope: keep canonical recursive-kind ownership unchanged, and collapse `query-walk.ts` to one recursive dispatch ownership surface with compile-time completeness.

## Architecture Check

1. Collapsing recursive dispatch to a single typed map keyed by `RecursiveOptionsQueryKind` is cleaner and more extensible than maintaining parallel switches.
2. This keeps ownership boundaries stable: kind registry + partition typing define what is recursive, walker defines only behavior per recursive kind.
3. No backwards-compatibility aliases/shims; enforce direct contract alignment and fix callers/tests if needed.

## What to Change

### 1. Collapse recursive traversal dispatch surfaces in `query-walk.ts`

Refactor recursive walking so recursive kinds are dispatched via one canonical typed map (no parallel recursive switches).

### 2. Keep compile-time totality guardrails

Retain/strengthen compile-time coverage checks so recursive kinds and recursive dispatch keys remain exactly aligned.

### 3. Preserve traversal semantics

Ensure depth-first left-to-right leaf visit order and leaf-only visitor behavior remain unchanged.

## Files to Touch

- `packages/engine/src/kernel/query-walk.ts` (modify)
- `packages/engine/test/unit/types-exhaustive.test.ts` (modify only if additional compile-time coverage is required)
- `packages/engine/test/unit/kernel/query-walk.test.ts` (modify only if additional coverage is needed)

## Out of Scope

- Query evaluator runtime semantics changes.
- GameSpecDoc or visual-config data/schema changes.
- Non-query kernel refactors.

## Acceptance Criteria

### Tests That Must Pass

1. Recursive walker dispatch coverage is compile-time anchored to canonical recursive-kind ownership.
2. Recursive traversal semantics/order remain unchanged.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Recursive query-kind ownership has one canonical authority.
2. Traversal remains game-agnostic and data-independent from game-specific docs/configs.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/types-exhaustive.test.ts` — assert recursive dispatch coverage remains total against canonical recursive kinds.
2. `packages/engine/test/unit/kernel/query-walk.test.ts` — keep behavioral traversal invariants and add edge-case assertion if needed.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine typecheck`
3. `node --test packages/engine/dist/test/unit/kernel/query-walk.test.js`
4. `node --test packages/engine/dist/test/unit/types-exhaustive.test.js`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion Date**: 2026-02-28
- **What Changed**:
  - Reassessed/corrected assumptions to reflect that duplication risk lived inside `query-walk.ts` (not recursive kind derivation ownership).
  - Refactored `query-walk.ts` to remove parallel recursive switches and route recursive traversal through one typed dispatch map keyed by canonical `RecursiveOptionsQueryKind`.
  - Added a focused unit edge-case test for single-branch recursive nesting to preserve leaf-only visitor behavior.
- **Deviations from Original Plan**:
  - Did not modify `query-partition-types.ts`; existing canonical derivation from `query-kind-map.ts` was already sound and sufficient.
  - `types-exhaustive.test.ts` required no changes because existing compile-time dispatch coverage assertions already enforced totality after the refactor.
- **Verification Results**:
  - `pnpm -F @ludoforge/engine build` ✅
  - `pnpm -F @ludoforge/engine typecheck` ✅
  - `node --test packages/engine/dist/test/unit/kernel/query-walk.test.js` ✅
  - `node --test packages/engine/dist/test/unit/types-exhaustive.test.js` ✅
  - `pnpm -F @ludoforge/engine test` ✅
  - `pnpm -F @ludoforge/engine lint` ✅
  - `pnpm run check:ticket-deps` ✅
