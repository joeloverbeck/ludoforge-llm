# Spec 29: FITL Event Card Encoding

**Status**: Draft
**Priority**: P1
**Complexity**: XL
**Dependencies**: Spec 26 (operations), Spec 27 (SAs), Spec 28 (capabilities + momentum)
**Estimated effort**: 8–12 days
**Source sections**: Brainstorming Sections 4.1, 5.4, 8 (Event Card Catalog), 12 (Card Definitions)

## Overview

Encode all 130 event cards with phased delivery, expanding from the existing 3 cards (Domino Theory, Phoenix Program, Green Berets) to the full deck. This is the largest spec by volume — 130 cards, each with dual-use effects, faction order, and references to capabilities, momentum, and free operations.

## Scope

### In Scope

- **130 event cards**: All cards in the FITL deck, organized by encoding phase
- **Dual-use cards** (Rule 5.2): Unshaded (pro-COIN) and shaded (pro-Insurgent) effects
- **Capabilities** (Rule 5.3): Cards that grant persistent capabilities (reference Spec 28 var IDs)
- **Momentum** (Rule 5.4): Cards that grant coup-scoped momentum markers (reference Spec 28 momentum IDs)
- **Free Operations** (Rule 5.5): Cards that grant free operations/SAs
- **Coup cards** (6): Including RVN Leader changes
- **Pivotal Events** (4): Faction-specific trump cards
- **Card metadata**: Number, title, period, faction order, flavor text

### Out of Scope

- Turn flow card management (already implemented in foundation)
- Capability/momentum effect implementation (Spec 28)
- Event card resolution engine (already exists)
- Deck shuffling (turn flow handles this)

## Phased Delivery Schedule

### Phase 1: Tutorial Cards (13 cards)

The 13-card tutorial mini-deck. Must be encoded first for E2E validation (Spec 31).

| # | Title | Status | Complexity | Notes |
|---|---|---|---|---|
| 107 | Burning Bonze | todo | Low | Patronage/Support shift, Aid reduction |
| 55 | Trucks | todo | Medium | Trail + piece movement across Laos/Cambodia |
| 68 | Green Berets | done | Low | Place Irregulars/Rangers, set Support |
| 1 | Gulf of Tonkin | todo | High | US escalation event, multiple effects |
| 97 | Brinks Hotel | todo | Medium | Military/political crisis |
| 79 | Henry Cabot Lodge | todo | Medium | Political influence |
| 101 | Booby Traps | todo | Medium | Capability card (affects Ambush/Sweep) |
| 125 | Coup! — Nguyen Khanh | todo | Medium | Coup card with RVN Leader change |
| 75 | Sihanouk | todo | Medium | Cambodia relations |
| 17 | Claymores | todo | Medium | Momentum: prohibits Ambush |
| 51 | 301st Supply Bn | todo | Medium | NVA logistics |
| 43 | Economic Aid | todo | Low | Aid increase |
| 112 | Colonel Chau | todo | Medium | Intelligence operations |

**Deliverable**: Expand `test/fixtures/cnl/compiler/fitl-events-initial-card-pack.md` or create `fitl-events-tutorial.md`.

### Phase 2: Remaining 1964 Period (11 cards)

Complete the period-1964 set (24 cards total including tutorial cards). Cards not in the tutorial deck that belong to the 1964 period.

### Phase 3: 1965 Period (48 cards)

All period-1965 event cards. This is the bulk of the Short scenario deck.

### Phase 4: 1968 Period (48 cards)

All period-1968 event cards. This completes the Medium and Full scenario decks.

### Phase 5: Special Cards (10 cards)

| Type | Count | Cards |
|---|---|---|
| Coup | 6 | Nguyen Khanh (#125), + 5 others (#126–130) |
| Pivotal | 4 | US Pivotal, ARVN Pivotal, NVA Pivotal, VC Pivotal (Tet Offensive) |

Coup cards trigger coup rounds and may change RVN Leader. Pivotal events are faction-specific cards with pre-conditions and trumping chain (VC Tet Offensive trumps all others).

## Card Definition Format

Each card encoded as `EventCardDef` in the GameSpecDoc YAML:

```yaml
eventCards:
  - id: "107"
    title: "Burning Bonze"
    period: "1964"
    factionOrder: ["VC", "NVA", "ARVN", "US"]
    flavorText: "Gruesome protests close elite ranks."
    sideMode: "dual"
    unshaded:
      text: "Patronage +3 or, if Saigon at Active Support, +6"
      effects:
        - if:
            when: { op: "==", left: { markerState: { space: "Saigon", marker: "supportOpposition" } }, right: "activeSupport" }
            then:
              - { addVar: { scope: "global", var: "patronage", delta: 6 } }
            else:
              - { addVar: { scope: "global", var: "patronage", delta: 3 } }
    shaded:
      text: "Anti-regime self-immolation: Shift Saigon 1 level toward Active Opposition. Aid -12."
      effects:
        - { shiftMarker: { space: "Saigon", marker: "supportOpposition", direction: "toward", target: "activeOpposition", steps: 1 } }
        - { addVar: { scope: "global", var: "aid", delta: -12 } }
```

## Implementation Tasks

### Task 29.1: Tutorial Card Encoding (Phase 1)

Encode the 13 tutorial cards with complete effects. Card definitions for 3 tutorial cards are provided in brainstorming Section 12. Remaining 10 tutorial cards need effects derived from rulebook text.

Priority order for encoding:
1. Burning Bonze (#107) — Turn 1 card, needed for first E2E test
2. Trucks (#55) — Turn 2 card
3. Gulf of Tonkin (#1) — Turn 4 card, high complexity
4. Coup #125 (Nguyen Khanh) — Turn 8 coup card
5. Remaining tutorial cards in deck order

### Task 29.2: 1964 Period Encoding (Phase 2)

Encode remaining 11 period-1964 cards. These complete the first historical period.

### Task 29.3: 1965 Period Encoding (Phase 3)

Encode all 48 period-1965 cards. This is the largest single batch. Consider sub-batching by complexity:
- Low complexity (simple resource/marker changes): ~15 cards
- Medium complexity (piece movement, conditional effects): ~25 cards
- High complexity (multi-step, capability/momentum grants): ~8 cards

### Task 29.4: 1968 Period Encoding (Phase 4)

Encode all 48 period-1968 cards. Same sub-batching strategy as Phase 3.

### Task 29.5: Coup Card Encoding (Phase 5a)

Encode 6 coup cards with:
- RVN Leader changes (which leader takes power)
- Leader-specific effects during coup round
- Coup round trigger

### Task 29.6: Pivotal Event Encoding (Phase 5b)

Encode 4 pivotal events with:
- Pre-conditions for play (faction-specific)
- Trumping chain (VC Tet Offensive > NVA > ARVN > US)
- Effects that cancel current Event card

### Task 29.7: Capability-Granting Card Validation

For each card that grants a capability: verify the `setVar` effect targets the correct capability variable ID from Spec 28 (Task 28.1). Cards should set the capability to the correct side (unshaded/shaded).

### Task 29.8: Momentum-Granting Card Validation

For each card that grants momentum: verify the `EventCardLastingEffectDef` uses `duration: 'coup'` and targets the correct momentum ID from Spec 28 (Task 28.3).

## Open Questions

### Open Question #3: Event Card Expressiveness Ceiling

**Risk**: Some of the 130 event cards may have effects too complex for the existing `EffectAST`. Budget for 5–10% of cards needing:
- New kernel primitives (e.g., "choose opponent's pieces to remove")
- Escape hatches (custom effect handlers)
- Extended condition/effect AST nodes

**Mitigation**: During encoding, flag cards whose effects don't fit existing primitives. Batch needed kernel extensions and implement them before encoding the flagged cards.

**Tracking**: Maintain a "needs new primitive" list during encoding. Review after each phase.

## Testing Requirements

### Per-Phase Tests
- Each card: compile without errors
- Each card: dual-use sides produce expected state changes for known inputs
- Capability cards: verify capability var set to true
- Momentum cards: verify lasting effect created with correct duration
- Coup cards: verify RVN Leader change
- Pivotal events: verify trumping chain and pre-conditions

### Batch Validation
- All cards in a phase compile as a set
- Card IDs unique across all phases
- All faction orders valid (4 factions, each appearing once)
- All card references (capabilities, momentum, spaces, pieces) resolve correctly

### Golden Tests
- Tutorial deck (13 cards): compile to expected GameDef JSON
- Full deck (130 cards): compile without errors

## Acceptance Criteria

1. All 130 event cards encoded and validated
2. Dual-use cards have both unshaded and shaded effects
3. Capability-granting cards reference correct capability var IDs
4. Momentum-granting cards use correct duration and momentum IDs
5. Coup cards trigger coup rounds and change RVN Leader
6. Pivotal events respect trumping chain
7. Cards needing new kernel primitives are documented (Open Question #3 tracking list)
8. Build passes (`npm run build`)
9. All existing tests pass (`npm test`)

## Files

### Create/Modify
- Expand: `test/fixtures/cnl/compiler/fitl-events-initial-card-pack.md` (tutorial cards)
- New: `test/fixtures/cnl/compiler/fitl-events-1964.md` (remaining 1964)
- New: `test/fixtures/cnl/compiler/fitl-events-1965.md` (1965 period)
- New: `test/fixtures/cnl/compiler/fitl-events-1968.md` (1968 period)
- New: `test/fixtures/cnl/compiler/fitl-events-coup-pivotal.md` (coup + pivotal)
- New tests per card batch


## Specific cards

Period Event (Set Up Option): 1964
Faction Order: US, NVA, ARVN, VC
Card Number: 1
Title: Gulf of Tonkin
Italized Flavor Text: "Incident and resolution."
Event Text: "US free Air Strikes, then moves 6 US pieces from out-of-play to any Cities."
Lasting Effects Indicator (5.3): None.
Shaded Text (see Dual Use 5.2): "Congressional regrets: Aid -1 per Casualty. All Casualties out of play."

Period Event (Set Up Option): 1968
Faction Order: US, NVA, ARVN, US
Card Number: 2
Title: Kissinger
Italized Flavor Text: "Operation Menu."
Event Text: "remove a die roll of Insurgent pieces total from Cambodia and Laos."
Lasting Effects Indicator (5.3): None.
Shaded Text (see Dual Use 5.2): "'Secret bombing' revealed: NVA places 2 pieces in Cambodia. US moves any 2 US Troops to out of play. Aid -6."

Period Event (Set Up Option): 1968
Faction Order: US, NVA, ARVN, VC
Card Number: 3
Title: Peace Talks
Italized Flavor Text: "Haiphong mined."
Event Text: "NVA Resources -9. Linebacker 11 allowed when Support + Available > 25 (mark)."
Lasting Effects Indicator (5.3): None.
Shaded Text (see Dual Use 5.2): "Bombing halt: NVA Resources +9. If Trail 0-2, Improve to 3."

Period Event (Set Up Option): 1968
Faction Order: US, NVA, ARVN, VC
Card Number: 4
Title: Top Gun
Italized Flavor Text: "Air combat maneuver."
Event Text: "Cancel shaded MiGs. Air Strikes Degrade Trail 2 boxes.
Lasting Effects Indicator (5.3): US CAPABILITY
Shaded Text (see Dual Use 5.2): "Mediocre tactics: Air Strike Degrades Trail after applying 2 hits only on die roll of 4-6."

Period Event (Set Up Option): 1965
Faction Order: US, NVA, ARVN, VC
Card Number: 5
Title: Wild Weasels
Italized Flavor Text: "Air defense suppression."
Event Text: "Remove shaded SA-2s or, if no shaded SA-2s, Degrade Trail 2 boxes and NVA Resources -9."
Lasting Effects Indicator (5.3): None.
Shaded Text (see Dual Use 5.2): "Complex strike packages: Until Coup, Air Strike either Degrades Trail or may remove just 1 piece (not 1-6). MOMENTUM"

Period Event (Set Up Option): 1965
Faction Order: US, NVA, VC, ARVN
Card Number: 6
Title: Aces
Italized Flavor Text: "Robin Olds ambushes MiGs."
Event Text: "Free Air Strike any 1 space outside the South with 6 hits and Degrade Trail 2 boxes."
Lasting Effects Indicator (5.3): None.
Shaded Text (see Dual Use 5.2): "MiG ace 'Colonel Tomb': 2 Available US Troops to Casualties. Improve Trail by 2 boxes."

Period Event (Set Up Option): 1965
Faction Order: US, NVA, VC, ARVN
Card Number: 7
Title: ADSID
Italized Flavor Text: "Air-delivered seismic intrusion detector."
Event Text: "Through Coup, -6 NVA Resources at any Trail# change. MOMENTUM"
Lasting Effects Indicator (5.3): None.
Shaded Text (see Dual Use 5.2): "Dubious technology: Improve Trail by 1 box and to a minimum of 2. ARVN Resources -9."

Period Event (Set Up Option): 1965
Faction Order: US, NVA, VC, ARVN
Card Number: 8
Title: Arc Light
Italized Flavor Text: "Guided B-52 tactical bombing."
Event Text: "1 space each Air Strike may be a Province without COIN pieces."
Lasting Effects Indicator (5.3): US CAPABILITY
Shaded Text (see Dual Use 5.2): "Moonscape: Air Strike spaces removing >1 piece shift 2 levels toward Active Opposition."

Period Event (Set Up Option): 1968
Faction Order: US, NVA, VC, ARVN
Card Number: 9
Title: Psychedelic Cookie
Italized Flavor Text: "9th Division."
Event Text: "US moves up to 3 US Troops from out of play to Available or South Vietnam, or from the map to Available."
Lasting Effects Indicator (5.3): None.
Shaded Text (see Dual Use 5.2): "Worn out formation. US takes 3 of its Troops from the map out of play."

Period Event (Set Up Option): 1965
Faction Order: US, NVA, VC, ARVN
Card Number: 10
Title: Rolling Thunder
Italized Flavor Text: "Sustained bombing."
Event Text: "Degrade Trail 2 boxes. -9 NVA Resources. NVA Ineligible through next card."
Lasting Effects Indicator (5.3): None.
Shaded Text (see Dual Use 5.2): "Assets to restricted strategic air campaign: -5 ARVN Resources. No Air Strike until Coup. MOMENTUM"

Period Event (Set Up Option): 1968
Faction Order: US, ARVN, NVA, VC
Card Number: 11
Title: Abrams
Italized Flavor Text: "Counter-logistics."
Event Text: "1 US Assault space may remove 1 enemy non-Tunnel Base first not last."
Lasting Effects Indicator (5.3): US CAPABILITY
Shaded Text (see Dual Use 5.2): "No more big-unit war: US may select max 2 spaces per Assault."

Period Event (Set Up Option): 1968
Faction Order: US, ARVN, NVA, VC
Card Number: 12
Title: Capt Buck Adams
Italized Flavor Text: "Strategic reconnaissance."
Event Text: "Outside the South, flip all Insurgents Active and remove 1 NVA Base."
Lasting Effects Indicator (5.3): None.
Shaded Text (see Dual Use 5.2): "SR-71 pilot must outrun SA-2s. Place 1 NVA Base at NVA Control outside the South and flip any 3 NVA Guerrillas Underground."

Period Event (Set Up Option): 1968
Faction Order: US, ARVN, NVA, VC
Card Number: 13
Title: Cobras
Italized Flavor Text: "Gunships."
Event Text: "2 US/ARVN Sweep spaces each remove 1 Active unTunneled enemy (Troops first, Bases last)."
Lasting Effects Indicator (5.3): US CAPABILITY
Shaded Text (see Dual Use 5.2): "Close air support losses: Each US Assault space, 1 US Troop to Casualties on a die roll of 1-3."

Period Event (Set Up Option): 1965
Faction Order: US, ARVN, NVA, VC
Card Number: 14
Title: M-48 Patton
Italized Flavor Text: "Armored Punch."
Event Text: "2 non-Lowland US Assault spaces each remove 2 extra enemy pieces."
Lasting Effects Indicator (5.3): US CAPABILITIES
Shaded Text (see Dual Use 5.2): "RPGs: After US/ARVN Patrol, NVA removes up to 2 cubes that moved (US to Casualties)."

Period Event (Set Up Option): 1964
Faction Order: US, ARVN, NVA, VC
Card Number: 15
Title: Medevac
Italized Flavor Text: "Dustoff."
Event Text: "This Commitment, all Troop Casualties Available (mark). MOMENTUM"
Lasting Effects Indicator (5.3): None.
Shaded Text (see Dual Use 5.2): "Hueys diverted: Executing Faction remains Eligible. Until Coup, no Air Lift (mark). MOMENTUM

Period Event (Set Up Option): 1968
Faction Order: US, ARVN, VC, NVA
Card Number: 16
Title: Blowtorch Komer
Italized Flavor Text: "Pacification czar."
Event Text: "Aid +10. This Support phase, Pacify costs 1 Resource per step or Terror. MOMENTUM"
Lasting Effects Indicator (5.3): None.
Shaded Text (see Dual Use 5.2): "Brusque manager: Aid -10. Shift a space with Troops and Police 1 level toward Active Opposition."

Period Event (Set Up Option): 1964
Faction Order: US, ARVN, VC, NVA
Card Number: 17
Title: Claymores
Italized Flavor Text: "Perimeter."
Event Text: "Stay Eligible. Until Coup, no Ambush; remove 1 Guerrilla each Marching group that Activates. MOMENTUM"
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Infiltrators turn mines around: Remove 1 COIN Base and 1 Underground Insurgent from a space with both (US to Casualties)"

Period Event (Set Up Option): 1965
Faction Order: US, ARVN, VC, NVA
Card Number: 18
Title: Combined Action Platoons
Italized Flavor Text: "Hamlet defense."
Event Text: "US Training places or relocates an added Police into any 1 space with US Troops."
Lasting Effects Indicator (5.3): US CAPABILITY
Shaded Text (see Dual Use 5.2): "Passive posture: US may select max 2 spaces per Sweep."

Period Event (Set Up Option): 1968
Faction Order: US, ARVN, VC, NVA
Card Number: 19
Title: CORDS
Italized Flavor Text: "Civil Operations and Revolutionary Development Support."
Event Text: "US Training may Pacify in 2 selected spaces."
Lasting Effects Indicator (5.3): US CAPABILITY
Shaded Text (see Dual Use 5.2): "Civilian programs subordinated to military: US Training may Pacify only to Passive Support."

Period Event (Set Up Option): 1968
Faction Order: US, ARVN, VC, NVA
Card Number: 20
Title: Laser Guided Bombs
Italized Flavor Text: "Dawn of precision strike."
Event Text: "Air Strike does not shift Support/Opposition in spaces where only 1 piece removed."
Lasting Effects Indicator (5.3): US CAPABILITY
Shaded Text (see Dual Use 5.2): "Camouflage: Air Strike removes no more than 2 pieces."

Period Event (Set Up Option): 1968
Faction Order: US, VC, NVA, ARVN
Card Number: 21
Title: Americal
Italized Flavor Text: "23rd Division."
Event Text: "US moves up to 2 US Troops each from the map and out of play to any 1 space or Available."
Lasting Effects Indicator (5.3): None.
Shaded Text (see Dual Use 5.2): "US divisions 'clean out' NLF: In 1 or 2 Provinces with US Troops, remove 1 VC piece to set to Active Opposition."

Period Event (Set Up Option): 1965
Faction Order: US, VC, NVA, ARVN
Card Number: 22
Title: Da Nang
Italized Flavor Text: "US Marines arrive"
Event Text: "US places up to 6 Troops in Da Nang, up to 3 from out of play."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "VC fire closes air base: Remove all Support within 1 space of Da Nang. No Air Strike until Coup. MOMENTUM"

Period Event (Set Up Option): 1965
Faction Order: US, VC, NVA, ARVN
Card Number: 23
Title: Operation Attleboro
Italized Flavor Text: "Stab at Iron Triangle."
Event Text: "US free Air Lifts into, Sweeps in, then Assaults a space with a Tunnel, removing Tunneled Bases as if no Tunnel."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Heavy casualties, few results: Select a Tunnel space: remove a die roll of US Troops within 1 space of it to Casualties."

Period Event (Set Up Option): 1965
Faction Order: US, VC, NVA, ARVN
Card Number: 24
Title: Operation Starlite
Italized Flavor Text: "VC caught off guard."
Event Text: "Remove all VC from a coastal Province with or adjacent to US Troops."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Slipped away: In up to 3 Provinces, flip all VC Guerrillas Underground. Stay Eligible."

Period Event (Set Up Option): 1965
Faction Order: US, VC, NVA, ARVN
Card Number: 25
Title: TF-116 Riverines
Italized Flavor Text: "Delta boats."
Event Text: "Remove all NVA/VC from Mekong LoCs. US or ARVN free Sweep into/in then free Assault each Lowland touching Mekong."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "VC river fortifications: Place 2 VC Guerrillas per Mekong LoC space, then Sabotage each that has more VC than COIN."

Period Event (Set Up Option): 1964
Faction Order: US, VC, ARVN, NVA
Card Number: 26
Title: LRRP
Italized Flavor Text: "Long Range Recon Patrol."
Event Text: "US places 3 Irregulars outside the South then free Air Strikes."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Patrols ambushed: 3 Irregulars map to Casualties. Shift each space they were in 1 level toward Active Opposition."

Period Event (Set Up Option): 1968
Faction Order: US, VC, ARVN, NVA
Card Number: 27
Title: Phoenix Program
Italized Flavor Text: "Cadres assassinated."
Event Text: "Remove any 3 VC pieces total from any COIN Control spaces."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Misdirected: Add a Terror marker to any 2 spaces outside Saigon with COIN Control and VC. Set them to Active Opposition."

Period Event (Set Up Option): 1965
Faction Order: US, VC, ARVN, NVA
Card Number: 28
Title: Search and Destroy
Italized Flavor Text: "Mobile counter-guerrilla ops."
Event Text: "Each US Assault space may remove 1 Underground Guerrilla."
Lasting Effects Indicator (5.3): US CAPABILITY
Shaded Text (see Dual Use 5.2): "Villagers in the crossfire: Each US and ARVN Assault Province shifts by 1 level toward Active Opposition."

Period Event (Set Up Option): 1964
Faction Order: US, VC, ARVN, NVA
Card Number: 29
Title: Tribesmen
Italized Flavor Text: "Minority fighters."
Event Text: "Remove any 4 Insurgent pieces total from spaces with Irregulars."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "tribal secession: Replace all Irregulars with VC Guerrillas. 1 Neutral Highland to Active Opposition. -3 Patronage."

Period Event (Set Up Option): 1968
Faction Order: US, VC, ARVN, NVA
Card Number: 30
Title: USS New Jersey
Italized Flavor Text: "Fire support."
Event Text: "US or ARVN free Air Strikes any 1-3 coastal spaces, removing up to 2 pieces per space (no die roll and no effect on Trail)."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Frightening free fire: Shift 2 coastal Provinces with US Troops each 2 levels toward Active Opposition."

Period Event (Set Up Option): 1964
Faction Order: NVA, US, ARVN, VC
Card Number: 31
Title: AAA
Italized Flavor Text: "Assets to protection from close air attack."
Event Text: "Rally that Improves Trail may select 1 space only."
Lasting Effects Indicator (5.3): NVA Capability
Shaded Text (see Dual Use 5.2): "Point air defense of logistic hubs: Air Strike does not Degrade Trail below 2."

Period Event (Set Up Option): 1968
Faction Order: NVA, US, ARVN, VC
Card Number: 32
Title: Long Range Guns
Italized Flavor Text: "US M-107 175mm counterbattery."
Event Text: "NVA Bombard max 1 space."
Lasting Effects Indicator (5.3): NVA CAPABILITY
Shaded Text (see Dual Use 5.2): "Soviet M-46 130mm artillery: NVA Bombard max 3 spaces."

Period Event (Set Up Option): 1968
Faction Order: NVA, US, ARVN, VC
Card Number: 33
Title: MiGs
Italized Flavor Text: "Expensive interceptors."
Event Text: "NVA Resources -6 each Reset."
Lasting Effects Indicator (5.3): NVA CAPABILITIES
Shaded Text (see Dual Use 5.2): "High US loss ratio: Unless unshaded Top Gun, whenever Air Strike Degrades Trail, US removes 1 Available Troop to Casualties."

Period Event (Set Up Option): 1965
Faction Order: NVA, US, ARVN, VC
Card Number: 34
Title: SA-2s
Italized Flavor Text: "Fiddly Soviet gear."
Event Text: "When Air Strike Degrades Trail, US removes 1 NVA piece outside the South."
Lasting Effects Indicator (5.3): NVA CAPABILITY
Shaded Text (see Dual Use 5.2): "SAMs guard infrsatructure: NVA Rally Improves Trail 2 boxes not 1 (unshaded Wild Weasels remove)"

Period Event (Set Up Option): 1968
Faction Order: NVA, US, ARVN, VC
Card Number: 35
Title: Thanh Hoa
Italized Flavor Text: "Bridge busters."
Event Text: "Degrade the Trail by 3 boxes."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Stubborn targets: Improve Trail by 1 box. Then add three times Trail value to NVA Resources."

Period Event (Set Up Option): 1968
Faction Order: NVA, US, VC, ARVN
Card Number: 36
Title: Hamburger Hill
Italized Flavor Text: "A Shau Valley campaign."
Event Text: "Move 4 US Troops from any spaces to a Highland. Remove 1 NVA or VC Base there, even if Tunneled."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Prepared defenses: Place a Tunnel on an NVA or VC Highland Base. 3 US Troops there to Casualties."

Period Event (Set Up Option): 1968
Faction Order: NVA, US, VC, ARVN
Card Number: 37
Title: Khe Sanh
Italized Flavor Text: "Northern casualties."
Event Text: "Select a US Base with US Troops. Remove 10 NVA Troops within 1 space of it."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "US Marines pinned: Up to 3 US Troops in 1 space with NVA to Casualties. US Ineligible through next card."

Period Event (Set Up Option): 1965
Faction Order: NVA, US, VC, ARVN
Card Number: 38
Title: McNamara Line
Italized Flavor Text: "Fortification mentality."
Event Text: "Redeploy all COIN forces outside Vietnam to COIN-Controlled Cities. ARVN Resources -12. No Infiltrate or Trail Improvement by Rally until Coup. MOMENTUM"
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): None

Period Event (Set Up Option): 1965
Faction Order: NVA, US, VC, ARVN
Card Number: 39
Title: Oriskany
Italized Flavor Text: "'Alpha' strikes on North Vietnam."
Event Text: "Remove any 4 pieces from North Vietnam or, once none, Laos. Degrade Trail 2 boxes."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Explosion on CV-34: 1 Available US Troop out of play. Through next Coup, no Degrade of Trail. MOMENTUM"

Period Event (Set Up Option): 1968
Faction Order: NVA, US, VC, ARVN
Card Number: 40
Title: PoWs
Italized Flavor Text: "Release negotiations keep US at war."
Event Text: "Free Air Strike. 2 US Troops from Casualties to Available."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Air campaign creates hostages. 3 US Troops from Available to Casualties."

Period Event (Set Up Option): 1968
Faction Order: NVA, ARVN, US, VC
Card Number: 41
Title: Bombing Pause
Italized Flavor Text: "Tet holiday gesture."
Event Text: "Set any two spaces to Passive Support. Patronage +2. No Air Strike until Coup. MOMENTUM"
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): None

Period Event (Set Up Option):
Faction Order:
Card Number:
Title:
Italized Flavor Text:
Event Text:
Lasting Effects Indicator (5.3):
Shaded Text (see Dual Use 5.2):