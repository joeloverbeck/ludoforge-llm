# 71CONROUREN-001: Bézier Math Utilities

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None (leaf ticket, zero dependencies)

## Problem

The connection-route renderer (future ticket) needs pure math functions for quadratic Bézier curves: point-on-curve, tangent, control point computation, and hit-polygon generation. These are stateless, deterministic math utilities that can be built and tested in complete isolation before any rendering code exists.

## Assumption Reassessment (2026-03-21)

1. `packages/runner/src/canvas/geometry/` already exists with `convex-hull.ts`, `dashed-polygon.ts`, `hull-padding.ts` — so the directory is the right home for these utilities.
2. No existing Bézier or curve math exists in the codebase — this is net-new.
3. The `Point2D` interface proposed in the spec is standalone; the existing geometry files use inline `{ x: number; y: number }` — we should check if a shared `Point2D` type already exists or if we should define one here.

## Architecture Check

1. Pure functions with zero side effects and zero dependencies on PixiJS or rendering code — cleanest possible unit.
2. No game-specific logic; these are generic geometry functions usable by any game's connection rendering. Aligns with F1 (Engine Agnosticism) and F3 (Visual Separation).
3. No backwards-compatibility concerns — entirely new code.

## What to Change

### 1. Create `bezier-utils.ts`

New file at `packages/runner/src/canvas/geometry/bezier-utils.ts` with:

- `Point2D` interface (`readonly x: number; readonly y: number`)
- `quadraticBezierPoint(t, p0, cp, p2)` — point on curve at parameter t ∈ [0,1]
- `quadraticBezierTangent(t, p0, cp, p2)` — unnormalized tangent vector at t
- `quadraticBezierMidpoint(p0, cp, p2)` — shorthand for t=0.5
- `quadraticBezierMidpointTangent(p0, cp, p2)` — tangent at t=0.5
- `computeControlPoint(p0, p2, curvature)` — perpendicular offset control point for a gentle arc
- `approximateBezierHitPolygon(p0, cp, p2, halfWidth, segments)` — thick curve polygon for hit testing
- `perpendicular(v)` — 90° counterclockwise rotation
- `normalize(v)` — unit vector (returns `{x:0,y:0}` for zero-length)

All functions are pure, return new `Point2D` objects (F7 Immutability), and use no floating-point-sensitive operations beyond standard trigonometry.

### 2. Create `bezier-utils.test.ts`

New test file at `packages/runner/test/canvas/geometry/bezier-utils.test.ts` with:

- Midpoint accuracy: `quadraticBezierPoint(0.5, ...)` matches `quadraticBezierMidpoint(...)`
- Boundary values: `t=0` returns `p0`, `t=1` returns `p2`
- Tangent direction: tangent at t=0 points from p0 toward cp, tangent at t=1 points from cp toward p2
- Zero curvature: `computeControlPoint(p0, p2, 0)` produces midpoint of p0-p2 (straight line)
- Non-zero curvature: control point is perpendicular to the p0-p2 segment
- Hit polygon: vertex count = `2 * (segments + 1)`, polygon is closed (first ≈ last vertex)
- Perpendicular orthogonality: `dot(v, perpendicular(v)) === 0`
- Normalize: unit vector has length ≈ 1; zero-length input returns `{x:0,y:0}`

## Files to Touch

- `packages/runner/src/canvas/geometry/bezier-utils.ts` (new)
- `packages/runner/test/canvas/geometry/bezier-utils.test.ts` (new)

## Out of Scope

- PixiJS rendering or `Graphics` calls (that's 71CONROUREN-004)
- Connection-route resolver logic (that's 71CONROUREN-003)
- Visual config changes (that's 71CONROUREN-002)
- Wavy/sine-wave displacement math (implemented inline in the renderer, not in these utilities)
- Cubic Bézier support (quadratic is sufficient per spec)

## Acceptance Criteria

### Tests That Must Pass

1. `quadraticBezierPoint(0, p0, cp, p2)` returns `p0` exactly
2. `quadraticBezierPoint(1, p0, cp, p2)` returns `p2` exactly
3. `quadraticBezierMidpoint` matches `quadraticBezierPoint(0.5, ...)` within floating-point tolerance
4. `perpendicular(v)` is orthogonal to `v` (dot product ≈ 0)
5. `normalize({x:3, y:4})` returns `{x:0.6, y:0.8}` (length 1)
6. `normalize({x:0, y:0})` returns `{x:0, y:0}`
7. `computeControlPoint(p0, p2, 0)` returns midpoint of p0-p2
8. `approximateBezierHitPolygon` returns `2 * (segments + 1)` vertices
9. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. All functions are pure — no side effects, no mutation, no external state
2. All returned objects are new (no input mutation) — F7 Immutability
3. No PixiJS imports — this file is a pure math module

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/geometry/bezier-utils.test.ts` — comprehensive unit tests for all exported functions

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/canvas/geometry/bezier-utils.test.ts`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner lint`
