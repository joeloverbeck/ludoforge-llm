# FITLOPEFULEFF-003: Global Mechanics Variables and Guards

**Status**: COMPLETED
**Priority**: P0 (blocker — profiles reference these globals)
**Estimated effort**: Small (1-2 hours)
**Spec reference**: Spec 26, "Global Mechanics" section
**Depends on**: None

## Summary

Ensure the FITL GameSpecDoc and test fixtures declare all global variables and marker definitions required by the 16 operation profiles. This includes:

1. **`terrorSabotageMarkersPlaced`** (int, init: 0, max: 15) — shared Terror/Sabotage marker supply
2. **`aid`** (int) — modified by Assault base removal
3. **`arvnResources`**, **`nvaResources`**, **`vcResources`** — faction resource pools
4. **`trail`** (int, init: 1, min: 0, max: 4) — Ho Chi Minh Trail value
5. **`patronage`** (int) — US patronage transfer
6. **`totalEcon`** (int) — for US Joint Operations constraint

Also verify that zone definitions include the required properties: `spaceType`, `population`, `terrainTags`, `control`, marker lattices (`supportOpposition`, `terror`, `sabotage`).

## Files to Touch

- `test/fixtures/cnl/compiler/fitl-operations-coin.md` — Add missing globalVars, zone definitions with required properties
- `test/fixtures/cnl/compiler/fitl-operations-insurgent.md` — Add missing globalVars, zone definitions with required properties
- `data/games/fire-in-the-lake.md` — Verify/add all global variables
- `test/fixtures/cnl/compiler/fitl-joint-operations.md` — Verify `totalEcon` variable exists

## Out of Scope

- Operation profile YAML (subsequent tickets)
- Kernel type changes
- New zone definitions beyond what's needed for operation tests
- Scenario setup (full board state) — that's Spec 23 territory

## Acceptance Criteria

### Tests That Must Pass
1. `fitl-operations-coin.md` fixture compiles without diagnostics after globalVar additions
2. `fitl-operations-insurgent.md` fixture compiles without diagnostics after globalVar additions
3. Existing `fitl-coin-operations.test.ts` continues to pass
4. Existing `fitl-insurgent-operations.test.ts` continues to pass
5. Existing `fitl-joint-operations.test.ts` continues to pass

### Invariants
- No kernel source files modified
- No compiler source files modified
- Zone definitions from Spec 23 are NOT altered (only extended if needed)
- Build passes (`npm run build`)
- Typecheck passes (`npm run typecheck`)

## Outcome

**Completed**: 2026-02-13

### Changes Made
- **COIN fixture** (`fitl-operations-coin.md`): Added 7 globalVars — `terrorSabotageMarkersPlaced`, `arvnResources`, `nvaResources`, `vcResources`, `trail`, `patronage`, `totalEcon`
- **Insurgent fixture** (`fitl-operations-insurgent.md`): Added 8 globalVars — same 7 plus `aid`
- **Production data** (`fire-in-the-lake.md`): Added `terrorSabotageMarkersPlaced` track (global, 0–15), `terror` marker lattice, `sabotage` marker lattice
- **Tests updated**: `fitl-production-tracks.test.ts`, `fitl-production-lattice.test.ts`, `fitl-production-data-compilation.test.ts` — updated assertions for new track and lattice counts
- **Joint operations fixture** (`fitl-joint-operations.md`): Verified `totalEcon` already present — no changes needed

### Deviations
- Zone spatial properties (`spaceType`, `population`, `terrainTags`) live on `MapSpaceDef` in data assets, not on `ZoneDef`. Existing `board:none` zones are sufficient for compilation. Future operation profile tickets will need representative data assets for runtime `zoneProp` lookups.

### Verification
- Build: clean
- Typecheck: clean
- All 974 tests pass (0 failures)
- No kernel or compiler source files modified
