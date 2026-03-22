# MAPEDIT-003: Filter connection zones from zone renderer and add route labels

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

Two related visual issues in the Map Editor:

1. **Floating text blocks**: Connection zones (roads, rivers, trails — shape `'connection'`) are rendered by the zone renderer as draggable rectangles with text labels. These appear as isolated, movable text tags (e.g., "Cam Ranh-Da Lat", "Saigon-Da Lat") disconnected from their route lines.

2. **Missing route labels**: The editor route renderer draws route curves but has no label rendering. In play-mode, `connection-route-renderer.ts` positions labels at route midpoints with rotation following the curve tangent.

Root cause: `map-editor-zone-renderer.ts` `indexZonesById()` includes ALL zones without filtering by shape. The route renderer's `indexConnectionZones()` filters FOR connection zones to draw curves, but never renders labels.

## Assumption Reassessment (2026-03-22)

1. `indexZonesById()` in `map-editor-zone-renderer.ts` confirmed: maps ALL zones from `gameDef.zones` — no shape filtering.
2. `indexConnectionZones()` in `map-editor-route-renderer.ts` lines 366-378 confirmed: filters for `shape === 'connection'` zones. These zones are rendered as curves but without labels.
3. Play-mode `connection-route-renderer.ts` label rendering confirmed: labels positioned at route midpoint, rotation prevents upside-down text via `UPSIDE_DOWN_MIN = PI/2` and `UPSIDE_DOWN_MAX = 3*PI/2`.
4. Route geometry `resolveRouteGeometry()` returns `sampledPath` and the editor route renderer already contains a polyline sampler helper (`resolvePolylinePointAtDistance()`) that can derive midpoint position and tangent without adding geometry state.
5. Reusable utilities confirmed: `createManagedBitmapText()`, `destroyManagedBitmapText()`, `STROKE_LABEL_FONT_NAME`, `formatIdAsDisplayName()`, `VisualConfigProvider.getZoneLabel()`.
6. Current editor route-slot structure differs from play-mode: `getContainerMap()` currently exposes the clickable `curve` graphics, not a midpoint/label container. If route labels are added, the cleaner architecture is to let a single route-owned midpoint container carry label presentation and be the exposed route container, matching play-mode ownership more closely.

## Architecture Check

1. Filtering connection zones from the zone renderer and rendering their labels in the route renderer follows the separation already established: the zone renderer handles non-connection zones, the route renderer handles connection zones. This completes the split that was partially implemented.
2. All changes are runner-only. Label text comes from `VisualConfigProvider.getZoneLabel()` which is game-agnostic.
3. No backwards-compatibility shims. Connection zones are cleanly excluded from one renderer and their labels added to another.
4. The route renderer should own route interaction and label presentation through one per-route midpoint container instead of exposing only the curve graphics and attaching label state elsewhere. That is a cleaner long-term boundary and mirrors the existing play-mode renderer pattern.

## What to Change

### 1. Filter connection zones out of zone renderer

In `map-editor-zone-renderer.ts`, modify `indexZonesById()` to accept `VisualConfigProvider` and skip zones where `resolveZoneVisual(zoneId, zone.category, zone.attributes).shape === 'connection'`. Update the call site in `createEditorZoneRenderer()` to pass the provider.

### 2. Add label rendering to editor route renderer

In `map-editor-route-renderer.ts`:

- Extend `RouteSlot` so each route owns:
  - the curve graphics
  - a midpoint container for route-owned interaction/presentation
  - a managed `BitmapText` label
- In `getOrCreateRouteSlot()`, create a midpoint container plus a `BitmapText` via `createManagedBitmapText()` with `STROKE_LABEL_FONT_NAME`, anchor `{x: 0.5, y: 0.5}`. Add the label under that midpoint container and add both curve + midpoint container to the route root.
- Update `routeContainers`/`getContainerMap()` to expose the midpoint container for each route rather than the raw curve graphics. The curve remains the drawn hit-target; the midpoint container becomes the route-owned presentation/selection container.
- In `syncRouteSlot()`, position the midpoint container at the midpoint of `geometry.sampledPath`. Compute tangent direction at midpoint. Set label rotation from tangent angle, flipping if in the upside-down range `[PI/2, 3*PI/2]`.
- Resolve label text via `visualConfigProvider.getZoneLabel(routeId) ?? formatIdAsDisplayName(routeId)`.
- Labels should be non-interactive (`eventMode: 'none'`) — they follow the route, not independently movable.
- Destroy managed bitmap text explicitly during renderer teardown/removal via `destroyManagedBitmapText()`.

### 3. Label rotation utility

Add or adapt a small label-rotation helper in the editor route renderer. Logic: derive angle from tangent via `atan2`, normalize it, then flip by `PI` when the label would otherwise render upside down. Do not create a shared cross-renderer utility unless the extracted code is actually reused in this change.

## Files to Touch

- `packages/runner/src/map-editor/map-editor-zone-renderer.ts` (modify)
- `packages/runner/src/map-editor/map-editor-route-renderer.ts` (modify)

## Out of Scope

- Making route labels editable or draggable
- Label collision avoidance
- Route curve styling changes
- Handle drag fixes (MAPEDIT-001)

## Acceptance Criteria

### Tests That Must Pass

1. Connection-shaped zones are excluded from the zone renderer's container map
2. Route slots include a visible midpoint-owned label positioned at the route midpoint
3. Labels are non-interactive (`eventMode: 'none'`)
4. Label text matches `getZoneLabel()` output or formatted zone ID
5. Route container map exposes the route-owned midpoint container instead of the raw curve graphics
6. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Non-connection zones continue to render as draggable zone containers
2. Route curves continue to render and respond to click/selection
3. Route labels do not create independent drag/select surfaces

## Test Plan

### New/Modified Tests

1. `packages/runner/test/map-editor/map-editor-zone-renderer.test.ts` — verify connection-shaped zones are excluded from renderer/container creation
2. `packages/runner/test/map-editor/map-editor-route-renderer.test.ts` — verify midpoint-owned route labels render at the midpoint, use the expected text fallback, and remain non-interactive
3. `packages/runner/test/map-editor/map-editor-route-renderer.test.ts` — verify `getContainerMap()` now exposes the midpoint container rather than the raw curve graphics

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner lint && pnpm -F @ludoforge/runner typecheck`

## Outcome

- Completion date: 2026-03-22
- What actually changed:
  - Connection-shaped zones are now filtered out of the editor zone renderer, so they no longer render as draggable zone blocks.
  - The editor route renderer now owns route labels through a midpoint container per route, with label text resolved from visual config or route ID fallback.
  - Route labels follow route midpoint/tangent geometry, stay non-interactive, and are cleaned up through managed bitmap-text teardown.
  - A small shared connection-zone predicate was extracted so the zone and route renderers agree on which zones are connection-owned.
- Deviations from original plan:
  - Instead of attaching a label directly under the route root while leaving `getContainerMap()` bound to raw curve graphics, the renderer now exposes the midpoint route container. This is cleaner, closer to play-mode ownership, and keeps route presentation in one place.
  - The label rotation helper remained local to the editor route renderer because the new logic is not yet reused elsewhere.
- Verification results:
  - Focused renderer coverage added/updated in `packages/runner/test/map-editor/map-editor-zone-renderer.test.ts` and `packages/runner/test/map-editor/map-editor-route-renderer.test.ts`.
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
