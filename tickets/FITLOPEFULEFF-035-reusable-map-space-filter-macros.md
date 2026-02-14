# FITLOPEFULEFF-035: Reusable Map-Space Filter Macros

**Status**: Pending  
**Priority**: P2  
**Estimated effort**: Medium (3-5 hours)  
**Spec reference**: Spec 26 architecture hardening follow-up  
**Depends on**: FITLOPEFULEFF-034

## Summary

Reduce operation-profile duplication by introducing reusable map-space filter macros/patterns in production `GameSpecDoc` YAML.

Current gap:
- Repeated selector logic across profiles (space-type guards, faction piece presence checks).
- High maintenance cost and higher risk of drift between faction variants.

Target:
- Canonical shared filter building blocks.
- Operation profiles stay concise and behaviorally explicit.

## Files to Touch

- `data/games/fire-in-the-lake.md` (macro additions + profile refactors)
- `test/integration/fitl-insurgent-operations.test.ts`
- `test/integration/fitl-coin-operations.test.ts` (if refactors touch COIN selectors)

## Out of Scope

- New operation mechanics not already in Spec 26 scope
- Query model/type changes (ticket 034)

## Acceptance Criteria

### Tests That Must Pass
1. Shared macros/patterns cover repeated map-space selector cases now duplicated in profiles.
2. Refactored profiles preserve behavior (no functional regression).
3. Integration tests validate key profile paths still produce identical outcomes.

### Invariants
- YAML refactors remain declarative and game-specific; engine/runtime stays generic.
- No alias behavior added; old duplicated paths are removed, not retained.
- Build passes (`npm run build`)
- Typecheck passes (`npm run typecheck`)
- Lint passes (`npm run lint`)
- Tests pass (`npm test`)

