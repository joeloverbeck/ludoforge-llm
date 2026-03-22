# 74VISMAPLAYEDI-011: Grid Overlay, Selection Highlighting, and Polish

**Status**: COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: 74VISMAPLAYEDI-003, 74VISMAPLAYEDI-004, 74VISMAPLAYEDI-006, 74VISMAPLAYEDI-008

## Problem

The editor still lacks a few final polish behaviors: a rendered grid overlay for alignment reference, route selection highlighting that reacts to editor selection state, a coordinate readout display, and a browser-level dirty-state warning when navigating away with unsaved changes.

## Assumption Reassessment (2026-03-22)

1. Editor store already has `showGrid`, `gridSize`, `dirty`, `selectedZoneId`, and `selectedRouteId`, plus the toolbar-facing actions that operate on them. Confirmed in `packages/runner/src/map-editor/map-editor-store.ts`.
2. The editor canvas already exposes a dedicated background container mounted under the shared background layer, so grid rendering belongs there instead of being folded into zone or route renderers. Confirmed in `packages/runner/src/map-editor/map-editor-canvas.ts`.
3. Toolbar work previously planned here is already implemented: grid toggle, grid-size control, snap toggle, dirty indicator, and dirty-confirm-on-back already exist in `packages/runner/src/map-editor/map-editor-toolbar.tsx`.
4. Zone selection highlighting is already implemented in `packages/runner/src/map-editor/map-editor-zone-renderer.ts`; route selection highlighting is not.
5. No store field currently represents a selected anchor/control point. A coordinate readout can reliably show pointer world coordinates and the selected zone position, but not a distinct "selected anchor" position without broadening selection architecture.
6. `beforeunload` remains the correct browser API for tab-close / reload warnings, but it should be attached at the screen composition root and keyed off actual dirty-state transitions.

## Architecture Check

1. Grid overlay is a pure rendering concern. It should live in a dedicated grid renderer that draws into the existing background layer and re-renders from viewport movement plus grid state changes.
2. Route selection highlighting is also a pure rendering concern. It should extend the existing route renderer instead of introducing parallel selection state or new editor actions.
3. All visual polish is game-agnostic (Foundation 1).
4. Coordinate readout is ephemeral UI state. It should not be persisted in the editor store; `MapEditorScreen` can own the current pointer readout and pass it into the toolbar.
5. Dirty-state navigation warning must layer on top of the existing session-navigation callback flow from `74VISMAPLAYEDI-005` and `74VISMAPLAYEDI-008`, not replace it with router- or URL-driven behavior.
6. This ticket extends already-composed editor runtime pieces. `MapEditorScreen` remains the composition root; canvas/renderers stay narrowly scoped and do not absorb toolbar or session responsibilities.

## What to Change

### 1. Grid overlay renderer

Add a dedicated grid renderer, composed from `packages/runner/src/map-editor/map-editor-canvas.ts`:

- Preferred file: `packages/runner/src/map-editor/map-editor-grid-renderer.ts`
- Draw vertical and horizontal lines in world space at `gridSize` intervals
- Cover the currently visible viewport bounds, not the full world bounds
- Styling: thin lines, low alpha, neutral color
- Re-draw on viewport move/zoom and on `showGrid` / `gridSize` changes
- Show/hide based on `store.showGrid`

### 2. Selection highlighting

Modify route renderer (`map-editor-route-renderer.ts`):
- Subscribe to `selectedRouteId` changes as well as geometry changes
- When `selectedRouteId` matches a route, render it with explicit selected styling
- When selection changes, revert previous routes to the default resolved route style

Zone renderer changes are out of scope unless needed to keep existing tests truthful; zone highlighting is already present.

### 3. Coordinate readout

- Add a small coordinate display in the toolbar:
- Show current pointer world coordinates `(x, y)` while the pointer is over the canvas
- Fall back to the selected zone position when a zone is selected and no pointer position is active
- Do not introduce persistent store state for pointer coordinates
- Do not broaden editor selection architecture to add "selected anchor" just for this display

### 4. Dirty-state navigation warning

In `MapEditorScreen.tsx`:
- Register a `beforeunload` handler when `dirty === true` that shows the browser's default "unsaved changes" prompt
- The "Back" button already shows a confirmation (from 74VISMAPLAYEDI-008) — verify this works with `window.confirm()`
- Clean up `beforeunload` handler on unmount

## Files to Touch

- `packages/runner/src/map-editor/map-editor-canvas.ts` (modify — compose grid renderer and pointer callbacks)
- `packages/runner/src/map-editor/map-editor-grid-renderer.ts` (new — viewport-aware grid rendering)
- `packages/runner/src/map-editor/map-editor-route-renderer.ts` (modify — selection highlight)
- `packages/runner/src/map-editor/map-editor-toolbar.tsx` (modify — coordinate readout)
- `packages/runner/src/map-editor/MapEditorScreen.tsx` (modify — beforeunload handler)

## Out of Scope

- Background image/map underlay (spec non-goal)
- Visual regression testing (spec non-goal)
- Multi-user editing (spec non-goal)
- Adding anchor/control-point selection state purely for the coordinate readout
- Reworking the existing toolbar dirty-confirm-on-back flow
- Any engine changes

## Acceptance Criteria

### Tests That Must Pass

1. Grid renderer draws lines at `gridSize` intervals when `showGrid === true`.
2. Grid renderer draws nothing when `showGrid === false`.
3. Grid renderer updates when `gridSize` changes and when the viewport moves.
4. Selected route has a visible highlight distinct from the default route style.
5. Deselecting a route removes that highlight.
6. Coordinate readout shows pointer world coordinates while hovering the canvas.
7. Coordinate readout falls back to the selected zone position when no live pointer coordinate is available.
8. `beforeunload` handler is registered when `dirty === true`.
9. `beforeunload` handler is removed when `dirty === false` or on unmount.
10. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Grid overlay does not affect zone/route positions or store state — purely visual.
2. Route selection highlighting does not modify store state — reads `selectedRouteId` only.
3. Coordinate readout does not introduce persisted store state for transient pointer positions.
4. `beforeunload` handler is always cleaned up on unmount (no memory leaks).
5. Polish work does not move bootstrap, store creation, or editor-wide assembly out of `MapEditorScreen`.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/map-editor/map-editor-grid-renderer.test.ts` — grid line placement, show/hide toggle, viewport re-render behavior
2. `packages/runner/test/map-editor/map-editor-route-renderer.test.ts` — selected-route highlight and highlight removal
3. `packages/runner/test/map-editor/MapEditorScreen.test.tsx` — coordinate readout behavior and `beforeunload` registration/cleanup
4. `packages/runner/test/map-editor/map-editor-toolbar.test.tsx` — coordinate readout rendering

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-22
- What changed:
  - Added a dedicated viewport-aware grid renderer and composed it from `map-editor-canvas.ts`
  - Added route selection highlight styling that re-renders on `selectedRouteId` changes
  - Added toolbar coordinate readout driven by live canvas pointer coordinates with selected-zone fallback
  - Added `beforeunload` registration and cleanup in `MapEditorScreen.tsx` keyed to dirty-state transitions
  - Corrected the ticket assumptions before implementation to reflect already-shipped toolbar controls and zone highlighting
- Deviations from original plan:
  - Zone selection highlighting was not reimplemented because it already existed and tested cleanly
  - Coordinate readout was intentionally scoped to pointer position plus selected-zone fallback; no new anchor-selection architecture was introduced
  - Grid rendering was implemented as a dedicated renderer rather than folded into `map-editor-canvas.ts`
- Verification results:
  - `pnpm -F @ludoforge/runner test` passed
  - `pnpm -F @ludoforge/runner typecheck` passed
  - `pnpm turbo lint` passed
