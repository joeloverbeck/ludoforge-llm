# FITLOPEFULEFF-032: Compile-Time Marker Semantics Validation

**Status**: ✅ COMPLETED  
**Priority**: P1  
**Estimated effort**: Medium (3-5 hours)  
**Spec reference**: Spec 26 architecture hardening follow-up  
**Depends on**: FITLOPEFULEFF-031

## Summary

Add compile-time semantic validation for marker operations so invalid marker references fail during compile/validation, not at runtime.

Validate:
- `setMarker.marker` exists in compiled marker lattices
- `shiftMarker.marker` exists in compiled marker lattices
- `markerState.marker` references existing lattice
- Statically-known marker states are valid for the referenced lattice

No fallback execution behavior for undefined markers.

## Files to Touch

- `src/kernel/validate-gamedef-behavior.ts`
- `src/kernel/validate-gamedef.ts` (if orchestration changes needed)
- `test/unit/validate-gamedef.test.ts`
- `test/unit/effects-choice.test.ts` (runtime safety expectations)
- `test/integration/fitl-insurgent-operations.test.ts` (regression confidence)

## Out of Scope

- Data-asset lowering changes (ticket 031)
- Scenario selection policy (ticket 033)
- Query model changes (ticket 034)

## Acceptance Criteria

### Tests That Must Pass
1. Invalid marker IDs in marker effects produce compile/validation diagnostics.
2. Invalid statically-known marker states produce compile/validation diagnostics.
3. Valid FITL marker operations compile without diagnostics.
4. Existing marker runtime tests still pass with no behavior regressions.

### Invariants
- Validation remains generic and independent of any specific game.
- No runtime aliasing/fallback for missing markers.
- Build passes (`npm run build`)
- Typecheck passes (`npm run typecheck`)
- Lint passes (`npm run lint`)
- Tests pass (`npm test`)

## Outcome

- Completion date: February 14, 2026
- What changed:
  - Added compile-time semantic diagnostics for marker lattice references in `setMarker`, `shiftMarker`, and `markerState` references.
  - Added compile-time validation for statically-known marker state literals against declared lattice states.
  - Removed runtime fallback behavior for unknown marker lattices in `markerState` resolution.
  - Added/updated unit and integration tests covering compile-time marker diagnostics and runtime safety behavior.
- Deviations from plan:
  - Included a direct runtime behavior hardening update in `resolve-ref` to align with the no-fallback invariant.
- Verification results:
  - `npm run build` passed.
  - `npm run typecheck` passed.
  - `npm run lint` passed.
  - `npm test` passed.
