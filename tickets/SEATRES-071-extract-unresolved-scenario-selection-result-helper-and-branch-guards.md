# SEATRES-071: Extract unresolved scenario-selection result helper and branch guards

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — CNL scenario-selection core/helper extraction and compiler branch coverage
**Deps**: archive/tickets/SEATRES/SEATRES-059-harden-scenario-selection-adapter-contract-to-eliminate-input-mismatch.md, archive/tickets/SEATRES/SEATRES-060-enforce-physical-module-boundary-between-scenario-selection-core-and-diagnostics.md

## Problem

`compile-data-assets.ts` currently inlines the unresolved `ScenarioSelectionResult` fallback shape in three call sites (`map`, `pieceCatalog`, `seatCatalog`). This duplicates the contract and creates drift risk if the result shape changes again.

## Assumption Reassessment (2026-03-03)

1. `ScenarioSelectionResult` now includes `requestedId` and is consumed by diagnostics adapters. Verified in `packages/engine/src/cnl/scenario-linked-asset-selection-core.ts` and `packages/engine/src/cnl/scenario-linked-asset-selection-diagnostics.ts`.
2. Compiler call sites currently construct unresolved fallback objects inline instead of via shared policy helper. Verified in `packages/engine/src/cnl/compile-data-assets.ts`.
3. Existing active tickets do not currently scope extraction of unresolved fallback construction into a canonical helper plus dedicated fallback branch tests. Scope is new.

## Architecture Check

1. A single constructor/helper is cleaner than repeated inline object literals because it centralizes the selection-result contract and minimizes future API drift.
2. This remains CNL policy infrastructure and keeps game-specific content in `GameSpecDoc`; `GameDef` and simulation/runtime remain game-agnostic.
3. No backwards-compatibility shims: migrate compiler to the canonical helper and remove duplicated inline fallback objects.

## What to Change

### 1. Introduce canonical unresolved-result helper

1. Add a helper in scenario-selection core ownership that returns unresolved `ScenarioSelectionResult` values.
2. Keep helper semantics deterministic (`selected: undefined`, `failureReason: undefined`, empty alternatives, explicit `requestedId` passthrough).

### 2. Migrate compiler fallback call sites

1. Replace inline fallback object literals in `deriveSectionsFromDataAssets(...)` with the helper.
2. Ensure emitted diagnostics and derivation-failure behavior remain parity-equivalent.

### 3. Add explicit fallback branch tests

1. Add tests covering the no-resolution path for map/pieceCatalog/seatCatalog fallback selection results.
2. Assert diagnostics remain suppressed/preserved according to existing policy when resolution is intentionally skipped.

## Files to Touch

- `packages/engine/src/cnl/scenario-linked-asset-selection-core.ts` (modify)
- `packages/engine/src/cnl/compile-data-assets.ts` (modify)
- `packages/engine/test/unit/scenario-linked-asset-selection.test.ts` (modify)
- `packages/engine/test/unit/compiler-structured-results.test.ts` (modify)

## Out of Scope

- Physical core/diagnostic module split completed in `archive/tickets/SEATRES/SEATRES-060-enforce-physical-module-boundary-between-scenario-selection-core-and-diagnostics.md`
- Any runtime/kernel simulation behavior changes
- Game-specific data/schema edits in GameSpecDoc or visual-config files

## Acceptance Criteria

### Tests That Must Pass

1. Compiler unresolved fallback branches use a shared helper instead of inline result object literals.
2. Missing/ambiguous scenario-linked diagnostic behavior remains parity-equivalent after helper migration.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `ScenarioSelectionResult` construction remains single-source for unresolved fallback behavior.
2. Selection policy and compiler behavior remain game-agnostic and independent of visual-config data.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/scenario-linked-asset-selection.test.ts` — verify unresolved helper shape and requested-id passthrough. Rationale: contract lock for helper semantics.
2. `packages/engine/test/unit/compiler-structured-results.test.ts` — cover no-resolution fallback branches and diagnostics parity. Rationale: behavior guard at compiler surface.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/scenario-linked-asset-selection.test.js`
3. `node --test packages/engine/dist/test/unit/compiler-structured-results.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo typecheck && pnpm turbo lint`
