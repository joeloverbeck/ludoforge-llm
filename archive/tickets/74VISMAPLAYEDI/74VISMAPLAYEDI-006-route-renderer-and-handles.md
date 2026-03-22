# 74VISMAPLAYEDI-006: Connection Route Renderer and Handle Renderer

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: 74VISMAPLAYEDI-002, 74VISMAPLAYEDI-003, 74VISMAPLAYEDI-005

## Problem

The map editor already mounts a canvas, viewport, zone layer, and immutable editor store, but it still cannot render editable connection routes or the handles needed to inspect their endpoints and control points. As a result, users can reposition zones but cannot see or select the road/river geometry they are meant to reshape in later tickets.

## Assumption Reassessment (2026-03-22)

1. `MapEditorScreen`, `map-editor-canvas.ts`, `map-editor-zone-renderer.ts`, and `map-editor-store.ts` already exist and are the current editor composition/runtime foundation. Confirmed.
2. The editor store already exposes `zonePositions`, `connectionAnchors`, `connectionRoutes`, `selectedRouteId`, interaction preview APIs, and immutable route/anchor editing actions. Confirmed.
3. Connection routes in visual config still use `points` plus `segments`, and endpoints/controls are discriminated unions (`zone` / `anchor`, `position` / `anchor`). Confirmed in `visual-config-types.ts`.
4. Route IDs are not free-floating editor IDs. They are keyed by the connection-zone ID whose style/display metadata comes from `gameDef` + `VisualConfigProvider`, not from the route definition itself. Confirmed via `visual-config-provider.ts` and `connection-route-resolver.ts`.
5. `quadraticBezierPoint(...)` and `approximateBezierHitPolygon(...)` exist, but a complete editor route hit area must handle both straight and quadratic multi-segment paths. The current shared route renderer solves this by sampling a polyline and deriving a polyline hit polygon; the editor renderer should follow that model rather than assume a single quadratic polygon is sufficient. Confirmed.
6. The existing game `connection-route-renderer.ts` is too coupled to the presentation pipeline (labels, badges, junctions, selectable scene nodes) to reuse directly inside the editor. A dedicated editor renderer remains the cleaner architecture. Confirmed.

## Architecture Check

1. The editor route renderer should stay editor-specific and lightweight, but it must join three sources of truth:
   - editable geometry from the editor store,
   - connection-zone metadata from `gameDef`,
   - route style resolution from `VisualConfigProvider`.
2. Route and handle renderers should share pure route-geometry helpers so endpoint resolution, control-point resolution, tangent lines, and sampled polylines do not drift.
3. `MapEditorScreen` remains the composition root. `map-editor-canvas.ts` owns layer creation only; it must not absorb renderer orchestration.
4. Existing reusable primitives (`bezier-utils.ts`, `shape-utils.ts`) should be reused; existing game renderers should not be bent into editor responsibilities.
5. This work should not introduce compatibility layers or duplicate style sources. If a route depends on a connection zone that does not exist or is not renderable, it should simply not render until the data is corrected.

## What to Change

### 1. Add shared editor route-geometry helpers

New file `packages/runner/src/map-editor/map-editor-route-geometry.ts`:

- Export pure helpers for the editor renderers:
  - `resolveEndpointPosition(endpoint, zonePositions, connectionAnchors)`
  - `resolveRouteGeometry(routeDefinition, zonePositions, connectionAnchors, options)`
  - helper types describing resolved points, controls, sampled path, and tangent segments as needed
- Behavior:
  - Resolve zone endpoints from `zonePositions`
  - Resolve anchor endpoints from `connectionAnchors`
  - Resolve quadratic control points from inline positions or referenced anchors
  - Sample straight/quadratic multi-segment routes into a polyline suitable for drawing and hit testing
  - Produce a hit polygon that works for both straight and quadratic routes
- Keep this module pure and store-free so both renderers can consume the exact same geometry contract.

### 2. Create editor route renderer

New file `packages/runner/src/map-editor/map-editor-route-renderer.ts`:

**`createEditorRouteRenderer(routeLayer, store, gameDef, visualConfigProvider)`**

- Render one route container/graphics per editor route whose route ID maps to a connection zone in `gameDef`
- Resolve style from the connection zone visual (`connectionStyleKey`) through `VisualConfigProvider.resolveConnectionStyle(...)`
- Draw straight segments as lines and quadratic segments using Pixi quadratic commands or sampled polyline output, depending on the resolved style needs
- Use the shared route-geometry helper output for hit areas so selection works for multi-segment routes
- Bind route selection on click:
  - `store.selectRoute(routeId)`
  - `store.selectZone(null)`
- Subscribe to store updates and re-render when route geometry, anchors, zone positions, or route selection changes
- Return `{ getContainerMap(), destroy() }`

### 3. Create editor handle renderer

New file `packages/runner/src/map-editor/map-editor-handle-renderer.ts`:

**`createEditorHandleRenderer(handleLayer, store)`**

- Render handles only for `store.selectedRouteId`
- Use the shared route-geometry helpers so handles align with the same resolved endpoints/control points used by the route renderer
- Render:
  - zone endpoint handles: outlined circles, non-draggable
  - anchor endpoint handles: filled circles, non-draggable in this ticket
  - quadratic control points: filled diamonds, non-draggable in this ticket
  - tangent lines from quadratic control points to segment endpoints
- Subscribe to route selection and geometry changes to update/destroy handles as needed
- Return `{ destroy() }`

### 4. Compose the new renderers into the existing screen runtime

Modify `packages/runner/src/map-editor/MapEditorScreen.tsx`:

- After creating the canvas and zone renderer, also create:
  - `createEditorRouteRenderer(...)`
  - `createEditorHandleRenderer(...)`
- Destroy them during cleanup in the same runtime lifecycle

This is required because the composition root already exists; leaving the new renderers unattached would make the ticket incomplete.

## Files to Touch

- `packages/runner/src/map-editor/map-editor-route-geometry.ts` (new)
- `packages/runner/src/map-editor/map-editor-route-renderer.ts` (new)
- `packages/runner/src/map-editor/map-editor-handle-renderer.ts` (new)
- `packages/runner/src/map-editor/MapEditorScreen.tsx` (modify)
- `packages/runner/test/map-editor/map-editor-route-geometry.test.ts` (new)
- `packages/runner/test/map-editor/map-editor-route-renderer.test.ts` (new)
- `packages/runner/test/map-editor/map-editor-handle-renderer.test.ts` (new)
- `packages/runner/test/map-editor/MapEditorScreen.test.tsx` (modify)

## Out of Scope

- Dragging anchor endpoints or control points (`74VISMAPLAYEDI-007`)
- Waypoint insertion/removal (`74VISMAPLAYEDI-007`)
- Segment type conversion (`74VISMAPLAYEDI-007`)
- Grid overlay (`74VISMAPLAYEDI-011`)
- Toolbar / keyboard shortcuts (`74VISMAPLAYEDI-008`)
- Modifying `bezier-utils.ts` or the production `connection-route-renderer.ts` unless a tiny shared-helper extraction becomes strictly necessary to eliminate logic drift

## Acceptance Criteria

### Tests That Must Pass

1. `resolveEndpointPosition` returns the correct position for zone endpoints.
2. `resolveEndpointPosition` returns the correct position for anchor endpoints.
3. Shared route-geometry helpers resolve quadratic control points from both inline positions and anchor-backed controls.
4. Route geometry sampling produces a hit polygon/polyline for a multi-segment route.
5. Route renderer creates one container per renderable connection route.
6. Clicking a route selects it and clears `selectedZoneId`.
7. Handle renderer shows no handles when `selectedRouteId` is null.
8. Handle renderer renders endpoint/control handles only for the selected route.
9. Updating zone positions or anchor positions causes route/handle geometry to re-render.
10. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Route styling is resolved from connection-zone visual metadata plus `VisualConfigProvider`, not duplicated into editable route state.
2. Route/handle geometry logic is shared through pure helpers, not copied separately into both renderers.
3. `MapEditorScreen` remains the editor composition root; renderer lifecycle ownership is not moved into the canvas or store.
4. The new renderers remain game-agnostic and do not create their own store, bootstrap logic, or visual-config parsing.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/map-editor/map-editor-route-geometry.test.ts` — endpoint/control resolution, sampled geometry, hit polygon generation
2. `packages/runner/test/map-editor/map-editor-route-renderer.test.ts` — route creation, selection wiring, re-render on store updates
3. `packages/runner/test/map-editor/map-editor-handle-renderer.test.ts` — selected-route-only handles, tangent-line rendering, geometry refresh
4. `packages/runner/test/map-editor/MapEditorScreen.test.tsx` — route/handle renderer composition and cleanup

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-22
- What actually changed:
  - Reassessed and corrected the ticket to match the current editor runtime, route-style source of truth, and required screen composition work.
  - Added a pure `map-editor-route-geometry.ts` module so route and handle renderers share endpoint/control resolution, segment resolution, sampled paths, and hit polygons.
  - Implemented `map-editor-route-renderer.ts` to draw editable connection routes from store state while resolving route styles from connection-zone metadata plus `VisualConfigProvider`.
  - Implemented `map-editor-handle-renderer.ts` to show selected-route endpoint handles, control handles, and quadratic tangent lines.
  - Wired both renderers into `MapEditorScreen.tsx` so the existing composition root owns their lifecycle.
  - Added new geometry/route/handle tests and expanded `MapEditorScreen` coverage for renderer composition and cleanup.
- Deviations from original plan:
  - Added a shared editor geometry module that was not in the original ticket because duplicating route math across two renderers would have been a worse long-term architecture.
  - The handle renderer in this ticket is intentionally visual-only; dragging remains deferred to `74VISMAPLAYEDI-007`.
  - The ticket scope had to include `MapEditorScreen.tsx` and its tests because the renderers were otherwise not reachable from the existing runtime.
- Verification results:
  - `pnpm -F @ludoforge/runner test` ✅
  - `pnpm -F @ludoforge/runner typecheck` ✅
  - `pnpm turbo lint` ✅
