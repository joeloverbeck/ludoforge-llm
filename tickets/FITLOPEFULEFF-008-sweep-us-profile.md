# FITLOPEFULEFF-008: Sweep US Profile

**Status**: Pending
**Priority**: P1
**Estimated effort**: Medium (3-4 hours)
**Spec reference**: Spec 26, Task 26.5 — `sweep-us-profile` (Rule 3.2.3, US variant)
**Depends on**: FITLOPEFULEFF-001, FITLOPEFULEFF-002 (`sweep-activation` macro), FITLOPEFULEFF-003

## Summary

Replace the stub `sweep-profile` (COIN side) with a faction-specific `sweep-us-profile` implementing the full US Sweep operation per FITL Rule 3.2.3.

Key behaviors:
- **Space filter**: Provinces or Cities only (not LoCs, not North Vietnam)
- **Cost**: 0 (US pays nothing)
- **Movement**: US Troops from adjacent; can hop through 1 LoC free of NVA/VC
- **Activation count**: US cubes (Troops + Police) + Irregulars (Special Forces)
- **Terrain**: Jungle only — 1 activation per 2 sweepers (round down). Non-Jungle: 1:1.
- **LimOp-aware**: Max 1 space

## Files to Touch

- `test/fixtures/cnl/compiler/fitl-operations-coin.md` — Replace `sweep-profile` stub with `sweep-us-profile` YAML
- `data/games/fire-in-the-lake.md` — Add `sweep-us-profile` operation profile
- `test/integration/fitl-coin-operations.test.ts` — Update profile ID references, add test cases
- `test/integration/fitl-patrol-sweep-movement.test.ts` — Add US Sweep movement/activation tests

## Out of Scope

- `sweep-arvn-profile` (separate ticket FITLOPEFULEFF-009)
- Highland terrain effect on Sweep (Highland does NOT affect Sweep — only Jungle does)
- Capability/momentum modifiers (Spec 28)
- Turn flow changes
- Kernel source code changes

## Acceptance Criteria

### Tests That Must Pass
1. `sweep-us-profile` compiles without diagnostics
2. US Sweep costs 0 (no resource deduction)
3. Space filter: Provinces and Cities only (LoCs excluded)
4. US Troops move from adjacent spaces into target
5. Sweep activation counts US cubes (Troops+Police) + Irregulars
6. Jungle terrain: activations halved (floor division by 2)
7. Non-Jungle: 1:1 activation ratio
8. `sweep-activation` macro correctly invoked with `cubeFaction: 'US'`, `sfType: irregulars`
9. LimOp variant: max 1 space
10. Existing compilation test updated for new profile ID

### Invariants
- No kernel source files modified
- No compiler source files modified
- `sweep-activation` macro (from FITLOPEFULEFF-002) unchanged by this ticket
- Highland does NOT affect Sweep activation ratio
- Build passes (`npm run build`)
- Typecheck passes (`npm run typecheck`)
