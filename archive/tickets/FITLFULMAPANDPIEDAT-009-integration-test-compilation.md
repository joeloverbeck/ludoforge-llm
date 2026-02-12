# FITLFULMAPANDPIEDAT-009: Integration test — full GameSpecDoc compiles without errors

**Status**: ✅ COMPLETED
**Spec**: 23 (Integration Testing Requirements)
**Priority**: P0
**Depends on**: FITLFULMAPANDPIEDAT-004, FITLFULMAPANDPIEDAT-006, FITLFULMAPANDPIEDAT-007, FITLFULMAPANDPIEDAT-008 (all data must be complete)
**Blocks**: Nothing (final ticket in Spec 23)

## Description

Create an integration test that exercises the complete `data/games/fire-in-the-lake.md` GameSpecDoc through the existing compiler pipeline: `parseGameSpec → validateGameSpec`. This is the capstone verification that all production FITL data from Spec 23 is structurally valid and internally consistent.

This test does NOT compile to a full `GameDef` (that requires actions, setup, etc. from later specs). It verifies parse success and a constrained validation profile appropriate for the current data scaffold.

## Assumptions Reassessed (codebase reality)

- `data/games/fire-in-the-lake.md` already exists and is populated.
- FITL production invariants are already heavily covered by unit tests in `test/unit/fitl-production-*.test.ts`.
- An integration test file already exists for generic end-to-end parse/validate behavior (`test/integration/parse-validate-full-spec.test.ts`), but it does not target the production FITL document directly.
- `validateGameSpec()` currently enforces full GameSpec sections (`actions`, `turnStructure`, `endConditions`, `metadata.players`) and scenario asset references. The production data file is a data scaffold and intentionally does not satisfy full-game requirements yet.
- Therefore, this ticket's value is a dedicated FITL production integration assertion, not introducing the production data itself.

## File list

| File | Action |
|------|--------|
| `test/integration/fitl-production-data-compilation.test.ts` | **Create** |

## Out of scope

- Fixing data errors in `data/games/fire-in-the-lake.md` (if errors are found, they should be addressed in the appropriate ticket 002–008)
- Any changes to `src/` code unless strictly required to make parse/validate runnable for this test
- Any changes to existing test fixtures
- Full GameDef compilation (requires actions, setup, etc. from Spec 24+)
- Scenario data validation (Spec 24)
- Refactoring existing unit tests (they already cover most FITL production invariants)

## Acceptance criteria

### Tests that must pass

- `npm run build` succeeds
- `npm test` passes
- New integration test `test/integration/fitl-production-data-compilation.test.ts`:
  - Reads `data/games/fire-in-the-lake.md` from disk
  - Calls `parseGameSpec()` — asserts no parse errors
  - Calls `validateGameSpec()` — asserts diagnostics are limited to known full-spec/scenario-placeholder errors and that no unexpected map/piece payload diagnostics appear
  - **Cross-cutting invariants** (validated holistically in one integration flow, even if also covered by unit tests):
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

- Existing tests remain functionally valid; avoid unnecessary modifications
- No `src/` file is modified
- The `test/fixtures/cnl/compiler/fitl-*.md` fixtures remain unchanged
- All prior Spec 23 ticket tests continue to pass

## Outcome

- Completion date: 2026-02-12
- Actually changed:
  - Added `test/integration/fitl-production-data-compilation.test.ts`.
  - Reassessed and corrected ticket assumptions about validator behavior and baseline test coverage.
  - Implemented integration assertions for parse success, expected validation profile, and cross-cutting FITL data invariants (47 spaces, adjacency checks, inventory sum 229, 12 piece types, 7 tracks, support/opposition lattice, LoC tag constraints).
- Deviations from original plan:
  - Original ticket expected zero `validateGameSpec()` diagnostics; this was corrected to a scoped expected-diagnostic profile because `data/games/fire-in-the-lake.md` is a data scaffold, not a full GameSpec.
- Verification results:
  - `npm run build` passed.
  - `npm test` passed.
  - `npm run lint` passed.
