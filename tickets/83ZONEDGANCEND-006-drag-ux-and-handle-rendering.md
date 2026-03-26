# 83ZONEDGANCEND-006: Drag UX and Handle Rendering

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: 83ZONEDGANCEND-002 (edge math), 83ZONEDGANCEND-004 (editor route geometry), 83ZONEDGANCEND-005 (store actions)

## Problem

When the user drags a zone endpoint in the map editor, the current behavior calls `convertEndpointToAnchor()` which permanently breaks the semantic link between the endpoint and the zone. The new behavior should snap the endpoint to the zone's edge at the dragged angle, preserving the zone link. Additionally, endpoint drag handles are always rendered at the zone center — they must be rendered at the edge position when `anchor` is set.

## Assumption Reassessment (2026-03-26)

1. `attachZoneEndpointConvertDragHandlers` is in `packages/runner/src/map-editor/map-editor-drag.ts` (lines 57-154).
2. On first pointer move, it calls `state.convertEndpointToAnchor(routeId, pointIndex)` to get an `anchorId`, then switches to free anchor dragging.
3. The function returns a cleanup function removing event listeners.
4. Other drag handlers follow the pattern: `attachZoneDragHandlers`, `attachAnchorDragHandlers`, `attachControlPointDragHandlers`, `attachPositionDragHandlers`.
5. Handle rendering for route endpoints is done in the map editor canvas layer — needs audit to find exact file and function.
6. The drag handler needs zone center position, shape, and dimensions — currently not passed.

## Architecture Check

1. Replaces the existing conversion-based approach with edge-snapping — cleaner UX, preserves zone semantics.
2. Escape hatch preserved: dragging far from zone (>2× max dimension) falls back to `convertEndpointToAnchor`.
3. Uses existing store interaction pattern (`beginInteraction` → `previewEndpointAnchor` → `commitInteraction`).
4. Pure angle computation from cursor position (F7).

## What to Change

### 1. Replace `attachZoneEndpointConvertDragHandlers`

In `packages/runner/src/map-editor/map-editor-drag.ts`, replace with `attachZoneEdgeAnchorDragHandlers`:

**Parameters** (extended from current):
- `handle`: drag target
- `routeId`, `pointIndex`: identify the endpoint
- `dragSurface`: pointer event surface
- `store`: editor store
- `zoneCenter`: `Position` — the zone's current center position
- `zoneShape`: `ZoneShape | undefined` — the zone's shape
- `zoneDimensions`: `ShapeDimensions` — the zone's width/height

**Behavior**:
1. **On pointer down**: Record drag start. Select the route.
2. **On pointer move**:
   - Compute angle from zone center to cursor: `atan2(-(cursor.y - center.y), cursor.x - center.x)` → degrees
   - Normalize to [0, 360)
   - Compute edge point via `getEdgePointAtAngle(shape, dimensions, angle)`
   - Move handle to `center + offset`
   - Call `store.getState().previewEndpointAnchor(routeId, pointIndex, angle)`
3. **On pointer up**: Call `store.getState().setEndpointAnchor(routeId, pointIndex, angle)` via commit interaction
4. **Escape hatch**: If cursor distance from center > `2 * Math.max(width, height)`, fall back to `convertEndpointToAnchor`

### 2. Update callers of the drag handler

The code that attaches drag handlers to zone endpoint handles must call the new function with the additional zone data parameters.

### 3. Update handle rendering

In the map editor canvas code that creates endpoint drag handles:
- If zone endpoint has `anchor`: position handle at edge via `getEdgePointAtAngle`
- If no `anchor`: position at zone center (existing behavior)

Audit map editor canvas files to identify the exact rendering code.

## Files to Touch

- `packages/runner/src/map-editor/map-editor-drag.ts` (modify — replace handler)
- Map editor canvas file(s) that attach drag handlers and render handles (modify — pass zone data, position handles at edge)

## Out of Scope

- Schema changes — ticket 001
- Edge position math implementation — ticket 002
- Presentation resolver — ticket 003
- Editor route geometry — ticket 004
- Store action implementation — ticket 005
- FITL visual config — ticket 007
- `attachZoneDragHandlers`, `attachAnchorDragHandlers`, `attachControlPointDragHandlers` — unchanged
- `convertEndpointToAnchor` store action — preserved for escape hatch, not modified

## Acceptance Criteria

### Tests That Must Pass

1. Drag handler computes correct angle from zone center to cursor position
2. Angle normalization: cursor positions in all four quadrants produce angles in [0, 360)
3. Edge snap: handle position matches `center + getEdgePointAtAngle(shape, dims, angle)` during drag
4. Preview: `previewEndpointAnchor` is called during drag move with computed angle
5. Commit: `setEndpointAnchor` is called on pointer up
6. Escape hatch: dragging beyond `2 * max(w, h)` triggers `convertEndpointToAnchor` instead
7. Handle rendering: zone endpoint with `anchor: 90` on circle renders handle at top edge
8. Handle rendering: zone endpoint without `anchor` renders handle at center
9. Existing suite: `pnpm -F @ludoforge/runner test`
10. Existing suite: `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. `convertEndpointToAnchor` remains available as escape hatch — not removed.
2. Drag behavior for non-zone endpoints (anchors, control points) is unchanged.
3. No mutation during drag — all position updates go through store actions (F7).
4. Cleanup function removes all event listeners (no memory leaks).

## Test Plan

### New/Modified Tests

1. `packages/runner/test/map-editor/map-editor-drag.test.ts` — test angle computation, edge snap, escape hatch, preview/commit flow

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/map-editor/map-editor-drag.test.ts`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`
