# 71CONROUREN-004: Connection-Route Renderer

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: archive/tickets/71CONROUREN/71CONROUREN-001.md, archive/tickets/71CONROUREN-002.md, archive/tickets/71CONROUREN/71CONROUREN-003.md

## Problem

Connection-route zones need a dedicated PixiJS renderer that draws quadratic Bézier curves between endpoint positions, renders labels along the curve tangent, manages hit areas for pointer interaction, positions midpoint containers for token attachment, and renders junction dots where connections meet. This is the visual heart of the connection-route feature.

## Assumption Reassessment (2026-03-21)

1. Existing renderers (`ZoneRenderer`, `AdjacencyRenderer`, `TokenRenderer`) follow a consistent pattern: factory function → `update(data, positions)` → `getContainerMap()` → `destroy()`. The connection-route renderer must follow this same contract.
2. `renderer-types.ts` defines interfaces for all renderers. A new `ConnectionRouteRenderer` interface must be added here.
3. The zone renderer uses `ContainerPool` for efficient container reuse. The connection-route renderer can use a simpler approach (create/destroy per update) since there are only ~17 connection zones in FITL — pool overhead isn't justified.
4. Label rendering uses `BitmapText` (consistent with zone-renderer labels). The `createBitmapText` helper should be reused if one exists, or labels follow the same pattern.
5. Selection/highlight strokes follow zone-renderer patterns: `isHighlighted` → yellow, `isSelectable` → blue.

## Architecture Check

1. Follows the established renderer pattern — factory function returning an interface with `update()`, `getContainerMap()`, `destroy()`. Aligns with existing architecture.
2. No game-specific logic in the renderer. Curve drawing, wavy lines, and junction dots are driven entirely by `ConnectionStyleConfig` from visual config. Aligns with F1 and F3.
3. No backwards-compat — entirely new renderer.
4. The renderer must not re-run raw config matching. It should consume `route.connectionStyleKey` from the resolved presentation data, then call `visualConfigProvider.resolveConnectionStyle()` exactly once per route as needed.

## What to Change

### 1. Add `ConnectionRouteRenderer` interface to `renderer-types.ts`

In `packages/runner/src/canvas/renderers/renderer-types.ts`, add:

```typescript
export interface ConnectionRouteRenderer {
  update(
    routes: readonly ConnectionRouteNode[],
    junctions: readonly JunctionNode[],
    positions: ReadonlyMap<string, Position>,
    visualConfigProvider: VisualConfigProvider,
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
  options: ConnectionRouteRendererOptions,
): ConnectionRouteRenderer;
```

**Options:** `parentContainer`, `junctionRadius` (default 6), `defaultCurvature` (default 30), `hitAreaPadding` (default 12), `curveSegments` (default 24), `wavySegments` (default 32).

**Per-connection rendering:**
1. Look up endpoint positions from layout position map
2. Resolve the route style from `route.connectionStyleKey` via `visualConfigProvider.resolveConnectionStyle()`. Do not inspect raw zone attributes or re-run attribute-rule logic in the renderer.
3. Compute control point via `computeControlPoint()` (from bezier-utils). If two connections share endpoints, offset curvatures in opposite directions
4. Draw curve:
   - Non-wavy (highway): `graphics.moveTo(p0).quadraticCurveTo(cp.x, cp.y, p2.x, p2.y).stroke(style)`
   - Wavy (mekong): sample points along Bézier, apply sine-wave perpendicular displacement, draw as polyline
5. Hit area: generate polygon via `approximateBezierHitPolygon()`, assign as `container.hitArea`
6. Midpoint container: invisible `Container` at curve midpoint for token attachment
7. Label: `BitmapText` at midpoint, rotated to match tangent angle (flip if upside-down)
8. Selection/highlight strokes: follow zone-renderer pattern

**Junction rendering:** filled circle at junction position, colored as average of connecting curves' stroke colors.

**Container map:** `getContainerMap()` returns `Map<zoneId, Container>` for all connection-route zones (the midpoint containers).

**Destroy:** remove all graphics, containers, labels, junction dots via `safeDestroyContainer` pattern.

### 3. Create `connection-route-renderer.test.ts`

New test file at `packages/runner/test/canvas/renderers/connection-route-renderer.test.ts`.

Testing approach: mock PixiJS `Container` and `Graphics` (following patterns from existing renderer tests), verify:
- Correct number of children created per connection route
- Midpoint containers positioned correctly
- `getContainerMap()` returns entries for all connection zone IDs
- `destroy()` removes all children from parent container

## Files to Touch

- `packages/runner/src/canvas/renderers/renderer-types.ts` (modify — add `ConnectionRouteRenderer` interface)
- `packages/runner/src/canvas/renderers/connection-route-renderer.ts` (new)
- `packages/runner/test/canvas/renderers/connection-route-renderer.test.ts` (new)

## Out of Scope

- Pipeline wiring (game-canvas-runtime, canvas-updater) — that's 71CONROUREN-005
- Pointer/selection handler attachment — that's 71CONROUREN-005
- FITL visual-config.yaml changes — that's 71CONROUREN-006
- Animated river flow (follow-up enhancement — this ticket renders static wavy lines)
- Tangent-perpendicular token fanning (follow-up)
- Curvature auto-adjustment for overlapping connections (follow-up)
- Zone renderer changes (connection zones are filtered out upstream, not here)

## Acceptance Criteria

### Tests That Must Pass

1. `createConnectionRouteRenderer()` returns an object with `update`, `getContainerMap`, `destroy` methods
2. After `update()` with 2 connection routes, `getContainerMap()` has 2 entries keyed by zone ID
3. After `update()` with 1 junction, a junction circle is added to the parent container
4. After `destroy()`, parent container has 0 children
5. Midpoint containers are positioned at the Bézier midpoint of their endpoint positions
6. Wavy routes produce polyline graphics (not single quadratic curve)
7. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Renderer follows the same factory/interface pattern as `ZoneRenderer`, `AdjacencyRenderer`, etc.
2. `getContainerMap()` returns a new map on each call (F7 Immutability)
3. No game-specific identifiers in the renderer code — all behavior driven by `ConnectionStyleConfig`
4. No mutation of input data (`ConnectionRouteNode[]`, `JunctionNode[]`, positions map)
5. No raw visual-config rule matching in the renderer; route styling flows only through `route.connectionStyleKey` + `resolveConnectionStyle()`

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/renderers/connection-route-renderer.test.ts` — container creation, midpoint positioning, container map completeness, destroy cleanup, wavy vs straight rendering

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/canvas/renderers/connection-route-renderer.test.ts`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner lint`
