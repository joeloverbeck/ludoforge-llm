# TOKFILAST-034: CNL Predicate Operators — Single Source Contract and No Alias Shorthand

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — CNL lowering/operator contract ownership
**Deps**: archive/tickets/TOKFILAST-025-predicate-operator-contract-single-source-unification.md, archive/tickets/TOKFILAST-026-decouple-validator-from-query-predicate-runtime-module.md

## Problem

CNL lowering still duplicates predicate-operator literals and accepts shorthand alias keys (`eq`/`neq`/`in`/`notIn`) instead of requiring canonical `{ op, value }` shape. This conflicts with strict no-alias architecture and leaves contract-drift risk between CNL and kernel surfaces.

## Assumption Reassessment (2026-03-06)

1. Predicate-op contracts are now centralized in `packages/engine/src/contracts/predicate-op-contract.ts` and consumed via `packages/engine/src/contracts/index.ts`.
2. CNL lowering currently declares independent operator tuples (`SUPPORTED_TOKEN_FILTER_OPS` and `SUPPORTED_ASSET_ROW_FILTER_OPS`) in `packages/engine/src/cnl/compile-conditions.ts`.
3. CNL lowering currently accepts shorthand alias payloads (for example `{ prop, eq: ... }` and `{ field, in: ... }`) and resolves them into canonical operators.
4. TOKFILAST `027`-`033` are already archived/completed and do not deliver CNL predicate-op single-sourcing plus shorthand alias removal.
5. `packages/engine/test/unit/compile-conditions.test.ts` still encodes shorthand alias fixtures (`eq`/`neq`/`in`/`notIn`) across token-filter and query-lowering tests, so this ticket must update those fixtures to canonical `{ op, value }`.

## Architecture Check

1. CNL should consume the same predicate-op contract source as kernel runtime/schema/types to eliminate drift and preserve one ownership boundary.
2. Removing shorthand alias acceptance keeps authoring contracts explicit and deterministic, aligning with no backwards-compatibility / no aliasing policy.
3. This remains game-agnostic infrastructure work: game-specific behavior stays in `GameSpecDoc` data, while `GameDef`/runtime/simulator remain generic.

## What to Change

### 1. Replace duplicated CNL operator tuples with shared contract imports

Use `PredicateOp` and/or `PREDICATE_OPERATORS` from the shared contracts surface (`src/contracts`) in CNL lowering paths for token filters and asset row predicates.

### 2. Remove shorthand alias operator parsing from CNL lowering

Delete fallback resolution via `eq`/`neq`/`in`/`notIn` keys; require canonical `{ op, value }` predicate shape.

### 3. Align CNL diagnostics with canonical contract-only input

Ensure missing/invalid operator diagnostics continue to be deterministic after alias removal and list canonical operators only.

### 4. Update unit fixtures to canonical predicate shape

Replace shorthand alias fixtures in CNL unit coverage with canonical `{ op, value }` predicates and add explicit alias-rejection assertions.

## Files to Touch

- `packages/engine/src/cnl/compile-conditions.ts` (modify)
- `packages/engine/test/unit/compile-conditions.test.ts` (modify)
- `packages/engine/test/unit/compiler-structured-results.test.ts` (modify only if diagnostic-shape assertions require updates)

## Out of Scope

- Token-filter traversal boundary/path behavior (`archive/tickets/TOKFILAST/TOKFILAST-027-token-filter-empty-args-path-fidelity-centralization.md`).
- Condition-surface helper policy work (`archive/tickets/TOKFILAST/TOKFILAST-030-condition-surface-policy-import-origin-enforcement.md` and follow-ups).

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

1. `packages/engine/test/unit/compile-conditions.test.ts` — convert token-filter fixtures to canonical `{ op, value }`, assert canonical acceptance, and assert shorthand alias rejection for token-filter and `assetRows.where`.
2. `packages/engine/test/unit/compiler-structured-results.test.ts` — update only if structured diagnostic-shape expectations change due to alias removal (otherwise no-op).

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`

## Outcome

- Removed shorthand alias parsing (`eq`/`neq`/`in`/`notIn`) from CNL token-filter and `assetRows.where` lowering; canonical `{ op, value }` is now required.
- Replaced local CNL operator tuples with shared `isPredicateOp`/`PREDICATE_OPERATORS` contract usage.
- Promoted predicate-op ownership to shared contracts (`src/contracts/predicate-op-contract.ts`) to satisfy import-boundary architecture and keep a single contract source.
- Updated unit fixtures to canonical predicate shape and added explicit alias-rejection tests for token filters and `assetRows.where`.
- Aligned dependent kernel/test imports and boundary-policy assertions with the shared contracts ownership model.
