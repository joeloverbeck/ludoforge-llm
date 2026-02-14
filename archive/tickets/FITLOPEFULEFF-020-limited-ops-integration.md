# FITLOPEFULEFF-020: Limited Operations Integration Tests (Reassessed)

**Status**: ✅ COMPLETED
**Priority**: P1
**Estimated effort**: Medium (3-4 hours)
**Spec reference**: Spec 26, "LimOp Constraints" section + Acceptance Criteria 5, 12-17, 20
**Depends on**: FITLOPEFULEFF-001, all profile tickets (004-019)

## Summary

Dedicated integration test suite verifying that LimOp constraints, free operation guards, and cross-profile invariants work correctly across all 16 operation profiles.

This ticket does NOT create new profiles — it tests the profiles created in tickets 004-019 as an integration layer.

## Reassessed Assumptions (2026-02-14)

- `test/integration/fitl-limited-ops.test.ts` already exists (this is not a new-file ticket).
- Existing integration coverage already includes:
  - Joint-op boundary/forbid/free behavior (`fitl-joint-operations.test.ts`)
  - Stacking invariants (`fitl-stacking.test.ts`)
  - Terror/Sabotage shared-marker cap behavior (`fitl-insurgent-operations.test.ts`)
  - Assault/Attack removal-ordering contracts (`fitl-removal-ordering.test.ts`)
- The highest-value gap is not more one-off scenario tests; it is cross-profile invariant coverage that all 16 operation profiles preserve LimOp/Op selector contracts through shared macros and profile wiring.

## Test Scenarios

### LimOp Constraints
1. All 16 operation profiles (Train/Patrol/Sweep/Assault/Rally/March/Attack/Terror across both factions) enforce LimOp max-1 at the profile selector path (directly or via shared macro)
2. The same selector paths allow multi-space for normal Operation (`max > 1`)
3. LimOp does NOT affect sub-actions (e.g., Trail improvement, Pacification)

### Free Operation Guards
4. Per-space costs skipped when `__freeOperation: true`
5. Pacification costs NOT skipped even when free (exception to free guard)
6. Trail improvement costs NOT skipped even when free (exception to free guard)
7. ARVN Base replacement costs NOT skipped even when free (exception to free guard)

### US Joint Operations
8. US COIN profiles check ARVN Resources - Total Econ >= cost
9. When ARVN Resources - Total Econ < cost, ARVN placement is illegal

### Cross-Profile Invariants
10. Existing stacking tests continue to enforce max-2-base constraints across build/replacement flows
11. Existing Terror/Sabotage tests continue to enforce shared 15-marker cap across NVA and VC Terror
12. Existing removal-ordering tests continue to enforce deterministic Assault/Attack removal behavior

## Files to Touch

- `test/integration/fitl-limited-ops.test.ts` — Extend with cross-profile LimOp/Op invariant checks for all 16 operation profiles
- `test/integration/fitl-faction-costs.test.ts` — Extend with production-spec free-operation exception checks
- `test/integration/fitl-joint-operations.test.ts` — Keep existing tests unless a gap is found during execution

## Out of Scope

- Creating or modifying operation profiles (done in tickets 004-019)
- Kernel source code changes
- Compiler source code changes
- Turn flow integration (determines action class — separate from operation execution)

## Acceptance Criteria

### Tests That Must Pass
1. All 16 operation profiles honor LimOp max-1-space constraint at their selector path when `__actionClass: 'limitedOperation'`
2. All 16 operation profiles allow multi-space at that same selector path when `__actionClass: 'operation'`
3. Free operation: per-space costs skipped for all profiles
4. Free operation exceptions: Pacification costs 3 ARVN per level even if free
5. Free operation exceptions: Trail improvement costs 2 NVA even if free
6. Free operation exceptions: ARVN Base replacement costs 3 even if free
7. US Joint Ops: ARVN Resources - Total Econ guard enforced
8. Existing stacking integration tests still pass (no regression)
9. Existing Terror/Sabotage shared-cap integration tests still pass (no regression)
10. Existing removal-ordering integration tests still pass (no regression)
11. All existing integration tests continue to pass

### Invariants
- No source files modified (test-only ticket)
- No profile YAML modified
- Build passes (`npm run build`)
- Typecheck passes (`npm run typecheck`)

## Outcome

- Completion date: 2026-02-14
- Actually changed:
  - Reassessed and corrected stale ticket assumptions (existing test files, existing invariant coverage, and highest-value remaining gap).
  - Extended `test/integration/fitl-limited-ops.test.ts` with cross-profile selector-contract checks for all 16 operation profiles (direct LimOp logic or validated selector macro usage).
  - Extended `test/integration/fitl-faction-costs.test.ts` with production-spec guard/exception checks:
    - shared `per-province-city-cost` is `__freeOperation`-guarded
    - ARVN Train Pacify/Base-replacement costs are intentionally unguarded
    - NVA Rally Trail-improvement cost is intentionally unguarded
- Deviations from original plan:
  - Did not create a new `fitl-limited-ops` file because it already existed.
  - Did not modify `fitl-joint-operations.test.ts` because current tests already cover positive/boundary/forbid/free behavior for US joint-op constraints.
  - Did not duplicate stacking/terror/removal tests; relied on existing integration suites and enforced no-regression by full test run.
- Verification:
  - `npm run build` passed
  - `npm run typecheck` passed
  - `npm run lint` passed
  - `npm run test:all` passed (146/146)
