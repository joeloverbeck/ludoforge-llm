# FITLSCESET-004: Encode Full Scenario ("Nam" 1964-1972)

**Status**: COMPLETED
**Priority**: P0
**Depends on**: FITLSCESET-001 (types exist for reference), FITLSCESET-003 (validation can catch errors)
**Blocks**: FITLSCESET-008 (golden tests)

## Summary

Add the `fitl-scenario-full` data asset to `data/games/fire-in-the-lake.md` encoding the complete "Full: 1964-1972" scenario setup from brainstorming Section 11.

## Detailed Description

Add a YAML data asset block with `id: fitl-scenario-full`, `kind: scenario` to the game spec file. The asset must contain all data from the spec's "Task 24.4" section and the "Full Scenario Conservation" table.

### Data to encode

**Metadata**:
- `scenarioName`: "Full"
- `yearRange`: "1964-1972"
- `usPolicy`: jfk
- `startingLeader`: duong-van-minh
- `leaderStack`: [] (empty — no leaders beneath)

**Deck**:
- `pileCount`: 6, `eventsPerPile`: 12, `coupsPerPile`: 1

**Track values**:
- aid: 15, patronage: 15, trail: 1
- vc-resources: 5, nva-resources: 10, arvn-resources: 30

**Out of play**:
- us-bases/us: 2, us-troops/us: 10
- arvn-bases/arvn: 2, arvn-troops/arvn: 10, arvn-rangers/arvn: 3

**Initial markers** (alignment/support-opposition per space):
- Must encode the support/opposition state for each Province and City
- Use space IDs from the Space ID Mapping table in the spec

**Initial placements** (all 86 placed pieces):
- Per the "Full scenario placed piece breakdown" in the spec
- VC bases in Tay Ninh must have `status: { tunnel: tunneled }`
- All guerrillas and irregulars default to underground — no explicit status needed

**Starting eligibility**: all 4 factions eligible

### Conservation check (self-audit before commit)

| Piece Type | Placed | OOP | Available | Total |
|-----------|--------|-----|-----------|-------|
| us-troops | 9 | 10 | 21 | 40 |
| us-bases | 2 | 2 | 2 | 6 |
| us-irregulars | 3 | 0 | 3 | 6 |
| arvn-troops | 12 | 10 | 8 | 30 |
| arvn-police | 20 | 0 | 10 | 30 |
| arvn-rangers | 1 | 3 | 2 | 6 |
| arvn-bases | 0 | 2 | 1 | 3 |
| nva-troops | 0 | 0 | 40 | 40 |
| nva-guerrillas | 12 | 0 | 8 | 20 |
| nva-bases | 4 | 0 | 5 | 9 |
| vc-guerrillas | 16 | 0 | 14 | 30 |
| vc-bases | 7 | 0 | 2 | 9 |

## Files to Touch

| File | Change |
|------|--------|
| `data/games/fire-in-the-lake.md` | Add `fitl-scenario-full` data asset block |

## Out of Scope

- Short scenario (FITLSCESET-005)
- Medium scenario (FITLSCESET-006)
- Removing `fitl-scenario-production` (FITLSCESET-007)
- Victory marker golden values (FITLSCESET-008)
- Card IDs within deck composition (deferred to Spec 29)
- `totalEcon` — derived value, not stored
- Victory marker starting values — derived values, not stored
- Any changes to `src/` code

## Acceptance Criteria

### Tests That Must Pass

- `npm run build` passes
- `npm test` — existing tests pass (note: `fitl-production-data-compilation.test.ts` may need its expected validation profile updated since there's now a new scenario asset)
- Parse the game spec file: `parseGameSpec()` returns zero parse errors
- The `fitl-scenario-full` asset is found in `doc.dataAssets` with `kind: 'scenario'`

### Invariants That Must Remain True

- Existing data assets (`fitl-map-production`, `fitl-piece-catalog-production`) unchanged
- The `fitl-scenario-production` asset still exists (removed in FITLSCESET-007)
- All space IDs in placements match the Space ID Mapping from the spec
- Piece counts match the conservation table exactly
- YAML follows YAML 1.2 strict: quoted strings, no aliases
- Track IDs use camelCase matching the map asset's track definitions (e.g., `nvaResources` not `nva-resources`) — verify against the map asset's actual track ID format

## Outcome

- **Completed**: 2026-02-12
- **Changes**:
  - `data/games/fire-in-the-lake.md`: Added `fitl-scenario-full` data asset (index 3) with complete Full 1964-1972 scenario — 6 track values, 5 out-of-play entries, 15 initial markers (9 passive support, 6 active opposition), and piece placements across 24 spaces including tunneled VC base at Tay Ninh
  - `test/unit/fitl-production-data-scaffold.test.ts`: Updated expected asset count from 3 to 4 and kinds array to `['map', 'pieceCatalog', 'scenario', 'scenario']`
- **Deviations**: None. All conservation counts verified, all space/piece/track IDs match existing assets.
- **Verification**: `npm run build` passes, all 633 tests pass (0 failures)
