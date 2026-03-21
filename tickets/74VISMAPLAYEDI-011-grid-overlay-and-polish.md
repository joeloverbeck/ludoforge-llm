# 74VISMAPLAYEDI-011: Grid Overlay, Selection Highlighting, and Polish

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: 74VISMAPLAYEDI-003, 74VISMAPLAYEDI-004, 74VISMAPLAYEDI-006, 74VISMAPLAYEDI-008

## Problem

The editor needs visual polish: a grid overlay for alignment reference, visual highlighting for selected zones/routes, a coordinate readout display, and a dirty-state warning when navigating away with unsaved changes.

## Assumption Reassessment (2026-03-21)

1. Editor store has `showGrid`, `gridSize`, `dirty`, `selectedZoneId`, `selectedRouteId` state fields. Confirmed by 74VISMAPLAYEDI-002 design.
2. Editor canvas has a `backgroundLayer` (lowest z-order) for grid rendering. Confirmed by 74VISMAPLAYEDI-003 design.
3. Toolbar already has grid toggle and dirty indicator. Confirmed by 74VISMAPLAYEDI-008 design.
4. `beforeunload` event can warn users about unsaved changes. Standard browser API.

## Architecture Check

1. Grid overlay is a pure rendering concern — draws lines on the background layer based on `gridSize`.
2. Selection highlighting modifies zone/route visual state (glow, outline thickness) — no store changes needed beyond existing `selectedZoneId`/`selectedRouteId`.
3. All visual polish is game-agnostic (Foundation 1).
4. Dirty-state navigation warning must layer on top of the existing session-navigation callback flow from `74VISMAPLAYEDI-005` and `74VISMAPLAYEDI-008`, not replace it with router- or URL-driven behavior.

## What to Change

### 1. Grid overlay renderer

Add grid rendering to `packages/runner/src/map-editor/map-editor-canvas.ts` (or a new `map-editor-grid-renderer.ts`):

- Draw vertical and horizontal lines on `backgroundLayer` at `gridSize` intervals
- Lines cover the visible world area (viewport bounds)
- Styling: thin lines (1px), low alpha (0.15), neutral color
- Re-draw on viewport move/zoom (subscribe to viewport events)
- Show/hide based on `store.showGrid`

### 2. Selection highlighting

Modify zone renderer (`map-editor-zone-renderer.ts`):
- When `selectedZoneId` matches a zone, draw a highlight outline (thicker border, accent color, or glow filter)
- When selection changes, remove highlight from previous zone, add to new

Modify route renderer (`map-editor-route-renderer.ts`):
- When `selectedRouteId` matches a route, render the route with accent color and/or increased line width
- When selection changes, revert previous route to default style

### 3. Coordinate readout

Add a small coordinate display in the toolbar or as a canvas overlay:
- Shows the current pointer world coordinates (x, y) as the user moves the mouse
- Shows the position of the selected zone or anchor if one is selected

### 4. Dirty-state navigation warning

In `MapEditorScreen.tsx`:
- Register a `beforeunload` handler when `dirty === true` that shows the browser's default "unsaved changes" prompt
- The "Back" button already shows a confirmation (from 74VISMAPLAYEDI-008) — verify this works with `window.confirm()`
- Clean up `beforeunload` handler on unmount

## Files to Touch

- `packages/runner/src/map-editor/map-editor-canvas.ts` (modify — grid rendering) or `packages/runner/src/map-editor/map-editor-grid-renderer.ts` (new)
- `packages/runner/src/map-editor/map-editor-zone-renderer.ts` (modify — selection highlight)
- `packages/runner/src/map-editor/map-editor-route-renderer.ts` (modify — selection highlight)
- `packages/runner/src/map-editor/map-editor-toolbar.tsx` (modify — coordinate readout)
- `packages/runner/src/map-editor/MapEditorScreen.tsx` (modify — beforeunload handler)

## Out of Scope

- Background image/map underlay (spec non-goal)
- Visual regression testing (spec non-goal)
- Multi-user editing (spec non-goal)
- Any new editor store actions (all needed state already exists)
- Any engine changes

## Acceptance Criteria

### Tests That Must Pass

1. Grid renderer draws lines at `gridSize` intervals when `showGrid === true`.
2. Grid renderer draws nothing when `showGrid === false`.
3. Grid renderer updates when `gridSize` changes.
4. Selected zone has a visible highlight (different visual state than unselected zones).
5. Deselecting a zone removes the highlight.
6. Selected route has a visible highlight (accent color or increased width).
7. `beforeunload` handler is registered when `dirty === true`.
8. `beforeunload` handler is removed when `dirty === false` or on unmount.
9. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Grid overlay does not affect zone/route positions or store state — purely visual.
2. Selection highlighting does not modify store state — reads `selectedZoneId`/`selectedRouteId` only.
3. `beforeunload` handler is always cleaned up on unmount (no memory leaks).

## Test Plan

### New/Modified Tests

1. `packages/runner/test/map-editor/map-editor-grid-renderer.test.ts` — grid line count at given gridSize and world bounds, show/hide toggle
2. `packages/runner/test/map-editor/map-editor-zone-renderer.test.ts` — add selection highlight tests
3. `packages/runner/test/map-editor/map-editor-route-renderer.test.ts` — add selection highlight tests
4. `packages/runner/test/map-editor/MapEditorScreen.test.tsx` — beforeunload registration/cleanup

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm turbo lint`
