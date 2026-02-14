# FITLOPEFULEFF-031: Full Map Data-Asset Lowering

**Status**: Pending  
**Priority**: P1  
**Estimated effort**: Medium (4-6 hours)  
**Spec reference**: Spec 26 architecture hardening follow-up  
**Depends on**: FITLOPEFULEFF-018

## Summary

Complete compiler lowering of map data-asset runtime fields so `GameSpecDoc` can define game runtime map behavior without duplicating top-level sections.

Current gap: map lowering already includes `spaces` and `markerLattices`, but does not consistently lower all runtime-relevant map payload fields.

This ticket adds canonical lowering for:
- `tracks`
- `spaceMarkers`
- `stackingConstraints`

No backwards compatibility aliases. Canonical map data comes from `dataAssets` and compiles into game-agnostic `GameDef`.

## Files to Touch

- `src/cnl/compile-data-assets.ts`
- `src/cnl/compiler-core.ts`
- `src/kernel/initial-state.ts` (if required for map-provided initial marker state application)
- `test/integration/compile-pipeline.test.ts`
- `test/integration/fitl-production-data-compilation.test.ts`
- `test/unit/data-assets.test.ts` (if schema/lowering edge cases need coverage)

## Out of Scope

- Marker semantic validation of effect references (ticket 032)
- Scenario selection semantics (ticket 033)
- Query-system changes (ticket 034)

## Acceptance Criteria

### Tests That Must Pass
1. Compiler lowers map `tracks`, `spaceMarkers`, and `stackingConstraints` from selected map asset into `GameDef`.
2. Runtime initial state correctly reflects lowered map-provided marker initialization (`spaceMarkers`) where applicable.
3. Existing FITL production compilation and integration tests continue to pass.
4. Added regression tests cover each newly lowered field.

### Invariants
- Lowering remains generic and game-agnostic (no FITL-specific branch logic).
- No aliasing/back-compat fallback paths introduced.
- Build passes (`npm run build`)
- Typecheck passes (`npm run typecheck`)
- Lint passes (`npm run lint`)
- Tests pass (`npm test`)

