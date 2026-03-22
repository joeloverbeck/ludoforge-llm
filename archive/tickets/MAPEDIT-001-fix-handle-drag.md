# MAPEDIT-001: Fix handle drag for control points and anchor endpoints

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

In the Map Editor, diamond-shaped control point handles and filled-circle anchor endpoint handles are visible when a route is selected, but clicking and dragging them pans the viewport instead of moving the handle. This blocks all route curve editing.

Zone dragging works correctly because `MapEditorScreen.tsx` passes `canvas.viewport` as the drag surface. The handle renderer receives only `canvas.layers.handle` — drag event listeners (`globalpointermove`/`pointerup`) bind to the handle layer, which is too low in the display hierarchy for the viewport's `.drag()` plugin to respect `stopPropagation`. Additionally, handle Graphics objects lack explicit `hitArea`, relying on PixiJS auto-detection which can be unreliable for small shapes.

## Assumption Reassessment (2026-03-22)

1. `createEditorHandleRenderer()` is still defined as `(handleLayer: Container, store: MapEditorStoreApi)` in `packages/runner/src/map-editor/map-editor-handle-renderer.ts`. Unlike the zone renderer, it has no options object and no way to receive the viewport drag surface.
2. `MapEditorScreen.tsx` currently instantiates the handle renderer with only `canvas.layers.handle` and `store`, while `createEditorZoneRenderer()` already receives `{ dragSurface: canvas.viewport }`. The ticket should align handle drag wiring with that existing runner pattern instead of introducing a one-off API shape.
3. `attachAnchorDragHandlers()` and `attachControlPointDragHandlers()` are generic and correct in `map-editor-drag.ts`; the actual mismatch is only at the call sites inside `map-editor-handle-renderer.ts`, which currently pass `handleLayer` instead of the viewport drag surface.
4. Handle Graphics objects do not set explicit `hitArea`. That is a real robustness gap for small circular and diamond handles, even if it is not the primary root cause of the viewport-pan bug.
5. Existing tests already cover this area. `packages/runner/test/map-editor/map-editor-handle-renderer.test.ts` exercises rendered handles and drag behavior, and `packages/runner/test/map-editor/MapEditorScreen.test.tsx` asserts the renderer wiring. The original ticket understated the required test updates.

## Architecture Check

1. The beneficial architectural move is to make handle dragging use the same drag-surface injection pattern as zone dragging. That keeps drag orchestration consistent across editor interaction layers and avoids coupling drag semantics to a specific display layer.
2. The cleaner API is an options object, mirroring `createEditorZoneRenderer(...)`, not a bare third positional parameter. That keeps the renderer extensible if more interaction options are needed later.
3. Explicit `hitArea` on editor handles is still worthwhile after the drag-surface fix. It turns small-shape interactivity from implicit Pixi behavior into an explicit contract that tests can prove.
4. All changes remain runner-only. No engine, GameSpecDoc, or GameDef contract changes are involved.
5. No backwards-compatibility shims or aliases: the handle renderer API can change directly and every caller/test must be updated in the same change.

## What to Change

### 1. Accept drag surface options in handle renderer

In `map-editor-handle-renderer.ts`, change `createEditorHandleRenderer()` to accept an options object with `dragSurface?: Container`, defaulting to `handleLayer` when omitted. Forward the resolved drag surface to `attachAnchorDragHandlers()` and `attachControlPointDragHandlers()` instead of always using `handleLayer`.

### 2. Add explicit hitArea to handle Graphics

For endpoint circle handles (radius 8): set `hitArea` to a `Circle(0, 0, HANDLE_RADIUS)`.
For diamond control point handles (size 10): set `hitArea` to a `Polygon` matching the diamond vertices.

### 3. Pass viewport as drag surface from MapEditorScreen

In `MapEditorScreen.tsx`, instantiate the handle renderer with `{ dragSurface: canvas.viewport }`, matching the zone renderer’s integration pattern.

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
4. `MapEditorScreen` test coverage verifies the handle renderer is wired with `{ dragSurface: canvas.viewport }`
5. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Zone dragging continues to work unchanged
2. Route selection via click continues to work unchanged

## Test Plan

### New/Modified Tests

1. `packages/runner/test/map-editor/map-editor-handle-renderer.test.ts` — strengthen existing coverage to verify explicit hitArea assignment and that anchor dragging listens on the injected drag surface
2. `packages/runner/test/map-editor/MapEditorScreen.test.tsx` — update the existing renderer wiring assertion so the screen passes `{ dragSurface: canvas.viewport }`

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner lint && pnpm -F @ludoforge/runner typecheck`

## Outcome

- Completion date: 2026-03-22
- What actually changed: `createEditorHandleRenderer()` now follows the zone renderer pattern by accepting an options object with `dragSurface`, `MapEditorScreen` passes `canvas.viewport`, and route anchor/control handles now define explicit `Circle`/`Polygon` hit areas.
- Deviations from original plan: the core fix stayed the same, but the API shape was refined from a bare positional parameter to an options object so it matches existing editor renderer architecture. The test plan was also expanded to update existing `MapEditorScreen` wiring coverage instead of treating this as a renderer-only test addition.
- Verification results: `pnpm -F @ludoforge/runner test`, `pnpm -F @ludoforge/runner lint`, and `pnpm -F @ludoforge/runner typecheck` all passed.
