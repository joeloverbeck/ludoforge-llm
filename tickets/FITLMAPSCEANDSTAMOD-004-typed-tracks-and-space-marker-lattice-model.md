# FITLMAPSCEANDSTAMOD-004 - Typed Tracks and Space-Marker Lattice Model

**Status**: Proposed
**Spec**: `specs/16-fitl-map-scenario-and-state-model.md`
**References**: `specs/15a-fitl-foundation-gap-analysis-matrix.md`
**Depends on**: `FITLMAPSCEANDSTAMOD-001`

## Goal
Add generic typed-track and space-marker modeling needed for Support/Opposition, Terror/Sabotage, Aid, Patronage, Trail, Casualties, and faction Resources.

## Scope
- Define typed numeric-track declarations with explicit bounds.
- Define space-level marker lattice/enums for support-opposition states.
- Add compile/runtime validators for bounded track values and allowed marker states.
- Include deterministic defaults (no implicit unset values for required tracks).

## File List Expected To Touch
- `src/kernel/types.ts`
- `src/kernel/schemas.ts`
- `src/kernel/initial-state.ts`
- `src/kernel/validate-gamedef.ts`
- `schemas/GameDef.schema.json`
- `test/unit/initial-state.test.ts`
- `test/unit/schemas-top-level.test.ts`
- `test/unit/validate-gamedef.test.ts`

## Out Of Scope
- No scenario piece placement.
- No derived control/victory recomputation implementation.
- No turn-sequence eligibility execution semantics.

## Acceptance Criteria
## Specific Tests That Must Pass
- `test/unit/schemas-top-level.test.ts`
  - rejects track declarations without explicit min/max.
  - rejects invalid marker-lattice values.
- `test/unit/initial-state.test.ts`
  - constructs state with declared tracks/markers initialized deterministically.
- `test/unit/validate-gamedef.test.ts`
  - rejects out-of-bounds initial track values.
- `npm run test:unit -- --coverage=false`

## Invariants That Must Remain True
- Track bounds are explicit and enforced.
- Pop-0 and LoC support/opposition constraints remain representable and enforceable.
- Marker/track typing remains generic and reusable for non-FITL games.
