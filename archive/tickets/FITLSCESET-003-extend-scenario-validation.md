# FITLSCESET-003: Extend Scenario Validation

**Status**: ✅ COMPLETED
**Priority**: P0
**Depends on**: FITLSCESET-001, FITLSCESET-002
**Blocks**: FITLSCESET-004, FITLSCESET-005, FITLSCESET-006

## Summary

Extend `src/cnl/validate-spec.ts` to validate the new scenario payload fields against referenced map and piece catalog assets. Currently the validator only checks that `mapAssetId` and `pieceCatalogAssetId` are present and reference declared assets (lines 127–173).

## Detailed Description

Add cross-reference validation for scenario payloads:

1. **`initialPlacements` validation**:
   - Each `spaceId` must reference a valid space in the referenced map asset
   - Each `pieceTypeId` must reference a valid piece type in the referenced piece catalog asset
   - Each `faction` must match the faction declared for that piece type
   - `count` must be > 0
   - If `status` is present, keys must be valid status dimensions for the piece type

2. **`initialTrackValues` validation**:
   - Each `trackId` must reference a valid track in the referenced map asset
   - `value` must be within the track's `[min, max]` bounds

3. **`initialMarkers` validation**:
   - Each `spaceId` must reference a valid space in the referenced map asset
   - Each `markerId` must reference a valid marker lattice in the map asset
   - `state` must be a valid state in that lattice

4. **`outOfPlay` validation**:
   - Each `pieceTypeId` must reference a valid piece type
   - `count` must be > 0
   - `faction` must match the faction for that piece type

5. **`deckComposition` validation**:
   - `pileCount`, `eventsPerPile`, `coupsPerPile` must be > 0

6. **`usPolicy` validation**:
   - Must be one of `'jfk' | 'lbj' | 'nixon'` if present

7. **Piece conservation validation**:
   - For each piece type: placed count + out-of-play count <= total inventory
   - Emit warning (not error) if available count is 0 for any type

New diagnostic codes to introduce:
- `CNL_VALIDATOR_SCENARIO_PLACEMENT_SPACE_INVALID`
- `CNL_VALIDATOR_SCENARIO_PLACEMENT_PIECE_INVALID`
- `CNL_VALIDATOR_SCENARIO_PLACEMENT_FACTION_MISMATCH`
- `CNL_VALIDATOR_SCENARIO_TRACK_VALUE_INVALID`
- `CNL_VALIDATOR_SCENARIO_TRACK_VALUE_OUT_OF_BOUNDS`
- `CNL_VALIDATOR_SCENARIO_MARKER_INVALID`
- `CNL_VALIDATOR_SCENARIO_OUT_OF_PLAY_INVALID`
- `CNL_VALIDATOR_SCENARIO_PIECE_CONSERVATION_VIOLATED`
- `CNL_VALIDATOR_SCENARIO_US_POLICY_INVALID`

## Files to Touch

| File | Change |
|------|--------|
| `src/cnl/validate-spec.ts` | Extend scenario validation block (lines 127–174) with new field validation |

## Out of Scope

- Type definitions (FITLSCESET-001)
- Zod schemas (FITLSCESET-002)
- Scenario data assets (`data/games/fire-in-the-lake.md`)
- Compiler changes (`src/cnl/compiler.ts`)
- Golden validation tests (FITLSCESET-008)
- Victory marker computation

## Acceptance Criteria

### Tests That Must Pass

- `npm run typecheck` passes
- `npm test` — all existing tests pass
- New unit tests in `test/unit/validate-spec-scenario.test.ts`:
  - Scenario with valid placements referencing existing map spaces produces no placement errors
  - Scenario referencing a non-existent space ID emits `CNL_VALIDATOR_SCENARIO_PLACEMENT_SPACE_INVALID`
  - Scenario referencing a non-existent piece type emits `CNL_VALIDATOR_SCENARIO_PLACEMENT_PIECE_INVALID`
  - Scenario with `initialTrackValues` out of bounds emits `CNL_VALIDATOR_SCENARIO_TRACK_VALUE_OUT_OF_BOUNDS`
  - Scenario with invalid marker state emits `CNL_VALIDATOR_SCENARIO_MARKER_INVALID`
  - Scenario exceeding piece inventory emits `CNL_VALIDATOR_SCENARIO_PIECE_CONSERVATION_VIOLATED`
  - Scenario with invalid `usPolicy` emits `CNL_VALIDATOR_SCENARIO_US_POLICY_INVALID`

### Invariants That Must Remain True

- Existing scenario validation for `mapAssetId`/`pieceCatalogAssetId` unchanged
- Existing diagnostic codes unchanged
- The `fitl-production-data-compilation.test.ts` expected validation profile may need updating (the empty `fitl-scenario-production` asset currently produces 2 ref-invalid diagnostics — this is expected to change in FITLSCESET-007)
- Validation is additive — new fields are optional, so scenarios without them still pass

## Outcome

- **Completion date**: 2026-02-12
- **What was changed**: Extended `src/cnl/validate-spec.ts` with cross-reference validation for scenario payloads (placements, tracks, markers, out-of-play, deck composition, US policy, piece conservation). Added `test/unit/validate-spec-scenario.test.ts` with unit tests covering all new diagnostic codes.
- **Deviations**: None
- **Verification**: `npm run typecheck` passes, all 633 tests pass (0 failures)
