# FITLFULMAPANDPIEDAT-005: Encode all piece types with status dimensions
**Status**: ✅ COMPLETED

**Spec**: 23, Task 23.3
**Priority**: P0
**Depends on**: FITLFULMAPANDPIEDAT-001
**Blocks**: FITLFULMAPANDPIEDAT-006 (inventory references piece type IDs)

## Description

Populate the `pieceCatalog` data asset in `data/games/fire-in-the-lake.md` with all `PieceTypeCatalogEntry` entries. Each entry defines a faction-specific piece type with its status dimensions and transitions.

### Assumption Reassessment (2026-02-12)

- The current production asset at `data/games/fire-in-the-lake.md` has `pieceCatalog.payload: {}` (no `pieceTypes` and no `inventory` keys yet).
- There is no existing test that asserts production FITL piece type coverage/status transitions.
- Runtime validation requires an `inventory` declaration per piece type when piece catalog payload validation is invoked.

### Updated scope for this ticket

- Encode all 12 `pieceTypes` entries and status transitions.
- Add a matching `inventory` scaffold with exactly one entry per encoded piece type, using `total: 0` placeholders.
- Keep exact inventory counts and visual metadata deferred to ticket 006.

**Piece types to encode**:

| Piece Type ID | Faction | Status Dimensions | Transitions |
|---|---|---|---|
| `us-troops` | us | (none) | (none) |
| `us-bases` | us | (none) | (none) |
| `us-irregulars` | us | [activity] | underground → active, active → underground |
| `arvn-troops` | arvn | (none) | (none) |
| `arvn-police` | arvn | (none) | (none) |
| `arvn-rangers` | arvn | [activity] | underground → active, active → underground |
| `arvn-bases` | arvn | (none) | (none) |
| `nva-troops` | nva | (none) | (none) |
| `nva-guerrillas` | nva | [activity] | underground → active, active → underground |
| `nva-bases` | nva | [tunnel] | untunneled → tunneled, tunneled → untunneled |
| `vc-guerrillas` | vc | [activity] | underground → active, active → underground |
| `vc-bases` | vc | [tunnel] | untunneled → tunneled, tunneled → untunneled |

**Notes**:
- Troops and Police are always active — no status dimensions.
- US and ARVN Bases have no tunnel dimension (only NVA/VC bases can be tunneled).
- `activity` dimension: `underground` ↔ `active`
- `tunnel` dimension: `untunneled` ↔ `tunneled`

## File list

| File | Action |
|------|--------|
| `data/games/fire-in-the-lake.md` | **Edit** (populate pieceCatalog pieceTypes array and placeholder inventory entries) |
| `test/unit/fitl-production-piece-types.test.ts` | **Create** |

## Out of scope

- Piece inventory counts greater than zero (ticket 006)
- Visual metadata (color, shape, star symbol — ticket 006)
- Map data (tickets 002–004)
- Tracks and lattices (tickets 007–008)
- Any changes to `src/` code
- Any changes to existing test fixtures

## Acceptance criteria

### Tests that must pass

- `npm run build` succeeds
- `npm test` passes
- New unit test `test/unit/fitl-production-piece-types.test.ts`:
  - Parses the pieceCatalog asset from `data/games/fire-in-the-lake.md`
  - Asserts exactly 12 piece type entries
  - **Faction completeness**: US has 3 types (troops, bases, irregulars); ARVN has 4 (troops, police, rangers, bases); NVA has 3 (troops, guerrillas, bases); VC has 2 (guerrillas, bases)
  - **Activity dimension**: us-irregulars, arvn-rangers, nva-guerrillas, vc-guerrillas all have `activity` in statusDimensions
  - **Tunnel dimension**: nva-bases, vc-bases have `tunnel` in statusDimensions
  - **No status dimensions**: us-troops, us-bases, arvn-troops, arvn-police, arvn-bases, nva-troops have empty statusDimensions
  - **Transitions are bidirectional**: For each piece with activity, both underground→active and active→underground transitions exist; for tunnel, both untunneled→tunneled and tunneled→untunneled
  - **No unexpected dimensions**: No piece type has both `activity` and `tunnel` simultaneously
  - **Inventory scaffold alignment**: Exactly 12 inventory entries exist, one per pieceTypeId, each with matching faction and `total: 0`

### Invariants that must remain true

- No existing test file is modified
- No `src/` file is modified
- The `test/fixtures/cnl/compiler/fitl-*.md` fixtures remain unchanged

## Outcome

- **Completion date**: 2026-02-12
- **What changed**:
  - Populated `data/games/fire-in-the-lake.md` piece catalog with all 12 piece types, correct status dimensions, and bidirectional transitions.
  - Added `test/unit/fitl-production-piece-types.test.ts` to assert piece-type completeness, dimension assignments, transition coverage, and no mixed `activity`+`tunnel` dimensions.
  - Added a 12-entry placeholder inventory scaffold (`total: 0`) aligned to piece type IDs/factions.
- **Deviation from original plan**:
  - Original ticket scoped only `pieceTypes`; implementation also added placeholder `inventory` entries to align with the validator contract while keeping real counts deferred to ticket 006.
- **Verification**:
  - `npm run build` passed.
  - `npm test` passed.
