# SPAMOD-004 - Spatial Query Runtime (`adjacentZones`, `tokensInAdjacentZones`, `connectedZones`)

**Status**: ✅ COMPLETED  
**Spec**: `specs/07-spatial-model.md`  
**Depends on**: `SPAMOD-001`, `SPAMOD-002`, `SPAMOD-003`

## Goal
Replace remaining spatial query stubs with deterministic implementations, including bounded BFS semantics and query cardinality enforcement.

## Assumption Reassessment (2026-02-10)
- `AdjacencyGraph` construction and adjacency diagnostics are already implemented in `src/kernel/spatial.ts`.
- `EvalContext` already threads `adjacencyGraph`.
- Spatial query schemas/types for `adjacentZones`, `tokensInAdjacentZones`, and `connectedZones` already exist.
- `test/unit/spatial-graph.test.ts` already exists and covers graph normalization/diagnostics behavior.
- Primary gap is runtime evaluation: `evalQuery` still throws `SPATIAL_NOT_IMPLEMENTED` for spatial query variants, and spatial query helper functions are not yet present.

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

## Outcome
- Completion date: 2026-02-10
- Implemented:
  - Added `queryAdjacentZones`, `queryTokensInAdjacentZones`, and `queryConnectedZones` to `src/kernel/spatial.ts`.
  - Replaced spatial query stubs in `src/kernel/eval-query.ts` with concrete runtime dispatch and `maxQueryResults` enforcement.
  - Added `test/unit/spatial-queries.test.ts` and updated `test/unit/eval-query.test.ts` to validate concrete spatial behavior.
- Deviations from original plan:
  - No adjacency graph/diagnostic changes were needed because those were already implemented and covered by existing tests.
- Verification:
  - `npm run build`
  - `node --test dist/test/unit/eval-query.test.js dist/test/unit/spatial-queries.test.js`
  - `npm test`
