# Province Border Extrusion, Map Editor Vertex Editing & Layer Reordering

**Date**: 2026-03-30
**Status**: ✅ COMPLETED

## Problem Statement

After switching FITL province spaces from rectangles to colored polygons, three visual issues emerged:

1. **Province gaps**: Provinces float as isolated blobs with visible gaps. Real geographic provinces share borders with neighbors. Users must manually place vertices precisely to close gaps — impractical.
2. **No vertex editing in map editor**: The map editor allows dragging entire provinces but not individual polygon vertices. Users cannot add, remove, or reposition vertices.
3. **Incorrect layer ordering**: Cities render under provinces (should be on top). Roads/rivers render above cities (should be between provinces and cities).

Additionally, adjacency dashed lines between provinces are now redundant — shared borders communicate adjacency visually.

## Design Decisions

### Province Border Algorithm: Perpendicular Bisector Method

For each pair of adjacent provinces (A, B):

1. **Compute bisector**: Perpendicular line at the midpoint of the segment connecting A's center to B's center.
2. **Identify facing vertices**: Vertices of A whose angle from A's center falls within an angular cone (±60°) of the direction toward B's center.
3. **Project facing vertices onto bisector**: Each facing vertex is moved to the nearest point on the bisector line, clamped to the overlapping region extent.
4. **Build hybrid polygon**: Non-facing edges keep Chaikin-smoothed organic curves. Facing edges become straight segments along the bisector, inset 1-2px for a visible gap.
5. **Draw border line**: Thin (1px) dark line along each shared border segment.

**Edge cases**:
- **3+ provinces at a corner**: Bisectors naturally converge at the circumcenter of the triangle formed by the three centers (Voronoi vertex). No special handling needed.
- **Small province surrounded by large ones**: All vertices may face neighbors — the province becomes a fully straight-edged Voronoi cell. This is correct behavior.
- **Large gap between adjacent provinces**: A maximum extrusion distance (configurable, ~200px) prevents unrealistic stretching. Beyond this, organic curves are preserved.
- **Concave shapes**: After projection, validate polygon doesn't self-intersect. If it does, simplify with convex hull for the shared edge.
- **Province adjacent to non-province (city, LoC)**: No extrusion. Organic curve preserved.

### Layer Reordering

**Current** (bottom to top):
```
background → region → adjacency → zone (ALL) → connectionRoute → tableOverlay
```

**New** (bottom to top):
```
background → region → provinceZone → connectionRoute → cityZone → adjacency → tableOverlay
```

- Split `zoneLayer` into `provinceZoneLayer` and `cityZoneLayer`
- `connectionRouteLayer` sits between them (roads/rivers on top of provinces, under cities)
- `adjacencyLayer` moves above cities (only non-province adjacencies remain)

### Adjacency Line Removal

Remove all adjacency visuals (dashed lines, connection route visuals) where **at least one endpoint is a province**. Non-province adjacencies (city↔city, etc.) are preserved.

### Map Editor Vertex Editing

When a polygon-type zone is selected, vertex handles appear:
- **Vertex handles**: Small circles (6-8px) on each original (pre-smoothing) vertex. Drag to move.
- **Delete vertex**: Double-click a handle (minimum 3 vertices enforced).
- **Add vertex**: Click on edge midpoint handles (smaller, semi-transparent) to insert between two adjacent vertices.
- **Real-time preview**: Chaikin smoothing + border extrusion recompute live during drag.
- **Persistence**: Updated vertices written to editor store, saved to `visual-config.yaml`.
- **Border preview**: Voronoi border computation runs in real-time in the editor too.

Uses the existing but unused `handle` layer in `EditorLayerSet`.

## Key Files to Modify

| File | Change |
|------|--------|
| `packages/runner/src/canvas/layers.ts` | Split zoneLayer into provinceZone + cityZone, reorder |
| `packages/runner/src/canvas/renderers/zone-renderer.ts` | Route provinces vs cities to different layers; call border computation |
| `packages/runner/src/canvas/renderers/adjacency-renderer.ts` | Filter out province-involving adjacencies |
| `packages/runner/src/canvas/renderers/connection-route-renderer.ts` | Filter out province-involving routes |
| `packages/runner/src/canvas/canvas-updater.ts` | Wire new layers and border computation |
| `packages/runner/src/map-editor/map-editor-zone-renderer.ts` | Add vertex handle rendering and interaction |
| `packages/runner/src/map-editor/map-editor-canvas.ts` | Wire vertex editing to handle layer |

## New Files

| File | Purpose |
|------|---------|
| `packages/runner/src/canvas/renderers/province-border-utils.ts` | Perpendicular bisector computation, facing vertex detection, hybrid polygon generation |
| `packages/runner/src/map-editor/vertex-handle-renderer.ts` | Vertex handle creation, drag interaction, add/delete logic |

## Alignment with FOUNDATIONS.md

- **F1 Engine Agnosticism**: Border computation is purely visual (runner-side), no engine changes.
- **F3 Visual Separation**: All changes are in runner rendering and visual-config. No GameSpecDoc changes.
- **F7 Immutability**: Border computation is pure — takes positions/vertices/adjacencies, returns new polygon paths.
- **F9 No Backwards Compatibility**: Layer restructuring is a clean break, no shims.
- **F10 Architectural Completeness**: Addresses root cause (province rendering pipeline) not symptoms.

## Verification

1. Visual inspection: provinces share clean borders with thin gap lines
2. Map editor: vertices are draggable, addable, deletable
3. Layer order: cities render above provinces, roads/rivers between them
4. No adjacency dashed lines between provinces
5. Non-province adjacencies still render correctly
6. Existing Vitest runner tests pass
7. Performance: border computation cached, no per-frame recalculation
