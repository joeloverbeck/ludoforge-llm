# FITLEVECARENC-007: Remaining 1964 Period Cards (Phase 2)

**Status**: TODO
**Priority**: P2
**Complexity**: L
**Parent spec**: specs/29-fitl-event-card-encoding.md (Task 29.2, Phase 2)
**Depends on**: FITLEVECARENC-001

## Description

Encode the remaining 1964 period cards not already covered by the tutorial deck. The 1964 period has 24 total cards. Tutorial cards from 1964 are: 107, 55, 68, 1, 97, 79, 101, 125, 75, 17, 51, 43, 112. That's 13 cards. The remaining 1964 cards (11 cards) are:

| # | Title | Faction Order | Complexity | Notes |
|---|-------|---------------|------------|-------|
| 15 | Medevac | US, ARVN, NVA, VC | Medium | Momentum: Troop Casualties Available |
| 26 | LRRP | US, VC, ARVN, NVA | Medium | Place Irregulars + free Air Strikes |
| 29 | Tribesmen | US, VC, ARVN, NVA | Medium | Remove Insurgents; Replace Irregulars |
| 31 | AAA | NVA, US, ARVN, VC | Medium | NVA Capability: Rally Trail restriction |
| 48 | Nam Dong | NVA, ARVN, VC, US | Medium | Remove Guerrillas; Remove COIN Base |
| 50 | Uncle Ho | NVA, ARVN, VC, US | High | Free Limited Operations |
| 63 | Fact Finding | ARVN, US, NVA, VC | Medium | Pieces from out-of-play; Patronage transfer |
| 66 | Ambassador Taylor | ARVN, US, VC, NVA | Medium | Aid/Resources boost; Remove Support |
| 93 | Senator Fulbright | VC, US, NVA, ARVN | Low | Move US pieces to Available; Aid reduction |
| 110 | No Contact | VC, NVA, ARVN, US | Medium | Place Casualties on map; flip pieces |
| 118 | Korean War Arms | VC, ARVN, NVA, US | Medium | VC removes Guerrillas; Place VC pieces |

## Files to Touch

- `data/games/fire-in-the-lake.md` — Add 11 card definitions to the `eventDecks[0].cards` array.
- `test/integration/fitl-events-1964-remaining.test.ts` — **New file**. Integration tests for all 11 cards.

## Out of Scope

- Tutorial cards (FITLEVECARENC-001 through 006).
- 1965 period cards.
- 1968 period cards.
- Coup and Pivotal cards (handled separately).
- Any kernel/compiler changes.

## Encoding Notes

- **Card 15 (Medevac)**: Momentum card. Unshaded `lastingEffects` with `duration: "round"` for "all Troop Casualties Available". Tags: `["momentum"]`.
- **Card 31 (AAA)**: NVA Capability. Sets `capAAA` variable. Tags: `["capability", "NVA"]`.
- **Card 50 (Uncle Ho)**: High complexity — grants "2 free Limited Operations" to ARVN or "3 free Limited Operations" to VC then NVA. May require `freeOp` or `limitedOp` primitives. Flag if needed.
- **Cards with die rolls** (e.g., #63 Fact Finding "a die roll from Patronage"): Flag if `dieRoll` expression not available.

## Acceptance Criteria

### Tests That Must Pass

1. `test/integration/fitl-events-1964-remaining.test.ts`:
   - All 11 cards compile without errors.
   - Each card has correct `sideMode: "dual"`, correct `metadata.period === "1964"`, correct `metadata.factionOrder`.
   - Each card has `text` fields on both sides (or unshaded only for single-sided).
   - Card 15 (Medevac): has `lastingEffects` with `duration: "round"`, tags include `"momentum"`.
   - Card 31 (AAA): has capability `setVar`, tags include `"capability"`.
2. `npm run build` passes.
3. `npm test` passes.
4. Any effects that cannot be expressed are documented in `NEEDS_PRIMITIVE.md`.

### Invariants That Must Remain True

- All existing cards unchanged.
- Card IDs unique across the entire deck.
- All faction orders are exactly 4 factions, each appearing once.
- Production spec compiles without errors.
