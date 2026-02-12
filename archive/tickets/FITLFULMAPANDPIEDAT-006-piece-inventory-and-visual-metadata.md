# FITLFULMAPANDPIEDAT-006: Encode full piece inventory (229 pieces) and visual metadata

**Status**: ✅ COMPLETED
**Spec**: 23, Task 23.4
**Priority**: P0
**Depends on**: FITLFULMAPANDPIEDAT-005 (piece types must exist first)
**Blocks**: FITLFULMAPANDPIEDAT-009 (integration test needs complete catalog)

## Description

### Part A: Inventory

Populate the `inventory` array in the pieceCatalog data asset with `PieceInventoryEntry` entries. The total must sum to exactly 229.

| Piece Type ID | Faction | Count | Source |
|---|---|---|---|
| `us-troops` | us | 40 | Rule 1.2 |
| `us-bases` | us | 6 | Rule 1.2 |
| `us-irregulars` | us | 6 | Rule 1.2 |
| `arvn-troops` | arvn | 30 | Rule 1.2 |
| `arvn-police` | arvn | 30 | Rule 1.2 |
| `arvn-rangers` | arvn | 6 | Rule 1.2 |
| `arvn-bases` | arvn | 3 | Rule 1.2 |
| `nva-troops` | nva | 40 | Rule 1.2 |
| `nva-guerrillas` | nva | 20 | Rule 1.2 |
| `nva-bases` | nva | 9 | Rule 1.2 |
| `vc-guerrillas` | vc | 30 | Rule 1.2 |
| `vc-bases` | vc | 9 | Rule 1.2 |

**Verification**: 40+6+6 + 30+30+6+3 + 40+20+9 + 30+9 = 52 + 69 + 69 + 39 = 229.

### Part B: Visual metadata extension

The spec requires encoding color, shape, and star-symbol data for future visual game reproduction. The existing `PieceTypeCatalogEntry` type has no fields for this.

**Decision (confirmed)**: Extend `PieceTypeCatalogEntry` in `src/kernel/types.ts` with an optional `visual` field containing `color`, `shape`, and `activeSymbol` properties. This keeps all piece metadata co-located.

**Visual data to encode**:

| Piece Type ID | Color | Shape | Active Symbol |
|---|---|---|---|
| `us-troops` | olive | cube | — |
| `us-bases` | olive | round-disk | — |
| `us-irregulars` | olive | cylinder | star |
| `arvn-troops` | yellow | cube | — |
| `arvn-police` | orange | cube | — |
| `arvn-rangers` | yellow | cylinder | star |
| `arvn-bases` | yellow | round-disk | — |
| `nva-troops` | red | cube | — |
| `nva-guerrillas` | red | cylinder | star |
| `nva-bases` | red | round-disk | — |
| `vc-guerrillas` | bright-blue | cylinder | star |
| `vc-bases` | bright-blue | round-disk | — |

The "star" symbol appears on the active side of: US Irregulars, ARVN Rangers, NVA Guerrillas, VC Guerrillas.

## File list

| File | Action |
|------|--------|
| `data/games/fire-in-the-lake.md` | **Edit** (add inventory entries + visual metadata) |
| `src/kernel/types.ts` | **Edit** (add optional `visual` field to `PieceTypeCatalogEntry`) |
| `src/kernel/schemas.ts` | **Edit** (add optional `visual` schema to strict `PieceTypeCatalogEntrySchema`) |
| `test/unit/fitl-production-piece-types.test.ts` | **Edit** (remove stale zero-inventory assumption from ticket 005 scaffold) |
| `test/unit/fitl-production-piece-inventory.test.ts` | **Create** |

## Out of scope

- Scenario initial piece placements (Spec 24)
- Map data (tickets 002–004)
- Tracks and lattices (tickets 007–008)
- Changing existing piece type definitions from ticket 005
- Any changes to existing test fixtures

## Assumptions and scope updates

- `PieceTypeCatalogEntrySchema` is strict, so adding `visual` metadata required updating both `src/kernel/types.ts` and `src/kernel/schemas.ts`.
- The ticket-005 scaffold test in `test/unit/fitl-production-piece-types.test.ts` asserted zero inventory totals; this was updated because ticket 006 replaces scaffold totals with production totals.

## Acceptance criteria

### Tests that must pass

- `npm run build` succeeds
- `npm test` passes
- New unit test `test/unit/fitl-production-piece-inventory.test.ts`:
  - **Total conservation**: Sum of all `PieceInventoryEntry.total` = 229
  - **Per-faction totals**: US=52, ARVN=69, NVA=69, VC=39
  - **Every inventory entry references a valid pieceTypeId**: All `pieceTypeId` values match an entry in `pieceTypes`
  - **Completeness**: All 12 piece types have exactly one inventory entry
  - **No zero counts**: Every inventory entry has `total > 0`
  - **Visual metadata**: Every piece type has `visual.color` and `visual.shape` defined; `visual.activeSymbol: 'star'` is present on exactly us-irregulars, arvn-rangers, nva-guerrillas, vc-guerrillas; all other piece types have no `activeSymbol` (or `activeSymbol: undefined`)

### Invariants that must remain true

- Existing fixture files remain unchanged (especially `test/fixtures/cnl/compiler/fitl-*.md`)
- Existing tests may be updated only where they encode the ticket-005 scaffold assumption that production inventory totals are zero
- Existing tests pass — the `visual` field on `PieceTypeCatalogEntry` must be optional so existing code continues to compile

## Outcome

- **Completed on**: 2026-02-12
- **What changed**:
  - Populated all 12 production piece inventory totals in `data/games/fire-in-the-lake.md` (sum = 229).
  - Added `visual` metadata (`color`, `shape`, optional `activeSymbol`) to all production piece types.
  - Extended shared piece catalog contracts with optional visual metadata in `src/kernel/types.ts` and strict schema support in `src/kernel/schemas.ts`.
  - Added `test/unit/fitl-production-piece-inventory.test.ts` for inventory and visual metadata invariants.
  - Updated `test/unit/fitl-production-piece-types.test.ts` to remove the outdated zero-inventory scaffold assertion.
- **Deviations from original plan**:
  - The ticket originally scoped only `src/kernel/types.ts` for visual metadata; `src/kernel/schemas.ts` also required changes due to strict schema validation.
  - The ticket originally stated no existing tests should be modified; one existing scaffold test required a minimal update to align with production inventory.
- **Verification**:
  - `npm run build` passed.
  - Targeted tests passed:
    - `node --test dist/test/unit/fitl-production-piece-types.test.js dist/test/unit/fitl-production-piece-inventory.test.js dist/test/unit/schemas-top-level.test.js dist/test/unit/data-assets.test.js`
  - `npm test` passed.
