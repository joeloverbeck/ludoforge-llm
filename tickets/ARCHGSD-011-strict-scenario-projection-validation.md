# ARCHGSD-011: Strict Scenario Projection Validation (Fail Fast)

**Status**: TODO
**Priority**: P1
**Complexity**: M
**Parent spec**: specs/00-implementation-roadmap.md
**Depends on**: FITLEVECARENC-005

## Description

Harden scenario-to-setup projection so invalid `GameSpecDoc` scenario/piece-catalog data fails compilation deterministically instead of being partially ignored.

### What to Implement

1. Add compile-time validation errors for scenario projection inputs:
   - `initialPlacements[].pieceTypeId` missing from selected piece catalog.
   - `outOfPlay[].pieceTypeId` missing from selected piece catalog.
   - `initialPlacements[].faction` mismatch with referenced piece type faction.
   - `outOfPlay[].faction` mismatch with referenced piece type faction.
2. Add compile-time validation for inventory conservation:
   - Error when `initialPlacements + outOfPlay` exceeds inventory total for any `pieceTypeId`.
   - Do not silently clamp excess via `Math.max(0, ...)` semantics.
3. Add projection activation validation:
   - If scenario defines `initialPlacements` or `outOfPlay`, but `factionPools` is absent/empty, emit a compile error.
   - Keep projection fully data-driven and game-agnostic.

## Files to Touch

- `src/cnl/compile-data-assets.ts`
- `test/integration/compile-pipeline.test.ts` (or new dedicated projection validation integration tests)
- `test/unit/schemas-scenario.test.ts` (if schema-level additions are needed)

## Out of Scope

- FITL card/event content changes.
- Simulator runtime behavior changes unrelated to projection validation.

## Acceptance Criteria

### Tests That Must Pass

1. New integration tests for projection validation failures:
   - Unknown `pieceTypeId` in `initialPlacements` fails compile with deterministic code/path.
   - Unknown `pieceTypeId` in `outOfPlay` fails compile with deterministic code/path.
   - Faction mismatch between scenario entry and piece catalog fails compile.
   - Oversubscription of inventory fails compile.
   - Scenario setup fields present without `factionPools` fails compile.
2. Existing projection happy-path tests continue to pass:
   - `test/integration/fitl-scenario-setup-projection.test.ts`
3. `npm run build` passes.
4. `npm test` passes.
5. `npm run lint` passes.

### Invariants That Must Remain True

- No game-specific hardcoding in compiler/runtime.
- No alias/backward-compat paths.
- Compiler behavior remains deterministic for identical input docs.
