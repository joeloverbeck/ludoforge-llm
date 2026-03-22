# MAPEDIT-001: Fix handle drag for control points and anchor endpoints

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

In the Map Editor, diamond-shaped control point handles and filled-circle anchor endpoint handles are visible when a route is selected, but clicking and dragging them pans the viewport instead of moving the handle. This blocks all route curve editing.

Zone dragging works correctly because `MapEditorScreen.tsx` passes `canvas.viewport` as the drag surface. The handle renderer receives only `canvas.layers.handle` — drag event listeners (`globalpointermove`/`pointerup`) bind to the handle layer, which is too low in the display hierarchy for the viewport's `.drag()` plugin to respect `stopPropagation`. Additionally, handle Graphics objects lack explicit `hitArea`, relying on PixiJS auto-detection which can be unreliable for small shapes.

## Assumption Reassessment (2026-03-22)

1. `createEditorHandleRenderer()` signature confirmed: `(handleLayer: Container, store: MapEditorStoreApi)` — no drag surface parameter exists.
2. `MapEditorScreen.tsx` lines 135-138 confirmed: only `canvas.layers.handle` and `store` passed to handle renderer. Zone renderer (line 127) receives `{ dragSurface: canvas.viewport }`.
3. `attachAnchorDragHandlers()` and `attachControlPointDragHandlers()` in `map-editor-drag.ts` receive `handleLayer` as `dragSurface` parameter — confirmed as the mismatch causing viewport drag to intercept events.
4. Handle Graphics objects (lines 72-94 and 122-142 in `map-editor-handle-renderer.ts`) draw shapes but never set `hitArea`. Zone renderer sets `hitArea = new Rectangle(...)` at line 158.

## Architecture Check

1. Fix follows the existing pattern established by the zone renderer: pass `canvas.viewport` as drag surface, set explicit `hitArea`. No new abstractions or patterns introduced.
2. All changes are runner-only — no engine, GameSpecDoc, or GameDef changes. Visual editing stays in the runner layer.
3. No backwards-compatibility shims. The handle renderer gains a required parameter; callers are updated in the same change.

## What to Change

### 1. Accept drag surface parameter in handle renderer

In `map-editor-handle-renderer.ts`, add a `dragSurface: Container` parameter to `createEditorHandleRenderer()`. Forward it to `attachAnchorDragHandlers()` and `attachControlPointDragHandlers()` instead of `handleLayer`.

### 2. Add explicit hitArea to handle Graphics

For endpoint circle handles (radius 8): set `hitArea` to a `Circle(0, 0, HANDLE_RADIUS)`.
For diamond control point handles (size 10): set `hitArea` to a `Polygon` matching the diamond vertices.

### 3. Pass viewport as drag surface from MapEditorScreen

In `MapEditorScreen.tsx`, change `createEditorHandleRenderer(canvas.layers.handle, store)` to `createEditorHandleRenderer(canvas.layers.handle, store, { dragSurface: canvas.viewport })`.

## Files to Touch

- `packages/runner/src/map-editor/map-editor-handle-renderer.ts` (modify)
- `packages/runner/src/map-editor/MapEditorScreen.tsx` (modify)

## Out of Scope

- Zone endpoint dragging (MAPEDIT-004)
- Route label rendering (MAPEDIT-003)
- Adjacency lines (MAPEDIT-002)

## Acceptance Criteria

### Tests That Must Pass

1. Anchor endpoint handles have `eventMode: 'static'` and non-null `hitArea`
2. Control point diamond handles have `eventMode: 'static'` and non-null `hitArea`
3. Zone endpoint handles retain `eventMode: 'none'` (not yet draggable, deferred to MAPEDIT-004)
4. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Zone dragging continues to work unchanged
2. Route selection via click continues to work unchanged

## Test Plan

### New/Modified Tests

1. `packages/runner/test/map-editor/map-editor-handle-renderer.test.ts` — verify hitArea and eventMode for each handle type

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner lint && pnpm -F @ludoforge/runner typecheck`
