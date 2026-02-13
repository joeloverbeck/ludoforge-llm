# FITLOPEFULEFF-017: Attack VC Profile

**Status**: Pending
**Priority**: P1
**Estimated effort**: Small (2-3 hours)
**Spec reference**: Spec 26, Task 26.9 — `attack-vc-profile` (Rule 3.3.3, VC variant)
**Depends on**: FITLOPEFULEFF-001, FITLOPEFULEFF-002, FITLOPEFULEFF-003, FITLOPEFULEFF-016 (pattern)

## Summary

Add `attack-vc-profile` implementing the VC Attack operation. Guerrilla Attack only — no Troops alternative.

Key behaviors:
- **Space filter**: Spaces where VC AND an enemy faction have pieces
- **Cost**: 1 VC Resource per space
- **Guerrilla Attack only**: No `chooseOne` for mode — always guerrilla attack
- **Resolution**: Activate ALL VC guerrillas → roll d6 → if roll <= guerrilla count: remove up to 2 enemy pieces
- **Attrition**: Per US piece removed, attacker loses 1 piece to Available
- **LimOp-aware**: Max 1 space

## Files to Touch

- `data/games/fire-in-the-lake.md` — Replace stub in production spec with `attack-vc-profile` YAML
- `test/integration/fitl-insurgent-operations.test.ts` — Add VC Attack test cases
- `test/integration/fitl-attack-die-roll.test.ts` — Add VC die roll tests

## Out of Scope

- `attack-nva-profile` modifications (FITLOPEFULEFF-016)
- NVA Troops Attack mode (NVA-only)
- Capability/momentum modifiers (Spec 28)
- Turn flow changes
- Kernel source code changes

## Acceptance Criteria

### Tests That Must Pass
1. `attack-vc-profile` compiles without diagnostics
2. Space filter: requires VC pieces AND enemy pieces
3. Cost: 1 VC Resource per space
4. No mode choice — always guerrilla attack
5. All VC guerrillas activated (underground → active)
6. Roll d6: if roll <= guerrilla count → 2 enemy pieces removed
7. Roll d6: if roll > guerrilla count → 0 damage
8. Attrition: per US piece removed, VC loses 1 piece to Available
9. Free operation: per-space cost skipped
10. LimOp variant: max 1 space

### Invariants
- `attack-nva-profile` unchanged
- No kernel source files modified
- No compiler source files modified
- Build passes (`npm run build`)
- Typecheck passes (`npm run typecheck`)
