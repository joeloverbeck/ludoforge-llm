# Spec 98: Province Border Extrusion, Vertex Editing & Layer Reordering

**Status**: ✅ COMPLETED
**Priority**: P1
**Complexity**: M
**Dependencies**: None (runner-only changes, no engine modifications)
**Estimated effort**: 5-7 days
**Origin**: After converting FITL province spaces from rectangles to colored polygons, three visual deficiencies emerged: provinces float as isolated blobs with gaps between them, the map editor lacks vertex manipulation tools, and the layer ordering renders cities under provinces.

## Problem Statement

### 1. Province Gaps (No Shared Borders)

Geographic provinces share borders with adjacent provinces — their territories tile the map with no gaps. The current implementation renders each province as an isolated smooth polygon (Chaikin-smoothed from user-defined vertices in `visual-config.yaml`). Users would need to manually position vertices with pixel precision to close gaps between adjacent provinces, which is impractical.

The existing adjacency representation — dashed lines between zone centers — communicates adjacency but doesn't solve the visual gap problem. With proper shared borders, these dashed lines become redundant for province-to-province adjacencies.

### 2. No Vertex Editing in Map Editor

The map editor (`packages/runner/src/map-editor/`) supports dragging entire province zones to reposition them, but provides no way to:
- Move individual polygon vertices
- Add new vertices to a polygon
- Remove existing vertices

Users must edit `visual-config.yaml` manually to adjust polygon shapes, then reload to see the result.

### 3. Incorrect Layer Ordering

All zone types (provinces, cities, lines of communication) render in a single shared `zoneLayer`. Connection routes (roads, rivers) render in `connectionRouteLayer` above all zones. This produces two visual errors:
- Cities render under (or at the same level as) provinces — but cities exist inside provinces and should render on top
- Roads/rivers render above cities — but roads/rivers traverse provinces, not cities

## Goals

- Compute shared straight borders between adjacent provinces using perpendicular bisector geometry
- Render a visible gap (2-4px) with a thin border line between adjacent provinces
- Preserve organic Chaikin-smoothed curves for non-adjacent edges (coastlines, map boundaries)
- Remove all adjacency visuals (dashed lines, connection route lines) where at least one endpoint is a province
- Preserve non-province adjacency visuals (city↔city, etc.)
- Enable vertex manipulation in the map editor: drag, add, delete polygon vertices
- Reorder rendering layers so provinces are below roads/rivers, which are below cities
- Reuse border computation in both the game canvas and the map editor
- Cache border computations — recompute only when positions or vertices change

## Non-Goals

- Full Voronoi diagram computation from zone centers (perpendicular bisector is sufficient)
- External geometry library dependencies (implement with built-in math)
- Defining a map boundary polygon for coastal provinces (organic curves suffice)
- Extending border computation to non-province zone types
- Changing how vertices are stored in `visual-config.yaml` (format stays the same)
- Touch any engine code — this is entirely a runner visual change

## Foundation Alignment

| Foundation | Alignment |
|------------|-----------|
| #1 Engine Agnosticism | All changes are in the runner package. No kernel, compiler, or GameDef changes. Border computation uses generic adjacency data from any GameDef. |
| #3 Visual Separation | Province borders are pure presentation logic in the runner canvas layer. Visual config format is unchanged. No GameSpecDoc modifications. |
| #7 Immutability | Border computation is a pure function: (positions, vertices, adjacencies) → polygon paths. No state mutation. |
| #9 No Backwards Compatibility | Layer restructuring is a clean replacement. No shim layers or compatibility modes. |
| #10 Architectural Completeness | Addresses the root cause (province rendering pipeline and layer architecture) rather than patching symptoms. |
| #11 Testing as Proof | Unit tests for bisector computation, facing vertex detection, hybrid polygon generation. Visual verification via map editor. |

## Technical Design

### A. Perpendicular Bisector Border Algorithm

New module: `packages/runner/src/canvas/renderers/province-border-utils.ts`

**Input per adjacent province pair (A, B)**:
- A's world-space center position
- A's local polygon vertices (pre-smoothing)
- B's world-space center position
- B's local polygon vertices (pre-smoothing)

**Algorithm**:

1. **Compute center-to-center vector** from A to B.
2. **Compute perpendicular bisector**: A line perpendicular to the center-to-center vector, passing through the midpoint of A→B.
3. **Identify facing vertices of A**: Vertices whose angle from A's center falls within ±60° of the direction toward B's center.
4. **Project facing vertices onto bisector**: Each facing vertex is moved to the nearest point on the bisector line, clamped to the extent of the overlapping region between the two polygons.
5. **Inset for gap**: Each polygon's projected edge is inset 1-2px from the bisector toward its own center, creating a visible gap.

**Output per province**: A modified vertex array where facing edges are straight (bisector-aligned) and non-facing edges retain original vertices. The zone renderer applies Chaikin smoothing only to non-facing edge segments.

**Edge cases**:
- **3+ provinces at a corner**: Bisectors naturally converge at the circumcenter. Each province processes its neighbors independently; the corner vertex is shared.
- **Max extrusion distance**: If the bisector is more than a configurable distance (default ~200px) from the province's original boundary, extrusion is skipped for that edge — organic curve preserved.
- **Concave shapes**: After projection, validate the polygon doesn't self-intersect. If it does, use convex hull of the projected vertices for the shared edge.
- **Province adjacent to non-province**: No extrusion. Organic curve preserved on that side.

### B. Layer Restructuring

Modify: `packages/runner/src/canvas/layers.ts`

**Current `boardGroup.addChild` order**:
```
backgroundLayer, regionLayer, adjacencyLayer, zoneLayer, connectionRouteLayer, tableOverlayLayer
```

**New order**:
```
backgroundLayer, regionLayer, provinceZoneLayer, connectionRouteLayer, cityZoneLayer, adjacencyLayer, tableOverlayLayer
```

- `zoneLayer` splits into `provinceZoneLayer` (provinces, highlands, other terrain) and `cityZoneLayer` (cities, LoCs)
- `connectionRouteLayer` moves between them
- `adjacencyLayer` moves above cities (only non-province adjacencies remain)

The zone renderer must route each zone to the correct layer based on its category. The `LayerHierarchy` interface gains `provinceZoneLayer` and `cityZoneLayer`, replacing `zoneLayer`.

### C. Adjacency Filtering

Modify: `packages/runner/src/canvas/renderers/adjacency-renderer.ts`, `packages/runner/src/canvas/renderers/connection-route-renderer.ts`

Filter logic in the adjacency renderer's `update()` method: skip any adjacency pair where at least one endpoint zone has category `"province"` (or equivalent terrain category). The same filter applies to connection route renderer for route segments touching provinces.

Non-province adjacencies (city↔city, etc.) continue rendering as before.

### D. Border Line Rendering

Shared border lines are drawn as part of the province polygon rendering, not in a separate renderer. Each province's `Graphics` object includes:
1. The filled polygon (hybrid shape with bisector edges)
2. A thin (1px) stroke along shared border segments only (not along organic curves unless the province already has a strokeColor)

Alternatively, border lines can be drawn in a thin sub-container within `provinceZoneLayer` to keep fill and border visually consistent.

### E. Map Editor Vertex Editing

New module: `packages/runner/src/map-editor/vertex-handle-renderer.ts`

Renders into the existing `handle` layer in `EditorLayerSet`.

**When a polygon zone is selected**:
1. Create a draggable circle Graphics (6-8px, colored) for each original vertex
2. Create smaller semi-transparent circles at edge midpoints (for adding vertices)

**Interactions**:
- **Drag vertex handle**: Updates the vertex position in the editor store. Re-renders polygon with Chaikin smoothing and border computation in real-time.
- **Double-click vertex handle**: Removes the vertex (minimum 3 enforced). Re-renders.
- **Click midpoint handle**: Inserts a new vertex between the two adjacent vertices. Re-renders.

**Store integration**: The editor store (`map-editor-store.ts`) needs a new action for updating zone vertices, alongside the existing zone position update.

**Border preview**: The perpendicular bisector computation from `province-border-utils.ts` is reused in the editor. As vertices change, borders update live.

### F. Selective Chaikin Smoothing

Currently `smoothPolygonVertices()` applies uniform Chaikin smoothing to all vertices. With hybrid polygons, smoothing must be selective:
- **Non-facing edges**: Full Chaikin smoothing (2 iterations) for organic curves
- **Facing edges (bisector-aligned)**: No smoothing — keep straight

This requires marking which vertex segments are "shared border" vs "organic" before smoothing. The province-border-utils output includes this segmentation information.

## Files to Modify

| File | Change |
|------|--------|
| `packages/runner/src/canvas/layers.ts` | Split `zoneLayer` into `provinceZoneLayer` + `cityZoneLayer`, reorder layers |
| `packages/runner/src/canvas/renderers/zone-renderer.ts` | Route zones to correct layer by category; integrate border computation for province polygons |
| `packages/runner/src/canvas/renderers/shape-utils.ts` | Add selective Chaikin smoothing (skip shared border segments) |
| `packages/runner/src/canvas/renderers/adjacency-renderer.ts` | Filter out adjacencies involving provinces |
| `packages/runner/src/canvas/renderers/connection-route-renderer.ts` | Filter out route segments touching provinces |
| `packages/runner/src/canvas/canvas-updater.ts` | Wire new layers, pass adjacency data to zone renderer for border computation |
| `packages/runner/src/canvas/game-canvas-runtime.ts` | Update layer references |
| `packages/runner/src/map-editor/map-editor-zone-renderer.ts` | Integrate border computation for editor preview |
| `packages/runner/src/map-editor/map-editor-canvas.ts` | Wire vertex handle renderer to handle layer |
| `packages/runner/src/map-editor/map-editor-store.ts` | Add vertex update action |

## New Files

| File | Purpose |
|------|---------|
| `packages/runner/src/canvas/renderers/province-border-utils.ts` | Perpendicular bisector computation, facing vertex detection, hybrid polygon path generation |
| `packages/runner/src/map-editor/vertex-handle-renderer.ts` | Vertex handle creation, drag/add/delete interaction, real-time preview |

## Verification

1. **Visual**: Provinces share clean straight borders with thin gap lines; organic curves on coastlines
2. **Layer order**: Cities render above provinces; roads/rivers render between them
3. **Adjacency lines**: No dashed lines between provinces; non-province adjacencies preserved
4. **Map editor**: Vertex handles appear on selected polygon zones; drag/add/delete works
5. **Border preview**: Map editor shows Voronoi borders updating in real-time during vertex editing
6. **Edge cases**: 3-way province corners converge cleanly; distant provinces don't over-extrude
7. **Existing tests**: All Vitest runner tests pass (`pnpm -F @ludoforge/runner test`)
8. **New tests**: Unit tests for bisector computation, facing vertex detection, polygon hybrid generation, adjacency filtering
9. **Typecheck**: `pnpm -F @ludoforge/runner typecheck` passes
10. **Lint**: `pnpm -F @ludoforge/runner lint` passes

## Outcome

**Completion date**: 2026-03-30

**What changed**:
- `layers.ts`: Replaced `zoneLayer` with `provinceZoneLayer` + `cityZoneLayer`. New layer order: background → region → provinceZone → connectionRoute → cityZone → adjacency → tableOverlay
- `zone-renderer.ts`: Accepts category routing function to route zones to correct layer; integrates border polygon rendering via `selectiveSmoothPolygon`
- `game-canvas-runtime.ts`: Passes layer routing function to zone renderer
- `canvas-updater.ts`: Computes province borders and passes to zone renderer
- `renderer-types.ts`: `ZoneRenderer.update()` accepts optional `provinceBorders` parameter
- `adjacency-renderer.ts`: Filters out adjacency pairs involving provinces
- `connection-route-resolver.ts`: Filters out spurs targeting province zones
- `map-editor-canvas.ts`: Editor zones mount to `cityZoneLayer`
- `map-editor-types.ts`: Added `zoneVertices` to `MapEditorDocumentState`
- `map-editor-store.ts`: Added `moveVertex`, `addVertex`, `removeVertex` actions with undo/redo
- `map-editor-export.ts`: Merges modified vertices into zone overrides on export
- `MapEditorScreen.tsx`: Wires vertex handle renderer into editor lifecycle
- NEW `province-border-utils.ts`: Perpendicular bisector algorithm with selective Chaikin smoothing
- NEW `vertex-handle-renderer.ts`: Draggable vertex/midpoint handles for polygon editing

**Deviations from spec**:
- Connection route spur filtering was done in `connection-route-resolver.ts` (presentation layer) rather than `connection-route-renderer.ts` (render layer), as the resolver has access to zone category data.
- Border line rendering uses the existing zone stroke mechanism rather than a dedicated sub-container.

**Verification**: 2052 tests pass (8 new), typecheck clean, lint clean.
