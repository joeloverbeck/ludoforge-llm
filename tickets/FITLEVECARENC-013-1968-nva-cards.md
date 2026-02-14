# FITLEVECARENC-013: 1968 Period — NVA-First Faction Order Cards

**Status**: TODO
**Priority**: P3
**Complexity**: L
**Parent spec**: specs/29-fitl-event-card-encoding.md (Task 29.4, Phase 4)
**Depends on**: FITLEVECARENC-001

## Description

Encode the 1968 period cards where NVA is the first faction in the order:

| # | Title | Faction Order | Complexity | Notes |
|---|-------|---------------|------------|-------|
| 32 | Long Range Guns | NVA, US, ARVN, VC | Medium | NVA Capability |
| 33 | MiGs | NVA, US, ARVN, VC | Medium | NVA Capability; interacts with Top Gun |
| 35 | Thanh Hoa | NVA, US, ARVN, VC | Medium | Trail math |
| 36 | Hamburger Hill | NVA, US, VC, ARVN | Medium | Troop movement + Tunnel |
| 37 | Khe Sanh | NVA, US, VC, ARVN | Medium | Mass removal + Casualties |
| 40 | PoWs | NVA, US, VC, ARVN | Low | Casualties movement |
| 41 | Bombing Pause | NVA, ARVN, US, VC | Medium | Momentum (unshaded) |
| 42 | Chou En Lai | NVA, ARVN, US, VC | Medium | Resource changes + die roll |
| 45 | PT-76 | NVA, ARVN, US, VC | Medium | NVA Capability |
| 49 | Russian Arms | NVA, ARVN, VC, US | Medium | Piece placement |
| 52 | RAND | NVA, VC, US, ARVN | Medium | Flip capability side |
| 54 | Son Tay | NVA, VC, US, ARVN | Medium | Eligibility changes |
| 57 | International Unrest | NVA, VC, ARVN, US | Low | Casualties + die roll |
| 58 | Pathet Lao | NVA, VC, ARVN, US | Medium | Conditional Trail/Redeploy |
| 60 | War Photographer | NVA, VC, ARVN, US | Low | Pieces from out-of-play |

15 cards total.

## Files to Touch

- `data/games/fire-in-the-lake.md` — Add 15 card definitions.
- `test/integration/fitl-events-1968-nva.test.ts` — **New file**. Integration tests.

## Out of Scope

- Other period/faction group cards.
- Any kernel/compiler changes.

## Encoding Notes

- **Capabilities** (32, 33, 45): Tags: `["capability", "NVA"]`.
- **Momentum** (41 unshaded): `lastingEffects` with `duration: "round"`.
- **Card 33 (MiGs)**: Interacts with Top Gun (card 4). The "Unless unshaded Top Gun" condition references another capability's state.
- **Card 52 (RAND)**: Flips a capability from shaded to unshaded or vice versa. Needs encoding for "select 1 capability and flip".

## Acceptance Criteria

### Tests That Must Pass

1. `test/integration/fitl-events-1968-nva.test.ts`:
   - All 15 cards compile, correct metadata, faction orders.
   - Capability cards: correct `setVar`, correct tags.
   - Card 41: momentum `lastingEffects`.
2. `npm run build` passes.
3. `npm test` passes.

### Invariants That Must Remain True

- All existing cards unchanged. Card IDs unique. Faction orders valid.
- Production spec compiles without errors.
