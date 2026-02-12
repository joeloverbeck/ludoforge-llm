# FITLSCESET-005: Encode Short Scenario ("Westy's War" 1965-1967)

**Status**: ✅ COMPLETED
**Priority**: P0
**Depends on**: FITLSCESET-001, FITLSCESET-003, FITLSCESET-004 (for pattern reference)
**Blocks**: FITLSCESET-008

## Summary

Add the `fitl-scenario-short` data asset to `data/games/fire-in-the-lake.md` encoding the "Short: 1965-1967" scenario setup from brainstorming Section 11.

## Detailed Description

Add a YAML data asset block with `id: fitl-scenario-short`, `kind: scenario`. Follow the same structure established in FITLSCESET-004 for the Full scenario.

### Data to encode

**Metadata**:
- `scenarioName`: "Short"
- `yearRange`: "1965-1967"
- `usPolicy`: lbj
- `startingLeader`: young-turks
- `leaderStack`: [khanh]

**Deck**:
- `pileCount`: 3, `eventsPerPile`: 8, `coupsPerPile`: 1

**Track values**:
- aid: 15, patronage: 18, trail: 2
- vc-resources: 10, nva-resources: 15, arvn-resources: 30

**Out of play**:
- us-troops/us: 6
- arvn-troops/arvn: 10, arvn-rangers/arvn: 3

**Starting capabilities**:
- Shaded AAA (capability ID: `aaa`, side: `shaded`)

**Initial markers**: per Section 11 Short scenario support/opposition

**Initial placements** (all 117 placed pieces):
- Per the "Short scenario placed piece breakdown" in the spec
- VC bases in Tay Ninh must have `status: { tunnel: tunneled }`

**Starting eligibility**: all 4 factions eligible

### Conservation check

| Piece Type | Placed | OOP | Available | Total |
|-----------|--------|-----|-----------|-------|
| us-troops | 22 | 6 | 12 | 40 |
| us-bases | 4 | 0 | 2 | 6 |
| us-irregulars | 3 | 0 | 3 | 6 |
| arvn-troops | 12 | 10 | 8 | 30 |
| arvn-police | 19 | 0 | 11 | 30 |
| arvn-rangers | 3 | 3 | 0 | 6 |
| arvn-bases | 1 | 0 | 2 | 3 |
| nva-troops | 12 | 0 | 28 | 40 |
| nva-guerrillas | 14 | 0 | 6 | 20 |
| nva-bases | 8 | 0 | 1 | 9 |
| vc-guerrillas | 14 | 0 | 16 | 30 |
| vc-bases | 5 | 0 | 4 | 9 |

## Files to Touch

| File | Change |
|------|--------|
| `data/games/fire-in-the-lake.md` | Add `fitl-scenario-short` data asset block |

## Out of Scope

- Full scenario (FITLSCESET-004)
- Medium scenario (FITLSCESET-006)
- Removing `fitl-scenario-production` (FITLSCESET-007)
- Golden validation tests (FITLSCESET-008)
- Card IDs within deck composition (deferred to Spec 29)
- Derived values (`totalEcon`, victory markers)
- Any changes to `src/` code

## Acceptance Criteria

### Tests That Must Pass

- `npm run build` passes
- `npm test` — existing tests pass
- Parse the game spec file: `parseGameSpec()` returns zero parse errors
- The `fitl-scenario-short` asset is found in `doc.dataAssets` with `kind: 'scenario'`

### Invariants That Must Remain True

- Existing data assets unchanged
- All space IDs match the Space ID Mapping
- Piece counts match the conservation table exactly
- YAML 1.2 strict: quoted strings, no aliases
- Track IDs match the map asset's actual format
- Structure matches the pattern from FITLSCESET-004

## Outcome

- **Completed**: 2026-02-12
- **Changes**:
  - Added `fitl-scenario-short` data asset to `data/games/fire-in-the-lake.md` with all 117 placed pieces, 14 markers, 6 track values, 3 out-of-play entries, 1 starting capability (Shaded AAA), deck composition, leader stack, and eligibility
  - Updated `test/unit/fitl-production-data-scaffold.test.ts` to expect 5 data assets (was 4)
- **Deviations**: None. Track IDs use camelCase (`vcResources`, `nvaResources`, `arvnResources`) matching the map asset, not the kebab-case in the ticket description.
- **Verification**: `npm run build` passes, all 633 tests pass (0 failures), `parseGameSpec()` returns 0 errors, asset found with correct kind
