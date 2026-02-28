# ENGINEARCH-127: Shared Query Type Ownership Boundary for Traversal and Contract Modules

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel query typing module boundary cleanup
**Deps**: archive/tickets/ENGINEARCH-109-shared-options-query-recursion-walker.md, archive/tickets/ENGINEARCH-126-optionsquery-recursive-kind-exhaustiveness-guard.md

## Problem

`query-kind-contract.ts` currently imports `LeafOptionsQuery` from `query-walk.ts`, coupling contract classification to traversal module ownership. This creates avoidable cross-module coupling and weakens architectural boundaries.

## Assumption Reassessment (2026-02-28)

1. `packages/engine/src/kernel/query-kind-contract.ts` depends on a type exported from traversal implementation (`query-walk.ts`).
2. Shared query partition types are conceptually neutral domain contracts and should not be owned by traversal or contract implementation modules.
3. Corrected scope: extract shared query partition type ownership into a neutral kernel typing module and update consumers.

## Architecture Check

1. Neutral type ownership is cleaner and more extensible than cross-importing implementation-owned types.
2. This refactor is fully game-agnostic and concerns only generic query typing boundaries.
3. No backward-compatibility alias layer: direct imports migrate to canonical type module.

## What to Change

### 1. Extract shared query partition types

Create a dedicated query typing module for `LeafOptionsQuery` (and recursive-kind aliases if introduced by ENGINEARCH-126).

### 2. Repoint module imports

Update `query-walk.ts`, `query-kind-contract.ts`, and any other consumers to import shared partition types from the neutral module.

### 3. Preserve behavior and tighten tests

Ensure runtime behavior is unchanged and tests verify type/behavior parity post-refactor.

## Files to Touch

- `packages/engine/src/kernel/query-types.ts` (new)
- `packages/engine/src/kernel/query-walk.ts` (modify)
- `packages/engine/src/kernel/query-kind-contract.ts` (modify)
- `packages/engine/src/kernel/query-domain-kinds.ts` (modify if imports change)
- `packages/engine/src/kernel/query-runtime-shapes.ts` (modify if imports change)
- `packages/engine/test/unit/kernel/query-walk.test.ts` (modify if needed)
- `packages/engine/test/unit/kernel/query-kind-contract.test.ts` (modify if needed)

## Out of Scope

- Consolidating duplicate runtime-shape inferencer surfaces (tracked in ENGINEARCH-111).
- Query semantic/rule changes beyond module boundary cleanup.

## Acceptance Criteria

### Tests That Must Pass

1. Query walker and contract inferencers preserve existing runtime behavior.
2. Shared query partition types are no longer owned by traversal implementation module.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Type ownership boundaries remain acyclic and implementation-neutral.
2. Query domain/runtime-shape inference remains generic and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/query-kind-contract.test.ts` — verifies leaf classification behavior is unchanged after type extraction.
2. `packages/engine/test/unit/kernel/query-walk.test.ts` — verifies traversal semantics unchanged after import boundary refactor.

### Commands

1. `pnpm -F @ludoforge/engine typecheck`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine test`
