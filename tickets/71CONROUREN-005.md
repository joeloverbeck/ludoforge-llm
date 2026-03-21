# 71CONROUREN-005: Pipeline Integration (Presentation Scene, Canvas Runtime, Canvas Updater)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: 71CONROUREN-003 (resolver), 71CONROUREN-004 (renderer)

## Problem

The connection-route resolver and renderer exist but are not wired into the rendering pipeline. The presentation scene must call the resolver to split zones into regular zones and connection routes, the canvas runtime must instantiate the renderer and create the connection-route layer, and the canvas updater must drive the renderer's update cycle and merge container maps so tokens on connection zones render at curve midpoints.

## Assumption Reassessment (2026-03-21)

1. `PresentationScene` interface currently has 5 fields: `zones`, `tokens`, `adjacencies`, `overlays`, `regions`. Must add `connectionRoutes` and `junctions`.
2. `buildPresentationScene()` returns the scene after filtering hidden zones, resolving tokens, adjacencies, and regions. The connection-route resolver call should happen after zone resolution and before region resolution (since regions operate on `filteredZones`).
3. Canvas layer order in `game-canvas-runtime.ts` is: background → region → zone → adjacency → tokenGroup → tableOverlay → effects. Per spec, connection-routes should go between adjacency and zone layers (Z-order: regions < adjacency < **connection-routes** < zones < tokens).
4. `canvas-updater.ts` calls `buildPresentationScene()` then updates each renderer in sequence. The connection-route renderer must be called after zone renderer and before token renderer (to populate the container map).
5. Token rendering: `deps.tokenRenderer.update(scene.tokens, deps.zoneRenderer.getContainerMap())` — the second argument is the container map. This must be extended to merge zone + connection-route container maps.
6. Pointer/selection handlers: `attachZoneSelectHandlers()` handles zone containers. Connection-route containers need the same treatment — either by extending `attachZoneSelectHandlers` or by calling it for connection-route containers too.

## Architecture Check

1. The integration is additive — existing renderers are unaffected. The connection-route renderer is a new optional renderer in the pipeline. Aligns with SOLID (Open/Closed).
2. Container map merging is a clean composition: `new Map([...zoneMap, ...connectionRouteMap])`. No special casing needed since zone IDs are unique across both maps.
3. No backwards-compat — new fields are added to `PresentationScene`, new renderer is added to the pipeline.

## What to Change

### 1. Extend `PresentationScene` interface

In `packages/runner/src/presentation/presentation-scene.ts`:
- Add `readonly connectionRoutes: readonly ConnectionRouteNode[]` to `PresentationScene`
- Add `readonly junctions: readonly JunctionNode[]` to `PresentationScene`

### 2. Wire resolver into `buildPresentationScene()`

In `buildPresentationScene()`, after zone nodes are resolved and before region resolution:
```typescript
const connectionResolution = resolveConnectionRoutes(zones, adjacencies, options.positions);
```

Use `connectionResolution.filteredZones` for region resolution and the returned scene's `zones` field.
Use `connectionResolution.filteredAdjacencies` for the scene's `adjacencies` field.
Add `connectionRoutes` and `junctions` from the resolution to the scene.

### 3. Add connection-route layer to `game-canvas-runtime.ts`

In `createGameCanvasRuntime()`:
1. Create `connectionRouteLayer` container, inserted between `adjacencyLayer` and `zoneLayer` in the layer hierarchy
2. Instantiate `createConnectionRouteRenderer({ parentContainer: connectionRouteLayer, ... })`
3. Pass the renderer to `createCanvasUpdater()` via deps
4. Add `connectionRouteRenderer.destroy()` to the destroy chain
5. Attach pointer/selection handlers for connection-route containers (same pattern as zone containers)

### 4. Wire renderer into `canvas-updater.ts`

In `CanvasUpdaterDeps`, add optional `connectionRouteRenderer?: ConnectionRouteRenderer`.

In `applySnapshot()`:
```typescript
deps.connectionRouteRenderer?.update(
  scene.connectionRoutes,
  scene.junctions,
  latestRuntimeLayoutSnapshot.positions,
  deps.visualConfigProvider,
);

const allContainers = new Map([
  ...deps.zoneRenderer.getContainerMap(),
  ...(deps.connectionRouteRenderer?.getContainerMap() ?? []),
]);
deps.tokenRenderer.update(scene.tokens, allContainers);
```

### 5. Update `presentation-scene.test.ts`

Add test cases for the new `connectionRoutes` and `junctions` fields in the scene.

## Files to Touch

- `packages/runner/src/presentation/presentation-scene.ts` (modify — add fields, wire resolver)
- `packages/runner/src/canvas/game-canvas-runtime.ts` (modify — add layer, instantiate renderer, wire handlers)
- `packages/runner/src/canvas/canvas-updater.ts` (modify — add renderer dep, merge container maps)
- `packages/runner/src/canvas/create-app.ts` (modify — add `connectionRouteLayer` to layers interface, if layer creation happens here)
- `packages/runner/test/presentation/presentation-scene.test.ts` (modify — add connection route assertions)
- `packages/runner/test/canvas/canvas-updater.test.ts` (modify — add connection route renderer mock to deps)

## Out of Scope

- Bézier math (71CONROUREN-001)
- Visual config schema changes (71CONROUREN-002)
- Resolver logic (71CONROUREN-003)
- Renderer drawing logic (71CONROUREN-004)
- FITL visual-config.yaml migration (71CONROUREN-006)
- Tangent-perpendicular token fanning (follow-up)
- Animated river flow (follow-up)

## Acceptance Criteria

### Tests That Must Pass

1. `buildPresentationScene()` returns a scene with `connectionRoutes` array (empty when no connection zones exist)
2. `buildPresentationScene()` returns a scene with `junctions` array
3. When connection zones are present, `scene.zones` excludes them (they appear only in `scene.connectionRoutes`)
4. When connection zones are present, `scene.adjacencies` excludes endpoint pairs involving connection zones
5. `canvas-updater` calls `connectionRouteRenderer.update()` during `applySnapshot()`
6. Token renderer receives merged container map including connection-route zone containers
7. Existing zone-renderer tests pass without modification (connection zones are filtered upstream)
8. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. `PresentationScene` is additive — existing fields (`zones`, `tokens`, `adjacencies`, `overlays`, `regions`) retain their contracts
2. When no connection zones exist (e.g., Texas Hold'em), `connectionRoutes` is `[]` and `junctions` is `[]` — zero overhead
3. Container map merge produces unique keys (zone IDs are unique across regular and connection zones)
4. Canvas layer order is respected: regions < adjacency < connection-routes < zones < tokens
5. No engine/kernel changes

## Test Plan

### New/Modified Tests

1. `packages/runner/test/presentation/presentation-scene.test.ts` — connection zones filtered from `zones`, appear in `connectionRoutes`; endpoint adjacencies filtered; junctions detected
2. `packages/runner/test/canvas/canvas-updater.test.ts` — connection route renderer receives update calls; container map merge works

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner lint`
