# FITLMAPSCEANDSTAMOD-002 - FITL Map Space and Adjacency Dataset

**Status**: ✅ COMPLETED
**Spec**: `specs/16-fitl-map-scenario-and-state-model.md`
**References**: `brainstorming/implement-fire-in-the-lake-foundation.md`
**Depends on**: `FITLMAPSCEANDSTAMOD-001`

## Goal
Author the first concrete FITL foundation map dataset (space taxonomy + adjacency graph) as a versioned asset, and enforce deterministic adjacency declaration ordering in validation.

## Assumptions Reassessed
- Ticket `FITLMAPSCEANDSTAMOD-001` introduced a generic `DataAssetEnvelope` scaffold only (`id`, `version`, `kind`, `payload`); there is no per-kind payload schema enforcement pipeline yet.
- The repo currently has no concrete map dataset under `data/fitl/map/`.
- Spatial validation already rejects unknown adjacency endpoints and self-loops, but it does not currently reject unsorted `adjacentTo` declarations.
- Existing spatial golden tests cover macro-generated topologies (grid/hex), not a FITL map asset fixture.

## Scope (Revised)
- Add a concrete FITL foundation map asset envelope at `data/fitl/map/foundation.v1.json` with:
  - Province/City/LoC/foreign-country taxonomy.
  - Attributes (`population`, `econ`, `terrainTags`, `country`, `coastal`).
  - Deterministically sorted `adjacentTo` declarations.
  - Optional `provisionalAdjacency` annotations in payload metadata (data-only; no runtime semantic changes).
- Add a valid fixture `test/fixtures/gamedef/fitl-map-foundation-valid.json` that exercises the map zones as `GameDef.zones`.
- Extend spatial validation to emit an error when `adjacentTo` is not lexicographically sorted, preserving all current APIs.
- Add/adjust unit tests to cover FITL map asset adjacency canonicalization and unsorted adjacency rejection.

## File List Expected To Touch
- `data/fitl/map/foundation.v1.json` (new)
- `test/fixtures/gamedef/fitl-map-foundation-valid.json` (new)
- `test/unit/spatial-graph.test.ts`
- `test/unit/spatial.golden.test.ts`
- `test/unit/validate-gamedef.test.ts`
- `src/kernel/spatial.ts`

## Out Of Scope
- No per-map payload schema compiler/validator pipeline changes in this ticket (still handled by generic envelope schema only).
- No scenario setup or piece placement.
- No resources/tracks/marker initialization.
- No movement or turn-flow semantics.
- No historical-artwork extraction automation for adjacency.

## Acceptance Criteria
## Specific Tests That Must Pass
- `test/unit/validate-gamedef.test.ts`
  - rejects unknown adjacency endpoints.
  - rejects self-loop edges.
  - rejects unsorted adjacency lists via spatial diagnostics.
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

## Outcome
- Completed on 2026-02-11.
- Added concrete FITL map asset data at `data/fitl/map/foundation.v1.json` with taxonomy attributes, deterministic adjacency declarations, and provisional adjacency annotations in payload metadata.
- Added fixture `test/fixtures/gamedef/fitl-map-foundation-valid.json` to validate spatial invariants against a concrete `GameDef` shape.
- Extended spatial validation to reject non-lexicographically-sorted `adjacentTo` lists with `SPATIAL_NEIGHBORS_UNSORTED` errors.
- Added/updated unit tests to cover:
  - canonical graph construction from the FITL asset,
  - stable FITL adjacency golden snapshot,
  - unsorted adjacency rejection,
  - no-diagnostic validation of FITL fixture.
- Deviation from original proposed scope:
  - Did not introduce `data/fitl/map/foundation.v1.schema.json` because current architecture (from ticket `FITLMAPSCEANDSTAMOD-001`) validates generic data-asset envelopes only; per-map payload schema pipeline remains out of scope for this ticket.
- Verification:
  - `npm run build`
  - `npm run test:unit -- --coverage=false`
