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

- **Turn 1 E2E test**: Full scenario setup → Burning Bonze card → VC shaded event → NVA pass → ARVN Train+Pacify+Govern → verify all state deltas match tutorial narrative (brainstorming Section 12)
- **13-card campaign E2E**: All 13 tutorial cards through coup round, verifying end state
- **Property tests**: Invariant checks over random play (piece conservation, variable bounds, move legality, no crashes)
- **Golden tests**: Compilation golden (Game Spec → expected GameDef JSON), trace golden (known seed → expected trace)
- **Determinism tests**: Same seed + same moves = identical final state hash

### Out of Scope

- Tutorial turns 2–13 detailed narrative (only Turn 1 is documented in brainstorming Section 12; turns 2–13 narrative must be obtained from physical rulebook)
- Full 130-card game E2E (requires all cards from Spec 29; can be added incrementally)
- Performance benchmarks (separate concern, post-validation)

## Key Data

### Turn 1 Expected State Changes (from Section 12)

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
