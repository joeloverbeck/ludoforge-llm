# FITLOPEFULEFF-016: Attack NVA Profile

**Status**: Pending
**Priority**: P1
**Estimated effort**: Medium (3-4 hours)
**Spec reference**: Spec 26, Task 26.9 — `attack-nva-profile` (Rule 3.3.3, NVA variant)
**Depends on**: FITLOPEFULEFF-001, FITLOPEFULEFF-002 (`insurgent-attack-removal-order`), FITLOPEFULEFF-003

## Summary

Replace the stub `attack-profile` (insurgent side) with a faction-specific `attack-nva-profile` implementing the full NVA Attack operation per FITL Rule 3.3.3.

Key behaviors:
- **Space filter**: Spaces where NVA AND an enemy faction have pieces
- **Cost**: 1 NVA Resource per space
- **Mode choice**: Guerrilla Attack OR NVA Troops Attack (NVA-only alternative)
- **Guerrilla Attack**: Activate ALL NVA guerrillas → roll d6 → if roll <= guerrilla count: remove up to 2 enemy pieces
- **Troops Attack** (NVA only): No die roll, no guerrilla activation. Damage = floor(nvaTroops / 2)
- **Attrition**: Per US piece removed, attacker loses 1 piece to Available (via `insurgent-attack-removal-order`)
- **Die roll**: Uses `rollRandom` for deterministic seeded PRNG

## Files to Touch

- `data/games/fire-in-the-lake.md` — Replace stub in production spec with `attack-nva-profile` YAML
- `test/integration/fitl-insurgent-operations.test.ts` — Update profile ID, add test cases
- `test/integration/fitl-attack-die-roll.test.ts` — **New file**: deterministic die roll tests with seeded PRNG

## Out of Scope

- `attack-vc-profile` (separate ticket FITLOPEFULEFF-017)
- US piece Casualties box distinction (tracked in `insurgent-attack-removal-order` macro; see FITLOPEFULEFF-002 note)
- Capability/momentum modifiers (Spec 28)
- Turn flow changes
- Kernel source code changes

## Acceptance Criteria

### Tests That Must Pass
1. `attack-nva-profile` compiles without diagnostics
2. Space filter: requires NVA pieces AND enemy pieces in same space
3. Cost: 1 NVA Resource per space
4. Guerrilla Attack mode: all NVA guerrillas activated (underground → active)
5. Guerrilla Attack mode: `rollRandom` produces d6 result (1-6)
6. Guerrilla Attack: if roll <= guerrilla count → 2 enemy pieces removed
7. Guerrilla Attack: if roll > guerrilla count → 0 damage (miss)
8. Troops Attack mode: no guerrilla activation, no die roll
9. Troops Attack: damage = floor(nvaTroops / 2)
10. Attrition: per US piece removed, attacker loses 1 piece to Available
11. Die roll deterministic with same PRNG seed
12. Free operation: per-space cost skipped
13. LimOp variant: max 1 space

### Invariants
- No kernel source files modified
- No compiler source files modified
- `insurgent-attack-removal-order` macro unchanged
- `rollRandom` kernel primitive unchanged
- Build passes (`npm run build`)
- Typecheck passes (`npm run typecheck`)
