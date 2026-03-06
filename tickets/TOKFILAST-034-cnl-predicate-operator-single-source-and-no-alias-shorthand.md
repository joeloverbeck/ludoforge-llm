# TOKFILAST-034: CNL Predicate Operators — Single Source Contract and No Alias Shorthand

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — CNL lowering/operator contract ownership
**Deps**: archive/tickets/TOKFILAST-025-predicate-operator-contract-single-source-unification.md, archive/tickets/TOKFILAST-026-decouple-validator-from-query-predicate-runtime-module.md

## Problem

CNL lowering still duplicates predicate-operator literals and accepts shorthand alias keys (`eq`/`neq`/`in`/`notIn`) instead of requiring canonical `{ op, value }` shape. This conflicts with strict no-alias architecture and leaves contract-drift risk between CNL and kernel surfaces.

## Assumption Reassessment (2026-03-06)

1. Kernel predicate-op contracts are now centralized in `packages/engine/src/kernel/predicate-op-contract.ts`.
2. CNL lowering currently declares independent operator tuples (`SUPPORTED_TOKEN_FILTER_OPS` and `SUPPORTED_ASSET_ROW_FILTER_OPS`) in `packages/engine/src/cnl/compile-conditions.ts`.
3. CNL lowering currently accepts shorthand alias payloads (for example `{ prop, eq: ... }` and `{ field, in: ... }`) and resolves them into canonical operators.
4. Existing active TOKFILAST tickets (`027`-`033`) do not scope CNL predicate-op single-sourcing plus shorthand alias removal.

## Architecture Check

1. CNL should consume the same predicate-op contract source as kernel runtime/schema/types to eliminate drift and preserve one ownership boundary.
2. Removing shorthand alias acceptance keeps authoring contracts explicit and deterministic, aligning with no backwards-compatibility / no aliasing policy.
3. This remains game-agnostic infrastructure work: game-specific behavior stays in `GameSpecDoc` data, while `GameDef`/runtime/simulator remain generic.

## What to Change

### 1. Replace duplicated CNL operator tuples with shared contract imports

Use `PredicateOp` and/or `PREDICATE_OPERATORS` from `predicate-op-contract.ts` in CNL lowering paths for token filters and asset row predicates.

### 2. Remove shorthand alias operator parsing from CNL lowering

Delete fallback resolution via `eq`/`neq`/`in`/`notIn` keys; require canonical `{ op, value }` predicate shape.

### 3. Align CNL diagnostics with canonical contract-only input

Ensure missing/invalid operator diagnostics continue to be deterministic after alias removal and list canonical operators only.

## Files to Touch

- `packages/engine/src/cnl/compile-conditions.ts` (modify)
- `packages/engine/test/unit/compile-conditions.test.ts` (modify)
- `packages/engine/test/unit/compiler-structured-results.test.ts` (modify, if diagnostic-shape assertions require updates)

## Out of Scope

- Token-filter traversal boundary/path behavior (`archive/tickets/TOKFILAST/TOKFILAST-027-token-filter-empty-args-path-fidelity-centralization.md`).
- Condition-surface helper policy work (`tickets/TOKFILAST-030-condition-surface-policy-import-origin-enforcement.md` and follow-ups).

## Acceptance Criteria

### Tests That Must Pass

1. CNL token-filter and asset-row predicate lowering source predicate operators from shared kernel contract definitions.
2. CNL rejects shorthand alias predicate keys and accepts canonical `{ op, value }` only.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. Predicate-op contract ownership is single-source across CNL, validator, schema, types, and runtime layers.
2. No alias/backwards-compatibility parsing paths remain for CNL predicate operators.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-conditions.test.ts` — assert canonical predicate shape acceptance and shorthand alias rejection.
2. `packages/engine/test/unit/compiler-structured-results.test.ts` — verify deterministic CNL diagnostics for invalid predicate operator payloads after alias removal.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`
