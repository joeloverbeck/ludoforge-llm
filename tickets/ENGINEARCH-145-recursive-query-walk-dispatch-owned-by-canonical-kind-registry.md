# ENGINEARCH-145: Recursive Query-Walk Dispatch Ownership Must Derive from Canonical Kind Registry

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel query traversal ownership cleanup
**Deps**: archive/tickets/ENGINEARCH-138-optionsquery-recursive-contract-map-remove-structural-heuristics.md, tickets/ENGINEARCH-144-leaf-query-contract-map-total-no-runtime-assertions.md

## Problem

Query-kind ownership is now canonical in `query-kind-map.ts`, but recursive traversal dispatch still carries separate manual handling surfaces (`switch` + explicit dispatch object) in `query-walk.ts`. The behavior is correct today, but ownership remains split and increases drift risk when adding recursive query kinds.

## Assumption Reassessment (2026-02-28)

1. `packages/engine/src/kernel/query-walk.ts` currently keeps explicit recursive handlers (`concat`, `nextInOrderByCondition`) in local dispatch structures.
2. `packages/engine/src/kernel/query-kind-map.ts` now canonically owns which query kinds are recursive.
3. Mismatch: recursive-kind ownership and recursive handler ownership are still partially duplicated. Corrected scope: derive recursive dispatch typing from canonical recursive-kind ownership and reduce redundant maintenance points.

## Architecture Check

1. Deriving dispatch contract from canonical recursive-kind ownership is cleaner and more extensible than maintaining parallel ownership declarations.
2. This remains game-agnostic traversal infrastructure; no game-specific behavior is introduced into GameDef/kernel/simulator.
3. No backwards-compatibility aliases/shims; migrate traversal typing/dispatch ownership directly.

## What to Change

### 1. Align recursive dispatch typing to canonical ownership

Refactor recursive dispatch map typing in `query-walk.ts` so recursive handler coverage is anchored to canonical recursive-kind derivation from the shared query-kind registry.

### 2. Remove avoidable duplicate ownership surfaces

Where feasible, eliminate duplicated local declarations that restate recursive kind partitions already owned by shared contracts.

### 3. Lock coverage with compile-time tests

Strengthen type-exhaustive checks so recursive dispatch coverage fails fast if recursive kinds change without corresponding walker updates.

## Files to Touch

- `packages/engine/src/kernel/query-walk.ts` (modify)
- `packages/engine/src/kernel/query-partition-types.ts` (modify only if helper exports/types are needed)
- `packages/engine/test/unit/types-exhaustive.test.ts` (modify)
- `packages/engine/test/unit/kernel/query-walk.test.ts` (modify if assertions need updating)

## Out of Scope

- Query evaluator runtime semantics changes.
- GameSpecDoc or visual-config data/schema changes.
- Non-query kernel refactors.

## Acceptance Criteria

### Tests That Must Pass

1. Recursive walker dispatch coverage is compile-time anchored to canonical recursive-kind ownership.
2. Existing recursive traversal semantics and order remain unchanged.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Recursive query-kind ownership has one canonical authority.
2. Traversal remains game-agnostic and data-independent from game-specific docs/configs.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/types-exhaustive.test.ts` — strengthen compile-time coverage linkage between canonical recursive kinds and walker dispatch coverage.
2. `packages/engine/test/unit/kernel/query-walk.test.ts` — verify traversal behavior/order remains unchanged after ownership cleanup.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine typecheck`
3. `node --test packages/engine/dist/test/unit/kernel/query-walk.test.js`
4. `node --test packages/engine/dist/test/unit/types-exhaustive.test.js`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm -F @ludoforge/engine lint`
