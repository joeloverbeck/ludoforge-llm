# Map Editor Polygon Vertex Editing Fixes

**Date**: 2026-03-31
**Scope**: Runner — map editor presentation layer only
**Engine changes**: None

## Problem

Three bugs in the polygon vertex editing system make the map editor's polygon shaping feature unusable:

1. **Vertex handles desync during province drag**: Yellow/blue vertex handles stay at their original positions when the province polygon is dragged to a new location.
2. **Labels not recentered after vertex removal**: Province labels (e.g., "Sihanoukville") remain at the old center position after vertices are removed and the polygon shape changes.
3. **Vertex handle drag blocked by viewport pan**: Attempting to drag a yellow vertex handle to reshape the polygon instead pans the entire map.

## Root Causes

### Issue 1: Missing subscription trigger

`vertex-handle-renderer.ts:112-118` subscribes to `selectedZoneId` and `zoneVertices` but not `zonePositions`. Province drag updates `zonePositions` (the zone center moves) while `zoneVertices` (relative vertex coordinates) stays unchanged, so `rebuild()` is never called.

### Issue 2: Hardcoded label position

`map-editor-presentation-adapter.ts:133` sets label Y to `0` for all non-circle shapes. There is no recalculation based on actual polygon geometry. When vertices are removed, the polygon's visual center shifts but the label remains at the old local origin.

### Issue 3: Missing event propagation stop

`vertex-handle-renderer.ts:172` does not call `event.stopPropagation()` in the vertex handle `pointerdown` handler. The event bubbles to pixi-viewport's `.drag()` plugin, which captures it for panning. Zone drag handlers (`map-editor-drag.ts:259`) correctly call `stopPropagation` — vertex handles do not.

## Design

### Fix 1: Add `zonePositions` to vertex handle subscription

Add `state.zonePositions !== prevState.zonePositions` to the existing subscription condition. This triggers `rebuild()` when the province moves, recalculating handle world positions.

### Fix 2: Pole-of-inaccessibility label placement

Implement a pole-of-inaccessibility algorithm that finds the point inside a polygon farthest from any edge. This guarantees the label is always inside the polygon, even for concave shapes. The algorithm uses iterative cell subdivision:

1. Divide polygon bounding box into a grid of cells
2. For each cell, compute distance from center to nearest polygon edge
3. Keep the cell with the greatest distance as the best candidate
4. Subdivide promising cells (those whose potential exceeds current best)
5. Repeat until precision threshold is met

The label position is returned as local coordinates (relative to zone position) so it integrates with the existing rendering pipeline.

### Fix 3: Stop propagation on vertex/midpoint pointerdown

Add `event.stopPropagation?.()` to both the vertex handle and midpoint handle `pointerdown` handlers, matching the established pattern in `attachPositionDragHandlers`.

## Tickets

- `99MAPEDITOR-001`: Vertex handle position sync
- `99MAPEDITOR-002`: Polygon label recentering
- `99MAPEDITOR-003`: Vertex handle drag propagation

## FOUNDATIONS Alignment

- **Engine Agnosticism** (F1): All changes are in the runner map-editor layer. No engine code touched.
- **Visual Separation** (F3): Label placement is a presentation concern, correctly located in the presentation adapter.
- **Immutability** (F7): Store updates create new Map objects; no mutation.
- **No Backwards Compatibility** (F9): No shims needed — direct fixes.
