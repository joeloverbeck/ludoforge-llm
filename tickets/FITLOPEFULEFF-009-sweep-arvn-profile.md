# FITLOPEFULEFF-009: Sweep ARVN Profile

**Status**: Pending
**Priority**: P1
**Estimated effort**: Small (2-3 hours)
**Spec reference**: Spec 26, Task 26.5 — `sweep-arvn-profile` (Rule 3.2.3, ARVN variant)
**Depends on**: FITLOPEFULEFF-001, FITLOPEFULEFF-002 (`sweep-activation` macro), FITLOPEFULEFF-003, FITLOPEFULEFF-008 (pattern)

## Summary

Add `sweep-arvn-profile` implementing the ARVN Sweep operation. Same structure as US Sweep but with ARVN faction references and per-space cost.

Key behaviors:
- **Space filter**: Provinces or Cities only
- **Cost**: 3 ARVN Resources per space
- **Movement**: ARVN Troops from adjacent
- **Activation count**: ARVN cubes (Troops + Police) + Rangers
- **Terrain**: Same Jungle halving rule
- **LimOp-aware**: Max 1 space

## Files to Touch

- `data/games/fire-in-the-lake.md` — Replace stub in production spec with `sweep-arvn-profile` YAML
- `test/integration/fitl-coin-operations.test.ts` — Add ARVN Sweep test cases
- `test/integration/fitl-patrol-sweep-movement.test.ts` — Add ARVN Sweep tests

## Out of Scope

- `sweep-us-profile` modifications (FITLOPEFULEFF-008)
- Capability/momentum modifiers (Spec 28)
- Turn flow changes
- Kernel source code changes

## Acceptance Criteria

### Tests That Must Pass
1. `sweep-arvn-profile` compiles without diagnostics
2. ARVN Sweep costs 3 ARVN Resources per space
3. ARVN Sweep legality requires `arvnResources >= 3`
4. ARVN Troops move from adjacent spaces
5. Activation counts ARVN cubes + Rangers (not Irregulars)
6. `sweep-activation` macro invoked with `cubeFaction: 'ARVN'`, `sfType: rangers`
7. Jungle terrain halves activation
8. Free operation: per-space cost skipped
9. LimOp variant: max 1 space

### Invariants
- `sweep-us-profile` unchanged
- No kernel source files modified
- No compiler source files modified
- Build passes (`npm run build`)
- Typecheck passes (`npm run typecheck`)
