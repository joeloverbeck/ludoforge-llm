# FITLMAPSCEANDSTAMOD-003 - Piece Catalog, Status Dimensions, and Inventory Contracts

**Status**: Proposed
**Spec**: `specs/16-fitl-map-scenario-and-state-model.md`
**References**: `specs/15a-fitl-foundation-gap-analysis-matrix.md`, `brainstorming/implement-fire-in-the-lake-foundation.md`
**Depends on**: `FITLMAPSCEANDSTAMOD-001`

## Goal
Introduce generic schema/validator support for piece-status dimensions (Underground/Active/Tunneled eligibility) and inventory conservation inputs needed for FITL setup.

## Scope
- Define piece catalog asset structure for faction/type/status capabilities.
- Add declarative status-transition constraints per piece type.
- Add inventory declarations (total counts by piece type/faction) for conservation checks.
- Add compile-time validation for illegal status dimensions and transitions.

## File List Expected To Touch
- `src/kernel/schemas.ts`
- `src/kernel/types.ts`
- `src/kernel/validate-gamedef.ts`
- `schemas/GameDef.schema.json`
- `data/fitl/pieces/foundation.v1.json` (new)
- `test/unit/schemas-top-level.test.ts`
- `test/unit/validate-gamedef.test.ts`
- `test/unit/validate-gamedef.golden.test.ts`

## Out Of Scope
- No scenario placements by space.
- No operation/event rules for flipping/placing/removing pieces.
- No runtime apply-move logic changes.

## Acceptance Criteria
## Specific Tests That Must Pass
- `test/unit/validate-gamedef.test.ts`
  - rejects illegal status dimensions for piece types that do not declare them.
  - rejects invalid status-transition edges.
  - rejects negative or missing declared inventory totals.
- `test/unit/validate-gamedef.golden.test.ts`
  - diagnostics include piece id + source asset location.
- `test/unit/schemas-top-level.test.ts`
  - parses valid piece catalog contracts.
- `npm run test:unit -- --coverage=false`

## Invariants That Must Remain True
- Underground/Active status applies only to declared piece types.
- Tunneled marker capability is data-declared, not runtime hardcoded.
- Inventory conservation is enforceable from declared totals + scenario allocations.
- No FITL-specific branching in `src/kernel/validate-gamedef.ts`.
