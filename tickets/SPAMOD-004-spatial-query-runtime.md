# SPAMOD-004 - Spatial Query Runtime (`adjacentZones`, `tokensInAdjacentZones`, `connectedZones`)

**Status**: Proposed  
**Spec**: `specs/07-spatial-model.md`  
**Depends on**: `SPAMOD-001`, `SPAMOD-002`, `SPAMOD-003`

## Goal
Replace spatial query stubs with deterministic implementations, including bounded BFS semantics and query cardinality enforcement.

## Scope
- Implement query helpers in `spatial.ts`:
  - `queryAdjacentZones`
  - `queryTokensInAdjacentZones`
  - `queryConnectedZones`
- Update `evalQuery` to dispatch spatial queries instead of throwing `SPATIAL_NOT_IMPLEMENTED`.
- Enforce Spec 07 semantics:
  - deterministic neighbor traversal order
  - BFS discovery ordering for `connectedZones`
  - `includeStart` and `maxDepth` behavior
  - optional `via` filter with `$zone` binding
  - `maxQueryResults` bounds enforcement

## File List Expected To Touch
- `src/kernel/spatial.ts`
- `src/kernel/eval-query.ts`
- `test/unit/eval-query.test.ts`
- `test/unit/spatial-queries.test.ts` (new)

## Out Of Scope
- `adjacent`/`connected` condition operators in `evalCondition`.
- `moveTokenAdjacent` effect runtime.
- Adjacency diagnostics and graph build behavior.
- CNL macro expansion.

## Acceptance Criteria
## Specific Tests That Must Pass
- `test/unit/spatial-queries.test.ts`
  - `adjacentZones` returns sorted normalized neighbors.
  - `tokensInAdjacentZones` returns zone-major then token-order traversal.
  - `connectedZones` handles cycles without duplicates.
  - `connectedZones` supports include/exclude start.
  - `connectedZones` honors `maxDepth` (`0`, `1`, unrestricted default).
  - `connectedZones` applies `via` using `$zone` binding.
  - all spatial queries respect `maxQueryResults`.
- `test/unit/eval-query.test.ts`
  - previous spatial stub expectations are replaced with concrete behavior assertions.
- `npm test`

## Invariants That Must Remain True
- Spatial query outputs are deterministic for identical input state.
- `connectedZones` always terminates and never returns duplicates.
- No spatial query returns zone IDs not present in `GameDef.zones`.

