# FITLFULMAPANDPIEDAT-004: Encode the complete adjacency graph

**Spec**: 23, Task 23.2
**Priority**: P0
**Depends on**: FITLFULMAPANDPIEDAT-002, FITLFULMAPANDPIEDAT-003 (all 47 spaces must exist)
**Blocks**: FITLFULMAPANDPIEDAT-009 (integration test needs complete map)

## Description

Populate the `adjacentTo` arrays for all 47 spaces in `data/games/fire-in-the-lake.md`, translating the brainstorming Section 11 adjacency map from brainstorming IDs to canonical kebab-case `:none` zone IDs.

**Key rules**:
1. **Symmetry**: If A lists B, then B must list A.
2. **ID translation**: Use the brainstorming-ID-to-canonical-ID mapping established in tickets 002/003.
3. **LoC-to-LoC adjacency**: Some LoCs are adjacent to other LoCs where they share a town endpoint. The brainstorming adjacency map is the canonical reference — all LoC-to-LoC links shown there must be encoded. Examples:
   - `loc-da-nang-dak-to:none` ↔ `loc-kontum-dak-to:none` (share Dak To)
   - `loc-kontum-ban-me-thuot:none` ↔ `loc-ban-me-thuot-da-lat:none` (share Ban Me Thuot)
   - `loc-kontum-ban-me-thuot:none` ↔ `loc-saigon-an-loc-ban-me-thuot:none` (share Ban Me Thuot)
   - `loc-cam-ranh-da-lat:none` ↔ `loc-ban-me-thuot-da-lat:none` (share Da Lat)
   - `loc-cam-ranh-da-lat:none` ↔ `loc-saigon-da-lat:none` (share Da Lat)
   - `loc-ban-me-thuot-da-lat:none` ↔ `loc-saigon-da-lat:none` (share Da Lat)
   - `loc-ban-me-thuot-da-lat:none` ↔ `loc-saigon-an-loc-ban-me-thuot:none` (share Ban Me Thuot)

**Source data**: Brainstorming Section 11, `implementing-fire-in-the-lake-game-spec-doc.md` lines 576–628.

## File list

| File | Action |
|------|--------|
| `data/games/fire-in-the-lake.md` | **Edit** (populate `adjacentTo` arrays for all 47 spaces) |
| `test/unit/fitl-production-map-adjacency.test.ts` | **Create** |

## Out of scope

- Adding or removing spaces (already done in tickets 002–003)
- Piece catalog (tickets 005–006)
- Tracks and lattices (tickets 007–008)
- Any changes to `src/` code
- Any changes to existing test fixtures
- `ProvisionalAdjacencyDef` entries (not needed for FITL — all adjacency is definitive)

## Acceptance criteria

### Tests that must pass

- `npm run build` succeeds
- `npm test` passes
- New unit test `test/unit/fitl-production-map-adjacency.test.ts`:
  - **Symmetry**: For every space A with B in its `adjacentTo`, asserts B has A in its `adjacentTo`
  - **No self-adjacency**: No space lists itself in `adjacentTo`
  - **No duplicates**: No space has duplicate entries in `adjacentTo`
  - **All referenced IDs exist**: Every ID in every `adjacentTo` array corresponds to an actual space in the map
  - **Spot-check city adjacency counts**: Hue has 3 neighbors (Quang Tri-Thua Thien, LOC Hue-Khe Sanh, LOC Hue-Da Nang); Saigon has 9 neighbors; Can Tho has 8 neighbors
  - **LoC-to-LoC links exist**: At least 7 LoC-to-LoC adjacency pairs are present (per the list above)
  - **Every space has at least 1 neighbor**: No isolated spaces

### Invariants that must remain true

- No existing test file is modified
- No `src/` file is modified
- The `test/fixtures/cnl/compiler/fitl-*.md` fixtures remain unchanged
- Space count remains exactly 47
- No space attributes (spaceType, population, econ, etc.) are changed — only `adjacentTo` arrays
