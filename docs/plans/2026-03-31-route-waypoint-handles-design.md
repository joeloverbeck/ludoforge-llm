# Route Waypoint Handle UX Design

## Context

The map editor recently gained vertex editing for polygonal zones: blue midpoint circles to add vertices (click), amber draggable handles to move vertices (drag), and double-click to remove vertices. This UX is intuitive and discoverable.

Route connectors (roads/rivers) already have store operations for adding/removing waypoints and moving control points, but the interactions are hidden: double-click on the curve to insert a waypoint, right-click on a waypoint handle to remove it, right-click on the curve to toggle straight/quadratic. These are undiscoverable and the right-click interactions are broken by the browser context menu.

This design brings route waypoint editing to the same visible, consistent UX as polygon vertex editing.

## Scope

- Add visible blue midpoint circles on route segments to add waypoints (click)
- Change waypoint removal from right-click to double-click on waypoint handles
- Remove hidden `wireRouteEditorInteractions` handlers entirely (both double-click-on-curve and right-click-to-toggle)
- Extract shared handle graphics into a reusable module
- Leave Bezier control point UX (white diamonds) unchanged
- Leave segment kind toggling (straight/quadratic) for future work

## Approach: Enhance EditorHandleRenderer

### 1. Shared Handle Graphics (`handle-graphics.ts`)

Extract visual primitives from `vertex-handle-renderer.ts` into `packages/runner/src/map-editor/handle-graphics.ts`:

- `createDraggableHandle(x, y)` — amber circle with hover glow effect
- `drawDraggableHandleState(g, hovered)` — hover state rendering
- `createMidpointHandle(x, y)` — blue circle (50% alpha, pointer cursor)
- Constants: `DOUBLE_CLICK_MS` (300), handle colors, radii

`vertex-handle-renderer.ts` imports these instead of defining them locally. No behavioral change.

### 2. EditorHandleRenderer Midpoint Circles

In `map-editor-handle-renderer.ts`, after the existing control point diamond loop, add a segment midpoint loop:

- For each segment in the resolved geometry:
  - **Straight**: midpoint = `((start.x + end.x) / 2, (start.y + end.y) / 2)`
  - **Quadratic**: midpoint = `quadraticBezierPoint(0.5, start, controlPoint, end)` (from `bezier-utils.ts`)
- Create `createMidpointHandle()` at each midpoint position
- On `pointerdown`: call `store.getState().insertWaypoint(routeId, segmentIndex, midpointPosition)`
- Handles rebuild automatically via the existing store subscription

### 3. Double-Click Waypoint Removal

In the anchor handle section of `map-editor-handle-renderer.ts`:

- Replace `removeWaypointOnRightClick` with double-click detection
- Use `Date.now()` time tracking with `DOUBLE_CLICK_MS` threshold (same pattern as `vertex-handle-renderer.ts`)
- Guard: only intermediate waypoints removable (not first/last endpoints)
- Single click within threshold starts drag; second click within threshold triggers removal

### 4. Remove Hidden Interactions

In `MapEditorScreen.tsx`, remove `wireRouteEditorInteractions` entirely:
- Remove the `onDoubleClick` handler (insert waypoint via click on curve)
- Remove the `onRightClick` handler (toggle segment kind — broken by browser context menu)
- Remove the function and its invocation in the effect

## Files Modified

| File | Change |
|------|--------|
| `packages/runner/src/map-editor/handle-graphics.ts` | **New** — shared handle visual primitives |
| `packages/runner/src/map-editor/vertex-handle-renderer.ts` | Import from `handle-graphics.ts` instead of local definitions |
| `packages/runner/src/map-editor/map-editor-handle-renderer.ts` | Add midpoint circles, change removal to double-click |
| `packages/runner/src/map-editor/MapEditorScreen.tsx` | Remove `wireRouteEditorInteractions` |

## Testing

| Test file | Coverage |
|-----------|----------|
| `handle-graphics.test.ts` | Shared graphics factory: position, event mode, hover handlers |
| `editor-handle-renderer-midpoints.test.ts` | Midpoint circles appear per segment, click inserts waypoint, correct positions for straight/quadratic, rebuild after insert, no handles when unselected |
| `editor-handle-renderer-removal.test.ts` | Double-click removes intermediate waypoint, endpoint guard, single click drags, timing threshold |
| Existing tests | Verify no regressions from right-click removal |

## Verification

1. `pnpm -F @ludoforge/runner test` — all tests pass
2. `pnpm -F @ludoforge/runner typecheck` — no type errors
3. `pnpm -F @ludoforge/runner lint` — no lint errors
4. Manual: select a route in the map editor, verify blue midpoint circles appear on each segment, click one to add a waypoint, double-click a waypoint to remove it
