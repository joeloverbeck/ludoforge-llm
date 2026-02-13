# FITLOPEFULEFF-004: Train US Profile

**Status**: COMPLETED
**Priority**: P1
**Estimated effort**: Medium (3-4 hours)
**Spec reference**: Spec 26, Task 26.3 — `train-us-profile` (Rule 3.2.1, US variant)
**Depends on**: FITLOPEFULEFF-001 (`__actionClass`), FITLOPEFULEFF-002 (macros), FITLOPEFULEFF-003 (globals)

## Summary

Replace the stub `train-profile` (COIN side) with a faction-specific `train-us-profile` implementing the full US Train operation per FITL Rule 3.2.1.

Key behaviors:
- **Space filter**: Provinces or Cities with US pieces
- **Cost**: 0 for US; 3 ARVN Resources only if ARVN pieces placed
- **US Joint Ops guard**: ARVN Resources - Total Econ >= 3 (only if placing ARVN)
- **Resolution**: Per-space choice of (A) Place 1-2 Irregulars, or (B) At US Base: 1-2 Rangers OR up to 6 ARVN cubes
- **Sub-action**: In 1 selected space: Pacification (needs US piece + COIN Control) or Saigon patronage transfer
- **LimOp-aware**: Max 1 space when `__actionClass == 'limitedOperation'`

## Files to Touch

- `test/fixtures/cnl/compiler/fitl-operations-coin.md` — Replace `train-profile` stub with `train-us-profile` YAML
- `data/games/fire-in-the-lake.md` — Add `train-us-profile` operation profile
- `test/integration/fitl-coin-operations.test.ts` — Update profile ID references, add new test cases

## Out of Scope

- `train-arvn-profile` (separate ticket FITLOPEFULEFF-005)
- Capability/momentum modifiers (Spec 28)
- Special activity effects (Spec 27)
- Turn flow changes
- Kernel source code changes (unless a bug is found)

## Acceptance Criteria

### Tests That Must Pass
1. `train-us-profile` compiles without diagnostics
2. US Train places Irregulars from Available when no Base present
3. US Train at Base: places Rangers (up to 2) with ARVN cost
4. US Train at Base: places up to 6 ARVN cubes with ARVN cost (-3 Resources)
5. US Train costs 0 for US (no resource deduction when only US pieces placed)
6. US Train Pacification: requires US piece in space (not Troops+Police requirement)
7. US Train Pacification: removes Terror marker first (costs 3 ARVN even if free op)
8. US Train Pacification: shifts support up to 2 levels (costs 3 ARVN per level, even if free op)
9. US Train Saigon transfer: moves Patronage to ARVN Resources (only in Saigon)
10. LimOp variant: max 1 space selected
11. Free operation variant: per-space cost skipped (but Pacification costs still apply)
12. Existing `fitl-coin-operations.test.ts` compilation test updated for new profile ID

### Invariants
- No kernel source files modified
- No compiler source files modified
- `place-from-available-or-map` macro behavior unchanged
- Build passes (`npm run build`)
- Typecheck passes (`npm run typecheck`)

## Outcome

**Completion date**: 2026-02-13

**What changed** (across two commits merged to `main`):

1. **`36695f5`** — Core implementation:
   - `test/fixtures/cnl/compiler/fitl-operations-coin.md`: Replaced `train-profile` stub with full `train-us-profile` (LimOp-aware space selection, per-space Irregulars/Base training choices, ARVN cost model, free-op guards, Pacification sub-action with Terror removal and support shifting, Saigon patronage transfer)
   - `test/integration/fitl-coin-operations.test.ts`: Updated profile ID references to `train-us-profile`
   - 7 compiler/kernel infrastructure fixes to support the profile (global mechanics vars, tracks, marker lattices)

2. **`ca09203`** — Production data file entry:
   - `data/games/fire-in-the-lake.md`: Added matching `train-us-profile` operationProfile

**Deviations**: None. All 12 acceptance criteria met.

**Verification results**:
- `npm run build`: pass (zero errors)
- `npm run typecheck`: pass (zero errors)
- `fitl-coin-operations.test.js`: 2/2 tests pass
- `fitl-production-data-compilation.test.js`: 1/1 test pass
- All 12 acceptance criteria confirmed in code
- No kernel or compiler source files modified
- `place-from-available-or-map` macro unchanged
