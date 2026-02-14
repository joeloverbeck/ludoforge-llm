# FITLEVECARENC-002: Tutorial Cards Batch 1 — Simple Resource/Marker Cards

**Status**: TODO
**Priority**: P1
**Complexity**: M
**Parent spec**: specs/29-fitl-event-card-encoding.md (Task 29.1, Phase 1)
**Depends on**: FITLEVECARENC-001

## Description

Encode the low-complexity tutorial cards that involve simple resource changes, marker shifts, and piece placement — no capabilities, no momentum, no lasting effects. These are:

| # | Title | Key Effects |
|---|-------|-------------|
| 107 | Burning Bonze | Patronage +3/+6 conditional; shift Saigon, Aid -12 |
| 43 | Economic Aid | Bases out-of-play to Available; ARVN Resources +6 or Aid +12; Trail improve + NVA Resources |
| 79 | Henry Cabot Lodge | Aid +20; remove ARVN pieces, Patronage changes |
| 112 | Colonel Chau | Place Police in Provinces; shift + place VC |

## Files to Touch

- `data/games/fire-in-the-lake.md` — Add 4 card definitions to the `eventDecks[0].cards` array.
- `test/integration/fitl-events-tutorial-simple.test.ts` — **New file**. Integration tests for cards 107, 43, 79, 112.

## Out of Scope

- Capability-granting cards (Booby Traps #101).
- Momentum-granting cards (Claymores #17).
- Coup cards (#125).
- Cards requiring complex multi-step operations (Gulf of Tonkin #1, Trucks #55).
- Cards with free operations (Brinks Hotel #97, Sihanouk #75).
- 301st Supply Bn (#51) — has die roll, medium complexity.
- Any kernel/compiler changes.

## Acceptance Criteria

### Tests That Must Pass

1. `test/integration/fitl-events-tutorial-simple.test.ts`:
   - Card 107 (Burning Bonze): compiles, `sideMode: "dual"`, `metadata.period === "1964"`, `metadata.factionOrder` is `["VC", "NVA", "ARVN", "US"]`. Unshaded has conditional (`if` with `markerState` check on Saigon) for patronage +3/+6. Shaded has `shiftMarker` on Saigon toward Active Opposition and `addVar` for aid -12.
   - Card 43 (Economic Aid): compiles, `sideMode: "dual"`, `metadata.period === "1964"`. Unshaded has branches or effects for bases return + resource/aid boost. Shaded has Trail improvement + NVA Resources.
   - Card 79 (Henry Cabot Lodge): compiles, `sideMode: "dual"`, `metadata.period === "1964"`. Unshaded effects include `addVar` for aid +20. Shaded has piece removal + patronage changes.
   - Card 112 (Colonel Chau): compiles, `sideMode: "dual"`, `metadata.period === "1964"`. Unshaded places Police. Shaded shifts provinces + places VC.
2. `npm run build` passes.
3. `npm test` passes.

### Invariants That Must Remain True

- All existing cards (27, 68, 82) unchanged.
- Card IDs follow the `card-{number}` convention.
- All faction orders are exactly 4 factions, each appearing once.
- Production spec compiles without errors.
