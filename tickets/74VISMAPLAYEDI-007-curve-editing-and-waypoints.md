# 74VISMAPLAYEDI-007: Bézier Control Point Editing and Waypoint Operations

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: 74VISMAPLAYEDI-002, 74VISMAPLAYEDI-006

## Problem

Users need to reshape connection route curves by dragging Bézier control points, dragging anchor endpoints, and inserting/removing waypoints. This is the core curve editing functionality of the map editor.

## Assumption Reassessment (2026-03-21)

1. Handle renderer (74VISMAPLAYEDI-006) draws draggable handles for anchor endpoints and control points. Confirmed by design.
2. `quadraticBezierPoint(t, p0, cp, p2)` available for nearest-point computation. Confirmed.
3. `computeControlPoint(p0, p2, curvature)` available for segment conversion. Confirmed.
4. Editor store has `moveAnchor`, `moveControlPoint`, `insertWaypoint`, `removeWaypoint`, `convertSegment` actions. Confirmed by 74VISMAPLAYEDI-002 design.
5. PixiJS right-click: `pointerdown` with `event.button === 2`. Standard browser API.

## Architecture Check

1. Drag logic extends `map-editor-drag.ts` from 74VISMAPLAYEDI-004 — same pattern (pointerdown/move/up) applied to handles.
2. Waypoint operations use store actions that produce immutable state (Foundation 7).
3. All curve math is pure and testable independently (Foundation 11).

## What to Change

### 1. Extend drag module for handles

Modify `packages/runner/src/map-editor/map-editor-drag.ts`:

**Anchor drag**:
- Same pattern as zone drag but calls `store.moveAnchor(anchorId, position)` on pointerup
- Live preview during drag (update store without undo push, or update container directly)

**Control point drag**:
- Same pattern but calls `store.moveControlPoint(routeId, segmentIndex, position)` on pointerup
- Live preview during drag

### 2. Wire drag listeners on handles

Modify `packages/runner/src/map-editor/map-editor-handle-renderer.ts`:
- Anchor endpoint handles: `eventMode = 'static'`, `cursor = 'grab'`, wire drag listeners
- Control point handles: `eventMode = 'static'`, `cursor = 'grab'`, wire drag listeners
- Zone endpoint handles: remain non-interactive (cursor = 'default')

### 3. Implement waypoint operations

Add to `packages/runner/src/map-editor/map-editor-drag.ts` (or a new `map-editor-waypoint-ops.ts`):

**Insert waypoint** (double-click on route segment):
- Compute nearest point on segment using parametric sampling of `quadraticBezierPoint` (or linear interpolation for straight segments)
- Call `store.insertWaypoint(routeId, segmentIndex, nearestPosition)`
- Pure function: `nearestPointOnSegment(segment, clickPosition, startPos, endPos): { position: Position; t: number }`

**Remove waypoint** (right-click on non-endpoint anchor handle):
- Call `store.removeWaypoint(routeId, pointIndex)`
- Only allowed on non-endpoint anchors (not first or last point)

### 4. Implement segment type conversion

Add context menu or keyboard shortcut on selected segment:
- **Convert to quadratic**: Call `store.convertSegment(routeId, segmentIndex, 'quadratic')` — store computes midpoint control point using `computeControlPoint`
- **Convert to straight**: Call `store.convertSegment(routeId, segmentIndex, 'straight')` — store removes control point

Implementation: Use a simple right-click context menu on the route curve (not on a handle).

### 5. Nearest-point math

New file `packages/runner/src/map-editor/map-editor-curve-math.ts`:

**`nearestPointOnQuadratic(p0, cp, p2, target, samples = 50): { position: Position; t: number }`**:
- Sample the curve at `samples` evenly-spaced `t` values
- Return the sample closest to `target`

**`nearestPointOnStraight(p0, p1, target): { position: Position; t: number }`**:
- Project `target` onto line segment, clamp `t` to [0, 1]

## Files to Touch

- `packages/runner/src/map-editor/map-editor-drag.ts` (modify — add anchor/control point drag)
- `packages/runner/src/map-editor/map-editor-handle-renderer.ts` (modify — wire drag listeners)
- `packages/runner/src/map-editor/map-editor-curve-math.ts` (new)

## Out of Scope

- Zone dragging (74VISMAPLAYEDI-004 — already done)
- Route rendering (74VISMAPLAYEDI-006 — already done)
- Keyboard shortcuts for undo/redo (74VISMAPLAYEDI-008)
- YAML export (74VISMAPLAYEDI-009)
- Grid snap during handle drag (74VISMAPLAYEDI-011 — snap logic exists in drag module but grid overlay is separate)
- Context menu UI framework (use simple PixiJS-based or DOM-based popup)

## Acceptance Criteria

### Tests That Must Pass

1. `nearestPointOnStraight({x:0,y:0}, {x:10,y:0}, {x:5,y:3})` returns position near `{x:5, y:0}` with `t ≈ 0.5`.
2. `nearestPointOnStraight` clamps to endpoints: target beyond segment end returns endpoint.
3. `nearestPointOnQuadratic` returns a point that is on (or very near) the curve.
4. Anchor drag lifecycle: pointerdown → move → pointerup results in exactly one undo entry with correct position.
5. Control point drag lifecycle: same undo behavior.
6. Double-click on a segment calls `insertWaypoint` with position on or near the curve.
7. Right-click on a non-endpoint anchor handle calls `removeWaypoint`.
8. Right-click on an endpoint anchor handle does NOT call `removeWaypoint`.
9. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. No modification to `bezier-utils.ts` or any existing canvas module.
2. All curve math functions are pure (no side effects, no store access) — testable in isolation (Foundation 11).
3. Each user action (complete drag, insert, remove, convert) produces exactly one undo entry (Foundation 7).

## Test Plan

### New/Modified Tests

1. `packages/runner/test/map-editor/map-editor-curve-math.test.ts` — nearest-point on straight, nearest-point on quadratic, edge cases (degenerate segments)
2. `packages/runner/test/map-editor/map-editor-drag.test.ts` — add anchor drag tests, control point drag tests

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`
