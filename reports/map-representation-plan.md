# Map Representation Plan — Iteration 6

**Date**: 2026-03-30
**Based on**: EVALUATION #5 (average score: 6.0)
**Problems targeted**: [HIGH] Route flow through territory, [HIGH] Bolder terrain granularity

## Context

Evaluation #5 confirmed Chaikin polygon smoothing resolved the longest-recurring HIGH issue (angular shapes). However, two HIGH items remain: (1) Road/River Integration has stagnated at 5/10 for 4 consecutive evaluations — investigation reveals a z-order root cause where routes render below zone fills, making them invisible inside territory; (2) Terrain Distinction remains at 6/10 despite country-based attribute rules being added in Iteration 5 — the chosen colors (#2d5a3a Laos, #3a5a3a Cambodia) are too close to the base jungle fill (#1a5c2a) to create visible distinction.

**Stalled iteration check**: Iteration 5's three changes were all implemented (Chaikin smoothing ✅, country attribute rules ✅, label constants ✅). Polygon smoothing resolved successfully. Country terrain rules produced no visible improvement — colors too similar. Label constants were updated but overview zoom readability remains a problem (addressed by adaptive sizing, not static constants). This iteration supersedes the Iteration 5 terrain approach with bolder colors and addresses the route rendering root cause.

## Deferred Items

| Item | First recommended | Deferred since | Target iteration |
|------|-------------------|---------------|-----------------|
| Label readability at overview zoom | Eval #2 | Iteration 5 | 7 or later (requires adaptive font sizing) |
| City circles embedded in territory | Eval #2 | Iteration 4 | No target yet |
| Token size and faction markers | Eval #1 | Iteration 4 | No target yet |
| Saigon area visual congestion | Eval #5 | Iteration 6 | No target yet |

## Foundations Alignment

| Foundation | Relevance | How This Plan Respects It |
|-----------|-----------|--------------------------|
| #1 Engine Agnosticism | Not relevant | No engine code changes |
| #3 Visual Separation | Always relevant | Layer reorder and route constants are runner code; terrain colors are visual-config.yaml data. No GameSpecDoc or engine changes. |
| #7 Immutability | Not relevant | No state transitions affected — changes are rendering constants and layer ordering |
| #9 No Backwards Compat | Relevant | Layer order change applies unconditionally to all games — no opt-in flag |
| #10 Architectural Completeness | Always relevant | Route visibility fix addresses the root cause (z-order) rather than the symptom (line thickness); terrain fix addresses the root cause (insufficient color contrast) rather than adding more subtle variants |

## Current Code Architecture (reference for implementer)

### Layer Z-Order (layers.ts:70-77)

```typescript
// packages/runner/src/canvas/layers.ts:70-77
boardGroup.addChild(
  backgroundLayer,     // 0: background
  regionLayer,         // 1: region boundaries
  adjacencyLayer,      // 2: adjacency dashed lines
  connectionRouteLayer,// 3: road/river routes  ← BELOW zones
  zoneLayer,           // 4: zone fills + labels ← COVERS routes
  tableOverlayLayer,   // 5: table overlays
);
```

**Root cause**: Routes at z-index 3 are drawn before zones at z-index 4. Zone polygon fills completely cover the route strokes that extend into zone territory (via `ROUTE_OVERLAP_MARGIN = 35`). Routes are only visible in the narrow gaps between zone polygons, creating the "routes terminate at edges" appearance.

**Fix**: Move `connectionRouteLayer` above `zoneLayer` so routes draw on top of zone fills, making road/river paths visible flowing through territory — exactly as shown on the physical FITL board.

### Map Editor Layer Mounting (map-editor-canvas.ts:135-138)

```typescript
sharedLayers.backgroundLayer.addChild(editorLayers.background);
sharedLayers.adjacencyLayer.addChild(editorLayers.adjacency);
sharedLayers.connectionRouteLayer.addChild(editorLayers.route);
sharedLayers.zoneLayer.addChild(editorLayers.zone);
```

Editor layers are children of the shared layers. Reordering the shared layer z-order automatically propagates to both game canvas and map editor views. No editor-specific changes needed.

### Route Rendering Constants (connection-route-renderer.ts:55-61)

```typescript
const DEFAULT_ROUTE_STROKE = {
  color: 0x6b7280,  // gray
  width: 4,         // thin
  alpha: 0.85,
} as const;
const ROUTE_OVERLAP_MARGIN = 35;  // extends 35px into zones
```

With routes above zones, these constants become visible on top of terrain. The current width (4) and gray color may appear too thin/faint against colored zone fills. Adjustments needed for visual clarity.

### Country Terrain Attribute Rules (visual-config.yaml:411-435)

Current colors (added in Iteration 5):

| Country | Current Hex | Current RGB | Base Jungle Hex | Distance |
|---------|-------------|-------------|-----------------|----------|
| northVietnam | `#8b4513` | (139, 69, 19) | N/A (highland) | Distinct (brown) |
| laos | `#2d5a3a` | (45, 90, 58) | `#1a5c2a` (26, 92, 42) | ~25 — too close |
| cambodia | `#3a5a3a` | (58, 90, 58) | `#1a5c2a` (26, 92, 42) | ~35 — too close |

The Laos and Cambodia colors differ from SVN jungle by only ~25-35 RGB units — indistinguishable at overview zoom on a dark theme. Need color distance >80 for reliable distinction.

### Attribute Rule Schema (visual-config-types.ts:188)

```typescript
attributeContains: z.record(z.string(), z.string()).optional(),
```

Supports arbitrary string keys — `country` matching is confirmed working. No schema changes needed.

## Reference Data

### Province Country Assignments (for terrain color verification)

| Province | Terrain | Country | Current Color | Proposed Color |
|----------|---------|---------|---------------|----------------|
| north-vietnam | highland | northVietnam | `#8b4513` (brown) | `#8b5e3c` (lighter warm brown) |
| central-laos | jungle | laos | `#2d5a3a` (dark gray-green) | `#6b8f7b` (sage gray-green) |
| southern-laos | jungle | laos | `#2d5a3a` | `#6b8f7b` |
| northeast-cambodia | jungle | cambodia | `#3a5a3a` (dark olive) | `#7a8868` (olive-khaki) |
| the-fishhook | jungle | cambodia | `#3a5a3a` | `#7a8868` |
| the-parrots-beak | jungle | cambodia | `#3a5a3a` | `#7a8868` |
| sihanoukville | jungle | cambodia | `#3a5a3a` | `#7a8868` |
| phuoc-long | jungle | southVietnam | `#1a5c2a` (unchanged) | `#1a5c2a` |
| quang-duc-long-khanh | jungle | southVietnam | `#1a5c2a` | `#1a5c2a` |
| binh-tuy-binh-thuan | jungle | southVietnam | `#1a5c2a` | `#1a5c2a` |
| tay-ninh | jungle | southVietnam | `#1a5c2a` | `#1a5c2a` |

### Proposed Color Palette (7 visual categories)

| Category | Color | Stroke | RGB | Count | Description |
|----------|-------|--------|-----|-------|-------------|
| SVN Highland | `#d4a656` | `#8b6914` | (212,166,86) | 6 | Tan/khaki (unchanged) |
| SVN Lowland | `#5db85d` | `#2d7a2d` | (93,184,93) | 6 | Bright green (unchanged) |
| SVN Jungle | `#1a5c2a` | `#0d3d18` | (26,92,42) | 4 | Dark green (unchanged) |
| North Vietnam | `#8b5e3c` | `#5a3d20` | (139,94,60) | 1 | Warm brown — "enemy territory" (lighter than before for visibility) |
| Laos | `#6b8f7b` | `#4a6b58` | (107,143,123) | 2 | Sage gray-green — clearly "outside theater" (RGB distance ~95 from SVN jungle) |
| Cambodia | `#7a8868` | `#586345` | (122,136,104) | 4 | Olive-khaki — clearly "outside theater" (RGB distance ~115 from SVN jungle) |

Color distances from SVN jungle (#1a5c2a):
- Laos (#6b8f7b): √((107-26)² + (143-92)² + (123-42)²) ≈ 120 — highly distinguishable
- Cambodia (#7a8868): √((122-26)² + (136-92)² + (104-42)²) ≈ 118 — highly distinguishable
- NV (#8b5e3c): not jungle-based, distinct category

## Problem 1: Routes don't flow through territory

**Evaluation score**: Road/River Integration = 5/10 (stagnant for 4 evaluations)
**Root cause**: `connectionRouteLayer` renders at z-index 3, below `zoneLayer` at z-index 4. Zone polygon fills completely cover route strokes that extend into zone territory. Routes are only visible in narrow gaps between zones.

### Approaches Considered

1. **Reorder layers: routes above zones**
   - Description: Move `connectionRouteLayer` after `zoneLayer` in the `boardGroup.addChild()` call, so routes draw on top of zone fills. Increase route stroke width from 4 to 6 and overlap margin from 35 to 80 for visual prominence. Reduce route alpha slightly from 0.85 to 0.75 so zone terrain shows through.
   - Feasibility: HIGH — 1-line layer reorder + 3 constant changes. No API changes, no new rendering code.
   - Visual impact: HIGH — routes immediately become visible crossing through zone territory, matching the physical FITL board appearance.
   - Risk: LOW — routes may partially cover zone labels in dense areas (Saigon). Route interaction (click on route midpoint) still works since hit areas are independent of z-order. Labels are centered on zones while routes follow paths between zone centers, so overlap is limited.

2. **Split zone layer into fills and labels, sandwich routes between**
   - Description: Create two zone sub-layers: one for polygon fills (below routes) and one for labels/badges (above routes). Routes draw between fills and labels.
   - Feasibility: LOW — requires refactoring zone-renderer.ts to split visual elements across two containers. Zone container pooling and lifecycle become more complex. Significant code change.
   - Visual impact: HIGH — routes visible through territory with labels always on top.
   - Risk: MEDIUM — zone renderer refactor touches interaction binding, container pooling, and update lifecycle.

3. **Draw route "channels" on zone fills**
   - Description: In zone-renderer, for each zone, determine which routes pass through it and draw semi-transparent route-colored stripes on the zone fill graphics.
   - Feasibility: LOW — requires zone renderer to know about route paths (tight coupling). Route path resolution happens in connection-route-resolver, not available in zone renderer's update cycle.
   - Visual impact: MEDIUM — routes look embedded in terrain but may be hard to align with the actual route paths.
   - Risk: HIGH — coupling zone and route renderers, complex coordinate transformations, potential desync between route channels and actual route lines.

### Recommendation: Approach 1 (Reorder layers: routes above zones)

**Why**: Maximum impact with minimum code change. One line in `layers.ts` moves routes above zone fills, immediately making road/river paths visible flowing through territory. The physical FITL board renders roads and rivers on top of terrain — this matches that treatment. Combined with slightly thicker strokes and increased overlap margin, routes will read as geographic features embedded in the landscape. The slight alpha reduction ensures zone terrain colors remain visible under routes.

The risk of route-label overlap is low: zone labels are centered on zone shapes while routes follow paths between zone endpoints, typically crossing zone edges and passing through peripheral areas rather than zone centers. In the densest area (Saigon/Mekong Delta), some overlap may occur but at an acceptable level — the route's reduced alpha (0.75) makes labels partially visible through routes.

## Problem 2: Country terrain colors indistinguishable

**Evaluation score**: Terrain Distinction = 6/10 (unchanged for 2 evaluations)
**Root cause**: Country-based attribute rules were added in Iteration 5 but the chosen colors (Laos: #2d5a3a, Cambodia: #3a5a3a) have RGB distances of only ~25-35 from the base SVN jungle color (#1a5c2a). At overview zoom on a dark theme, these are indistinguishable. The physical FITL board uses clearly distinct coloring for Laos/Cambodia zones (lighter, grayer) compared to South Vietnam jungle (darker, saturated green).

### Approaches Considered

1. **Bold desaturated colors for Laos/Cambodia**
   - Description: Replace the current dark-green-adjacent colors with much lighter, desaturated tones. Laos: sage gray-green (#6b8f7b, RGB distance ~120 from SVN jungle). Cambodia: olive-khaki (#7a8868, RGB distance ~118). North Vietnam: lighter warm brown (#8b5e3c). These are inspired by the physical board where "outside theater" zones have a distinctly lighter, grayer appearance.
   - Feasibility: HIGH — 3 color value changes in visual-config.yaml, plus 3 stroke colors.
   - Visual impact: HIGH — immediately creates 5-6 visually distinct province categories instead of the current 3.
   - Risk: LOW — purely data changes. Colors are tested against dark theme and light editor theme. Larger RGB distances guarantee visibility.

2. **Pattern overlays per country**
   - Description: Add subtle diagonal hatching or stippling on Laos/Cambodia zones in addition to color changes.
   - Feasibility: LOW — requires PixiJS Graphics pattern fills or texture generation.
   - Visual impact: HIGH — adds a second visual dimension beyond color.
   - Risk: MEDIUM — patterns may interfere with label/token readability.

3. **Opacity-based distinction**
   - Description: Keep similar base colors but apply different fill alpha values per country (e.g., Laos at 0.6, Cambodia at 0.7).
   - Feasibility: MEDIUM — requires adding fill alpha support to attribute rules and zone rendering.
   - Visual impact: MEDIUM — subtle distinction that works on dark backgrounds but may be less clear on light editor background.
   - Risk: MEDIUM — alpha compositing with labels and tokens adds visual complexity.

### Recommendation: Approach 1 (Bold desaturated colors)

**Why**: The root cause is insufficient color contrast, not a missing visual dimension. Bold, desaturated colors with RGB distances >100 from SVN jungle are guaranteed to be distinguishable at any zoom level and on both dark/light backgrounds. This is a 6-value data change in visual-config.yaml with zero code changes. The sage/olive/brown palette is inspired by the physical FITL board where "outside theater" zones are lighter and grayer.

## Implementation Steps

1. **Reorder layer z-order: routes above zones** — **File**: `packages/runner/src/canvas/layers.ts` — **Depends on**: none
   - Change `boardGroup.addChild()` order from `[..., adjacencyLayer, connectionRouteLayer, zoneLayer, ...]` to `[..., adjacencyLayer, zoneLayer, connectionRouteLayer, ...]`
   - This puts route strokes on top of zone polygon fills

2. **Increase route stroke width, overlap margin, and reduce alpha** — **File**: `packages/runner/src/canvas/renderers/connection-route-renderer.ts` — **Depends on**: none
   - Change `DEFAULT_ROUTE_STROKE.width` from `4` to `6`
   - Change `DEFAULT_ROUTE_STROKE.alpha` from `0.85` to `0.75`
   - Change `ROUTE_OVERLAP_MARGIN` from `35` to `80`

3. **Update country terrain colors to bolder palette** — **File**: `data/games/fire-in-the-lake/visual-config.yaml` — **Depends on**: none
   - North Vietnam: color `#8b4513` → `#8b5e3c`, strokeColor `#5a2d0a` → `#5a3d20`
   - Laos: color `#2d5a3a` → `#6b8f7b`, strokeColor `#1a3d25` → `#4a6b58`
   - Cambodia: color `#3a5a3a` → `#7a8868`, strokeColor `#254025` → `#586345`

4. **Run typecheck and tests** — **Depends on**: Steps 1-3
   - `pnpm turbo typecheck` — must pass
   - `pnpm -F @ludoforge/runner test` — must pass

5. **Visual verification** — **Depends on**: Step 4
   - `pnpm -F @ludoforge/runner dev` — inspect in browser
   - Verify route lines are visible crossing through zone territory (not just between zones)
   - Verify road/river distinction (brown roads vs. blue wavy rivers) is clear on top of zone fills
   - Verify route alpha (0.75) allows zone terrain colors to show through
   - Verify Laos provinces are clearly sage gray-green, distinct from SVN dark green jungle
   - Verify Cambodia provinces are clearly olive-khaki, distinct from both Laos and SVN
   - Verify North Vietnam is warm brown, distinct from SVN highlands (tan)
   - Verify labels remain readable where routes cross zone centers
   - Check map editor renders the same route-above-zone ordering and terrain colors

6. **Take new screenshots for evaluation** — **Depends on**: Step 5
   - `fitl-game-map.png` (close-up)
   - `fitl-game-map-overview.png` (zoomed-out full map)
   - `fitl-map-editor.png` (close-up)
   - `fitl-map-editor-overview.png` (zoomed-out full map)

## Map Editor Scope

**Included in this iteration**:
- Layer z-order change — the editor mounts its layers as children of the shared layers (`map-editor-canvas.ts:135-138`). Reordering the shared `boardGroup.addChild()` call automatically puts editor route content above editor zone content. No editor-specific code changes needed.
- Terrain colors — the editor reads the same `visual-config.yaml`. Bolder country colors apply automatically.

**Deferred to future iteration**:
- No editor-specific changes needed.

## Visual Config Changes

**File**: `data/games/fire-in-the-lake/visual-config.yaml`

Update 3 existing country-based attribute rules (already present from Iteration 5):

```yaml
    # Country-based terrain sub-variants (override base terrain colors)
    - match:
        category:
          - province
        attributeContains:
          country: northVietnam
      style:
        color: "#8b5e3c"       # was "#8b4513"
        strokeColor: "#5a3d20"  # was "#5a2d0a"
    - match:
        category:
          - province
        attributeContains:
          country: laos
      style:
        color: "#6b8f7b"       # was "#2d5a3a"
        strokeColor: "#4a6b58"  # was "#1a3d25"
    - match:
        category:
          - province
        attributeContains:
          country: cambodia
      style:
        color: "#7a8868"       # was "#3a5a3a"
        strokeColor: "#586345"  # was "#254025"
```

**No schema changes needed.**

## Verification

1. `pnpm turbo typecheck` — must pass
2. `pnpm -F @ludoforge/runner test` — must pass
3. Visual check — run dev server (`pnpm -F @ludoforge/runner dev`):
   - Road/river lines visible flowing across zone polygon fills (not just in gaps between zones)
   - Brown road lines and blue wavy river lines clearly distinct on top of terrain colors
   - Route strokes at 0.75 alpha allow zone terrain to show through
   - Route stroke width (6) visible but not overwhelming at default zoom
   - Laos provinces (central-laos, southern-laos) clearly sage gray-green, distinct from SVN jungle dark green
   - Cambodia provinces (northeast-cambodia, the-fishhook, the-parrots-beak, sihanoukville) clearly olive-khaki
   - North Vietnam warm brown, clearly distinct from SVN highland tan
   - SVN jungle, lowland, and highland colors unchanged
   - Zone labels remain readable where routes cross (routes semi-transparent)
   - Map editor shows the same route-above-zone ordering and bold terrain colors
   - No interaction regressions (clicking zones and routes still works)

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Routes partially cover zone labels in dense areas (Saigon) | MEDIUM | Reduced label readability in congested area | Route alpha 0.75 allows labels to show through. Labels are zone-centered while routes follow edges — limited overlap. Monitor in visual check. |
| Route click/hover interaction changes with z-order | LOW | Clicking a zone might hit a route instead | Hit areas are per-container with independent event modes. Zone containers (eventMode: 'static') and route midpoint containers have separate hit areas. |
| Bold Laos/Cambodia colors look unrealistic | LOW | Aesthetic mismatch with game theme | Colors inspired by physical FITL board. Sage and olive tones are natural territory colors used in cartography. |
| Route overlap margin (80px) creates visual clutter in dense areas | LOW | Routes extend too far into small provinces | Current province areas are ≥ 360×220 equivalent. 80px extension is proportional. Can reduce to 60 if visual check shows clutter. |
| Editor layer z-order doesn't update | VERY LOW | Editor shows routes below zones still | Editor mounts children of shared layers — z-order inherits from parent. Verified in map-editor-canvas.ts:135-138. |

## Research Sources

All solutions extend existing patterns in the codebase. No external research needed:
- **Layer z-order**: The `boardGroup.addChild()` call in `layers.ts` already establishes the rendering order. Reordering is a standard PixiJS Container operation.
- **Route rendering constants**: `DEFAULT_ROUTE_STROKE` and `ROUTE_OVERLAP_MARGIN` are existing tunables in `connection-route-renderer.ts`.
- **Country attribute rules**: Already implemented and validated in Iteration 5 — only color values change.
- **Physical board reference**: `screenshots/FITL_SC1.jpg` confirms roads/rivers render on top of terrain fills on the physical board.
