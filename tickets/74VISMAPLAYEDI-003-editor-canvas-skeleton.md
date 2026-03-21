# 74VISMAPLAYEDI-003: Editor Canvas Skeleton with Viewport and Layer Structure

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: 74VISMAPLAYEDI-002

## Problem

The map editor needs a PixiJS canvas with pan/zoom viewport and a 4-layer structure (background, routes, zones, handles). This canvas skeleton is the foundation for all editor rendering and interaction.

## Assumption Reassessment (2026-03-21)

1. `setupViewport(config)` in `viewport-setup.ts` returns `{ viewport, worldLayers[], updateWorldBounds(), centerOnBounds(), destroy() }`. Confirmed.
2. `setupViewport` accepts a `ViewportConfig` with `stage`, `layers`, `screenWidth/Height`, `worldWidth/Height`, `events`, `minScale`, `maxScale`. Confirmed.
3. PixiJS `Application` is used throughout the runner canvas layer. Confirmed.
4. The game canvas uses `pixi-viewport` with drag/pinch/wheel/clampZoom plugins. Confirmed.

## Architecture Check

1. Reuses `setupViewport` from the existing canvas layer — no duplication of viewport logic.
2. Editor canvas is self-contained in `map-editor/` — does not modify existing canvas modules (Foundation 10).
3. Layer structure (4 layers) is editor-specific — the game canvas uses a different layer set optimized for game rendering.

## What to Change

### 1. Create editor canvas module

New file `packages/runner/src/map-editor/map-editor-canvas.ts`:

**`createEditorCanvas(container: HTMLElement, store: MapEditorStore)`**:
- Create PixiJS `Application` and append to container
- Create 4 `Container` layers: `backgroundLayer`, `routeLayer`, `zoneLayer`, `handleLayer`
- Call `setupViewport` with editor layers and appropriate world bounds (derived from zone positions in store)
- Return `EditorCanvas` object with:
  - `app: Application`
  - `viewport: Viewport`
  - `layers: { background, route, zone, handle }`
  - `resize(width, height)` — resize app and viewport
  - `centerOnContent()` — center viewport on zone bounds
  - `destroy()` — clean up all PixiJS resources

**World bounds computation**:
- Derive from `store.getState().zonePositions` — compute bounding box with padding
- Update on zone position changes (subscribe to store)

### 2. Create editor canvas types

Add to `map-editor-types.ts`:
- `EditorCanvas` interface
- `EditorLayerSet` interface: `{ background: Container; route: Container; zone: Container; handle: Container }`

## Files to Touch

- `packages/runner/src/map-editor/map-editor-canvas.ts` (new)
- `packages/runner/src/map-editor/map-editor-types.ts` (modify — add canvas types)

## Out of Scope

- Zone rendering (74VISMAPLAYEDI-004)
- Route rendering (74VISMAPLAYEDI-006)
- Handle rendering (74VISMAPLAYEDI-006)
- Drag interaction (74VISMAPLAYEDI-004, 007)
- Grid overlay (74VISMAPLAYEDI-011)
- MapEditorScreen React component (74VISMAPLAYEDI-005)
- Modifying `viewport-setup.ts` or any existing canvas modules

## Acceptance Criteria

### Tests That Must Pass

1. `createEditorCanvas` creates a PixiJS Application and 4 layers in correct z-order (background < route < zone < handle).
2. `destroy()` removes the canvas from the DOM and destroys the Application.
3. `resize(w, h)` updates the Application renderer and viewport screen dimensions.
4. World bounds are computed from zone positions with padding.
5. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. No modifications to `viewport-setup.ts` or any existing canvas module.
2. Editor canvas is self-contained — imports from existing modules but does not modify them.
3. All PixiJS resources are cleaned up in `destroy()` (no memory leaks).

## Test Plan

### New/Modified Tests

1. `packages/runner/test/map-editor/map-editor-canvas.test.ts` — canvas creation (mocked PixiJS), layer structure, destroy cleanup, resize behavior, world bounds computation

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`
