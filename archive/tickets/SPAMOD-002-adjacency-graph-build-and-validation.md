# SPAMOD-002 - Adjacency Graph Build and Validation Diagnostics

**Status**: ✅ COMPLETED  
**Spec**: `specs/07-spatial-model.md`  
**Depends on**: `SPAMOD-001`

## Goal
Introduce a canonical, deterministic adjacency graph layer and emit explicit spatial diagnostics for malformed topology declarations.

## Assumptions Reassessed
- There is currently **no** dedicated spatial graph module (`src/kernel/spatial.ts` does not exist yet).
- `validateGameDef` currently emits only `ZONE_ADJACENCY_ASYMMETRIC` warnings for one-way edges and does not emit explicit spatial diagnostics for:
  - dangling adjacency references
  - self-loops
  - duplicate adjacency declarations
- There is currently no dedicated unit coverage for adjacency graph build/validation semantics (`test/unit/spatial-graph.test.ts` is missing).
- `validateGameDef` tests currently assert legacy adjacency warning code `ZONE_ADJACENCY_ASYMMETRIC`; this ticket will migrate adjacency diagnostics to Spec 07 spatial diagnostic codes in scope for adjacency validation.

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
- targeted unit run covering adjacency graph and GameDef validation diagnostics:
  - `node --test dist/test/unit/spatial-graph.test.js dist/test/unit/validate-gamedef.test.js`
- `npm run test:unit`

## Invariants That Must Remain True
- Every declared zone ID appears exactly once as a `neighbors` key.
- No normalized neighbor list includes unknown zone IDs.
- Graph build has no dependence on JS object iteration order.
- Existing non-spatial `validateGameDef` diagnostics remain deterministic.

## Outcome
- **Completion date**: 2026-02-10
- **What changed vs plan**:
  - Added `src/kernel/spatial.ts` with `AdjacencyGraph`, `buildAdjacencyGraph`, and `validateAdjacency`.
  - Wired adjacency validation into `validateGameDef` and exported spatial APIs from `src/kernel/index.ts`.
  - Added `test/unit/spatial-graph.test.ts` to cover graph normalization, deterministic sorting, isolated zones, and all four adjacency diagnostics.
  - Updated `test/unit/validate-gamedef.test.ts` to assert surfaced spatial adjacency diagnostics (including path/severity/message/suggestion).
- **Deviations from original plan**:
  - Replaced the legacy adjacency warning code path (`ZONE_ADJACENCY_ASYMMETRIC`) with Spec 07 spatial diagnostics for adjacency validation scope.
  - Kept implementation scoped strictly to graph build + validation diagnostics; no query/effect runtime changes were introduced.
- **Verification results**:
  - `npm run build` passed.
  - `node --test dist/test/unit/spatial-graph.test.js dist/test/unit/validate-gamedef.test.js` passed.
  - `npm run test:unit` passed.
