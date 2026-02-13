# FITLOPEFULEFF-011: Assault ARVN Profile

**Status**: Pending
**Priority**: P1
**Estimated effort**: Small (2-3 hours)
**Spec reference**: Spec 26, Task 26.6 — `assault-arvn-profile` (Rule 3.2.4, ARVN variant)
**Depends on**: FITLOPEFULEFF-001, FITLOPEFULEFF-002, FITLOPEFULEFF-003, FITLOPEFULEFF-010 (pattern)

## Summary

Add `assault-arvn-profile` implementing the ARVN Assault operation per Rule 3.2.4.

Key behaviors:
- **Space filter**: Spaces with ARVN cubes AND enemy pieces
- **Cost**: 3 ARVN Resources per space
- **Damage formula**:
  - Provinces: Troops only (Police excluded)
  - Cities/LoCs: Troops + Police
  - Highland: 1 enemy per 3 ARVN cubes (floor)
  - Non-Highland: 1 enemy per 2 ARVN cubes (floor)
- **Removal**: Uses `coin-assault-removal-order` macro (+6 Aid per insurgent Base removed)
- **LimOp-aware**: Max 1 space

## Architectural Notice

- The current production data still contains transitional COIN stub resource wiring (`coinResources`, `assaultCount`).
- This ticket must remove ARVN Assault dependence on transitional COIN stub semantics and implement canonical FITL/Spec 26 behavior for `assault-arvn-profile` using ARVN resource rules.
- No backward-compatibility profile aliases or dual-path logic: if tests break due to old stub assumptions, update tests to the canonical behavior.

## Files to Touch

- `data/games/fire-in-the-lake.md` — Replace stub in production spec with `assault-arvn-profile` YAML
- `test/integration/fitl-coin-operations.test.ts` — Add ARVN Assault test cases

## Out of Scope

- `assault-us-profile` modifications (FITLOPEFULEFF-010)
- Capability/momentum modifiers (Spec 28)
- Turn flow changes
- Kernel source code changes

## Acceptance Criteria

### Tests That Must Pass
1. `assault-arvn-profile` compiles without diagnostics
2. ARVN Assault costs 3 ARVN Resources per space
3. ARVN Assault legality requires `arvnResources >= 3`
4. Province: only Troops count toward damage (Police excluded)
5. City/LoC: Troops + Police count toward damage
6. Highland damage: floor(arvnCubes / 3)
7. Non-Highland damage: floor(arvnCubes / 2)
8. Each insurgent Base removed: +6 Aid (via `coin-assault-removal-order`)
9. Free operation: per-space cost skipped
10. LimOp variant: max 1 space

### Invariants
- `assault-us-profile` unchanged
- No kernel source files modified
- No compiler source files modified
- Build passes (`npm run build`)
- Typecheck passes (`npm run typecheck`)
