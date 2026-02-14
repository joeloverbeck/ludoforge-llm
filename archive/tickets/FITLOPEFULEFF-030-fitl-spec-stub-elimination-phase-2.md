# FITLOPEFULEFF-030: FITL GameSpec Stub Elimination (Phase 2)

**Status**: ✅ COMPLETED
**Priority**: P0
**Estimated effort**: Medium (0.5-1 day)
**Spec reference**: Spec 26 Acceptance Criteria 1 and 21, GameSpecDoc long-term architecture goal
**Depends on**: FITLOPEFULEFF-017, FITLOPEFULEFF-018, FITLOPEFULEFF-019, FITLOPEFULEFF-020, FITLOPEFULEFF-026, FITLOPEFULEFF-029

## Summary

Remove operation-level fallback dependencies from the FITL production GameSpec so operation execution is fully profile-driven and explicit.

Current codebase reality:
- `data/games/fire-in-the-lake.md` still defines fallback action effects (`addVar fallbackUsed += 100`) on all actions, including operations already handled by `actionPipelines`.
- Operation-focused tests still use `fallbackUsed === 0` as a correctness signal.
- Strict pipeline dispatch is already in place (configured profiles with no applicability match do not fall back to action effects).

This ticket removes fallback semantics specifically for operation actions and operation tests:
- No action-effect fallback wiring on operation actions (`train`, `patrol`, `sweep`, `assault`, `rally`, `march`, `attack`, `terror`).
- No `fallbackUsed` assertions in operation-focused tests.
- Correctness validated via explicit profile behavior (legality, costs, targeting, and effects), not fallback sentinels.

## Files to Touch

- `data/games/fire-in-the-lake.md` — remove fallback action effects from operation actions
- `test/integration/fitl-coin-operations.test.ts` — remove fallback assertions and keep behavioral assertions
- `test/integration/fitl-insurgent-operations.test.ts` — remove fallback assertions and keep behavioral assertions
- `test/integration/fitl-limited-ops.test.ts` — remove fallback assertions and keep legality/limit assertions
- `test/integration/fitl-production-data-compilation.test.ts` — add invariant check that operation actions do not carry fallback action effects
- `tickets/FITLOPEFULEFF-021-stub-removal-final-verification.md` — include this ticket in final dependency/verification checklist

## Out of Scope

- Replacing remaining generic/stub profile IDs (for example `rally-profile`, `march-profile`, `terror-profile`) with faction-split profiles
- Removing fallback scaffolding for non-operation actions (special activities, joint actions)
- Reworking non-operation event pipelines
- Introducing compatibility aliases for legacy stubs

## Acceptance Criteria

### Tests That Must Pass
1. In production YAML, operation actions have empty `effects` arrays (no fallback side effects).
2. Operation-focused integration tests do not assert on `fallbackUsed`.
3. Operation execution remains correct via profile dispatch and behavioral assertions.
4. `npm run build`, `npm run typecheck`, `npm test`, `npm run lint` pass.

### Invariants
- Game-specific behavior remains encoded in GameSpecDoc only.
- Runtime remains game-agnostic with no FITL-specific branches.
- No operation-level compatibility aliasing or fallback dual-path behavior is introduced.

## Outcome

- **Completion date**: 2026-02-14
- **What changed**:
  - Removed fallback action effects from the 8 operation actions in `data/games/fire-in-the-lake.md`.
  - Removed operation-test reliance on `fallbackUsed` in:
    - `test/integration/fitl-coin-operations.test.ts`
    - `test/integration/fitl-insurgent-operations.test.ts`
    - `test/integration/fitl-limited-ops.test.ts`
  - Added an explicit production invariant in `test/integration/fitl-production-data-compilation.test.ts` asserting operation actions compile with empty action effects.
- **Deviations from original plan**:
  - `test/integration/fitl-card-flow-determinism.test.ts` was not changed because it does not depend on fallback stubs; it was an outdated assumption in the original ticket draft.
  - Scope was corrected to operation-level fallback elimination only; non-operation fallback scaffolding remains out of scope.
- **Verification results**:
  - `npm run build` passed.
  - Targeted tests passed:
    - `dist/test/integration/fitl-coin-operations.test.js`
    - `dist/test/integration/fitl-insurgent-operations.test.js`
    - `dist/test/integration/fitl-limited-ops.test.js`
    - `dist/test/integration/fitl-production-data-compilation.test.js`
  - `npm run typecheck` passed.
  - `npm test` passed.
  - `npm run lint` passed.
