# FITLOPEFULEFF-030: FITL GameSpec Stub Elimination (Phase 2)

**Status**: Pending
**Priority**: P0
**Estimated effort**: Large (1-2 days)
**Spec reference**: Spec 26 Acceptance Criteria 1 and 21, GameSpecDoc long-term architecture goal
**Depends on**: FITLOPEFULEFF-017, FITLOPEFULEFF-018, FITLOPEFULEFF-019, FITLOPEFULEFF-020, FITLOPEFULEFF-026, FITLOPEFULEFF-029

## Summary

Remove remaining stub/fallback dependencies from the FITL production GameSpec so action execution is fully profile-driven and explicit.

This ticket converts FITL production data away from scaffold-era fallback semantics and aligns with strict no-alias architecture:
- No action-effect fallback needed for implemented operations.
- No test-only `fallbackUsed` dependency for operation correctness.
- Profile applicability + legality fully defines operation execution behavior.

## Files to Touch

- `data/games/fire-in-the-lake.md` — remove/replace fallback-only operation action effects where superseded
- `test/integration/fitl-insurgent-operations.test.ts` — remove fallback assertions
- `test/integration/fitl-production-data-compilation.test.ts` — enforce no fallback-path dependency
- `test/integration/fitl-card-flow-determinism.test.ts` — update operation-heavy scenario assertions if needed
- `tickets/FITLOPEFULEFF-021-stub-removal-final-verification.md` — include this ticket in final dependency/verification checklist

## Out of Scope

- Reworking non-operation event pipelines
- Introducing compatibility aliases for legacy stubs

## Acceptance Criteria

### Tests That Must Pass
1. FITL operation execution does not rely on fallback action effects.
2. No operation tests assert `fallbackUsed` as correctness signal.
3. Production compilation and integration suites pass without scaffold assumptions.
4. `npm run build`, `npm run typecheck`, `npm test`, `npm run lint` pass.

### Invariants
- Game-specific behavior remains encoded in GameSpecDoc only.
- Runtime remains game-agnostic with no FITL-specific branches.
