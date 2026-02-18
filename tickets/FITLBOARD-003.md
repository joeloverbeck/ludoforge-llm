# FITLBOARD-003: FITL Visual Hints in YAML Data

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — data-only change in GameSpecDoc YAML
**Deps**: None (can be done in parallel with FITLBOARD-001/002; data is parsed by existing schemas)

## Problem

All 47 FITL map spaces in `data/games/fire-in-the-lake/40-content-data-assets.md` lack `visual:` blocks. When the zone renderer supports visual hints (FITLBOARD-002), FITL zones will still fall back to identical default rectangles.

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

- `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test` — all 2142+ tests pass
- `ZoneVisualHintsSchema` already validates shape/width/height/color/label from FITLBOARD architectural rework
- `parseGameSpec()` parses visual blocks without errors
- Each space has exactly one `visual:` block with at least `shape` and `color`

## Tests

- **Existing**: `fitl-production-map-cities.test.ts`, `fitl-production-map-provinces-locs.test.ts` — all existing tests pass (they don't assert visual fields)
- **New test** (in `fitl-production-map-cities.test.ts`): All 8 cities have `visual.shape === 'circle'`
- **New test** (in `fitl-production-map-provinces-locs.test.ts`): All 22 provinces have `visual.shape === 'rectangle'`, all 17 LoCs have `visual.shape === 'line'`
- **New test**: Every space has a non-empty `visual.label` string
