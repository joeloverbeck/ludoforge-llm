# 74VISMAPLAYEDI-006: Connection Route Renderer and Handle Renderer

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: 74VISMAPLAYEDI-002, 74VISMAPLAYEDI-003

## Problem

Connection routes (roads, rivers) must render on the editor canvas as Bézier curves, with visible handles for anchor endpoints and control points when a route is selected. Routes must re-render in real-time as zones or anchors move.

## Assumption Reassessment (2026-03-21)

1. `quadraticBezierPoint(t, p0, cp, p2)` computes point on curve. Confirmed in `bezier-utils.ts`.
2. `approximateBezierHitPolygon(p0, cp, p2, halfWidth, segments)` creates hit area polygon. Confirmed.
3. Connection routes in visual config have `points` (endpoints array) and `segments` (per-segment curve definitions). Confirmed.
4. Connection endpoints are either `{ kind: 'zone', zoneId }` or `{ kind: 'anchor', anchorId }`. Confirmed.
5. Connection segments are either `{ kind: 'straight' }` or `{ kind: 'quadratic', control }`. Confirmed.
6. `parseHexColor` and shape drawing utilities available. Confirmed.

## Architecture Check

1. Editor route renderer is lightweight — reads from editor store's `connectionRoutes` and resolves endpoint positions from `zonePositions`/`connectionAnchors`.
2. Handle renderer draws on the topmost layer for interaction priority — separate from route curves.
3. Both renderers are game-agnostic (Foundation 1). No modification to existing renderers.

## What to Change

### 1. Create editor route renderer

New file `packages/runner/src/map-editor/map-editor-route-renderer.ts`:

**`createEditorRouteRenderer(routeLayer: Container, store: MapEditorStore)`**:
- For each route in `store.getState().connectionRoutes`:
  - Resolve endpoint positions: zone endpoints → `zonePositions` map, anchor endpoints → `connectionAnchors` map
  - Draw each segment: straight segments as lines, quadratic segments as Bézier curves (sample N points using `quadraticBezierPoint`)
  - Create hit area using `approximateBezierHitPolygon` for selection
  - Add click listener for route selection (`store.selectRoute(routeId)`)
  - Apply route styling: line width, color (from visual config or defaults), dashes for roads, wavy for rivers
- Subscribe to store changes (zone positions, anchor positions, route data) to re-render affected routes
- Return renderer with `destroy()` for cleanup

**Endpoint position resolution** (pure function, exported):
- `resolveEndpointPosition(endpoint: ConnectionEndpoint, zonePositions, connectionAnchors): Position`
- Zone endpoint → lookup in zonePositions, anchor endpoint → lookup in connectionAnchors

### 2. Create editor handle renderer

New file `packages/runner/src/map-editor/map-editor-handle-renderer.ts`:

**`createEditorHandleRenderer(handleLayer: Container, store: MapEditorStore)`**:
- Only renders handles for the currently selected route (`store.selectedRouteId`)
- **Zone endpoint handles**: Circle outlines at zone connection points (not draggable — move with zone)
- **Anchor endpoint handles**: Filled circles at anchor positions (draggable)
- **Bézier control point handles**: Diamond shapes at control point positions (draggable)
- **Tangent lines**: Thin lines connecting control points to their curve endpoints (visual aid)
- Subscribe to `selectedRouteId` to show/hide handles
- Subscribe to position changes to update handle positions
- Return renderer with `destroy()` for cleanup

**Handle visuals** (constants):
- Zone endpoint: white circle outline, radius 8
- Anchor endpoint: white filled circle, radius 8
- Control point: white filled diamond, size 10
- Tangent line: thin white line, alpha 0.5

## Files to Touch

- `packages/runner/src/map-editor/map-editor-route-renderer.ts` (new)
- `packages/runner/src/map-editor/map-editor-handle-renderer.ts` (new)

## Out of Scope

- Handle dragging interaction (74VISMAPLAYEDI-007)
- Waypoint insertion/removal (74VISMAPLAYEDI-007)
- Segment type conversion (74VISMAPLAYEDI-007)
- Grid overlay (74VISMAPLAYEDI-011)
- Modifying `bezier-utils.ts`, `connection-route-renderer.ts`, or any existing module

## Acceptance Criteria

### Tests That Must Pass

1. `resolveEndpointPosition` returns correct position for zone endpoints (from zonePositions map).
2. `resolveEndpointPosition` returns correct position for anchor endpoints (from connectionAnchors map).
3. Route renderer creates one Graphics object per route.
4. Straight segments are drawn as lines between resolved endpoint positions.
5. Quadratic segments sample points along the Bézier curve.
6. Handle renderer shows handles only for the selected route.
7. Handle renderer shows no handles when `selectedRouteId` is null.
8. When zone position changes, route curves re-render at updated positions.
9. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. No modification to `bezier-utils.ts`, `connection-route-renderer.ts`, or any existing canvas module.
2. Handle layer is always above zone layer (z-order maintained by canvas skeleton).
3. Route renderer is game-agnostic (Foundation 1).

## Test Plan

### New/Modified Tests

1. `packages/runner/test/map-editor/map-editor-route-renderer.test.ts` — endpoint resolution, route Graphics creation, re-render on store update
2. `packages/runner/test/map-editor/map-editor-handle-renderer.test.ts` — handle visibility on selection, handle types per endpoint/control point

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`
