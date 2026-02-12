# FITLSCESET-008: Piece Conservation and Golden Validation Tests

**Status**: Pending
**Priority**: P0
**Depends on**: FITLSCESET-003, FITLSCESET-004, FITLSCESET-005, FITLSCESET-006, FITLSCESET-007
**Blocks**: None (final ticket)

## Summary

Add integration tests that verify piece conservation invariants and golden victory marker values for all three FITL scenarios. These tests parse the production game spec, extract scenario data, compute derived values, and assert them against the expected golden targets from the spec.

## Detailed Description

### Test file

Create `test/integration/fitl-scenario-conservation.test.ts`.

### Piece conservation tests

For each of the 3 scenarios (`fitl-scenario-full`, `fitl-scenario-short`, `fitl-scenario-medium`):

1. Parse `data/games/fire-in-the-lake.md` and extract the scenario asset
2. Extract the piece catalog asset (`fitl-piece-catalog-production`)
3. For each piece type in the catalog inventory:
   - Sum `placed` = total count from `initialPlacements` for that piece type
   - Sum `outOfPlay` = count from `outOfPlay` for that piece type (0 if absent)
   - `available` = `total` - `placed` - `outOfPlay`
   - Assert `available >= 0` (no piece type goes negative)
   - Assert `placed + outOfPlay + available === total`
4. Assert placed counts match the exact conservation table values from the spec

### Golden victory marker tests

For each scenario, compute victory markers using FITL rule 1.9 formulas:

| Marker | Formula |
|--------|---------|
| US | Total Support + Available US Troops + Available US Bases |
| ARVN | Total COIN-Controlled Population + Patronage |
| VC | Total Opposition + VC Bases on map |
| NVA | Total NVA-Controlled Population + NVA Bases on map |

Where:
- **Total Support**: sum of `pop * weight` for each space, where Active Support = pop*2, Passive Support = pop*1
- **Total Opposition**: sum of `pop * weight` for each space, where Active Opposition = pop*2, Passive Opposition = pop*1
- **COIN-Controlled Population**: sum of `pop` for spaces where COIN forces > Insurgent forces (COIN = US troops + US bases + US irregulars + ARVN troops + ARVN police + ARVN rangers + ARVN bases; Insurgent = NVA troops + NVA guerrillas + NVA bases + VC guerrillas + VC bases)
- **NVA-Controlled Population**: sum of `pop` for spaces where NVA forces alone > all other forces

Golden values:

| Scenario | US | ARVN | VC | NVA |
|----------|----|----- |----|-----|
| Full | 38 | 35 | 27 | 4 |
| Short | 38 | 41 | 23 | 10 |
| Medium | 37 | 44 | 23 | 8 |

### TotalEcon golden test

For each scenario, compute `totalEcon` = sum of econ values of COIN-controlled LoCs. Assert it equals 15 for all three scenarios.

### Control annotation tests

For a selection of key spaces per scenario, verify that the control derived from piece counts matches expectations (e.g., Saigon is COIN-controlled in all scenarios).

## Files to Touch

| File | Change |
|------|--------|
| `test/integration/fitl-scenario-conservation.test.ts` | New file — piece conservation + golden validation tests |

## Out of Scope

- Type definitions, schemas, validator logic (all in earlier tickets)
- Scenario data encoding (FITLSCESET-004/005/006)
- Modifying any source files under `src/`
- Modifying `data/games/fire-in-the-lake.md`
- Deck shuffling or turn flow tests
- Testing scenario selection UI
- Non-FITL scenarios

## Acceptance Criteria

### Tests That Must Pass

- `npm run build` passes
- `npm test` — all tests pass, including the new test file
- Specifically, the following test cases must exist and pass:
  - `piece conservation — full scenario` (12 piece types checked)
  - `piece conservation — short scenario` (12 piece types checked)
  - `piece conservation — medium scenario` (12 piece types checked)
  - `golden victory markers — full scenario` (US=38, ARVN=35, VC=27, NVA=4)
  - `golden victory markers — short scenario` (US=38, ARVN=41, VC=23, NVA=10)
  - `golden victory markers — medium scenario` (US=37, ARVN=44, VC=23, NVA=8)
  - `totalEcon — all scenarios` (15 for each)

### Invariants That Must Remain True

- No source files modified
- No data files modified
- All existing tests continue to pass
- Tests derive values from the data (parse + compute), not from hardcoded intermediate values
- Tests use the same `parseGameSpec` pipeline as the compiler (not custom YAML parsing)
