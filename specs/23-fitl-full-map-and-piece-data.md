# Spec 23: FITL Full Map and Piece Data

**Status**: Draft
**Priority**: P0
**Complexity**: L
**Dependencies**: None (foundation types already exist)
**Estimated effort**: 2–3 days
**Source sections**: Brainstorming Sections 4.1, 11 (Map Data)

## Overview

Expand the FITL data from the minimal 2-space foundation fixture to the full ~60-space map with complete adjacency, and from 1 piece type to all piece types with the full 229-piece inventory. This is pure data encoding — no kernel or compiler changes expected.

## Scope

### In Scope

- **8 Cities**: Hue (Pop 2, coastal), Da Nang (Pop 1, coastal), Kontum (Pop 1), Qui Nhon (Pop 1, coastal), Cam Ranh (Pop 1, coastal), An Loc (Pop 1), Saigon (Pop 6, coastal), Can Tho (Pop 1)
- **22 Provinces**: 15 South Vietnamese + 7 foreign (2 Laos, 4 Cambodia, 1 North Vietnam). Each with terrain type (Highland/Lowland/Jungle), population, coastal flag, country
- **17 LoCs**: Each with type tags (`highway` and/or `mekong`), Econ value, coastal flag, correct adjacency to endpoint spaces
- **Complete adjacency graph** matching brainstorming Section 11 (~577 → ~577 adjacency linkages, symmetric)
- **All piece types**: US (Troops, Bases, Irregulars), ARVN (Troops, Police, Rangers, Bases), NVA (Troops, Guerrillas, Bases), VC (Guerrillas, Bases)
- **Status dimensions**: `activity` (underground/active) on Guerrillas and SF; `tunnel` (tunneled/untunneled) on NVA/VC Bases
- **Full inventory**: 229 pieces with per-faction counts matching rule 1.2/1.4.1
- **LoC type validation**: Every LoC has at least one of `highway` or `mekong` terrain tags

### Out of Scope

- Scenario initial placements (Spec 24)
- Operation effects (Spec 26)
- Support/Opposition initial markers (Spec 24)
- Numeric track initial values (Spec 24)

## Key Types & Interfaces

All types already exist in `src/kernel/types.ts`:

```typescript
// MapSpaceDef — one per space (~60 total)
interface MapSpaceDef {
  readonly id: string;
  readonly spaceType: string;        // 'city' | 'province' | 'loc'
  readonly population: number;
  readonly econ: number;
  readonly terrainTags: readonly string[];  // e.g. ['highland'], ['highway', 'mekong']
  readonly country: string;          // 'southVietnam' | 'laos' | 'cambodia' | 'northVietnam'
  readonly coastal: boolean;
  readonly adjacentTo: readonly string[];
}

// MapPayload — the complete map data asset
interface MapPayload {
  readonly spaces: readonly MapSpaceDef[];
  readonly provisionalAdjacency?: readonly ProvisionalAdjacencyDef[];
  readonly tracks?: readonly NumericTrackDef[];
  readonly markerLattices?: readonly SpaceMarkerLatticeDef[];
  readonly spaceMarkers?: readonly SpaceMarkerValueDef[];
}

// PieceInventoryEntry — one per faction/type combination
interface PieceInventoryEntry {
  readonly pieceTypeId: string;
  readonly faction: string;
  readonly total: number;
}

// PieceCatalogPayload — all piece types + inventory
interface PieceCatalogPayload {
  readonly pieceTypes: readonly PieceTypeCatalogEntry[];
  readonly inventory: readonly PieceInventoryEntry[];
}
```

## Implementation Tasks

### Task 23.1: Full Map Encoding

Create or expand `test/fixtures/cnl/compiler/fitl-full-map-pieces.md` with a `DataAssetEnvelope<MapPayload>` containing all ~60 spaces.

**Cities (8)**:

| ID | Pop | Econ | Coastal | Country |
|---|---|---|---|---|
| Hue | 2 | 0 | yes | southVietnam |
| DaNang | 1 | 0 | yes | southVietnam |
| Kontum | 1 | 0 | no | southVietnam |
| QuiNhon | 1 | 0 | yes | southVietnam |
| CamRanh | 1 | 0 | yes | southVietnam |
| AnLoc | 1 | 0 | no | southVietnam |
| Saigon | 6 | 0 | yes | southVietnam |
| CanTho | 1 | 0 | no | southVietnam |

**Provinces (22)**: See brainstorming Section 11 for complete list with terrain, population, coastal, and country attributes.

**LoCs (17)**: See brainstorming Section 11 LoC table for type, econ, coastal, and adjacency.

### Task 23.2: Adjacency Graph

Encode the complete adjacency graph from brainstorming Section 11. Each `MapSpaceDef.adjacentTo` lists all adjacent space IDs. Adjacency must be **symmetric** — if A lists B, B must list A.

Key adjacency rules (from rule 1.3.6):
- Spaces that border one another
- Provinces separated only by a LoC
- LoCs/Provinces separated by Towns

### Task 23.3: Full Piece Catalog

Encode all piece types with status dimensions:

| Piece Type | Factions | Status Dimensions |
|---|---|---|
| Troops | US, ARVN, NVA | (always active) |
| Police | ARVN | (always active) |
| Rangers | ARVN | activity: underground/active |
| Irregulars | US | activity: underground/active |
| Guerrillas | NVA, VC | activity: underground/active |
| Bases | US, ARVN, NVA, VC | tunnel: tunneled/untunneled (NVA/VC only) |

### Task 23.4: Full Piece Inventory (229 pieces)

Encode exact per-faction piece counts:

| Faction | Type | Count | Source |
|---|---|---|---|
| US | Troops | ~30 | Rule 1.2 Force Pool |
| US | Bases | ~6 | Rule 1.2 Force Pool |
| US | Irregulars | ~6 | Rule 1.2 Force Pool |
| ARVN | Troops | ~30 | Rule 1.2 Force Pool |
| ARVN | Police | ~30 | Rule 1.2 Force Pool |
| ARVN | Rangers | ~6 | Rule 1.2 Force Pool |
| ARVN | Bases | ~4 | Rule 1.2 Force Pool |
| NVA | Troops | ~40 | Rule 1.2 Force Pool |
| NVA | Guerrillas | ~20 | Rule 1.2 Force Pool |
| NVA | Bases | ~9 | Rule 1.2 Force Pool |
| VC | Guerrillas | ~30 | Rule 1.2 Force Pool |
| VC | Bases | ~9 | Rule 1.2 Force Pool |

Note: Exact counts must be verified against the FITL physical game Force Pool inventory. The total should sum to 229.

### Task 23.5: LoC Type Validation

Ensure every LoC space has terrain tags correctly encoding its type:
- Highway LoCs: `terrainTags: ['highway']`
- Mekong LoCs: `terrainTags: ['mekong']`
- Dual LoCs (if any): `terrainTags: ['highway', 'mekong']`

From Section 11, the 4 Mekong LoCs are: Saigon–Can Tho, Can Tho–Chau Doc, Can Tho–Bac Lieu, Can Tho–Long Phu. All others are Highway.

## Testing Requirements

### Unit Tests
- **Adjacency symmetry**: For every space A with B in `adjacentTo`, verify B has A in `adjacentTo`
- **Inventory conservation**: Sum of all `PieceInventoryEntry.total` = 229
- **Piece type completeness**: Every faction has all expected piece types
- **Space count**: Exactly 8 cities + 22 provinces + 17 LoCs = 47 spaces (or ~60 including sub-space distinctions)
- **LoC type tags**: Every LoC has at least one of `highway` or `mekong`
- **Country assignment**: Foreign provinces have correct country; all others default to `southVietnam`
- **Population bounds**: Cities 1–6, Provinces 0–2, LoCs 0 (LoCs use econ, not population)

### Integration Tests
- Full map + piece catalog compiles without errors
- Existing FITL integration tests still pass

## Acceptance Criteria

1. All ~60 spaces present with correct attributes (spaceType, population, econ, terrainTags, country, coastal)
2. Adjacency graph matches brainstorming Section 11 — symmetric and complete
3. All piece types defined with correct status dimensions
4. 229 total pieces across all inventory entries
5. Every LoC has correct type tags (highway and/or mekong)
6. Build passes (`npm run build`)
7. All existing tests pass (`npm test`)
