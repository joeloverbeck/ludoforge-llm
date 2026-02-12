# FITLFULMAPANDPIEDAT-007: Encode 7 NumericTrackDefs

**Spec**: 23, Task 23.6
**Priority**: P0
**Depends on**: FITLFULMAPANDPIEDAT-001
**Blocks**: FITLFULMAPANDPIEDAT-009

## Description

Add the `tracks` array to the map data asset payload in `data/games/fire-in-the-lake.md` with 7 `NumericTrackDef` entries.

**Tracks to encode**:

| Track ID | Scope | Faction | Min | Max | Initial |
|---|---|---|---|---|---|
| `nvaResources` | faction | nva | 0 | 75 | 0 |
| `vcResources` | faction | vc | 0 | 75 | 0 |
| `arvnResources` | faction | arvn | 0 | 75 | 0 |
| `aid` | global | — | 0 | 75 | 0 |
| `patronage` | global | — | 0 | 75 | 0 |
| `trail` | global | — | 0 | 4 | 0 |
| `totalEcon` | global | — | 0 | 75 | 0 |

**Notes**:
- `initial: 0` are neutral defaults; Spec 24 (Scenarios) will set scenario-specific starting values.
- The Trail track has max 4 (representing states 0–4).
- Global tracks have no `faction` field (or `faction: undefined`).

## File list

| File | Action |
|------|--------|
| `data/games/fire-in-the-lake.md` | **Edit** (add `tracks` array to map payload) |
| `test/unit/fitl-production-tracks.test.ts` | **Create** |

## Out of scope

- Scenario-specific initial track values (Spec 24)
- Derived values computed from tracks (Spec 25)
- Map spaces, adjacency, pieces (tickets 002–006)
- Lattice definitions (ticket 008)
- Any changes to `src/` code
- Any changes to existing test fixtures

## Acceptance criteria

### Tests that must pass

- `npm run build` succeeds
- `npm test` passes
- New unit test `test/unit/fitl-production-tracks.test.ts`:
  - Parses the map asset from `data/games/fire-in-the-lake.md`
  - Asserts exactly 7 track definitions present
  - **Faction tracks**: 3 tracks with `scope: 'faction'` — one each for nva, vc, arvn
  - **Global tracks**: 4 tracks with `scope: 'global'` — aid, patronage, trail, totalEcon
  - **Bounds**: All resource tracks have min=0, max=75; trail has min=0, max=4
  - **Initial values**: All tracks have `initial: 0`
  - **Unique IDs**: All track IDs are distinct
  - **Faction assignment**: Each faction track has the correct `faction` field

### Invariants that must remain true

- No existing test file is modified
- No `src/` file is modified
- The `test/fixtures/cnl/compiler/fitl-*.md` fixtures remain unchanged
