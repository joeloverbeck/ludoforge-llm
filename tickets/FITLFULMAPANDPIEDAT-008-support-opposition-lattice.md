# FITLFULMAPANDPIEDAT-008: Encode Support/Opposition SpaceMarkerLatticeDef

**Spec**: 23, Task 23.7
**Priority**: P0
**Depends on**: FITLFULMAPANDPIEDAT-001
**Blocks**: FITLFULMAPANDPIEDAT-009

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
