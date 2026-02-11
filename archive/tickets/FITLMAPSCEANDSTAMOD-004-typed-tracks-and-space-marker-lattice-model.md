# FITLMAPSCEANDSTAMOD-004 - Typed Tracks and Space-Marker Lattice Model

**Status**: ✅ COMPLETED
**Spec**: `specs/16-fitl-map-scenario-and-state-model.md`
**References**: `specs/15a-fitl-foundation-gap-analysis-matrix.md`
**Depends on**: `FITLMAPSCEANDSTAMOD-001`

## Goal
Add generic typed-track and space-marker modeling needed for Support/Opposition, Terror/Sabotage, Aid, Patronage, Trail, Casualties, and faction Resources.

## Reassessed Assumptions
- `GameDef` already models bounded numeric variables (`globalVars`/`perPlayerVars`), but this ticket is about FITL map/scenario state typing contracts that are currently external data assets, not core `GameDef` shape.
- `initialState` and `validateGameDef` operate on compiled `GameDef`; they do not currently ingest/validate map payload semantics (`DataAssetEnvelope.payload` remains generic unless explicitly validated per kind).
- Existing data-asset loading already validates envelope metadata and piece-catalog payload semantics; map payload semantics are still unvalidated beyond ad hoc test fixture usage.
- To preserve engine agnosticism, support/opposition and marker restrictions must be encoded declaratively in data (lattice + constraints), not hardcoded FITL branches in kernel runtime logic.

## Scope (Revised)
- Add a generic map payload contract for:
  - typed numeric tracks with explicit `min`/`max`/`initial`,
  - space-marker lattice declarations with explicit states/defaults,
  - optional lattice-level state-allowance constraints by space attributes.
- Add map payload validation in the data-asset pipeline:
  - schema validation for map payload shape,
  - semantic validation for track bounds/defaults and marker state validity.
- Keep existing `GameDef`, `initialState`, and `validateGameDef` public APIs unchanged in this ticket.

## File List Expected To Touch
- `src/kernel/types.ts`
- `src/kernel/schemas.ts`
- `src/kernel/data-assets.ts`
- `src/kernel/map-model.ts` (new)
- `data/fitl/map/foundation.v1.json`
- `test/unit/data-assets.test.ts`
- `test/unit/schemas-top-level.test.ts`

## Out Of Scope
- No scenario piece placement.
- No derived control/victory recomputation implementation.
- No turn-sequence eligibility execution semantics.
- No `GameDef` schema changes or `initialState` constructor changes.

## Acceptance Criteria
## Specific Tests That Must Pass
- `test/unit/schemas-top-level.test.ts`
  - validates map payload contracts for typed tracks and marker lattices.
- `test/unit/data-assets.test.ts`
  - loads a map envelope with valid typed tracks/marker lattice declarations.
  - rejects track declarations with invalid bounds/defaults.
  - rejects marker states not declared by lattice.
  - rejects lattice constraints that reference unknown spaces.
- `npm run test:unit -- --coverage=false`

## Invariants That Must Remain True
- Track bounds are explicit and enforced by data-asset validation.
- Space marker states are lattice-declared and deterministically defaulted.
- Pop-0 and LoC support/opposition constraints remain data-representable and data-enforceable (no hardcoded FITL ids).
- Marker/track typing remains generic and reusable for non-FITL games.

## Outcome
- **Completion date**: February 11, 2026
- **What changed**:
  - Added generic map payload typing for numeric tracks, marker lattices, and per-space marker assignments.
  - Added schema + semantic map payload validation in the data-asset loader pipeline (`kind: "map"`), including bounds/default checks, lattice state validation, unknown reference checks, and declarative constraint enforcement by space attributes.
  - Extended FITL foundation map data asset to declare typed tracks and marker lattices (including Pop-0/LoC support-opposition constraints as data).
  - Added unit tests for the new schema and loader validation paths.
- **Deviation from original plan**:
  - Did not change `GameDef`, `initialState`, or `validateGameDef`; these assumptions were incorrect for current architecture because map semantics live in external data assets validated by the data-asset pipeline.
  - Preserved existing public kernel runtime APIs and kept implementation engine-agnostic by enforcing constraints through data-declared lattice rules.
- **Verification**:
  - `npm run build`
  - `npm run test:unit -- --coverage=false`
