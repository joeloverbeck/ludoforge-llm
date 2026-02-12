# FITLFULMAPANDPIEDAT-008: Encode Support/Opposition SpaceMarkerLatticeDef

**Status**: ✅ COMPLETED
**Spec**: 23, Task 23.7
**Priority**: P0
**Depends on**: FITLFULMAPANDPIEDAT-002, FITLFULMAPANDPIEDAT-003
**Blocks**: FITLFULMAPANDPIEDAT-009

## Reassessed assumptions (2026-02-12)

- **Confirmed**: `data/games/fire-in-the-lake.md` already contains `fitl-map-production` with complete space definitions and numeric tracks, but no `markerLattices` section yet.
- **Confirmed**: Shared map payload contracts already support `markerLattices`/constraints and validate `spaceTypes` + `populationEquals`, so no `src/` runtime/compiler changes are required for this ticket.
- **Confirmed**: There is currently no production FITL unit test dedicated to lattice definitions.
- **Scope update**: This ticket should add the Support/Opposition lattice definition and a focused production unit test only; no scenario marker values (`spaceMarkers`) are added here.

## Description

Add the `markerLattices` array to the map data asset payload in `data/games/fire-in-the-lake.md` with the Support/Opposition lattice definition.

**Lattice definition**:

```yaml
markerLattices:
  - id: supportOpposition
    states: [activeOpposition, passiveOpposition, neutral, passiveSupport, activeSupport]
    defaultState: neutral
    constraints:
      - spaceTypes: [loc]
        allowedStates: [neutral]
      - populationEquals: 0
        allowedStates: [neutral]
```

**Semantics**:
- The 5 states represent an ordinal scale from Active Opposition through Neutral to Active Support.
- **LoC constraint**: LoC spaces can only be `neutral` (they don't have support/opposition markers in the physical game).
- **Pop-0 constraint**: Population-0 spaces can only be `neutral` (no support/opposition markers for uninhabited areas).
- Actual space marker values (initial support/opposition per scenario) are set in Spec 24, not here. No `spaceMarkers` entries are added in this ticket.

## File list

| File | Action |
|------|--------|
| `data/games/fire-in-the-lake.md` | **Edit** (add `markerLattices` array to map payload) |
| `test/unit/fitl-production-lattice.test.ts` | **Create** |

## Out of scope

- Space marker initial values per scenario (Spec 24)
- Map spaces, adjacency, pieces (tickets 002–006)
- Numeric tracks (ticket 007)
- Any changes to `src/` code
- Any changes to existing test fixtures

## Acceptance criteria

### Tests that must pass

- `npm run build` succeeds
- `npm test` passes
- New unit test `test/unit/fitl-production-lattice.test.ts`:
  - Parses the map asset from `data/games/fire-in-the-lake.md`
  - Asserts exactly 1 marker lattice definition
  - **Lattice ID**: `supportOpposition`
  - **States**: Exactly 5 states in correct order: `activeOpposition`, `passiveOpposition`, `neutral`, `passiveSupport`, `activeSupport`
  - **Default state**: `neutral`
  - **Constraints count**: Exactly 2 constraints
  - **LoC constraint**: One constraint with `spaceTypes: ['loc']` and `allowedStates: ['neutral']`
  - **Pop-0 constraint**: One constraint with `populationEquals: 0` and `allowedStates: ['neutral']`
  - **No spaceMarkers**: The `spaceMarkers` array is either absent or empty (values come from Spec 24)

### Invariants that must remain true

- No existing test file is modified
- No `src/` file is modified
- The `test/fixtures/cnl/compiler/fitl-*.md` fixtures remain unchanged

## Outcome

- **Completion date**: 2026-02-12
- **What changed**:
  - Added `markerLattices` to `fitl-map-production` in `data/games/fire-in-the-lake.md` with `supportOpposition`, 5 ordered states, `neutral` default, and both LoC/pop-0 neutral constraints.
  - Added `test/unit/fitl-production-lattice.test.ts` to verify lattice shape, ordering, constraints, and that `spaceMarkers` are absent/empty in this ticket.
- **Deviations from original plan**:
  - Ticket dependency assumption was corrected from `FITLFULMAPANDPIEDAT-001` to `FITLFULMAPANDPIEDAT-002, FITLFULMAPANDPIEDAT-003` because lattice constraints rely on existing full map space definitions.
- **Verification**:
  - `npm run build` passed.
  - `npm run test:unit -- --test-name-pattern "FITL production support/opposition marker lattice|FITL production numeric tracks|FITL production map"` passed.
  - `npm test` passed.
