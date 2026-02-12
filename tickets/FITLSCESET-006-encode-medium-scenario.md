# FITLSCESET-006: Encode Medium Scenario ("A Better War" 1968-1972)

**Status**: Pending
**Priority**: P0
**Depends on**: FITLSCESET-001, FITLSCESET-003, FITLSCESET-004 (for pattern reference)
**Blocks**: FITLSCESET-008

## Summary

Add the `fitl-scenario-medium` data asset to `data/games/fire-in-the-lake.md` encoding the "Medium: 1968-1972" scenario setup from brainstorming Section 11.

## Detailed Description

Add a YAML data asset block with `id: fitl-scenario-medium`, `kind: scenario`. Follow the same structure established in FITLSCESET-004 for the Full scenario.

### Data to encode

**Metadata**:
- `scenarioName`: "Medium"
- `yearRange`: "1968-1972"
- `usPolicy`: lbj
- `startingLeader`: ky
- `leaderStack`: [khanh, young-turks]

**Deck**:
- `pileCount`: 3, `eventsPerPile`: 12, `coupsPerPile`: 1

**Track values**:
- aid: 30, patronage: 15, trail: 3
- vc-resources: 15, nva-resources: 20, arvn-resources: 30

**Out of play**:
- us-troops/us: 5
- arvn-troops/arvn: 10, arvn-rangers/arvn: 3

**Starting capabilities**:
- Shaded: aaa, main-force-bns, sa-2s, search-and-destroy
- Unshaded: arc-light, m-48-patton

**Initial markers**: per Section 11 Medium scenario support/opposition

**Initial placements** (all 159 placed pieces):
- Per the "Medium scenario placed piece breakdown" in the spec
- VC bases in Tay Ninh must have `status: { tunnel: tunneled }`

**Starting eligibility**: all 4 factions eligible

### Conservation check

| Piece Type | Placed | OOP | Available | Total |
|-----------|--------|-----|-----------|-------|
| us-troops | 30 | 5 | 5 | 40 |
| us-bases | 6 | 0 | 0 | 6 |
| us-irregulars | 6 | 0 | 0 | 6 |
| arvn-troops | 20 | 10 | 0 | 30 |
| arvn-police | 26 | 0 | 4 | 30 |
| arvn-rangers | 3 | 3 | 0 | 6 |
| arvn-bases | 1 | 0 | 2 | 3 |
| nva-troops | 18 | 0 | 22 | 40 |
| nva-guerrillas | 18 | 0 | 2 | 20 |
| nva-bases | 8 | 0 | 1 | 9 |
| vc-guerrillas | 23 | 0 | 7 | 30 |
| vc-bases | 8 | 0 | 1 | 9 |

## Files to Touch

| File | Change |
|------|--------|
| `data/games/fire-in-the-lake.md` | Add `fitl-scenario-medium` data asset block |

## Out of Scope

- Full scenario (FITLSCESET-004)
- Short scenario (FITLSCESET-005)
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
- The `fitl-scenario-medium` asset is found in `doc.dataAssets` with `kind: 'scenario'`

### Invariants That Must Remain True

- Existing data assets unchanged
- All space IDs match the Space ID Mapping
- Piece counts match the conservation table exactly
- YAML 1.2 strict: quoted strings, no aliases
- Track IDs match the map asset's actual format
- Structure matches the pattern from FITLSCESET-004
