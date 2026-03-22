# MAPEDIT-003: Filter connection zones from zone renderer and add route labels

**Status**: PENDING
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
4. Route geometry `resolveRouteGeometry()` returns `sampledPath` — midpoint and tangent can be derived from this polyline.
5. Reusable utilities confirmed: `createManagedBitmapText()`, `STROKE_LABEL_FONT_NAME`, `formatIdAsDisplayName()`, `VisualConfigProvider.getZoneLabel()`.

## Architecture Check

1. Filtering connection zones from the zone renderer and rendering their labels in the route renderer follows the separation already established: the zone renderer handles non-connection zones, the route renderer handles connection zones. This completes the split that was partially implemented.
2. All changes are runner-only. Label text comes from `VisualConfigProvider.getZoneLabel()` which is game-agnostic.
3. No backwards-compatibility shims. Connection zones are cleanly excluded from one renderer and their labels added to another.

## What to Change

### 1. Filter connection zones out of zone renderer

In `map-editor-zone-renderer.ts`, modify `indexZonesById()` to accept `VisualConfigProvider` and skip zones where `resolveZoneVisual(zoneId, zone.category, zone.attributes).shape === 'connection'`. Update the call site in `createEditorZoneRenderer()` to pass the provider.

### 2. Add label rendering to editor route renderer

In `map-editor-route-renderer.ts`:

- Add `label: BitmapText` to the `RouteSlot` interface.
- In `getOrCreateRouteSlot()`, create a `BitmapText` via `createManagedBitmapText()` with `STROKE_LABEL_FONT_NAME`, anchor `{x: 0.5, y: 0.5}`. Add as child of the route's `root` container.
- In `syncRouteSlot()`, position the label at the midpoint of `geometry.sampledPath`. Compute tangent direction at midpoint. Set label rotation from tangent angle, flipping if in the upside-down range `[PI/2, 3*PI/2]`.
- Resolve label text via `visualConfigProvider.getZoneLabel(routeId) ?? formatIdAsDisplayName(routeId)`.
- Labels should be non-interactive (`eventMode: 'none'`) — they follow the route, not independently movable.

### 3. Label rotation utility

Extract a `resolveLabelRotation(tangent: Position): number` function (either inline in the route renderer or in a shared utility). Logic: `atan2(tangent.y, tangent.x)`, flip by `PI` if angle is in upside-down range.

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
2. Route slots include a visible label child positioned at the route midpoint
3. Labels are non-interactive (`eventMode: 'none'`)
4. Label text matches `getZoneLabel()` output or formatted zone ID
5. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Non-connection zones continue to render as draggable zone containers
2. Route curves continue to render and respond to click/selection

## Test Plan

### New/Modified Tests

1. `packages/runner/test/map-editor/map-editor-zone-renderer.test.ts` — verify connection-shaped zones excluded from container map
2. `packages/runner/test/map-editor/map-editor-route-renderer.test.ts` — verify route slots include label child at midpoint

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner lint && pnpm -F @ludoforge/runner typecheck`
