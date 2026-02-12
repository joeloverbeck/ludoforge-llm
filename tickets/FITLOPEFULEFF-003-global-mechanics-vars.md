# FITLOPEFULEFF-003: Global Mechanics Variables and Guards

**Status**: Pending
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
