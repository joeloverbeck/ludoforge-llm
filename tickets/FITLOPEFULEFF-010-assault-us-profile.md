# FITLOPEFULEFF-010: Assault US Profile

**Status**: Pending
**Priority**: P1
**Estimated effort**: Medium (3-4 hours)
**Spec reference**: Spec 26, Task 26.6 — `assault-us-profile` (Rule 3.2.4, US variant)
**Depends on**: FITLOPEFULEFF-001, FITLOPEFULEFF-002 (`coin-assault-removal-order`), FITLOPEFULEFF-003

## Summary

Replace the stub `assault-profile` (COIN side) with a faction-specific `assault-us-profile` implementing the full US Assault operation per FITL Rule 3.2.4.

Key behaviors:
- **Space filter**: Spaces with US Troops AND enemy (NVA/VC) pieces
- **Cost**: 0 for US. Optional 3 ARVN Resources for ARVN follow-up in 1 space.
- **Damage formula**:
  - With US Base: 2 enemies per US Troop
  - Highland without US Base: 1 enemy per 2 US Troops (floor division)
  - Otherwise: 1 enemy per US Troop
- **ARVN follow-up**: In 1 space, pay 3 ARVN Resources for ARVN Assault using ARVN damage formula
- **Removal**: Uses `coin-assault-removal-order` macro (+6 Aid per insurgent Base removed)
- **LimOp-aware**: Max 1 space

## Files to Touch

- `data/games/fire-in-the-lake.md` — Replace stub in production spec with `assault-us-profile` YAML
- `test/integration/fitl-coin-operations.test.ts` — Update profile ID, add test cases

## Out of Scope

- `assault-arvn-profile` (separate ticket FITLOPEFULEFF-011)
- Capability/momentum modifiers (Spec 28)
- Turn flow changes
- Kernel source code changes

## Acceptance Criteria

### Tests That Must Pass
1. `assault-us-profile` compiles without diagnostics
2. US Assault costs 0 (no resource deduction for base operation)
3. Space filter: requires US Troops AND enemy pieces
4. Damage with US Base: 2 × usTroops
5. Damage in Highland, no Base: floor(usTroops / 2)
6. Damage otherwise: 1 × usTroops
7. Each insurgent Base removed: +6 Aid (via `coin-assault-removal-order`)
8. ARVN follow-up: costs 3 ARVN Resources, applies ARVN damage formula
9. ARVN follow-up damage: Highland floor(arvnCubes/3), non-Highland floor(arvnCubes/2)
10. LimOp variant: max 1 space
11. Free operation: no cost change (US already pays 0)

### Invariants
- No kernel source files modified
- No compiler source files modified
- `coin-assault-removal-order` macro unchanged
- Build passes (`npm run build`)
- Typecheck passes (`npm run typecheck`)
