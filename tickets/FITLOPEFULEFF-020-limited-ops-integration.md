# FITLOPEFULEFF-020: Limited Operations Integration Tests

**Status**: Pending
**Priority**: P1
**Estimated effort**: Medium (3-4 hours)
**Spec reference**: Spec 26, "LimOp Constraints" section + Acceptance Criteria 5, 12-17, 20
**Depends on**: FITLOPEFULEFF-001, all profile tickets (004-019)

## Summary

Dedicated integration test suite verifying that LimOp constraints, free operation guards, and cross-profile invariants work correctly across all 16 operation profiles.

This ticket does NOT create new profiles — it tests the profiles created in tickets 004-019 as an integration layer.

## Test Scenarios

### LimOp Constraints
1. Every profile with `__actionClass: 'limitedOperation'` selects max 1 space
2. Every profile with `__actionClass: 'operation'` can select multiple spaces
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
10. Stacking (max 2 Bases) enforced across Train, Rally base-building
11. Terror/Sabotage 15-marker supply shared across NVA and VC Terror
12. Piece removal ordering consistent across Assault and Attack

## Files to Touch

- `test/integration/fitl-limited-ops.test.ts` — **New file**: LimOp constraint tests
- `test/integration/fitl-faction-costs.test.ts` — Extend with free operation exception tests
- `test/integration/fitl-joint-operations.test.ts` — May need updates for US Joint Ops with real profiles

## Out of Scope

- Creating or modifying operation profiles (done in tickets 004-019)
- Kernel source code changes
- Compiler source code changes
- Turn flow integration (determines action class — separate from operation execution)

## Acceptance Criteria

### Tests That Must Pass
1. All 16 profiles honor LimOp max-1-space constraint when `__actionClass: 'limitedOperation'`
2. All 16 profiles allow multi-space when `__actionClass: 'operation'`
3. Free operation: per-space costs skipped for all profiles
4. Free operation exceptions: Pacification costs 3 ARVN per level even if free
5. Free operation exceptions: Trail improvement costs 2 NVA even if free
6. Free operation exceptions: ARVN Base replacement costs 3 even if free
7. US Joint Ops: ARVN Resources - Total Econ guard enforced
8. Stacking: Base placement fails gracefully when space has 2+ Bases
9. Terror/Sabotage: marker placement stops when supply reaches 15
10. All existing integration tests continue to pass

### Invariants
- No source files modified (test-only ticket)
- No profile YAML modified
- Build passes (`npm run build`)
- Typecheck passes (`npm run typecheck`)
