# Spec 31: FITL E2E Tests and Validation

**Status**: Draft
**Priority**: P0
**Complexity**: L
**Dependencies**: Spec 23–30 (all preceding specs)
**Estimated effort**: 3–4 days
**Source sections**: Brainstorming Sections 4.3, 12 (Tutorial Narrative)

## Overview

End-to-end validation proving the full FITL pipeline works correctly: Game Spec → compile → initialize → simulate → verify state. This is the ultimate acceptance gate for the FITL implementation.

## Scope

### In Scope

- **Turn 1 E2E test**: Full scenario setup → Burning Bonze card → VC shaded event → NVA pass → ARVN Train+Pacify+Govern → verify all state deltas match tutorial narrative (see Turn 1 narrative at the end of this spec)
- **13-card campaign E2E**: All 13 tutorial cards through coup round, verifying end state
- **Property tests**: Invariant checks over random play (piece conservation, variable bounds, move legality, no crashes)
- **Golden tests**: Compilation golden (Game Spec → expected GameDef JSON), trace golden (known seed → expected trace)
- **Determinism tests**: Same seed + same moves = identical final state hash

### Out of Scope

- Tutorial turns 2–13 detailed narrative (only Turn 1 is documented in brainstorming Section 12; turns 2–13 narrative must be obtained from physical rulebook)
- Full 130-card game E2E (requires all cards from Spec 29; can be added incrementally)
- Performance benchmarks (separate concern, post-validation)

## Key Data

### Turn 1 Expected State Changes

After Turn 1 (Burning Bonze):

| State Element | Before | After | Cause |
|---|---|---|---|
| Saigon Support | Passive Support | Neutral | VC shaded event: shift 1 level toward Active Opposition |
| US Victory (Support+Available) | 38 | 32 → 38 | -6 (Saigon Pop 6 loses Support), then +6 (ARVN Pacify restores) |
| Aid | 15 | 14 | -12 (VC event) + 6 (ARVN Govern: An Loc + Can Tho at 3×Pop each) + 5 (Minh leader bonus) = +(-12+6+5) = -1 net |
| ARVN Resources | 30 | 24 | -3 (Train cost) -3 (Pacify cost) = -6 |
| NVA Resources | 10 | 11 | +1 (Pass reward) |
| Saigon ARVN Troops | 2 | 8 | +6 (Train places 6 Troops from Available) |
| VC Eligibility | Eligible | Ineligible | Executed shaded Event |
| NVA Eligibility | Eligible | Eligible | Passed (returns to Eligible) |
| ARVN Eligibility | Eligible | Ineligible | Executed Operation + SA |
| US Eligibility | Eligible | Eligible | Did not act (remained Eligible) |

### Tutorial Mini-Deck Order (bottom to top)

| Position | Card # | Title |
|---|---|---|
| 13 (bottom) | 112 | Colonel Chau |
| 12 | 43 | Economic Aid |
| 11 | 51 | 301st Supply Bn |
| 10 | 17 | Claymores |
| 9 | 75 | Sihanouk |
| 8 | 125 | Coup! — Nguyen Khanh |
| 7 | 101 | Booby Traps |
| 6 | 79 | Henry Cabot Lodge |
| 5 | 97 | Brinks Hotel |
| 4 | 1 | Gulf of Tonkin |
| 3 | 68 | Green Berets |
| 2 | 55 | Trucks |
| 1 (top) | 107 | Burning Bonze |

## Implementation Tasks

### Task 31.1: Turn 1 E2E Test

Create `test/e2e/fitl-turn1.test.ts`:

1. Load Full scenario ("Nam") from Spec 24 fixture
2. Compile Game Spec to GameDef
3. Initialize game state with seed
4. Execute Turn 1 moves:
   - VC: Execute shaded Event (Burning Bonze)
   - NVA: Pass
   - ARVN: Train in Saigon (place 6 Troops) + Pacify (shift to Passive Support) + Govern (An Loc, Can Tho)
5. Verify all state deltas match the table above
6. Verify eligibility state: VC ineligible, NVA eligible, ARVN ineligible, US eligible
7. Verify current card advances to Trucks

### Task 31.2: 13-Card Campaign E2E Test

Create `test/e2e/fitl-13card-campaign.test.ts`:

1. Load Full scenario with tutorial mini-deck
2. Execute all 13 cards including coup round (Nguyen Khanh at position 8)
3. Verify coup round phases execute correctly
4. Verify final state after all 13 cards

**Note**: Detailed expected state for turns 2–13 is not yet documented in the brainstorming doc. This data must be obtained from the physical FITL rulebook tutorial section. Task 31.2 will initially verify:
- Game reaches card 13 without errors
- Coup round triggers at position 8
- Victory check occurs during coup
- All piece conservation invariants hold throughout

### Task 31.3: Property Tests

Create `test/e2e/fitl-property.test.ts`:

1. **Piece conservation**: After every move, total pieces (on map + available + out-of-play + casualties) = initial total per type
2. **Variable bounds**: All numeric track values within [min, max] after every move
3. **Move legality**: Every move returned by `legalMoves` passes all preconditions when executed
4. **No crash on random play**: Run N random games (N ≥ 1000) with `RandomAgent` — no exceptions thrown
5. **Tokens never duplicate**: No piece token appears in more than one zone simultaneously
6. **Trigger depth**: Trigger chains never exceed `maxTriggerDepth`

Property tests run against the Full scenario with random seeds.

### Task 31.4: Golden Tests

Create `test/e2e/fitl-golden.test.ts`:

1. **Compilation golden**: Full FITL Game Spec → compile → compare GameDef JSON against saved golden file
2. **Trace golden**: Known seed + known moves → simulate → compare trace against saved golden file
3. Golden files stored in `test/fixtures/golden/fitl-*.json`
4. Update golden files when intentional changes are made (not auto-update)

### Task 31.5: Determinism Tests

Create `test/e2e/fitl-determinism.test.ts`:

1. Run the same scenario with the same seed and same move sequence twice
2. Compare final state hashes — must be identical
3. Compare full traces — must be identical
4. Test with multiple seeds to ensure it's not a coincidence
5. Test with different move sequences to ensure different seeds produce different results

## Testing Requirements

### E2E Test Infrastructure
- Full compilation pipeline: Game Spec → parse → validate → compile → GameDef
- Full simulation pipeline: GameDef → initialize → simulate with agents → terminal state
- State inspection: query any aspect of GameState for assertion
- Trace capture: record all state transitions for golden comparison
- Hash computation: Zobrist hash of final state for determinism checks

### Test Data
- Full scenario fixture (from Spec 24)
- Tutorial mini-deck fixture (13 cards from Spec 29)
- Golden files (generated on first run, verified on subsequent runs)
- Multiple random seeds for property tests

## Acceptance Criteria

1. Turn 1 E2E matches tutorial narrative from brainstorming Section 12 — all state deltas verified
2. 13-card campaign completes without errors; coup round triggers correctly
3. Property tests pass for 1000+ random iterations with no invariant violations
4. Golden tests: compilation and trace match saved golden files
5. Determinism: same seed + same moves = identical final state hash (100% reproducible)
6. Build passes (`npm run build`)
7. All existing tests pass (`npm test`)

## Notes

- **Tutorial turns 2–13**: Only Turn 1 narrative is currently documented in the brainstorming doc. Turns 2–13 expected state must be obtained from the physical FITL rulebook. Until then, the 13-card campaign test verifies structural correctness (no crashes, invariants hold, coup triggers) rather than exact state matching.
- **Incremental E2E**: As more cards are encoded (Spec 29 phases), additional E2E tests can be added for longer campaigns and different scenarios.


## Reference: Tutorial & Card Definitions

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