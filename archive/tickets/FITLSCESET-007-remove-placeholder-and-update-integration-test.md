# FITLSCESET-007: Remove Placeholder Scenario and Update Integration Test

**Status**: ✅ COMPLETED
**Priority**: P0
**Depends on**: FITLSCESET-004, FITLSCESET-005, FITLSCESET-006
**Blocks**: FITLSCESET-008

## Summary

Remove the empty `fitl-scenario-production` placeholder data asset from `data/games/fire-in-the-lake.md` and update `test/integration/fitl-production-data-compilation.test.ts` to reflect the new scenario asset landscape.

## Detailed Description

### Remove placeholder

The asset at line 649 of `data/games/fire-in-the-lake.md`:
```yaml
  - id: fitl-scenario-production
    kind: scenario
    payload: {}
```
must be removed entirely. It is replaced by the three named scenario assets added in FITLSCESET-004/005/006.

### Update integration test

The test `fitl-production-data-compilation.test.ts` currently expects this exact validation profile (lines 40-47):
```typescript
const expectedValidationProfile = new Set([
  'CNL_VALIDATOR_REQUIRED_SECTION_MISSING|doc.actions',
  'CNL_VALIDATOR_DATA_ASSET_SCENARIO_REF_INVALID|doc.dataAssets.2.payload.mapAssetId',
  'CNL_VALIDATOR_DATA_ASSET_SCENARIO_REF_INVALID|doc.dataAssets.2.payload.pieceCatalogAssetId',
  'CNL_VALIDATOR_REQUIRED_SECTION_MISSING|doc.endConditions',
  'CNL_VALIDATOR_METADATA_PLAYERS_INVALID|doc.metadata.players',
  'CNL_VALIDATOR_REQUIRED_SECTION_MISSING|doc.turnStructure',
]);
```

After removing the empty scenario and adding three valid ones, the two `SCENARIO_REF_INVALID` entries for `dataAssets.2` must be removed. The new scenarios have valid `mapAssetId` and `pieceCatalogAssetId` references, so they should produce no scenario-ref diagnostics.

The updated expected profile should be:
```typescript
const expectedValidationProfile = new Set([
  'CNL_VALIDATOR_REQUIRED_SECTION_MISSING|doc.actions',
  'CNL_VALIDATOR_REQUIRED_SECTION_MISSING|doc.endConditions',
  'CNL_VALIDATOR_METADATA_PLAYERS_INVALID|doc.metadata.players',
  'CNL_VALIDATOR_REQUIRED_SECTION_MISSING|doc.turnStructure',
]);
```

**Important**: The data asset index paths (`doc.dataAssets.2`, etc.) are positional. After adding 3 new scenarios and removing 1, the indexes will shift. Verify the exact expected diagnostics by running the test first and observing the actual profile.

### Add scenario asset count assertion

Add an assertion that exactly 3 scenario assets exist with the expected IDs: `fitl-scenario-full`, `fitl-scenario-short`, `fitl-scenario-medium`.

## Files to Touch

| File | Change |
|------|--------|
| `data/games/fire-in-the-lake.md` | Remove `fitl-scenario-production` data asset |
| `test/integration/fitl-production-data-compilation.test.ts` | Update expected validation profile; add scenario asset count assertion |

## Out of Scope

- Type definitions (`src/kernel/types.ts`)
- Zod schemas (`src/kernel/schemas.ts`)
- Validator logic (`src/cnl/validate-spec.ts`)
- Compiler logic (`src/cnl/compiler.ts`)
- Scenario content (already done in FITLSCESET-004/005/006)
- Golden validation tests (FITLSCESET-008)

## Acceptance Criteria

### Tests That Must Pass

- `npm run build` passes
- `npm test` — all tests pass, including the updated `fitl-production-data-compilation.test.ts`
- No data asset with id `fitl-scenario-production` exists in the parsed doc
- Exactly 3 scenario assets exist with ids `fitl-scenario-full`, `fitl-scenario-short`, `fitl-scenario-medium`

### Invariants That Must Remain True

- `fitl-map-production` and `fitl-piece-catalog-production` assets unchanged
- All non-scenario-related assertions in `fitl-production-data-compilation.test.ts` unchanged (47 spaces, 7 tracks, 12 piece types, 229 total inventory, etc.)
- No other test files modified

## Outcome

**Completed**: 2026-02-12

### Changes Made
- Removed `fitl-scenario-production` placeholder from `data/games/fire-in-the-lake.md`
- Updated `test/integration/fitl-production-data-compilation.test.ts`: removed 2 `SCENARIO_REF_INVALID` entries from expected validation profile, added assertions for exactly 3 scenario assets with correct IDs, added assertion that `fitl-scenario-production` no longer exists
- Updated `test/unit/fitl-production-data-scaffold.test.ts`: adjusted data asset count from 6 to 5 and removed extra `'scenario'` kind entry (ticket invariant "no other test files modified" conflicted with "all tests pass" — this test counted the removed placeholder)

### Deviations
- `fitl-production-data-scaffold.test.ts` was also modified (not listed in ticket) because it asserted the total data asset count including the placeholder

### Verification
- `npm run build` passes
- `npm test` — 633/633 tests pass, 0 failures
