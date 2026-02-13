# FITLOPEFULEFF-007: Patrol ARVN Profile

**Status**: Pending
**Priority**: P1
**Estimated effort**: Small (2-3 hours)
**Spec reference**: Spec 26, Task 26.4 — `patrol-arvn-profile` (Rule 3.2.2, ARVN variant)
**Depends on**: FITLOPEFULEFF-001, FITLOPEFULEFF-002, FITLOPEFULEFF-003, FITLOPEFULEFF-006 (pattern established)

## Summary

Add `patrol-arvn-profile` implementing the ARVN Patrol operation. Structurally identical to US Patrol but with ARVN faction references and different cost model.

Key behaviors:
- **Cost**: 3 ARVN Resources TOTAL (upfront, not per-space)
- **Movement, activation, free Assault**: Same structure as US but with ARVN faction references
- **Free Assault**: Uses ARVN damage formula
- **LimOp**: Same as US Patrol

## Files to Touch

- `data/games/fire-in-the-lake.md` — Replace stub in production spec with `patrol-arvn-profile` YAML
- `test/integration/fitl-coin-operations.test.ts` — Add ARVN Patrol test cases
- `test/integration/fitl-patrol-sweep-movement.test.ts` — Add ARVN movement/activation tests

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
6. Free Assault in 1 LoC uses ARVN damage formula
7. LimOp variant: max 1 destination LoC

### Invariants
- `patrol-us-profile` unchanged
- No kernel source files modified
- No compiler source files modified
- Build passes (`npm run build`)
- Typecheck passes (`npm run typecheck`)
