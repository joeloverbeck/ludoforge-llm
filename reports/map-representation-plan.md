# Map Representation Plan — Iteration 5

**Date**: 2026-03-30
**Based on**: EVALUATION #4 (average score: 5.75)
**Problems targeted**: [HIGH] Soften polygon shapes, [HIGH] Finer terrain granularity, [MEDIUM] Label readability

## Context

Evaluation #4 confirmed that polygon territory rendering now covers all ~28-30 provinces (the CRITICAL gap from Eval #3 is fully resolved). The map reads as a contiguous territory rather than isolated rectangles. However, three persistent issues drag scores down: (1) polygon borders are straight-line geometric/crystalline shapes — recurring for 3 evaluations with no progress, (2) only 3 terrain colors exist despite meaningful sub-distinctions (Laos/Cambodia jungle vs. South Vietnam jungle, North Vietnam highlands vs. SVN highlands), and (3) labels remain small and hard to read — explicitly deferred from iteration 4 to this iteration.

Road/River Integration (5/10, recurring 4 evaluations) is deferred to iteration 6 as it requires more fundamental route rendering changes.

**Stalled iteration check**: Iteration 4 plan (polygon coverage expansion) was fully implemented — Eval #4 confirms all provinces now have polygon shapes. No stalled items to carry forward.

## Foundations Alignment

| Foundation | Relevance | How This Plan Respects It |
|-----------|-----------|--------------------------|
| #1 Engine Agnosticism | Not relevant | No engine code changes |
| #3 Visual Separation | Always relevant | Polygon smoothing is a renderer code change; terrain sub-variants are visual-config.yaml data; label sizing is renderer code — no GameSpecDoc or engine changes |
| #7 Immutability | Relevant | Smoothing function is pure (vertices in → smoothed vertices out); no state mutation |
| #9 No Backwards Compat | Relevant | Smoothing applies to all polygon zones unconditionally — no opt-in flag or legacy path |
| #10 Architectural Completeness | Always relevant | Smoothing addresses the root cause (straight edges in `poly()` call) not a symptom; terrain variants address the root cause (insufficient attribute rules) not just color tweaks |

## Current Code Architecture (reference for implementer)

### Polygon Drawing Pipeline

```
visual-config.yaml zone override: vertices: [x1, y1, x2, y2, ...]
    ↓
ZoneVisualStyleSchema.vertices: z.array(z.number()).optional()
    (packages/runner/src/config/visual-config-types.ts:99)
    ↓
VisualConfigProvider.resolveZoneVisual() → ResolvedZoneVisual.vertices
    (packages/runner/src/config/visual-config-provider.ts:161-189)
    ↓
PresentationZoneNode.visual.vertices
    (packages/runner/src/presentation/presentation-scene.ts:82)
    ↓
zone-renderer.ts:drawZoneBase() → passes vertices to drawZoneShape()
    (packages/runner/src/canvas/renderers/zone-renderer.ts:271-296)
    ↓
shape-utils.ts:drawZoneShape() → case 'polygon': base.poly([...options.vertices])
    (packages/runner/src/canvas/renderers/shape-utils.ts:71-76)
```

### Key Function: `drawZoneShape()` (shape-utils.ts:39-84)

```typescript
export function drawZoneShape(
  base: ShapeGraphics,
  shape: ZoneShape | undefined,
  dimensions: ShapeDimensions,
  options: DrawZoneShapeOptions,
): void {
  // ...
  case 'polygon':
    if (options.vertices !== undefined && options.vertices.length >= 6) {
      base.poly([...options.vertices]);  // ← straight-line segments between vertices
    } else {
      base.roundRect(/* fallback */);
    }
}
```

### Key Function: `getEdgePointAtAngle()` (shape-utils.ts:86-124)

Used by adjacency-renderer.ts to compute where dashed lines attach to polygon edges.

```typescript
case 'polygon':
  if (vertices !== undefined && vertices.length >= 6) {
    return rayPolygonIntersection(angleDeg, vertices);  // ← iterates straight edges
  }
```

**Critical**: Both `drawZoneShape()` and `getEdgePointAtAngle()` consume the same vertices. If smoothing is applied to drawing but not edge intersection, adjacency lines will attach to the wrong points. Both must use the same smoothed vertices.

### Key Function: `computeZoneHitArea()` (zone-renderer.ts:298-324)

Computes bounding-box Rectangle from polygon vertices for pointer interaction. Uses `for (let i = 0; i < vertices.length; i += 2)` to iterate. Works with any vertex count — no change needed, but it will operate on smoothed vertices.

### ShapeGraphics Interface (shape-utils.ts:9-14)

```typescript
export interface ShapeGraphics {
  roundRect(x: number, y: number, width: number, height: number, radius: number): ShapeGraphics;
  circle(x: number, y: number, radius: number): ShapeGraphics;
  ellipse(x: number, y: number, halfWidth: number, halfHeight: number): ShapeGraphics;
  poly(points: number[]): ShapeGraphics;
}
```

Only `poly()` is available — no `moveTo`/`quadraticCurveTo`. Smoothing must produce more vertices for `poly()`, not use curve commands.

### Label Rendering (zone-renderer.ts:169-174, 243-269)

```typescript
// Name label creation (line 169)
const nameLabel = createBitmapLabel('', 0, 0, 20, {  // fontSize = 20
  fontName: STROKE_LABEL_FONT_NAME,
  fill: '#ffffff',
  stroke: { color: '#000000', width: 3 },
  anchor: { x: 0.5, y: 0.5 },
});

// Label background pill (lines 243-269)
const LABEL_FONT_SIZE = 20;
const LABEL_CHAR_WIDTH_FACTOR = 0.6;
const LABEL_PILL_PADDING = 6;
const LABEL_PILL_CORNER_RADIUS = 4;
const LABEL_PILL_ALPHA = 0.45;
```

### Terrain Attribute Rules (visual-config.yaml:385-423)

```yaml
attributeRules:
  - match: { category: [province], attributeContains: { terrainTags: highland } }
    style: { color: "#d4a656", strokeColor: "#8b6914" }     # Tan
  - match: { category: [province], attributeContains: { terrainTags: jungle } }
    style: { color: "#1a5c2a", strokeColor: "#0d3d18" }     # Dark green
  - match: { category: [province], attributeContains: { terrainTags: lowland } }
    style: { color: "#5db85d", strokeColor: "#2d7a2d" }     # Bright green
```

### Attribute Rule Resolution (visual-config-provider.ts)

`resolveZoneVisual()` applies rules in order: categoryStyle → attributeRules → overrides. Later rules override earlier ones. Zone overrides (per-zone `color`) take highest priority.

### Province Terrain + Country Data

| Province | Terrain | Country |
|----------|---------|---------|
| north-vietnam | highland | northVietnam |
| quang-tri-thua-thien | highland | southVietnam |
| quang-nam | highland | southVietnam |
| binh-dinh | highland | southVietnam |
| pleiku-darlac | highland | southVietnam |
| khanh-hoa | highland | southVietnam |
| kontum | highland | southVietnam |
| quang-tin-quang-ngai | lowland | southVietnam |
| phu-bon-phu-yen | lowland | southVietnam |
| kien-phong | lowland | southVietnam |
| kien-hoa-vinh-binh | lowland | southVietnam |
| ba-xuyen | lowland | southVietnam |
| kien-giang-an-xuyen | lowland | southVietnam |
| central-laos | jungle | laos |
| southern-laos | jungle | laos |
| northeast-cambodia | jungle | cambodia |
| the-fishhook | jungle | cambodia |
| the-parrots-beak | jungle | cambodia |
| sihanoukville | jungle | cambodia |
| phuoc-long | jungle | southVietnam |
| quang-duc-long-khanh | jungle | southVietnam |
| binh-tuy-binh-thuan | jungle | southVietnam |
| tay-ninh | jungle | southVietnam |

**Key insight**: The physical FITL board visually distinguishes Laos/Cambodia zones (gray-green, "outside" feel) from South Vietnam jungle (darker green). North Vietnam also has a distinct appearance. The `country` attribute is available for differentiation but has no attribute rules yet.

### Map Editor Renderer

`map-editor-zone-renderer.ts` calls the same `drawZoneShape()` from `shape-utils.ts`. Any smoothing change in `drawZoneShape()` automatically applies to the editor.

## Problem 1: Angular/geometric polygon shapes

**Evaluation score**: Adjacency Clarity = 7/10
**Root cause**: `drawZoneShape()` passes raw vertices directly to `base.poly()`, which draws straight lines between each vertex pair. With 5-8 vertices per province, this produces angular parallelograms and trapezoids rather than organic territorial outlines. The physical board uses curved, flowing borders.
**Recurring**: 3 consecutive evaluations (Eval #2, #3, #4) — never addressed.

### Approaches Considered

1. **Chaikin's corner-cutting algorithm**
   - Description: Apply 2 iterations of Chaikin's algorithm to polygon vertices before passing to `poly()`. Each iteration replaces each vertex with two new points at 25% and 75% along adjacent edges, producing progressively smoother curves. A 6-vertex polygon becomes ~24 vertices after 2 iterations.
   - Feasibility: HIGH — pure function, ~15 lines of code. Uses existing `poly()` API. No new dependencies.
   - Visual impact: HIGH — transforms angular shapes into smooth, organic-looking territories. 2 iterations is the sweet spot: 1 is still noticeably angular, 3 adds vertices with diminishing returns.
   - Risk: LOW — `rayPolygonIntersection()` and hit area computation work with any vertex count. Performance: ~24 vertices per zone × 23 provinces = ~550 vertices total, trivial for PixiJS.

2. **Catmull-Rom spline interpolation**
   - Description: Treat vertices as control points for a Catmull-Rom spline. Sample N points along the spline to produce a smooth polygon for `poly()`.
   - Feasibility: MEDIUM — more complex math (spline evaluation), needs careful handling of closed curves.
   - Visual impact: HIGH — very smooth curves, but can produce unexpected bulges if control points are close together.
   - Risk: MEDIUM — spline overshoot can make provinces bulge beyond intended borders, breaking shared-edge alignment between neighbors.

3. **Quadratic Bezier corner rounding**
   - Description: For each vertex, shorten the two adjacent edges by a rounding radius and insert a quadratic Bezier curve between the shortened endpoints.
   - Feasibility: LOW — requires adding `moveTo`/`quadraticCurveTo` to the `ShapeGraphics` interface, which is a wider API change. Would also need to update `rayPolygonIntersection` to handle curved segments.
   - Visual impact: HIGH — clean, predictable rounding like CSS border-radius.
   - Risk: HIGH — API change affects all shape consumers; curved edge intersection is significantly more complex than straight-edge intersection.

### Recommendation: Approach 1 (Chaikin's corner-cutting)

**Why**: Maximum feasibility with high visual impact. It's a pure function that transforms a vertex array into a denser vertex array — no API changes, no new dependencies, no curved-edge intersection math. Both `drawZoneShape()` and `getEdgePointAtAngle()` consume the smoothed vertices through `poly()` and `rayPolygonIntersection()` respectively, which already handle arbitrary vertex counts. The algorithm is well-known, deterministic, and produces predictable results.

**Critical implementation detail**: The smoothing function must be applied consistently wherever polygon vertices are consumed — both for drawing (shape-utils.ts `drawZoneShape`) and for edge intersection (shape-utils.ts `getEdgePointAtAngle`). The cleanest approach is a single exported utility function called in both code paths.

**Shared-edge preservation**: Chaikin's algorithm is a local operation — each output vertex depends only on two adjacent input vertices. If two provinces share an edge (same absolute vertex pair), applying Chaikin's to both polygons independently produces the same smoothed points along that shared edge. No cross-polygon coordination needed.

## Problem 2: Insufficient terrain granularity

**Evaluation score**: Terrain Distinction = 6/10
**Root cause**: Only 3 attribute rules exist (highland, jungle, lowland), but FITL provinces span 4 countries (southVietnam, northVietnam, laos, cambodia). On the physical board, Laos/Cambodia zones have a distinctly different visual treatment from South Vietnam zones — they feel "outside" the main theater. North Vietnam also looks different from SVN highlands. The `country` attribute is available in zone data but has no visual rules.

### Approaches Considered

1. **Per-zone color overrides in visual-config.yaml**
   - Description: Add explicit `color` overrides for each Laos, Cambodia, and North Vietnam province in the overrides section.
   - Feasibility: HIGH — purely data changes, no code needed.
   - Visual impact: MEDIUM — precise control per zone, but doesn't scale if zones change.
   - Risk: LOW — overrides take highest priority in the resolution chain.

2. **Country-based attribute rules**
   - Description: Add new attribute rules matching `country` attribute values (laos, cambodia, northVietnam) with terrain-specific shade variants. These rules are placed after terrain rules so they override the base terrain color for specific countries.
   - Feasibility: HIGH — purely data changes in visual-config.yaml. The attribute rule system already supports `attributeContains` matching.
   - Visual impact: HIGH — 6 Laos/Cambodia jungle provinces get a distinct gray-green; North Vietnam gets a distinct tone; SVN provinces keep current colors. Creates 5-6 visually distinct province categories instead of 3.
   - Risk: LOW — attribute rules are additive; later rules override earlier ones. If a zone has both `terrainTags: jungle` and `country: cambodia`, the country rule applied later overrides the jungle rule's color.

3. **Texture/pattern overlays per terrain**
   - Description: Add subtle diagonal hatching or stippling patterns over terrain fills to differentiate provinces beyond just color.
   - Feasibility: LOW — requires PixiJS Graphics pattern fills or texture generation, significant code change.
   - Visual impact: HIGH — adds a second visual dimension beyond color.
   - Risk: MEDIUM — patterns may interfere with label/token readability.

### Recommendation: Approach 2 (Country-based attribute rules)

**Why**: Uses the existing attribute rule system with no code changes — just adding YAML rules. The `country` attribute is already present in every province's zone data (confirmed in `40-content-data-assets.md`). By placing country rules after terrain rules in the `attributeRules` list, they override the base terrain color for Laos/Cambodia/North Vietnam provinces while preserving the base colors for South Vietnam provinces.

**Proposed color palette** (6 visual categories):

| Category | Color | Stroke | Count | Description |
|----------|-------|--------|-------|-------------|
| SVN Highland | `#d4a656` | `#8b6914` | 6 | Tan/khaki (unchanged) |
| SVN Lowland | `#5db85d` | `#2d7a2d` | 6 | Bright green (unchanged) |
| SVN Jungle | `#1a5c2a` | `#0d3d18` | 4 | Dark green (unchanged) |
| North Vietnam | `#8b4513` | `#5a2d0a` | 1 | Saddle brown — distinct "enemy territory" |
| Laos Jungle | `#2d5a3a` | `#1a3d25` | 2 | Gray-green — "outside theater" |
| Cambodia Jungle | `#3a5a3a` | `#254025` | 4 | Olive-gray — "outside theater", slightly lighter than Laos |

## Problem 3: Small, hard-to-read labels

**Evaluation score**: Label/Token Readability = 5/10
**Root cause**: Label font size is hardcoded at 20px (`LABEL_FONT_SIZE = 20` in zone-renderer.ts:243). The label background pill uses `LABEL_PILL_ALPHA = 0.45` which provides insufficient contrast on darker terrain fills (jungle, North Vietnam). At overview zoom, labels shrink proportionally and become illegible.
**Recurring**: 3 consecutive evaluations (Eval #2, #3, #4). Explicitly deferred from iteration 4 plan ("Deferred to iteration 5: label readability improvements").

### Approaches Considered

1. **Increase font size and pill opacity**
   - Description: Increase `LABEL_FONT_SIZE` from 20 to 26, increase `LABEL_PILL_ALPHA` from 0.45 to 0.65, and increase `LABEL_PILL_PADDING` from 6 to 8 for better visual framing.
   - Feasibility: HIGH — 3 constant changes in zone-renderer.ts.
   - Visual impact: MEDIUM — labels are ~30% larger and pills are more opaque, improving readability on all terrain colors. However, labels still shrink at overview zoom.
   - Risk: LOW — larger labels may clip polygon edges on very small provinces, but current polygon areas are designed ≥ default rectangle area (360×220).

2. **Adaptive font size based on zoom level**
   - Description: Scale label font size inversely with viewport zoom so labels maintain a minimum readable size at overview zoom.
   - Feasibility: LOW — requires hooking into viewport zoom events, updating label scale on every zoom change, and managing the label/pill size relationship dynamically.
   - Visual impact: HIGH — labels stay readable at all zoom levels.
   - Risk: MEDIUM — performance overhead from zoom-reactive label updates; visual jarring if scaling isn't smooth.

3. **Replace bitmap text with SDF (Signed Distance Field) text**
   - Description: Use PixiJS SDF text rendering for sharp labels at any zoom level.
   - Feasibility: LOW — significant architectural change to the text rendering pipeline.
   - Visual impact: HIGH — crisp text at all scales.
   - Risk: HIGH — requires new font asset pipeline, changes to bitmap-font-registry.ts.

### Recommendation: Approach 1 (Increase font size and pill opacity)

**Why**: Addresses the immediate readability problem with minimal code change (3 constants). The 30% size increase combined with stronger pill contrast will make labels clearly readable at default zoom on all terrain types including dark jungle and North Vietnam fills. Overview zoom readability (Approach 2) is a legitimate concern but is a more complex change that should be addressed separately — the current iteration targets the most impactful low-hanging fruit.

## Implementation Steps

All steps target the same two files unless noted otherwise.

1. **Add `smoothPolygonVertices()` utility function** — **File**: `packages/runner/src/canvas/renderers/shape-utils.ts` — **Depends on**: none
   - Export a pure function: `smoothPolygonVertices(vertices: readonly number[], iterations: number): number[]`
   - Implements Chaikin's corner-cutting: for each iteration, replace each vertex pair with points at 25% and 75% along each edge
   - Handle closed polygon (last vertex connects to first)
   - Default iterations = 2

2. **Apply smoothing in `drawZoneShape()` polygon case** — **File**: `packages/runner/src/canvas/renderers/shape-utils.ts` — **Depends on**: Step 1
   - In the `case 'polygon':` branch (line 71-77), call `smoothPolygonVertices(options.vertices, 2)` before passing to `base.poly()`

3. **Apply smoothing in `getEdgePointAtAngle()` polygon case** — **File**: `packages/runner/src/canvas/renderers/shape-utils.ts` — **Depends on**: Step 1
   - In the `case 'polygon':` branch (line 112-115), call `smoothPolygonVertices(vertices, 2)` before passing to `rayPolygonIntersection()`

4. **Add country-based terrain attribute rules** — **File**: `data/games/fire-in-the-lake/visual-config.yaml` — **Depends on**: none
   - Add 3 new attribute rules AFTER the existing terrain rules (so they override):
     - `country: northVietnam` → saddle brown (`#8b4513` / `#5a2d0a`)
     - `country: laos` → gray-green (`#2d5a3a` / `#1a3d25`)
     - `country: cambodia` → olive-gray (`#3a5a3a` / `#254025`)
   - Match on `category: [province]` and `attributeContains: { country: <value> }`

5. **Increase label font size and pill contrast** — **File**: `packages/runner/src/canvas/renderers/zone-renderer.ts` — **Depends on**: none
   - Change `LABEL_FONT_SIZE` from `20` to `26` (line 243)
   - Change font size in `createBitmapLabel()` call from `20` to `26` (line 169)
   - Change `LABEL_PILL_ALPHA` from `0.45` to `0.65` (line 248)
   - Change `LABEL_PILL_PADDING` from `6` to `8` (line 246)

6. **Add unit tests for `smoothPolygonVertices()`** — **File**: new test file under `packages/runner/test/canvas/renderers/` — **Depends on**: Step 1
   - Test: 0 iterations returns original vertices
   - Test: triangle (6 values) → smoothed has 12 values after 1 iteration
   - Test: shared edge produces same absolute points for both polygons
   - Test: empty or too-short arrays handled gracefully

7. **Run typecheck and tests** — **Depends on**: Steps 1-6
   - `pnpm turbo typecheck` — must pass
   - `pnpm -F @ludoforge/runner test` — must pass

8. **Visual verification** — **Depends on**: Step 7
   - `pnpm -F @ludoforge/runner dev` — inspect in browser
   - Verify polygon provinces have smooth, organic-looking borders
   - Verify adjacency dashed lines still connect cleanly to smoothed polygon edges
   - Verify Laos/Cambodia provinces are visibly distinct from SVN jungle provinces
   - Verify North Vietnam has a distinct brown tone
   - Verify labels are noticeably larger and more readable on all terrain colors
   - Check map editor renders the same smoothed polygons

## Map Editor Scope

**Included in this iteration**:
- Polygon smoothing — the map editor uses the same `drawZoneShape()` function from `shape-utils.ts`. Smoothed polygons render automatically.
- Terrain colors — the editor reads the same `visual-config.yaml`. Country-based attribute rules apply automatically.
- Label sizing — the editor zone renderer uses its own label rendering; verify whether it shares the same constants. If it uses separate constants, update those as well.

**Deferred to future iteration**:
- No editor-specific changes needed beyond the automatic propagation described above.

## Visual Config Changes

**File**: `data/games/fire-in-the-lake/visual-config.yaml`

Add 3 new attribute rules after the existing terrain rules (after line 409):

```yaml
    # Country-based terrain sub-variants (override base terrain colors)
    - match:
        category:
          - province
        attributeContains:
          country: northVietnam
      style:
        color: "#8b4513"
        strokeColor: "#5a2d0a"
    - match:
        category:
          - province
        attributeContains:
          country: laos
      style:
        color: "#2d5a3a"
        strokeColor: "#1a3d25"
    - match:
        category:
          - province
        attributeContains:
          country: cambodia
      style:
        color: "#3a5a3a"
        strokeColor: "#254025"
```

**No schema changes needed** — `attributeContains` already accepts arbitrary attribute keys.

## Verification

1. `pnpm turbo typecheck` — must pass
2. `pnpm -F @ludoforge/runner test` — must pass
3. Unit tests for `smoothPolygonVertices()` — must pass
4. Visual check — run dev server (`pnpm -F @ludoforge/runner dev`):
   - All 23 province polygons have smooth, curved borders (no straight-line angular edges)
   - Adjacent provinces still share smoothed borders without visible gaps
   - Adjacency dashed lines attach correctly to smoothed polygon edges
   - North Vietnam is visibly brown/distinct from SVN highland provinces
   - Laos provinces (central-laos, southern-laos) are gray-green, distinct from SVN jungle
   - Cambodia provinces (northeast-cambodia, the-fishhook, the-parrots-beak, sihanoukville) are olive-gray
   - SVN jungle provinces (phuoc-long, quang-duc-long-khanh, binh-tuy-binh-thuan, tay-ninh) retain original dark green
   - Labels are noticeably larger (~30%) with stronger background pill contrast
   - Labels are readable on dark jungle fills and on the new North Vietnam brown
   - Map editor renders the same smoothed polygons and terrain colors
   - Tokens still render correctly inside smoothed polygon bounds
5. Take new screenshots for evaluation:
   - `fitl-game-map.png` (close-up)
   - `fitl-game-map-overview.png` (zoomed-out full map)
   - `fitl-map-editor.png` (close-up)
   - `fitl-map-editor-overview.png` (zoomed-out full map)

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Smoothed shared edges don't align between adjacent provinces | LOW | Thin gaps between smoothed provinces | Chaikin's is a local operation — shared edge vertices produce identical smoothed points independently. Verify with 2-3 adjacent pairs in visual inspection. |
| Smoothing creates degenerate slivers on small polygons (Mekong Delta) | LOW | Visual artifacts on compact provinces | Chaikin's preserves convexity and doesn't create degenerate shapes. 2 iterations on 5-8 vertex polygons are well within safe bounds. |
| `attributeContains: { country: X }` not supported by rule matching | LOW | Country rules silently ignored, no color change | Verify the `attributeContains` schema accepts arbitrary string keys. If not, use per-zone color overrides as fallback. |
| Larger labels clip polygon edges on small provinces | LOW | Text overflow outside province shape | Current polygon areas are designed ≥ 360×220 = 79,200 sq px. A 26px font label fits comfortably within any province. |
| Performance regression from smoothed vertices (~24 per zone vs ~6) | VERY LOW | Frame rate drop | 24 vertices × 23 polygons = 552 total vertices — trivial for PixiJS. `rayPolygonIntersection` iterates ~24 edges per intersection, still O(1) per call. |

## Research Sources

All solutions extend existing PixiJS `Graphics.poly()` and visual-config attribute rule patterns already in the codebase. No external research needed:
- **Chaikin's algorithm** is a well-known subdivision scheme (1974) — the implementation is a simple loop, no library needed.
- **Country-based attribute rules** extend the existing `attributeContains` matching already used for `terrainTags`.
- **Label constants** are direct numeric changes to existing code.
