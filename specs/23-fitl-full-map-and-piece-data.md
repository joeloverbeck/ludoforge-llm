# Spec 23: FITL Full Map and Piece Data

**Status**: Draft
**Priority**: P0
**Complexity**: L
**Dependencies**: None (foundation types already exist)
**Estimated effort**: 2–3 days
**Source sections**: Brainstorming Sections 4.1, 11 (Map Data)

## Overview

Create the **canonical production GameSpecDoc** for Fire in the Lake at `data/games/fire-in-the-lake.md`. This encodes the full 47-space map (8 cities + 22 provinces + 17 LoCs) with complete adjacency, all piece types with the full 229-piece inventory, 7 numeric tracks, and the Support/Opposition marker lattice. This is pure data encoding — no kernel or compiler changes expected.

This is separate from the minimal test fixtures in `test/fixtures/cnl/compiler/fitl-*.md`, which test kernel/compiler mechanics in isolation with deliberately small data sets.

## Scope

### In Scope

- Create `data/games/` directory structure for production game data
- **8 Cities**: Hue (Pop 2, coastal), Da Nang (Pop 1, coastal), Kontum (Pop 1), Qui Nhon (Pop 1, coastal), Cam Ranh (Pop 1, coastal), An Loc (Pop 1), Saigon (Pop 6, coastal), Can Tho (Pop 1)
- **22 Provinces**: 15 South Vietnamese + 7 foreign (2 Laos, 4 Cambodia, 1 North Vietnam). Each with terrain type (Highland/Lowland/Jungle), population, coastal flag, country
- **17 LoCs**: Each with type tags (`highway` and/or `mekong`), Econ value, coastal flag, correct adjacency to endpoint spaces
- **Complete adjacency graph** matching brainstorming Section 11 (symmetric)
- **All piece types**: US (Troops, Bases, Irregulars), ARVN (Troops, Police, Rangers, Bases), NVA (Troops, Guerrillas, Bases), VC (Guerrillas, Bases)
- **Status dimensions**: `activity` (underground/active) on Guerrillas and SF; `tunnel` (tunneled/untunneled) on NVA/VC Bases
- **Full inventory**: 229 pieces with per-faction counts matching rule 1.2/1.4.1
- **LoC type validation**: Every LoC has at least one of `highway` or `mekong` terrain tags
- **7 NumericTrackDefs**: Faction resources (NVA, VC, ARVN), Aid, Patronage, Trail, Total Econ
- **Support/Opposition SpaceMarkerLatticeDef**: 5-state lattice with constraints for LoC and Pop-0 spaces

### Out of Scope

- Scenario initial placements (Spec 24)
- Operation effects (Spec 26)
- Support/Opposition initial markers (Spec 24)
- Numeric track initial values (Spec 24)
- Existing test fixtures in `test/fixtures/cnl/compiler/fitl-*.md` — these remain unchanged

## Key Types & Interfaces

All types already exist in `src/kernel/types.ts`:

```typescript
// MapSpaceDef — one per space (47 total)
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

## Zone ID Convention

Map space IDs use kebab-case with `:none` owner suffix, matching the existing fixture pattern. Examples: `hue:none`, `da-nang:none`, `quang-tri-thua-thien:none`, `loc-hue-khe-sanh:none`. The brainstorming adjacency map uses different ID styles (e.g. `Hue`, `DaNang`, `QuangTri_ThuaThien`, `LOC_Hue_KheSanh`) — a mapping table from brainstorming IDs to canonical zone IDs should be provided during implementation.

## Implementation Tasks

### Task 23.1: Full Map Encoding

Create `data/games/fire-in-the-lake.md` with a `DataAssetEnvelope<MapPayload>` containing all 47 spaces (8 cities + 22 provinces + 17 LoCs).

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

**LoC-to-LoC adjacency**: Some LoCs are adjacent to other LoCs where they share a town endpoint. Examples: `loc-da-nang-dak-to:none` <-> `loc-kontum-dak-to:none` (share Dak To), `loc-kontum-ban-me-thuot:none` <-> `loc-ban-me-thuot-da-lat:none` and `loc-saigon-an-loc-ban-me-thuot:none` (share Ban Me Thuot). The adjacency map in brainstorming Section 11 is the canonical reference — all LoC-to-LoC links shown there must be encoded.

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

| Faction | Type | Count | Source | Color | Shape |
|---|---|---|---|---|---|
| US | Troops | 40 | Rule 1.2 Force Pool | Olive | Cube
| US | Bases | 6 | Rule 1.2 Force Pool | Olive | Round Disk
| US | Irregulars | 6 | Rule 1.2 Force Pool | Olive | Cylinder
| ARVN | Troops | 30 | Rule 1.2 Force Pool | Yellow | Cube
| ARVN | Police | 30 | Rule 1.2 Force Pool | Orange | Cube
| ARVN | Rangers | 6 | Rule 1.2 Force Pool | Yellow | Cylinder
| ARVN | Bases | 3 | Rule 1.2 Force Pool | Yellow | Round Disk
| NVA | Troops | 40 | Rule 1.2 Force Pool | Red | Cube
| NVA | Guerrillas | 20 | Rule 1.2 Force Pool | Red | Cylinder
| NVA | Bases | 9 | Rule 1.2 Force Pool | Red | Round Disk
| VC | Guerrillas | 30 | Rule 1.2 Force Pool | Bright-Blue
| VC | Bases | 9 | Rule 1.2 Force Pool | Bright-Blue

Note: given that in the future we'll implement a web-based game player that will show colors and shapes of tokens, we need to codify in the GameSpecDocs also those facts.

In addition, the Active sides of these tokens also have a 'Star' symbol, which in the future visual game reproduction would be relevant. Figure out how to encode it:

US Irregulars, ARVN Rangers, NVA Guerrillas, VC Guerrillas.

**REQUIREMENT**: Exact counts MUST be verified against the FITL physical game Force Pool inventory (rule 1.2 / Spaces List sheet). The approximate counts (`~`) in this spec are placeholders. The total must sum to exactly 229. If verification against the physical game is not possible during implementation, the implementer should document which counts are estimated and flag them for later verification.

### Task 23.5: LoC Type Validation

Ensure every LoC space has terrain tags correctly encoding its type:
- Highway LoCs: `terrainTags: ['highway']`
- Mekong LoCs: `terrainTags: ['mekong']`
- Dual LoCs (if any): `terrainTags: ['highway', 'mekong']`

From Section 11, the 4 Mekong LoCs are: Saigon–Can Tho, Can Tho–Chau Doc, Can Tho–Bac Lieu, Can Tho–Long Phu. All others are Highway.

### Task 23.6: NumericTrackDef Definitions

Encode 7 numeric tracks in the MapPayload under `tracks`:

| Track ID | Scope | Faction | Min | Max | Initial |
|---|---|---|---|---|---|
| nvaResources | faction | nva | 0 | 75 | 0 |
| vcResources | faction | vc | 0 | 75 | 0 |
| arvnResources | faction | arvn | 0 | 75 | 0 |
| aid | global | — | 0 | 75 | 0 |
| patronage | global | — | 0 | 75 | 0 |
| trail | global | — | 0 | 4 | 0 |
| totalEcon | global | — | 0 | 75 | 0 |

Note: `initial: 0` are neutral defaults. Spec 24 (Scenarios) will set scenario-specific starting values.

### Task 23.7: SpaceMarkerLatticeDef (Support/Opposition)

Encode the Support/Opposition lattice in the MapPayload under `markerLattices`:

```yaml
markerLattices:
  - id: supportOpposition
    states: [activeOpposition, passiveOpposition, neutral, passiveSupport, activeSupport]
    defaultState: neutral
    constraints:
      - spaceTypes: [loc]
        allowedStates: [neutral]
      - populationEquals: 0
        allowedStates: [neutral]
```

This defines the 5-state ordinal scale for population control, with constraints ensuring LoC spaces and Pop-0 spaces can only be neutral (they don't have support/opposition markers in the physical game).

## Testing Requirements

### Unit Tests
- **Adjacency symmetry**: For every space A with B in `adjacentTo`, verify B has A in `adjacentTo`
- **Inventory conservation**: Sum of all `PieceInventoryEntry.total` = 229
- **Piece type completeness**: Every faction has all expected piece types
- **Space count**: Exactly 8 cities + 22 provinces + 17 LoCs = 47 spaces
- **LoC type tags**: Every LoC has at least one of `highway` or `mekong`
- **Country assignment**: Foreign provinces have correct country; all others default to `southVietnam`
- **Population bounds**: Cities 1–6, Provinces 0–2, LoCs 0 (LoCs use econ, not population)
- **Track completeness**: All 7 NumericTrackDefs present with correct scope, faction, bounds
- **Lattice definition**: Support/Opposition lattice has exactly 5 states in correct order
- **Lattice constraints**: LoC spaces and Pop 0 spaces are constrained to neutral

### Integration Tests
- Full map + piece catalog compiles without errors
- Existing FITL integration tests still pass
- **Canonical GameSpecDoc compilation**: `data/games/fire-in-the-lake.md` compiles via `parseGameSpec -> validateGameSpec` without errors

## Acceptance Criteria

1. All 47 spaces (8 cities + 22 provinces + 17 LoCs) present with correct attributes (spaceType, population, econ, terrainTags, country, coastal)
2. Adjacency graph matches brainstorming Section 11 — symmetric and complete
3. All piece types defined with correct status dimensions
4. 229 total pieces across all inventory entries
5. Every LoC has correct type tags (highway and/or mekong)
6. 7 NumericTrackDefs with correct scope and bounds
7. Support/Opposition lattice with 5 states and constraints for LoC/Pop-0 spaces
8. Zone IDs follow kebab-case `:none` convention
9. Canonical GameSpecDoc at `data/games/fire-in-the-lake.md` compiles without errors
10. Existing tests pass unchanged (`npm test`)
11. Build passes (`npm run build`)
