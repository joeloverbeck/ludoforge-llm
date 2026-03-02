# SEATRES-026: Model scenario-selection failure reasons and suppress dependent cascades

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — compiler data-asset derivation reason model and suppression policy
**Deps**: archive/tickets/SEATRES/SEATRES-025-typed-asset-selection-failure-reasons-and-cascade-gating-hardening.md

## Problem

When scenario selection fails (`CNL_COMPILER_DATA_ASSET_SCENARIO_AMBIGUOUS` or `CNL_COMPILER_DATA_ASSET_SCENARIO_SELECTOR_MISSING`), compiler currently still emits downstream dependent diagnostics like missing `doc.zones` and, in card-driven docs, `CNL_COMPILER_SEAT_CATALOG_REQUIRED`. This dilutes root-cause-first diagnostics and makes failure output noisier than necessary.

## Assumption Reassessment (2026-03-01)

1. `deriveSectionsFromDataAssets()` tracks typed derivation failures for map/pieceCatalog/seatCatalog only. Scenario selection itself returns typed `failureReason` (`missing-reference` / `ambiguous-selection`) via `selectScenarioRefWithPolicy`, but that reason is currently used only for control flow (`skipAssetInference`) and not persisted in `derivationFailures`.
2. `compiler-core` suppression is reason-aware (`DATA_ASSET_DERIVATION_SUPPRESSION_POLICY`), but it can only act on the recorded derivation failure arrays. Because scenario-root-cause failures are not recorded there, dependent cascades remain unsuppressed in scenario-failure paths.
3. Existing tests already cover direct scenario diagnostics (`CNL_COMPILER_DATA_ASSET_SCENARIO_AMBIGUOUS`, `CNL_COMPILER_DATA_ASSET_SCENARIO_SELECTOR_MISSING`) and existing map/piece/seat suppression behavior, but they do not currently assert suppression of dependent `doc.zones` and `CNL_COMPILER_SEAT_CATALOG_REQUIRED` cascades when scenario selection is the root cause.

## Architecture Check

1. Scenario selection is an upstream contract prerequisite for scenario-derived map/piece/seat resolution; it should be represented as a first-class derivation failure reason.
2. Root-cause-first suppression keeps diagnostics deterministic and cleaner without introducing game-specific behavior into compiler/runtime.
3. No backwards-compatibility aliases/shims: diagnostics remain strict; only redundant dependent cascades are gated.

## What to Change

### 1. Extend derivation reason model to include scenario selection failures

1. Introduce explicit scenario-root-cause derivation reasons in `compile-data-assets` (for example `scenario-selector-missing`, `scenario-ambiguous`) and project them into map/pieceCatalog/seatCatalog derivation failure sets when scenario selection blocks downstream inference.
2. Keep diagnostic code surfaces unchanged (no aliasing/back-compat shims): retain existing scenario diagnostic codes while expanding suppression eligibility reasons.

### 2. Apply reason-aware suppression for scenario-root-cause cascades

1. Suppress dependent `doc.zones` required-section diagnostic when scenario selection failure already explains missing derived zones.
2. Suppress dependent `CNL_COMPILER_SEAT_CATALOG_REQUIRED` when scenario selection failure prevents seat-catalog resolution in card-driven docs.
3. Keep independent diagnostics active (for example malformed YAML in unrelated sections).

### 3. Add regression coverage for scenario-root-cause paths

1. Cover ambiguous scenarios and missing `metadata.defaultScenarioAssetId` selector target.
2. Assert only root-cause diagnostics plus non-dependent diagnostics remain.

## Files to Touch

- `packages/engine/src/cnl/compile-data-assets.ts` (modify)
- `packages/engine/src/cnl/compiler-core.ts` (modify)
- `packages/engine/test/unit/compiler-structured-results.test.ts` (modify/add)
- `packages/engine/test/integration/compile-pipeline.test.ts` (modify/add)

## Out of Scope

- Validator parity for scenario-selection diagnostics
- Runtime/simulator execution semantics
- Runner/UI and visual configuration behavior

## Acceptance Criteria

### Tests That Must Pass

1. Ambiguous scenario selection does not emit dependent `doc.zones` required-section cascade when explicit zones are absent.
2. Missing `metadata.defaultScenarioAssetId` target in card-driven docs does not emit dependent `CNL_COMPILER_SEAT_CATALOG_REQUIRED` cascade.
3. Existing suite: `pnpm -F @ludoforge/engine test`
4. Workspace quality gates for touched areas: `pnpm turbo typecheck` and `pnpm turbo lint`

### Invariants

1. Root-cause diagnostics remain primary and deterministic.
2. `GameSpecDoc` remains the game-specific source, while `GameDef`/simulation remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compiler-structured-results.test.ts` — add scenario-ambiguous and selector-missing suppression assertions.
Rationale: validates compiler-core suppression policy against scenario-root-cause reasons.
2. `packages/engine/test/integration/compile-pipeline.test.ts` — add end-to-end compile-path assertions for the same scenario-root-cause cases.
Rationale: prevents regressions across parse/compile pipeline integration boundaries.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/compiler-structured-results.test.js`
3. `node --test packages/engine/dist/test/integration/compile-pipeline.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo test --force && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

- **Completion Date**: 2026-03-02
- **What Changed**:
  - Added explicit scenario-root-cause derivation reasons in `compile-data-assets` (`scenario-selector-missing`, `scenario-ambiguous`) and propagated them into map/pieceCatalog/seatCatalog derivation failure sets when scenario selection fails.
  - Extended compiler suppression policy to treat those scenario-root-cause reasons as valid cascade-gating inputs for map/piece/seat dependent diagnostics.
  - Added/updated regression coverage in unit and integration suites to assert:
    - ambiguous scenario selection suppresses dependent `doc.zones` required-section cascade
    - missing `metadata.defaultScenarioAssetId` selector target suppresses dependent `CNL_COMPILER_SEAT_CATALOG_REQUIRED` in card-driven docs
- **Deviations From Original Plan**:
  - No architectural deviation from intent; implementation used explicit scenario-specific derivation reasons (rather than generic reason reuse) to preserve root-cause clarity while keeping diagnostics strict.
- **Verification Results**:
  - `pnpm turbo build` passed.
  - `node --test packages/engine/dist/test/unit/compiler-structured-results.test.js` passed.
  - `node --test packages/engine/dist/test/integration/compile-pipeline.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed (`# tests 354`, `# pass 354`, `# fail 0`).
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed.
