# MAPEDIT-004: Make zone endpoints draggable (convert to anchor on drag)

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: `tickets/MAPEDIT-001-fix-handle-drag.md` (shares `map-editor-handle-renderer.ts`; depends on drag surface fix)

## Problem

When a connector route is selected, zone endpoints appear as white unfilled circles at zone centers. These endpoints have `eventMode: 'none'` — they are purely visual and cannot be dragged. Users cannot reposition where connectors attach to zones, forcing workarounds like adding waypoints or quadratic control points to compensate for suboptimal center-to-center routing.

Example: the Hue-Da Nang road connector uses a quadratic curve with a poorly placed control point to work around the center-to-center default. If endpoints were draggable, the user could position them at the zone edges and use a straight segment.

## Assumption Reassessment (2026-03-22)

1. Zone endpoint handles confirmed in `map-editor-handle-renderer.ts` lines 76-85: `eventMode: 'none'`, unfilled circle stroke, no drag handlers attached.
2. `ConnectionEndpoint` type in `visual-config-types.ts`: `ZoneConnectionEndpoint = { kind: 'zone', zoneId: string }` — no offset property exists.
3. `resolveEndpointPosition()` in `map-editor-store.ts` line 739-740: zone endpoints resolve to `zonePositions.get(endpoint.zoneId)` — always zone center.
4. Anchor endpoints already draggable: `eventMode: 'static'`, filled circle, `attachAnchorDragHandlers()` attached — confirmed working (after MAPEDIT-001 fix).
5. User approved the "convert to anchor" approach over "zone-relative offset" — simpler, no schema changes needed.

## Architecture Check

1. Converting a zone endpoint to an anchor on first drag avoids schema changes to `ConnectionEndpoint` and keeps both the editor and play-mode route resolvers unchanged. The anchor is a standard `AnchorConnectionEndpoint` — all existing anchor handling works.
2. All changes are runner-only. No engine, GameSpecDoc, or GameDef type changes. The conversion is a visual-config editing operation, not a runtime behavior change.
3. No backwards-compatibility shims. The zone endpoint is cleanly replaced with an anchor endpoint in the route definition. The exported `visual-config.yaml` will contain the anchor instead of the zone endpoint.

## What to Change

### 1. Add convertEndpointToAnchor action to store

In `map-editor-store.ts`, add a `convertEndpointToAnchor(routeId: string, pointIndex: number): string | null` action:
- Read the zone endpoint at `route.points[pointIndex]`
- If not `kind: 'zone'`, return null
- Resolve the zone's current position from `zonePositions`
- Generate an anchor ID (e.g., `${zoneId}-ep-${pointIndex}`, ensuring uniqueness against existing anchors)
- Create a new anchor at the zone's position in `connectionAnchors`
- Replace `route.points[pointIndex]` with `{ kind: 'anchor', anchorId }`
- Return the new anchorId

### 2. Add zone endpoint convert-drag handler

In `map-editor-drag.ts`, add `attachZoneEndpointConvertDragHandlers(handle, routeId, pointIndex, zoneId, dragSurface, store)`:
- On `pointerdown`: call `beginInteraction()`, `setDragging(true)`
- On first `pointermove`: call `store.getState().convertEndpointToAnchor(routeId, pointIndex)` to get the new anchorId. Then continue with `previewAnchorMove(anchorId, position)` for subsequent moves.
- On `pointerup`: call `commitInteraction()`, `setDragging(false)`

### 3. Make zone endpoint handles interactive

In `map-editor-handle-renderer.ts`:
- Change zone endpoint handles from `eventMode: 'none'` to `eventMode: 'static'`
- Set `cursor: 'grab'`
- Add `hitArea = new Circle(0, 0, HANDLE_RADIUS)`
- Fill the circle (matching anchor endpoint style) to indicate interactivity
- Attach `attachZoneEndpointConvertDragHandlers()` instead of no handler

## Files to Touch

- `packages/runner/src/map-editor/map-editor-store.ts` (modify)
- `packages/runner/src/map-editor/map-editor-drag.ts` (modify)
- `packages/runner/src/map-editor/map-editor-handle-renderer.ts` (modify)

## Out of Scope

- Zone-relative offset endpoints (deferred; simpler anchor approach first)
- Auto-snapping endpoints to zone edges
- Undo granularity for the convert+drag compound operation (treated as a single undoable interaction via beginInteraction/commitInteraction)

## Acceptance Criteria

### Tests That Must Pass

1. `convertEndpointToAnchor` creates a new anchor at the zone's center position
2. `convertEndpointToAnchor` replaces the zone endpoint with an anchor endpoint in the route
3. `convertEndpointToAnchor` returns null for non-zone endpoints
4. Generated anchor IDs are unique (no collision with existing anchors)
5. Zone endpoint handles have `eventMode: 'static'` and non-null `hitArea`
6. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Existing anchor endpoints continue to work as before
2. Route geometry resolution works identically for the new anchor endpoint as it did for the original zone endpoint (same initial position)
3. The exported visual-config.yaml correctly contains the new anchor and updated route points

## Test Plan

### New/Modified Tests

1. `packages/runner/test/map-editor/map-editor-store.test.ts` — test `convertEndpointToAnchor` for zone endpoint conversion, null return for non-zone, anchor uniqueness
2. `packages/runner/test/map-editor/map-editor-handle-renderer.test.ts` — verify zone endpoint handles are interactive with hitArea

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner lint && pnpm -F @ludoforge/runner typecheck`
