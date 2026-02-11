# FITLMAPSCEANDSTAMOD-003 - Piece Catalog, Status Dimensions, and Inventory Contracts

**Status**: ✅ COMPLETED
**Spec**: `specs/16-fitl-map-scenario-and-state-model.md`
**References**: `specs/15a-fitl-foundation-gap-analysis-matrix.md`, `brainstorming/implement-fire-in-the-lake-foundation.md`
**Depends on**: none

## Goal
Introduce generic data-asset schema/validator support for piece-status dimensions (Underground/Active/Tunneled eligibility) and inventory declarations needed for FITL setup.

## Reassessed Assumptions
- Current codebase supports only `map` and `scenario` data-asset kinds; `pieceCatalog` is currently rejected by schema/tests.
- `validateGameDef` validates compiled game defs, not external data-asset envelopes. Piece-catalog validation should occur in the data-asset pipeline first.
- There is no existing scenario loader in scope in this repository state; full inventory conservation against scenario allocations belongs to the scenario ticket (`FITLMAPSCEANDSTAMOD-005`).
- Diagnostic asset context (`assetPath`, `entityId`) already exists in `loadDataAssetEnvelopeFromFile` and should be reused for piece-catalog errors.

## Scope
- Add `pieceCatalog` as a supported generic data-asset kind.
- Define a piece-catalog payload contract for:
  - piece types with declared status dimensions,
  - status-transition edges,
  - inventory totals by piece type/faction.
- Add data-asset-time validation for:
  - transition dimensions not declared by a piece type,
  - invalid status values for a declared dimension,
  - negative totals,
  - missing inventory totals for declared piece types.
- Keep validation data-driven and engine-agnostic.

## File List Expected To Touch
- `src/kernel/schemas.ts`
- `src/kernel/types.ts`
- `src/kernel/data-assets.ts`
- `src/kernel/piece-catalog.ts` (new)
- `schemas/DataAssetEnvelope.schema.json`
- `data/fitl/pieces/foundation.v1.json` (new)
- `test/unit/data-assets.test.ts`
- `test/unit/schemas-top-level.test.ts`
- `test/unit/json-schema.test.ts`

## Out Of Scope
- No scenario placements by space.
- No operation/event rules for flipping/placing/removing pieces.
- No runtime apply-move logic changes.
- No `validateGameDef` changes for scenario/map conservation yet.

## Acceptance Criteria
## Specific Tests That Must Pass
- `test/unit/data-assets.test.ts`
  - loads a valid `pieceCatalog` envelope.
  - rejects illegal status dimensions for piece types that do not declare them.
  - rejects invalid status-transition edges.
  - rejects negative or missing declared inventory totals.
  - diagnostics include piece id + source asset location (`assetPath`, `entityId`).
- `test/unit/schemas-top-level.test.ts`
  - accepts `pieceCatalog` as a supported data-asset kind.
- `test/unit/json-schema.test.ts`
  - DataAssetEnvelope schema accepts `pieceCatalog` and still rejects unknown kinds.
- `npm run test:unit -- --coverage=false`

## Invariants That Must Remain True
- Underground/Active status applies only to declared piece types.
- Tunneled marker capability is data-declared, not runtime hardcoded.
- Inventory declarations are explicit and non-negative for every declared piece type.
- No FITL-specific branching in generic kernel code.

## Outcome
- **Completion date**: February 11, 2026
- **What changed**:
  - Added `pieceCatalog` as a supported generic data-asset kind in runtime and JSON-schema contracts.
  - Added generic piece-catalog payload schemas and validation for undeclared transition dimensions, invalid status values, and inventory declaration integrity.
  - Added FITL foundation piece-catalog data asset at `data/fitl/pieces/foundation.v1.json`.
  - Added/updated unit tests for data-asset kind acceptance and piece-catalog validation diagnostics.
- **Deviation from original plan**:
  - Moved validation responsibility from `validateGameDef` to the data-asset loading/validation pipeline, because piece catalogs are external assets and `validateGameDef` does not ingest them.
  - Deferred scenario-allocation conservation checks to the scenario loader ticket (`FITLMAPSCEANDSTAMOD-005`).
- **Verification**:
  - `npm run build`
  - `npm run test:unit -- --coverage=false`
