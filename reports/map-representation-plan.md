# Map Representation Plan — Iteration 1

**Date**: 2026-03-30
**Based on**: EVALUATION #1 (average score: 2.5)
**Problems targeted**: [CRITICAL] Terrain Distinction (2/10), [CRITICAL] Province Shapes / Adjacency Clarity (2/10)

## Context

The FITL game map currently renders all provinces as uniform green rectangles floating in dark space. Adjacent provinces have no shared borders — adjacency is conveyed only through thin dashed lines. Terrain types (highland, lowland, jungle) are nearly indistinguishable because the three fill colors are too close in hue. This makes the map unrecognizable to FITL players who know the physical board's irregular territories with distinct terrain coloring.

This iteration targets the two CRITICAL evaluation findings: terrain distinction (pure config change) and province shape infrastructure (add custom polygon support).

## Foundations Alignment

| Foundation | Relevance | How This Plan Respects It |
|-----------|-----------|--------------------------|
| #1 Engine Agnosticism | Not relevant | All changes in runner code and visual-config |
| #3 Visual Separation | Always relevant | Terrain colors in visual-config.yaml, shape logic in runner renderers |
| #7 Immutability | Relevant for ResolvedZoneVisual | New `vertices` field is `readonly number[] | null` |
| #9 No Backwards Compatibility | Relevant | `polygon` is a new shape value, no shims needed |
| #10 Architectural Completeness | Always relevant | Root cause: missing polygon shape type + similar terrain colors |

## Problem 1: Terrain Distinction

**Evaluation score**: Terrain Distinction = 2/10
**Root cause**: The three terrain fill colors (`#6b5b3e`, `#3d5c3a`, `#5a7a52`) are too close in hue and saturation. All provinces look the same shade of green/brown.

### Approaches Considered

1. **Update color palette in visual-config.yaml**: Change attributeRules color values to maximally distinct palette inspired by the physical FITL board.
   - Feasibility: HIGH (pure YAML change, zero code)
   - Visual impact: MEDIUM-HIGH (distinct terrain types immediately visible)
   - Risk: Minimal — visual-config provider already reads and applies these correctly

2. **Add texture patterns (crosshatch, dots) per terrain**: Draw overlay patterns on top of fill color in `drawZoneBase()`.
   - Feasibility: MEDIUM (requires new rendering code in zone-renderer)
   - Visual impact: HIGH (terrain types distinguishable even for colorblind users)
   - Risk: Moderate — touches renderer code, needs careful performance management

3. **Add terrain-specific border styling**: Different stroke color/width per terrain via attributeRules.
   - Feasibility: MEDIUM (requires extending ZoneVisualStyleSchema with stroke properties)
   - Visual impact: LOW-MEDIUM (subtle reinforcement, not primary distinction)
   - Risk: Low — additive schema change

### Recommendation: Approach 1 (updated color palette)

**Why**: Maximum impact with zero code risk. The physical FITL board uses clearly distinct colors: sandy tan highlands, bright green lowlands, deep dark green jungle. Adjusting the YAML values achieves this immediately. Texture patterns (Approach 2) should be deferred to iteration 2 for additional terrain clarity.

**New palette**:
- Highland: `#c4a66a` (warm sandy tan)
- Lowland: `#7cb87c` (bright medium green)
- Jungle: `#2d4a2d` (deep dark green)
- City stays `#5b7fa5` (blue-gray — already distinct)

Also reduce region watermark label alpha from 0.25 to 0.12 to reduce visual competition with terrain colors (addresses MEDIUM recommendation #5).

## Problem 2: Province Shapes / Adjacency Clarity

**Evaluation score**: Adjacency Clarity = 2/10
**Root cause**: No `polygon` shape type exists. All provinces are rectangles with fixed width/height. Adjacent provinces cannot share border edges because rectangles have no mechanism for custom vertex positions.

### Approaches Considered

1. **Add `polygon` shape type with custom `vertices` per zone in visual-config overrides**: Extend schema, add polygon case to shape-utils, define vertices in YAML.
   - Feasibility: HIGH (infrastructure for `Graphics.poly()` already exists, `rayPolygonIntersection` works for edge points)
   - Visual impact: HIGH (provinces become territory shapes with shared borders)
   - Risk: Medium — schema change + renderer update + vertex data design

2. **Voronoi tessellation from zone positions**: Auto-generate territory boundaries using Voronoi/Delaunay.
   - Feasibility: LOW (needs external library or complex algorithm, clipping to map boundaries, edge cases)
   - Visual impact: HIGH (automatic tessellation fills all space)
   - Risk: High — algorithmic complexity, no manual control over shapes

3. **Use varied existing shapes (hexagons, ellipses) per zone**: Assign different shapes per terrain type.
   - Feasibility: HIGH (pure config change)
   - Visual impact: LOW (provinces still isolated, still have gaps, no shared borders)
   - Risk: Minimal

### Recommendation: Approach 1 (custom polygon vertices)

**Why**: The fundamental problem is that provinces need to share borders. Only custom polygon vertices achieve this. The rendering infrastructure (`Graphics.poly()`, `rayPolygonIntersection`) already exists. The work is mostly plumbing a `vertices` field through the pipeline and defining vertex data. Voronoi (Approach 2) could replace this later but is too complex for iteration 1.

**Phase split**: In this iteration, implement the full polygon infrastructure + define vertices for a cluster of 4-5 adjacent provinces as proof of concept. Full tessellation of all ~30 zones will be a follow-up.

## Current Code Architecture (reference for implementer)

This section documents the exact interfaces, functions, and data flow that will be modified. An implementer should not need to re-explore the codebase.

### Data Flow: Visual Config → Presentation → Renderer

```
visual-config.yaml
  → VisualConfigProvider.resolveZoneVisual(zoneId, category, attributes)
    → ResolvedZoneVisual { shape, width, height, color, connectionStyleKey }
      → stored in PresentationZoneNode.visual
        → consumed by zone-renderer.ts drawZoneBase()
          → calls drawZoneShape(base, shape, dimensions, options)
            → PixiJS Graphics.poly() / .roundRect() / .circle()
```

### Key Type: `ResolvedZoneVisual`

**File**: `packages/runner/src/config/visual-config-provider.ts` (lines 55-61)

```typescript
export interface ResolvedZoneVisual {
  readonly shape: ZoneShape;
  readonly width: number;
  readonly height: number;
  readonly color: string | null;
  readonly connectionStyleKey: string | null;
}
```

This interface gains a new field: `vertices: readonly number[] | null`.

### Key Type: `ZoneShape`

**File**: `packages/runner/src/config/visual-config-defaults.ts` (lines 1-10)

```typescript
export type ZoneShape =
  | 'rectangle' | 'circle' | 'hexagon' | 'diamond'
  | 'ellipse' | 'triangle' | 'line' | 'octagon' | 'connection';
```

The same values appear in `ZoneShapeSchema` in `visual-config-types.ts` (lines 7-17). Both must be updated together.

### Key Function: `drawZoneShape()`

**File**: `packages/runner/src/canvas/renderers/shape-utils.ts` (lines 38-76)

Switch on `shape` — calls `base.roundRect()` for rectangle, `base.circle()` for circle, `base.poly(buildRegularPolygonPoints(...))` for hexagon/diamond/triangle/octagon. The `polygon` case will call `base.poly(options.vertices)` with custom vertex data.

Current options interface:
```typescript
interface DrawZoneShapeOptions {
  readonly rectangleCornerRadius: number;
  readonly lineCornerRadius: number;
}
```

Gains: `readonly vertices?: readonly number[]`.

### Key Function: `getEdgePointAtAngle()`

**File**: `packages/runner/src/canvas/renderers/shape-utils.ts` (lines 78-110)

Switch on `shape` — computes where a ray from center intersects the shape edge. For hexagon/diamond/triangle/octagon, it calls `rayPolygonIntersection(angleDeg, polygonPoints)`. The `polygon` case will do the same but with custom vertices instead of `buildRegularPolygonPoints()`.

**Signature change needed**: Currently takes `(shape, dimensions, angleDeg)`. Needs an optional `vertices` parameter for polygon shapes. New signature: `(shape, dimensions, angleDeg, vertices?)`.

### Key Function: `resolveZoneVisual()` — visual property cascade

**File**: `packages/runner/src/config/visual-config-provider.ts` (lines 159-186)

Resolution order (lowest to highest priority):
1. Defaults (`DEFAULT_ZONE_SHAPE`, `DEFAULT_ZONE_WIDTH`, etc.)
2. Category styles from `categoryStyles[category]`
3. Attribute rules from `attributeRules[]` (filtered by category + attribute matches)
4. Zone-specific overrides from `overrides[zoneId]`

Each layer is merged via `applyZoneStyle()` (lines 556-592), which copies non-undefined fields from source to target. This function needs to also copy `vertices` when present.

### Key Schema: `ZoneVisualStyleSchema` and `ZoneVisualOverrideSchema`

**File**: `packages/runner/src/config/visual-config-types.ts`

```typescript
// lines 91-97
const ZoneVisualStyleSchema = z.object({
  shape: ZoneShapeSchema.optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  color: z.string().optional(),
  connectionStyleKey: z.string().optional(),
});

// lines 179-181
const ZoneVisualOverrideSchema = ZoneVisualStyleSchema.extend({
  label: z.string().optional(),
});
```

`ZoneVisualOverrideSchema` extends `ZoneVisualStyleSchema`, so adding `vertices` to the base schema automatically makes it available in overrides.

### Vertex Coordinate System

All shapes draw relative to center `(0, 0)`. The zone container is positioned at the zone's world `(x, y)` coordinates. Vertices in the `vertices` array are flat alternating `[x1, y1, x2, y2, ...]` coordinates relative to center, matching the format `Graphics.poly()` expects. For example, a simple triangle: `[0, -100, 87, 50, -87, 50]`.

### Game Canvas Zone Renderer — `drawZoneBase()`

**File**: `packages/runner/src/canvas/renderers/zone-renderer.ts` (lines 243-262)

```typescript
function drawZoneBase(base: Graphics, zone: PresentationZoneNode): void {
  // ...resolves fill, stroke, dimensions...
  drawZoneShape(base, shape, dimensions, {
    rectangleCornerRadius: ZONE_CORNER_RADIUS,
    lineCornerRadius: LINE_CORNER_RADIUS,
  });
  // ...applies fill and stroke...
}
```

Change: pass `vertices: zone.visual.vertices ?? undefined` in the options object.

### Map Editor Zone Renderer — `drawZoneBase()`

**File**: `packages/runner/src/map-editor/map-editor-zone-renderer.ts` (lines 167-185)

Same pattern as game canvas — calls `drawZoneShape(base, visual.shape, dimensions, { ... })`. Same change needed: pass `vertices` from resolved visual.

### Hit Area Calculation

**File**: `packages/runner/src/canvas/renderers/zone-renderer.ts` (lines 136-141)

Currently uses `new Rectangle(-w/2, -h/2, w, h + LABEL_AREA_HEIGHT)` for all shapes. For polygon shapes, compute bounding box from the vertices array: iterate vertices to find `minX, maxX, minY, maxY`, then create `new Rectangle(minX, minY, maxX-minX, maxY-minY + LABEL_AREA_HEIGHT)`.

### Terrain Color Locations in visual-config.yaml

**File**: `data/games/fire-in-the-lake/visual-config.yaml` (lines 385-406)

```yaml
attributeRules:
  - match:
      category: [province]
      attributeContains:
        terrainTags: highland
    style:
      color: "#6b5b3e"       # ← change to "#c4a66a"
  - match:
      category: [province]
      attributeContains:
        terrainTags: jungle
    style:
      color: "#3d5c3a"       # ← change to "#2d4a2d"
  - match:
      category: [province]
      attributeContains:
        terrainTags: lowland
    style:
      color: "#5a7a52"       # ← change to "#7cb87c"
```

### Region Label Alpha

**File**: `packages/runner/src/canvas/renderers/region-boundary-renderer.ts` (line 19)

```typescript
const LABEL_ALPHA = 0.25;  // ← change to 0.12
```

### Label Font Size

**File**: `packages/runner/src/canvas/renderers/zone-renderer.ts` (line 171)

```typescript
const nameLabel = createBitmapLabel('', 0, 0, 14, { ... });  // ← change 14 to 16
```

### Existing Test File

**File**: `packages/runner/test/canvas/renderers/shape-utils.test.ts`

Tests for `drawZoneShape` and `getEdgePointAtAngle` exist here. New `polygon` cases should be added following the existing pattern.

---

## Implementation Steps

### Phase A: Terrain Colors (zero-code, immediate)

1. Update terrain fill colors in `attributeRules` — **File**: `data/games/fire-in-the-lake/visual-config.yaml` (lines 392, 399, 406) — change `#6b5b3e` → `#c4a66a`, `#3d5c3a` → `#2d4a2d`, `#5a7a52` → `#7cb87c` — **Depends on**: none
2. Reduce region label alpha from 0.25 to 0.12 — **File**: `packages/runner/src/canvas/renderers/region-boundary-renderer.ts` (line 19, `LABEL_ALPHA`) — **Depends on**: none

### Phase B: Polygon Shape Infrastructure

3. Add `'polygon'` to `ZoneShape` type union — **File**: `packages/runner/src/config/visual-config-defaults.ts` (line 1-10) — **Depends on**: none
4. Add `'polygon'` to `ZoneShapeSchema` enum and add `vertices: z.array(z.number()).optional()` to `ZoneVisualStyleSchema` — **File**: `packages/runner/src/config/visual-config-types.ts` (lines 7-17 for schema enum, lines 91-97 for style schema) — `ZoneVisualOverrideSchema` extends `ZoneVisualStyleSchema` so it auto-inherits — **Depends on**: Step 3
5. Add `vertices: readonly number[] | null` to `ResolvedZoneVisual` interface. Thread through `resolveZoneVisual()` (initialize as `null`, merge via `applyZoneStyle()`). In `applyZoneStyle()`, add: if `source.vertices` is a non-empty array, copy it to target — **File**: `packages/runner/src/config/visual-config-provider.ts` (interface at line 55, resolve at line 159, applyStyle at line 556) — **Depends on**: Step 4
6. Add `readonly vertices?: readonly number[]` to `DrawZoneShapeOptions`. Add `case 'polygon':` to `drawZoneShape()` that calls `base.poly(options.vertices)` if vertices has ≥6 numbers, otherwise falls back to `base.roundRect()` (rectangle) — **File**: `packages/runner/src/canvas/renderers/shape-utils.ts` (options interface near line 16, function at line 38) — **Depends on**: Step 3
7. Add optional 4th parameter `vertices?: readonly number[]` to `getEdgePointAtAngle()`. Add `case 'polygon':` that calls `rayPolygonIntersection(angleDeg, vertices)` if vertices provided, else returns `{ x: 0, y: 0 }` — **File**: `packages/runner/src/canvas/renderers/shape-utils.ts` (function at line 78) — **Depends on**: Step 6
8. In game canvas `drawZoneBase()`, pass `vertices: zone.visual.vertices ?? undefined` in the options to `drawZoneShape()`. Also pass `zone.visual.vertices` to `getEdgePointAtAngle()` calls — **File**: `packages/runner/src/canvas/renderers/zone-renderer.ts` (line 253) — **Depends on**: Steps 5, 6
9. In map editor `drawZoneBase()`, pass `vertices: visual.vertices ?? undefined` in the options to `drawZoneShape()` — **File**: `packages/runner/src/map-editor/map-editor-zone-renderer.ts` (line 174) — **Depends on**: Steps 5, 6
10. In game canvas zone renderer, after computing `dimensions`, if `zone.visual.shape === 'polygon'` and vertices exist, compute bounding box from vertices for hit area instead of using `dimensions.width/height` — **File**: `packages/runner/src/canvas/renderers/zone-renderer.ts` (lines 136-141) — **Depends on**: Step 8
11. In adjacency renderer `drawAdjacencyLine()`, pass vertices through to `getEdgePointAtAngle()` calls — the `fromZone` and `toZone` already carry `visual` which will include `vertices` — **File**: `packages/runner/src/canvas/renderers/adjacency-renderer.ts` (line 123-124) — **Depends on**: Steps 5, 7
12. Add tests for `polygon` shape in `drawZoneShape` and `getEdgePointAtAngle` following existing test patterns — **File**: `packages/runner/test/canvas/renderers/shape-utils.test.ts` — **Depends on**: Steps 6, 7

### Phase C: Proof-of-Concept Vertex Data

13. Define `shape: polygon` and `vertices` for a cluster of 4-5 adjacent provinces (Kontum, Pleiku-Darlac, Binh Dinh, Phu Bon Phu Yen, Khanh Hoa) in zone overrides. Vertices should be relative to each zone's center position. Adjacent provinces must share border edges (same coordinates in reverse order) — **File**: `data/games/fire-in-the-lake/visual-config.yaml` overrides section — **Depends on**: Steps 4, 5
14. Increase label font size from 14 to 16 in zone-renderer (addresses HIGH recommendation #4) — **File**: `packages/runner/src/canvas/renderers/zone-renderer.ts` (line 171, the `14` argument to `createBitmapLabel`) — **Depends on**: none

## Map Editor Scope

**Included in this iteration**:
- Step 9: Map editor zone renderer passes vertices to `drawZoneShape()` — same drawing function, so polygons render correctly in both game canvas and editor.

**Deferred to future iteration**:
- Polygon vertex editing in map editor (drag handles to reshape provinces) — this requires new interaction patterns (vertex drag handlers, edge splitting, undo) that are substantial UI work beyond rendering.

## Visual Config Changes

In `visual-config-types.ts`:
- `ZoneShapeSchema`: add `'polygon'` to enum
- `ZoneVisualStyleSchema`: add `vertices: z.array(z.number()).optional()`

In `visual-config.yaml`:
- Update `attributeRules` terrain colors
- Add `shape: polygon` + `vertices: [...]` per province override (proof of concept for 4-5 zones)

## Verification

1. `pnpm turbo typecheck` — must pass
2. `pnpm -F @ludoforge/runner test` — must pass
3. Visual check game canvas:
   - Highland provinces should be sandy tan, lowlands bright green, jungle dark green
   - 4-5 proof-of-concept provinces should render as irregular polygons with shared border edges
   - Adjacency lines between polygon provinces should connect to polygon edges (not rectangle corners)
   - Labels should be slightly larger and readable
4. Visual check map editor:
   - Same polygon shapes render correctly in editor
   - Drag behavior still works on polygon zones

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Polygon vertices defined incorrectly (overlapping, wrong winding) | MEDIUM | Provinces render incorrectly | `polygon` falls back to rectangle if vertices < 6 numbers; visual review catches issues |
| `getEdgePointAtAngle` returns wrong point for polygons | LOW | Adjacency lines connect to wrong spot on polygon | Reuses existing `rayPolygonIntersection` which already works for hexagons/diamonds |
| Hit area doesn't match polygon shape | LOW | Click targets off | Compute bounding box from actual vertices |
| Color palette doesn't look good | LOW | Still hard to distinguish terrain | Pure YAML change, easy to adjust in next iteration |

## Research Sources

- Existing codebase analysis: `Graphics.poly()` already used for hexagon/diamond/triangle rendering
- Existing `rayPolygonIntersection` function handles arbitrary polygon edge-point calculation
- Existing `convexHull` + `padHull` infrastructure demonstrates polygon rendering patterns
- PixiJS 8 `Graphics` API supports arbitrary polygon drawing via `poly(points: number[])`
