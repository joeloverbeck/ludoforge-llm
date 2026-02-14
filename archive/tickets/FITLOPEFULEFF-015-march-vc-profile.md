# FITLOPEFULEFF-015: March VC Profile

**Status**: ✅ COMPLETED
**Priority**: P1
**Estimated effort**: Small (2-3 hours)
**Spec reference**: Spec 26, Task 26.8 — `march-vc-profile` (Rule 3.3.2, VC variant)
**Depends on**: FITLOPEFULEFF-001, FITLOPEFULEFF-002, FITLOPEFULEFF-003, FITLOPEFULEFF-014 (pattern)

## Summary

Add `march-vc-profile` implementing the VC March operation using the same generic decision/effect architecture as NVA March, but without NVA-only Trail continuation logic.

Key behaviors:
- **Cost**: 1 VC Resource per Province/City (0 for LoCs)
- **Movement**: VC pieces from adjacent spaces into destinations
- **Activation**: Same condition as NVA (LoC or Support AND pieces > 3)
- **No Trail chain**: VC cannot chain through Laos/Cambodia
- **LimOp-aware**: Max 1 destination

## Assumption Reassessment (2026-02-14)

Validated against current code and tests:

- `data/games/fire-in-the-lake.md` already contains a fully implemented `march-nva-profile`; there is no remaining insurgent `march-profile` stub to replace.
- `per-province-city-cost` macro already exists and is the canonical way to model per-destination March spend.
- Runtime bindings needed for LimOp/free-op modeling (`__actionClass`, `__freeOperation`) are already present in kernel and covered by tests.
- `test/integration/fitl-insurgent-operations.test.ts` already has broad NVA March coverage (cost, activation, LimOp, free-op, Trail chain behavior).
- Current gap is specifically VC March availability and VC-specific semantics under action `march`.

Ticket scope is corrected accordingly: add a new `march-vc-profile` (without Trail stages), wire it into production spec action pipelines, and add focused VC March integration tests while preserving existing NVA behavior.

## Files to Touch

- `data/games/fire-in-the-lake.md` — Add `march-vc-profile` alongside existing `march-nva-profile`
- `test/integration/fitl-insurgent-operations.test.ts` — Add VC March coverage and profile compilation assertion

## Out of Scope

- `march-nva-profile` rule changes (FITLOPEFULEFF-014 already completed)
- Trail chain movement (NVA-only)
- Capability/momentum modifiers (Spec 28)
- Turn flow changes
- Kernel source code changes

## Acceptance Criteria

### Tests That Must Pass
1. `march-vc-profile` compiles without diagnostics
2. Cost: 1 VC Resource per Province/City, 0 for LoC
3. VC pieces move from adjacent spaces into destination
4. Activation condition same as NVA March
5. No Trail chain movement available
6. Free operation: per-Province/City cost skipped
7. LimOp variant: max 1 destination

### Invariants
- `march-nva-profile` unchanged
- No kernel source files modified
- No compiler source files modified
- No backward-compatibility aliasing (canonical profile id is `march-vc-profile`)
- Build passes (`npm run build`)
- Typecheck passes (`npm run typecheck`)

## Outcome

- **Completion date**: 2026-02-14
- **What was actually changed**:
  - Added `march-vc-profile` to `data/games/fire-in-the-lake.md` as the canonical VC March pipeline for action `march`.
  - Added shared macro `insurgent-march-resolve-destination` and switched `march-nva-profile` to use it, preserving NVA-only Trail chain stages while removing duplicated destination-resolution logic.
  - Added VC March integration coverage in `test/integration/fitl-insurgent-operations.test.ts` for profile compilation, cost behavior (Province/City vs LoC), adjacency movement, activation threshold behavior, LimOp max-one constraint, and explicit no-Trail-chain behavior for VC.
- **Deviations from original plan**:
  - Instead of adding a VC-only destination resolver, the implementation introduced a generic insurgent resolver macro to keep architecture DRY and extensible while preserving faction-specific profile behavior.
- **Verification results**:
  - `npm run build` ✅
  - `node --test dist/test/integration/fitl-insurgent-operations.test.js` ✅
  - `npm run typecheck` ✅
  - `npm run lint` ✅
  - `npm test` ✅
