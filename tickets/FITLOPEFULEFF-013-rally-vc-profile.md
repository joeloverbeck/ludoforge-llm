# FITLOPEFULEFF-013: Rally VC Profile

**Status**: Pending
**Priority**: P1
**Estimated effort**: Small (2-3 hours)
**Spec reference**: Spec 26, Task 26.7 — `rally-vc-profile` (Rule 3.3.1, VC variant)
**Depends on**: FITLOPEFULEFF-001, FITLOPEFULEFF-002, FITLOPEFULEFF-003, FITLOPEFULEFF-012 (pattern)

## Summary

Add `rally-vc-profile` implementing the VC Rally operation. Same space filter as NVA Rally but different with-Base behavior and no Trail improvement.

Key behaviors:
- **Space filter**: Provinces or Cities without Support (same as NVA)
- **Cost**: 1 VC Resource per space
- **Without VC Base**: Place 1 VC Guerrilla OR replace 2 VC Guerrillas with 1 VC Base (same as NVA)
- **With VC Base**: Place guerrillas up to Population + VC Bases in space, OR flip all VC Guerrillas Underground (player choice)
- **No Trail improvement** (VC cannot improve Trail)
- **LimOp-aware**: Max 1 space

## Files to Touch

- `test/fixtures/cnl/compiler/fitl-operations-insurgent.md` — Add `rally-vc-profile` YAML
- `data/games/fire-in-the-lake.md` — Add `rally-vc-profile` operation profile
- `test/integration/fitl-insurgent-operations.test.ts` — Add VC Rally test cases

## Out of Scope

- `rally-nva-profile` modifications (FITLOPEFULEFF-012)
- Capability/momentum modifiers (Spec 28)
- Turn flow changes
- Kernel source code changes

## Acceptance Criteria

### Tests That Must Pass
1. `rally-vc-profile` compiles without diagnostics
2. Space filter: same "without Support" filter as NVA
3. Cost: 1 VC Resource per space
4. Without VC Base: mutually exclusive place guerrilla / replace with Base
5. With VC Base: choice of (A) place guerrillas up to Population + VC Bases, or (B) flip all Active VC Guerrillas Underground
6. With VC Base, flip option: all Active VC guerrillas → Underground
7. No Trail improvement stage (VC cannot improve Trail)
8. Free operation: per-space cost skipped
9. LimOp variant: max 1 space

### Invariants
- `rally-nva-profile` unchanged
- No kernel source files modified
- No compiler source files modified
- Stacking limit (max 2 Bases) enforced for base replacement
- Build passes (`npm run build`)
- Typecheck passes (`npm run typecheck`)
