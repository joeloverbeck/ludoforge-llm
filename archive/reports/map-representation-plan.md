# Map Representation Plan — Iteration 8

**Status**: COMPLETED

**Date**: 2026-03-30
**Based on**: EVALUATION #6 (average score: 6.5)
**Problems targeted**: [HIGH] Finer terrain granularity (Terrain Distinction = 6/10, stagnant 3 evaluations)

## Context

Terrain Distinction has been stagnant at 6/10 for 3 consecutive evaluations. The map currently uses only 6 unique province fill colors: 3 terrain-based (highland gold, jungle green, lowland green) and 3 country overrides (Laos sage, Cambodia tan-green, NV brown). The evaluation specifically recommends "shade variations within categories" and noted a possible fourth shade in war zone provinces as a step in the right direction.

**Iteration 7 status**: Fully implemented (all 13 checklist items confirmed in code). Iteration 7 targeted label/token readability — font sizes, token sizes, and lane spacing all updated. These changes have not yet been captured in screenshots, so the next evaluation will reflect both Iteration 7 and Iteration 8 changes together.

**Numbering note**: Iteration 7 was planned based on Eval #6's original "No Change" stub (effectively targeting Eval #5's priorities). Eval #6 was later corrected with actual scores showing the route-through-territory improvement. This iteration is numbered 8 to follow the implemented Iteration 7.

## Deferred Items

| Item | First recommended | Deferred since | Target iteration |
|------|-------------------|---------------|-----------------|
| Adaptive font sizing (zoom-responsive labels) | Eval #2 | Iteration 7 | 9 or later |
| Route-label z-order overlap | Eval #6 | Iteration 8 | 9 (requires new labelLayer in layer hierarchy) |
| Routes follow terrain contours (curved paths) | Eval #6 | Iteration 8 | No target yet |
| City circles embedded in territory | Eval #2 | Iteration 4 | No target yet |
| Saigon area visual congestion | Eval #5 | Iteration 6 | No target yet |
| S-curve geography refinement | Eval #2 | Iteration 4 | No target yet |
| Token faction-specific markers | Eval #1 | Iteration 7 | No target yet |

## Foundations Alignment

All changes are visual-config.yaml data — no foundation concerns. Per-zone color overrides are applied by the existing `VisualConfigProvider` resolution pipeline. No engine code, no GameSpecDoc changes, no schema changes.

## Current Code Architecture (reference for implementer)

### Color Resolution Pipeline (visual-config-provider.ts:161-189)

The `resolveZoneVisual()` method applies styles in cascade order:
1. **Default values** (shape: rectangle, color: null)
2. **Category style** (e.g., city → `#5b7fa5`)
3. **Attribute rules** — matched in order, later rules override earlier:
   - Terrain rules: `terrainTags: highland` → `#d4a656`, `jungle` → `#1a5c2a`, `lowland` → `#5db85d`
   - Country rules: `country: laos` → `#6b8f7b`, `cambodia` → `#7a8868`, `northVietnam` → `#8b5e3c`
4. **Per-zone overrides** — highest priority, keyed by zone ID

Per-zone overrides support all `ZoneVisualStyleSchema` fields including `color` and `strokeColor` (visual-config-types.ts:92-99, 182-184). No color overrides are currently used — only `label`, `shape`, and `vertices`.

### No code changes required

The `applyZoneStyle()` function (visual-config-provider.ts:590-605) already copies `color` and `strokeColor` from any style source to the resolved visual. Adding `color`/`strokeColor` to per-zone overrides in YAML will be picked up automatically.

## Reference Data

### FITL Province Terrain Classification

| Zone ID | Terrain | Country | Current Color | Proposed Override |
|---------|---------|---------|---------------|-------------------|
| quang-tri-thua-thien | highland | SVN | #d4a656 | — (keep) |
| quang-nam | highland | SVN | #d4a656 | — (keep) |
| binh-dinh | highland | SVN | #d4a656 | — (keep) |
| khanh-hoa | highland | SVN | #d4a656 | — (keep) |
| **pleiku-darlac** | **highland** | **SVN** | #d4a656 | **#c08530** (inland highland) |
| quang-tin-quang-ngai | lowland | SVN | #5db85d | — (keep, northern) |
| phu-bon-phu-yen | lowland | SVN | #5db85d | — (keep, northern) |
| **kien-phong** | **lowland** | **SVN** | #5db85d | **#8ab050** (delta lowland) |
| **kien-hoa-vinh-binh** | **lowland** | **SVN** | #5db85d | **#8ab050** (delta lowland) |
| **ba-xuyen** | **lowland** | **SVN** | #5db85d | **#8ab050** (delta lowland) |
| **kien-giang-an-xuyen** | **lowland** | **SVN** | #5db85d | **#8ab050** (delta lowland) |
| quang-duc-long-khanh | jungle | SVN | #1a5c2a | — (keep) |
| binh-tuy-binh-thuan | jungle | SVN | #1a5c2a | — (keep) |
| **tay-ninh** | **jungle** | **SVN** | #1a5c2a | **#4a4a20** (war zone jungle) |
| **phuoc-long** | **jungle** | **SVN** | #1a5c2a | **#4a4a20** (war zone jungle) |
| central-laos | jungle | laos | #6b8f7b | — (country override) |
| southern-laos | jungle | laos | #6b8f7b | — (country override) |
| northeast-cambodia | jungle | cambodia | #7a8868 | — (country override) |
| the-fishhook | jungle | cambodia | #7a8868 | — (country override) |
| the-parrots-beak | jungle | cambodia | #7a8868 | — (country override) |
| sihanoukville | jungle | cambodia | #7a8868 | — (country override) |
| north-vietnam | jungle | NV | #8b5e3c | — (country override) |

### New Color Palette — RGB Distances

| Variant | Hex | RGB | Stroke Hex | Distance from base |
|---------|-----|-----|------------|-------------------|
| Coastal highland (base) | #d4a656 | (212, 166, 86) | #8b6914 | — |
| **Inland highland** | **#c08530** | **(192, 133, 48)** | **#8a6020** | **54** from base highland |
| Northern lowland (base) | #5db85d | (93, 184, 93) | #2d7a2d | — |
| **Mekong Delta lowland** | **#8ab050** | **(138, 176, 80)** | **#6a8838** | **48** from base lowland |
| SVN jungle (base) | #1a5c2a | (26, 92, 42) | #0d3d18 | — |
| **War zone jungle** | **#4a4a20** | **(74, 74, 32)** | **#353518** | **52** from base jungle |

**Cross-category distances** (all new variants remain clearly in their category):

| New variant | vs Highland | vs Lowland | vs Jungle | vs Laos | vs Cambodia |
|-------------|-----------|-----------|----------|---------|-------------|
| Inland highland #c08530 | 54 (base) | 120 | 171 | 85 | 83 |
| Delta lowland #8ab050 | 72 | 48 (base) | 145 | 72 | 77 |
| War zone jungle #4a4a20 | 174 | 127 | 52 (base) | 82 | 106 |

All new variants maintain >70 distance from every other category — they will not be confused with a different terrain type.

**Within-category distances (48-54)**: These are below the 80 threshold for "reliable distinction between unrelated colors" but are appropriate for shade variation within a single terrain category. The purpose is subtle geographic differentiation, not categorical distinction. The physical FITL board also uses subtle shade variations within terrain types.

## Problem 1: Terrain Distinction stagnant at 6/10

**Evaluation score**: Terrain Distinction = 6/10 (unchanged for 3 consecutive evaluations)
**Root cause**: Only 6 unique province fill colors. Country overrides (Laos, Cambodia, NV) flatten any terrain variation within those countries. Within South Vietnam, 3 terrain types use a single color each with no geographic variation. The map looks like a paint-by-numbers with only 6 colors.

### Approaches Considered

1. **Per-zone color overrides in visual-config.yaml (data-only)**
   - Description: Add `color` and `strokeColor` to specific zone override entries in visual-config.yaml. The schema already supports these fields. Target 3 geographic sub-groups: inland highlands, Mekong Delta lowlands, war zone jungle. Adds 3 new shade variants, increasing unique province colors from 6 to 9.
   - Feasibility: HIGH — pure YAML data change, 7 zone overrides modified. Zero code changes.
   - Visual impact: MEDIUM-HIGH — 50% increase in color variety. Creates visible geographic sub-regions within terrain categories. War zone provinces near Cambodia border become visually distinct.
   - Risk: LOW — per-zone overrides are highest-priority in the cascade and have been battle-tested for shape/vertices. Color is the same schema field.

2. **Compound attribute rules (terrain + coastal)**
   - Description: Add new attribute rules combining `terrainTags` and `coastal` attributes. E.g., `highland + coastal` gets one shade, `highland + !coastal` gets another.
   - Feasibility: LOW — `attributeContainsValue()` only supports string and string-array matching (visual-config-provider.ts:638-648). The `coastal` attribute is a boolean (`true`/`false`), which would return `false` from `attributeContainsValue()`. Would require code changes to support boolean matching.
   - Visual impact: MEDIUM — same color variety as Approach 1 but with a more systematic mechanism.
   - Risk: MEDIUM — code change to attribute matching could affect existing rules. Needs testing.

3. **Texture/pattern overlays (hatching, stippling)**
   - Description: Add procedural texture patterns (diagonal lines, dots) overlaid on terrain fills to distinguish sub-regions. E.g., highland plateau gets cross-hatching, war zone gets stippling.
   - Feasibility: LOW — requires new Graphics drawing code, performance impact from per-frame pattern rendering, no existing pattern infrastructure in the renderer.
   - Visual impact: HIGH — would add a completely new visual dimension beyond color alone.
   - Risk: HIGH — significant code change, potential performance regression with complex patterns on 35+ zones, visual noise could reduce readability.

### Recommendation: Approach 1 (Per-zone color overrides)

**Why**: Maximum visual impact with zero code risk. The per-zone override mechanism is already proven (used for shape/vertices on all polygon zones). Adding `color` uses the exact same schema and pipeline. The 3 new shade variants target the most impactful geographic sub-groups: inland Central Highlands (Pleiku-Darlac), Mekong Delta (4 southern lowlands), and War Zone jungle (Tay Ninh, Phuoc Long near Cambodia border). These groupings reflect real FITL geographic distinctions that players recognize.

Approach 2 would be cleaner architecturally but requires a code change to support boolean attribute matching — an unnecessary prerequisite when per-zone overrides achieve the same visual result. Approach 3 is too large for one iteration and should be explored only if color-based approaches plateau.

## Implementation Steps

All steps target a single file: `data/games/fire-in-the-lake/visual-config.yaml`.

1. **Add inland highland color override** — **Depends on**: none
   - Zone: `pleiku-darlac:none` (existing override at line ~546)
   - Add: `color: "#c08530"` and `strokeColor: "#8a6020"`

2. **Add war zone jungle color overrides** — **Depends on**: none
   - Zone: `tay-ninh:none` (existing override at line ~578)
   - Add: `color: "#4a4a20"` and `strokeColor: "#353518"`
   - Zone: `phuoc-long:none` (existing override at line ~542)
   - Add: `color: "#4a4a20"` and `strokeColor: "#353518"`

3. **Add Mekong Delta lowland color overrides** — **Depends on**: none
   - Zone: `kien-phong:none` (existing override at line ~488)
   - Add: `color: "#8ab050"` and `strokeColor: "#6a8838"`
   - Zone: `kien-hoa-vinh-binh:none` (existing override at line ~484)
   - Add: `color: "#8ab050"` and `strokeColor: "#6a8838"`
   - Zone: `ba-xuyen:none` (existing override at line ~452)
   - Add: `color: "#8ab050"` and `strokeColor: "#6a8838"`
   - Zone: `kien-giang-an-xuyen:none` (existing override at line ~480)
   - Add: `color: "#8ab050"` and `strokeColor: "#6a8838"`

## Map Editor Scope

**Included in this iteration**:
- No editor-specific changes needed. The map editor uses the same `VisualConfigProvider` to resolve zone colors. Per-zone overrides apply to both game canvas and editor flows automatically.

**Deferred to future iteration**:
- None.

## Visual Config Changes

**File**: `data/games/fire-in-the-lake/visual-config.yaml`

Add `color` and `strokeColor` to 7 existing zone override entries. Example for one zone:

```yaml
# Before:
pleiku-darlac:none:
  label: Pleiku Darlac
  shape: polygon
  vertices: [-133, -903, 344, -651, 662, -489, 708, 64, 622, 584, -203, 626, -954, 89, -882, -609]

# After:
pleiku-darlac:none:
  label: Pleiku Darlac
  color: "#c08530"
  strokeColor: "#8a6020"
  shape: polygon
  vertices: [-133, -903, 344, -651, 662, -489, 708, 64, 622, 584, -203, 626, -954, 89, -882, -609]
```

**No schema changes needed.** `ZoneVisualOverrideSchema` already includes `color` and `strokeColor` via `ZoneVisualStyleSchema`.

## Verification

1. `pnpm turbo typecheck` — must pass (no code changes, but verify YAML parses correctly)
2. `pnpm -F @ludoforge/runner test` — must pass
3. Visual check — run dev server (`pnpm -F @ludoforge/runner dev`):
   - Pleiku-Darlac appears as a deeper amber gold, visibly different from neighboring coastal highland provinces (Binh Dinh, Khanh Hoa)
   - Tay Ninh and Phuoc Long appear as dark olive, distinct from the pure dark green of Quang Duc-Long Khanh and Binh Tuy-Binh Thuan
   - Mekong Delta provinces (Kien Phong, Kien Hoa-Vinh Binh, Ba Xuyen, Kien Giang-An Xuyen) appear as warm yellow-green, visibly different from the bright green of Quang Tin-Quang Ngai and Phu Bon-Phu Yen
   - At overview zoom, three distinct sub-shades visible within South Vietnam territory
   - Map editor shows the same color distinctions on light background
   - Laos, Cambodia, and NV provinces are unchanged

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Within-category shade difference too subtle at overview zoom | MEDIUM | Terrain Distinction score doesn't improve | RGB distances 48-54 are adequate for adjacent comparison. If insufficient, next iteration increases contrast. The overview zoom now benefits from Iteration 7's larger labels/tokens which reduce visual noise. |
| War zone olive (#4a4a20) confused with Cambodia tan-green (#7a8868) | LOW | Geographic misreading | RGB distance = 106, well above confusion threshold. Very different hue families (olive vs sage). |
| Delta yellow-green (#8ab050) confused with Laos sage (#6b8f7b) | LOW | Geographic misreading | RGB distance = 72, above confusion threshold. Delta is warmer/brighter, Laos is cooler/muted. |
| YAML parse error from added fields | VERY LOW | Runner fails to load visual config | `color` and `strokeColor` are already valid fields in `ZoneVisualOverrideSchema`. Verification step 1 catches this. |

## Implementation Verification Checklist

- [ ] `visual-config.yaml`: `pleiku-darlac:none` has `color: "#c08530"` and `strokeColor: "#8a6020"`
- [ ] `visual-config.yaml`: `tay-ninh:none` has `color: "#4a4a20"` and `strokeColor: "#353518"`
- [ ] `visual-config.yaml`: `phuoc-long:none` has `color: "#4a4a20"` and `strokeColor: "#353518"`
- [ ] `visual-config.yaml`: `kien-phong:none` has `color: "#8ab050"` and `strokeColor: "#6a8838"`
- [ ] `visual-config.yaml`: `kien-hoa-vinh-binh:none` has `color: "#8ab050"` and `strokeColor: "#6a8838"`
- [ ] `visual-config.yaml`: `ba-xuyen:none` has `color: "#8ab050"` and `strokeColor: "#6a8838"`
- [ ] `visual-config.yaml`: `kien-giang-an-xuyen:none` has `color: "#8ab050"` and `strokeColor: "#6a8838"`
- [ ] No code files modified (pure data change)

## Research Sources

All solutions extend existing patterns in the codebase. No external research needed:
- **Per-zone overrides**: Already used for `label`, `shape`, and `vertices` on 25+ zones. `ZoneVisualOverrideSchema` extends `ZoneVisualStyleSchema` which includes `color`/`strokeColor`. The resolution pipeline (`resolveZoneVisual` line 188) applies overrides last.
- **Color palette design**: Based on the physical FITL board's terrain coloring (highlands are tan/gold, lowlands are green, jungle is dark green) with shade variations for geographic sub-regions.

## Outcome

- Completion date: 2026-04-20
- What actually changed:
  - preserved the iteration-specific map plan and archived it because it is stale planning material rather than a current report
- Deviations from original plan:
  - none; the document remains available as historical context if map work resumes later
- Verification results:
  - current-reference scan found no active skill or ticket using this file directly
