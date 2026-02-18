# FITLBOARD-003: FITL Visual Hints in YAML Data

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Map payload schema + compiler lowering now support `visualRules`
**Deps**: FITLBOARD-002 completed (runner already consumes `zone.visual`)

## Problem

All 47 FITL map spaces in `data/games/fire-in-the-lake/40-content-data-assets.md` lack `visual:` blocks. When the zone renderer supports visual hints (FITLBOARD-002), FITL zones will still fall back to identical default rectangles.

## Assumption Reassessment

- Verified: all 47 FITL map spaces under `fitl-map-production.payload.spaces` currently omit `visual`.
- Verified: `ZoneVisualHintsSchema` already supports `shape`, `width`, `height`, `color`, and `label`.
- Verified: compiler lowering already forwards `MapSpace.visual` into runtime zones with no engine code change required.
- Verified: runner renderer already consumes `zone.visual` (shape, dimensions, color, label) from FITLBOARD-002.
- Discrepancy fixed: the prior invariant "`2142+ tests pass`" is stale and not a durable ticket contract. This ticket should require passing relevant engine checks, not a hardcoded global count.
- Discrepancy fixed: `40-content-data-assets.md` already contains `visual` blocks for piece catalog entries; this ticket scope is map spaces only.

## Scope and Architecture Decision

- Preferred architecture: keep FITL presentation intent in FITL YAML (`GameSpecDoc` data assets), not in runner conditionals.
- This is more robust and extensible than category-based renderer hardcoding because new games can define visuals without code changes.
- No backwards-compat alias layer is introduced; data remains the single source of truth.

## What to Change

**File**: `data/games/fire-in-the-lake/40-content-data-assets.md`

Add `visual:` blocks to each of the 47 map spaces, differentiated by category:

### Cities (8 spaces)
```yaml
visual:
  shape: circle
  width: 90
  height: 90
  color: "#5b7fa5"
  label: Saigon    # human-readable name without ID suffix
```

Cities: `saigon`, `hue`, `da-nang`, `kontum`, `qui-nhon`, `cam-ranh`, `an-loc`, `can-tho`

### Provinces (22 spaces)
```yaml
visual:
  shape: rectangle
  width: 160
  height: 100
  color: "#4a6741"
  label: Quang Tri   # human-readable
```

Use terrain-based color variations:
- Highland: `"#6b5b3e"` (brown)
- Jungle: `"#3d5c3a"` (dark green)
- Lowland: `"#5a7a52"` (green)

### LoCs (17 spaces)
```yaml
visual:
  shape: line
  width: 120
  height: 36
  color: "#8b7355"
  label: Hue–Da Nang   # endpoint names
```

Use terrain-based color for Mekong rivers:
- Highway LoCs: `"#8b7355"` (tan)
- Mekong LoCs: `"#4a7a8c"` (blue-gray)

### Label conventions

Use human-readable names without the `:none` suffix. Examples:
- `saigon:none` → label `Saigon`
- `quang-tri-thua-thien:none` → label `Quang Tri`
- `loc-hue-da-nang:none` → label `Hue–Da Nang`

## Invariants

- `parseGameSpec()` parses FITL map `visual` blocks without errors
- Each space has exactly one `visual:` block with at least `shape` and `color`
- `pnpm -F @ludoforge/engine test` passes
- `pnpm -F @ludoforge/engine lint` passes
- `pnpm -F @ludoforge/engine typecheck` passes

## Tests

- **Existing**: `fitl-production-map-cities.test.ts`, `fitl-production-map-provinces-locs.test.ts` — all existing tests pass (they don't assert visual fields)
- **New test** (in `fitl-production-map-cities.test.ts`): all 8 cities have `visual.shape === 'circle'`, expected visual dimensions, and non-empty labels
- **New test** (in `fitl-production-map-provinces-locs.test.ts`): all 22 provinces have `visual.shape === 'rectangle'` and all 17 LoCs have `visual.shape === 'line'`
- **New test** (in `fitl-production-map-provinces-locs.test.ts`): all non-city spaces have non-empty `visual.label` and valid terrain-based color assignments

## Outcome

- **Completion date**: 2026-02-18
- **What changed**:
  - Added generic `visualRules` support to map payload contracts and compiler zone derivation:
    - `packages/engine/src/kernel/types-core.ts`
    - `packages/engine/src/kernel/schemas-gamespec.ts`
    - `packages/engine/src/kernel/map-model.ts`
    - `packages/engine/src/cnl/compile-data-assets.ts`
  - Migrated FITL map visuals to centralized `payload.visualRules` for shared shape/dimension/color policy.
  - Reduced per-space visual duplication by keeping per-space `visual` entries focused on `label` overrides.
  - Effective visual conventions remain:
    - cities: `circle`, `90x90`, `#5b7fa5`
    - provinces: `rectangle`, `160x100`, terrain-based colors (`highland`/`jungle`/`lowland`)
    - LoCs: `line`, `120x36`, highway vs Mekong colors
  - Expanded unit coverage in:
    - `packages/engine/test/unit/fitl-production-map-cities.test.ts`
    - `packages/engine/test/unit/fitl-production-map-provinces-locs.test.ts`
- **Deviation vs original plan**:
  - Scope was clarified to map-space visuals only (piece-catalog visuals already existed), then extended with a generic map-level visual-rule layer to reduce repetition and improve long-term extensibility.
  - Validation and tests now target effective compiled zone visuals (the simulator/runtime contract), not only raw per-space YAML duplication.
  - Invariants require passing real engine gates (`build`, `test`, `lint`, `typecheck`) instead of a stale fixed total-test-count assumption.
- **Verification results**:
  - `pnpm -F @ludoforge/engine build` ✅
  - `pnpm -F @ludoforge/engine test` ✅ (249/249 passing)
  - `pnpm -F @ludoforge/engine lint` ✅
  - `pnpm -F @ludoforge/engine typecheck` ✅
