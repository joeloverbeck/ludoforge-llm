# FITLOPEFULEFF-012: Rally NVA Profile

**Status**: Pending
**Priority**: P1
**Estimated effort**: Medium (3-4 hours)
**Spec reference**: Spec 26, Task 26.7 — `rally-nva-profile` (Rule 3.3.1, NVA variant)
**Depends on**: FITLOPEFULEFF-001, FITLOPEFULEFF-002, FITLOPEFULEFF-003

## Summary

Replace the stub `rally-profile` (insurgent side) with a faction-specific `rally-nva-profile` implementing the full NVA Rally operation per FITL Rule 3.3.1.

Key behaviors:
- **Space filter**: Provinces or Cities WITHOUT Support (Neutral, Passive/Active Opposition OK)
- **Cost**: 1 NVA Resource per space
- **Without NVA Base**: Place 1 NVA Guerrilla OR replace 2 NVA Guerrillas with 1 NVA Base (mutually exclusive)
- **With NVA Base**: Place guerrillas up to Trail value + NVA Bases in space
- **Trail improvement**: Spend 2 more Resources to improve Trail by 1 (even during LimOp, even if 0 spaces selected, even if free)
- **Base stacking**: Max 2 Bases per space
- **LimOp-aware**: Max 1 space (but min is 0 — Trail improvement can be standalone)

## Files to Touch

- `data/games/fire-in-the-lake.md` — Replace stub in production spec with `rally-nva-profile` YAML
- `test/integration/fitl-insurgent-operations.test.ts` — Update profile ID, add test cases

## Out of Scope

- `rally-vc-profile` (separate ticket FITLOPEFULEFF-013)
- Capability/momentum modifiers (Spec 28)
- Turn flow changes
- Kernel source code changes

## Acceptance Criteria

### Tests That Must Pass
1. `rally-nva-profile` compiles without diagnostics
2. Space filter excludes spaces with Support (passive or active)
3. Space filter includes spaces with Neutral, Passive Opposition, Active Opposition
4. Cost: 1 NVA Resource per space
5. Without NVA Base: mutually exclusive choice — place 1 guerrilla OR replace 2 guerrillas with Base
6. Without NVA Base + replace: requires 2+ NVA guerrillas + stacking check (< 2 bases)
7. With NVA Base: placement limit = Trail + NVA Bases in space
8. Trail improvement: costs 2 Resources EVEN if free operation
9. Trail improvement: available even with 0 spaces selected
10. Trail improvement: available during LimOp
11. Free operation: per-space cost skipped, Trail cost NOT skipped
12. LimOp variant: max 1 space, min 0

### Invariants
- No kernel source files modified
- No compiler source files modified
- `place-from-available-or-map` macro behavior unchanged
- Stacking limit (max 2 Bases) enforced
- Build passes (`npm run build`)
- Typecheck passes (`npm run typecheck`)
