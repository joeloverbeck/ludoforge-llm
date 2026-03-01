# SEATRES-013: Deterministic seatCatalog selection diagnostics for ambiguous/missing selectors

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — compiler data-asset selection diagnostics
**Deps**: archive/tickets/SEATRES-006-introduce-seat-catalog-contract-and-decouple-seat-identity.md

## Problem

When multiple `seatCatalog` assets exist without explicit `scenario.seatCatalogAssetId`, the current compile flow can fall through to generic downstream seat errors instead of emitting a direct seat-catalog selection diagnostic.

## Assumption Reassessment (2026-03-01)

1. `map` and `pieceCatalog` selection paths already emit explicit missing/ambiguous selection diagnostics.
2. `seatCatalog` selection currently resolves only when explicit selector exists or exactly one catalog exists; no dedicated ambiguous selector diagnostic is emitted in the multi-catalog/no-selector case.
3. This gap is not covered by active tickets `SEATRES-007` through `SEATRES-011`.

## Architecture Check

1. Explicit selection diagnostics at the asset-selection boundary are cleaner than relying on late cascading xref failures.
2. This preserves agnostic architecture: diagnostics express generic asset-contract invariants independent of game semantics.
3. No compatibility aliases are added; ambiguous selection remains a hard error.

## What to Change

### 1. Add explicit seatCatalog selection diagnostics

1. Emit deterministic error when multiple `seatCatalog` assets exist and selected scenario omits `seatCatalogAssetId`.
2. Emit deterministic error when `seatCatalogAssetId` references a non-existent seat catalog (with alternatives).
3. Keep message/path parity with existing map/pieceCatalog selection diagnostics.

### 2. Thread seatCatalog selection failure into derivation failure reporting

1. Extend derivation-failure bookkeeping to include `seatCatalog`.
2. Ensure compiler-core uses this failure state to avoid secondary misleading diagnostics where applicable.

## Files to Touch

- `packages/engine/src/cnl/compile-data-assets.ts` (modify)
- `packages/engine/src/cnl/compiler-core.ts` (modify)
- `packages/engine/src/cnl/compiler-diagnostic-codes.ts` (modify/add)
- `packages/engine/test/unit/compiler-structured-results.test.ts` (modify/add)
- `packages/engine/test/integration/compile-pipeline.test.ts` (modify/add)

## Out of Scope

- Runtime seat resolution behavior
- Selector normalization policy
- Visual config and runner behavior

## Acceptance Criteria

### Tests That Must Pass

1. Multi-seat-catalog/no-selector docs fail with a direct seat-catalog ambiguity diagnostic.
2. Invalid `seatCatalogAssetId` fails with deterministic missing-reference diagnostic and alternatives.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Asset selection failures are surfaced at selection boundaries, not via downstream incidental errors.
2. Seat-catalog selection semantics match map/pieceCatalog selection rigor.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compiler-structured-results.test.ts` — add ambiguous/missing seat-catalog selector cases.  
Rationale: enforces deterministic diagnostics in compile core.
2. `packages/engine/test/integration/compile-pipeline.test.ts` — add multi-seat-catalog scenario selection behavior coverage.  
Rationale: validates realistic data-asset pipeline behavior.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/compiler-structured-results.test.js`
3. `node --test packages/engine/dist/test/integration/compile-pipeline.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
