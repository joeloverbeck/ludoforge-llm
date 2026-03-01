# SEATRES-026: Model scenario-selection failure reasons and suppress dependent cascades

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — compiler data-asset derivation reason model and suppression policy
**Deps**: tickets/SEATRES-025-typed-asset-selection-failure-reasons-and-cascade-gating-hardening.md

## Problem

When scenario selection fails (`CNL_COMPILER_DATA_ASSET_SCENARIO_AMBIGUOUS` or `CNL_COMPILER_DATA_ASSET_SCENARIO_SELECTOR_MISSING`), compiler currently still emits downstream dependent diagnostics like missing `doc.zones` and, in card-driven docs, `CNL_COMPILER_SEAT_CATALOG_REQUIRED`. This dilutes root-cause-first diagnostics and makes failure output noisier than necessary.

## Assumption Reassessment (2026-03-01)

1. `deriveSectionsFromDataAssets()` now tracks typed failure reasons for map/pieceCatalog/seatCatalog selection, but scenario-selection failure is still modeled as a boolean (`failed`) and not threaded into derivation reason policy.
2. `compiler-core` suppression now keys on derivation reasons; because scenario reasons are missing, scenario-root-cause failures do not suppress dependent cascade diagnostics.
3. This gap is not currently captured by active tickets focused on map/piece/seat reason typing.

## Architecture Check

1. Scenario selection is an upstream contract prerequisite for scenario-derived map/piece/seat resolution; it should be represented as a first-class derivation failure reason.
2. Root-cause-first suppression keeps diagnostics deterministic and cleaner without introducing game-specific behavior into compiler/runtime.
3. No backwards-compatibility aliases/shims: diagnostics remain strict; only redundant dependent cascades are gated.

## What to Change

### 1. Extend derivation reason model to include scenario selection failures

1. Introduce typed scenario-selection reasons (for example `scenario-ambiguous`, `scenario-selector-missing`) in data-asset derivation output.
2. Thread scenario reasons through the same derivation/suppression contract used by compiler-core.

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
