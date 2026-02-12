# Spec 24: FITL Scenario Setups

**Status**: Draft
**Priority**: P0
**Complexity**: M
**Dependencies**: Spec 23 (full map and pieces must exist)
**Estimated effort**: 2–3 days
**Source sections**: Brainstorming Sections 4.1, 11 (Scenarios)

## Overview

Encode all 3 FITL scenario setups as separate `kind: scenario` data assets in `data/games/fire-in-the-lake.md`. Currently, the scenario payload only contains `mapAssetId` and `pieceCatalogAssetId` (see `src/cnl/validate-spec.ts:127–173`). This spec extends the scenario payload to include initial piece placements, starting track values, deck composition, starting RVN Leader, starting capabilities, starting eligibility, US Policy, and out-of-play pieces.

Each scenario is a separate data asset:
- `fitl-scenario-full` — Full: 1964–1972 ("Nam")
- `fitl-scenario-short` — Short: 1965–1967 ("Westy's War")
- `fitl-scenario-medium` — Medium: 1968–1972 ("A Better War")

The existing empty `fitl-scenario-production` asset will be removed.

## Scope

### In Scope

- **Full scenario ("Nam")**: 1964–1972, 6 piles of 12 Events + 1 Coup each
- **Short scenario ("Westy's War")**: 1965–1967, 3 piles of 8 Events + 1 Coup
- **Medium scenario ("A Better War")**: 1968–1972, 3 piles of 12 Events + 1 Coup
- Per-space initial piece placements with piece types, counts, and statuses (tunneled bases)
- Starting track values: Aid, Patronage, Resources (per faction), Trail
- Starting support/opposition markers per space
- Out-of-play pieces (per faction/type)
- Deck composition per scenario (pile structure; card IDs deferred to Spec 29)
- Starting RVN Leader and leader stack
- Starting capabilities (for Short and Medium scenarios)
- Starting eligibility (all factions eligible)
- US Policy per scenario (JFK, LBJ, or Nixon — needed for Non-Player AI in Spec 30)

### Out of Scope

- Deck shuffling logic (turn flow handles this)
- Scenario selection UI
- Scenario-specific special rules beyond initial setup
- Victory marker starting values — derived from piece placements + markers + track values per FITL rule 1.9; validated via golden assertions in tests, **not** stored in the scenario payload
- `totalEcon` — derived from COIN-controlled LoCs with econ values; validated via golden assertions, **not** stored

## Space ID Mapping

Brainstorming abbreviations map to GameSpecDoc IDs as documented in `data/games/fire-in-the-lake.md` (comments at lines 10–18 and 84–117). Key mappings used in scenario setups:

| Brainstorming Name | GameSpecDoc ID |
|--------------------|----------------|
| Saigon | `saigon:none` |
| Hue | `hue:none` |
| Da Nang | `da-nang:none` |
| Kontum | `kontum:none` |
| Qui Nhon | `qui-nhon:none` |
| Cam Ranh | `cam-ranh:none` |
| An Loc | `an-loc:none` |
| Can Tho | `can-tho:none` |
| Quang Tri | `quang-tri-thua-thien:none` |
| Quang Nam | `quang-nam:none` |
| Quang Tin | `quang-tin-quang-ngai:none` |
| Binh Dinh | `binh-dinh:none` |
| Pleiku | `pleiku-darlac:none` |
| Phu Bon | `phu-bon-phu-yen:none` |
| Khanh Hoa | `khanh-hoa:none` |
| Phuoc Long | `phuoc-long:none` |
| Quang Duc | `quang-duc-long-khanh:none` |
| Binh Tuy | `binh-tuy-binh-thuan:none` |
| Tay Ninh | `tay-ninh:none` |
| Kien Phong | `kien-phong:none` |
| Kien Hoa | `kien-hoa-vinh-binh:none` |
| Ba Xuyen | `ba-xuyen:none` |
| Kien Giang | `kien-giang-an-xuyen:none` |
| North Vietnam | `north-vietnam:none` |
| Central Laos | `central-laos:none` |
| Southern Laos | `southern-laos:none` |
| NE Cambodia | `northeast-cambodia:none` |
| The Fishhook | `the-fishhook:none` |
| The Parrot's Beak | `the-parrots-beak:none` |
| Sihanoukville | `sihanoukville:none` |

## Default Piece Status

Per FITL rule 1.4.3, Guerrillas and Special Forces (Irregulars, Rangers) default to `{ activity: 'underground' }` when placed. This is the implicit status and does **not** need to be specified in `initialPlacements`.

Only non-default statuses require explicit `status` entries:
- Tunneled bases: `{ tunnel: 'tunneled' }` (per rule 1.4.4)
- Active guerrillas/SF (if scenario specifies them as active)

Troops, Police, and untunneled Bases have no status dimensions or default to no status.

## Key Types & Interfaces

### Current Scenario Payload (to extend)

The current scenario payload in `src/cnl/validate-spec.ts` only validates:
```typescript
{
  mapAssetId: string;
  pieceCatalogAssetId: string;
}
```

### Extended Scenario Payload (new fields)

```typescript
interface ScenarioPayload {
  readonly mapAssetId: string;
  readonly pieceCatalogAssetId: string;
  readonly eventCardSetAssetId?: string;
  readonly scenarioName: string;         // "Full", "Short", "Medium"
  readonly yearRange: string;            // "1964-1972", "1965-1967", "1968-1972"

  // Initial piece placements: space -> array of piece placements
  readonly initialPlacements?: readonly ScenarioPiecePlacement[];

  // Initial track values (override NumericTrackDef.initial)
  readonly initialTrackValues?: readonly { readonly trackId: string; readonly value: number }[];

  // Initial support/opposition markers per space
  readonly initialMarkers?: readonly { readonly spaceId: string; readonly markerId: string; readonly state: string }[];

  // Out-of-play pieces per faction
  readonly outOfPlay?: readonly { readonly pieceTypeId: string; readonly faction: string; readonly count: number }[];

  // Deck composition (card IDs deferred to Spec 29)
  readonly deckComposition?: ScenarioDeckComposition;

  // Starting RVN Leader
  readonly startingLeader?: string;

  // Leader stack (cards beneath current leader, top to bottom)
  readonly leaderStack?: readonly string[];

  // Starting capabilities
  readonly startingCapabilities?: readonly { readonly capabilityId: string; readonly side: 'unshaded' | 'shaded' }[];

  // Starting eligibility (defaults to all eligible if omitted)
  readonly startingEligibility?: readonly { readonly faction: string; readonly eligible: boolean }[];

  // US Policy for Non-Player AI (Spec 30)
  readonly usPolicy?: 'jfk' | 'lbj' | 'nixon';
}

interface ScenarioPiecePlacement {
  readonly spaceId: string;
  readonly pieceTypeId: string;
  readonly faction: string;
  readonly count: number;
  readonly status?: Record<string, string>;  // e.g. { tunnel: 'tunneled' } — only for non-default statuses
}

interface ScenarioDeckComposition {
  readonly pileCount: number;
  readonly eventsPerPile: number;
  readonly coupsPerPile: number;
  readonly includedCardIds?: readonly string[];   // deferred to Spec 29
  readonly excludedCardIds?: readonly string[];   // deferred to Spec 29
}
```

**Moved from previous draft**: `leaderStack` was previously inside `ScenarioDeckComposition`. It is now top-level on `ScenarioPayload` alongside `startingLeader`, since the leader stack is game state, not deck structure.

**Removed from previous draft**:
- `startingVictoryMarkers` — Victory markers are derived values (see [Golden Validation Assertions](#golden-validation-assertions)). Not stored in payload.
- `totalEcon` — Derived from COIN-controlled LoCs with econ values. Not stored in payload.

## YAML Encoding Example

Each scenario is encoded as a separate data asset in `data/games/fire-in-the-lake.md`. Here is a truncated example showing the structure:

```yaml
  - id: fitl-scenario-full
    kind: scenario
    payload:
      mapAssetId: fitl-map-production
      pieceCatalogAssetId: fitl-piece-catalog-production
      scenarioName: "Full"
      yearRange: "1964-1972"
      usPolicy: jfk
      startingLeader: duong-van-minh
      leaderStack: []
      deckComposition:
        pileCount: 6
        eventsPerPile: 12
        coupsPerPile: 1
        # includedCardIds/excludedCardIds deferred to Spec 29
      initialTrackValues:
        - trackId: aid
          value: 15
        - trackId: patronage
          value: 15
        - trackId: trail
          value: 1
        - trackId: vc-resources
          value: 5
        - trackId: nva-resources
          value: 10
        - trackId: arvn-resources
          value: 30
      outOfPlay:
        - pieceTypeId: us-bases
          faction: us
          count: 2
        - pieceTypeId: us-troops
          faction: us
          count: 10
        - pieceTypeId: arvn-bases
          faction: arvn
          count: 2
        - pieceTypeId: arvn-troops
          faction: arvn
          count: 10
        - pieceTypeId: arvn-rangers
          faction: arvn
          count: 3
      initialMarkers:
        - spaceId: saigon:none
          markerId: alignment
          state: passive-support
        # ... more markers per space
      initialPlacements:
        - spaceId: saigon:none
          pieceTypeId: us-bases
          faction: us
          count: 1
        - spaceId: saigon:none
          pieceTypeId: us-troops
          faction: us
          count: 2
        - spaceId: tay-ninh:none
          pieceTypeId: vc-bases
          faction: vc
          count: 1
          status:
            tunnel: tunneled
        # ... more placements
      startingEligibility:
        - faction: us
          eligible: true
        - faction: arvn
          eligible: true
        - faction: nva
          eligible: true
        - faction: vc
          eligible: true
```

**Note**: Guerrillas and SF default to `{ activity: 'underground' }` per rule 1.4.3 and do **not** need explicit status entries. Only tunneled bases need `status: { tunnel: tunneled }`.

## Implementation Tasks

### Task 24.1: Extend Scenario Payload Type

Modify `src/kernel/types.ts` to add the extended scenario payload fields including `scenarioName`, `yearRange`, `usPolicy`, `leaderStack` (top-level), and all other fields. Note that `leaderStack` belongs on `ScenarioPayload`, not inside `ScenarioDeckComposition`.

### Task 24.2: Extend Scenario Validation

Modify `src/cnl/validate-spec.ts` to validate the new scenario payload fields:
- `initialPlacements`: each references valid space IDs and piece types from referenced map/catalog assets
- `initialTrackValues`: each references valid track IDs, values within bounds
- `initialMarkers`: each references valid space IDs and marker lattice states
- `outOfPlay`: each references valid piece types and factions, count > 0
- `deckComposition`: pile structure internally consistent
- `usPolicy`: one of `'jfk' | 'lbj' | 'nixon'`
- `leaderStack`: references valid leader IDs

### Task 24.3: Extend Scenario Schema

Modify `src/kernel/schemas.ts` to add Zod schemas for the new scenario payload fields, including `usPolicy`, `leaderStack`, `scenarioName`, and `yearRange`.

### Task 24.4: Encode Full Scenario ("Nam")

Add `fitl-scenario-full` data asset to `data/games/fire-in-the-lake.md` with complete data from brainstorming Section 11 "Full: 1964–1972":

- scenarioName: "Full", yearRange: "1964-1972"
- Aid: 15, Patronage: 15, Trail: 1
- Resources: VC 5, NVA 10, ARVN 30
- RVN Leader: Duong Van Minh, leaderStack: [] (no leaders beneath)
- US Policy: JFK
- Out of Play: US—2 Bases, 10 Troops; ARVN—2 Bases, 10 Troops, 3 Rangers
- All space placements from Section 11 Full scenario (see conservation table below)
- Deck: 6 piles x (12 Events + 1 Coup); card IDs deferred to Spec 29

### Task 24.5: Encode Short Scenario ("Westy's War")

Add `fitl-scenario-short` data asset to `data/games/fire-in-the-lake.md` with data from Section 11 Short scenario:

- scenarioName: "Short", yearRange: "1965-1967"
- Aid: 15, Patronage: 18, Trail: 2
- Resources: VC 10, NVA 15, ARVN 30
- RVN Leader: Young Turks, leaderStack: [khanh]
- US Policy: LBJ
- Out of Play: US—6 Troops; ARVN—10 Troops, 3 Rangers
- Starting capabilities (if period events): Shaded AAA
- All space placements from Section 11 Short scenario (see conservation table below)
- Deck: 3 piles x (8 Events + 1 Coup); remove 1 Failed Coup and all Pivotal Events; card IDs deferred to Spec 29

### Task 24.6: Encode Medium Scenario ("A Better War")

Add `fitl-scenario-medium` data asset to `data/games/fire-in-the-lake.md` with data from Section 11 Medium scenario:

- scenarioName: "Medium", yearRange: "1968-1972"
- Aid: 30, Patronage: 15, Trail: 3
- Resources: VC 15, NVA 20, ARVN 30
- RVN Leader: Ky, leaderStack: [khanh, young-turks]
- US Policy: LBJ
- Out of Play: US—5 Troops; ARVN—10 Troops, 3 Rangers
- Starting capabilities: Shaded—AAA, Main Force Bns, SA-2s, Search and Destroy; Unshaded—Arc Light, M-48 Patton
- All space placements from Section 11 Medium scenario (see conservation table below)
- Deck: 3 piles x (12 Events + 1 Coup); distribute Pivotal Events; card IDs deferred to Spec 29

### Task 24.7: Remove Empty `fitl-scenario-production` Asset

Remove the placeholder `fitl-scenario-production` data asset from `data/games/fire-in-the-lake.md`. It is replaced by the three named scenario assets above.

### Task 24.8: Add Piece Conservation Tables

See [Piece Conservation Tables](#piece-conservation-tables) section below. These tables will be used as the basis for conservation validation tests.

### Task 24.9: Add Golden Validation Assertions

See [Golden Validation Assertions](#golden-validation-assertions) section below. These values will be asserted in integration tests.

## Piece Conservation Tables

For each scenario, `placed + out-of-play + available = total` per piece type. "Available" = total inventory minus placed minus out-of-play. Placed counts are derived from the brainstorming Section 11 space-by-space setup lists.

### Inventory Totals (from piece catalog)

| Piece Type | Faction | Total |
|-----------|---------|-------|
| us-troops | us | 40 |
| us-bases | us | 6 |
| us-irregulars | us | 6 |
| arvn-troops | arvn | 30 |
| arvn-police | arvn | 30 |
| arvn-rangers | arvn | 6 |
| arvn-bases | arvn | 3 |
| nva-troops | nva | 40 |
| nva-guerrillas | nva | 20 |
| nva-bases | nva | 9 |
| vc-guerrillas | vc | 30 |
| vc-bases | vc | 9 |

### Full Scenario Conservation

| Piece Type | Placed | Out-of-Play | Available | Total |
|-----------|--------|-------------|-----------|-------|
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

<details>
<summary>Full scenario placed piece breakdown</summary>

**US Troops (9)**: Saigon 2, Da Nang 2, Kontum 2, Quang Tri 1, Binh Dinh 1, Pleiku 1
**US Bases (2)**: Saigon 1, Pleiku 1
**US Irregulars (3)**: Quang Tri 1, Binh Dinh 1, Pleiku 1
**ARVN Troops (12)**: Saigon 2, Hue 2, Qui Nhon 2, Cam Ranh 2, An Loc 2, Can Tho 2
**ARVN Police (20)**: Saigon 3, Hue 2, Qui Nhon 2, Cam Ranh 2, An Loc 2, Can Tho 2, Da Nang 1, Kontum 1, Quang Nam 1, Phu Bon 1, Khanh Hoa 1, Kien Hoa 1, Ba Xuyen 1
**ARVN Rangers (1)**: Quang Nam 1
**NVA Guerrillas (12)**: North Vietnam 3, Central Laos 3, Southern Laos 3, The Parrot's Beak 3
**NVA Bases (4)**: North Vietnam 1, Central Laos 1, Southern Laos 1, The Parrot's Beak 1
**VC Guerrillas (16)**: Quang Tri 2, Binh Dinh 2, Pleiku 2, Quang Tin 2, Quang Duc 2, Binh Tuy 2, Tay Ninh 2, Kien Phong 1, Kien Giang 1
**VC Bases (7)**: Quang Tri 1, Binh Dinh 1, Pleiku 1, Quang Tin 1, Quang Duc 1, Binh Tuy 1, Tay Ninh 1 (tunneled)
</details>

### Short Scenario Conservation

| Piece Type | Placed | Out-of-Play | Available | Total |
|-----------|--------|-------------|-----------|-------|
| us-troops | 22 | 6 | 12 | 40 |
| us-bases | 4 | 0 | 2 | 6 |
| us-irregulars | 3 | 0 | 3 | 6 |
| arvn-troops | 12 | 10 | 8 | 30 |
| arvn-police | 19 | 0 | 11 | 30 |
| arvn-rangers | 3 | 3 | 0 | 6 |
| arvn-bases | 1 | 0 | 2 | 3 |
| nva-troops | 12 | 0 | 28 | 40 |
| nva-guerrillas | 14 | 0 | 6 | 20 |
| nva-bases | 8 | 0 | 1 | 9 |
| vc-guerrillas | 14 | 0 | 16 | 30 |
| vc-bases | 5 | 0 | 4 | 9 |

<details>
<summary>Short scenario placed piece breakdown</summary>

**US Troops (22)**: Da Nang 3, Kontum 3, Saigon 3, Can Tho 3, Quang Tin 2, Binh Dinh 4, Pleiku 1, Khanh Hoa 1, Binh Tuy 2
**US Bases (4)**: Saigon 1, Can Tho 1, Binh Dinh 1, Pleiku 1
**US Irregulars (3)**: Binh Dinh 1, Pleiku 1, Khanh Hoa 1
**ARVN Troops (12)**: Saigon 4, Can Tho 4, Quang Tri 2, Binh Dinh 2
**ARVN Police (19)**: Saigon 2, Can Tho 2, Da Nang 1, Kontum 1, Quang Nam 1, Quang Tin 1, Binh Dinh 1, Hue 2, Kien Hoa 2, Ba Xuyen 2, An Loc 1, Qui Nhon 1, Cam Ranh 1, Binh Tuy 1
**ARVN Rangers (3)**: Saigon 1, Can Tho 1, Quang Nam 1
**ARVN Bases (1)**: Quang Tri 1
**NVA Troops (12)**: North Vietnam 6, Southern Laos 6
**NVA Guerrillas (14)**: Quang Tri 4, Quang Duc 1, Tay Ninh 1, North Vietnam 1, Southern Laos 1, Central Laos 2, The Fishhook 2, The Parrot's Beak 2
**NVA Bases (8)**: Quang Tri 1, North Vietnam 2, Southern Laos 2, Central Laos 1, The Fishhook 1, The Parrot's Beak 1
**VC Guerrillas (14)**: Binh Dinh 2, Pleiku 2, Binh Tuy 2, Quang Duc 2, Tay Ninh 2, Kien Phong 2, Kien Giang 2
**VC Bases (5)**: Binh Dinh 1, Pleiku 1, Binh Tuy 1, Quang Duc 1, Tay Ninh 1 (tunneled)
</details>

### Medium Scenario Conservation

| Piece Type | Placed | Out-of-Play | Available | Total |
|-----------|--------|-------------|-----------|-------|
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

<details>
<summary>Medium scenario placed piece breakdown</summary>

**US Troops (30)**: Quang Tri 4, Hue 1, Da Nang 1, Qui Nhon 1, Cam Ranh 1, Quang Tin 2, Kontum 1, Binh Dinh 2, Pleiku 2, Khanh Hoa 2, Phu Bon 3, Binh Tuy 2, Saigon 2, Tay Ninh 3, Can Tho 3
**US Bases (6)**: Quang Tri 1, Quang Tin 1, Kontum 1, Binh Tuy 1, Saigon 1, Tay Ninh 1
**US Irregulars (6)**: Quang Tri 1, Kontum 1, Binh Dinh 1, Pleiku 1, Khanh Hoa 1, Can Tho 1
**ARVN Troops (20)**: Quang Tri 3, Quang Tin 2, Phu Bon 2, Binh Tuy 3, Saigon 1, Quang Duc 2, Tay Ninh 2, An Loc 1, Can Tho 2, Kien Giang 2
**ARVN Police (26)**: Quang Tin 1, Hue 2, Da Nang 2, Qui Nhon 2, Cam Ranh 2, Binh Dinh 1, Pleiku 1, Khanh Hoa 1, Phu Bon 2, Binh Tuy 1, Saigon 4, Quang Duc 1, An Loc 2, Can Tho 1, Kien Phong 1, Kien Hoa 1, Ba Xuyen 1
**ARVN Rangers (3)**: Saigon 1, Tay Ninh 1, Kien Giang 1
**ARVN Bases (1)**: Kien Giang 1
**NVA Troops (18)**: North Vietnam 9, Central Laos 9
**NVA Guerrillas (18)**: North Vietnam 1, Central Laos 1, Quang Tri 3, Tay Ninh 2, Phuoc Long 1, Southern Laos 2, NE Cambodia 2, The Fishhook 2, The Parrot's Beak 2, Sihanoukville 2
**NVA Bases (8)**: North Vietnam 1, Central Laos 1, Quang Tri 1, Southern Laos 1, NE Cambodia 1, The Fishhook 1, The Parrot's Beak 1, Sihanoukville 1
**VC Guerrillas (23)**: Quang Nam 2, Binh Dinh 2, Pleiku 2, Khanh Hoa 2, Phu Bon 2, Binh Tuy 2, Saigon 1, Phuoc Long 2, Tay Ninh 3, Quang Duc 1, Kien Phong 1, Kien Hoa 1, Ba Xuyen 1, Kien Giang 1
**VC Bases (8)**: Quang Nam 1, Binh Dinh 1, Pleiku 1, Khanh Hoa 1, Binh Tuy 1, Saigon 1, Phuoc Long 1, Tay Ninh 1 (tunneled)
</details>

## Golden Validation Assertions

Victory marker starting values per FITL rule 1.9. These are **derived** from piece placements + markers + track values and must be **computed in tests**, not stored in the scenario payload.

### Victory Marker Formulas (rule 1.9)

| Marker | Formula |
|--------|---------|
| US | Total Support + Available US Troops + Available US Bases |
| ARVN | Total COIN-Controlled Population + Patronage |
| VC | Total Opposition + VC Bases on map |
| NVA | Total NVA-Controlled Population + NVA Bases on map |

**Alignment weighting**: "Total Support" counts Active Support as Pop×2 and Passive Support as Pop×1. "Total Opposition" counts Active Opposition as Pop×2 and Passive Opposition as Pop×1. This follows the FITL alignment lattice: Active Support (+2) > Passive Support (+1) > Neutral (0) > Passive Opposition (−1) > Active Opposition (−2).

### Full Scenario Golden Values

| Marker | Value | Derivation |
|--------|-------|-----------|
| US (Support+Available) | **38** | Support 15 (all Passive) + 21 Troops + 2 Bases |
| ARVN (COIN+Patronage) | **35** | COIN Pop 20 + Patronage 15 |
| VC (Opposition+Bases) | **27** | Opposition 20 (all Active, 6 spaces) + 7 Bases |
| NVA (NVA+Bases) | **4** | NVA Pop 0 + 4 Bases |

### Short Scenario Golden Values

| Marker | Value | Derivation |
|--------|-------|-----------|
| US (Support+Available) | **38** | Support 24 (Active 18 + Passive 6) + 12 Troops + 2 Bases |
| ARVN (COIN+Patronage) | **41** | COIN Pop 23 + Patronage 18 |
| VC (Opposition+Bases) | **23** | Opposition 18 (all Active, 5 spaces) + 5 Bases |
| NVA (NVA+Bases) | **10** | NVA Pop 2 (Quang Tri) + 8 Bases |

### Medium Scenario Golden Values

| Marker | Value | Derivation |
|--------|-------|-----------|
| US (Support+Available) | **37** | Support 32 (Active 20 + Passive 12) + 5 Troops + 0 Bases |
| ARVN (COIN+Patronage) | **44** | COIN Pop 29 + Patronage 15 |
| VC (Opposition+Bases) | **23** | Opposition 15 (Active 10 + Passive 5) + 8 Bases |
| NVA (NVA+Bases) | **8** | NVA Pop 0 + 8 Bases |

## Testing Requirements

### Unit Tests
- **Piece conservation**: For each scenario: placed + available + out-of-play = total per piece type (using the conservation tables above)
- **Track bounds**: All initial track values within [min, max] of their track definition
- **Marker constraints**: Initial markers respect lattice constraints (no Support on LoCs or Pop 0 spaces)
- **Space references**: All `initialPlacements[].spaceId` reference valid map spaces
- **Piece type references**: All placements reference valid piece types from the catalog
- **US Policy validation**: Each scenario has a valid `usPolicy` value

### Integration Tests
- Each scenario data asset compiles without errors
- Scenario validation catches invalid space IDs, out-of-bounds tracks, invalid marker states
- Existing FITL integration tests still pass (foundation fixture unchanged)

### Golden Validation Tests (NEW)
- For each scenario, compute victory marker values from piece placements + markers + track values using the formulas above
- Assert computed values match the golden targets from the brainstorming (tables above)
- Compute `totalEcon` (sum of econ values of COIN-controlled LoCs) and assert it matches brainstorming value (15 for all scenarios)
- Verify control annotations per space match derived piece-count comparisons (COIN forces > Insurgent forces = COIN Control; NVA forces > all others = NVA Control)

### Piece Conservation Tests (NEW)
- For each scenario, sum placed + out-of-play per piece type, verify = total inventory minus available
- Cross-check placed counts against the per-space breakdown in the conservation tables
- Verify no piece type has negative available count

## Acceptance Criteria

1. All 3 scenarios encoded as separate data assets in `data/games/fire-in-the-lake.md`
2. Empty `fitl-scenario-production` asset removed
3. Piece inventory sums correctly for each scenario: placed + available + out-of-play = total
4. Track values within bounds
5. Marker states respect lattice constraints
6. Victory marker golden values match brainstorming targets
7. Scenario payload includes `usPolicy`, `leaderStack` (top-level), `scenarioName`, `yearRange`
8. Scenario payload validation catches common errors (bad space IDs, excess pieces, etc.)
9. Build passes (`npm run build`)
10. All existing tests pass (`npm test`)
