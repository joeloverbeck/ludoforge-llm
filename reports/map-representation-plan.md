# Map Representation Plan — Iteration 4

**Date**: 2026-03-30
**Based on**: EVALUATION #3 (average score: 4.5)
**Problems targeted**: [CRITICAL] Extend polygon territory rendering to ALL province zones, [HIGH] Soften existing polygon shapes (addressed via redesign during tessellation)

## Context

Evaluation #3 revealed — through the newly added editor overview screenshot — that only 5 of ~23 province zones have polygon territory shapes. The remaining 18 provinces are still rendered as isolated dark green rectangles with no shared borders, no terrain distinction, and no spatial relationship to neighbors. This is the single highest-impact gap in the map rendering. The polygon rendering pipeline is fully functional; the bottleneck is purely missing vertex data in `visual-config.yaml`. This iteration focuses exclusively on authoring polygon vertices for all remaining provinces and adjusting the existing 5 to tessellate cleanly with new neighbors.

Deferred to iteration 5: label readability improvements (font size, interior placement, background pills — planned in iteration 3 but not yet implemented), LoC zone restyling, city embedding, route flow-through improvements.

## Foundations Alignment

| Foundation | Relevance | How This Plan Respects It |
|-----------|-----------|--------------------------|
| #1 Engine Agnosticism | Not relevant | No engine code changes |
| #3 Visual Separation | Always relevant | All changes are polygon vertex data in visual-config.yaml — no GameSpecDoc or engine changes |
| #7 Immutability | Not relevant | No state transition changes |
| #9 No Backwards Compat | Relevant | Existing 5 polygon vertex sets are updated in-place to tessellate with new neighbors — no legacy fallbacks |
| #10 Architectural Completeness | Always relevant | Addresses root cause (missing vertex data) for all provinces, not just a few more |

## Current Code Architecture (reference for implementer)

### Vertex Data Format

Polygon vertices are defined in `visual-config.yaml` zone overrides as flat alternating coordinate arrays relative to zone center `(0, 0)`:

```yaml
# data/games/fire-in-the-lake/visual-config.yaml, lines 424-528
overrides:
  binh-dinh:none:
    label: Binh Dinh
    shape: polygon
    vertices: [-400, -170, 400, -370, 450, 530, 200, 530, -300, 530, -400, 180]
```

Format: `[x1, y1, x2, y2, ..., xn, yn]` — minimum 6 values (3 coordinate pairs). Consumed by `Graphics.poly()` in PixiJS.

### Rendering Pipeline (no changes needed)

```
visual-config.yaml (vertices array)
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

The map editor renderer (`map-editor-zone-renderer.ts`) uses the same `drawZoneShape()` function and will automatically render new polygon zones.

### Hit Area Computation

`computeZoneHitArea()` in `zone-renderer.ts:298-324` computes a bounding-box Rectangle from polygon vertices for pointer interaction. No changes needed — it already handles arbitrary polygon vertices.

### Edge Point Resolution (for adjacency lines)

`getEdgePointAtAngle()` in `shape-utils.ts:112-115` uses `rayPolygonIntersection()` (lines 168-217) to find where adjacency lines intersect polygon edges. No changes needed.

### Zone Category Defaults

```yaml
# visual-config.yaml lines 186-197
categoryStyles:
  city:
    shape: circle     # Cities remain circles — NOT polygon candidates
    width: 160
    height: 160
    color: "#5b7fa5"
  province:
    shape: rectangle  # Default for provinces WITHOUT override — polygon overrides replace this
    width: 360
    height: 220
  loc:
    shape: connection # LoCs rendered as route lines — NOT polygon candidates
```

### Terrain Attribute Rules (already in place)

```yaml
# visual-config.yaml lines 385-423
attributeRules:
  - match: { category: [province], attributeContains: { terrainTags: highland } }
    style: { color: "#d4a656", strokeColor: "#8b6914" }
  - match: { category: [province], attributeContains: { terrainTags: jungle } }
    style: { color: "#1a5c2a", strokeColor: "#0d3d18" }
  - match: { category: [province], attributeContains: { terrainTags: lowland } }
    style: { color: "#5db85d", strokeColor: "#2d7a2d" }
```

These rules apply automatically to all province zones with matching terrain tags, including newly polygon-ified provinces. No changes needed.

### Existing Polygon Zones (5)

| Zone | Center (x, y) | Vertices (count) |
|------|---------------|-----------------|
| binh-dinh | (1200, -1380) | 6 vertices |
| khanh-hoa | (1340, 280) | 4 vertices |
| kontum | (513, -932) | 7 vertices |
| phu-bon-phu-yen | (1465, -448) | 6 vertices |
| pleiku-darlac | (340, -180) | 5 vertices |

## Problem 1: Only 5 of 23 provinces have polygon territory shapes

**Evaluation score**: Adjacency Clarity = 5/10, Terrain Distinction = 4/10 (full-map averages dragged down by rectangle provinces)
**Root cause**: Missing `shape: polygon` and `vertices: [...]` in `visual-config.yaml` zone overrides for 18 province zones. The rendering pipeline fully supports polygons — the issue is purely absent data.

### Approaches Considered

1. **Voronoi tessellation from zone centers**
   - Feasibility: HIGH — compute Voronoi diagram from the 23 province center positions
   - Visual impact: MEDIUM — mathematically correct tessellation but geographically wrong shapes (provinces have very different sizes; Voronoi assumes equal influence radius)
   - Risk: Bizarre shapes for distant/large provinces like north-vietnam; doesn't follow geographic features

2. **Midpoint-first edge-sharing approach (manual authoring guided by adjacency data)**
   - Feasibility: MEDIUM — for each adjacent province pair, compute the midpoint between centers as a shared border vertex; add boundary vertices for map edges; express relative to each zone's center
   - Visual impact: HIGH — tessellation correct by construction (shared edges use same absolute points); shapes follow adjacency topology
   - Risk: Labor-intensive (18 provinces × 5-8 vertices each); requires careful coordinate math

3. **Adaptive approach: midpoint-guided tessellation with geographic adjustment**
   - Feasibility: MEDIUM — start with midpoint computation (Approach 2) but adjust shared vertices toward geographic features visible on the physical board (coast curves, river lines, ridgelines)
   - Visual impact: HIGH — combines topological correctness with geographic plausibility
   - Risk: Same labor as Approach 2 plus subjective geographic judgment; risk of inconsistent style

### Recommendation: Approach 2 (Midpoint-first edge-sharing)

**Why**: Guarantees tessellation correctness by construction. Every shared border between two provinces uses the exact same absolute world-space points (expressed relative to each zone's center). Geographic adjustment (Approach 3) is desirable but adds subjectivity and risk — it can be applied in iteration 5 as a refinement pass once all provinces have base polygons. The midpoint approach produces clean, consistent shapes that respect the adjacency topology.

## Province Adjacency Reference

Province-to-province adjacencies (excluding cities and LoCs):

| Province | Adjacent Provinces |
|----------|-------------------|
| north-vietnam | central-laos, quang-tri-thua-thien |
| central-laos | north-vietnam, quang-tri-thua-thien, quang-nam, southern-laos |
| southern-laos | central-laos, quang-nam, quang-tin-quang-ngai, binh-dinh, pleiku-darlac, northeast-cambodia |
| quang-tri-thua-thien | central-laos, north-vietnam, quang-nam |
| quang-nam | central-laos, southern-laos, quang-tri-thua-thien, quang-tin-quang-ngai |
| quang-tin-quang-ngai | southern-laos, quang-nam, binh-dinh |
| **binh-dinh** | kontum, southern-laos, quang-tin-quang-ngai, phu-bon-phu-yen, pleiku-darlac |
| **kontum** | binh-dinh, pleiku-darlac |
| **phu-bon-phu-yen** | binh-dinh, pleiku-darlac, khanh-hoa |
| **pleiku-darlac** | kontum, southern-laos, northeast-cambodia, the-fishhook, binh-dinh, phu-bon-phu-yen, khanh-hoa, quang-duc-long-khanh |
| **khanh-hoa** | pleiku-darlac, phu-bon-phu-yen, binh-tuy-binh-thuan, quang-duc-long-khanh |
| northeast-cambodia | southern-laos, the-fishhook, pleiku-darlac |
| the-fishhook | northeast-cambodia, the-parrots-beak, pleiku-darlac, quang-duc-long-khanh, phuoc-long, tay-ninh |
| the-parrots-beak | the-fishhook, sihanoukville, tay-ninh, kien-phong, kien-giang-an-xuyen |
| sihanoukville | the-parrots-beak, kien-giang-an-xuyen |
| phuoc-long | the-fishhook, quang-duc-long-khanh, tay-ninh |
| quang-duc-long-khanh | the-fishhook, pleiku-darlac, khanh-hoa, phuoc-long, binh-tuy-binh-thuan, tay-ninh |
| binh-tuy-binh-thuan | khanh-hoa, quang-duc-long-khanh |
| tay-ninh | the-fishhook, the-parrots-beak, phuoc-long, quang-duc-long-khanh, kien-phong |
| kien-phong | the-parrots-beak, tay-ninh, kien-hoa-vinh-binh, kien-giang-an-xuyen |
| kien-hoa-vinh-binh | kien-phong, ba-xuyen |
| ba-xuyen | kien-hoa-vinh-binh, kien-giang-an-xuyen |
| kien-giang-an-xuyen | the-parrots-beak, sihanoukville, kien-phong, ba-xuyen |

**Bold** = existing polygon zones (5). All others need polygon vertices.

Note: Some provinces also border cities (e.g., binh-tuy-binh-thuan borders cam-ranh and saigon; kien-hoa-vinh-binh borders saigon and can-tho). City borders are free edges — the province polygon does NOT need to share vertices with city circles.

## Zone Center Positions (from visual-config.yaml fixed layout hints)

| Province | Center X | Center Y |
|----------|----------|----------|
| north-vietnam | -460 | -4020 |
| central-laos | -749 | -2901 |
| southern-laos | -920 | -1690 |
| quang-tri-thua-thien | 100 | -3160 |
| quang-nam | 217 | -2453 |
| quang-tin-quang-ngai | 1180 | -1980 |
| **binh-dinh** | 1200 | -1380 |
| **kontum** | 513 | -932 |
| **phu-bon-phu-yen** | 1465 | -448 |
| **pleiku-darlac** | 340 | -180 |
| **khanh-hoa** | 1340 | 280 |
| northeast-cambodia | -1046 | -498 |
| the-fishhook | -1135 | 404 |
| the-parrots-beak | -1304 | 1323 |
| sihanoukville | -1492 | 2101 |
| phuoc-long | 600 | 800 |
| quang-duc-long-khanh | 1206 | 1113 |
| binh-tuy-binh-thuan | 1321 | 1774 |
| tay-ninh | 140 | 1580 |
| kien-phong | -156 | 2111 |
| kien-hoa-vinh-binh | 278 | 2784 |
| ba-xuyen | -253 | 3256 |
| kien-giang-an-xuyen | -975 | 3241 |

## Vertex Authoring Method

For each province, vertices are computed using this procedure:

**Step A — Identify province neighbors**: From the adjacency table above, list all adjacent provinces (excluding cities and LoCs).

**Step B — Compute shared border midpoints**: For each adjacent province pair (A, B), the shared border vertex is at the midpoint between their centers in absolute world coordinates:
```
midpoint_x = (A.x + B.x) / 2
midpoint_y = (A.y + B.y) / 2
```

**Step C — Add boundary vertices**: For edges facing the map boundary (coast, international border, or non-province zones like cities), place vertices at geographic extent. Use ~180px outward from center as a guide (half of 360px default province width).

**Step D — Order vertices clockwise** around the polygon.

**Step E — Convert to relative coordinates**: Subtract the zone center from each absolute vertex:
```
relative_x = absolute_x - center_x
relative_y = absolute_y - center_y
```

**Step F — Round to integers**: All vertex coordinates should be integers in the YAML to avoid floating-point alignment drift.

**Step G — Validate shared edges**: For each adjacent pair (A, B) sharing vertices V1 and V2:
```
A.center + A.relativeV1 == B.center + B.relativeV1  (same absolute position)
```

### Handling Multi-Neighbor Junctions

Where 3+ provinces meet at a single point (e.g., southern-laos / quang-nam / quang-tin-quang-ngai), all three polygons share the same junction vertex. The absolute junction point is typically the centroid of the 3 province centers. Each province stores it as a relative offset from its own center.

### Existing Polygon Adjustments

The 5 existing polygon zones must have their vertices updated to align with the new midpoint-based tessellation. Their current vertices were authored independently and won't share edges with the new provinces. All 5 are redesigned using the same midpoint method so the entire map tessellates consistently.

## Implementation Steps

1. **Compute shared border midpoints for all 40+ province-province adjacency pairs** — **File**: working notes (not committed) — **Depends on**: none
   - Use the zone center positions and adjacency table above
   - Identify junction points where 3+ provinces meet
   - Produce a lookup table: `{ [provinceA-provinceB]: { x, y } }`

2. **Design vertices for Group 1: Northern Coastal Chain** — **File**: `data/games/fire-in-the-lake/visual-config.yaml` — **Depends on**: Step 1
   - Zones: quang-tri-thua-thien, quang-nam, quang-tin-quang-ngai, north-vietnam
   - These extend the existing polygon cluster northward
   - quang-tin-quang-ngai shares border with binh-dinh (existing polygon, will be updated)
   - north-vietnam has only 2 province neighbors — large boundary edges face the map edge

3. **Design vertices for Group 2: Western Spine (Laos/Cambodia)** — **File**: `data/games/fire-in-the-lake/visual-config.yaml` — **Depends on**: Step 1
   - Zones: central-laos, southern-laos, northeast-cambodia, the-fishhook, the-parrots-beak, sihanoukville
   - southern-laos is a hub (6 province neighbors) — needs careful vertex placement
   - These provinces border the western map edge (Laos/Cambodia international border)

4. **Design vertices for Group 3: Southern Interior** — **File**: `data/games/fire-in-the-lake/visual-config.yaml` — **Depends on**: Step 1
   - Zones: phuoc-long, quang-duc-long-khanh, binh-tuy-binh-thuan, tay-ninh
   - quang-duc-long-khanh is a hub (6 province neighbors)
   - binh-tuy-binh-thuan has only 2 province neighbors + city neighbors (cam-ranh, saigon)

5. **Design vertices for Group 4: Mekong Delta** — **File**: `data/games/fire-in-the-lake/visual-config.yaml` — **Depends on**: Step 1
   - Zones: kien-phong, kien-hoa-vinh-binh, ba-xuyen, kien-giang-an-xuyen
   - Closely packed zones — polygons should extend toward map boundary to avoid tiny shapes
   - City neighbors (saigon, can-tho) are free edges

6. **Update existing 5 polygon zones to use midpoint-based vertices** — **File**: `data/games/fire-in-the-lake/visual-config.yaml` — **Depends on**: Steps 2-5
   - Redesign binh-dinh, khanh-hoa, kontum, phu-bon-phu-yen, pleiku-darlac vertices
   - Must share edges with the newly authored neighbors
   - Verify the central cluster still tessellates cleanly

7. **Run typecheck and tests** — **Depends on**: Step 6
   - `pnpm turbo typecheck` — must pass
   - `pnpm -F @ludoforge/runner test` — must pass

8. **Visual verification** — **Depends on**: Step 7
   - `pnpm -F @ludoforge/runner dev` — inspect the map in browser
   - Check all 23 provinces render as polygons with shared borders
   - Check terrain colors apply correctly to all polygon provinces
   - Check cities and LoCs are unaffected
   - Check tokens render inside polygon bounds
   - Check map editor renders the same polygons

## Map Editor Scope

**Included in this iteration**:
- All polygon rendering — the map editor uses the same `drawZoneShape()` function and reads the same `visual-config.yaml`. New polygon zones render automatically.

**Deferred to future iteration**:
- No editor-specific changes needed. The editor already supports polygon zone selection, dragging, and rendering via `map-editor-zone-renderer.ts` calling `drawZoneShape()`.

## Visual Config Changes

All changes are in `data/games/fire-in-the-lake/visual-config.yaml`, zone overrides section (lines 424-528).

For each of the 18 new provinces, add `shape: polygon` and `vertices: [...]`:
```yaml
quang-tri-thua-thien:none:
  label: Quang Tri
  shape: polygon
  vertices: [x1, y1, x2, y2, ...]  # 5-8 vertices, relative to center
```

For the 5 existing polygon provinces, update `vertices: [...]` to align with new midpoint-based tessellation.

**No schema changes needed** — `ZoneVisualStyleSchema` already supports `shape` and `vertices` fields.
**No code changes needed** — the rendering pipeline already handles polygon shapes.

## Verification

1. `pnpm turbo typecheck` — must pass (no TypeScript changes, but verify YAML parsing)
2. `pnpm -F @ludoforge/runner test` — must pass
3. Visual check — run dev server (`pnpm -F @ludoforge/runner dev`):
   - All 23 provinces render as irregular polygons (no rectangles remaining for province-category zones)
   - Adjacent provinces share borders without visible gaps
   - Terrain colors (highland tan, lowland green, jungle dark green) apply to all polygon provinces
   - Cities remain as circles, LoCs as route connections — unaffected
   - Tokens render inside polygon bounds (no overflow)
   - Map editor shows the same polygon shapes
   - Adjacency lines connect correctly to polygon edges (via `rayPolygonIntersection`)
   - No degenerate slivers or extremely narrow polygon shapes
4. Take new screenshots for evaluation:
   - `fitl-game-map.png` (close-up)
   - `fitl-game-map-overview.png` (zoomed-out full map)
   - `fitl-map-editor.png` (close-up)
   - `fitl-map-editor-overview.png` (zoomed-out full map)

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Shared vertices don't align due to rounding | LOW | Thin gaps between provinces | Round all coordinates to integers; use exact same absolute point for both sides of each shared edge |
| Hub provinces (southern-laos: 6 neighbors, pleiku-darlac: 8, quang-duc-long-khanh: 6) produce complex polygons | MEDIUM | 8+ vertices per polygon | Accept up to 10 vertices for hub provinces; not every neighbor pair needs a unique shared vertex — adjacent neighbors can share corner vertices at 3-way junctions |
| Mekong Delta provinces are close together, producing tiny polygons | MEDIUM | Cramped text, token overflow | Extend Delta polygon boundaries outward toward map edge; these provinces are at the southern map boundary with room to grow |
| Existing 5 polygon vertex changes break visual appearance of central cluster | LOW | Visual regression in the only area that currently looks good | Author all 23 provinces simultaneously with consistent midpoint method; verify central cluster first |
| Token `fitl-map-space` lane layout doesn't fit inside irregular polygon | LOW | Tokens overflow polygon bounds | Lane layout uses `centeredRow` packing which adapts to bounding-box width; polygon areas are designed ≥ rectangle area (360×220 = 79,200 sq px) |

## Research Sources

All solutions extend existing PixiJS `Graphics.poly()` and visual-config YAML patterns already in the codebase. No external research needed — the rendering pipeline fully supports polygon zones; this iteration is purely data authoring.

Physical FITL board reference image (`screenshots/FITL_SC1.jpg`) serves as geographic orientation for province boundary placement.
