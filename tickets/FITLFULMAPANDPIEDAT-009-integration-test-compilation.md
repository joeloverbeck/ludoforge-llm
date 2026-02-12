# FITLFULMAPANDPIEDAT-009: Integration test — full GameSpecDoc compiles without errors

**Spec**: 23 (Integration Testing Requirements)
**Priority**: P0
**Depends on**: FITLFULMAPANDPIEDAT-004, FITLFULMAPANDPIEDAT-006, FITLFULMAPANDPIEDAT-007, FITLFULMAPANDPIEDAT-008 (all data must be complete)
**Blocks**: Nothing (final ticket in Spec 23)

## Description

Create an integration test that exercises the complete `data/games/fire-in-the-lake.md` GameSpecDoc through the existing compiler pipeline: `parseGameSpec → validateGameSpec`. This is the capstone verification that all data from tickets 001–008 is structurally valid and internally consistent.

This test does NOT compile to a full `GameDef` (that requires actions, setup, etc. from later specs). It verifies the data asset payloads parse and validate without errors.

## File list

| File | Action |
|------|--------|
| `test/integration/fitl-production-data-compilation.test.ts` | **Create** |

## Out of scope

- Fixing data errors in `data/games/fire-in-the-lake.md` (if errors are found, they should be addressed in the appropriate ticket 002–008)
- Any changes to `src/` code
- Any changes to existing test fixtures
- Full GameDef compilation (requires actions, setup, etc. from Spec 24+)
- Scenario data validation (Spec 24)

## Acceptance criteria

### Tests that must pass

- `npm run build` succeeds
- `npm test` passes
- New integration test `test/integration/fitl-production-data-compilation.test.ts`:
  - Reads `data/games/fire-in-the-lake.md` from disk
  - Calls `parseGameSpec()` — asserts no parse errors
  - Calls `validateGameSpec()` — asserts no validation errors
  - **Cross-cutting invariants** (validated holistically):
    - Exactly 47 spaces in the map
    - Adjacency graph is symmetric (every A→B implies B→A)
    - Sum of inventory totals = 229
    - All 12 piece types present
    - All 7 numeric tracks present
    - Support/Opposition lattice present with 5 states
    - Every LoC has at least one of `highway` or `mekong` terrain tags
    - Every space referenced in `adjacentTo` arrays exists in the spaces list
    - No space references itself in `adjacentTo`
  - All existing FITL integration tests (`test/integration/fitl-*.test.ts`) still pass

### Invariants that must remain true

- No existing test file is modified
- No `src/` file is modified
- The `test/fixtures/cnl/compiler/fitl-*.md` fixtures remain unchanged
- All prior Spec 23 ticket tests continue to pass
