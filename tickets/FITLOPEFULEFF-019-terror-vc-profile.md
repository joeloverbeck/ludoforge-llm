# FITLOPEFULEFF-019: Terror VC Profile

**Status**: Pending
**Priority**: P1
**Estimated effort**: Small (2-3 hours)
**Spec reference**: Spec 26, Task 26.10 — `terror-vc-profile` (Rule 3.3.4, VC variant)
**Depends on**: FITLOPEFULEFF-001, FITLOPEFULEFF-002, FITLOPEFULEFF-003, FITLOPEFULEFF-018 (pattern)

## Summary

Add `terror-vc-profile` implementing the VC Terror operation. Different from NVA Terror in two critical ways: requires Underground Guerrilla (no Troops alternative) and shifts toward Active Opposition (not Neutral).

Key behaviors:
- **Space filter**: Underground VC Guerrilla required (VC CANNOT Terror with Troops alone)
- **Cost**: 1 VC Resource per Province/City (0 for LoCs)
- **Activation**: Activate 1 Underground VC Guerrilla
- **LoC**: Place Sabotage marker (same as NVA)
- **Province/City**: Place Terror marker + shift 1 level toward **Active Opposition** (NOT Neutral)
- **Marker supply**: Same 15-marker shared limit
- **LimOp-aware**: Max 1 space

## Files to Touch

- `test/fixtures/cnl/compiler/fitl-operations-insurgent.md` — Add `terror-vc-profile` YAML
- `data/games/fire-in-the-lake.md` — Add `terror-vc-profile` operation profile
- `test/integration/fitl-insurgent-operations.test.ts` — Add VC Terror test cases

## Out of Scope

- `terror-nva-profile` modifications (FITLOPEFULEFF-018)
- Capability/momentum modifiers (Spec 28)
- Turn flow changes
- Kernel source code changes

## Acceptance Criteria

### Tests That Must Pass
1. `terror-vc-profile` compiles without diagnostics
2. Space filter: requires Underground VC Guerrilla (rejects spaces with only Troops)
3. Cost: 1 VC Resource per Province/City, 0 for LoC
4. Activation: 1 Underground VC Guerrilla set to Active
5. LoC: Sabotage marker placed (same as NVA)
6. Province/City: Terror marker placed
7. VC Terror shifts 1 level toward Active Opposition (always, regardless of current level)
8. VC Terror shift direction is DIFFERENT from NVA (toward Opposition, not Neutral)
9. Terror/Sabotage marker idempotent
10. Marker supply limit: stops at 15
11. Free operation: per-Province/City cost skipped
12. LimOp variant: max 1 space

### Invariants
- `terror-nva-profile` unchanged
- No kernel source files modified
- No compiler source files modified
- VC shift is toward Active Opposition (delta: -1 always)
- NVA shift is toward Neutral (only from Support levels) — NOT changed by this ticket
- Build passes (`npm run build`)
- Typecheck passes (`npm run typecheck`)
