# 99MAPEDIREN-004: Wire game canvas renderers into map editor

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: None — runner-only
**Deps**: `specs/99-map-editor-renderer-unification.md`, `99MAPEDIREN-001` (polyline utils), `99MAPEDIREN-002` (aligned layers), `99MAPEDIREN-003` (presentation adapter)

## Problem

The map editor currently creates its own renderer instances (`createEditorZoneRenderer`, `createEditorAdjacencyRenderer`, `createEditorRouteRenderer`) that produce visually divergent output from the game canvas. With the adapter in place (003) and layers aligned (002), the editor must be rewired to instantiate game canvas renderers instead and feed them `PresentationScene` data from the adapter.

## Assumption Reassessment (2026-03-30)

1. Game canvas renderers are created via factory functions: `createZoneRenderer()`, `createAdjacencyRenderer()`, `createConnectionRouteRenderer()`, `createRegionBoundaryRenderer()`, `drawTableBackground()` — CONFIRMED.
2. Game canvas renderers need `ContainerPool` and `DisposalQueue` — CONFIRMED from `game-canvas-runtime.ts`.
3. `createZoneRenderer` accepts `bindSelection` callback for interaction hooks — CONFIRMED.
4. `createConnectionRouteRenderer` accepts `bindSelection` callback — CONFIRMED.
5. Editor-specific interactions (waypoint insert on double-click, segment type toggle on right-click) are currently in `map-editor-route-renderer.ts` — CONFIRMED. These must be re-attached as event listeners on route containers.
6. `getContainerMap()` is exposed by route renderer for container access — CONFIRMED.
7. `MapEditorScreen.tsx` orchestrates renderer creation and store subscriptions — CONFIRMED.

## Architecture Check

1. This is the core integration ticket — it replaces editor renderer creation with game canvas renderer creation + adapter wiring. Visual parity is guaranteed by construction (same code path).
2. No engine changes. Game canvas renderers are game-agnostic (Foundation 1). The editor feeds them `PresentationScene` the same way the game canvas does.
3. No backwards-compatibility shims. Editor renderers are replaced, not wrapped.

## What to Change

### 1. Update `MapEditorScreen.tsx` renderer initialization

Replace:
- `createEditorZoneRenderer(...)` → `createZoneRenderer(...)` with editor layer + adapter data
- `createEditorAdjacencyRenderer(...)` → `createAdjacencyRenderer(...)` with editor layer + adapter data
- `createEditorRouteRenderer(...)` → `createConnectionRouteRenderer(...)` with editor layer + adapter data

Add:
- `createRegionBoundaryRenderer(...)` — new for editor (region boundaries not previously rendered)
- `drawTableBackground(...)` — new for editor (table background not previously rendered)

### 2. Wire ContainerPool and DisposalQueue

Instantiate `ContainerPool` and `DisposalQueue` in editor canvas setup, similar to `createGameCanvasRuntime()`. Pass to renderers that require them.

### 3. Wire the adapter into the update loop

On editor store changes, call `buildEditorPresentationScene()` to produce a `PresentationScene`, then pass its fields to each renderer's `update()` method:
- `zoneRenderer.update(scene.zones, positions, provinceBorders)`
- `adjacencyRenderer.update(scene.adjacencies, positions, scene.zones)`
- `routeRenderer.update(scene.connectionRoutes, scene.junctions, positions)`
- `regionRenderer.update(scene.regions)`
- `drawTableBackground(container, config, bounds)`

### 4. Wire editor-specific interactions

- **Zone selection**: Pass editor store's zone selection callback as `bindSelection` to `createZoneRenderer`.
- **Route selection**: Pass editor store's route selection callback as `bindSelection` to `createConnectionRouteRenderer`.
- **Waypoint insertion** (double-click on route): Attach event listener on containers from `routeRenderer.getContainerMap()`.
- **Segment type conversion** (right-click): Attach event listener on containers from `routeRenderer.getContainerMap()`.

### 5. Compute province borders and table background

- Call `computeProvinceBorders()` with adapter zone data and positions, pass result to zone renderer.
- Call `drawTableBackground()` with `VisualConfigProvider.getTableBackground()` and bounds from editor positions.

### 6. Update `map-editor-canvas.ts`

Adjust `createEditorCanvas()` to initialize `ContainerPool`, `DisposalQueue`, and expose them alongside the layer set for renderer creation.

## Files to Touch

- `packages/runner/src/map-editor/MapEditorScreen.tsx` (modify — major: replace editor renderer creation with game canvas renderer creation + adapter wiring)
- `packages/runner/src/map-editor/map-editor-canvas.ts` (modify — add ContainerPool/DisposalQueue initialization)
- `packages/runner/test/map-editor/MapEditorScreen.test.tsx` (modify — update mocks for game canvas renderers instead of editor renderers)
- `packages/runner/test/map-editor/map-editor-canvas.test.ts` (modify — verify ContainerPool/DisposalQueue creation)

## Out of Scope

- Modifying game canvas renderers (they are NOT changed — only consumed)
- Modifying `PresentationScene` type
- Modifying game canvas `GameCanvas.tsx` or `game-canvas-runtime.ts`
- Modifying game canvas layer structure (`layers.ts`)
- Deleting the old editor renderers (that is 99MAPEDIREN-005 — they become dead code here)
- Editor-only overlay renderers (`vertex-handle-renderer.ts`, `map-editor-handle-renderer.ts`, grid renderer) — these remain unchanged
- Any engine package changes

## Acceptance Criteria

### Tests That Must Pass

1. `MapEditorScreen.test.tsx` — screen mounts without errors using game canvas renderers.
2. Zone selection in editor triggers the editor store's selection logic (not game canvas selection).
3. Route selection in editor triggers the editor store's route selection logic.
4. Editor renders all 7 base map features: table background, region boundaries, province zones, city zones, adjacency lines, connection routes, table overlays.
5. Editor-only overlays (vertex handles, control point handles, grid) still render on top of base map.
6. `map-editor-canvas.test.ts` — ContainerPool and DisposalQueue are created and available.
7. Province borders are computed and passed to zone renderer.
8. Existing game canvas tests are unchanged and still pass.
9. Existing suite: `pnpm -F @ludoforge/runner test`
10. Typecheck: `pnpm -F @ludoforge/runner typecheck`
11. Lint: `pnpm -F @ludoforge/runner lint`

### Invariants

1. Game canvas rendering pipeline (`GameCanvas.tsx` → `game-canvas-runtime.ts` → renderers) is NOT modified.
2. All game canvas renderer tests pass without modification.
3. Editor-specific overlay renderers (`vertex-handle-renderer.ts`, `map-editor-handle-renderer.ts`) are NOT modified.
4. `PresentationScene` type is NOT modified.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/map-editor/MapEditorScreen.test.tsx` — major update: mock game canvas renderers instead of editor renderers, verify adapter is called, verify renderer update() calls receive adapter output
2. `packages/runner/test/map-editor/map-editor-canvas.test.ts` — verify ContainerPool and DisposalQueue initialization

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose MapEditorScreen`
2. `pnpm -F @ludoforge/runner test -- --reporter=verbose map-editor-canvas`
3. `pnpm -F @ludoforge/runner test`
4. `pnpm -F @ludoforge/runner typecheck && pnpm -F @ludoforge/runner lint`
