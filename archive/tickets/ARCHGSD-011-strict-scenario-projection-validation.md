# ARCHGSD-011: Strict Scenario Projection Validation (Fail Fast)

**Status**: ✅ COMPLETED
**Priority**: P1
**Complexity**: M
**Parent spec**: specs/00-implementation-roadmap.md
**Depends on**: FITLEVECARENC-005

## Description

Harden scenario-to-setup projection so invalid `GameSpecDoc` scenario/piece-catalog data fails compilation deterministically instead of being partially ignored.

### Reassessed Assumptions (Current Codebase)

- `validateScenarioCrossReferences` already enforces some invariants in validator phase:
  - Unknown `initialPlacements[].pieceTypeId`
  - Unknown `outOfPlay[].pieceTypeId`
  - `initialPlacements[].faction` mismatch vs piece catalog faction
  - Inventory conservation (`initialPlacements + outOfPlay` cannot exceed inventory)
- `compile-data-assets` projection still silently ignores unknown piece types (`continue`) and still clamps remaining inventory with `Math.max(0, total - used)`, which can mask data defects when compile is run without explicit prior validation.
- `outOfPlay[].faction` mismatch vs piece catalog faction is not currently enforced in validator or compile projection.
- Projection already emits compile diagnostics for missing pool mappings:
  - `CNL_COMPILER_SCENARIO_OUT_OF_PLAY_POOL_MISSING`
  - `CNL_COMPILER_SCENARIO_AVAILABLE_POOL_MISSING`
- No current integration test explicitly asserts fail-fast compile diagnostics for projection invalid-input scenarios.

### What to Implement

1. Add compile fail-fast projection validation in `compile-data-assets` for projection inputs (even when caller does not invoke validator first):
   - `initialPlacements[].pieceTypeId` missing from selected piece catalog.
   - `outOfPlay[].pieceTypeId` missing from selected piece catalog.
   - `initialPlacements[].faction` mismatch with referenced piece type faction.
   - `outOfPlay[].faction` mismatch with referenced piece type faction (new gap).
2. Add compile fail-fast projection validation for inventory conservation:
   - Error when `initialPlacements + outOfPlay` exceeds inventory total for any `pieceTypeId`.
   - Remove silent clamp behavior (`Math.max(0, ...)`) by skipping available-pool projection for invalid piece types after emitting deterministic error diagnostics.
3. Add projection activation validation:
   - If scenario defines `initialPlacements` or `outOfPlay`, but `factionPools` is absent/empty, emit a compile error.
   - Keep projection fully data-driven and game-agnostic.
4. Keep existing pool-mapping diagnostics and deterministic compile behavior.

## Files to Touch

- `src/cnl/compile-data-assets.ts`
- `test/integration/compile-pipeline.test.ts` (preferred for compile fail-fast assertions)

## Out of Scope

- FITL card/event content changes.
- Simulator runtime behavior changes unrelated to projection validation.

## Acceptance Criteria

### Tests That Must Pass

1. New integration tests for compile fail-fast projection validation:
   - Unknown `pieceTypeId` in `initialPlacements` fails compile with deterministic code/path.
   - Unknown `pieceTypeId` in `outOfPlay` fails compile with deterministic code/path.
   - Faction mismatch between scenario entry and piece catalog fails compile (`initialPlacements` + `outOfPlay`).
   - Oversubscription of inventory fails compile and does not rely on clamp behavior.
   - Scenario setup fields present without `factionPools` fails compile.
2. Existing projection happy-path tests continue to pass:
   - `test/integration/fitl-scenario-setup-projection.test.ts`
3. `npm run build` passes.
4. `npm test` passes.
5. `npm run lint` passes.

### Invariants That Must Remain True

- No game-specific hardcoding in compiler/runtime.
- No alias/backward-compat paths.
- Compiler behavior remains deterministic for identical input docs.

## Outcome

- **Completion date**: 2026-02-15
- **What changed**:
  - Added compile fail-fast diagnostics in scenario setup projection for:
    - unknown `initialPlacements[].pieceTypeId`
    - unknown `outOfPlay[].pieceTypeId`
    - `initialPlacements[].faction` mismatch
    - `outOfPlay[].faction` mismatch
    - missing/empty `factionPools` when projection fields are present
    - inventory oversubscription (`initialPlacements + outOfPlay > inventory`)
  - Removed silent clamp behavior from projection by eliminating `Math.max(0, total - used)` and skipping available-pool projection for oversubscribed piece types after emitting diagnostics.
  - Added compile pipeline integration tests that assert deterministic diagnostic code/path coverage for all of the above fail-fast cases.
- **Deviation from original plan**:
  - `test/unit/schemas-scenario.test.ts` was not changed because schema-layer changes were unnecessary; this ticket’s gap was compile-side fail-fast behavior.
- **Verification**:
  - `npm run build`
  - `npm test`
  - `npm run lint`
  - `npm run test:integration -- compile-pipeline`
  - `npm run test:integration -- fitl-scenario-setup-projection`
