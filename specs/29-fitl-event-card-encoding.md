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

Period Event (Set Up Option): 1968
Faction Order: NVA, ARVN, US, VC
Card Number: 42
Title: Chou En Lai
Italized Flavor Text: "Chinese opening to US."
Event Text: "NVA Resources -10. NVA must remove a die roll in Troops."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Chinese boost aid to North: NVA add +10 Resources. VC add Trail value in Resources."

Period Event (Set Up Option): 1964
Faction Order: NVA, ARVN, US, VC
Card Number: 43
Title: Economic Aid
Italized Flavor Text: "Free World aids Saigon."
Event Text: "2 ARVN or 2 US Bases out-of-play to Available. Then ARVN Resources +6 or Aid +12"
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Moscow aids Hanoi: Improve the Trail 1 box. Then either Improve it 1 more box or add +10 NVA Resources."

Period Event (Set Up Option): 1965
Faction Order: NVA, ARVN, US, VC
Card Number: 44
Title: Ia Drang
Italized Flavor Text: "Silver Bayonet."
Event Text: "US free Air Lifts into 1 space with any NVA piece, then fere Sweeps and Assaults there."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Dong Xuan campaign-hot LZs: Select a Province with NVA Troops then remove a die roll of US Troops within 1 space of it to Casualties."

Period Event (Set Up Option): 1968
Faction Order: NVA, ARVN, US, VC
Card Number: 45
Title: PT-76
Italized Flavor Text: "Light armor target."
Event Text: "Each NVA Attack space, first remove 1 NVA Troop cube."
Lasting Effects Indicator (5.3): NVA CAPABILITY
Shaded Text (see Dual Use 5.2): "Communist armored assault: NVA Attack in 1 space removes 1 enemy per Troop."

Period Event (Set Up Option): 1965
Faction Order: NVA, ARVN, VC, US
Card Number: 46
Title: 559th Transport Grp
Italized Flavor Text: "Tough terrain."
Event Text: "Degrade the Trail by 2 boxes. Until Coup, Infiltrate is max 1 space. MOMENTUM"
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "The way through: NVA free Infiltrate. Then NVA add 3 times and VC 2 times Trail value in Resources."

Period Event (Set Up Option): 1965
Faction Order: NVA, ARVN, VC, US
Card Number: 47
Title: Chu Luc
Italized Flavor Text: "Southerners resist invasion."
Event Text: "Add ARVN Troops to double the ARVN pieces in a space with NVA. All ARVN free Assault NVA."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "NVA professional soldiers: Place up to 10 NVA Troops anywhere within 1 space of North Vietnam."

Period Event (Set Up Option): 1964
Faction Order: NVA, ARVN, VC, US
Card Number: 48
Title: Nam Dong
Italized Flavor Text: "CIDG camp holds out."
Event Text: "Remove up to 3 Guerrillas from a Province with a COIN Base."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Camp overrun: Remove a COIN Base from a Province with 0-2 COIN cubes (US to Casualties) and set it to Active Opposition."

Period Event (Set Up Option): 1968
Faction Order: NVA, ARVN, VC, US
Card Number: 49
Title: Russian Arms
Italized Flavor Text: "Soviet escalation matched."
Event Text: "Place any 6 ARVN pieces anywhere in South Vietnam."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Heavy divisions, big guns: NVA in any 3 spaces places enough Troops to double their number. It then free Bombards."

Period Event (Set Up Option): 1964
Faction Order: NVA, ARVN, VC, US
Card Number: 50
Title: Uncle Ho
Italized Flavor Text: "Known communist."
Event Text: "4 out-of-play US Troops to South Vietnam, or ARVN Resources +9. ARVN executes any 2 free Limited Operations."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Revolutionary unifier: VC then NVA each execute 3 free Limited Operations."

Period Event (Set Up Option): 1964
Faction Order: NVA, VC, US, ARVN
Card Number: 51
Title: 301st Supply Bn
Italized Flavor Text: "Combat units diverted to logistics."
Event Text: "Remove 6 non-Base Insurgent pieces from outside South Vietnam."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Trail construction unit: Improve Trail by 2 boxes and add a die roll of NVA Resources."

Period Event (Set Up Option): 1968
Faction Order: NVA, VC, US, ARVN
Card Number: 52
Title: RAND
Italized Flavor Text: "Whiz-kid corporation."
Event Text: "Flip 1 shaded US Capability to unshaded."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Systems analysis ignorant of local conditions: Flip 1 unshaded US Capability to shaded."

Period Event (Set Up Option): 1965
Faction Order: NVA, VC, US, ARVN
Card Number: 53
Title: Sappers
Italized Flavor Text: "Ineffective tactics"
Event Text: "Remove 2 NVA Troops each from up to 3 spaces in South Vietnam. Remain Eligible."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Facilities damaged: Remove up to 1 US and 2 ARVN Bases from any Provinces (US to Casualties)"

Period Event (Set Up Option): 1968
Faction Order: NVA, VC, US, ARVN
Card Number: 54
Title: Son Tay
Italized Flavor Text: "Daring rescue."
Event Text: "2 Troop Casualties to Available. NVA Ineligible through next card. US Eligible."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "No prisoners there: Any 2 Casualties out of play. US Ineligible through next card."

Period Event (Set Up Option): 1964
Faction Order: NVA, VC, US, ARVN
Card Number: 55
Title: Trucks
Italized Flavor Text: "Bottlenecks."
Event Text: "Degrade Trail 2 boxes. NVA selects and removes 4 of its pieces each from Laos and Cambodia."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Convoys: Add twice Trail value to each NVA and VC Resources. NVA moves its unTunneled Bases anywhere within Laos/Cambodia."

Period Event (Set Up Option): 1965
Faction Order: NVA, VC, ARVN, US
Card Number: 56
Title: Vo Nguyen Giap
Italized Flavor Text: "Premature conventional buildup."
Event Text: "In each of any 3 spaces, replace any 2 Guerrillas with 1 NVA Troop."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Military strategist: NVA free Marches into up to 3 spaces then executes any 1 free Op or Special Activity within each, if desired."

Period Event (Set Up Option): 1968
Faction Order: NVA, VC, ARVN, US
Card Number: 57
Title: International Unrest
Italized Flavor Text: "Protests ignored."
Event Text: "Any 2 US Casualties to Available."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "US accused of neocolonialist war: 2 Available US Troops out of play. NVA add a die roll of Resources."

Period Event (Set Up Option): 1968
Faction Order: NVA, VC, ARVN, US
Card Number: 58
Title: Pathet Lao
Italized Flavor Text: "Drive on Vientiane."
Event Text: "NVA removes 6 of its pieces total from North Vietnam and Laos."
Lasting Effects Indicator (5.3): None. 
Shaded Text (see Dual Use 5.2): "Trail security: if no COIN cubes in Laos, Improve Trail 2 boxes. If there are, US and ARVN Redeploy them to Vietnam."

Period Event (Set Up Option): 1965
Faction Order: NVA, VC, ARVN, US
Card Number: 59
Title: Plei Mei
Italized Flavor Text: "CIDG interdict NVA."
Event Text: "Remove any 3 NVA pieces from a space with or adjacent to a COIN Base."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Tay Nguyen offensive: NVA free March from any spaces outside South Vietnam, then free Attack or Ambush any 1 space."

Period Event (Set Up Option): 1968
Faction Order: NVA, VC, ARVN, US
Card Number: 60
Title: War Photographer
Italized Flavor Text: "Pulitzer photo inspires."
Event Text: "3 out of play US pieces to Available."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Photos galvanize home front: NVA place 6 Troops outside South Vietnam, add +6 Resources, and, if executing, stay Eligible."

Period Event (Set Up Option): 1968
Faction Order: ARVN, US, NVA, VC
Card Number: 61
Title: Armored Cavalry
Italized Flavor Text: "Shock force."
Event Text: "ARVN in 1 Transport destination after Ops may free Assault."
Lasting Effects Indicator (5.3): ARVN CAPABILITY
Shaded Text (see Dual Use 5.2): "Sedentary sinecures: Transport Rangers only."

Period Event (Set Up Option): 1968
Faction Order: ARVN, US, NVA, VC
Card Number: 62
Title: Cambodian Civil War
Italized Flavor Text: "Lol Nol deposes Sihanouk."
Event Text: "US free Air Lifts into and US or ARVN free Sweeps within Cambodia. Remove 2 NVA/VC Bases from Cambodia."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "NVA invades Cambodia: NVA places a total of 12 NVA Troops and Guerrillas in Cambodia."

Period Event (Set Up Option): 1964
Faction Order: ARVN, US, NVA, VC
Card Number: 63
Title: Fact Finding
Italized Flavor Text: "US sends study teams."
Event Text: "2 US pieces from out-of-play to South Vietnam, or transfer a die roll from Patronage to ARVN Resources. Aid +6."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Duped: Remove Support from a COIN-Controlled City outside Saigon. Patronage +4 or VC Resources +4."

Period Event (Set Up Option): 1965
Faction Order: ARVN, US, NVA, VC
Card Number: 64
Title: Honolulu Conference
Italized Flavor Text: "Uneasy allies."
Event Text: "Aid +10 or -10. Patronage +3 or -5. If US or ARVN executing, that Faction Pacifies as if Support Phase. If Insurgent executing, that Faction remains Eligible."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): None

Period Event (Set Up Option): 1968
Faction Order: ARVN, US, NVA, VC
Card Number: 65
Title: International Forces
Italized Flavor Text: "Free World allies."
Event Text: "Place 4 out-of-play US pieces onto the map."
Lasting Effects Indicator (5.3): None 
Shaded Text (see Dual Use 5.2): "Withdrawal: Us must remove a die roll in pieces from the map to out of play."

Period Event (Set Up Option): 1964
Faction Order: ARVN, US, VC, NVA
Card Number: 66
Title: Ambassador Taylor
Italized Flavor Text: "Interventionist."
Event Text: "Aid and ARVN Resources each +9. Up to 2 US pieces from out-of-play to South Vietnam or, if desired, Patronage -3."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Saigon seen as US puppet: Remove Support from 3 spaces outside Saigon. Patronage -3."

Period Event (Set Up Option): 1963
Faction Order: ARVN, US, VC, NVA
Card Number: 67
Title: Amphib Landing
Italized Flavor Text: "Sea power."
Event Text: "US or ARVN relocates any of its Troops among coastal spaces, then free Sweeps and Assaults in 1 coastal space."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Enemy vanished: VC relocate up to 3 pieces from any coastal space. US and ARVN Ineligible through next card."

Period Event (Set Up Option): 1964
Faction Order: ARVN, US, VC, NVA
Card Number: 68
Title: Green Berets
Italized Flavor Text: "Elite trainers."
Event Text: "Place 3 Irregulars or 3 Rangers in a Province without NVA Control. Set it to Active Support."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Reluctant trainees: Remove any 3 Irregulars to Available and set 1 of their Provinces to Active Opposition."

Period Event (Set Up Option): 1965
Faction Order: ARVN, US, VC, NVA
Card Number: 69
Title: MACV
Italized Flavor Text: "Military Assistance Command, Vietnam spurs coordination."
Event Text: "Either US then ARVN or NVA then VC each executes any 1 free Special Activity, Faction executing Event stays Eligible."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): None

Period Event (Set Up Option): 1965
Faction Order: ARVN, US, VC, NVA
Card Number: 70
Title: ROKs
Italized Flavor Text: "Tough Koreans."
Event Text: "US or ARVN free Sweep into/in then free Assault Phu Bon and adjacent spaces as if US and as if all ARVN cubes are US Troops."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "UN troops abuse locals: Shift Qui Nhon, Phu Bon, and Khanh Hoa each 1 level toward Active Opposition."

Period Event (Set Up Option): 71
Faction Order: ARVN, NVA, US, VC
Card Number: 71
Title: An Loc
Italized Flavor Text: "ARVN stand firm."
Event Text: "In a space in the south with ARVN, remove all NVA Troops and place 3 ARVN Troops."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Conventional thrust: NVA free Marches Troops into a City and free Attacks there twice."

Period Event (Set Up Option): 1965
Faction Order: ARVN, NVA, US, VC
Card Number: 72
Title: Body Count
Italized Flavor Text: "Crossover point."
Event Text: "Until Coup, Assault and Patrol add +3 Aid per Guerrilla removed and cost 0. MOMENTUM"
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "'If it's dead, it's VC': Place 1 VC Guerrilla in each Active Opposition space, 2 NVA Troops in each Laos/Cambodia space."

Period Event (Set Up Option): 1965
Faction Order: ARVN, NVA, US, VC
Card Number: 73
Title: Great Society
Italized Flavor Text: "LBJ advances social agenda."
Event Text: "Conduct a Commitment Phase."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "War wrecks economy: US moves 3 pieces from Available to out of play."

Period Event (Set Up Option): 1968
Faction Order: ARVN, NVA, US, VC
Card Number: 74
Title: Lam Son 719
Italized Flavor Text: "Sudden incursion."
Event Text: "Place up to 6 ARVN Troops in a Laos space. ARVN executes a free LimOp there. Degrade Trail 2 boxes."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Southern escalation: NVA Resources +6 and +1 more for each ARVN piece in Laos."

Period Event (Set Up Option): 1964
Faction Order: ARVN, NVA, US, VC
Card Number: 75
Title: Sihanouk
Italized Flavor Text: "Pursuit operations."
Event Text: "US or ARVN free Sweep into or in any Cambodia spaces, then free Assaults in one."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Sea supply and sanctuary: VC free Rally in any Cambodia spaces then free March from any Rally spaces. Then NVA do the same."

Period Event (Set Up Option): 1965
Faction Order: ARVN, NVA, VC, US
Card Number: 76
Title: Annam
Italized Flavor Text: "North-South rivalry lingers."
Event Text: "NVA and VC -1 Resource each per space with both. Patronage +2."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Saigon regime seen as colonial retread. Remove support from Hue. Da Nang, and an adjacent Province."

Period Event (Set Up Option): 1968
Faction Order: ARVN, NVA, VC, US
Card Number: 77
Title: Détente
Italized Flavor Text: "Communist Bloc eases off of war."
Event Text: "Cut NVA and VC Resources each to half their total (round down). 5 Available NVA Troops out of play."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Nixon disappointed: NVA add +9 Resources or free Infiltrate. Then VC free Rally in up to 6 spaces."

Period Event (Set Up Option): 1965
Faction Order: ARVN, NVA, VC, US
Card Number: 78
Title: General Landsdale
Italized Flavor Text: "Unconventional counterinsurgent."
Event Text: "Set a space outside Saigon with US or ARVN to Active Support. Add a Terror marker there. Patronage +1."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Bureaucratic infighter: Patronage +3. No US Assault until Coup. MOMENTUM"

Period Event (Set Up Option): 1964
Faction Order: ARVN, NVA, VC, US
Card Number: 79
Title: Henry Cabot Lodge
Italized Flavor Text: "Ambassador proposes US protectorate."
Event Text: "Aid +20"
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Internecine enabler: Remove up to 3 ARVN pieces. Patronage +2 for each. ARVN Ineligible through next card."

Period Event (Set Up Option): 1968
Faction Order: ARVN, NVA, VC, US
Card Number: 80
Title: Light at the End of the Tunnel
Italized Flavor Text: "Wind down seen."
Event Text: "Remove 1-4 US pieces from map to Available. For each piece, Patronage +2, shift a space 1 level toward Active Opposition, and place 4 NVA Troops outside the South. Stay Eligible."
Lasting Effects Indicator (5.3):
Shaded Text (see Dual Use 5.2):

Period Event (Set Up Option): 1965
Faction Order: ARVN, VC, US, NVA
Card Number: 81
Title: CIDG
Italized Flavor Text: "Civilian Irregular Defense Groups."
Event Text: "Replace a die roll of VC Guerrillas in South Vietnam with Rangers, Irregulars, or Police."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Desertions and defections. Replace all Rangers, Police, and Irregulars in a Highland space with 2 VC Guerrillas total."

Period Event (Set Up Option): 1965
Faction Order: ARVN, VC, US, NVA
Card Number: 82
Title: Domino Theory
Italized Flavor Text: "US justifies its war."
Event Text: "Up to 3 US or 6 ARVN out-of-play pieces to Available. Or ARVN Resources and Aid each +9."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "US public doubts war's purpose: 3 Available US Troops out of play. Aid -9."

Period Event (Set Up Option): 1965
Faction Order: ARVN, VC, US, NVA
Card Number: 83
Title: Election
Italized Flavor Text: "Clean vote."
Event Text: "3 Passive Support spaces to Active Support. Aid +10."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Ballot stuffing defeats opposition candidate Druong Dinh Dzu: Shift 2 Cities each 1 level toward Active Opposition. Aid -15."

Period Event (Set Up Option): 1968
Faction Order: ARVN, VC, US, NVA
Card Number: 84
Title: To Quoc
Italized Flavor Text: "Fear of Northern reprisal."
Event Text: "Place 1 ARVN Troop and 1 Police in each South Vietnam space with NVA."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Thoroughly penetrated: ARVN remove 1 in 3 cubes (round down) each space. Place a VC Guerrilla in 3 spaces where ARVN removed."

Period Event (Set Up Option): 1965
Faction Order: ARVN, VC, US, NVA
Card Number: 85
Title: USAID
Italized Flavor Text: "Increased help to civilians."
Event Text: "Shift 3 COIN-Controlled spaces each 1 level toward Active Support."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "More aid, more corruption: Increase or decrease any or all of ARVN Resources, Aid, and Patronage by 2 each."

Period Event (Set Up Option): 1965
Faction Order: ARVN, VC, NVA, US
Card Number: 86
Title: Mandate of Heaven
Italized Flavor Text: "Anger at regime suppressed."
Event Text: "1 Govern space may transfer Aid to Patronage without shifting support."
Lasting Effects Indicator (5.3): ARVN CAPABILITY
Shaded Text (see Dual Use 5.2): "Communism seen in harmony with Confucious: ARVN Govern and Pacify maximum 1 space."

Period Event (Set Up Option): 1965
Faction Order: ARVN, VC, NVA, US
Card Number: 87
Title: Nguyen Chanh Thi
Italized Flavor Text: "I Corps Commander."
Event Text: "Place 3 ARVN pieces within 3 spaces of Hue. Shift receiving spaces each 1 level toward Active Support."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Popular general relieved: Replace any 2 ARVN with any 2 VC pieces within 2 spaces of Hue. Patronage +4 or -4."

Period Event (Set Up Option): 1968
Faction Order: ARVN, VC, NVA, US
Card Number: 88
Title: Phan Quang Dan
Italized Flavor Text: "Dissident becomes RVN minister."
Event Text: "Shift Saigon 1 level toward Active Support. Patronage +5."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Oppositionist Assemblyman: Shift Saigon 1 level toward Neutral. Patronage -5. ARVN Ineligible through next card."

Period Event (Set Up Option): 1965
Faction Order: ARVN, VC, NVA, US
Card Number: 89
Title: Tam Chau
Italized Flavor Text: "Catholic backlash."
Event Text: "Shift Saigon 1 level toward Passive Support. Patronage +6."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Saigon Buddhists find leader: Place a VC piece in and shift Saigon 1 level toward Passive Opposition. Patronage -6."

Period Event (Set Up Option): 1965
Faction Order: ARVN, VC, NVA, US
Card Number: 90
Title: Walt Rostow
Italized Flavor Text: "COIN portfolio."
Event Text: "Place any 2 ARVN pieecs from anywhere (even out of play) into any COIN Control spaces."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "The enemy owns the night: Place any 1 Guerrilla in each Province with ARVN. ARVN Troops Redeploy as if no Bases."

Period Event (Set Up Option): 1968
Faction Order: VC, US, NVA, ARVN
Card Number: 91
Title: Bob Hope
Italized Flavor Text: "USO."
Event Text: "Move any US Troops from a Province to a COIN Control City. For each 2 moved (round down), 1 Casualty piece to Available."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Show lowers op tempo: NVA or VC move up to 3 US Troops from any Provinces to Cities, placing a Guerrilla where each Troop was."

Period Event (Set Up Option): 1968
Faction Order: VC, US, NVA, ARVN
Card Number: 92
Title: SEALORDS
Italized Flavor Text: "Delta strategy."
Event Text: "ARVN then US free Sweep in place or Assault in each space adjacent to Can Tho."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Sampans: NVA or VC moves any of its pieces (including unTunneled Bases) from Cambodia/Tay Ninh to spaces adjacent to Can Tho."

Period Event (Set Up Option): 1964
Faction Order: VC, US, NVA, ARVN
Card Number: 93
Title: Senator Fulbright
Italized Flavor Text: "Hearings stoke debate."
Event Text: "US moves 4 US pieces from map to Available."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "War skeptic: 1 Available US Base out of play. Aid -9."

Period Event (Set Up Option): 1968
Faction Order: VC, US, NVA, ARVN
Card Number: 94
Title: Tunnel Rats
Italized Flavor Text: "Subterranean specialists."
Event Text: "Place a Tunnel marker on an Insurgent Base in each of 2 Provinces, or remove 1 Tunneled Base from a space with US Troops."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): None

Period Event (Set Up Option): 1965
Faction Order: VC, US, NVA, ARVN
Card Number: 95
Title: Westmoreland
Italized Flavor Text: "Root 'em out."
Event Text: "US free Air Lifts, then Sweeps (no moves) or Assaults (no ARVN) in 2 spaces, then Air Strikes."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Big-unit war bypasses population: Shift 3 Provinces with no Police each 2 levels toward Active Opposition."

Period Event (Set Up Option): 1968
Faction Order: VC, US, ARVN, NVA
Card Number: 96
Title: APC
Italized Flavor Text: "Accelerated Pacification Campaign."
Event Text: "US and ARVN immediately Pacify as if Support Phase, but cost is 0. Shift at most 1 level per space."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "False progress: If Tet Offensive played, return it to VC. If not, VC execute 'General uprising' as on the card (without using it)."

Period Event (Set Up Option): 1964
Faction Order: VC, US, ARVN, NVA
Card Number: 97
Title: Brinks Hotel
Italized Flavor Text: "NLF terror reconciles GVN-US."
Event Text: "Aid +10, or 4 Patronage to ARVN Resources. Flip any current RVN leader card; its text is ignored."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "US billet car bombed: Shift a City that has VC by 2 levels toward Active Opposition and add a Terror marker there."

Period Event (Set Up Option): 1965
Faction Order: VC, US, ARVN, NVA
Card Number: 98
Title: Long Tan
Italized Flavor Text: "Royal Australians."
Event Text: "Place 2 out-of-play US Troops into a Province or remove all Guerrillas from all Jungle with US Troops."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "VC strike newly arrived troops: 1 US Base and 1 US Troop in a Jungle with 2+ VC Guerrillas to Casualties."

Period Event (Set Up Option): 1965
Faction Order: VC, US, ARVN, NVA
Card Number: 99
Title: Masher/White Wing
Italized Flavor Text: "Sweep flushes enemy into kill zone."
Event Text: "US or ARVN free Sweeps 1 non-Jungle space with US and ARVN Troops. They free Assault as US."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Poor OPSEC: VC or NVA free March Guerrillas to any 3 spaces then free Ambush in each (even if Active)"

Period Event (Set Up Option): 1965
Faction Order: VC, US, ARVN, NVA
Card Number: 100
Title: Rach Ba Rai
Italized Flavor Text: "Riverines hunt Charlie."
Event Text: "Remove all VC or all non-Troop NVA from a Lowland with US Troops."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "VC river ambush: In a Lowland with any VC, remove a die roll of US/ARVN cubes (US to Casualties). Place 1 VC piece."

Period Event (Set Up Option): 1964
Faction Order: VC, NVA, US, ARVN
Card Number: 101
Title: Booby Traps
Italized Flavor Text: "Preparations tip off enemy."
Event Text: "VC and NVA Ambush in max 1 space."
Lasting Effects Indicator (5.3): VC CAPABILITY
Shaded Text (see Dual Use 5.2): "Mines and punji: Each Sweep space, VC afterward removes 1 Sweeping Troop on roll of 1-3 (US to Casualties)"

Period Event (Set Up Option): 1965
Faction Order: VC, NVA, US, ARVN
Card Number: 102
Title: Cu Chi
Italized Flavor Text: "Clear and secure."
Event Text: "Remove all Guerrillas from 1 space with a Tunnel and COIN Control."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Iron Triangle: Place Tunnel markers on each Insurgent Base in 1 Province. Place 1 NVA and 1 VC Guerrilla there."

Period Event (Set Up Option): 1968
Faction Order: VC, NVA, US, ARVN
Card Number: 103
Title: Kent State
Italized Flavor Text: "National Guard imposes order."
Event Text: "Any 2 US Casualties to Available. 1 free US LimOp. US Eligible."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "National Guard overreacts: Up to 3 US Troop Casualties out of play. Aid -6. US ineligible through next card."

Period Event (Set Up Option): 1965
Faction Order: VC, NVA, US, ARVN
Card Number: 104
Title: Main Force Bns
Italized Flavor Text: "Larger footprints."
Event Text: "March into Support/LoC Activates if moving plus non-Base COIN >1 (vice >3)."
Lasting Effects Indicator (5.3): VC CAPABILITY
Shaded Text (see Dual Use 5.2): "Hard-hitting guerrillas: 1 VC Ambush space may remove 2 enemy pieces."

Period Event (Set Up Option): 1965
Faction Order: VC, NVA, US, ARVN
Card Number: 105
Title: Rural Pressure
Italized Flavor Text: "Onerous VC taxation."
Event Text: "Shift 4 Provinces with any VC each by 1 level toward Active Support."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Local government corruption: Shift 3 Provinces with Police each by 1 level toward Active Opposition. Patronage +6 or -6."

Period Event (Set Up Option): 1965
Faction Order: VC, NVA, ARVN, US
Card Number: 106
Title: Binh Duong
Italized Flavor Text: "Revolutionary land reform seeks traction in prosperous districts."
Event Text: "In each of 2 Provinces adjacent to Saigon, shift Support/Opposition 1 level either direction and place a VC Guerrilla or Police."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): None

Period Event (Set Up Option): 1064
Faction Order: VC, NVA, ARVN, US
Card Number: 107
Title: Burning Bonze
Italized Flavor Text: "Gruesome protests close elite ranks."
Event Text: "Patronage +3 or, if Saigon at Active Support, +6."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Anti-regime self-immolation: Shift Saigon 1 level toward Active Opposition. Aid -12."

Period Event (Set Up Option): 1965
Faction Order: VC, NVA, ARVN, US
Card Number: 108
Title: Draft Dodgers
Italized Flavor Text: "Public furor sparks enlistment."
Event Text: "If fewer than 3 Casualty pieces, 3 US Troops from out of play to Available."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Recruiting sags: Move 1 US Troop per Casualty piece, to a maximum of 3, from Available to out-of-play."

Period Event (Set Up Option): 1965
Faction Order: VC, NVA, ARVN, US
Card Number: 109
Title: Nguyen Huu Tho
Italized Flavor Text: "Party control of NLF draws anti-communist reaction."
Event Text: "Shift each City with VC 1 level toward Active Support."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "National Liberation Front leader: Place a VC base and a VC Guerrilla in Saigon. Stay Eligible."

Period Event (Set Up Option): 1964
Faction Order: VC, NVA, ARVN, US
Card Number: 110
Title: No Contact
Italized Flavor Text: "Respite."
Event Text: "Place 2 Casualties onto the map. All Rangers and Irregulars Underground."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Charlie bugs out: Flip all VC and NVA Guerrillas Underground."

Period Event (Set Up Option): 1968
Faction Order: VC, ARVN, US, NVa
Card Number: 111
Title: Agent Orange
Italized Flavor Text: "Counter-sanctuary chemical."
Event Text: "All insurgents in Jungle go Active. US free Air Strikes among up to any 2 Jungle spaces (no effect on Trail)."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Industrial defoliation: Shift each Jungle and Highland with Insurgents 1 level toward Active Opposition."

Period Event (Set Up Option): 1964
Faction Order: VC, ARVN, US, NVA
Card Number: 112
Title: Colonel Chau
Italized Flavor Text: "Census-grievance teams."
Event Text: "Place 1 Police into each of 6 Provinces."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Local Viet Minh tradition: Shift 3 Provinces with ARVN each 1 level toward Active Opposition. Place a VC Guerrilla in each."

Period Event (Set Up Option): 1968
Faction Order: VC, ARVN, US, NVA
Card Number: 113
Title: Ruff Puff
Italized Flavor Text: "RF/PF-Regional and Popular Forces."
Event Text: "Place up to 9 Police in the South."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Ill-trained, thoroughly subverted: Replace 5 Police outside Cities with 1 VC piece each; 1 of the VC pieces may be a Base."

Period Event (Set Up Option): 1965
Faction Order: VC, ARVN, US, NVA
Card Number: 114
Title: Tri Quang
Italized Flavor Text: "Buddhists counter Communists."
Event Text: "Set up to 3 Neutral or Opposition Cities to Passive Support."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "People's Revolutionary Committee: Shift Hue, Da Nang, and Saigon 1 level toward Active Opposition. Place a VC piece in Saigon."

Period Event (Set Up Option): 1968
Faction Order: VC, ARVN, US, NVA
Card Number: 115
Title: Typhoon Kate
Italized Flavor Text: "Year of storms."
Event Text: "Until Coup, no Air Lift, Transport, or Bombard, and all other Special Activities are maximum 1 space. Executing Faction stays Eligible. MOMENTUM"
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): None

Period Event (Set Up Option): 1964
Faction Order: VC, ARVN, NVA, US
Card Number: 116
Title: Cadres
Italized Flavor Text: "Manpower to political sections."
Event Text: "VC to Terror or Agitate must remove 2 VC Guerrillas per space."
Lasting Effects Indicator (5.3): VC CAPABILITY
Shaded Text (see Dual Use 5.2): "NLF village committees: VC Rally in 1 space where VC already had a Base may Agitate as if Support Phase even if COIN Control."

Period Event (Set Up Option): 1964
Faction Order: VC, ARVN, NVA, US
Card Number: 118
Title: Korean War Arms
Italized Flavor Text: "Obsolete."
Event Text: "VC must remove 1 VC Guerrilla from each space with at least 2 and no NVA Base."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "NLF gets US arms captured in Korea: Place any 1 VC piece in each of 3 spaces."

Period Event (Set Up Option): 1968
Faction Order: VC, ARVN, NVA, US
Card Number: 119
Title: My Lai
Italized Flavor Text: "US LT convicted."
Event Text: "2 Available US Troops out of play. Patronage +2."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Massacre: Set a Province with US Troops to Active Opposition. VC place a Base and Guerrilla there. Aid -6."

Period Event (Set Up Option):
Faction Order:
Card Number:
Title:
Italized Flavor Text:
Event Text:
Lasting Effects Indicator (5.3):
Shaded Text (see Dual Use 5.2):

Period Event (Set Up Option):
Faction Order:
Card Number:
Title:
Italized Flavor Text:
Event Text:
Lasting Effects Indicator (5.3):
Shaded Text (see Dual Use 5.2):