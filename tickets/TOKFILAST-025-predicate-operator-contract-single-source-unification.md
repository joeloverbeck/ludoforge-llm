# TOKFILAST-025: Unify Predicate Operator Contracts Into a Single Kernel Source of Truth

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel predicate contracts used by runtime, AST types, and schemas
**Deps**: archive/tickets/TOKFILAST/TOKFILAST-018-token-filter-predicate-operator-fail-closed-hardening.md

## Problem

Predicate operator literals (`eq|neq|in|notIn`) are still duplicated across runtime evaluation, AST type declarations, and schema validation. This duplication creates contract-drift risk and weakens long-term maintainability.

## Assumption Reassessment (2026-03-06)

1. Runtime/validator allow-list now exists in `packages/engine/src/kernel/query-predicate.ts` (`PREDICATE_OPERATORS` + `isPredicateOp`).
2. AST and schema layers still declare operator literals independently (`types-ast.ts` and `schemas-ast.ts` unions), rather than consuming a shared contract source.
3. Token-filter traversal utilities also duplicate predicate-operator literals (`packages/engine/src/kernel/token-filter-expr-utils.ts`) and must consume the same shared contract to avoid drift.
4. Existing active TOKFILAST tickets (`019`-`024`) do not cover cross-layer operator literal deduplication across runtime/types/schema/traversal contracts.

## Architecture Check

1. A single exported predicate-operator contract module is cleaner than repeated string unions and independently maintained literals.
2. Shared kernel contracts keep `GameDef` and simulation/game runtime game-agnostic; no game-specific branching is introduced.
3. No backwards-compatibility aliases/shims are introduced; only contract ownership is normalized.

## What to Change

### 1. Extract a dedicated predicate-operator contract module

Create a small kernel contract module that owns:
- predicate operator literal tuple
- derived `PredicateOp` type
- reusable type guard

### 2. Adopt shared contract in runtime, AST types, and schemas

Replace duplicated literal unions/allow-lists in runtime/types/schema/traversal code with imports from the shared contract module.

### 3. Add guardrail tests for contract single-sourcing

Add/extend tests to ensure all predicate-operator surfaces remain aligned to the shared source and fail if drift is reintroduced.

## Files to Touch

- `packages/engine/src/kernel/<predicate-op-contract>.ts` (new)
- `packages/engine/src/kernel/query-predicate.ts` (modify)
- `packages/engine/src/kernel/token-filter-expr-utils.ts` (modify)
- `packages/engine/src/kernel/types-ast.ts` (modify)
- `packages/engine/src/kernel/schemas-ast.ts` (modify)
- `packages/engine/test/unit/query-predicate.test.ts` (modify)
- `packages/engine/test/unit/kernel/token-filter-expr-utils.test.ts` (modify)
- `packages/engine/test/unit/schemas-ast.test.ts` (modify, if needed for parity assertions)
- `packages/engine/test/unit/types-exhaustive.test.ts` (modify, if needed for compile-time contract parity checks)

## Out of Scope

- Token-filter traversal predicate-node shape/path hardening (`archive/tickets/TOKFILAST/TOKFILAST-019-token-filter-predicate-shape-and-fold-path-contract-hardening.md`).
- Traversal boundary mapper centralization (`archive/tickets/TOKFILAST/TOKFILAST-020-token-filter-traversal-boundary-mapper-centralization.md`).

## Acceptance Criteria

### Tests That Must Pass

1. Runtime, AST type, and schema predicate-operator sets are sourced from one contract definition.
2. No duplicated inline literal unions/allow-lists for predicate operators remain on token-filter/query-predicate/traversal surfaces.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. Predicate-operator contracts remain deterministic, fail-closed, and game-agnostic.
2. Schema/type/runtime operator semantics stay aligned without per-surface aliasing.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/query-predicate.test.ts` — assert runtime guard behavior stays aligned with shared operator contract.
2. `packages/engine/test/unit/kernel/token-filter-expr-utils.test.ts` — assert traversal predicate guards use the shared operator contract.
3. `packages/engine/test/unit/schemas-ast.test.ts` — assert schema accepts exactly canonical predicate operators.
4. `packages/engine/test/unit/types-exhaustive.test.ts` — ensure compile-time operator unions map to shared contract type.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`
