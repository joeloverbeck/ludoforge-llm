# SPAMOD-002 - Adjacency Graph Build and Validation Diagnostics

**Status**: Proposed  
**Spec**: `specs/07-spatial-model.md`  
**Depends on**: `SPAMOD-001`

## Goal
Introduce a canonical, deterministic adjacency graph layer and emit explicit spatial diagnostics for malformed topology declarations.

## Scope
- Add a new spatial module with:
  - `buildAdjacencyGraph(zones)`
  - `validateAdjacency(graph, zones)`
  - immutable `AdjacencyGraph` type
- Normalize runtime adjacency as undirected.
- Deduplicate and lexicographically sort neighbor lists.
- Emit diagnostics:
  - `SPATIAL_DANGLING_ZONE_REF` (`error`)
  - `SPATIAL_ASYMMETRIC_EDGE_NORMALIZED` (`warning`)
  - `SPATIAL_SELF_LOOP` (`error`)
  - `SPATIAL_DUPLICATE_NEIGHBOR` (`warning`)
- Wire adjacency diagnostics into `validateGameDef`.

## File List Expected To Touch
- `src/kernel/spatial.ts` (new)
- `src/kernel/validate-gamedef.ts`
- `src/kernel/index.ts`
- `test/unit/spatial-graph.test.ts` (new)
- `test/unit/validate-gamedef.test.ts`

## Out Of Scope
- Query traversal (`connectedZones`) and condition evaluation logic.
- Effect runtime (`moveTokenAdjacent`).
- CNL board macro generation.
- Broad diagnostic-code renaming outside spatial adjacency concerns.

## Acceptance Criteria
## Specific Tests That Must Pass
- `test/unit/spatial-graph.test.ts`
  - symmetric graph build is preserved.
  - asymmetric declaration normalizes runtime graph and emits warning.
  - self-loop emits error.
  - duplicate neighbor emits warning and is deduplicated at runtime.
  - dangling neighbor reference emits error.
  - isolated zones are present with empty neighbor arrays.
  - neighbor ordering is deterministic lexical order.
- `test/unit/validate-gamedef.test.ts`
  - spatial adjacency diagnostics are surfaced with path/severity/message/suggestion.
- `npm run test:unit -- --test-name-pattern spatial` (or equivalent targeted unit run)

## Invariants That Must Remain True
- Every declared zone ID appears exactly once as a `neighbors` key.
- No normalized neighbor list includes unknown zone IDs.
- Graph build has no dependence on JS object iteration order.
- Existing non-spatial `validateGameDef` diagnostics remain deterministic.

