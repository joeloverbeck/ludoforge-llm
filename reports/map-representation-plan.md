# Map Representation Plan — Iteration 3

**Date**: 2026-03-30
**Based on**: EVALUATION #2 (average score: 5.0)
**Problems targeted**: Label/Token Readability [HIGH], Terrain Distinction [HIGH], Route Integration [HIGH]

## Context

Evaluation #2 showed major progress (2.5 -> 5.0) from the polygon provinces and terrain colors added in iteration 2. However, labels remain nearly illegible at 16px monospace, terrain has only 3 color variants covering 3+ distinct types, and routes still terminate at polygon edges rather than flowing through territory. This iteration focuses on these three highest-impact readability and visual fidelity improvements.

Deferred to iteration 4: polygon shape softening (curved borders), LoC zone restyling, city embedding within provinces.

## Foundations Alignment

| Foundation | Relevance | How This Plan Respects It |
|-----------|-----------|--------------------------|
| #1 Engine Agnosticism | Not relevant | No engine code changes |
| #3 Visual Separation | Always relevant | All changes in visual-config.yaml, runner renderers, and presentation code |
| #7 Immutability | Not relevant | No state transition changes |
| #9 No Backwards Compat | Relevant | Font registry changes replace old fonts, no aliases |
| #10 Architectural Completeness | Always relevant | Addresses root cause of each problem (font size, color palette, route geometry) |

## Current Code Architecture (reference for implementer)

### Label Creation Pipeline

Labels are BitmapText objects created in `zone-renderer.ts:166-171`:
```typescript
const nameLabel = createBitmapLabel('', 0, 0, 16, {
  fontName: STROKE_LABEL_FONT_NAME,  // 'ludoforge-label-stroke'
  fill: '#ffffff',
  stroke: { color: '#000000', width: 3 },
  anchor: { x: 0.5, y: 0 },
});
```

The bitmap font is installed in `bitmap-font-registry.ts:41-51` at **14px base size**, monospace family, with 3px black stroke. BitmapText scales this internally, but 16px usage is barely above the 14px install size, limiting quality.

Label **positioning** is computed in `presentation-scene.ts:206-221`:
```typescript
const bottomEdge = visual.shape === 'circle'
  ? Math.min(visual.width, visual.height) / 2
  : visual.height / 2;
// ...
nameLabel: {
  text: displayName,
  x: 0,
  y: bottomEdge + LABEL_GAP,  // LABEL_GAP = 8
  visible: true,
},
```

Labels are placed **below** the zone shape. This means they sit in the dark background gap between provinces, competing with adjacency lines and route lines for visibility.

The map editor uses the same font at 14px (`map-editor-zone-renderer.ts:67-76`) with `LABEL_OFFSET_Y = 14`.

### Terrain Color Resolution

Colors are resolved through a layered system in `visual-config-provider.ts:160-188`:
1. Default (no color)
2. `categoryStyles.province` — no color set (null)
3. `attributeRules` — matches on `terrainTags` attribute:
   - `highland` -> `#c4a66a` (tan)
   - `jungle` -> `#2d4a2d` (dark green)
   - `lowland` -> `#7cb87c` (light green)
4. Per-zone `overrides` (highest priority)

The `drawZoneBase()` function in `zone-renderer.ts:238-239` applies the resolved color:
```typescript
const fill = parseHexColor(zone.render.fillColor ?? undefined) ?? 0x4d5c6d;
```

Current issue: only 3 terrain colors exist. The physical FITL board uses ~5 distinct terrain treatments (highlands, lowlands, jungle, plus cities have their own scheme, and LoCs are route-styled). Provinces with mixed terrain tags get only the first matching rule.

### Route Rendering

Routes are rendered in `connection-route-renderer.ts`. Route geometry is resolved from config-defined points/segments in `resolveRouteGeometry()` (line 394-424). Routes use `sampleResolvedRoutePath()` to generate polyline points, then `drawRouteCurve()` (line 337-392) draws via `Graphics.quadraticCurveTo()` or `Graphics.lineTo()`.

Route endpoints are zone-center-based: they connect from one zone's center to another's. The `getEdgePointAtAngle()` function in `shape-utils.ts:86-124` computes where the route enters/exits a zone boundary, but the visual result is that routes terminate exactly at the polygon edge rather than extending slightly into/through the territory.

### Key Type Definitions

- `ZoneVisualStyleSchema` (`visual-config-types.ts:92-99`): `{ shape?, width?, height?, color?, connectionStyleKey?, vertices? }`
- `ConnectionStyleConfigSchema` (`visual-config-types.ts:101-108`): `{ strokeWidth, strokeColor, strokeAlpha?, wavy?, waveAmplitude?, waveFrequency? }`
- `PresentationZoneRenderSpec` (`presentation-scene.ts`): Contains `nameLabel: { text, x, y, visible }`, `fillColor`, `stroke`
- `BitmapFontName` = `'ludoforge-label' | 'ludoforge-label-stroke'` (`bitmap-font-registry.ts:17`)

## Problem 1: Label/Token Readability (Score: 4/10)

**Root cause**: Labels use 16px monospace BitmapText installed at 14px base resolution, placed below zone shapes in the dark background gap. The monospace font is space-inefficient for province names. Black stroke on white text provides some contrast but the text is simply too small.

### Approaches Considered

1. **Increase font size to 20-22px and install bitmap font at matching resolution**
   - Feasibility: HIGH — change font install size in `bitmap-font-registry.ts` and label creation in `zone-renderer.ts`
   - Visual impact: HIGH — directly addresses the core readability issue
   - Risk: Larger text may overflow small zones; bitmap font texture atlas grows (minor memory increase)

2. **Move labels inside zone shapes (centered) instead of below**
   - Feasibility: MEDIUM — requires changing label positioning from `bottomEdge + LABEL_GAP` to `(0, 0)` and handling text-on-fill contrast
   - Visual impact: HIGH — labels on the terrain fill match the physical board design where names are inside provinces
   - Risk: Labels may be obscured by tokens; needs dynamic contrast adjustment per terrain color

3. **Switch from BitmapText to Pixi Text with a sans-serif font for better rendering quality**
   - Feasibility: LOW — BitmapText was chosen specifically to avoid PixiJS TexturePool crashes (#11735)
   - Visual impact: MEDIUM — better font rendering but doesn't fix the size/placement problem
   - Risk: Reintroduces the crash bug that motivated the BitmapText switch

### Recommendation: Approach 1 + partial Approach 2

Increase the bitmap font install size to 22px (allowing clean rendering at 20-22px usage). Move name labels **inside** the zone shape (centered vertically and horizontally) for provinces and polygons, keeping the below-zone placement only for circles (cities) where interior space is limited. Add a semi-transparent dark background pill behind labels for legibility on light terrain fills.

**Why**: Combining size increase with interior placement matches the physical board design (labels inside provinces) and maximizes readability. The background pill ensures contrast on all terrain colors without needing per-terrain color logic.

## Problem 2: Terrain Distinction (Score: 5/10)

**Root cause**: Only 3 attribute rules exist for terrain coloring (highland, jungle, lowland). The physical FITL board uses more nuanced terrain treatment: highlands are warm tan/brown, lowlands are bright green, jungle is dark green. The current colors are muted/desaturated, making them hard to distinguish from each other.

### Approaches Considered

1. **Expand color palette with more saturated, board-accurate colors**
   - Feasibility: HIGH — purely YAML config changes in `visual-config.yaml` attributeRules
   - Visual impact: HIGH — more saturated colors make terrain immediately identifiable
   - Risk: LOW — only config changes, no code changes needed

2. **Add pattern/texture overlays (hatching, stippling) per terrain type**
   - Feasibility: LOW — PixiJS Graphics doesn't natively support fill patterns; would need shader or sprite-based textures
   - Visual impact: HIGH — physical board uses subtle texture variations
   - Risk: Significant code complexity, potential performance impact

3. **Use border color variation per terrain type (brown borders for highlands, green borders for jungle)**
   - Feasibility: HIGH — add `strokeColor` to attribute rules and apply in zone renderer
   - Visual impact: MEDIUM — adds another dimension of distinction but may be subtle
   - Risk: LOW — extends existing attribute rule system

### Recommendation: Approach 1 + elements of Approach 3

Update the terrain color palette to more saturated, board-accurate values. Add terrain-based stroke/border colors so province outlines reinforce terrain type.

**Why**: Purely config-driven, high-impact, and zero-risk for Approach 1. Border color variation (Approach 3) adds a second visual channel. The current colors (#c4a66a, #2d4a2d, #7cb87c) are too muted and close in value.

Proposed palette (inspired by physical board):
- Highland: fill `#d4a656` (warmer tan), stroke `#8b6914` (golden brown)
- Lowland: fill `#5db85d` (brighter green), stroke `#2d7a2d` (forest green)
- Jungle: fill `#1a5c2a` (deeper green), stroke `#0d3d18` (very dark green)
- City: fill `#5b7fa5` (existing steel blue), stroke `#3a5a7a` (darker blue)

## Problem 3: Route Integration (Score: 5/10)

**Root cause**: Routes terminate at the polygon edge because `getEdgePointAtAngle()` computes the boundary intersection and drawing stops there. On the physical board, roads and rivers flow visually through the territory.

### Approaches Considered

1. **Extend route lines slightly past polygon edges (inset into territory) using an overlap margin**
   - Feasibility: HIGH — adjust start/end points in route geometry to move them inward by N pixels from the edge
   - Visual impact: MEDIUM — routes would visually enter provinces but wouldn't fully flow through
   - Risk: LOW — simple coordinate adjustment, easily tunable

2. **Render routes beneath zone fills so routes appear to pass through provinces**
   - Feasibility: MEDIUM — requires changing z-ordering of route containers relative to zone containers
   - Visual impact: HIGH — routes would visually flow under province fills
   - Risk: MEDIUM — routes become invisible under opaque fills; need partial transparency

3. **Render routes connecting zone centers with zone fills drawn semi-transparently over them**
   - Feasibility: LOW — complex rendering with masking/blending
   - Visual impact: HIGH — most realistic road/river integration
   - Risk: HIGH — significant architectural change to rendering pipeline

### Recommendation: Approach 1

Extend route endpoints inward past the polygon boundary by a configurable margin (~35px). Routes visually penetrate into province territory rather than stopping at the edge. Combined with slightly thicker route strokes, this creates the impression of roads/rivers flowing through provinces.

**Why**: Simplest change with meaningful visual impact. Approach 2 requires transparent fills (conflicts with opaque territory tessellation). Approach 3 is architecturally heavy. The inset approach works with the existing architecture.

Implementation: In `connection-route-renderer.ts`, after resolving route geometry, extend each endpoint further along the line direction past the polygon edge intersection.

## Implementation Steps

1. **Update bitmap font install size** — **File**: `packages/runner/src/canvas/text/bitmap-font-registry.ts` — **Depends on**: none
   - Change `fontSize: 14` to `fontSize: 22` for the stroke label font (line 45)
   - Change `fontSize: 14` to `fontSize: 22` for the plain label font (line 34)

2. **Increase label font size in zone renderer** — **File**: `packages/runner/src/canvas/renderers/zone-renderer.ts` — **Depends on**: Step 1
   - Change `createBitmapLabel('', 0, 0, 16, ...)` to fontSize 20 (line 166)
   - Change label anchor to `{ x: 0.5, y: 0.5 }` for centered placement

3. **Move label positioning inside zone shapes** — **File**: `packages/runner/src/presentation/presentation-scene.ts` — **Depends on**: none
   - In `resolveZoneRenderSpec()` (line 199), change label y from `bottomEdge + LABEL_GAP` to `0` for polygon/rectangle shapes
   - Keep `bottomEdge + LABEL_GAP` for circle shapes (cities)
   - Move markers label to `LABEL_LINE_HEIGHT` below name label (inside zone)

4. **Add label background pill rendering** — **File**: `packages/runner/src/canvas/renderers/zone-renderer.ts` — **Depends on**: Steps 2-3
   - Add a Graphics object to `ZoneVisualElements` for the label background
   - In `updateZoneVisuals()`, draw a `roundRect` behind the nameLabel sized to text bounds + 6px padding
   - Fill: `0x000000` alpha `0.45`, corner radius 4px

5. **Update terrain fill colors** — **File**: `data/games/fire-in-the-lake/visual-config.yaml` — **Depends on**: none
   - Highland: `#c4a66a` -> `#d4a656`
   - Lowland: `#7cb87c` -> `#5db85d`
   - Jungle: `#2d4a2d` -> `#1a5c2a`

6. **Add strokeColor to visual config schema** — **File**: `packages/runner/src/config/visual-config-types.ts` — **Depends on**: none
   - Add `strokeColor: z.string().optional()` to `ZoneVisualStyleSchema`

7. **Resolve strokeColor in visual config provider** — **File**: `packages/runner/src/config/visual-config-provider.ts` — **Depends on**: Step 6
   - Include `strokeColor` in the layered resolution cascade alongside `color`
   - Return it in the resolved zone visual

8. **Apply resolved stroke color in zone renderer** — **File**: `packages/runner/src/canvas/renderers/zone-renderer.ts` — **Depends on**: Step 7
   - In `drawZoneBase()`, use `zone.visual.strokeColor` (if present) instead of hardcoded `0x111827`
   - Fall back to `zone.render.stroke.color` for interaction highlights

9. **Add terrain stroke colors to FITL config** — **File**: `data/games/fire-in-the-lake/visual-config.yaml` — **Depends on**: Steps 6-8
   - Highland: `strokeColor: "#8b6914"`
   - Lowland: `strokeColor: "#2d7a2d"`
   - Jungle: `strokeColor: "#0d3d18"`

10. **Extend route endpoints past polygon edges** — **File**: `packages/runner/src/canvas/renderers/connection-route-renderer.ts` — **Depends on**: none
    - After route geometry is resolved, extend start/end points by ~35px inward along the line direction
    - Add constant `ROUTE_OVERLAP_MARGIN = 35`

11. **Increase route stroke widths** — **File**: `data/games/fire-in-the-lake/visual-config.yaml` — **Depends on**: none
    - Highway: `strokeWidth: 8` -> `strokeWidth: 10`
    - Mekong: `strokeWidth: 12` -> `strokeWidth: 14`

12. **Update map editor label font size** — **File**: `packages/runner/src/map-editor/map-editor-zone-renderer.ts` — **Depends on**: Step 1
    - Update fontSize from 14 to 20

## Map Editor Scope

**Included in this iteration**:
- Label font size increase (Step 12) — uses same bitmap font
- Terrain color changes (Steps 5, 9) — automatic via shared visual-config.yaml

**Deferred to future iteration**:
- Label positioning inside zones — editor uses fixed below-zone layout with drag handles; moving labels inside shapes requires rethinking the editor interaction model
- Label background pill — editor has light background, less needed for contrast

## Visual Config Changes

### `data/games/fire-in-the-lake/visual-config.yaml`

**Attribute rules** — updated terrain colors with stroke colors:
```yaml
attributeRules:
  - match:
      category: [province]
      attributeContains:
        terrainTags: highland
    style:
      color: "#d4a656"
      strokeColor: "#8b6914"
  - match:
      category: [province]
      attributeContains:
        terrainTags: jungle
    style:
      color: "#1a5c2a"
      strokeColor: "#0d3d18"
  - match:
      category: [province]
      attributeContains:
        terrainTags: lowland
    style:
      color: "#5db85d"
      strokeColor: "#2d7a2d"
```

**Connection styles** — thicker routes:
```yaml
connectionStyles:
  highway:
    strokeWidth: 10
  mekong:
    strokeWidth: 14
```

### Schema changes

Add to `ZoneVisualStyleSchema` in `visual-config-types.ts`:
```typescript
strokeColor: z.string().optional(),
```

## Verification

1. `pnpm turbo typecheck` — must pass
2. `pnpm -F @ludoforge/runner test` — must pass
3. Visual check — run dev server (`pnpm -F @ludoforge/runner dev`):
   - Province labels should be ~20px, centered inside polygon shapes, with dark background pill
   - Labels readable at both close-up and moderate zoom levels
   - Three terrain colors more saturated and distinct from each other
   - Province borders should have terrain-specific colors (brown for highland, green for lowland/jungle)
   - Route lines extend slightly into province territory rather than stopping at edges
   - Route lines slightly thicker
   - Map editor labels should be larger (20px)
   - No regressions in city rendering, token placement, or adjacency lines

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Larger bitmap font texture atlas increases memory | LOW | Minor VRAM increase | 22px is still small; BitmapFontManager handles atlas efficiently |
| Labels inside zones overlap with tokens | MEDIUM | Labels partially obscured | Background pill ensures label is always readable; tokens sit on top but label remains visible through gaps |
| Route overlap margin causes visual artifacts at route junctions | LOW | Minor rendering glitch | Clip overlap extension so it doesn't extend past zone center |
| Stroke color resolution adds complexity to presentation pipeline | LOW | Minor code change | Follows exact same pattern as fill color resolution — layered cascade |

## Research Sources

- Physical FITL board game reference image (`screenshots/FITL_SC1.jpg`) — terrain color palette inspiration
- Existing codebase patterns — no external research needed; all changes extend existing PixiJS Graphics and BitmapText patterns
