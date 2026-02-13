# FITLOPEFULEFF-009: Sweep ARVN Profile

**Status**: ✅ COMPLETED
**Priority**: P1
**Estimated effort**: Small (2-3 hours)
**Spec reference**: Spec 26, Task 26.5 — `sweep-arvn-profile` (Rule 3.2.3, ARVN variant)
**Depends on**: FITLOPEFULEFF-001, FITLOPEFULEFF-002 (`sweep-activation` macro), FITLOPEFULEFF-003, `archive/tickets/FITLOPEFULEFF-008-sweep-us-profile.md` (completed pattern)

## Summary

Replace the current `sweep-arvn-profile` stub with canonical FITL Rule 3.2.3 ARVN Sweep behavior from Spec 26 Task 26.5.

Key behaviors:
- **Space filter**: Provinces or Cities only
- **Cost**: 3 ARVN Resources per space
- **Movement**: ARVN Troops from adjacent
- **Activation count**: ARVN cubes (Troops + Police) + Rangers
- **Terrain**: Same Jungle halving rule
- **LimOp-aware**: Max 1 space

## Assumption Reassessment (Corrected)

- `data/games/fire-in-the-lake.md` contained a stub `sweep-arvn-profile` wired to transitional globals (`coinResources`, `sweepCount`).
- `sweep-us-profile` was already implemented in canonical staged form and served as the structural reference.
- `test/integration/fitl-coin-operations.test.ts` had detailed US Sweep checks but no ARVN Sweep acceptance-criteria checks.
- `test/integration/fitl-patrol-sweep-movement.test.ts` had patrol movement/activation tests plus US Sweep hop tests, but no ARVN Sweep-specific parity checks.

## Architecture Assessment

- Keeping the ARVN Sweep stub was not robust: tests could pass while rules behavior remained incorrect.
- The Spec 26 staged profile architecture (`select` + `resolve` stages + `sweep-activation` macro) is cleaner and more extensible than transitional counters/aliases.
- The implemented direction uses canonical profile semantics only (no compatibility aliasing).

## Files Touched

- `data/games/fire-in-the-lake.md`
- `test/integration/fitl-coin-operations.test.ts`
- `test/integration/fitl-patrol-sweep-movement.test.ts`

## Out of Scope

- `sweep-us-profile` modifications (FITLOPEFULEFF-008)
- Capability/momentum modifiers (Spec 28)
- Turn flow changes
- Kernel source code changes

## Acceptance Criteria

### Tests That Must Pass
1. `sweep-arvn-profile` compiles without diagnostics
2. ARVN Sweep costs 3 ARVN Resources per space
3. ARVN Sweep legality requires `arvnResources >= 3`
4. ARVN Troops move from adjacent spaces
5. Activation counts ARVN cubes + Rangers (not Irregulars)
6. `sweep-activation` macro invoked with `cubeFaction: 'ARVN'`, `sfType: rangers`
7. Jungle terrain halves activation
8. Free operation: per-space cost skipped
9. LimOp variant: max 1 space
10. Existing assertions no longer depend on ARVN Sweep `coinResources`/`sweepCount` stub behavior

### Invariants
- `sweep-us-profile` unchanged
- No kernel source files modified
- No compiler source files modified
- Build passes (`npm run build`)
- Typecheck passes (`npm run typecheck`)

## Outcome

**Completion date**: February 13, 2026

### What changed
- Replaced stub `sweep-arvn-profile` in `data/games/fire-in-the-lake.md` with canonical staged ARVN Sweep:
  - `arvnResources >= 3` legality/cost validation
  - LimOp-aware Province/City target selection (excluding North Vietnam)
  - Per-space cost deduction of 3 ARVN Resources guarded by `__freeOperation`
  - Adjacent ARVN Troop movement into selected spaces
  - Guerrilla activation through `sweep-activation` with `cubeFaction: 'ARVN'`, `sfType: rangers`
- Added ARVN Sweep structural/runtime acceptance tests in `test/integration/fitl-coin-operations.test.ts`.
- Added ARVN Sweep movement/activation parity tests in `test/integration/fitl-patrol-sweep-movement.test.ts`.
- Hardened shared `sweep-activation` macro with a zero-limit guard to prevent runtime `forEach.limit = 0` failures (edge case: jungle + one sweeper).

### Deviations from original plan
- The original scope did not call out macro changes, but implementation uncovered a real invariant bug (`forEach.limit` cannot be 0). A minimal shared macro guard was added to preserve robust canonical behavior for both Sweep variants.

### Verification results
- `npm run build` passed
- `npm run typecheck` passed
- `npm run lint` passed
- `npm test` passed
- `npm run test:all` passed
