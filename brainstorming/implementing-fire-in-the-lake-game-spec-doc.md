# Implementing Fire in the Lake GameSpecDoc

We're very early in app development, and we want to implement the first GameSpecDoc for production: that for the COIN game Fire in the Lake. This is an extremely-complex game, which means that if we manage to codify it and make it run and we implement one or more e2e tests that prove the manual's example few turns are processed by our simulation as expected, then we'll be able to implement a wide range of games in the future.

Note: our app's pipeline is GameSpecDoc -> GameDef -> simulation . All game-specific data goes into the GameSpecDoc, while GameDef and the code are game-agnostic.

We have done a previous pass of analyzing the game's rules to figure out what foundation logic we needed to add to the GameSpecDoc, GameDef and simulations. Search for test/*fitl* to see the available fixtures and tests.

We're very early in development. If throughout trying to implement anything related to this brainstorming document you realize that what you need to implement fits awkwardly into the current architecture, don't "hack it" or "patch it in": propose clean, robust architectural changes that stand the test of time. No backwards compatibility, no legacy paths. The breaking changes will need to be fixed.

**Document structure**: This document is organized as an implementation roadmap. Sections 2-6 lead with what's done, identify what's missing, map FITL concepts to kernel primitives, and provide a phased plan. Sections 7-9 provide encoding patterns and card tracking. Section 10 lists open questions. Sections 11-12 contain reference data (map, tutorial, card definitions). Section 13 is a collapsed appendix of the verbatim FITL rules for lookup.

---

## 2. Current Implementation State

The FITL foundation work is substantial. Below is a catalog of what already exists.

### 2.1 Kernel Type Extensions (`src/kernel/types.ts`, 884 lines)

The type system has been extended with FITL-specific structures:

| Type | Purpose |
|------|---------|
| `TurnFlowDef` | Card-driven turn flow: card lifecycle, eligibility, option matrix, pass rewards, monsoon, pivotal events |
| `TurnFlowEligibilityDef` | Faction eligibility tracking with override windows |
| `TurnFlowOptionMatrixRowDef` | 1st/2nd eligible action class options |
| `TurnFlowPassRewardDef` | Pass rewards per faction class (COIN +3 ARVN, Insurgent +1) |
| `TurnFlowMonsoonDef` | Monsoon restrictions on actions |
| `TurnFlowPivotalDef` | Pivotal event pre-action window, interrupt resolution, cancellation chains |
| `TurnFlowRuntimeState` | Runtime: faction order, eligibility map, current card state, pending overrides |
| `OperationProfileDef` | Operation legality, cost, targeting, resolution, partial execution, linked SA windows |
| `CoupPlanDef` | Coup round phases, final round omissions, max consecutive rounds |
| `VictoryDef` | Victory checkpoints, margins, ranking |
| `VictoryTerminalMetadata` | Winner faction, ranking entries with margin and tie-break |
| `EventCardDef` | Dual-use events with branches, targets, lasting effects |
| `EventCardLastingEffectDef` | Duration-bound effects (card/nextCard/coup/campaign) |
| `DataAssetEnvelope` | Inline data assets for map, scenario, piece catalog, event card sets |
| `MapPayload` | Spaces, provisional adjacency, numeric tracks, marker lattices, space markers |
| `MapSpaceDef` | Space with type, population, econ, terrain tags, country, coastal, adjacency |
| `NumericTrackDef` | Global or faction-scoped numeric track (Resources, Aid, Patronage, Trail) |
| `SpaceMarkerLatticeDef` | Multi-state markers (Support/Opposition lattice) with constraints |
| `PieceCatalogPayload` | Piece types with status dimensions (activity, tunnel) and inventory |
| `PieceInventoryEntry` | Per-faction piece counts |

### 2.2 Integration Tests (18 files in `test/integration/fitl-*.test.ts`)

| Test File | What It Covers |
|-----------|---------------|
| `fitl-card-lifecycle.test.ts` | Card draw, lookahead reveal, played pile, coup-to-leader |
| `fitl-card-flow-determinism.test.ts` | Same seed + same actions = identical card flow |
| `fitl-eligibility-pass-chain.test.ts` | Eligibility cycling, pass rewards, faction cycling |
| `fitl-eligibility-window.test.ts` | Eligibility override windows (keep-eligible, force-ineligible) |
| `fitl-option-matrix.test.ts` | 1st/2nd eligible action class options per option matrix |
| `fitl-monsoon-pivotal-windows.test.ts` | Monsoon restrictions, pivotal event blocking |
| `fitl-coin-operations.test.ts` | Train, Patrol, Sweep, Assault operation profiles |
| `fitl-insurgent-operations.test.ts` | Rally, March, Attack, Terror operation profiles |
| `fitl-us-arvn-special-activities.test.ts` | Advise, Air Lift, Air Strike, Govern, Transport, Raid |
| `fitl-nva-vc-special-activities.test.ts` | Infiltrate, Bombard, Ambush, Tax, Subvert |
| `fitl-coup-resources-phase.test.ts` | Sabotage, degrade trail, ARVN/insurgent earnings, casualties/aid |
| `fitl-coup-support-phase.test.ts` | Pacification, agitation during coup round |
| `fitl-coup-victory.test.ts` | Victory checkpoints, margins, ranking, final coup |
| `fitl-coup-redeploy-commit-reset.test.ts` | Redeploy, commitment, reset phases |
| `fitl-events-test-helpers.test.ts` | Shared event test utilities |
| `fitl-events-domino-theory.test.ts` | Domino Theory event card encoding/resolution |
| `fitl-events-phoenix-program.test.ts` | Phoenix Program event card encoding/resolution |
| `fitl-turn-flow-golden.test.ts` | Golden trace: full turn flow through multiple cards |

### 2.3 Fixture Files (7 files in `test/fixtures/cnl/compiler/fitl-*.md`)

| Fixture File | Content |
|-------------|---------|
| `fitl-foundation-inline-assets.md` | Minimal 2-space map, piece catalog, scenario, turn flow |
| `fitl-operations-coin.md` | COIN operation profiles (Train, Patrol, Sweep, Assault) |
| `fitl-operations-insurgent.md` | Insurgent operation profiles (Rally, March, Attack, Terror) |
| `fitl-special-us-arvn.md` | US/ARVN special activities (Advise, Air Lift, Air Strike, Govern, Transport, Raid) |
| `fitl-special-nva-vc.md` | NVA/VC special activities (Infiltrate, Bombard, Ambush, Tax, Subvert) |
| `fitl-foundation-coup-victory-inline-assets.md` | Coup phase plan, victory conditions |
| `fitl-events-initial-card-pack.md` | Event cards: Domino Theory, Phoenix Program, Green Berets |

### 2.4 What Works Today

- Card draw/lookahead/played pile lifecycle
- Eligibility tracking with override windows
- Option matrix (1st/2nd eligible action classes)
- Pass rewards (COIN +3 ARVN Resources, Insurgent +1 own Resources)
- Monsoon restrictions (block Sweep/March, limit Air Lift/Air Strike to 2 spaces)
- Pivotal event pre-action window with interrupt resolution and cancellation chains
- Operation profiles with legality, cost, targeting, resolution, partial execution
- Special activity linking to accompanying operations
- Coup round phasing (victory, resources, support, redeploy, commit, reset)
- Victory checkpoints, margins, ranking with tie-breaks
- Dual-use event cards with branches, targets, lasting effects
- Lasting effect durations (card, nextCard, coup, campaign)
- Piece status dimensions (activity: underground/active, tunnel: tunneled/untunneled)
- Map space definitions with type, population, econ, terrain, country, coastal, adjacency
- Support/Opposition marker lattice with state constraints
- Numeric tracks (global and faction-scoped)

---

## 3. Concept Mapping: FITL to Kernel Primitives

| FITL Concept | Kernel Primitive | Notes |
|---|---|---|
| Factions (US, ARVN, NVA, VC) | `PlayerId` (0-3) | US=0, ARVN=1, NVA=2, VC=3; also encoded as `factions` in `TurnFlowEligibilityDef` |
| Spaces (Provinces, Cities, LoCs) | `MapSpaceDef` in `DataAssetEnvelope<MapPayload>` | Properties: `spaceType`, `population`, `econ`, `terrainTags`, `country`, `coastal`, `adjacentTo` |
| Terrain (Highland, Lowland, Jungle) | `terrainTags` on `MapSpaceDef` | Affects Sweep activation ratio, Assault damage ratio |
| Pieces (Troops, Police, Guerrillas, SF, Bases) | `PieceTypeCatalogEntry` + `PieceInventoryEntry` | Status dimensions for underground/active and tunneled/untunneled |
| Underground/Active | `PieceStatusDimension: 'activity'` | Values: `'underground'` / `'active'`; transitions defined per piece type |
| Tunnels | `PieceStatusDimension: 'tunnel'` | Values: `'tunneled'` / `'untunneled'`; on NVA/VC Bases only |
| Resources (NVA, VC, ARVN) | `NumericTrackDef` with `scope: 'faction'` | Min 0, max 75 |
| Aid | `NumericTrackDef` with `scope: 'global'` | Min 0, max 75; added to ARVN Resources during coup |
| Patronage | `NumericTrackDef` with `scope: 'global'` | Min 0, max 75; contributes to ARVN victory |
| The Trail | `NumericTrackDef` with `scope: 'global'` | Min 0, max 4; affects NVA Rally, March, Infiltrate, Earnings |
| Support/Opposition | `SpaceMarkerLatticeDef` | 5 states: `activeOpposition` → `passiveOpposition` → `neutral` → `passiveSupport` → `activeSupport`; constraints exclude LoCs and Pop 0 |
| Control (COIN/NVA) | Derived value | COIN: US+ARVN pieces > NVA+VC pieces; NVA: NVA pieces > all others. Computed on demand via aggregate conditions |
| Available / Out of Play / Casualties | Piece pool zones | Per-faction token containers: `available:US`, `outOfPlay:ARVN`, `casualties:US`, etc. |
| Card Deck | Zone with `ordering: 'stack'` | Deck zone + played zone + lookahead zone; managed by `TurnFlowCardLifecycleDef` |
| Eligibility | `TurnFlowEligibilityDef` + `TurnFlowRuntimeState` | Faction eligibility map with override windows for Events |
| Faction Order (per card) | `factionOrder` in `TurnFlowRuntimeState` | Read from card token properties |
| Option Matrix | `TurnFlowOptionMatrixRowDef[]` | Maps 1st eligible action class → 2nd eligible options |
| Pass | `TurnFlowPassRewardDef` | Faction class → resource + amount |
| Operations | `ActionDef` + `OperationProfileDef` | Profile adds legality/cost/targeting/resolution/partial execution |
| Special Activities | `ActionDef` | Linked via `linkedSpecialActivityWindows` on `OperationProfileDef` |
| Limited Operation | `TurnFlowActionClass: 'limitedOperation'` | 1 space, no Special Activity |
| Events | `EventCardDef` | Dual-use (`sideMode: 'dual'`), `unshaded`/`shaded` with branches, targets, lasting effects |
| Capabilities | Global boolean vars (per-faction) | Persistent operation modifiers; checked via `ConditionAST` in operation effects |
| Momentum | `EventCardLastingEffectDef` with `duration: 'coup'` | Expires at next coup round Reset phase |
| Coup Round | `CoupPlanDef` | Phases: victory → resources → support → redeploy → commitment → reset |
| Victory | `VictoryDef` | Checkpoints (per faction), margins, ranking (desc order, tie-break keys) |
| RVN Leader | `TurnFlowCardLifecycleDef.leader` zone | Coup cards move to leader zone; lingering effects |
| Monsoon | `TurnFlowMonsoonDef` | Restricted actions, block pivotal, override tokens |
| Pivotal Events | `TurnFlowPivotalDef` | Pre-action window, disallow when lookahead is coup, interrupt resolution with cancellation |
| Free Operations | Operation + flag | No resource cost, no eligibility impact; Pacification/Agitation/Trail still cost |
| Coastal spaces | `coastal: boolean` on `MapSpaceDef` | Affects specific Events (Amphibious Landing, etc.) |
| Foreign countries | `country` on `MapSpaceDef` | `'laos'`, `'cambodia'`, `'northVietnam'`; stacking/removal rules |
| LoC types (Highway/Mekong) | `terrainTags` on `MapSpaceDef` | `['highway']` or `['mekong']` or both; affects economics and movement |

---

## 4. Gap Analysis

### 4.1 Encoding Gaps

| Area | Current State | Full Scope | Gap |
|------|--------------|------------|-----|
| Operations | 8 stub profiles (4 COIN + 4 Insurgent) | 8 with full effects | Effects are placeholders; need complete resolution logic |
| Special Activities | 12 minimal stubs | 12 with full effects | Same — need targeting, resolution, piece movement logic |
| Event Cards | 3 encoded (Domino Theory, Phoenix Program, Green Berets) | 130 total | 127 remaining; organized by period (24 x 1964, 48 x 1965, 48 x 1968, 6 Coup, 4 Pivotal) |
| Map Spaces | 2 spaces in foundation fixture | ~60 spaces (8 cities + 22 provinces + 17 LoCs + 7 foreign) | Need all spaces with full adjacency, terrain, population, econ, coastal, country |
| Scenarios | None | 3 (Short, Medium, Full) | Initial piece placement, starting values, deck composition |
| Piece Inventory | Foundation catalog exists | Full piece counts per faction | Need exact counts (229 pieces total) |

### 4.2 Mechanic Gaps

These mechanics are not yet represented in the kernel or fixtures:

1. **Capabilities system (14 capabilities)**: Persistent operation modifiers that alter how operations resolve (e.g., "Arc Light" affects Air Strike, "Cobras" affects Sweep/Assault). Need: global boolean vars per faction + conditional branches in operation resolution.

2. **Momentum system (16 markers)**: Temporary effects lasting until next coup Reset (e.g., "Claymores" prohibits Ambush, "Rolling Thunder" prohibits Air Strike). Need: lasting effect tracking with coup-scoped duration.

3. **Multi-space operations**: A single operation affecting multiple spaces with per-space cost and resolution. Current profiles are stubs — need `forEach` over target spaces with spatial queries.

4. **Operation/Special Activity interleaving (rule 4.1)**: SA may occur "immediately before, during, or immediately after" its accompanying Operation. Need: interruptible operation execution with SA insertion points.

5. **Piece removal ordering ("Troops first, Bases last")**: Assault and Attack have strict piece removal ordering: NVA Troops → Active Guerrillas → Bases (only after no Guerrillas remain). Underground Guerrillas protect Bases. Need: sequential removal with ordering constraints.

6. **Dynamic piece sourcing (rule 1.4.1)**: "If desired force type is not Available, may take from elsewhere on the map." Need: conditional source — check available zone first, fallback to map with faction-specific exceptions (US Troops/Bases cannot be taken from map).

7. **Free Operations (rule 3.1.2)**: Operations/SAs granted by Events that cost no Resources and don't affect Eligibility. Pacification, Agitation, and Trail Improvement still cost Resources. Need: free-operation flag on action execution.

8. **Derived value tracking**: Total Support, Total Opposition, COIN Control per space, NVA Control per space, Total Econ, victory markers. Need: aggregate queries or cached computed values.

9. **LoC type distinction**: Highway vs Mekong affects economics (Econ values) and certain movement/operations. Currently just terrain tags — need validation that all LoCs have correct type tags.

10. **Non-Player rules (Section 8)**: Bot AI for solitaire and <4 player games. Entirely unaddressed. Priority tables, random space selection, event evaluation.

11. **Stacking limits (rule 1.4.2)**: Max 2 Bases per Province or City. No Bases on LoCs. Only NVA/VC in North Vietnam.

12. **RVN Leader lingering effects (rule 2.4.1)**: Coup cards have leader bonuses (e.g., Duong Van Minh: +5 Aid on Train). Need: active-leader effect tracking.

### 4.3 Testing Gaps

1. **E2E tutorial test**: Only Turn 1 narrative is currently documented in this brainstorming doc. Need the full 13-card tutorial walkthrough for comprehensive E2E validation.

2. **Extended tutorial (cards 2-13)**: Need to transcribe or obtain the tutorial text for Trucks through Colonel Chau to validate the full mini-campaign.

3. **Property tests**: Not yet written — need quickcheck-style tests for invariants (pieces never duplicate across zones, vars stay within bounds, legal moves always pass preconditions).

4. **Golden tests**: No Game Spec → expected JSON golden tests yet for FITL-specific compilations.

---

## 5. Architectural Decisions Required

Five critical choices for the next implementation phase, each with a recommended approach:

### 5.1 Capabilities Encoding

**Problem**: 14 capabilities persistently modify operation behavior. "Arc Light" changes Air Strike damage formula, "Cobras" changes Sweep activation ratio.

**Recommended**: Use global boolean vars per faction (e.g., `cap_arcLight_active: boolean`). Check via `ConditionAST` in operation resolution branches. Simple, fits existing AST, no new kernel primitives needed.

**Alternative**: Capability modifier objects on `OperationProfileDef`. More structured but requires new types.

### 5.2 Operation Modifiers (Capability + Momentum Effects)

**Problem**: Capabilities and Momentum markers modify operation resolution. Some prohibit actions entirely, others change numeric formulas.

**Recommended**: Conditional branches in `OperationProfileDef.resolution` effects. E.g., `if cap_cobras then activateRatio = 1:1 else activateRatio = 1:2 in Jungle`. Declarative, leverages existing `EffectAST.if`.

### 5.3 Multi-Space Operations

**Problem**: Operations select multiple spaces, pay per space, resolve per space. Current profiles don't model this.

**Recommended**: `forEach` over target space set with spatial query. Fits bounded iteration constraint. Space selection via `chooseN` with filter conditions, then `forEach` over chosen spaces for resolution.

### 5.4 Event Card Encoding Strategy

**Problem**: 130 cards is a massive encoding effort. Need a phased approach.

**Recommended**: Phase by usage priority:
1. Tutorial cards (13 cards) — immediate validation need
2. 1964 period (24 cards) — first historical period
3. 1965 period (48 cards) — medium scenario
4. 1968 period (48 cards) — full scenario
5. Coup cards (6) and Pivotal Events (4) — scenario framework

### 5.5 Non-Player Rules

**Problem**: Section 8 describes bot AI with priority tables, conditional logic, and random space selection. Needs to be playable for solitaire and <4 player simulation.

**Recommended**: Hybrid approach — declarative priority tables compiled into `Agent` interface implementations + imperative fallback for complex conditional logic. Start with RandomAgent (already in architecture), then GreedyAgent following priority tables.

---

## 6. Phased Implementation Plan

### Phase 1: Tutorial Turn 1 E2E
**Goal**: Full map encoding, Burning Bonze card, Train operation with Pacification, first e2e test proving Turn 1 plays out correctly.

**Deliverables**:
- Full map (`MapPayload`) with all ~60 spaces, adjacency, terrain, population, econ, coastal
- Full piece catalog and inventory (229 pieces)
- Full 1964 scenario initial setup
- Burning Bonze event card with complete effects
- Train operation with Pacification sub-action (full effects, not stubs)
- Govern special activity (full effects)
- E2E test: Turn 1 tutorial narrative validated against simulation output

### Phase 2: Extended Tutorial (13 cards)
**Goal**: All 13 tutorial cards encoded and playable, coup round validation.

**Deliverables**:
- Tutorial cards: Burning Bonze (#107), Trucks (#55), Green Berets (#68), Gulf of Tonkin (#1), Brinks Hotel (#97), Henry Cabot Lodge (#79), Booby Traps (#101), Coup #125 (Nguyen Khanh), Sihanouk (#75), Claymores (#17), 301st Supply Bn (#51), Economic Aid (#43), Colonel Chau (#112)
- All operations used in tutorial with full effects
- Coup round execution (Khanh coup card)
- Extended tutorial E2E test (13-card mini-campaign)
- RVN Leader lingering effects (Duong Van Minh +5 Aid)

### Phase 3: Capabilities & Momentum
**Goal**: Modifier system operational, operation profiles respond to capabilities and momentum.

**Deliverables**:
- 14 capability boolean vars with conditional operation branches
- 16 momentum markers with coup-scoped lasting effects
- Capability-modified operation resolution (e.g., Arc Light Air Strike, Cobras Sweep)
- Momentum prohibitions (e.g., Claymores blocks Ambush, Rolling Thunder blocks Air Strike)
- Integration tests for each capability and momentum effect

### Phase 4: Full 1964 Card Set (~24 cards)
**Goal**: First historical period complete, Short scenario playable.

**Deliverables**:
- All 24 period-1964 event cards encoded
- Short scenario (Westy's War) setup and deck composition
- All operations and special activities with full effects (no more stubs)
- Multi-space operation resolution
- Piece removal ordering (Troops first, Bases last)
- Dynamic piece sourcing
- Free operation support

### Phase 5: Non-Player Rules (Bot AI)
**Goal**: Section 8 implemented, enabling <4 player simulation.

**Deliverables**:
- Non-player priority tables as Agent implementations
- Random space selection via PRNG
- Event evaluation for non-player factions
- Solitaire mode support
- Bot-vs-bot simulation for evaluation pipeline

### Phase 6: Full Game (1965 + 1968 cards)
**Goal**: All 130 cards, all scenarios playable, full simulation.

**Deliverables**:
- 48 period-1965 event cards
- 48 period-1968 event cards
- 6 Coup cards with RVN Leader effects
- 4 Pivotal Event cards
- Medium scenario (A Better War) and Full scenario (Nam)
- Full game simulation with evaluation metrics

---

## 7. FITL Rules Encoding Cookbook

Concrete patterns for common encoding tasks, mapping FITL rules to kernel primitives.

### 7.1 Support/Opposition Lattice

```yaml
markerLattices:
  - id: "supportOpposition"
    states: ["activeOpposition", "passiveOpposition", "neutral", "passiveSupport", "activeSupport"]
    defaultState: "neutral"
    constraints:
      - spaceTypes: ["loc"]
        allowedStates: ["neutral"]    # LoCs always Neutral
      - populationEquals: 0
        allowedStates: ["neutral"]    # Pop 0 always Neutral
```

Shifting: Use `setVar` or a dedicated marker-shift effect. "Shift 1 level toward Active Opposition" = move one position left in the states array.

### 7.2 Control Calculation

COIN Control: aggregate count of US+ARVN pieces in space > aggregate count of NVA+VC pieces.
NVA Control: aggregate count of NVA pieces > aggregate count of all other pieces.

```
// Condition: space has COIN Control
{ op: '>',
  left: { aggregate: { op: 'count', query: { query: 'tokensInZone', zone: spaceId }, prop: 'faction in [US, ARVN]' } },
  right: { aggregate: { op: 'count', query: { query: 'tokensInZone', zone: spaceId }, prop: 'faction in [NVA, VC]' } }
}
```

### 7.3 Operation with Capability Modifier

Example: Sweep in Jungle with/without "Cobras" capability.

```
{ if: {
    when: { op: '==', left: { ref: 'gvar', var: 'cap_cobras' }, right: true },
    then: [/* activate 1 guerrilla per cube (Cobras active) */],
    else: [/* activate 1 guerrilla per 2 cubes in Jungle (default) */]
  }
}
```

### 7.4 Multi-Space Operation

Pattern: Choose spaces → forEach over chosen spaces → resolve per space.

```
{ chooseN: { bind: 'targetSpaces', options: { query: 'zones', filter: { ... } }, min: 1, max: 10 } }
{ forEach: { bind: 'space', over: { query: 'enums', values: '$targetSpaces' }, effects: [
    /* pay cost per space */
    /* resolve operation in space */
  ]
}}
```

### 7.5 Event Card with Branches (Dual Use)

```yaml
eventCards:
  - id: "107"
    title: "Burning Bonze"
    sideMode: "dual"
    unshaded:
      effects:
        - { addVar: { scope: 'global', var: 'patronage', delta: 3 } }
      branches:
        - id: "saigonActiveSupport"
          # if Saigon at Active Support, +6 instead of +3
    shaded:
      effects:
        - # shift Saigon 1 level toward Active Opposition
        - { addVar: { scope: 'global', var: 'aid', delta: -12 } }
```

### 7.6 Piece Removal with Ordering

"Troops first, Bases last" — sequential removal:

```
1. Remove NVA Troops (up to damage count)
2. Remove Active NVA Guerrillas, then Active VC Guerrillas (attacker's choice which faction first)
3. Only if no NVA or VC Guerrillas remain: remove Insurgent Bases
4. Never remove Underground Guerrillas via Assault
5. Tunneled Bases: stop, roll die (1-3 nothing, 4-6 remove tunnel marker only)
```

Encoded as sequential `forEach` effects with decreasing priority and remaining-damage tracking via `let` bindings.

### 7.7 Dynamic Piece Sourcing

"Take from Available; if not Available, take from map (with exceptions)":

```
{ if: {
    when: { op: '>', left: { aggregate: { op: 'count', query: { query: 'tokensInZone', zone: 'available:NVA' } } }, right: 0 },
    then: [/* place from available */],
    else: [/* take from map — but US Troops/Bases cannot be taken from map */]
  }
}
```

---

## 8. Event Card Catalog

Tracking table for all 130 event cards. Status key: `done` = encoded and tested, `stub` = partially encoded, `todo` = not started.

### Period 1964 (24 cards)

| # | Title | Status | Complexity | Notes |
|---|-------|--------|------------|-------|
| 1 | Gulf of Tonkin | todo | High | Tutorial card #04; US escalation event |
| 3 | Bombing Pause | todo | Medium | Momentum: prohibits Air Strike |
| 17 | Claymores | todo | Medium | Tutorial card #10; Momentum: prohibits Ambush |
| 43 | Economic Aid | todo | Low | Tutorial card #12 |
| 51 | 301st Supply Bn | todo | Medium | Tutorial card #11 |
| 55 | Trucks | todo | Medium | Tutorial card #02; Trail + piece movement |
| 68 | Green Berets | done | Low | Place Irregulars/Rangers, set Support |
| 75 | Sihanouk | todo | Medium | Tutorial card #09 |
| 79 | Henry Cabot Lodge | todo | Medium | Tutorial card #06 |
| 97 | Brinks Hotel | todo | Medium | Tutorial card #05 |
| 101 | Booby Traps | todo | Medium | Tutorial card #07; Capability |
| 107 | Burning Bonze | todo | Low | Tutorial card #01; Patronage/Support shift |
| 112 | Colonel Chau | todo | Medium | Tutorial card #13 |
| ... | (11 more 1964 cards) | todo | Varies | |

### Period 1965 (48 cards) — all `todo`
### Period 1968 (48 cards) — all `todo`

### Special Cards

| # | Title | Type | Status | Notes |
|---|-------|------|--------|-------|
| 125 | Nguyen Khanh | Coup | todo | Tutorial coup card; RVN Leader |
| 126-130 | (other Coup cards) | Coup | todo | |
| P1 | US Pivotal | Pivotal | todo | |
| P2 | ARVN Pivotal | Pivotal | todo | |
| P3 | NVA Pivotal | Pivotal | todo | |
| P4 | VC Pivotal (Tet Offensive) | Pivotal | todo | Trumps all other Pivotals |

### Non-Tutorial Encoded Cards

| # | Title | Status | Notes |
|---|-------|--------|-------|
| ? | Domino Theory | done | Event test |
| ? | Phoenix Program | done | Event test |

---

## 9. Non-Player Rules Summary

### Why Needed
- **Simulation**: The evaluation pipeline needs to play full games without human input
- **E2E testing**: Automated testing requires bot play for all factions
- **Solitaire mode**: 1-player games need 3 bot factions
- **Quality evaluation**: MAP-Elites evolution needs thousands of simulated games

### Key Decision Points for Bot AI
Section 8 of the FITL rules describes Non-Player faction behavior through:
1. **Event evaluation**: Whether to play an Event or Operation (priority tables)
2. **Operation selection**: Which of the 4 operations to execute (priority flowcharts)
3. **Space selection**: Where to operate (priority criteria + random space tables)
4. **Piece selection**: Which pieces to place, move, or remove (priority rules)

### Heuristics from Section 8
- US: Prioritize Support building, commitment management, Air Strike high-value targets
- ARVN: Balance Patronage extraction with COIN Control maintenance
- NVA: Focus on Trail improvement, base building, conventional force concentration
- VC: Underground operations, tax for resources, terror/subvert to shift opposition

### Implementation Strategy
1. **RandomAgent** (already in architecture): Uniform random legal move selection — baseline
2. **GreedyAgent**: Priority-table-driven operation selection, greedy space targeting
3. **Section8Agent**: Full Section 8 implementation with flowcharts + random space tables
4. Optional: UCT/MCTS agent for stronger play

---

## 10. Open Questions & Risks

1. **Derived value caching vs on-demand computation**: Total Support, COIN Control per space, victory markers are derived from piece positions and marker states. Computing on every check is correct but potentially slow for 130-card games. Consider: lazy caching with invalidation on state change.

2. **RVN Leader bonus representation**: Duong Van Minh grants "+5 Aid when ARVN performs a Training Operation". This is a trigger on operation resolution that checks the leader zone. Need to decide if this is a `TriggerDef` or a special leader-effect system.

3. **Whether all 130 events fit existing kernel primitives**: Some events have complex conditional logic, multi-step procedures, and interactions with other events. Risk: some events may require new kernel primitives or escape hatches.

4. **Performance of full 130-card game simulation**: With 4 factions, ~60 spaces, 229 pieces, and 130 cards, simulation performance matters for the evolution pipeline running thousands of games. Need benchmarking after Phase 2.

5. **Stacking enforcement during compilation vs runtime**: Max 2 bases per space, no bases on LoCs, North Vietnam restrictions. Should these be compile-time checks on scenarios, runtime assertions, or both?

6. **Operation/SA interleaving model**: Rule 4.1 allows SA "immediately before, during, or immediately after" the accompanying Operation. This is a mid-operation interruption. Need to decide: model as separate action phases, or as a composite action with insertion points.

7. **Event card text parsing**: Events have natural-language instructions that need manual encoding. 130 cards = significant manual effort. Consider: batch encoding sessions organized by complexity and period.

---

## 11. Reference: Map Data

### Cities

- Hue (Pop 2, coastal)
- Da Nang (Pop 1, coastal)
- Kontum (Pop 1)
- Qui Nhon (Pop 1, coastal)
- Cam Ranh (Pop 1, coastal)
- An Loc (Pop 1)
- Saigon (Pop 6, coastal)
- Can Tho (Pop 1)

### Provinces

- Central Laos (Jungle, Pop 0, Laos)
- Southern Laos (Jungle, Pop 0, Laos)
- Northeast Cambodia (Jungle, Pop 0, Cambodia)
- The Fishhook (Jungle, Pop 0, Cambodia)
- The Parrot's Beak (Jungle, Pop 0, Cambodia)
- Sihanoukville (Jungle, Pop 0, coastal, Cambodia)
- North Vietnam (Highland, Pop 0, coastal, North Vietnam)
- Quang Tri-Thua Thien (Highland, Pop 2, coastal)
- Quang Nam (Highland, Pop 1, coastal)
- Quang Tin-Quang Ngai (Lowland, Pop 2, coastal)
- Binh Dinh (Highland, Pop 2, coastal)
- Pleiku-Darlac (Highland, Pop 1)
- Phu Bon-Phu Yen (Lowland, Pop 1, coastal)
- Khanh Hoa (Highland, Pop 1, coastal)
- Phuoc Long (Jungle, Pop 0)
- Quang Duc-Long Khanh (Jungle, Pop 1)
- Binh Tuy-Binh Thuan (Jungle, Pop 1, coastal)
- Tay Ninh (Jungle, Pop 2)
- Kien Phong (Lowland, Pop 2)
- Kien Hoa-Vinh Binh (Lowland, Pop 2, coastal)
- Ba Xuyen (Lowland, Pop 1, coastal)
- Kien Giang-An Xuyen (Lowland, Pop 2, coastal)

### LoCs

| LoC | Type | Econ | Coastal | Adjacent Spaces |
|-----|------|------|---------|----------------|
| Hue -- Khe Sanh | Highway | 1 | Yes | Central Laos, North Vietnam, Hue, Quang Tri |
| Hue -- Da Nang | Highway | 1 | Yes | Hue, Quang Tri, Quang Nam, Da Nang |
| Da Nang -- Dak To | Highway | 0 | No | Da Nang, Quang Nam, Quang Tin, S. Laos, Binh Dinh, Pleiku |
| Da Nang -- Qui Nhon | Highway | 1 | Yes | Da Nang, Quang Tin, Binh Dinh, Qui Nhon |
| Kontum -- Dak To | Highway | 1 | No | Kontum, Pleiku, S. Laos, Binh Dinh |
| Kontum -- Qui Nhon | Highway | 1 | No | Kontum, Binh Dinh, Qui Nhon, Phu Bon |
| Kontum -- Ban Me Thuot | Highway | 1 | No | Kontum, Pleiku, Phu Bon, Khanh Hoa, Quang Duc |
| Qui Nhon -- Cam Ranh | Highway | 1 | Yes | Qui Nhon, Phu Bon, Khanh Hoa, Cam Ranh |
| Cam Ranh -- Da Lat | Highway | 1 | No | Cam Ranh, Khanh Hoa, Binh Tuy, Quang Duc |
| Ban Me Thuot -- Da Lat | Highway | 0 | No | Pleiku, Khanh Hoa, Binh Tuy, Quang Duc |
| Saigon -- Cam Ranh | Highway | 1 | Yes | Saigon, Cam Ranh, Binh Tuy |
| Saigon -- Da Lat | Highway | 1 | No | Saigon, Binh Tuy, Quang Duc, Khanh Hoa |
| Saigon -- An Loc -- Ban Me Thuot | Highway | 1 | No | Saigon, Tay Ninh, Quang Duc, Phuoc Long, An Loc, Fishhook, Pleiku, Khanh Hoa |
| Saigon -- Can Tho | Mekong | 2 | No | Saigon, Can Tho, Kien Phong, Kien Hoa |
| Can Tho -- Chau Doc | Mekong | 1 | No | Can Tho, Kien Phong, Kien Giang, Parrot's Beak |
| Can Tho -- Bac Lieu | Mekong | 0 | Yes | Can Tho, Kien Giang, Ba Xuyen |
| Can Tho -- Long Phu | Mekong | 1 | Yes | Can Tho, Ba Xuyen, Kien Hoa |

### Country Groupings

- **South Vietnam**: All spaces not listed below
- **Laos**: Central Laos, Southern Laos
- **Cambodia**: Northeast Cambodia, The Fishhook, The Parrot's Beak, Sihanoukville
- **North Vietnam**: North Vietnam

### Adjacency Map

```
// Cities
Hue                         -> [QuangTri_ThuaThien, LOC_Hue_KheSanh, LOC_Hue_DaNang]
DaNang                      -> [QuangNam, QuangTin_QuangNgai, LOC_Hue_DaNang, LOC_DaNang_QuiNhon, LOC_DaNang_DakTo]
Kontum                      -> [BinhDinh, Pleiku_Darlac, PhuBon_PhuYen, LOC_Kontum_DakTo, LOC_Kontum_BanMeThuot, LOC_Kontum_QuiNhon]
QuiNhon                     -> [BinhDinh, PhuBon_PhuYen, LOC_DaNang_QuiNhon, LOC_Kontum_QuiNhon, LOC_QuiNhon_CamRanh]
CamRanh                     -> [KhanhHoa, BinhTuy_BinhThuan, LOC_QuiNhon_CamRanh, LOC_Saigon_CamRanh, LOC_CamRanh_DaLat]
AnLoc                       -> [PhuocLong, TayNinh, TheFishhook, LOC_Saigon_AnLoc_BanMeThuot]
Saigon                      -> [BinhTuy_BinhThuan, QuangDuc_LongKhanh, TayNinh, KienPhong, KienHoa_VinhBinh, LOC_Saigon_CamRanh, LOC_Saigon_DaLat, LOC_Saigon_AnLoc_BanMeThuot, LOC_Saigon_CanTho]
CanTho                      -> [KienPhong, KienHoa_VinhBinh, BaXuyen, KienGiang_AnXuyen, LOC_Saigon_CanTho, LOC_CanTho_ChauDoc, LOC_CanTho_BacLieu, LOC_CanTho_LongPhu]

// Provinces
CentralLaos                 -> [NorthVietnam, QuangTri_ThuaThien, QuangNam, SouthernLaos, LOC_Hue_KheSanh]
SouthernLaos                -> [CentralLaos, QuangNam, QuangTin_QuangNgai, BinhDinh, Pleiku_Darlac, NortheastCambodia, LOC_DaNang_DakTo, LOC_Kontum_DakTo]
NortheastCambodia           -> [SouthernLaos, TheFishhook, Pleiku_Darlac]
TheFishhook                 -> [NortheastCambodia, TheParrotsBeak, AnLoc, Pleiku_Darlac, QuangDuc_LongKhanh, PhuocLong, TayNinh, LOC_Saigon_AnLoc_BanMeThuot]
TheParrotsBeak              -> [TheFishhook, Sihanoukville, TayNinh, KienPhong, KienGiang_AnXuyen, LOC_CanTho_ChauDoc]
Sihanoukville               -> [TheParrotsBeak, KienGiang_AnXuyen]
NorthVietnam                -> [CentralLaos, QuangTri_ThuaThien, LOC_Hue_KheSanh]
QuangTri_ThuaThien          -> [NorthVietnam, Hue, CentralLaos, QuangNam, LOC_Hue_KheSanh, LOC_Hue_DaNang]
QuangNam                    -> [CentralLaos, SouthernLaos, QuangTri_ThuaThien, DaNang, QuangTin_QuangNgai, LOC_Hue_DaNang, LOC_DaNang_DakTo]
QuangTin_QuangNgai          -> [SouthernLaos, DaNang, QuangNam, BinhDinh, LOC_DaNang_DakTo, LOC_DaNang_QuiNhon]
BinhDinh                    -> [SouthernLaos, QuangTin_QuangNgai, QuiNhon, PhuBon_PhuYen, Kontum, Pleiku_Darlac, LOC_DaNang_DakTo, LOC_DaNang_QuiNhon, LOC_Kontum_DakTo, LOC_Kontum_QuiNhon]
Pleiku_Darlac               -> [SouthernLaos, NortheastCambodia, TheFishhook, BinhDinh, Kontum, PhuBon_PhuYen, KhanhHoa, QuangDuc_LongKhanh, LOC_Kontum_DakTo, LOC_Kontum_BanMeThuot, LOC_DaNang_DakTo, LOC_BanMeThuot_DaLat, LOC_Saigon_AnLoc_BanMeThuot]
PhuBon_PhuYen               -> [Kontum, BinhDinh, QuiNhon, KhanhHoa, Pleiku_Darlac, LOC_Kontum_QuiNhon, LOC_QuiNhon_CamRanh, LOC_Kontum_BanMeThuot]
KhanhHoa                    -> [PhuBon_PhuYen, CamRanh, BinhTuy_BinhThuan, QuangDuc_LongKhanh, Pleiku_Darlac, LOC_QuiNhon_CamRanh, LOC_CamRanh_DaLat, LOC_BanMeThuot_DaLat, LOC_Kontum_BanMeThuot, LOC_Saigon_DaLat]
PhuocLong                   -> [TheFishhook, AnLoc, QuangDuc_LongKhanh, TayNinh, LOC_Saigon_AnLoc_BanMeThuot]
QuangDuc_LongKhanh          -> [TheFishhook, Pleiku_Darlac, KhanhHoa, BinhTuy_BinhThuan, Saigon, TayNinh, PhuocLong, LOC_Kontum_BanMeThuot, LOC_Saigon_AnLoc_BanMeThuot, LOC_BanMeThuot_DaLat, LOC_Saigon_DaLat]
BinhTuy_BinhThuan           -> [Saigon, QuangDuc_LongKhanh, KhanhHoa, CamRanh, LOC_BanMeThuot_DaLat, LOC_CamRanh_DaLat, LOC_Saigon_DaLat, LOC_Saigon_CamRanh]
TayNinh                     -> [TheParrotsBeak, TheFishhook, AnLoc, PhuocLong, QuangDuc_LongKhanh, Saigon, KienPhong, LOC_Saigon_AnLoc_BanMeThuot]
KienPhong                   -> [TheParrotsBeak, TayNinh, Saigon, KienHoa_VinhBinh, CanTho, KienGiang_AnXuyen, LOC_CanTho_ChauDoc, LOC_Saigon_CanTho]
KienHoa_VinhBinh            -> [Saigon, KienPhong, CanTho, BaXuyen, LOC_Saigon_CanTho, LOC_CanTho_LongPhu]
BaXuyen                     -> [KienGiang_AnXuyen, CanTho, KienHoa_VinhBinh, LOC_CanTho_BacLieu, LOC_CanTho_LongPhu]
KienGiang_AnXuyen           -> [Sihanoukville, TheParrotsBeak, KienPhong, CanTho, BaXuyen, LOC_CanTho_ChauDoc, LOC_CanTho_BacLieu]

// LoCs
LOC_Hue_KheSanh             -> [CentralLaos, NorthVietnam, Hue, QuangTri_ThuaThien]
LOC_Hue_DaNang              -> [Hue, QuangTri_ThuaThien, QuangNam, DaNang]
LOC_DaNang_DakTo            -> [DaNang, QuangNam, QuangTin_QuangNgai, SouthernLaos, BinhDinh, Pleiku_Darlac, LOC_Kontum_DakTo]
LOC_DaNang_QuiNhon          -> [DaNang, QuangTin_QuangNgai, BinhDinh, QuiNhon]
LOC_Kontum_DakTo            -> [Kontum, Pleiku_Darlac, SouthernLaos, BinhDinh]
LOC_Kontum_QuiNhon          -> [Kontum, BinhDinh, QuiNhon, PhuBon_PhuYen]
LOC_Kontum_BanMeThuot       -> [Kontum, Pleiku_Darlac, PhuBon_PhuYen, KhanhHoa, QuangDuc_LongKhanh, LOC_Saigon_AnLoc_BanMeThuot, LOC_BanMeThuot_DaLat]
LOC_QuiNhon_CamRanh         -> [QuiNhon, PhuBon_PhuYen, KhanhHoa, CamRanh]
LOC_CamRanh_DaLat           -> [CamRanh, KhanhHoa, BinhTuy_BinhThuan, QuangDuc_LongKhanh, LOC_Saigon_DaLat, LOC_BanMeThuot_DaLat]
LOC_BanMeThuot_DaLat        -> [Pleiku_Darlac, KhanhHoa, BinhTuy_BinhThuan, QuangDuc_LongKhanh, LOC_Kontum_BanMeThuot, LOC_Saigon_AnLoc_BanMeThuot, LOC_Saigon_DaLat, LOC_CamRanh_DaLat]
LOC_Saigon_CamRanh          -> [Saigon, CamRanh, BinhTuy_BinhThuan]
LOC_Saigon_DaLat            -> [Saigon, BinhTuy_BinhThuan, QuangDuc_LongKhanh, KhanhHoa, LOC_BanMeThuot_DaLat, LOC_CamRanh_DaLat]
LOC_Saigon_AnLoc_BanMeThuot -> [Saigon, TayNinh, QuangDuc_LongKhanh, PhuocLong, AnLoc, TheFishhook, Pleiku_Darlac, KhanhHoa, LOC_Kontum_BanMeThuot, LOC_BanMeThuot_DaLat]
LOC_Saigon_CanTho           -> [Saigon, CanTho, KienPhong, KienHoa_VinhBinh]
LOC_CanTho_ChauDoc          -> [CanTho, KienPhong, KienGiang_AnXuyen, TheParrotsBeak]
LOC_CanTho_BacLieu          -> [CanTho, KienGiang_AnXuyen, BaXuyen]
LOC_CanTho_LongPhu          -> [CanTho, BaXuyen, KienHoa_VinhBinh]
```

### Capabilities (14)

| # | Name | Affects |
|---|------|---------|
| 4 | Top Gun | Air Strike |
| 8 | Arc Light | Air Strike |
| 11 | Abrams | Assault |
| 13 | Cobras | Sweep / Assault |
| 14 | M-48 Patton | Assault / Patrol |
| 18 | Combined Action Platoons | Training / Sweep |
| 19 | CORDS | Training |
| 20 | Laser Guided Bombs | Air Strike |
| 28 | Search And Destroy | Assault |
| 31 | AAA | Rally / Air Strike |
| 32 | Long Range Guns | Bombard |
| 33 | MiGs | NVA Resources during Reset / Air Strike |
| 34 | SA-2s | Air Strike degrading Trail / NVA Rally improving Trail |
| 45 | PT-76 | NVA Attack |
| 61 | Armored Cavalry | ARVN Transport |
| 86 | Mandate of Heaven | ARVN Govern |
| 101 | Booby Traps | Ambush / Sweep |
| 104 | Main Force Bns | Insurgent March / VC Ambush |
| 116 | Cadres | VC Terror and Agitate / VC Rally Agitate |

### Momentum Markers (16)

| # | Name | Side | Effect |
|---|------|------|--------|
| 5 | Wild Weasels | Shaded | Affects Air Strike |
| 7 | ADSID | Unshaded | -6 NVA Resources at any Trail change |
| 10 | Rolling Thunder | Shaded | Prohibits Air Strike |
| 15 | Medevac | Unshaded | Affects Commitment Phase during Coup Round |
| 15 | Medevac | Shaded | Prohibits Air Lift |
| 16 | Blowtorch Komer | Unshaded | Pacify costs 1 Resource per step/terror during Support Phase |
| 17 | Claymores | Unshaded | Prohibits Ambush, affects Guerrilla March |
| 22 | Da Nang | Shaded | Prohibits Air Strike |
| 38 | McNamara Line | Single | Prohibits Infiltrate, prohibits Trail improvement by Rally |
| 39 | Oriskany | Shaded | Prohibits degrade of Trail (Air Strike, Coup Round, NOT Events) |
| 41 | Bombing Pause | Single | Prohibits Air Strike |
| 46 | 559th Transport Grp | Unshaded | Infiltrate max 1 space |
| 72 | Body Count | Unshaded | Affects Assault and Patrol |
| 78 | General Lansdale | Shaded | Prohibits Assault |
| 115 | Typhoon Kate | Single | Prohibits Air Lift, Transport, Bombard; all other SAs max 1 space |

### Scenarios

<details>
<summary>Short: 1965-1967 — Westy's War</summary>

Deck: Place Young Turks as RVN Leader and Khanh beneath Young Turks; remove 1 Failed Coup and all Pivotal Events. Shuffle 24 (Period, if desired) Event cards and stack 3 piles of 8 Events and 1 Coup. Remove all other cards.

- Aid: 15, Total Econ: 15, Patronage: 18
- Resources: VC 10, NVA 15, ARVN 30
- Support+Available: 38, COIN+Patronage: 41, Opposition+Bases: 23, NVA+Bases: 10
- The Trail: 2, Eligible: All Factions
- Out of Play: US—6 Troops; ARVN—10 Troops, 3 Rangers
- Capabilities (if period Events): Shaded—AAA
- US Policy: LBJ (if US Non-player)

**Space Setup:**
- Da Nang, Kontum: COIN Control, Active Support; US—3 Troops; ARVN—1 Police
- Saigon, Can Tho: COIN Control, Active Support; US—1 Base, 3 Troops; ARVN—4 Troops, 2 Police, 1 Ranger
- Quang Tri: NVA Control, Active Opposition; ARVN—1 Base, 2 Troops; NVA—1 Base, 4 Guerrillas
- Quang Nam: COIN Control; ARVN—1 Ranger, 1 Police
- Quang Tin: COIN Control; US—2 Troops; ARVN—1 Police
- Binh Dinh: COIN Control, Passive Support; US—1 Base, 1 Irregular, 4 Troops; ARVN—2 Troops, 1 Police; VC—1 Base, 2 Guerrillas
- Pleiku: US—1 Base, 1 Irregular, 1 Troop; VC—1 Base, 2 Guerrillas
- Khanh Hoa: COIN Control; US—1 Irregular, 1 Troop
- Hue, Kien Hoa, Ba Xuyen: COIN Control; ARVN—2 Police
- An Loc, Qui Nhon, Cam Ranh: COIN Control, Passive Support; ARVN—1 Police
- Binh Tuy: Passive Support; US—2 Troops; ARVN—1 Police; VC—1 Base, 2 Guerrillas
- Quang Duc: Active Opposition; VC—1 Base, 2 Guerrillas; NVA—1 Guerrilla
- Tay Ninh: Active Opposition; VC—1 Tunneled Base, 2 Guerrillas; NVA—1 Guerrilla
- Kien Phong, Kien Giang: Active Opposition; VC—2 Guerrillas
- North Vietnam, Southern Laos: NVA Control; NVA—2 Bases, 1 Guerrilla, 6 Troops
- Central Laos, The Fishhook, The Parrot's Beak: NVA Control; NVA—1 Base, 2 Guerrillas

</details>

<details>
<summary>Medium: 1968-1972 — A Better War</summary>

Deck: Place Ky as RVN Leader and Khanh and Young Turks beneath Ky. Distribute Pivotal Events. Shuffle 36 (Period, if desired) Events and stack 3 piles of 12 Events and 1 Coup. Remove the rest.

- Aid: 30, Total Econ: 15, Patronage: 15
- Resources: VC 15, NVA 20, ARVN 30
- Support+Available: 37, COIN+Patronage: 44, Opposition+Bases: 23, NVA+Bases: 8
- The Trail: 3, Eligible: All Factions
- Out of Play: US—5 Troops; ARVN—10 Troops, 3 Rangers
- Capabilities (if period Events): Shaded—AAA, Main Force Bns, SA-2s, Search and Destroy; Unshaded—Arc Light, M-48 Patton
- US Policy: LBJ (if US Non-player)

**Space Setup:**
- North Vietnam, Central Laos: NVA Control; NVA—1 Base, 1 Guerrilla, 9 Troops
- Quang Tri: COIN Control, Passive Support; US—1 Base, 4 Troops, 1 Irregular; ARVN—3 Troops; NVA—1 Base, 3 Guerrillas
- Quang Nam: Active Opposition; VC—1 Base, 2 Guerrillas
- Hue, Da Nang, Qui Nhon, Cam Ranh: COIN Control, Passive Support; US—1 Troop; ARVN—2 Police
- Quang Tin: COIN Control, Passive Support; US—1 Base, 2 Troops; ARVN—2 Troops, 1 Police
- Kontum: COIN Control, Passive Support; US—1 Base, 1 Troop, 1 Irregular
- Binh Dinh, Pleiku, Khanh Hoa: COIN Control, Active Support; US—2 Troops, 1 Irregular; ARVN—1 Police; VC—1 Base, 2 Guerrillas
- Phu Bon: COIN Control, Passive Support; US—3 Troops; ARVN—2 Troops, 2 Police; VC—2 Guerrillas
- Binh Tuy: COIN Control; US—1 Base, 2 Troops; ARVN—3 Troops, 1 Police; VC—1 Base, 2 Guerrillas
- Saigon: COIN Control, Active Support; US—1 Base, 2 Troops; ARVN—1 Troop, 1 Ranger, 4 Police; VC—1 Base, 1 Guerrilla
- Quang Duc: COIN Control; ARVN—2 Troops, 1 Police; VC—1 Guerrilla
- Phuoc Long: VC—1 Base, 2 Guerrillas; NVA—1 Guerrilla
- Tay Ninh: COIN Control, Active Opposition; US—1 Base, 3 Troops; ARVN—2 Troops, 1 Ranger; VC—1 Tunneled Base, 3 Guerrillas; NVA—2 Guerrillas
- An Loc: COIN Control; ARVN—1 Troop, 2 Police
- Can Tho: COIN Control, Passive Support; US—3 Troops, 1 Irregular; ARVN—2 Troops, 1 Police
- Kien Phong, Kien Hoa, Ba Xuyen: Passive Opposition; ARVN—1 Police; VC—1 Guerrilla
- Kien Giang: COIN Control, Active Opposition; ARVN—1 Base, 2 Troops, 1 Ranger; VC—1 Guerrilla
- Southern Laos, NE Cambodia, The Fishhook, The Parrot's Beak, Sihanoukville: NVA Control; NVA—1 Base, 2 Guerrillas

</details>

<details>
<summary>Full: 1964-1972 — Nam</summary>

Deck: Distribute Pivotal Events. Shuffle and stack 6 piles of 12 Events (Period, if desired) and 1 Coup each. Remove the remaining 48 Events.

- Aid: 15, Total Econ: 15, Patronage: 15
- Resources: VC 5, NVA 10, ARVN 30
- Support+Available: 38, COIN+Patronage: 35, Opposition+Bases: 27, NVA+Bases: 4
- The Trail: 1, Eligible: All Factions
- Out of Play: US—2 Bases, 10 Troops; ARVN—2 Bases, 10 Troops, 3 Rangers
- US Policy: JFK (if US Non-player)

**Space Setup:**
- Saigon: COIN Control, Passive Support; US—1 Base, 2 Troops; ARVN—2 Troops, 3 Police
- Hue: COIN Control; ARVN—2 Troops, 2 Police
- Qui Nhon, Cam Ranh, An Loc, Can Tho: COIN Control, Passive Support; ARVN—2 Troops, 2 Police
- Da Nang, Kontum: COIN Control; US—2 Troops; ARVN—1 Police
- Quang Tri, Binh Dinh: US—1 Irregular, 1 Troop; VC—1 Base, 2 Guerrillas
- Quang Nam: COIN Control; ARVN—1 Ranger, 1 Police
- Pleiku: US—1 Base, 1 Irregular, 1 Troop; VC—1 Base, 2 Guerrillas
- Quang Tin, Quang Duc, Binh Tuy: Active Opposition; VC—1 Base, 2 Guerrillas
- Tay Ninh: Active Opposition; VC—1 Tunneled Base, 2 Guerrillas
- Phu Bon, Khanh Hoa, Kien Hoa, Ba Xuyen: COIN Control, Passive Support; ARVN—1 Police
- Kien Phong, Kien Giang: Active Opposition; VC—1 Guerrilla
- North Vietnam, Central Laos, Southern Laos, The Parrot's Beak: NVA Control; NVA—1 Base, 3 Guerrillas

</details>

---

## 12. Reference: Tutorial & Card Definitions

### Tutorial Mini-Deck (13 cards, bottom to top)

| Position | Card # | Title | Period |
|----------|--------|-------|--------|
| 13 (bottom) | 112 | Colonel Chau | 1964 |
| 12 | 43 | Economic Aid | 1964 |
| 11 | 51 | 301st Supply Bn | 1964 |
| 10 | 17 | Claymores | 1964 |
| 9 | 75 | Sihanouk | 1964 |
| 8 | 125 | Coup! — Nguyen Khanh | — |
| 7 | 101 | Booby Traps | 1964 |
| 6 | 79 | Henry Cabot Lodge | 1964 |
| 5 | 97 | Brinks Hotel | 1964 |
| 4 | 1 | Gulf of Tonkin | 1964 |
| 3 | 68 | Green Berets | 1964 |
| 2 | 55 | Trucks | 1964 |
| 1 (top) | 107 | Burning Bonze | 1964 |

Full scenario setup: Follow "Full: 1964-1972 — Nam" scenario (Section 11). Default RVN Leader: Duong Van Minh (+5 Aid when ARVN Train).

### Turn 1 Narrative: Burning Bonze

Looking across the top of the Burning Bonze card, the faction order (2.3.2) for the turn (from left to right, 2.3) is: VC (blue), NVA (red), ARVN (yellow), and US (green). At the start of any scenario all the factions begin Eligible (2.3.1), so the Viet Cong will have first consideration on this card.

The VC examine the top unshaded portion (pro-COIN) Event of the card, and also the bottom shaded portion (pro-Insurgent) Event. On dual Event cards such as these (5.2), either the top or bottom Event is allowed to be performed on a turn, never both.

The VC initiate play by deciding to execute the shaded Event (5.1), "Shift Saigon 1 level toward Active Opposition. Aid -12." Move the blue VC token from the Eligible box to the 1st Eligible Event portion of the Sequence of Play (SOP) chart located on the map.

The effect of this Event is dramatic to begin the game -- Saigon's Passive Support marker is shifted one level towards Active Opposition, making the space Neutral (1.6.1). This results in the marker's removal because the absence of any such marker in a space indicates that it has no Support or Opposition, and is therefore Neutral (1.6.2). This causes the US's victory marker (Support + Available, 1.9) to drop 6 spaces on the track (6 is the population value of Saigon, 1.3.3) from 38 to 32.

The ARVN faction is also impacted by this Event because Aid (1.8) is lowered by 12. Move the Aid marker on the track from 15 to 3. There is no immediate effect on ARVN resources (which remain at 30), however resources granted to the ARVN via Aid will dwindle accordingly during the next Coup Round (6.2.3).

Events don't cost resources to enact, so the VC player-turn is done.

The NVA is the next listed faction, potentially being 2nd Eligible (2.3.4). Checking the Sequence of Play chart, we see that since the 1st Eligible faction (VC) performed the card's Event, the 2nd Eligible faction may perform Operations (Op) & an accompanying Special Activity.

The NVA see that they will be first up on the next card (Trucks), so the decision whether to go now or to Pass (2.3.3) is at hand. The NVA decide to Pass. Shift their red token from the Eligible box to the Pass box, and then increase NVA resources by +1 to 11. When an Insurgent faction (VC or NVA) Passes, they receive +1 Resource; when a COIN faction (US or ARVN) Passes, the ARVN receive +3 resources (2.3.3).

With the NVA Passing, the ARVN are next in line to be 2nd Eligible. They indicate their intention to act by moving their yellow Eligibility token to the Execute Op & Special Activity box on the Sequence of Play chart.

VC Event, NVA Pass, ARVN Op & Special Activity.

With Saigon now at Neutral (no Support), the ARVN don't want any insurgent Guerrillas to Rally in and thus infest their capital. The ARVN will therefore Train (3.2.1) in Saigon, placing a white pawn in the City. This Operation will cost the ARVN 3 resources, so lower their marker on the track from 30 to 27.

Being a City, the ARVN can place 1-2 Rangers or 1-6 of their cubes, so a choice needs to be made: Rangers or cubes. The ARVN takes 6 of their yellow Troop cubes from Available and places them directly into Saigon.

Since Saigon contains ARVN Troops and Police and is under COIN Control, the ARVN also opts to now conduct a Pacify (6.3.1) action in 1 Train space. Even though permitted by a Training Op, Pacify still needs to be paid for separately.

The ARVN spend 3 Resources by moving the Track token down from 27 to 24 to Pacify one level, and they place a Passive Support marker in Saigon. This returns the US Support + Available (1.9) marker on the track to 38 (+6 spaces, matching the population of Saigon).

For their Special Activity, the ARVN choose Govern (4.3.1). Taking two spaces: An Loc and Can Tho, both population 1 Cities that are COIN-Controlled with Support. This increases Aid by +6, +3 for each City (3 x 1 population) Governed.

ARVN having just Trained, Aid also receives a +5 bonus because of the current RVN leader (Minh), so shift the marker up again from 9 to 14.

Since two Eligible factions (the VC 1st and the ARVN 2nd) have now acted, the turn is over (2.3.6). The US can do nothing (not even Pass), so their Eligibility token remains in place. Shift the VC and ARVN Eligibility tokens to the Ineligible box. The NVA (who Passed) Eligibility token returns to the Eligible box, joining the US token.

Make Trucks the current card for game turn 2.

### Card Definitions

**Burning Bonze (#107)**
- Period: 1964
- Faction Order: VC, NVA, ARVN, US
- Flavor Text: "Gruesome protests close elite ranks."
- Unshaded: "Patronage +3 or, if Saigon at Active Support, +6"
- Shaded: "Anti-regime self-immolation: Shift Saigon 1 level toward Active Opposition. Aid -12."

**Trucks (#55)**
- Period: 1964
- Faction Order: NVA, VC, US, ARVN
- Flavor Text: "Bottlenecks."
- Unshaded: "Degrade Trail 2 boxes. NVA selects and removes 4 of its pieces each from Laos and Cambodia."
- Shaded: "Convoys: Add twice Trail value to each NVA and VC Resources. NVA moves its unTunneled Bases anywhere within Laos/Cambodia."

**Green Berets (#68)**
- Period: 1964
- Faction Order: ARVN, US, VC, NVA
- Flavor Text: "Elite trainers."
- Unshaded: "Place 3 Irregulars or 3 Rangers in a Province without NVA Control. Set it to Active Support."
- Shaded: "Reluctant trainees: Remove any 3 Irregulars to Available and set 1 of their Provinces to Active Opposition."

---

## 13. Reference: FITL Rules (Appendix)

<details>
<summary>RAW RULES REFERENCE -- See Sections 3-7 for kernel mapping. Click to expand.</summary>

### 1.0 INTRODUCTION

Fire in the Lake is a 1- to 4-player board game depicting insurgent and counterinsurgent (COIN) conflict during the main US period in Vietnam, 1964-1972, up to the "Paris Peace". Each player takes the role of a Faction seeking to set the fate of South Vietnam: the United States (US), North Vietnamese forces (NVA), the Republic of Vietnam forces (ARVN), or the southern communist Viet Cong (VC). Using military, political, and economic actions and exploiting various events, players build and maneuver forces to influence or control the population, extract resources, or otherwise achieve their Faction's aims. A deck of cards regulates turn order, events, victory checks, and other processes. The rules can run non-player Factions, enabling solitaire, 2-player, or multi-player games.

#### 1.1 General Course of Play

Fire in the Lake -- unlike many card-assisted war games -- does not use hands of cards. Instead, cards are played from the deck one at a time, with one card ahead revealed to all players. Each Event card shows the order in which the Factions become Eligible to choose between the card's Event or one of a menu of Operations and Special Activities. Executing an Event or Operation carries the penalty of rendering that Faction Ineligible to do so on the next card. Coup cards mixed in with the Event cards provide periodic opportunities for instant wins and for activities such as collecting resources and influencing popular sympathies.

#### 1.2 Components

A complete set of Fire in the Lake includes:
- A 22"x34" mounted game board (1.3).
- A deck of 130 cards (5.0).
- 229 olive, bright blue, red, yellow, and orange wooden playing pieces, many embossed (1.4).
- 7 embossed cylinders (1.8, 2.2).
- 6 black and 6 white pawns (3.1.1).
- A sheet of markers.
- 2 Sequence of Play and Spaces List sheets (1.4.1, 2.0, 6.0).
- 4 Faction player aid foldouts (3.0, 4.0, 7.0).
- A Random Spaces and Non-player Events foldout (8.2, 8.4).
- 2 Non-player Operations foldouts (8.5-8.8).
- 3 6-sided dice -- 1 blue, 1 red, 1 yellow.
- A background play book.
- This rule book.

#### 1.3 The Map

The map shows South Vietnam and nearby areas divided into various types of spaces.

**1.3.1 Map Spaces.** Map spaces include rural Provinces, Cities, and Lines of Communication (LoCs) that are either Highways or the Mekong river. All spaces -- including LoCs -- can hold forces. Towns are not spaces, merely boundaries between adjacent LoCs (1.3.6).

**1.3.2 Provinces.** Each Province shows a Population value (Pop) of 0, 1, or 2 that affects victory via Support for or Opposition to the Saigon regime (1.6) or Control (1.7) and some Insurgent actions. Provinces are further distinguished as Highland, Lowland, or Jungle, affecting Counterinsurgent Sweeps (3.2.3), Assaults (3.2.4), and certain Events (5.0).

**1.3.3 Cities.** Cities similarly show Population value of 1, 2, or 6.

**1.3.4 LoCs.** Each Line of Communication (LoC) space is either Highway (road) or Mekong (river) or both and shows an Economic value (Econ) of 0, 1, or 2 affecting ARVN Resource earnings (1.8, 6.2.3) and Viet Cong Taxation (4.5.1). NOTE: LoCs are spaces!

**1.3.5 Foreign Countries.** The map's Provinces include parts of North Vietnam, Laos, and Cambodia. All other spaces are South Vietnam ("The South"). Only NVA and VC may stack in North Vietnam (1.4.2). US and ARVN may enter Laos or Cambodia spaces normally, but at risk of later removal (6.4.1).

**1.3.6 Adjacency.** Adjacency affects the movement of forces and implementation of certain Events. Any 2 spaces meeting one of the following conditions are adjacent:
- Spaces that border on (touch) one another.
- Provinces that would touch but for separation by a LoC.
- LoCs or Provinces separated by Towns.
NOTE: Towns are not spaces; they merely terminate LoCs (1.3.1).

**1.3.7 Coasts.** Any spaces adjacent to blue ocean (including across a LoC) are coastal, affecting the Amphibious Landing, Operation Starlite, and USS New Jersey Events (5.0).

**1.3.8 Overflow.** Use "Overflow" boxes for pieces that exceed the room in a space on the map; place the lettered marker in that space.

#### 1.4 Forces

The wooden pieces represent the Factions' various forces: US Troops (olive cubes), ARVN Troops (yellow cubes) and Police (orange cubes), NVA Troops (red cubes), NVA and VC Guerrillas, US and ARVN Special Forces (SF), and all Factions' Bases.

**1.4.1 Availability, Removal, and Out of Play.** A "Force Pool" inventory on the Spaces List sheet shows the number of pieces in the game. Keep forces Available for placement in the Faction's Available Forces box. Place NVA and VC Bases in the highest- and US Bases and Troops in the lowest-numbered empty spaces to show the number of on-map Bases and Available US Bases and Troops. US and ARVN may have forces in the Out of Play box -- neither Available nor on the map -- and US forces can become Casualties. Otherwise, forces removed from the map go to Available.

- Unless otherwise instructed (by Event, 5.1.1), forces may only be placed from or replaced with those in the Available boxes. A piece to be replaced by a piece that is unavailable is simply removed (EXCEPTION: Infiltrate, 4.4.1).
- Important: Players while executing an Operation, Special Activity, or Event to place their own forces may take them from elsewhere on the map (including a Tunneled Base, losing the Tunnel marker, 1.4.4) if and only if the desired force type is not Available. EXCEPTION: The US player may do so only with US-led Irregulars and any ARVN forces, not with US Troops nor with US Bases.

**1.4.2 Stacking.** No more than 2 Bases (of any Factions) may occupy a single Province or City. Bases may not occupy LoCs. Only NVA and VC forces may occupy North Vietnam (1.4.2).

**1.4.3 Underground/Active.** Guerrillas and Special Forces are either Underground -- symbol end down -- or Active -- symbol end up. Actions and Events flip them from one to the other state. Bases, Troops, and Police are always Active. Always set up and place new Guerrillas and SF Underground.

**1.4.4 Tunnels.** Scenario Setup (2.1) and Events (5.0) designate certain VC or NVA Bases as Tunneled. Tunneled Bases are harder to remove by Operations or Events. When a Tunneled Base is removed, so is the Tunnel marker.

#### 1.5 Players & Factions

The game may have up to 4 players, each as 1 or more Factions: the US (olive), the NVA (red), the ARVN (yellow and orange), or the VC (blue).

**1.5.1 Friends and Enemies.** US and ARVN are Counterinsurgent (COIN) Factions and friendly to each other; NVA and VC are Insurgents and friendly to each other. Counterinsurgents are enemy to Insurgents.

**1.5.2 Negotiation.** Players may make any mutual arrangements within the rules. The NVA and VC if separate players may voluntarily transfer Resources to each other at any time that one of them is executing an Operation, Special Activity, or Event.

#### 1.6 Support and Opposition

**1.6.1** Cities and Provinces with at least 1 Population always show 1 of 5 levels: Active Support, Passive Support, Neutral, Passive Opposition, Active Opposition.

**1.6.2** Active Support or Opposition counts double Population for Total Support or Opposition -- affecting US or VC victory.

#### 1.7 Control

The 2 Counterinsurgent Factions together (US and ARVN) Control a Province or City if their pieces there combined exceed those of the other 2 Factions (NVA and VC) combined. The NVA alone Control a Province or City if NVA pieces exceed all other pieces (including VC).

#### 1.8 Resources, Aid, and Patronage

At any moment, each Faction except the US has between 0 and 75 Resources. During Coup Rounds, a level of Aid (between 0 and 75) is added to ARVN Resources. A level of Patronage (0 to 75) contributes to ARVN victory.

**1.8.1 Joint Operations.** The US does not track its own Resources. Some US Operations and Pacification spend ARVN Resources. The US may only spend those ARVN Resources that exceed the marked Total Econ level.

#### 1.9 Victory Markers

Track the following:
- Total Support + US Troops and Bases Available (US victory)
- Total NVA-Controlled Population + NVA Bases on map (NVA victory)
- Total COIN-Controlled Population + Patronage (ARVN victory)
- Total Opposition + VC Bases on map (VC victory)

### 2.0 SEQUENCE OF PLAY

**2.3 Event Card**: Up to 2 Factions execute Operations or the Event. Factions in "Eligible" box receive options in left-to-right Faction order.

**2.3.1 Eligibility.** Factions that did not execute on previous card are Eligible.

**2.3.3 Passing.** Pass = remain Eligible + receive reward (+1 Insurgent Resource or +3 ARVN Resources for COIN).

**2.3.4 Options.** 1st Eligible: Op (with/without SA) or Event. 2nd Eligible: depends on 1st's choice (option matrix).

**2.3.5 Limited Operation.** Op in 1 space, no SA.

**2.3.8 Pivotal Events.** Faction-specific cards that cancel current Event. Pre-conditions, pre-action window, trumping chain.

**2.3.9 Monsoon Season.** Last Event before Coup: no Sweep/March, Air Strike/Air Lift limited to 2 spaces, no Pivotal Events.

### 3.0 OPERATIONS

**3.1** Faction chooses 1 of 4 Ops, selects spaces. Costs Resources per space. Executing Faction chooses order.

**3.1.2 Free Operations.** Via Events: no Resources, no Eligibility impact. EXCEPTIONS: Pacification, Agitation, Trail Improvement still cost.

**3.2 COIN Operations**: Train (3.2.1), Patrol (3.2.2), Sweep (3.2.3), Assault (3.2.4).

**3.3 Insurgent Operations**: Rally (3.3.1), March (3.3.2), Attack (3.3.3), Terror (3.3.4).

### 4.0 SPECIAL ACTIVITIES

**4.1** SA accompanies Op. No added Resource cost. SA may occur before, during, or after Op. 1st Eligible using SA gives 2nd Eligible Event option.

**4.2 US**: Advise (4.2.1), Air Lift (4.2.2), Air Strike (4.2.3).

**4.3 ARVN**: Govern (4.3.1), Transport (4.3.2), Raid (4.3.3).

**4.4 NVA**: Infiltrate (4.4.1), Bombard (4.4.2), Ambush (4.4.3).

**4.5 VC**: Tax (4.5.1), Subvert (4.5.2), Ambush (4.5.3).

### 5.0 EVENTS

**5.1** Execute Event text literally and in order. Where Event contradicts rules, Event takes precedence (with exceptions for stacking, availability, tunnels, max values).

**5.2 Dual Use.** Unshaded or shaded text (not both). Either text regardless of Faction.

**5.3 Capabilities.** Lasting effects for rest of game. Marker on unshaded/shaded side.

**5.4 Momentum.** Lasting effects until next Coup Reset. Card near draw pile.

**5.5 Free Operations.** Via Events: no Resources, no Eligibility impact (with exceptions).

### 6.0 COUP ROUNDS

Sequence: Victory (6.1) -> Resources (6.2) -> Support (6.3) -> Redeploy (6.4) -> Commitment (6.5) -> Reset (6.6).

**6.2 Resources Phase**: Sabotage, Degrade Trail, ARVN Earnings (Aid + Econ), Insurgent Earnings, Casualties/Aid adjustment.

**6.3 Support Phase**: Pacification (US/ARVN, up to 4 spaces combined), Agitation (VC, up to 4 spaces).

**6.6 Reset Phase**: Trail adjustment (0->1, 4->3), remove Terror/Sabotage, flip Underground, discard Momentum, all Eligible.

**6.7 The Trail**: Value 0-4, affects NVA Rally, March, Infiltration, Earnings.

### 7.0 VICTORY

**7.1** Non-player victory = all players lose. Highest margin wins. Ties: Non-players > VC > ARVN > NVA.

**7.2 During Coup Rounds**: US > 50 (Support + Available), NVA > 18 (NVA Control Pop + Bases), ARVN > 50 (COIN Control Pop + Patronage), VC > 35 (Opposition + Bases).

**7.3 After Final Coup**: Highest victory margin wins. Margin = score - threshold.

### Key Terms Index

Accompanying (4.1.1), Activate (1.4.3), Active (1.4.3), Adjacent (1.3.6), Advise (4.2.1), Agitation (6.3.2), Aid (1.8), Air Lift (4.2.2), Air Strike (4.2.3), Ambush (4.4.3/4.5.3), ARVN (1.0/1.5), Attack (3.3.3), Assault (3.2.4), Available (1.4.1), Base (1.4), Bases Last (3.2.4/3.3.3), Cambodia (1.3.5), Campaign (2.4.2), Capabilities (5.3), Casualties (3.3.3), City (1.3.3), COIN (1.0/1.5), Commitment (6.5), Control (1.7), Cost (3.1), Coup (2.4/6.0), Cube (1.4), Cylinder (1.8/2.2), Deception (7.3), Degrade (4.2.3/6.7), Dual Use (5.2), Earnings (6.2), Economic Value (1.3.4), Eligible (2.3), Enemy (1.5), Event (2.3/5.0), Execute (2.3), Faction (1.5), Faction Order (2.3.2), Final (2.4.2/7.3), Flip (1.4.3), Forces (1.4), Free (3.1.2/5.5), Friendly (1.5), Govern (4.3.1), Guerrilla (1.4), Halo (8.4.1), Handicap (7.3), Highland (1.3.2), Highway (1.3.1/1.3.4), Improve (3.3.1/6.7), Ineligible (2.3.1), Infiltrate (4.4.1), Insurgent (1.0/1.5), Irregular (1.4), Joint Operations (1.8.1), Laos (1.3.5), Level (1.6.1), Limited Operation (2.3.5), LoC (1.3.4), Lowland (1.3.2), Map (1.3), March (3.3.2), Mekong (1.3.1/1.3.4), Momentum (5.4), Monsoon (2.3.9), Non-Player (1.5/8.0), Neutral (1.6.1), North Vietnam (1.0/1.3.5), NVA (1.0/1.5), Operation (3.0), Opposition (1.6), Out of Play, Overflow (1.3.8), Pacification (3.2.1/6.3.1), Pass (2.3.3), Patrol (3.2.2), Patronage (1.8), Pawn (3.1.1), Phase (6.0), Piece (1.4), Place (1.4.1), Period Events (2.1), Pivotal Event (2.3.8), Police (1.4), Politburo (1.5), Population (1.3.2), Province (1.3.2), Rally (3.3.1), Ranger (1.4), Redeploy (6.4), Remove (1.4.1), Replace (1.4.1), Reset (6.6), Resources (1.8), RVN Leader (2.4.1), Sabotage (3.3.4), Select (3.1), Set (1.6.1), Shaded (5.2), Shift (1.6.1/6.7), South Vietnam (1.3.5), Sovereignty (1.5), Space (1.3.1), Special Activities (4.0), Special Forces (1.4), Stacking (1.4.2), Subvert (4.5.2), Support (1.6), Sweep (3.2.3), Target (3.1/4.1), Tax (4.5.1), Terror (3.3.4), Total Econ (1.8.1/6.2.3), Total Support/Opposition (1.6.2/7.2), Town (1.3.6), Trail (6.7), Train (3.2.1), Transfer (1.5.2), Transport (4.3.2), Troops (1.4), Tunnel (1.4.4), Uncontrolled (1.7), Underground (1.4.3), United States (1.0/1.5), Unshaded (5.2), Victory Margin (7.3), Viet Cong (1.0/1.5), Withdraw (6.5).

</details>

---

## Goals

1. Create the full GameSpecDoc for Fire in the Lake, with all game specifications that will compile to GameDef and run in the simulation as expected.
2. Create one or more e2e tests (`test/e2e/`) that prove the Fire in the Lake Tutorial plays out in our simulation exactly as indicated in the playthrough. A single turn isn't enough for full verification; the 13-card tutorial mini-campaign is the target.
3. Follow the phased plan (Section 6) to incrementally build toward the full 130-card game.
