# FITLOPEFULEFF-015: March VC Profile

**Status**: Pending
**Priority**: P1
**Estimated effort**: Small (2-3 hours)
**Spec reference**: Spec 26, Task 26.8 — `march-vc-profile` (Rule 3.3.2, VC variant)
**Depends on**: FITLOPEFULEFF-001, FITLOPEFULEFF-002, FITLOPEFULEFF-003, FITLOPEFULEFF-014 (pattern)

## Summary

Add `march-vc-profile` implementing the VC March operation. Same structure as NVA March but without Trail chain movement.

Key behaviors:
- **Cost**: 1 VC Resource per Province/City (0 for LoCs)
- **Movement**: VC pieces from adjacent spaces into destinations
- **Activation**: Same condition as NVA (LoC or Support AND pieces > 3)
- **No Trail chain**: VC cannot chain through Laos/Cambodia
- **LimOp-aware**: Max 1 destination

## Files to Touch

- `data/games/fire-in-the-lake.md` — Replace stub in production spec with `march-vc-profile` YAML
- `test/integration/fitl-insurgent-operations.test.ts` — Add VC March test cases

## Out of Scope

- `march-nva-profile` modifications (FITLOPEFULEFF-014)
- Trail chain movement (NVA-only)
- Capability/momentum modifiers (Spec 28)
- Turn flow changes
- Kernel source code changes

## Acceptance Criteria

### Tests That Must Pass
1. `march-vc-profile` compiles without diagnostics
2. Cost: 1 VC Resource per Province/City, 0 for LoC
3. VC pieces move from adjacent spaces into destination
4. Activation condition same as NVA March
5. No Trail chain movement available
6. Free operation: per-Province/City cost skipped
7. LimOp variant: max 1 destination

### Invariants
- `march-nva-profile` unchanged
- No kernel source files modified
- No compiler source files modified
- Build passes (`npm run build`)
- Typecheck passes (`npm run typecheck`)
