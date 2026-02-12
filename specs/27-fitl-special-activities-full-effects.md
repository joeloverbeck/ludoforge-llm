# Spec 27: FITL Special Activities Full Effects

**Status**: Draft
**Priority**: P0
**Complexity**: L
**Dependencies**: Spec 25 (mechanics infrastructure), Spec 26 (interleaving model)
**Estimated effort**: 4–5 days
**Source sections**: Brainstorming Sections 4.2 (item 2), rules 4.2–4.5

## Overview

Replace the 12 stub special activity profiles with complete effect implementations using the interleaving model from Spec 26. Each SA accompanies an Operation at no added resource cost (Rule 4.1). Individual SA effects should be expressible with existing `EffectAST` + Spec 25 infrastructure.

## Scope

### In Scope

- **US SAs (3)**: Advise, Air Lift, Air Strike
- **ARVN SAs (3)**: Govern, Transport, Raid
- **NVA SAs (3)**: Infiltrate, Bombard, Ambush
- **VC SAs (3)**: Tax, Subvert, VC Ambush
- Monsoon restrictions on SAs (from `TurnFlowMonsoonDef`): Air Lift/Air Strike limited to 2 spaces; other SAs may have monsoon effects
- SA-specific targeting, resolution, and piece effects

### Out of Scope

- Interleaving architecture (Spec 26 owns; this spec uses it)
- Capability/momentum modifiers on SAs (Spec 28)
- Non-player SA selection (Spec 30)

## Implementation Tasks

### US Special Activities

#### Task 27.1: Advise (Rule 4.2.1)

In any 1 space with US Troops: flip all ARVN to Underground, or move 1 ARVN piece into an adjacent space, or replace 1 ARVN Troop with 1 ARVN Ranger (from Available or map). Additionally, if US Irregulars present, may flip any 1 Underground Guerrilla Active.

#### Task 27.2: Air Lift (Rule 4.2.2)

Move any friendly pieces (US/ARVN) among up to 3 spaces (origin + 2 destinations, no adjacency required). Lifted Guerrillas/SF become Active.

**Monsoon restriction**: Limited to 2 spaces (origin + 1 destination).

#### Task 27.3: Air Strike (Rule 4.2.3)

In up to 2 spaces (or monsoon: 1 space): remove 1 enemy piece per space (Troops first). In 1 of those spaces, may degrade Trail by 1 instead. Die roll: 1–4 no effect, 5–6 place Terror marker (if Province/City). If Air Strike degrades Trail, place Terror on that space instead.

**Monsoon restriction**: Limited to 1 space.

### ARVN Special Activities

#### Task 27.4: Govern (Rule 4.3.1)

Select up to 2 spaces with COIN Control and ARVN cubes. Per space: increase Patronage by population value. In Province/City with Support: increase Aid by 3 × population. Transfer Resources: ARVN may transfer any amount of Resources to US (placed back on Aid track? — verify rule).

#### Task 27.5: Transport (Rule 4.3.2)

Move any ARVN cubes among any spaces via LoCs (unlimited range along LoC chain). Up to 4 cubes total. Transported pieces must start in COIN-Controlled spaces.

#### Task 27.6: Raid (Rule 4.3.3)

In up to 2 spaces: remove 1 enemy piece (Active Guerrilla or Base). If Guerrilla removed, +1 ARVN Resources. If Base removed, +3 ARVN Resources. Flip 1 Raiding Ranger/SF Active.

### NVA Special Activities

#### Task 27.7: Infiltrate (Rule 4.4.1)

Place NVA pieces: up to 4 NVA Guerrillas and/or Troops in spaces with NVA Base or Trail ≥ 2 (no adjacency requirement). May also place 1 NVA Base in a space with 3+ NVA Guerrillas (flip 2 to Active, replace with Base). NVA may take pieces from map if not Available (including replacing pieces, unlike normal dynamic sourcing).

**Momentum effect**: McNamara Line prohibits Infiltrate.

#### Task 27.8: Bombard (Rule 4.4.2)

In 1 space adjacent to NVA Base with 3+ NVA Troops: remove 1–2 enemy pieces. Roll die for each enemy piece: 1–3 nothing, 4–6 remove (or activate Guerrilla). Costs no Resources.

**Monsoon**: Typhoon Kate prohibits Bombard.

#### Task 27.9: NVA Ambush (Rule 4.4.3)

In 1 space with Underground NVA Guerrilla: Flip 1 NVA Guerrilla Active. Remove 1 enemy piece (no die roll). The Ambushing Guerrilla may then flip back Underground if 2+ Underground NVA Guerrillas were present before Ambush.

### VC Special Activities

#### Task 27.10: Tax (Rule 4.5.1)

In up to 4 spaces with Underground VC Guerrilla: gain Resources equal to population (Province/City) or econ (LoC). Each Taxing Guerrilla flips Active.

#### Task 27.11: Subvert (Rule 4.5.2)

In up to 2 spaces with Underground VC Guerrilla: replace 1 ARVN cube with VC Guerrilla (from Available). The replaced ARVN piece goes to Available. If no ARVN cubes, may remove 1 ARVN Base instead.

#### Task 27.12: VC Ambush (Rule 4.5.3)

Same as NVA Ambush (Task 27.9) but with VC Guerrillas. In 1 space with Underground VC Guerrilla: Flip 1 VC Guerrilla Active, remove 1 enemy piece, may flip back Underground.

## Testing Requirements

### Unit Tests per SA
- Given valid inputs, produces correct state changes
- Piece placement/removal respects availability and dynamic sourcing
- Resource gains computed correctly (Tax, Raid, Govern)
- Monsoon restrictions enforced (Air Lift 2→1 destination, Air Strike 2→1 space)
- Guerrilla flip on Ambush correct
- Die rolls deterministic via seeded PRNG (Air Strike terror, Bombard removal)

### Integration Tests
- Update existing: `test/integration/fitl-us-arvn-special-activities.test.ts` — full effects
- Update existing: `test/integration/fitl-nva-vc-special-activities.test.ts` — full effects
- New tests for monsoon-restricted SAs
- New tests for SA execution within interleaving model (from Spec 26)

## Acceptance Criteria

1. All 12 SAs have complete effect implementations — no stubs remain
2. Monsoon restrictions enforced (Air Lift, Air Strike, Typhoon Kate on Bombard)
3. Resource gains/costs computed correctly
4. Die rolls deterministic via seeded PRNG
5. SAs work within the interleaving model from Spec 26 (compound variant enumeration in `legal-moves.ts` must be complete — see Spec 26 Task 26.1)
6. All existing integration tests pass or are updated
7. Build passes (`npm run build`)
