# SEATRES-013: Deterministic seatCatalog selection diagnostics for ambiguous/missing selectors

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — compiler data-asset selection diagnostics
**Deps**: archive/tickets/SEATRES-006-introduce-seat-catalog-contract-and-decouple-seat-identity.md

## Problem

When multiple `seatCatalog` assets exist without explicit `scenario.seatCatalogAssetId`, the current compile flow can fall through to generic downstream seat errors instead of emitting a direct seat-catalog selection diagnostic.

## Assumption Reassessment (2026-03-01)

1. **Corrected**: `map`, `pieceCatalog`, and `seatCatalog` currently share the same gated selection pattern in `deriveSectionsFromDataAssets()`: selection runs only with explicit selector or exactly one asset. In the multi-asset/no-selector case, selection is skipped, so ambiguity diagnostics are not emitted.
2. The generic ambiguity branch exists in `selectAssetById()`, but is currently unreachable for no-selector multi-asset flows due to the gating condition.
3. `seatCatalog` has additional downstream impact: when selection is skipped, card-driven compilation can emit `CNL_COMPILER_SEAT_CATALOG_REQUIRED`, which is misleading when seat catalogs do exist but selection is ambiguous.
4. This ticket remains focused on seat-catalog selection diagnostics; broader map/piece selection parity should be handled separately.

## Architecture Check

1. Root-cause diagnostics should be emitted at the asset-selection boundary, not inferred from later seat-contract failures.
2. Threading seat-catalog selection failure state into compiler-core avoids misleading follow-on diagnostics and preserves deterministic failure ordering.
3. This is game-agnostic and contract-driven: no game-specific branches, no aliases, no compatibility shims.
4. Ideal longer-term architecture is one shared asset-selection policy helper used uniformly across map/piece/seat paths.

## Updated Scope

### 1. Add explicit seatCatalog selection diagnostics

1. Emit deterministic error when multiple `seatCatalog` assets exist and selected scenario omits `seatCatalogAssetId`.
2. Emit deterministic error when `seatCatalogAssetId` references a non-existent seat catalog (with alternatives).
3. Keep message/path parity with existing map/pieceCatalog selection diagnostics.

### 2. Thread seatCatalog selection failure into derivation failure reporting

1. Extend derivation-failure bookkeeping to include `seatCatalog`.
2. Ensure compiler-core uses this failure state to avoid secondary misleading diagnostics where applicable.

### Out of Scope (for this ticket)

1. Refactoring map/piece selection gating semantics.
2. Introducing new diagnostic codes solely for seat-catalog selection (reuse existing generic data-asset codes).
3. Runtime seat-resolution behavior.
4. Selector normalization policy and runner/UI changes.

## Files to Touch

- `packages/engine/src/cnl/compile-data-assets.ts` (modify)
- `packages/engine/src/cnl/compiler-core.ts` (modify)
- `packages/engine/test/unit/compiler-structured-results.test.ts` (modify/add)
- `packages/engine/test/integration/compile-pipeline.test.ts` (modify/add)

## Acceptance Criteria

### Tests That Must Pass

1. Multi-seat-catalog/no-selector docs fail with a direct seat-catalog ambiguity diagnostic.
2. Invalid `seatCatalogAssetId` fails with deterministic missing-reference diagnostic and alternatives.
3. Card-driven docs with seat-catalog selection failure do not also emit misleading `CNL_COMPILER_SEAT_CATALOG_REQUIRED`.
4. Existing suite: `pnpm -F @ludoforge/engine test`

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
5. `pnpm turbo test --force && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

- **Completion Date**: 2026-03-01
- **What Changed**:
  - Updated seat-catalog selection gating in `compile-data-assets.ts` so seat-catalog selection runs whenever a seat selector is provided or at least one seat catalog exists; this makes ambiguity detection reachable for multi-catalog/no-selector cases.
  - Extended data-asset derivation failure bookkeeping with `derivationFailures.seatCatalog`.
  - Threaded seat-catalog derivation failure into `compiler-core.ts` and suppressed `CNL_COMPILER_SEAT_CATALOG_REQUIRED` when seat-catalog selection already failed (for example ambiguity/unknown selector), preventing misleading secondary diagnostics.
  - Added compile-path unit coverage for:
    - multi-seat-catalog ambiguity with no selector and no `SEAT_CATALOG_REQUIRED` cascade
    - unknown `seatCatalogAssetId` with deterministic alternatives
  - Added integration coverage for the same ambiguity and missing-selector diagnostics via parse+compile pipeline flow.
  - Post-archival refinement generalized the same asset-selection policy to `map` and `pieceCatalog` inference paths:
    - multi-asset/no-selector now emits direct ambiguity diagnostics for map/piece as well
    - added unit + integration regression coverage for map/piece ambiguity diagnostics
- **Deviations From Original Plan**:
  - No change required in `compiler-diagnostic-codes.ts`; existing generic `CNL_COMPILER_DATA_ASSET_AMBIGUOUS` and `CNL_COMPILER_DATA_ASSET_REF_MISSING` codes already modeled the needed contract cleanly.
  - Scope was intentionally expanded after completion to include map/piece selection parity because the same dead ambiguity branch existed there and fixing all three paths yields a cleaner, uniform architecture.
- **Verification Results**:
  - `pnpm turbo build` passed.
  - `node --test packages/engine/dist/test/unit/compiler-structured-results.test.js` passed.
  - `node --test packages/engine/dist/test/integration/compile-pipeline.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm turbo test --force` passed.
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed.
  - Re-ran the full verification suite after map/piece generalization:
    - `pnpm turbo build` passed.
    - `node --test packages/engine/dist/test/unit/compiler-structured-results.test.js` passed.
    - `node --test packages/engine/dist/test/integration/compile-pipeline.test.js` passed.
    - `pnpm -F @ludoforge/engine test` passed.
    - `pnpm turbo test --force` passed.
    - `pnpm turbo typecheck` passed.
    - `pnpm turbo lint` passed.
