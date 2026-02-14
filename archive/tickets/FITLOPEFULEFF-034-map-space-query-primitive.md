# FITLOPEFULEFF-034: Map-Space Query Primitive

**Status**: ✅ COMPLETED  
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

## Reassessed Assumptions (2026-02-14)

1. `zones` + `zoneProp($zone, ...)` currently relies on exception-driven filtering in `src/kernel/eval-query.ts` (`ZONE_PROP_NOT_FOUND` is caught and treated as non-match). This behavior is explicitly covered by `test/unit/eval-query.test.ts` and is not accidental.
2. Query lowering for CNL query kinds is implemented in `src/cnl/compile-conditions.ts` (not `src/cnl/compile-selectors.ts`).
3. Exhaustiveness and schema/type contracts for query unions are enforced in:
   - `src/kernel/types-ast.ts`
   - `src/kernel/schemas-ast.ts`
   - `test/unit/types-exhaustive.test.ts`
   - `test/unit/schemas-ast.test.ts`
4. Current FITL production YAML still emits many `query: zones` selectors in operation profiles where map-only semantics are intended; these are the correct migration target rather than `test/integration/fitl-insurgent-operations.test.ts` specifically.
5. `FITLOPEFULEFF-033` is already archived/completed; this ticket should not be blocked on active work there.

## Architecture Reassessment

The new primitive is beneficial versus current architecture because it removes hidden control flow (`try/catch` in filtering), makes intent explicit in specs (`mapSpaces` instead of overloaded `zones`), and strengthens engine-generic semantics by modeling map-space domain as a first-class query kind. This is cleaner, more robust, and more extensible than retaining `zones` aliasing or compatibility fallbacks.

## Files to Touch

- `src/kernel/types-ast.ts` (query AST extension)
- `src/kernel/schemas-ast.ts` (schema extension)
- `src/kernel/eval-query.ts`
- `src/kernel/validate-gamedef-behavior.ts` (if query-specific checks needed)
- `src/cnl/compile-conditions.ts` (query lowering support for new query kind)
- `test/unit/eval-query.test.ts`
- `test/unit/compile-conditions.test.ts`
- `test/unit/schemas-ast.test.ts`
- `test/unit/types-exhaustive.test.ts`
- `test/unit/kernel/legal-choices.test.ts`
- `data/games/fire-in-the-lake.md` (migrate map-space selectors to new query kind where appropriate)

## Out of Scope

- Macro-level deduplication across operation profiles (ticket 035)
- New operation behavior/features unrelated to query semantics

## Acceptance Criteria

### Tests That Must Pass
1. New map-space query primitive resolves only map spaces.
2. `zones` query no longer performs `ZONE_PROP_NOT_FOUND` suppression in filter evaluation paths.
3. Operation selectors migrated to map-space query no longer depend on exception-driven filtering.
4. Migrated FITL profiles preserve prior functional behavior.
5. Query-related unit coverage includes map vs utility zone separation.

### Invariants
- Query semantics remain engine-generic and reusable for any game.
- No compatibility alias path retained for legacy exception-driven filtering.
- Build passes (`npm run build`)
- Typecheck passes (`npm run typecheck`)
- Lint passes (`npm run lint`)
- Tests pass (`npm test`)

## Outcome

- Completion date: February 14, 2026
- What changed:
  - Added first-class `mapSpaces` query kind across AST types, schema validation, CNL lowering, behavior validation, and runtime query evaluation.
  - Removed `ZONE_PROP_NOT_FOUND` suppression from `zones` query filtering path in `eval-query` (no exception-driven control flow fallback retained).
  - Added/updated tests to cover `mapSpaces` lowering/parsing/exhaustiveness/runtime behavior and explicit `zones` error behavior.
  - Migrated FITL production selectors from `query: zones` to `query: mapSpaces` where map-space targeting is intended.
  - Replaced train-ARVN NVA-control filter logic that depended on missing `zoneProp.control` with explicit token-count condition (`NVA <= US+ARVN+VC`) to keep behavior robust without suppression.
  - Updated integration assertions to validate compiled `mapSpaces` query usage and new control predicate shape.
- Deviations from original plan:
  - Ticket originally scoped migration validation to `test/integration/fitl-insurgent-operations.test.ts`; actual required fixes were in `test/integration/fitl-coin-operations.test.ts` and `test/integration/fitl-joint-operations.test.ts` due runtime dependence on old suppression behavior.
  - `src/cnl/compile-conditions.ts` was the real query-lowering touchpoint (not `src/cnl/compile-selectors.ts`).
- Verification results:
  - `npm run build` passed.
  - `npm run typecheck` passed.
  - `npm run lint` passed.
  - `npm test` passed.
