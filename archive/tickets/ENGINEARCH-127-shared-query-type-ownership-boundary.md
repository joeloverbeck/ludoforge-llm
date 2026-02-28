# ENGINEARCH-127: Shared Query Type Ownership Boundary for Traversal and Contract Modules

**Status**: COMPLETED (2026-02-28)
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel query typing module boundary cleanup
**Deps**: archive/tickets/ENGINEARCH-109-shared-options-query-recursion-walker.md, archive/tickets/ENGINEARCH-126-optionsquery-recursive-kind-exhaustiveness-guard.md

## Problem

`query-kind-contract.ts` currently owns query partition aliases (`LeafOptionsQuery`, `RecursiveOptionsQueryKind`, `RecursiveOptionsQuery`) that are also used by traversal and type-exhaustive surfaces. `query-walk.ts` imports those partition aliases from `query-kind-contract.ts`, coupling neutral query typing to a behavioral classification module. This creates avoidable cross-module coupling and weakens architectural boundaries.

## Assumption Reassessment (2026-02-28)

1. `packages/engine/src/kernel/query-walk.ts` currently imports `LeafOptionsQuery` and `RecursiveOptionsQuery` from `query-kind-contract.ts`.
2. `packages/engine/src/kernel/query-kind-contract.ts` currently defines both neutral query partition aliases and behavioral contract inference logic; those concerns should be split.
3. `packages/engine/src/kernel/query-shape-inference.ts` and `packages/engine/test/unit/types-exhaustive.test.ts` also depend on partition aliases and are in scope for import repointing.
4. Corrected scope: extract shared query partition type ownership into a neutral kernel typing module and update all consumers.

## Architecture Check

1. Neutral type ownership is cleaner and more extensible than cross-importing implementation-owned types.
2. This refactor is fully game-agnostic and concerns only generic query typing boundaries.
3. No backward-compatibility alias layer: direct imports migrate to canonical type module.

## What to Change

### 1. Extract shared query partition types

Create a dedicated query typing module for:
- `RecursiveOptionsQueryKind`
- `RecursiveOptionsQuery`
- `LeafOptionsQueryKind`
- `LeafOptionsQuery`
- `RecursiveOptionsQueryKindCoverage`

### 2. Repoint module imports

Update `query-walk.ts`, `query-kind-contract.ts`, `query-shape-inference.ts`, and all test/type-exhaustive consumers to import shared partition types from the neutral module.

### 3. Preserve behavior and tighten tests

Ensure runtime behavior is unchanged and tests verify type/behavior parity post-refactor.

## Files to Touch

- `packages/engine/src/kernel/query-partition-types.ts` (new)
- `packages/engine/src/kernel/query-walk.ts` (modify)
- `packages/engine/src/kernel/query-kind-contract.ts` (modify)
- `packages/engine/src/kernel/query-domain-kinds.ts` (modify if imports change)
- `packages/engine/src/kernel/query-shape-inference.ts` (modify if imports change)
- `packages/engine/test/unit/kernel/query-walk.test.ts` (modify if needed)
- `packages/engine/test/unit/kernel/query-kind-contract.test.ts` (modify if needed)
- `packages/engine/test/unit/types-exhaustive.test.ts` (modify if imports change)

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
3. `packages/engine/test/unit/types-exhaustive.test.ts` — verifies recursive/leaf partition type coverage remains exact after ownership relocation.

### Commands

1. `pnpm -F @ludoforge/engine typecheck`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine test`

## Outcome

Implemented changes vs original plan:

1. Corrected ticket assumptions and scope before implementation:
   - Fixed inverted dependency statement (`query-walk.ts` imported partition types from `query-kind-contract.ts`).
   - Replaced nonexistent `query-runtime-shapes.ts` reference with the real `query-shape-inference.ts` context.
   - Added `types-exhaustive.test.ts` to explicit scope.
2. Added a neutral ownership module: `packages/engine/src/kernel/query-partition-types.ts`.
3. Migrated shared partition aliases into `query-partition-types.ts` and removed them from `query-kind-contract.ts`:
   - `RecursiveOptionsQueryKind`
   - `RecursiveOptionsQuery`
   - `LeafOptionsQueryKind`
   - `LeafOptionsQuery`
   - `RecursiveOptionsQueryKindCoverage`
4. Repointed all in-repo consumers with no backward-compatibility alias layer:
   - `query-walk.ts`
   - `query-kind-contract.ts`
   - `query-kind-contract.test.ts`
   - `types-exhaustive.test.ts`
5. Verified behavior and type invariants via full relevant checks:
   - `pnpm -F @ludoforge/engine typecheck`
   - `pnpm -F @ludoforge/engine test:unit`
   - `pnpm -F @ludoforge/engine test`
   - `pnpm turbo lint`
   - `pnpm turbo test`
6. Post-completion cleanup (same date): renamed the neutral module from `query-types.ts` to `query-partition-types.ts` to reduce ambiguity with broad kernel `types.ts` naming and preserve explicit ownership intent.
