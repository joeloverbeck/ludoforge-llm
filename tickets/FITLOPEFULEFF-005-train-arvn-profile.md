# FITLOPEFULEFF-005: Train ARVN Profile

**Status**: Pending
**Priority**: P1
**Estimated effort**: Medium (3-4 hours)
**Spec reference**: Spec 26, Task 26.3 — `train-arvn-profile` (Rule 3.2.1, ARVN variant)
**Depends on**: FITLOPEFULEFF-001 (`__actionClass`), FITLOPEFULEFF-002 (macros), FITLOPEFULEFF-003 (globals)

## Summary

Add a faction-specific `train-arvn-profile` implementing the full ARVN Train operation per FITL Rule 3.2.1.

Key behaviors:
- **Space filter**: Provinces or Cities without NVA Control
- **Cost**: 3 ARVN Resources when placing ARVN pieces (including base replacement)
- **Resolution**: Per-space choice of Rangers (up to 2) or ARVN cubes (up to 6) at Cities or COIN Bases
- **Sub-action**: In 1 selected space: Pacification (needs ARVN Troops AND Police + COIN Control) or Replace 3 ARVN cubes with 1 ARVN Base
- **Base-building**: Replace 3 cubes with 1 Base; costs 3 ARVN even if free; stacking check (max 2 Bases)
- **LimOp-aware**: Max 1 space when `__actionClass == 'limitedOperation'`

## Files to Touch

- `test/fixtures/cnl/compiler/fitl-operations-coin.md` — Add `train-arvn-profile` YAML
- `data/games/fire-in-the-lake.md` — Add `train-arvn-profile` operation profile
- `test/integration/fitl-coin-operations.test.ts` — Add ARVN Train test cases

## Out of Scope

- `train-us-profile` (FITLOPEFULEFF-004)
- Capability/momentum modifiers (Spec 28)
- Turn flow changes
- Kernel source code changes

## Acceptance Criteria

### Tests That Must Pass
1. `train-arvn-profile` compiles without diagnostics
2. ARVN Train space filter excludes spaces with NVA Control
3. ARVN Train costs 3 ARVN Resources when placing pieces
4. ARVN Train places Rangers (up to 2)
5. ARVN Train places cubes at Cities or at COIN Bases (up to 6)
6. ARVN Train Pacification: requires both ARVN Troops AND Police in space
7. ARVN Train replace cubes with Base: requires 3+ ARVN cubes, stacking check (< 2 bases)
8. ARVN Train replace cubes with Base: costs 3 even if free operation
9. LimOp variant: max 1 space selected
10. Free operation variant: per-space cost skipped (but Base replacement costs still apply)

### Invariants
- No kernel source files modified
- No compiler source files modified
- `train-us-profile` (from FITLOPEFULEFF-004) unchanged
- Stacking limit (max 2 Bases) enforced
- Build passes (`npm run build`)
- Typecheck passes (`npm run typecheck`)
