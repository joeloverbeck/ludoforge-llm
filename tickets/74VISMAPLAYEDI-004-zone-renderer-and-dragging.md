# 74VISMAPLAYEDI-004: Editor Zone Renderer and Zone Dragging

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: 74VISMAPLAYEDI-002, 74VISMAPLAYEDI-003

## Problem

Zones must render on the editor canvas at their initial ForceAtlas2 positions (or fixed positions from visual config) and be draggable. When a zone is dragged, its position updates in the editor store, and connection routes that reference the zone re-render in real-time.

## Assumption Reassessment (2026-03-21)

1. `drawZoneShape(base, shape, dimensions, options)` in `shape-utils.ts` draws any zone shape. Confirmed.
2. `resolveVisualDimensions(visual, defaults)` resolves width/height. Confirmed.
3. `parseHexColor(color)` converts hex strings to PixiJS color numbers. Confirmed.
4. Zone shapes are: circle, rectangle, hexagon, diamond, ellipse, triangle, line, octagon, connection. Confirmed.
5. PixiJS drag pattern: `eventMode = 'static'`, `cursor = 'grab'`, `pointerdown` → `globalpointermove` → `pointerup`. Standard PixiJS 8 pattern.

## Architecture Check

1. Editor zone renderer is lightweight — uses `drawZoneShape` utilities but has simpler inputs than game zone renderer (no `PresentationZoneNode`, no animation state).
2. Drag commits to editor store on `pointerup`, triggering store-subscribed re-renders (immutable update, Foundation 7).
3. Game-agnostic — renders any game's zones (Foundation 1).

## What to Change

### 1. Create editor zone renderer

New file `packages/runner/src/map-editor/map-editor-zone-renderer.ts`:

**`createEditorZoneRenderer(zoneLayer: Container, store: MapEditorStore, visualConfigProvider: VisualConfigProvider)`**:
- For each zone in `store.getState().zonePositions`:
  - Create a `Container` at the zone's position
  - Draw zone shape using `drawZoneShape` with visual config resolved dimensions and colors
  - Add a `BitmapText` label with the zone's display name (or zoneId fallback)
  - Set `eventMode = 'static'`, `cursor = 'grab'`
  - Wire up drag listeners (see below)
- Subscribe to store `zonePositions` changes to update container positions
- Return renderer object with `destroy()` for cleanup

### 2. Create drag interaction module

New file `packages/runner/src/map-editor/map-editor-drag.ts`:

**Zone drag logic**:
- `pointerdown`: Record offset between pointer world position and container position, set `cursor = 'grabbing'`, set `store.setDragging(true)`
- `globalpointermove` (on viewport stage): Compute new position = pointer world position - offset, optionally snap to grid, update store `zonePositions` (live preview, no undo push)
- `pointerup` / `pointerupoutside`: Commit final position via `store.moveZone(zoneId, finalPosition)` (pushes to undo stack), set `cursor = 'grab'`, set `store.setDragging(false)`

**Snap-to-grid helper** (exported, pure function):
- `snapToGrid(position: Position, gridSize: number): Position` — rounds to nearest grid increment

### 3. Zone selection

- `pointerdown` on a zone sets `store.selectZone(zoneId)` and `store.selectRoute(null)`
- Selected zone gets a highlight outline (thicker border or glow)

## Files to Touch

- `packages/runner/src/map-editor/map-editor-zone-renderer.ts` (new)
- `packages/runner/src/map-editor/map-editor-drag.ts` (new)

## Out of Scope

- Connection route rendering (74VISMAPLAYEDI-006)
- Handle rendering and dragging (74VISMAPLAYEDI-006, 007)
- Waypoint operations (74VISMAPLAYEDI-007)
- Grid overlay rendering (74VISMAPLAYEDI-011)
- MapEditorScreen component (74VISMAPLAYEDI-005)
- Modifying `shape-utils.ts`, `zone-renderer.ts`, or any existing renderer

## Acceptance Criteria

### Tests That Must Pass

1. Zone renderer creates one container per zone in the store's `zonePositions` map.
2. Each zone container is positioned at the zone's coordinates from the store.
3. Zone labels display the zone's display name.
4. `snapToGrid({x: 17, y: 23}, 10)` returns `{x: 20, y: 20}`.
5. `snapToGrid({x: 5, y: 5}, 10)` returns `{x: 10, y: 10}` (or `{x: 0, y: 0}` depending on rounding — document chosen behavior).
6. After a simulated drag (pointerdown → pointermove → pointerup), the store's `zonePositions` has the new position.
7. Zone drag pushes exactly one undo entry (not one per pointermove frame).
8. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. No modification to `shape-utils.ts`, `zone-renderer.ts`, or any existing renderer module.
2. Drag commits produce immutable state updates (Foundation 7).
3. Zone renderer is game-agnostic — no game-specific rendering logic (Foundation 1).

## Test Plan

### New/Modified Tests

1. `packages/runner/test/map-editor/map-editor-zone-renderer.test.ts` — zone creation, label text, position from store, selection highlight
2. `packages/runner/test/map-editor/map-editor-drag.test.ts` — snap-to-grid math, drag lifecycle (undo entry count, final position)

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`
