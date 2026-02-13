# FITLOPEFULEFF-007: Patrol ARVN Profile

**Status**: COMPLETED
**Priority**: P1
**Estimated effort**: Small (2-3 hours)
**Spec reference**: Spec 26, Task 26.4 — `patrol-arvn-profile` (Rule 3.2.2, ARVN variant)
**Depends on**: FITLOPEFULEFF-001, FITLOPEFULEFF-002, FITLOPEFULEFF-003, `archive/tickets/FITLOPEFULEFF-006-patrol-us-profile.md` (completed pattern)

## Summary

Add `patrol-arvn-profile` implementing ARVN Patrol in the production spec. The profile should mirror the US Patrol stage structure, but with ARVN faction references, ARVN total-cost model, and ARVN free-Assault damage formula.

Key behaviors:
- **Cost**: 3 ARVN Resources TOTAL (upfront, not per-space)
- **Movement, activation, free Assault**: Same stage shape as US with ARVN faction references
- **Free Assault**: Uses ARVN Assault formula relevant to LoCs (ARVN cubes in LoC -> `/ 2` damage)
- **LimOp**: Same as US Patrol

## Assumption Reassessment (Corrected)

- `data/games/fire-in-the-lake.md` currently has `patrol-us-profile` but **does not** have `patrol-arvn-profile`.
- `test/integration/fitl-coin-operations.test.ts` currently validates `patrol-us-profile` plus legacy `sweep-profile`/`assault-profile`; ARVN Patrol coverage is absent.
- `test/integration/fitl-patrol-sweep-movement.test.ts` currently has US-focused movement/activation tests at kernel effect level; ARVN coverage is absent.
- `data/games/fire-in-the-lake.md` already includes `actions`, `turnStructure`, and `terminal` stubs. This ticket must not assume those sections are missing.
- `FITLOPEFULEFF-006` is already completed and archived; this ticket extends the same faction-specific profile architecture.

## Architecture Assessment

The proposed change is more beneficial than the current state because it removes the single-faction gap in Patrol and completes the Spec 26 direction of explicit faction-specific operation profiles. Keeping separate `patrol-us-profile` and `patrol-arvn-profile` remains cleaner and more extensible than branching one shared profile by actor, because legality, cost model, and damage model differ by faction.

## Files to Touch

- `data/games/fire-in-the-lake.md` — Add new `patrol-arvn-profile` operation profile YAML
- `test/integration/fitl-coin-operations.test.ts` — Add ARVN Patrol compile/structure/applicability/cost tests
- `test/integration/fitl-patrol-sweep-movement.test.ts` — Add ARVN movement/activation parity tests

## Out of Scope

- `patrol-us-profile` modifications (FITLOPEFULEFF-006)
- Capability/momentum modifiers (Spec 28)
- Turn flow changes
- Kernel source code changes

## Acceptance Criteria

### Tests That Must Pass
1. `patrol-arvn-profile` compiles without diagnostics
2. ARVN Patrol costs 3 ARVN Resources total (single upfront deduction, NOT per-space)
3. ARVN Patrol legality requires `arvnResources >= 3`
4. ARVN cubes move from adjacent spaces into target LoC
5. Activation: 1 enemy guerrilla per ARVN cube (1:1 ratio)
6. Free Assault in 1 LoC uses ARVN damage formula (`/ 2` of ARVN cubes in LoC)
7. LimOp variant: max 1 destination LoC

### Invariants
- `patrol-us-profile` unchanged
- No kernel source files modified
- No compiler source files modified
- Build passes (`npm run build`)
- Typecheck passes (`npm run typecheck`)

## Outcome

**Completed**: 2026-02-13

### What was changed
- Added `patrol-arvn-profile` to `data/games/fire-in-the-lake.md` with:
  - ARVN applicability (`activePlayer == 1`)
  - Upfront total-cost model (`legality` + `costValidation` + `costEffects` for 3 ARVN Resources)
  - LoC-only, LimOp-aware targeting (`max: 1` under `limitedOperation`)
  - ARVN-adjacent cube movement and 1:1 guerrilla activation
  - Free Assault in up to 1 LoC with ARVN patrol damage formula (`arvnCubes / 2`) via `coin-assault-removal-order`
- Extended `test/integration/fitl-coin-operations.test.ts` with ARVN Patrol profile presence, applicability, and acceptance-criteria structural checks.
- Extended `test/integration/fitl-patrol-sweep-movement.test.ts` with ARVN movement/activation parity tests.

### Deviations from original plan
- No architectural deviations. The work stayed within data profile + integration tests and preserved the faction-specific profile architecture from Spec 26.

### Verification
- `npm run build` passed
- `npm run typecheck` passed
- `npm run lint` passed
- `node --test dist/test/integration/fitl-coin-operations.test.js` passed
- `node --test dist/test/integration/fitl-patrol-sweep-movement.test.js` passed
- `npm run test:all` passed
