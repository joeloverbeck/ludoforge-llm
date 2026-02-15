# FITLRULES1-001: FITL Stacking Constraints

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None expected (data-first); validate with tests

## Problem

The engine already has generic stacking enforcement:

- Runtime: `src/kernel/effects-token.ts` calls `checkStackingConstraints()` on `moveToken` and `createToken`.
- Compile-time setup validation: `validateInitialPlacementsAgainstStackingConstraints()` runs in GameDef validation.

But FITL production map data (`data/games/fire-in-the-lake/40-content-data-assets.md`) currently has no `stackingConstraints`, so rules below are not centralized in map data:

- **Rule 1.4.2**: No more than 2 Bases of any factions may occupy a single Province or City.
- **Rule 1.4.2**: Bases may not occupy LoCs.
- **Rule 1.3.5**: Only NVA and VC forces may occupy North Vietnam.

## Assumptions Reassessed

1. `fitl-map-production` exists and is the selected production map asset. Confirmed.
2. Engine support for `stackingConstraints` is already present in compiler, runtime, and validation. Confirmed.
3. Existing tests already cover generic stacking behavior, but not the FITL production data asset wiring end-to-end. Confirmed.
4. `pieceFilter.factions` is not ideal for this ticket due to faction-case differences across layers (scenario placement faction values are lowercase; runtime token `props.faction` values are uppercase in FITL piece runtime props).  
   Updated scope: use `pieceTypeIds` for the North Vietnam rule to keep compile-time and runtime behavior deterministic without engine changes.

## Architecture Rationale

This change strengthens architecture by encoding game rules in FITL data assets instead of action-specific guards. It is more robust and extensible than current scattered rule checks because:

- rules become declarative and map-scoped,
- enforcement is automatic for all token movement/creation paths,
- compiler and runtime share one generic mechanism.

No backwards-compat aliases are introduced.

## What to Change

**File**: `data/games/fire-in-the-lake/40-content-data-assets.md`

Add `stackingConstraints` to the `fitl-map-production` payload (after `markerLattices`):

```yaml
stackingConstraints:
  - id: max-2-bases-per-space
    description: "No more than 2 Bases of any Factions may occupy a single Province or City"
    spaceFilter:
      spaceTypes: [province, city]
    pieceFilter:
      pieceTypeIds: [us-bases, arvn-bases, nva-bases, vc-bases]
    rule: maxCount
    maxCount: 2
  - id: no-bases-on-locs
    description: "Bases may not occupy LoCs"
    spaceFilter:
      spaceTypes: [loc]
    pieceFilter:
      pieceTypeIds: [us-bases, arvn-bases, nva-bases, vc-bases]
    rule: prohibit
  - id: north-vietnam-insurgent-only
    description: "Only NVA and VC forces may occupy North Vietnam"
    spaceFilter:
      country: [northVietnam]
    pieceFilter:
      pieceTypeIds: [us-troops, us-bases, us-irregulars, arvn-troops, arvn-police, arvn-rangers, arvn-bases]
    rule: prohibit
```

## Invariants

1. Placing a 3rd base (any faction) in a Province or City must be rejected by the kernel.
2. Placing any base on a LoC must be rejected by the kernel.
3. Placing US or ARVN forces in North Vietnam must be rejected by the kernel.
4. NVA and VC forces in North Vietnam must remain legal.
5. Existing initial setup (scenario data assets) must not violate these constraints.
6. FITL compiled `GameDef` must include exactly these production constraints.

## Tests

1. **Unit/integration**: Compile production FITL source and assert `compiled.gameDef.stackingConstraints` includes the 3 IDs above.
2. **Integration**: Use compiled FITL `GameDef` and runtime effects to verify:
   - 3rd base in province/city throws `STACKING_VIOLATION`,
   - base in LoC throws `STACKING_VIOLATION`,
   - US/ARVN piece in `north-vietnam:none` throws `STACKING_VIOLATION`,
   - NVA/VC placement in North Vietnam remains legal.
3. **Validation coverage**: Verify production scenario setup compiles/validates with zero stacking constraint violations.

## Outcome

- **Completion date**: February 15, 2026
- **What changed**:
  - Added `stackingConstraints` to `fitl-map-production` in `data/games/fire-in-the-lake/40-content-data-assets.md` with three constraints:
    - `max-2-bases-per-space`
    - `no-bases-on-locs`
    - `north-vietnam-insurgent-only`
  - Added production-wired integration coverage in `test/integration/fitl-production-stacking-constraints.test.ts` for:
    - compiled GameDef constraint projection,
    - runtime rejection of 3rd base in province/city,
    - runtime rejection of base placement on LoC,
    - runtime rejection of US placement in North Vietnam,
    - runtime allowance of NVA placement in North Vietnam.
- **Deviations from original plan**:
  - North Vietnam rule uses `pieceTypeIds` instead of `pieceFilter.factions` to avoid compile/runtime faction-case divergence and keep behavior deterministic without engine changes.
  - Validation assertions were scoped to zero **errors** and zero `STACKING_CONSTRAINT_VIOLATION` diagnostics (non-blocking existing warnings are present in production compile output).
- **Verification results**:
  - `npm test` passed.
  - `npm run lint` passed.
