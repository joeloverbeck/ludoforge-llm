# FITLFULMAPANDPIEDAT-004: Encode the complete adjacency graph

**Status**: ✅ COMPLETED
**Spec**: 23, Task 23.2
**Priority**: P0
**Depends on**: FITLFULMAPANDPIEDAT-002, FITLFULMAPANDPIEDAT-003 (all 47 spaces must exist)
**Blocks**: FITLFULMAPANDPIEDAT-009 (integration test needs complete map)

## Reassessed assumptions (2026-02-12)

- **Confirmed**: `data/games/fire-in-the-lake.md` currently contains all 47 spaces from tickets 002/003, and all `adjacentTo` arrays are empty.
- **Discrepancy found**: Existing test `test/unit/fitl-production-map-cities.test.ts` currently asserts that all city `adjacentTo` arrays are empty. This conflicts with this ticket's goal.
- **Discrepancy found**: Brainstorming Section 11 adjacency rows are not perfectly symmetric as written for every edge. This ticket must enforce the symmetry invariant by adding reverse links where needed while preserving listed neighbors.
- **Scope correction**: Existing map tests may be modified minimally where they encode now-invalid pre-adjacency assumptions.
- **Scope confirmation**: No `src/` runtime/compiler changes are required for this ticket.

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

**Source data**: Brainstorming Section 11, `brainstorming/implementing-fire-in-the-lake-game-spec-doc.md` lines 578–628.

## File list

| File | Action |
|------|--------|
| `data/games/fire-in-the-lake.md` | **Edit** (populate `adjacentTo` arrays for all 47 spaces) |
| `test/unit/fitl-production-map-adjacency.test.ts` | **Create** |
| `test/unit/fitl-production-map-cities.test.ts` | **Edit (minimal)** to remove outdated empty-adjacency assumption |

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

- No `src/` file is modified
- The `test/fixtures/cnl/compiler/fitl-*.md` fixtures remain unchanged
- Space count remains exactly 47
- No space attributes (spaceType, population, econ, etc.) are changed — only `adjacentTo` arrays

## Outcome

- **Completion date**: 2026-02-12
- **What changed**:
  - Populated `adjacentTo` for all 47 FITL map spaces in `data/games/fire-in-the-lake.md`.
  - Added `test/unit/fitl-production-map-adjacency.test.ts` with graph integrity checks (symmetry, self-loop/duplicate/dangling prevention, key city counts, LoC-to-LoC links, no isolated spaces).
  - Updated `test/unit/fitl-production-map-cities.test.ts` to remove outdated “all city adjacency empty” assumption.
- **Deviations from original plan**:
  - Existing test modification was required (ticket originally said no existing test files modified).
  - Brainstorming Section 11 source rows were not fully symmetric for every listed edge; implementation enforced symmetric closure to satisfy ticket invariant.
- **Verification**:
  - `npm run build` passed.
  - `npm run test:unit -- --test-name-pattern \"FITL production map\"` passed.
  - `npm test` passed.
