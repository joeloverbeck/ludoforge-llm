# 83ZONEDGANCEND-002: Edge Position Math Utilities

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: None (self-contained pure math)

## Problem

There is no utility to compute the intersection point of a ray from a zone's center at a given angle with the zone's bounding shape. This is needed for rendering connector endpoints at zone edges instead of centers, and for snapping drag handles to zone boundaries in the map editor.

## Assumption Reassessment (2026-03-26)

1. `packages/runner/src/canvas/renderers/shape-utils.ts` contains existing shape utilities including `resolveVisualDimensions`, `buildRegularPolygonPoints`, and `drawZoneShape`.
2. `ZoneShape` type is imported from `visual-config-defaults.ts` — includes: `rectangle`, `circle`, `ellipse`, `diamond`, `hexagon`, `triangle`, `octagon`, `line`, `connection`.
3. `ShapeDimensions` is `{ readonly width: number, readonly height: number }` (lines 3-6).
4. `buildRegularPolygonPoints(sides, width, height)` returns a flat `number[]` array of x,y pairs (lines 131-138).
5. Screen coordinate convention: y-axis points down (positive y = screen down).

## Architecture Check

1. Pure functions with no side effects — takes shape/dimensions/angle, returns position (F7).
2. No engine or game-specific logic (F1, F3).
3. Builds on existing `buildRegularPolygonPoints` for polygon shapes — no code duplication.

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
- **Ellipse**: `x = (w/2) * cos(rad)`, `y = -(h/2) * sin(rad)`
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

Import `Position` from the appropriate types file (likely `../../types/position.ts` or similar — verify at implementation time).

## Files to Touch

- `packages/runner/src/canvas/renderers/shape-utils.ts` (modify — add functions)
- `packages/runner/test/canvas/renderers/shape-edge-point.test.ts` (new — unit tests)

## Out of Scope

- Schema changes — ticket 001
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
5. **Ellipse**: angles produce points on the ellipse boundary (verify `x²/a² + y²/b² ≈ 1`)
6. **Diamond**: cardinal angles hit vertices; 45° hits midpoint of top-right edge
7. **Hexagon**: vertex-aligned and mid-edge angles produce correct boundary points
8. **Triangle**: angles produce points on triangle edges
9. **Octagon**: angles produce points on octagon edges
10. **Connection**: returns `{x: 0, y: 0}` for any angle
11. **Line** / default: treated as rectangle
12. **Angle normalization**: angles outside [0, 360) are handled correctly (e.g., -90° = 270°)
13. Existing suite: `pnpm -F @ludoforge/runner test`
14. Existing suite: `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. All functions are pure — no side effects, no mutation of inputs (F7).
2. Output positions are relative to shape center at (0, 0) — caller adds zone center offset.
3. Screen y-axis convention: negative sin for y (up = negative y).
4. `buildRegularPolygonPoints` is reused, not reimplemented.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/renderers/shape-edge-point.test.ts` — comprehensive unit tests for all shape types, cardinal/diagonal/arbitrary angles, edge cases

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/canvas/renderers/shape-edge-point.test.ts`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`
