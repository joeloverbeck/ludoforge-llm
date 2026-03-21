# 71CONROUREN-004: Connection-Route Renderer

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: archive/tickets/71CONROUREN/71CONROUREN-001.md, archive/tickets/71CONROUREN-002.md, archive/tickets/71CONROUREN/71CONROUREN-003.md

## Problem

Connection-route zones need a dedicated PixiJS renderer that draws quadratic Bézier curves between endpoint positions, renders labels along the curve tangent, manages hit areas for pointer interaction, positions midpoint containers for token attachment, and renders junction dots where connections meet. This is the visual heart of the connection-route feature.

## Assumption Reassessment (2026-03-21)

1. `packages/runner/src/presentation/connection-route-resolver.ts` and `packages/runner/test/presentation/connection-route-resolver.test.ts` already exist and cover route endpoint resolution, touching-zone preservation, adjacency filtering, and junction derivation. This ticket must reuse that projection work rather than recreate it.
2. `packages/runner/src/canvas/geometry/bezier-utils.ts` and `packages/runner/test/canvas/geometry/bezier-utils.test.ts` already exist. The renderer must build on these helpers rather than introducing duplicate curve math.
3. Existing renderers do share a stable contract shape, but stable dependencies are injected at construction time, not passed through `update()`. `AdjacencyRenderer` already receives `VisualConfigProvider` in its factory. The connection-route renderer should follow that pattern.
4. `renderer-types.ts` is the canonical place for renderer contracts. A new `ConnectionRouteRenderer` interface belongs there, and `canvas-updater` / `game-canvas-runtime` must be extended to wire it in.
5. Label rendering already uses the managed BitmapText runtime (`createManagedBitmapText` / `destroyManagedBitmapText`). The connection-route renderer should reuse that runtime rather than introduce ad hoc Pixi text lifecycle management.
6. The current canvas layer stack has `adjacencyLayer` and `zoneLayer` but no dedicated connection-route layer. This ticket must define one so curved routes can replace filtered adjacency lines without being forced into the ordinary zone renderer layer.
7. `PresentationZoneNode` currently carries enough stroke state to render selection/highlight treatment generically. Connection routes should derive interaction styling from the route's underlying `zone.render.stroke` rather than hardcoding special-case colors in the renderer.

## Architecture Check

1. Follows the established renderer pattern — factory function returning an interface with `update()`, `getContainerMap()`, `destroy()`. Aligns with existing architecture.
2. No game-specific logic in the renderer. Curve drawing, wavy lines, and junction dots are driven entirely by `ConnectionStyleConfig` from visual config. Aligns with F1 and F3.
3. No backwards-compat — entirely new renderer.
4. The renderer must not re-run raw config matching. It should consume `route.connectionStyleKey` from the resolved presentation data and resolve the named `ConnectionStyleConfig` through an injected `VisualConfigProvider`.
5. Clean architecture requires the connection-route path to be first-class in the scene/update pipeline. An isolated renderer file with no scene/runtime/updater integration is not a durable design and is therefore out of bounds for this ticket revision.

## What to Change

### 1. Add `ConnectionRouteRenderer` interface to `renderer-types.ts`

In `packages/runner/src/canvas/renderers/renderer-types.ts`, add:

```typescript
export interface ConnectionRouteRenderer {
  update(
    routes: readonly ConnectionRouteNode[],
    junctions: readonly JunctionNode[],
    positions: ReadonlyMap<string, Position>,
  ): void;
  getContainerMap(): ReadonlyMap<string, Container>;
  destroy(): void;
}
```

### 2. Create `connection-route-renderer.ts`

New file at `packages/runner/src/canvas/renderers/connection-route-renderer.ts`.

**Factory:**
```typescript
export function createConnectionRouteRenderer(
  parentContainer: Container,
  visualConfigProvider: VisualConfigProvider,
  options?: ConnectionRouteRendererOptions,
): ConnectionRouteRenderer;
```

**Options:** `parentContainer`, `junctionRadius` (default 6), `defaultCurvature` (default 30), `hitAreaPadding` (default 12), `curveSegments` (default 24), `wavySegments` (default 32).

**Per-connection rendering:**
1. Look up endpoint positions from layout position map
2. Resolve the route style from `route.connectionStyleKey` via the injected `visualConfigProvider.resolveConnectionStyle()`. Do not inspect raw zone attributes or re-run attribute-rule logic in the renderer.
3. Compute control point via `computeControlPoint()` (from bezier-utils). If two connections share endpoints, offset curvatures in opposite directions
4. Draw curve:
   - Non-wavy (highway): `graphics.moveTo(p0).quadraticCurveTo(cp.x, cp.y, p2.x, p2.y).stroke(style)`
   - Wavy (mekong): sample points along Bézier, apply sine-wave perpendicular displacement, draw as polyline
5. Hit area: generate polygon via `approximateBezierHitPolygon()`, assign as `container.hitArea`
6. Midpoint container: invisible `Container` at curve midpoint for token attachment
7. Label: managed `BitmapText` at midpoint, rotated to match tangent angle (flip if upside-down)
8. Selection/highlight strokes: derive from `route.zone.render.stroke`, with the resolved connection style supplying the base width/color/alpha

**Junction rendering:** filled circle at junction position, colored as average of connecting curves' stroke colors.

**Container map:** `getContainerMap()` returns `Map<zoneId, Container>` for all connection-route zones (the midpoint containers).

**Destroy:** remove all graphics, containers, labels, junction dots via the existing safe-destroy helpers.

### 3. Integrate the renderer into the canvas pipeline

This ticket includes the minimum first-class integration needed to make the new architecture real:

1. Extend `PresentationScene` / `buildPresentationScene()` to expose resolved `connectionRoutes` and `junctions`, and to filter ordinary zones/adjacencies through `resolveConnectionRoutes()`.
2. Extend `CanvasUpdaterDeps` so it accepts a `connectionRouteRenderer`, updates it before tokens, and merges `zoneRenderer.getContainerMap()` with `connectionRouteRenderer.getContainerMap()` when passing zone containers to `TokenRenderer`.
3. Extend `GameCanvasRuntimeDeps` and runtime construction to create/destroy the new renderer.
4. Add a dedicated canvas layer for connection routes, ordered between `adjacencyLayer` and `zoneLayer`.

This replaces the older assumption that all pipeline wiring belonged to `71CONROUREN-005`. That split no longer matches the codebase: without this minimal integration, the renderer would be dead code and connection-zone tokens would have no stable attachment containers.

### 4. Create `connection-route-renderer.test.ts`

New test file at `packages/runner/test/canvas/renderers/connection-route-renderer.test.ts`.

Testing approach: mock PixiJS `Container` and `Graphics` (following patterns from existing renderer tests), verify:
- Correct number of children created per connection route
- Midpoint containers positioned correctly
- `getContainerMap()` returns entries for all connection zone IDs
- `destroy()` removes all children from parent container
- Missing endpoint positions hide or skip the affected route safely
- Style fallback behavior is deterministic when `connectionStyleKey` is `null` or unresolved

### 5. Strengthen integration tests around the updater boundary

Update existing canvas-updater tests so they prove:
- `buildPresentationScene()` routes connection-shaped zones through `connectionRoutes` / `junctions` and removes resolved routes from ordinary zones/adjacencies
- `CanvasUpdater` calls the connection-route renderer with resolved route data
- `CanvasUpdater` passes a merged container map to `TokenRenderer` so tokens on connection zones attach to midpoint containers

## Files to Touch

- `packages/runner/src/canvas/renderers/renderer-types.ts` (modify — add `ConnectionRouteRenderer` interface)
- `packages/runner/src/canvas/renderers/connection-route-renderer.ts` (new)
- `packages/runner/src/canvas/canvas-updater.ts` (modify — integrate connection-route scene/render/update flow)
- `packages/runner/src/canvas/game-canvas-runtime.ts` (modify — create/wire renderer)
- `packages/runner/src/canvas/layers.ts` (modify — add dedicated connection-route layer)
- `packages/runner/src/presentation/presentation-scene.ts` (modify — expose resolved connection-route scene data)
- `packages/runner/test/canvas/renderers/connection-route-renderer.test.ts` (new)
- `packages/runner/test/canvas/canvas-updater.test.ts` (modify — integration coverage)
- `packages/runner/test/canvas/renderers/renderer-types.test.ts` (modify — contract coverage)

## Out of Scope

- Pointer/selection handler attachment for route containers beyond token attachment. The route layer should be non-interactive in this ticket unless existing selection plumbing is needed for tests already in scope.
- FITL visual-config.yaml changes — that's 71CONROUREN-006
- Animated river flow (follow-up enhancement — this ticket renders static wavy lines)
- Tangent-perpendicular token fanning (follow-up)
- Curvature auto-adjustment for overlapping connections (follow-up)
- Resolver changes, unless implementation reveals a concrete bug or missing invariant that must be covered by tests

## Acceptance Criteria

### Tests That Must Pass

1. `createConnectionRouteRenderer()` returns an object with `update`, `getContainerMap`, `destroy` methods
2. After `update()` with 2 connection routes, `getContainerMap()` has 2 entries keyed by zone ID
3. After `update()` with 1 junction, a junction circle is added to the parent container
4. After `destroy()`, parent container has 0 children
5. Midpoint containers are positioned at the Bézier midpoint of their endpoint positions
6. Wavy routes produce polyline graphics (not single quadratic curve)
7. `buildPresentationScene()` excludes resolved connection routes from ordinary zones/adjacencies and exposes them through `connectionRoutes` / `junctions`
8. `CanvasUpdater` passes merged ordinary-zone and connection-route containers to `TokenRenderer`
9. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Renderer follows the same factory/interface pattern as `ZoneRenderer`, `AdjacencyRenderer`, etc.
2. `getContainerMap()` exposes the renderer's current readonly container map without mutating caller-provided input data
3. No game-specific identifiers in the renderer code — all behavior driven by `ConnectionStyleConfig`
4. No mutation of input data (`ConnectionRouteNode[]`, `JunctionNode[]`, positions map)
5. No raw visual-config rule matching in the renderer; route styling flows only through `route.connectionStyleKey` + injected `resolveConnectionStyle()`
6. Connection-route tokens render against midpoint containers, not orphaned hidden zone containers

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/renderers/connection-route-renderer.test.ts` — container creation, midpoint positioning, container map completeness, destroy cleanup, wavy vs straight rendering
2. `packages/runner/test/canvas/canvas-updater.test.ts` — connection-route scene/update integration, merged token container map
3. `packages/runner/test/canvas/renderers/renderer-types.test.ts` — `ConnectionRouteRenderer` contract

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/canvas/renderers/connection-route-renderer.test.ts`
2. `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/canvas/canvas-updater.test.ts`
3. `pnpm -F @ludoforge/runner test`
4. `pnpm -F @ludoforge/runner typecheck`
5. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completion date: 2026-03-21
- What actually changed:
  - Added a dedicated `ConnectionRouteRenderer` and wired it into the runner as a first-class renderer.
  - Extended `PresentationScene` to project resolved connection routes/junctions via the existing resolver and to filter ordinary zones/adjacencies accordingly.
  - Added a dedicated `connectionRouteLayer` and merged connection-route midpoint containers into token placement so tokens on connection zones render against route midpoints.
  - Added/updated renderer, scene, updater, layer, and runtime tests to prove the new path end to end.
- Deviations from original plan:
  - Reused the already-implemented resolver and Bézier utilities instead of creating them in this ticket.
  - Moved the minimal pipeline wiring into this ticket because an unintegrated renderer would have been dead code and not a durable architecture.
  - Injected `VisualConfigProvider` at renderer construction time to match the runner’s established renderer dependency pattern, instead of passing it through `update()`.
- Verification results:
  - `pnpm -F @ludoforge/runner exec vitest run test/canvas/renderers/connection-route-renderer.test.ts`
  - `pnpm -F @ludoforge/runner exec vitest run test/presentation/presentation-scene.test.ts test/canvas/canvas-updater.test.ts test/canvas/layers.test.ts test/canvas/renderers/renderer-types.test.ts test/canvas/GameCanvas.test.ts`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner lint`
