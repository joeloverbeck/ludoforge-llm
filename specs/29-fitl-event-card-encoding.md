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
