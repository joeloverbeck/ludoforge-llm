# 83ZONEDGANCEND-002: Edge Position Math Utilities

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

There is no utility to compute the intersection point of a ray from a zone's center at a given angle with the zone's bounding shape. This is needed for rendering connector endpoints at zone edges instead of centers, and for snapping drag handles to zone boundaries in the map editor.

## Assumption Reassessment (2026-03-26)

1. `packages/runner/src/canvas/renderers/shape-utils.ts` contains existing shape utilities including `resolveVisualDimensions`, `buildRegularPolygonPoints`, and `drawZoneShape`.
2. `ZoneShape` is still imported in `shape-utils.ts` from `visual-config-defaults.ts`; the schema/type surface already recognizes `rectangle`, `circle`, `ellipse`, `diamond`, `hexagon`, `triangle`, `octagon`, `line`, and `connection`.
3. `ShapeDimensions` is `{ readonly width: number, readonly height: number }` (lines 3-6).
4. `buildRegularPolygonPoints(sides, width, height)` returns a flat `number[]` array of x,y pairs (lines 131-138).
5. Screen coordinate convention: y-axis points down (positive y = screen down).
6. The spec assumption that schema work is still pending is stale: `packages/runner/src/config/visual-config-types.ts` already ships optional `anchor` support on zone endpoints.
7. The spec assumption that map-editor/store/export work is wholly pending is also stale: current runner tests already cover preservation of endpoint anchor metadata in store/export flows. This ticket should stay narrowly focused on boundary math instead of re-owning those areas.
8. The originally drafted focused test command is stale for the current `packages/runner/package.json` script shape. `pnpm -F @ludoforge/runner test -- ...` forwards through `vitest run` in a way that still executes the broader suite, so the ticket must use `pnpm -F @ludoforge/runner exec vitest run ...` for a real file-targeted run.

## Architecture Check

1. Pure functions with no side effects — takes shape/dimensions/angle, returns position (F7).
2. No engine or game-specific logic (F1, F3).
3. Builds on existing `buildRegularPolygonPoints` for polygon shapes — no code duplication.
4. The clean architecture here is a single shared boundary-oracle in `shape-utils.ts`. Resolver, editor-geometry, and drag code should consume this utility rather than each implementing their own shape math.
5. Cardinal and corner-aligned results should be canonicalized to stable numeric coordinates instead of leaking floating-point noise like `-0` or `39.99999999999999`. That keeps downstream geometry, snapshots, and tests deterministic without adding compatibility layers.

## What to Change

### 1. Add `getEdgePointAtAngle` function

In `packages/runner/src/canvas/renderers/shape-utils.ts`, add:

```typescript
export function getEdgePointAtAngle(
  shape: ZoneShape | undefined,
  dimensions: ShapeDimensions,
  angleDeg: number,
): Position
```

Shape-specific logic:

- **Circle**: `radius = Math.min(w, h) / 2`; `x = radius * cos(rad)`, `y = -radius * sin(rad)`
- **Ellipse**: compute the true ray/ellipse intersection, not ellipse parameterization. With ray direction `(dx, dy) = (cos(rad), -sin(rad))` and semi-axes `a = w/2`, `b = h/2`, use `scale = 1 / sqrt((dx^2 / a^2) + (dy^2 / b^2))`, then `x = dx * scale`, `y = dy * scale`
- **Rectangle** / **line** / default: Ray-cast from origin, intersect with rectangle edges `[-w/2, w/2] x [-h/2, h/2]`
- **Diamond**: Ray-cast, intersect with 4 diamond edges (vertices at cardinal points)
- **Hexagon** / **triangle** / **octagon**: Build polygon via `buildRegularPolygonPoints`, ray-cast intersection
- **Connection**: Return `{x: 0, y: 0}` (no visual boundary)

### 2. Add `rayPolygonIntersection` helper

```typescript
function rayPolygonIntersection(
  angleDeg: number,
  polygonPoints: readonly number[],
): Position
```

Iterates polygon edges (pairs of consecutive vertices, wrapping), finds the first intersection with a ray from origin at the given angle. Used by diamond, hexagon, triangle, octagon.

### 3. Position type import

Import `Position` from the runner's existing geometry/position types rather than introducing a new duplicate shape-local position type.

## Files to Touch

- `packages/runner/src/canvas/renderers/shape-utils.ts` (modify — add functions)
- `packages/runner/test/canvas/renderers/shape-utils.test.ts` (modify — extend the existing shape utility suite instead of creating a parallel test file unless the implementation becomes too large for that file)

## Out of Scope

- Schema changes — already landed separately
- Resolver integration — ticket 003
- Map editor integration — tickets 004-006
- Any changes to `drawZoneShape` or existing rendering code
- FITL visual config — ticket 007

## Acceptance Criteria

### Tests That Must Pass

1. **Circle**: angles 0°, 90°, 180°, 270° produce correct edge points (right, top, left, bottom)
2. **Circle**: radius derived from `Math.min(width, height) / 2`
3. **Rectangle**: cardinal angles (0°, 90°, 180°, 270°) hit edge midpoints
4. **Rectangle**: diagonal angles (45°, 135°, 225°, 315°) hit corners for square dimensions
5. **Ellipse**: angles produce the true boundary point along the requested ray direction (verify both `x²/a² + y²/b² ≈ 1` and directional consistency with the input angle)
6. **Diamond**: cardinal angles hit vertices; 45° hits midpoint of top-right edge
7. **Hexagon**: vertex-aligned and mid-edge angles produce correct boundary points
8. **Triangle**: angles produce points on triangle edges
9. **Octagon**: angles produce points on octagon edges
10. **Connection**: returns `{x: 0, y: 0}` for any angle
11. **Line** / default: treated as rectangle
12. **Angle normalization**: angles outside [0, 360) are handled correctly (e.g., -90° = 270°)
13. **Purity**: helper output is derived only from `(shape, dimensions, angle)` and does not mutate `dimensions` or polygon inputs
14. **Canonical coordinates**: exact axis-aligned and corner hits do not emit `-0` or near-integer float noise
15. Existing suite: `pnpm -F @ludoforge/runner test`
16. Existing suite: `pnpm -F @ludoforge/runner lint`
17. Existing suite: `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. All functions are pure — no side effects, no mutation of inputs (F7).
2. Output positions are relative to shape center at (0, 0) — caller adds zone center offset.
3. Screen y-axis convention: negative sin for y (up = negative y).
4. `buildRegularPolygonPoints` is reused, not reimplemented.
5. No aliasing or fallback helper layers: downstream code should call `getEdgePointAtAngle` directly once integrated.
6. Coordinate canonicalization is allowed only to remove floating-point representation noise, not to alter the geometric result.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/renderers/shape-utils.test.ts` — extend the existing shape utility suite with boundary-point coverage for all supported shapes, angle normalization, canonicalized axis/corner outputs, and purity/stability checks

### Commands

1. `pnpm -F @ludoforge/runner exec vitest run test/canvas/renderers/shape-utils.test.ts --reporter=verbose`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner lint`
4. `pnpm -F @ludoforge/runner typecheck`

## Outcome

- Completion date: 2026-03-26
- What actually changed:
  - added `getEdgePointAtAngle(shape, dimensions, angleDeg)` to `packages/runner/src/canvas/renderers/shape-utils.ts`
  - implemented shared helpers for angle normalization, rectangle intersection, true ray/ellipse intersection, polygon ray intersection, and lightweight coordinate canonicalization
  - kept the architecture runner-only and utility-centered so later resolver/editor tickets can consume one boundary-oracle instead of duplicating shape math
  - extended `packages/runner/test/canvas/renderers/shape-utils.test.ts` with boundary math coverage for circles, ellipses, rectangles, polygons, connection zones, angle normalization, and purity/stability
- Deviations from original plan:
  - the ticket was corrected before implementation to reflect already-landed schema/store/export work and to replace the stale targeted-test command with a real file-targeted `vitest` invocation
  - the implementation added coordinate canonicalization for exact axis/corner hits to eliminate `-0` and near-integer floating-point noise; this was not explicit in the original spec text, but it is the cleaner contract for downstream geometry consumers
- Verification results:
  - `pnpm -F @ludoforge/runner exec vitest run test/canvas/renderers/shape-utils.test.ts --reporter=verbose` passed (`1` file, `12` tests)
  - `pnpm -F @ludoforge/runner test` passed (`195` files, `1954` tests)
  - `pnpm -F @ludoforge/runner lint` passed
  - `pnpm -F @ludoforge/runner typecheck` passed
