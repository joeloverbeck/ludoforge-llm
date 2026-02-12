# FITLOPEFULEFF-006: Patrol US Profile

**Status**: Pending
**Priority**: P1
**Estimated effort**: Medium (3-4 hours)
**Spec reference**: Spec 26, Task 26.4 — `patrol-us-profile` (Rule 3.2.2, US variant)
**Depends on**: FITLOPEFULEFF-001, FITLOPEFULEFF-002, FITLOPEFULEFF-003

## Summary

Replace the stub `patrol-profile` (COIN side) with a faction-specific `patrol-us-profile` implementing the full US Patrol operation per FITL Rule 3.2.2.

Key behaviors:
- **Cost**: 0 (US pays nothing)
- **Target**: LoCs only
- **Movement**: US cubes move from adjacent spaces into target LoCs
- **Activation**: 1 enemy Guerrilla per US cube in each LoC (1:1 ratio)
- **Free Assault**: In 1 LoC at no added cost; US may not add ARVN
- **LimOp**: All moving cubes must end on single destination

## Files to Touch

- `test/fixtures/cnl/compiler/fitl-operations-coin.md` — Replace `patrol-profile` stub with `patrol-us-profile` YAML
- `data/games/fire-in-the-lake.md` — Add `patrol-us-profile` operation profile
- `test/integration/fitl-coin-operations.test.ts` — Update profile ID references, add test cases
- `test/integration/fitl-patrol-sweep-movement.test.ts` — **New file**: tests for cube movement and activation stages

## Out of Scope

- `patrol-arvn-profile` (separate ticket FITLOPEFULEFF-007)
- Capability/momentum modifiers (Spec 28)
- Turn flow changes
- Kernel source code changes

## Acceptance Criteria

### Tests That Must Pass
1. `patrol-us-profile` compiles without diagnostics
2. US Patrol costs 0 (no resource deduction)
3. US Patrol targets LoCs only (space filter)
4. US cubes move from adjacent spaces into target LoC
5. Activation: 1 enemy guerrilla per US cube (1:1 ratio) — underground → active
6. Free Assault in 1 LoC: damage applied using `coin-assault-removal-order` macro
7. Free Assault uses US damage formula (with/without Base consideration)
8. LimOp variant: max 1 destination LoC
9. Patrol with no adjacent US cubes: no movement but activation still runs
10. Existing `fitl-coin-operations.test.ts` compilation test updated for new profile ID

### Invariants
- No kernel source files modified
- No compiler source files modified
- Patrol free Assault does NOT allow ARVN follow-up
- Build passes (`npm run build`)
- Typecheck passes (`npm run typecheck`)
