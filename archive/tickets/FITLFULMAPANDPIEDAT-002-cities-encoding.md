# FITLFULMAPANDPIEDAT-002: Encode all 8 cities in the MapPayload

**Status**: ✅ COMPLETED
**Spec**: 23, Task 23.1
**Priority**: P0
**Depends on**: FITLFULMAPANDPIEDAT-001
**Blocks**: FITLFULMAPANDPIEDAT-004 (adjacency depends on all spaces existing)

## Assumption reassessment (updated)

- `data/games/fire-in-the-lake.md` currently exists as the scaffold created by ticket 001, with `fitl-map-production.payload` still empty (`{}`); this ticket must be the first one to add `spaces` entries there.
- The only FITL production data test currently present is `test/unit/fitl-production-data-scaffold.test.ts`; the city-specific assertions described below are not implemented yet and must be added in this ticket.
- Validation for the production map should remain strictly scoped to cities in this ticket (8 entries, no adjacency wiring yet), with provinces/LoCs and complete graph work deferred to tickets 003 and 004.

## Description

Add the 8 city `MapSpaceDef` entries to the map data asset payload in `data/games/fire-in-the-lake.md`. Each city must use kebab-case `:none` zone IDs (e.g., `hue:none`, `da-nang:none`, `saigon:none`).

**Cities to encode**:

| Brainstorming ID | Canonical Zone ID | Pop | Econ | Coastal | Country |
|---|---|---|---|---|---|
| Hue | `hue:none` | 2 | 0 | true | southVietnam |
| DaNang | `da-nang:none` | 1 | 0 | true | southVietnam |
| Kontum | `kontum:none` | 1 | 0 | false | southVietnam |
| QuiNhon | `qui-nhon:none` | 1 | 0 | true | southVietnam |
| CamRanh | `cam-ranh:none` | 1 | 0 | true | southVietnam |
| AnLoc | `an-loc:none` | 1 | 0 | false | southVietnam |
| Saigon | `saigon:none` | 6 | 0 | true | southVietnam |
| CanTho | `can-tho:none` | 1 | 0 | false | southVietnam |

All cities have `spaceType: city`, `terrainTags: []` (cities have no terrain tags), and `adjacentTo: []` (populated in ticket 004).

**ID mapping table**: Include a comment block in the YAML (or a separate mapping section) documenting the brainstorming-ID-to-canonical-ID correspondence for all 8 cities.

## File list

| File | Action |
|------|--------|
| `data/games/fire-in-the-lake.md` | **Edit** (add city entries to map payload) |
| `test/unit/fitl-production-map-cities.test.ts` | **Create** |

## Out of scope

- Provinces (ticket 003)
- LoCs (ticket 003)
- Adjacency data (ticket 004)
- Piece catalog (tickets 005–006)
- Tracks and lattices (tickets 007–008)
- Any changes to `src/` code
- Any changes to existing test fixtures

## Acceptance criteria

### Tests that must pass

- `npm run build` succeeds
- `npm test` passes
- New unit test `test/unit/fitl-production-map-cities.test.ts`:
  - Parses `data/games/fire-in-the-lake.md` map asset
  - Asserts exactly 8 spaces with `spaceType: 'city'`
  - Asserts zone IDs follow `kebab-case:none` pattern
  - Asserts Saigon has `population: 6`, all others have `population: 1` except Hue (`population: 2`)
  - Asserts all cities have `econ: 0`
  - Asserts coastal flags: Hue, Da Nang, Qui Nhon, Cam Ranh, Saigon are coastal; Kontum, An Loc, Can Tho are not
  - Asserts all cities have `country: 'southVietnam'`

### Invariants that must remain true

- No existing test file is modified
- No `src/` file is modified
- The `test/fixtures/cnl/compiler/fitl-*.md` fixtures remain unchanged

## Outcome

- Completion date: 2026-02-12
- What changed:
  - Populated `fitl-map-production.payload.spaces` in `data/games/fire-in-the-lake.md` with the 8 required city `MapSpaceDef` entries.
  - Added the requested city ID mapping comment block in the map payload.
  - Added `test/unit/fitl-production-map-cities.test.ts` to validate IDs, counts, populations, econ, coastal split, `country`, plus empty `terrainTags`/`adjacentTo`.
- Deviations from original plan:
  - Ticket assumptions were updated first to reflect the current scaffold-only baseline and existing test state before any code/data edits.
- Verification results:
  - `npm run build` passed.
  - `node --test dist/test/unit/fitl-production-map-cities.test.js` passed.
  - `npm test` passed.
