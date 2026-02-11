# FITLMAPSCEANDSTAMOD-002 - FITL Map Space and Adjacency Dataset

**Status**: Proposed
**Spec**: `specs/16-fitl-map-scenario-and-state-model.md`
**References**: `brainstorming/implement-fire-in-the-lake-foundation.md`
**Depends on**: `FITLMAPSCEANDSTAMOD-001`

## Goal
Author the foundation FITL map dataset (space taxonomy + adjacency graph) as versioned assets with deterministic ordering and provisional-edge annotations.

## Scope
- Create a map asset covering Province/City/LoC/foreign-country classification.
- Encode required attributes: population, econ, terrain tags, country tag, coastal flag.
- Encode explicit adjacency lists with deterministic neighbor ordering.
- Mark uncertain edges as provisional in data for later replacement.

## File List Expected To Touch
- `data/fitl/map/foundation.v1.json` (new)
- `data/fitl/map/foundation.v1.schema.json` (new)
- `test/fixtures/gamedef/fitl-map-foundation-valid.json` (new)
- `test/unit/spatial-graph.test.ts`
- `test/unit/spatial.golden.test.ts`
- `test/unit/validate-gamedef.test.ts`

## Out Of Scope
- No scenario setup or piece placement.
- No resources/tracks/marker initialization.
- No movement or turn-flow semantics.
- No historical-artwork extraction automation for adjacency.

## Acceptance Criteria
## Specific Tests That Must Pass
- `test/unit/validate-gamedef.test.ts`
  - rejects unknown adjacency endpoints.
  - rejects self-loop edges.
  - rejects unsorted adjacency lists.
- `test/unit/spatial-graph.test.ts`
  - builds canonical adjacency graph from FITL map asset.
- `test/unit/spatial.golden.test.ts`
  - golden snapshot for canonical FITL map zone ids and neighbors is stable.
- `npm run test:unit -- --coverage=false`

## Invariants That Must Remain True
- No unknown space ids in adjacency edges.
- No adjacency self-loops.
- Neighbor iteration order is deterministic and stable across runs.
- Map data lives under `data/fitl/...`, not hardcoded in runtime modules.
