# SEATRES-071: Extract unresolved scenario-selection result helper and branch guards

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — CNL scenario-selection core/helper extraction and compiler branch coverage
**Deps**: archive/tickets/SEATRES/SEATRES-059-harden-scenario-selection-adapter-contract-to-eliminate-input-mismatch.md, archive/tickets/SEATRES/SEATRES-060-enforce-physical-module-boundary-between-scenario-selection-core-and-diagnostics.md

## Problem

`compile-data-assets.ts` currently inlines the unresolved `ScenarioSelectionResult` fallback shape in three call sites (`map`, `pieceCatalog`, `seatCatalog`). This duplicates the contract and creates drift risk if the result shape changes again.

## Assumption Reassessment (2026-03-03)

1. `ScenarioSelectionResult` now includes `requestedId` and is consumed by diagnostics adapters. Verified in `packages/engine/src/cnl/scenario-linked-asset-selection-core.ts` and `packages/engine/src/cnl/scenario-linked-asset-selection-diagnostics.ts`.
2. Compiler call sites currently construct unresolved fallback objects inline instead of via shared policy helper. Verified in `packages/engine/src/cnl/compile-data-assets.ts`.
3. Existing tests already cover much of scenario-selection suppression behavior (missing/ambiguous selector cascades and related diagnostics) in `packages/engine/test/unit/compiler-structured-results.test.ts`. The gap is narrower: there is no explicit canonical unresolved-result helper contract test and no targeted assertion that linked-asset missing/ambiguous diagnostics stay silent when inference is intentionally skipped.

## Architecture Check

1. A single constructor/helper is cleaner than repeated inline object literals because it centralizes the selection-result contract and minimizes future API drift.
2. This remains CNL policy infrastructure and keeps game-specific content in `GameSpecDoc`; `GameDef` and simulation/runtime remain game-agnostic.
3. Compared with current architecture, this change is beneficial: it removes local contract duplication while preserving behavior and avoiding game-specific branching in engine code.
4. No backwards-compatibility shims: migrate compiler to the canonical helper and remove duplicated inline fallback objects.

## What to Change

### 1. Introduce canonical unresolved-result helper

1. Add a helper in scenario-selection core ownership that returns unresolved `ScenarioSelectionResult` values.
2. Keep helper semantics deterministic (`selected: undefined`, `failureReason: undefined`, empty alternatives, explicit `requestedId` passthrough).

### 2. Migrate compiler fallback call sites

1. Replace inline fallback object literals in `deriveSectionsFromDataAssets(...)` with the helper.
2. Ensure emitted diagnostics and derivation-failure behavior remain parity-equivalent.

### 3. Add explicit fallback branch tests

1. Add a core unit test that locks the canonical unresolved-result helper contract (`requestedId` passthrough, unresolved fields, empty alternatives).
2. Add compiler tests that explicitly prove linked-asset missing/ambiguous diagnostics are not emitted for map/pieceCatalog/seatCatalog when scenario selection fails and `skipAssetInference` drives unresolved fallbacks.

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

1. `packages/engine/test/unit/scenario-linked-asset-selection.test.ts` — add explicit unresolved helper contract test and requested-id passthrough. Rationale: single-source contract guard for fallback construction.
2. `packages/engine/test/unit/compiler-structured-results.test.ts` — add explicit no-inference branch assertions for map/pieceCatalog/seatCatalog linked-asset diagnostics. Rationale: guard that unresolved fallback selection does not regress diagnostics policy.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/scenario-linked-asset-selection.test.js`
3. `node --test packages/engine/dist/test/unit/compiler-structured-results.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo typecheck && pnpm turbo lint`

## Outcome

- **Completion date**: 2026-03-03
- **What changed**:
  - Added `createUnresolvedScenarioSelectionResult(...)` to `scenario-linked-asset-selection-core.ts` as the canonical unresolved `ScenarioSelectionResult` constructor.
  - Replaced all three inline unresolved fallback literals in `compile-data-assets.ts` (map/pieceCatalog/seatCatalog) with the new helper.
  - Added/updated unit coverage for helper contract semantics and explicit compiler no-inference diagnostic guards.
- **Deviations from original plan**:
  - Scope was refined after reassessment: existing tests already covered broad scenario-selection suppression behavior, so new tests focused specifically on unresolved helper contract and explicit no-inference linked-diagnostic silence.
- **Verification results**:
  - `pnpm turbo build` passed.
  - `node --test packages/engine/dist/test/unit/scenario-linked-asset-selection.test.js` passed.
  - `node --test packages/engine/dist/test/unit/compiler-structured-results.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm turbo typecheck && pnpm turbo lint` passed.
