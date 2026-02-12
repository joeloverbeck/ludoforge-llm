# Spec 24: FITL Scenario Setups

**Status**: Draft
**Priority**: P0
**Complexity**: M
**Dependencies**: Spec 23 (full map and pieces must exist)
**Estimated effort**: 2–3 days
**Source sections**: Brainstorming Sections 4.1, 11 (Scenarios)

## Overview

Encode all 3 FITL scenario setups as scenario data assets. Currently, the scenario payload only contains `mapAssetId` and `pieceCatalogAssetId` (see `src/cnl/validate-spec.ts:127–173`). This spec extends the scenario payload to include initial piece placements, starting track values, deck composition, starting RVN Leader, starting capabilities, starting eligibility, and out-of-play pieces.

## Scope

### In Scope

- **Full scenario ("Nam")**: 1964–1972, 6 piles of 12 Events + 1 Coup each
- **Short scenario ("Westy's War")**: 1965–1967, 3 piles of 8 Events + 1 Coup
- **Medium scenario ("A Better War")**: 1968–1972, 3 piles of 12 Events + 1 Coup
- Per-space initial piece placements with piece types, counts, and statuses (tunneled bases)
- Starting track values: Aid, Patronage, Resources (per faction), Trail
- Starting support/opposition markers per space
- Out-of-play pieces (per faction/type)
- Deck composition per scenario (which cards, pile structure)
- Starting RVN Leader (Minh for Full, Young Turks for Short, Ky for Medium)
- Starting capabilities (for Short and Medium scenarios)
- Starting eligibility (all factions eligible)
- Victory marker starting values (derived from setup, but explicitly declared for validation)

### Out of Scope

- Deck shuffling logic (turn flow handles this)
- Scenario selection UI
- Scenario-specific special rules beyond initial setup

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

  // Initial piece placements: space -> array of piece placements
  readonly initialPlacements?: readonly ScenarioPiecePlacement[];

  // Initial track values (override NumericTrackDef.initial)
  readonly initialTrackValues?: readonly { readonly trackId: string; readonly value: number }[];

  // Initial support/opposition markers per space
  readonly initialMarkers?: readonly { readonly spaceId: string; readonly markerId: string; readonly state: string }[];

  // Out-of-play pieces per faction
  readonly outOfPlay?: readonly { readonly pieceTypeId: string; readonly faction: string; readonly count: number }[];

  // Deck composition
  readonly deckComposition?: ScenarioDeckComposition;

  // Starting RVN Leader
  readonly startingLeader?: string;

  // Starting capabilities
  readonly startingCapabilities?: readonly { readonly capabilityId: string; readonly side: 'unshaded' | 'shaded' }[];

  // Starting eligibility (defaults to all eligible if omitted)
  readonly startingEligibility?: readonly { readonly faction: string; readonly eligible: boolean }[];
}

interface ScenarioPiecePlacement {
  readonly spaceId: string;
  readonly pieceTypeId: string;
  readonly faction: string;
  readonly count: number;
  readonly status?: Record<string, string>;  // e.g. { tunnel: 'tunneled' }
}

interface ScenarioDeckComposition {
  readonly pileCount: number;
  readonly eventsPerPile: number;
  readonly coupsPerPile: number;
  readonly includedCardIds?: readonly string[];
  readonly excludedCardIds?: readonly string[];
  readonly leaderStack?: readonly string[];  // leader cards beneath current leader
}
```

## Implementation Tasks

### Task 24.1: Extend Scenario Payload Type

Modify `src/kernel/types.ts` to add the extended scenario payload fields (or create a dedicated `ScenarioPayload` type if one doesn't exist yet).

### Task 24.2: Extend Scenario Validation

Modify `src/cnl/validate-spec.ts` to validate the new scenario payload fields:
- `initialPlacements`: each references valid space IDs and piece types
- `initialTrackValues`: each references valid track IDs, values within bounds
- `initialMarkers`: each references valid space IDs and marker lattice states
- `outOfPlay`: each references valid piece types and factions, count > 0
- `deckComposition`: pile structure matches card count constraints

### Task 24.3: Extend Scenario Schema

Modify `src/kernel/schemas.ts` to add Zod schemas for the new scenario payload fields.

### Task 24.4: Encode Full Scenario ("Nam")

Create `test/fixtures/cnl/compiler/fitl-scenario-full.md` with complete data from brainstorming Section 11 "Full: 1964–1972":

- Aid: 15, Patronage: 15, Trail: 1
- Resources: VC 5, NVA 10, ARVN 30
- RVN Leader: Duong Van Minh
- Out of Play: US—2 Bases, 10 Troops; ARVN—2 Bases, 10 Troops, 3 Rangers
- All space placements from Section 11 Full scenario
- Deck: 6 piles x (12 Events + 1 Coup), 4 Pivotal Events distributed

### Task 24.5: Encode Short Scenario ("Westy's War")

Create `test/fixtures/cnl/compiler/fitl-scenario-short.md` with data from Section 11 Short scenario:

- Aid: 15, Patronage: 18, Trail: 2
- Resources: VC 10, NVA 15, ARVN 30
- RVN Leader: Young Turks (Khanh beneath)
- Out of Play: US—6 Troops; ARVN—10 Troops, 3 Rangers
- Starting capabilities (if period events): Shaded AAA
- All space placements from Section 11 Short scenario

### Task 24.6: Encode Medium Scenario ("A Better War")

Create `test/fixtures/cnl/compiler/fitl-scenario-medium.md` with data from Section 11 Medium scenario:

- Aid: 30, Patronage: 15, Trail: 3
- Resources: VC 15, NVA 20, ARVN 30
- RVN Leader: Ky (Khanh and Young Turks beneath)
- Out of Play: US—5 Troops; ARVN—10 Troops, 3 Rangers
- Starting capabilities: Shaded—AAA, Main Force Bns, SA-2s, Search and Destroy; Unshaded—Arc Light, M-48 Patton
- All space placements from Section 11 Medium scenario

## Testing Requirements

### Unit Tests
- **Piece conservation**: For each scenario: placed + available + out-of-play = total per piece type
- **Track bounds**: All initial track values within [min, max] of their track definition
- **Marker constraints**: Initial markers respect lattice constraints (no Support on LoCs or Pop 0)
- **Space references**: All `initialPlacements[].spaceId` reference valid map spaces
- **Piece type references**: All placements reference valid piece types from the catalog

### Integration Tests
- Each scenario fixture compiles without errors
- Scenario validation catches invalid space IDs, out-of-bounds tracks, invalid marker states
- Existing FITL integration tests still pass (foundation fixture unchanged)

## Acceptance Criteria

1. All 3 scenarios encoded with complete initial state
2. Piece inventory sums correctly for each scenario: placed + available + out-of-play = total
3. Track values within bounds
4. Marker states respect lattice constraints
5. Scenario payload validation catches common errors (bad space IDs, excess pieces, etc.)
6. Build passes (`npm run build`)
7. All existing tests pass (`npm test`)
