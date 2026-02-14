# FITLOPEFULEFF-034: Map-Space Query Primitive

**Status**: Pending  
**Priority**: P1  
**Estimated effort**: Medium (4-7 hours)  
**Spec reference**: Spec 26 architecture hardening follow-up  
**Depends on**: FITLOPEFULEFF-033

## Summary

Introduce a first-class query primitive for map spaces (for example `mapSpaces`/`mapZones`) so operations can target board spaces directly without relying on generic `zones` queries plus error-driven filtering.

Current gap:
- `zones` includes utility zones (available/discard/etc.).
- Map filtering often relies on `zoneProp` checks and suppressed `ZONE_PROP_NOT_FOUND` behavior.

Target:
- Explicit map-space query semantics with deterministic filtering.
- Remove reliance on exception-based control flow in query filtering paths.

## Files to Touch

- `src/kernel/types-ast.ts` (query AST extension)
- `src/kernel/schemas-ast.ts` (schema extension)
- `src/kernel/eval-query.ts`
- `src/kernel/validate-gamedef-behavior.ts` (if query-specific checks needed)
- `src/cnl/compile-selectors.ts` or related lowering/validation modules (as needed)
- `test/unit/eval-query.test.ts`
- `test/unit/kernel/legal-choices.test.ts`
- `test/unit/kernel/apply-move.test.ts`
- `test/integration/fitl-insurgent-operations.test.ts` (migrate affected selectors)

## Out of Scope

- Macro-level deduplication across operation profiles (ticket 035)
- New operation behavior/features unrelated to query semantics

## Acceptance Criteria

### Tests That Must Pass
1. New map-space query primitive resolves only map spaces.
2. Operation selectors using map-space query no longer depend on `ZONE_PROP_NOT_FOUND` suppression behavior.
3. Migrated FITL profiles preserve prior functional behavior.
4. Query-related unit coverage includes map vs utility zone separation.

### Invariants
- Query semantics remain engine-generic and reusable for any game.
- No compatibility alias path retained for legacy exception-driven filtering.
- Build passes (`npm run build`)
- Typecheck passes (`npm run typecheck`)
- Lint passes (`npm run lint`)
- Tests pass (`npm test`)

