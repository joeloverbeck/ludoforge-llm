# FITLEVECARENC-007: Remaining 1964 Period Cards (Phase 2)

**Status**: ✅ COMPLETED
**Priority**: P2
**Complexity**: L
**Parent spec**: specs/29-fitl-event-card-encoding.md (Task 29.2, Phase 2)
**Depends on**: FITLEVECARENC-001

## Description

Encode the remaining 1964 period cards not already covered by the tutorial deck.

Validated current state (2026-02-15):
- `data/games/fire-in-the-lake.md` already encodes the tutorial cards and coup card 125.
- The 11 cards listed below are still missing from `eventDecks[0].cards`.
- Current FITL architecture encodes capability cards via `setGlobalMarker` on `cap_*` marker lattices (not `setVar` booleans).
- Current FITL architecture encodes momentum via `lastingEffects` with round duration and `setVar` toggles on canonical `mom_*` globals.
- `rollRandom` is available and should be used for die-roll effects when needed.

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

- `tickets/FITLEVECARENC-007-1964-remaining-cards.md` — Update assumptions/scope to match current architecture.
- `data/games/fire-in-the-lake.md` — Add 11 card definitions to the `eventDecks[0].cards` array.
- `test/integration/fitl-events-1964-remaining.test.ts` — **New file**. Integration tests for all 11 cards.

## Out of Scope

- Tutorial cards (FITLEVECARENC-001 through 006).
- 1965 period cards.
- 1968 period cards.
- Coup and Pivotal cards (handled separately).
- Any kernel/compiler changes.

## Encoding Notes

- **Card 15 (Medevac)**: Momentum card. Use `lastingEffects` with `duration: "round"` and canonical momentum globals:
  - unshaded toggles `mom_medevacUnshaded`
  - shaded toggles `mom_medevacShaded`
  - Tags include `momentum`.
- **Card 31 (AAA)**: NVA Capability. Use `setGlobalMarker` for `cap_aaa` (`unshaded`/`shaded`). Tags include `capability` and `NVA`.
- **Card 50 (Uncle Ho)**: High complexity. Encode free-operation intent with existing `freeOperationGrants` primitives. If exact "Limited Operations" semantics are not fully representable with current grants, document the gap in this ticket's Outcome section rather than introducing ad hoc aliases.
- **Cards with die rolls** (for example #63): use `rollRandom` where the card model needs a die result.
- Avoid kernel/compiler changes in this ticket; keep encoding in card YAML and integration coverage.

## Acceptance Criteria

### Tests That Must Pass

1. `test/integration/fitl-events-1964-remaining.test.ts`:
   - All 11 cards compile without errors.
   - Each card has correct `sideMode: "dual"`, correct `metadata.period === "1964"`, correct `metadata.factionOrder`.
   - Each card has `text` fields on both sides (or unshaded only for single-sided).
   - Card 15 (Medevac): has unshaded/shaded `lastingEffects` with `duration: "round"` and canonical momentum IDs/vars (`mom_medevacUnshaded`, `mom_medevacShaded`), tags include `"momentum"`.
   - Card 31 (AAA): has `setGlobalMarker` for `cap_aaa` on both sides, tags include `"capability"` and `"NVA"`.
2. `npm run build` passes.
3. `npm test` passes.
4. Any effects that cannot be expressed exactly are documented in this ticket's Outcome section with explicit follow-up scope.

### Invariants That Must Remain True

- All existing cards unchanged.
- Card IDs unique across the entire deck.
- All faction orders are exactly 4 factions, each appearing once.
- Production spec compiles without errors.

## Outcome

- Completion date: 2026-02-15
- What changed:
  - Added 11 remaining 1964 cards (`card-15`, `card-26`, `card-29`, `card-31`, `card-48`, `card-50`, `card-63`, `card-66`, `card-93`, `card-110`, `card-118`) to `data/games/fire-in-the-lake.md`.
  - Added `test/integration/fitl-events-1964-remaining.test.ts` covering:
    - card presence
    - period + faction-order metadata
    - dual-side text invariants
    - canonical momentum/capability encodings for Medevac/AAA.
  - Updated this ticket's assumptions to match the current engine and schema contracts (`setGlobalMarker` for capabilities, `lastingEffects` + `mom_*` for momentum, `rollRandom` availability).
- Deviations from original plan:
  - Card #31 validation was implemented using canonical `setGlobalMarker` (`cap_aaa`) instead of the older `setVar` assumption.
  - No `NEEDS_PRIMITIVE.md` file exists; architecture/expressiveness notes are tracked directly in ticket outcomes.
  - Card #50 ("Limited Operations") is represented using existing `freeOperationGrants` primitives without introducing kernel aliases or backward-compatibility shims.
- Verification:
  - `npm run build` passed.
  - `node --test dist/test/integration/fitl-events-1964-remaining.test.js` passed.
  - `npm test` passed.
  - `npm run lint` passed.
