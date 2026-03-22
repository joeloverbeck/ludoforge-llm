# MAPEDIT-004: Make zone endpoints draggable (convert to anchor on drag)

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: `archive/tickets/MAPEDIT-001-fix-handle-drag.md`

## Problem

When a connector route is selected, zone endpoints appear as white unfilled circles at zone centers. These endpoints have `eventMode: 'none'` — they are purely visual and cannot be dragged. Users cannot reposition where connectors attach to zones, forcing workarounds like adding waypoints or quadratic control points to compensate for suboptimal center-to-center routing.

Example: the Hue-Da Nang road connector uses a quadratic curve with a poorly placed control point to work around the center-to-center default. If endpoints were draggable, the user could position them at the zone edges and use a straight segment.

## Assumption Reassessment (2026-03-22)

1. Zone endpoint handles are still rendered in `packages/runner/src/map-editor/map-editor-handle-renderer.ts` as stroked circles with `eventMode: 'none'`, while anchor and control handles are already interactive. The user-visible problem remains real.
2. `ConnectionEndpoint` in `packages/runner/src/config/visual-config-types.ts` is still a strict union of `{ kind: 'zone', zoneId }` and `{ kind: 'anchor', anchorId }`. There is no existing offset-bearing endpoint variant.
3. Route geometry resolution is no longer a store concern. The canonical endpoint resolver used by the renderer and route hit-testing is `resolveEndpointPosition()` in `packages/runner/src/map-editor/map-editor-route-geometry.ts`, while `map-editor-store.ts` keeps only a private helper for document transforms such as midpoint control creation. The ticket must not imply a single store-owned geometry pipeline.
4. Export is already centralized in `packages/runner/src/map-editor/map-editor-export.ts`, and existing tests in `packages/runner/test/map-editor/map-editor-export.test.ts` already prove that edited anchors/routes serialize back into `visual-config.yaml`. This ticket should extend that existing coverage rather than invent a separate export mechanism.
5. Anchor endpoints are already the editor’s first-class movable route points. After MAPEDIT-001, anchor/control dragging uses the injected drag surface correctly. Promoting a dragged zone endpoint into a real anchor therefore fits the current architecture instead of creating a parallel endpoint-editing model.
6. The current handle renderer calls drag-attachment helpers but does not retain per-handle cleanup callbacks. Because the renderer rebuilds its child tree on every relevant store change, explicit disposer ownership is now a concrete robustness concern rather than a hypothetical cleanup improvement.
7. The beneficial architecture choice is still "promote to anchor on first drag", not "add zone-relative offsets". The former reuses the current route schema, export path, geometry resolver, and interaction semantics. The latter would introduce a third endpoint flavor plus new resolution and validation rules for a capability the existing anchor model already expresses.

## Architecture Check

1. Converting a zone endpoint to an anchor on first drag avoids schema churn and keeps the route model binary: endpoints are either pinned to a zone center or represented by an explicit free-position anchor. That is simpler, easier to validate, and already matches export/runtime expectations.
2. The conversion belongs in the store as an immutable document transform, not inside the renderer. Rendering should stay declarative; drag orchestration should trigger a store action that rewrites the route and anchor maps.
3. Drag behavior should remain generic. The clean implementation is to add one store action for endpoint promotion and one drag helper for zone-endpoint promotion, while preserving the existing anchor/control drag helpers and drag-surface injection pattern.
4. Explicit handler cleanup in the renderer is worth folding in now. Once zone endpoints also attach drag behavior, relying on display-object destruction alone becomes an avoidable lifecycle risk.
5. All changes remain runner-only. No engine, GameSpecDoc, or GameDef contracts change.
6. No backwards-compatibility shims or alias paths. Once a drag promotes a zone endpoint, the route point becomes an anchor endpoint everywhere, including exported YAML.

## What to Change

### 1. Add convertEndpointToAnchor action to store

In `map-editor-store.ts`, add a `convertEndpointToAnchor(routeId: string, pointIndex: number): string | null` action:
- Read the zone endpoint at `route.points[pointIndex]`
- If not `kind: 'zone'`, return null
- Resolve the zone's current position from `zonePositions`
- Generate a stable unique anchor ID derived from route/zone context, ensuring uniqueness against existing anchors
- Create a new anchor at the zone's position in `connectionAnchors`
- Replace `route.points[pointIndex]` with `{ kind: 'anchor', anchorId }`
- Return the new anchorId
- Treat this as a document edit that can participate in an interaction snapshot, because the first drag movement should undo as a single convert+move action

### 2. Add zone endpoint convert-drag handler

In `map-editor-drag.ts`, add `attachZoneEndpointConvertDragHandlers(handle, routeId, pointIndex, zoneId, dragSurface, store)`:
- On `pointerdown`: call `beginInteraction()`, `setDragging(true)`
- On first `pointermove`: call `store.getState().convertEndpointToAnchor(routeId, pointIndex)` to get the new anchorId. Then continue with `previewAnchorMove(anchorId, position)` for that move and subsequent moves.
- On `pointerup`: call `commitInteraction()`, `setDragging(false)`
- Preserve the existing drag-surface and snap-to-grid semantics used by anchor/control/zone dragging

### 3. Make zone endpoint handles interactive

In `map-editor-handle-renderer.ts`:
- Change zone endpoint handles from `eventMode: 'none'` to `eventMode: 'static'`
- Set `cursor: 'grab'`
- Add `hitArea = new Circle(0, 0, HANDLE_RADIUS)`
- Fill the circle (matching anchor endpoint style) to indicate interactivity
- Attach `attachZoneEndpointConvertDragHandlers()` instead of no handler
- While editing this renderer, make drag-handler cleanup ownership explicit for anchor/control/zone-endpoint handles instead of relying only on display-object teardown

## Files to Touch

- `packages/runner/src/map-editor/map-editor-store.ts` (modify)
- `packages/runner/src/map-editor/map-editor-drag.ts` (modify)
- `packages/runner/src/map-editor/map-editor-handle-renderer.ts` (modify)
- `packages/runner/test/map-editor/map-editor-store.test.ts` (modify)
- `packages/runner/test/map-editor/map-editor-drag.test.ts` (modify)
- `packages/runner/test/map-editor/map-editor-handle-renderer.test.ts` (modify)
- `packages/runner/test/map-editor/map-editor-export.test.ts` (modify, if needed to prove promoted endpoints export correctly)

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
5. Dragging a zone endpoint promotes it on first movement and commits as a single undoable interaction
6. Zone endpoint handles have `eventMode: 'static'`, non-null `hitArea`, and the same filled affordance as draggable anchor handles
7. If explicit drag-handler disposers are added in the renderer, rerendering or destroying the renderer releases them cleanly without leaving drag-surface listeners behind
8. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Existing anchor endpoints continue to work as before
2. Route geometry resolution works identically for the newly promoted anchor endpoint as it did for the original zone endpoint before movement (same initial position)
3. The exported visual-config.yaml contains the new anchor and updated route points through the existing `map-editor-export.ts` pipeline

## Test Plan

### New/Modified Tests

1. `packages/runner/test/map-editor/map-editor-store.test.ts` — test `convertEndpointToAnchor` for promotion, null return for non-zone points, uniqueness, and interaction-friendly state updates
2. `packages/runner/test/map-editor/map-editor-drag.test.ts` — verify zone endpoint drag promotes on first movement, then previews/commits anchor movement as one undoable interaction
3. `packages/runner/test/map-editor/map-editor-handle-renderer.test.ts` — verify zone endpoint handles are interactive, filled, and attach drag behavior on the injected drag surface
4. `packages/runner/test/map-editor/map-editor-export.test.ts` — prove promoted endpoints serialize as anchors if existing coverage does not already exercise that path

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner lint && pnpm -F @ludoforge/runner typecheck`

## Outcome

- Completion date: 2026-03-22
- What actually changed: added a store-level `convertEndpointToAnchor()` document transform, added zone-endpoint promotion drag handlers, made zone endpoint handles interactive and filled, and gave the handle renderer explicit interaction-disposer ownership. The renderer now defers geometry-handle rerenders during active drags so cleanup does not interrupt the drag lifecycle, then refreshes once dragging ends.
- Deviations from original plan: no new geometry or export module changes were needed. Existing `map-editor-route-geometry.ts` and `map-editor-export.ts` architecture remained intact, with test coverage extended instead. The cleanup hardening became more specific than originally described: disposer ownership is explicit, but rerenders are intentionally deferred during active drags to preserve a stable interaction.
- Verification results: `pnpm -F @ludoforge/runner test`, `pnpm -F @ludoforge/runner lint`, and `pnpm -F @ludoforge/runner typecheck` passed.
