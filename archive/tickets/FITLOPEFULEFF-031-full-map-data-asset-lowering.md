# FITLOPEFULEFF-031: Full Map Data-Asset Lowering

**Status**: ✅ COMPLETED  
**Priority**: P1  
**Estimated effort**: Medium (4-6 hours)  
**Spec reference**: Spec 26 architecture hardening follow-up  
**Depends on**: FITLOPEFULEFF-018

## Summary

Complete compiler lowering of map data-asset runtime fields so `GameSpecDoc` can define game runtime map behavior without duplicating top-level sections.

Current gap (reassessed): map lowering includes `spaces` and `markerLattices` only. The selected map asset's `tracks`, `spaceMarkers`, and `stackingConstraints` are validated at data-asset load time but are not lowered into `GameDef`, so runtime cannot consume them canonically.

This ticket adds canonical lowering for:
- `tracks`
- `spaceMarkers`
- `stackingConstraints`

No backwards compatibility aliases. Canonical map data comes from `dataAssets` and compiles into game-agnostic `GameDef`.

## Assumptions Reassessed

- `src/cnl/compile-data-assets.ts` currently returns `mapSpaces` + `markerLattices` only; it does not return `tracks`, `spaceMarkers`, or `stackingConstraints`.
- `src/cnl/compiler-core.ts` currently injects only `mapSpaces` + `markerLattices` from derived map assets.
- `src/kernel/types-core.ts` / `src/kernel/schemas-core.ts` define map payload support for `tracks`, `spaceMarkers`, and `stackingConstraints`, but `GameDef` and `GameDefSchema` do not currently expose `tracks` or `spaceMarkers`.
- `src/kernel/initial-state.ts` initializes `state.markers` as empty and does not apply map-provided `spaceMarkers`.
- Existing integration tests (`compile-pipeline`, `fitl-production-data-compilation`) assert map spaces/lattices and payload validity, but do not cover canonical lowering of all map runtime fields into compiled `GameDef`.

## Scope Update

To satisfy canonical architecture (engine-agnostic, data-driven, no aliasing), this ticket must also include:
- `GameDef` contract extension for canonical lowered map runtime fields (`tracks`, `spaceMarkers`, `stackingConstraints`).
- Compiler lowering updates so selected map asset is the single source for these fields when present.
- Initial-state application of lowered `spaceMarkers` into `GameState.markers`.
- Tests that assert lowered fields exist on `compiled.gameDef` and initial marker state is applied from map payload.

## Files to Touch

- `src/cnl/compile-data-assets.ts`
- `src/cnl/compiler-core.ts`
- `src/kernel/initial-state.ts`
- `src/kernel/types-core.ts`
- `src/kernel/schemas-core.ts`
- `test/integration/compile-pipeline.test.ts`
- `test/integration/fitl-production-data-compilation.test.ts`
- `test/unit/initial-state.test.ts`
- `test/unit/data-assets.test.ts` (only if additional payload validation gaps are discovered)

## Out of Scope

- Marker semantic validation of effect references (ticket 032)
- Scenario selection semantics (ticket 033)
- Query-system changes (ticket 034)

## Acceptance Criteria

### Tests That Must Pass
1. Compiler lowers map `tracks`, `spaceMarkers`, and `stackingConstraints` from selected map asset into `GameDef` (alongside existing `mapSpaces`/`markerLattices` lowering).
2. Runtime initial state reflects lowered map-provided marker initialization (`spaceMarkers`) where applicable.
3. Existing FITL production compilation and integration tests continue to pass.
4. Added regression tests cover each newly lowered field and map-marker initialization behavior.

### Invariants
- Lowering remains generic and game-agnostic (no FITL-specific branch logic).
- No aliasing/back-compat fallback paths introduced.
- Build passes (`npm run build`)
- Typecheck passes (`npm run typecheck`)
- Lint passes (`npm run lint`)
- Tests pass (`npm test`)

## Outcome

- Completion date: 2026-02-14
- What was changed:
  - Extended map-asset derivation and compiler lowering to include `tracks`, `spaceMarkers`, and `stackingConstraints` in `GameDef`.
  - Extended `GameDef` type/schema contracts to carry canonical lowered `tracks` and `spaceMarkers`.
  - Updated runtime initialization to seed `GameState.markers` from lowered map `spaceMarkers`.
  - Added regression coverage for full map-field lowering and initial map marker materialization.
- Deviations from original plan:
  - Added `src/kernel/types-core.ts` and `src/kernel/schemas-core.ts` because reassessment showed `GameDef` could not represent lowered `tracks`/`spaceMarkers` without contract updates.
  - `test/unit/data-assets.test.ts` was not modified because existing map payload validation already covered the needed input constraints.
- Verification results:
  - `npm run build` passed.
  - `npm run typecheck` passed.
  - `npm run lint` passed.
  - `node --test dist/test/integration/compile-pipeline.test.js dist/test/integration/fitl-production-data-compilation.test.js dist/test/unit/initial-state.test.js` passed.
  - `npm test` passed.
