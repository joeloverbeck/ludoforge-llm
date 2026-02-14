# FITLEVECARENC-012: 1968 Period — US-First Faction Order Cards

**Status**: TODO
**Priority**: P3
**Complexity**: L
**Parent spec**: specs/29-fitl-event-card-encoding.md (Task 29.4, Phase 4)
**Depends on**: FITLEVECARENC-001

## Description

Encode the 1968 period cards where US is the first faction in the order:

| # | Title | Faction Order | Complexity | Notes |
|---|-------|---------------|------------|-------|
| 2 | Kissinger | US, NVA, ARVN, VC | High | Die roll removal; multi-faction effects |
| 3 | Peace Talks | US, NVA, ARVN, VC | High | Conditional capability marker (Linebacker 11) |
| 4 | Top Gun | US, NVA, ARVN, VC | Medium | US Capability |
| 9 | Psychedelic Cookie | US, NVA, VC, ARVN | Medium | Troop movement |
| 11 | Abrams | US, ARVN, NVA, VC | Medium | US Capability |
| 12 | Capt Buck Adams | US, ARVN, NVA, VC | Medium | Flip + removal |
| 13 | Cobras | US, ARVN, NVA, VC | Medium | US Capability; die roll |
| 16 | Blowtorch Komer | US, ARVN, VC, NVA | Medium | Momentum (unshaded) |
| 19 | CORDS | US, ARVN, VC, NVA | Medium | US Capability |
| 20 | Laser Guided Bombs | US, ARVN, VC, NVA | Medium | US Capability |
| 21 | Americal | US, VC, NVA, ARVN | Medium | Troop movement; Opposition shift |
| 27 | Phoenix Program | US, VC, ARVN, NVA | Low | Already exists (FITLEVECARENC-001) |
| 30 | USS New Jersey | US, VC, ARVN, NVA | Medium | Free Air Strikes coastal |

**Note**: Card 27 (Phoenix Program) is already encoded. Skip it. That leaves 12 cards.

## Files to Touch

- `data/games/fire-in-the-lake.md` — Add 12 card definitions.
- `test/integration/fitl-events-1968-us.test.ts` — **New file**. Integration tests.

## Out of Scope

- Card 27 (already exists).
- Other period/faction group cards.
- Any kernel/compiler changes.

## Encoding Notes

- **Capabilities** (4, 11, 13, 19, 20): Set `cap*` vars. Tags: `["capability", "US"]`.
- **Momentum** (16 unshaded): `lastingEffects` with `duration: "round"`.
- **Card 3 (Peace Talks)**: Linebacker 11 conditional mark — may need a new global marker variable.
- **Die rolls** (2, 13): Flag if `dieRoll` not expressible.

## Acceptance Criteria

### Tests That Must Pass

1. `test/integration/fitl-events-1968-us.test.ts`:
   - All 12 cards compile, correct metadata, faction orders.
   - Capability cards: correct `setVar`, correct tags.
   - Card 16: momentum `lastingEffects`.
2. `npm run build` passes.
3. `npm test` passes.

### Invariants That Must Remain True

- Card 27 definition unchanged. All existing cards unchanged.
- Card IDs unique. Faction orders valid.
- Production spec compiles without errors.
