# 83ZONEDGANCEND-006: Drag UX and Handle Rendering

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: `archive/tickets/83ZONEDGANCEND-002-edge-position-math-utilities.md`, `archive/tickets/83ZONEDGANCEND/83ZONEDGANCEND-004-editor-route-geometry-update.md`, `tickets/83ZONEDGANCEND-005-store-actions-set-and-preview-anchor.md`

## Problem

When the user drags a zone endpoint in the map editor, the current behavior calls `convertEndpointToAnchor()` which permanently breaks the semantic link between the endpoint and the zone. The new behavior should snap the endpoint to the zone's edge at the dragged angle, preserving the zone link. Additionally, endpoint drag handles are always rendered at the zone center — they must be rendered at the edge position when `anchor` is set.

## Assumption Reassessment (2026-03-26)

1. `attachZoneEndpointConvertDragHandlers` is in `packages/runner/src/map-editor/map-editor-drag.ts` (lines 57-154).
2. On first pointer move, it calls `state.convertEndpointToAnchor(routeId, pointIndex)` to get an `anchorId`, then switches to free anchor dragging.
3. The function returns a cleanup function removing event listeners.
4. Other drag handlers follow the pattern: `attachZoneDragHandlers`, `attachAnchorDragHandlers`, `attachControlPointDragHandlers`, `attachPositionDragHandlers`.
5. Handle rendering for route endpoints is done in `packages/runner/src/map-editor/map-editor-handle-renderer.ts`, which currently positions zone endpoint handles from editor route geometry and still attaches the conversion-based drag handler.
6. The drag handler needs zone center position, shape, and dimensions — currently not passed.
7. This ticket is the primary owner of the remaining design gap: zone endpoint drags must preserve zone linkage by default, and the old detach-on-first-move behavior should cease to be the normal path.

## Architecture Check

1. Replaces the existing conversion-based approach with edge-snapping — cleaner UX, preserves zone semantics.
2. The primary interaction path must be zone-linked endpoint editing, not conversion to free anchors. Any escape hatch must be explicit and secondary.
3. Uses existing store interaction pattern (`beginInteraction` → `previewEndpointAnchor` → `commitInteraction`) and the geometry contract from ticket 004.
4. Handle rendering must derive from shared route geometry so authored anchors and drag previews stay visually consistent.
5. Pure angle computation from cursor position (F7).

## What to Change

### 1. Replace `attachZoneEndpointConvertDragHandlers`

In `packages/runner/src/map-editor/map-editor-drag.ts`, replace `attachZoneEndpointConvertDragHandlers` with `attachZoneEdgeAnchorDragHandlers` and update every caller in the same change:

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
3. **On pointer up**: The committed route state must retain a `kind: 'zone'` endpoint with the computed `anchor`
4. **Escape hatch**: If cursor distance from center > `2 * Math.max(width, height)`, an explicit detach to free anchor is acceptable, but it must remain a secondary branch rather than the default flow

### 2. Update callers of the drag handler

The code that attaches drag handlers to zone endpoint handles in `map-editor-handle-renderer.ts` must call the new function with the additional zone data parameters.

### 3. Update handle rendering

In `map-editor-handle-renderer.ts` and any editor geometry helpers it depends on:
- If zone endpoint has `anchor`: position handle at edge via `getEdgePointAtAngle`
- If no `anchor`: position at zone center (existing behavior)
- Keep route polyline sampling, hit areas, and endpoint handles on the same resolved geometry contract.

## Files to Touch

- `packages/runner/src/map-editor/map-editor-drag.ts` (modify — replace handler)
- `packages/runner/src/map-editor/map-editor-handle-renderer.ts` (modify — pass zone data, position handles from resolved geometry)
- Any shared editor geometry caller updated by ticket 004 (modify as needed)

## Out of Scope

- Schema changes — ticket 001
- Edge position math implementation — ticket 002
- Presentation resolver — ticket 003
- Editor route geometry — ticket 004
- Store action implementation — ticket 005
- FITL visual config — ticket 007
- `attachZoneDragHandlers`, `attachAnchorDragHandlers`, `attachControlPointDragHandlers` — unchanged
- Broad redesign of non-endpoint drag behavior

## Acceptance Criteria

### Tests That Must Pass

1. Drag handler computes correct angle from zone center to cursor position
2. Angle normalization: cursor positions in all four quadrants produce angles in [0, 360)
3. Edge snap: handle position matches `center + getEdgePointAtAngle(shape, dims, angle)` during drag
4. Preview: `previewEndpointAnchor` is called during drag move with computed angle
5. Commit: the final route state keeps a `kind: 'zone'` endpoint and records the computed `anchor` on pointer up
6. Escape hatch: dragging beyond `2 * max(w, h)` triggers `convertEndpointToAnchor` instead
7. Handle rendering: zone endpoint with `anchor: 90` on circle renders handle at top edge
8. Handle rendering: zone endpoint without `anchor` renders handle at center
9. Existing suite: `pnpm -F @ludoforge/runner test`
10. Existing suite: `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. Zone endpoint dragging preserves semantic zone linkage in the normal path.
2. `convertEndpointToAnchor` remains available only as an explicit escape hatch path.
3. Drag behavior for non-zone endpoints (anchors, control points) is unchanged.
4. No mutation during drag — all position updates go through store actions (F7).
5. Cleanup function removes all event listeners (no memory leaks).

## Test Plan

### New/Modified Tests

1. `packages/runner/test/map-editor/map-editor-drag.test.ts` — test angle computation, edge snap, escape hatch, preview/commit flow

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/map-editor/map-editor-drag.test.ts`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`
