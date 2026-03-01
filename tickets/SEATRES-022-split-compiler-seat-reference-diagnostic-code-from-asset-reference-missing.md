# SEATRES-022: Split compiler seat-reference diagnostics from asset-reference diagnostics

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — compiler diagnostic taxonomy for seat-reference failures
**Deps**: archive/tickets/SEATRES-012-enforce-seat-catalog-references-across-piece-and-scenario-assets.md

## Problem

Compiler currently emits seat-reference failures under `CNL_COMPILER_DATA_ASSET_REF_MISSING`, which is also used for missing asset-id references. This mixes two distinct failure domains and weakens observability/tooling clarity.

## Assumption Reassessment (2026-03-01)

1. `CNL_COMPILER_DATA_ASSET_REF_MISSING` is currently emitted for scenario `map/pieceCatalog/seatCatalog` id misses.
2. Seat-id misses in piece/scenario payload seat fields now also emit `CNL_COMPILER_DATA_ASSET_REF_MISSING`.
3. Active tickets `SEATRES-013` through `SEATRES-019` do not cover compiler diagnostic taxonomy split for seat-reference misses.

## Architecture Check

1. Domain-specific diagnostic codes are cleaner and more extensible for CI/tooling/UX than overloaded generic codes.
2. This change is fully game-agnostic and concerns compiler contract semantics only.
3. No backward-compat aliasing: seat-reference failures should emit their own canonical code.

## What to Change

### 1. Introduce dedicated compiler code for canonical seat-reference misses

1. Add a new compiler diagnostic code for seat-reference missing (for example, `CNL_COMPILER_SEAT_REF_MISSING`).
2. Emit the new code for seat-id reference failures in piece/scenario payload fields.

### 2. Keep asset-reference diagnostics scoped to asset-id lookup failures

1. Continue using `CNL_COMPILER_DATA_ASSET_REF_MISSING` only for missing `mapAssetId` / `pieceCatalogAssetId` / `seatCatalogAssetId` references.
2. Update affected tests to assert separated code domains.

## Files to Touch

- `packages/engine/src/cnl/compiler-diagnostic-codes.ts` (modify/add)
- `packages/engine/src/cnl/compile-data-assets.ts` (modify)
- `packages/engine/test/unit/compiler-structured-results.test.ts` (modify/add)
- `packages/engine/test/unit/compiler-diagnostic-registry-audit.test.ts` (modify/add if required by registry checks)

## Out of Scope

- Validator diagnostic taxonomy
- Seat-catalog selection policy changes
- Runtime error contract changes

## Acceptance Criteria

### Tests That Must Pass

1. Seat-reference failures emit dedicated seat-reference compiler code.
2. Asset-id lookup failures continue emitting `CNL_COMPILER_DATA_ASSET_REF_MISSING`.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Compiler diagnostic codes are domain-specific and deterministic.
2. Canonical seat-reference enforcement remains unchanged; only taxonomy/reporting is refined.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compiler-structured-results.test.ts` — assert dedicated code for seat-reference misses and existing code for asset-id misses.  
Rationale: protects diagnostic-domain separation.
2. `packages/engine/test/unit/compiler-diagnostic-registry-audit.test.ts` — include new diagnostic code in registry expectations if required.  
Rationale: keeps diagnostic inventory synchronized.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/compiler-structured-results.test.js`
3. `node --test packages/engine/dist/test/unit/compiler-diagnostic-registry-audit.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
