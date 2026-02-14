# FITLOPEFULEFF-033: Explicit Scenario Selection

**Status**: Pending  
**Priority**: P1  
**Estimated effort**: Medium (4-6 hours)  
**Spec reference**: Spec 26 architecture hardening follow-up  
**Depends on**: FITLOPEFULEFF-032

## Summary

Remove implicit positional scenario selection (`first scenario wins`) and require explicit, deterministic scenario selection.

Target behavior:
- If multiple scenario assets exist, selection must be explicit via canonical configuration.
- Ambiguity becomes an error (not warning).
- Single-scenario documents remain valid without additional configuration.

No backwards compatibility fallback to positional selection.

## Files to Touch

- `src/cnl/game-spec-doc.ts` (if new canonical selector field is needed)
- `src/cnl/parser.ts` (if schema surface changes)
- `src/cnl/compile-data-assets.ts`
- `src/cnl/compiler-core.ts` (if compile option wiring needed)
- `src/cnl/cross-validate.ts` (if cross-section checks needed)
- `test/integration/compile-pipeline.test.ts`
- `test/unit/data-assets.test.ts`

## Out of Scope

- Marker semantics validation (ticket 032)
- Query primitive redesign (ticket 034)

## Acceptance Criteria

### Tests That Must Pass
1. Multiple scenarios without explicit selection fail compilation with deterministic diagnostics.
2. Explicitly selected scenario compiles deterministically.
3. Single-scenario docs compile as before.
4. Existing compile-pipeline tests updated to canonical explicit behavior.

### Invariants
- Deterministic compile behavior independent of data-asset ordering.
- No implicit fallback scenario selection behavior retained.
- Build passes (`npm run build`)
- Typecheck passes (`npm run typecheck`)
- Lint passes (`npm run lint`)
- Tests pass (`npm test`)

