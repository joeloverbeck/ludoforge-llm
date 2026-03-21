# 71CONROUREN-001: Bézier Math Utilities

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None (leaf ticket, zero dependencies)

## Problem

The connection-route renderer (future ticket) needs pure math functions for quadratic Bézier curves: point-on-curve, tangent, control point computation, and hit-polygon generation. These are stateless, deterministic geometry utilities that should be built and tested in isolation before any connection-route rendering code exists.

The codebase already contains inline quadratic Bézier sampling inside `roundHullCorners()` in `packages/runner/src/canvas/geometry/hull-padding.ts`. This ticket therefore should not add a second disconnected curve implementation. It should extract and normalize shared quadratic-curve primitives so future connection-route rendering and existing rounded-hull rendering share one source of truth.

## Assumption Reassessment (2026-03-21)

1. `packages/runner/src/canvas/geometry/` already exists with `convex-hull.ts`, `dashed-polygon.ts`, `hull-padding.ts` — so the directory is the right home for these utilities.
2. The original assumption that no existing Bézier or curve math exists is false. `roundHullCorners()` already evaluates quadratic Bézier points inline.
3. The runner geometry layer already has a shared point shape via `Point` in `convex-hull.ts`. Creating a second incompatible point abstraction here would make the geometry layer less coherent. This ticket should converge geometry helpers on one shared readonly 2D point contract.
4. The runner test layout already has a dedicated `packages/runner/test/canvas/geometry/` domain, so the new tests belong there.
5. The original hit-polygon expectation was internally inconsistent: a polygon cannot both have exactly `2 * (segments + 1)` vertices and also be "closed" by repeating the first vertex at the end. We should preserve deterministic vertex count and rely on polygon consumers to interpret the path as closed.

## Architecture Check

1. Pure functions with zero side effects and zero dependencies on PixiJS or rendering code — cleanest possible unit.
2. No game-specific logic; these are generic geometry functions usable by any game's connection rendering. Aligns with F1 (Engine Agnosticism) and F3 (Visual Separation).
3. The beneficial architectural move is extraction and reuse, not parallel addition. Existing rounded-hull rendering and future connection-route rendering should share the same quadratic primitives so behavior stays consistent.
4. No backwards-compatibility shims: if we introduce a shared point contract or move existing inline math behind helpers, current runner consumers are updated in the same change (F9).

## What to Change

### 1. Introduce a shared geometry point contract and create `bezier-utils.ts`

New file at `packages/runner/src/canvas/geometry/point2d.ts` with the shared readonly 2D point contract used by geometry helpers.

New file at `packages/runner/src/canvas/geometry/bezier-utils.ts` with:

- `quadraticBezierPoint(t, p0, cp, p2)` — point on curve at parameter t ∈ [0,1]
- `quadraticBezierTangent(t, p0, cp, p2)` — unnormalized tangent vector at t
- `quadraticBezierMidpoint(p0, cp, p2)` — shorthand for t=0.5
- `quadraticBezierMidpointTangent(p0, cp, p2)` — tangent at t=0.5
- `computeControlPoint(p0, p2, curvature)` — perpendicular offset control point for a gentle arc
- `approximateBezierHitPolygon(p0, cp, p2, halfWidth, segments)` — thick curve polygon for hit testing
- `perpendicular(v)` — 90° counterclockwise rotation
- `normalize(v)` — unit vector (returns `{x:0,y:0}` for zero-length)

All functions are pure, return new point objects (F7 Immutability), and are renderer-agnostic.

### 2. Refactor existing geometry code to use the shared point contract and quadratic helpers

- Update `roundHullCorners()` in `packages/runner/src/canvas/geometry/hull-padding.ts` to call `quadraticBezierPoint(...)` instead of keeping an inline quadratic formula.
- Update geometry-module point typing so `convex-hull.ts`, `hull-padding.ts`, and the new Bézier utilities share one point contract instead of maintaining duplicate point interfaces.

### 3. Create `bezier-utils.test.ts` and strengthen geometry regression coverage

New test file at `packages/runner/test/canvas/geometry/bezier-utils.test.ts` with:

- Midpoint accuracy: `quadraticBezierPoint(0.5, ...)` matches `quadraticBezierMidpoint(...)`
- Boundary values: `t=0` returns `p0`, `t=1` returns `p2`
- Tangent direction: tangent at t=0 points from p0 toward cp, tangent at t=1 points from cp toward p2
- Zero curvature: `computeControlPoint(p0, p2, 0)` produces midpoint of p0-p2 (straight line)
- Non-zero curvature: control point is perpendicular to the p0-p2 segment
- Hit polygon: vertex count = `2 * (segments + 1)`, forward and reverse sides align with the curve endpoints, and zero-width output collapses onto the sampled curve
- Perpendicular orthogonality: `dot(v, perpendicular(v)) === 0`
- Normalize: unit vector has length ≈ 1; zero-length input returns `{x:0,y:0}`

Existing geometry regression to strengthen:

- `packages/runner/test/canvas/geometry/hull-padding.test.ts` should assert that `roundHullCorners()` still produces the expected sample count and stays within padded bounds after the extraction. That proves the refactor preserved current behavior rather than only validating the new helper in isolation.

## Files to Touch

- `packages/runner/src/canvas/geometry/bezier-utils.ts` (new)
- `packages/runner/src/canvas/geometry/point2d.ts` (new)
- `packages/runner/src/canvas/geometry/hull-padding.ts`
- `packages/runner/test/canvas/geometry/bezier-utils.test.ts` (new)
- `packages/runner/test/canvas/geometry/hull-padding.test.ts`
- `packages/runner/src/canvas/geometry/convex-hull.ts`

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
9. `roundHullCorners()` still passes its regression checks after delegating to the shared helper
10. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. All functions are pure — no side effects, no mutation, no external state
2. All returned objects are new (no input mutation) — F7 Immutability
3. No PixiJS imports — this file is a pure math module
4. The runner geometry layer does not end this ticket with two competing point abstractions for the same concept

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/geometry/bezier-utils.test.ts` — comprehensive unit tests for all exported curve helpers and hit-polygon generation
2. `packages/runner/test/canvas/geometry/hull-padding.test.ts` — regression coverage proving the `roundHullCorners()` refactor preserves current sampling behavior

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/canvas/geometry/bezier-utils.test.ts`
2. `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/canvas/geometry/hull-padding.test.ts`
3. `pnpm -F @ludoforge/runner typecheck`
4. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completion date: 2026-03-21
- What actually changed:
  - Added shared geometry point contract at `packages/runner/src/canvas/geometry/point2d.ts`.
  - Added `packages/runner/src/canvas/geometry/bezier-utils.ts` with reusable quadratic Bézier point, tangent, midpoint, control-point, hit-polygon, perpendicular, and normalize helpers.
  - Refactored `roundHullCorners()` to use `quadraticBezierPoint(...)` instead of inline quadratic math.
  - Updated existing runner geometry modules and tests to use the shared `Point2D` contract.
  - Added new Bézier utility tests and strengthened `roundHullCorners()` regression coverage.
- Deviations from original plan:
  - Instead of defining the shared point contract inside `bezier-utils.ts`, introduced a dedicated `point2d.ts` module. This keeps the point abstraction broader than curve math and avoids making unrelated geometry code depend on the Bézier module.
  - The hit-polygon contract was clarified to preserve deterministic vertex count without repeating the first vertex as a closing sentinel.
- Verification results:
  - `pnpm -F @ludoforge/runner exec vitest run test/canvas/geometry/bezier-utils.test.ts test/canvas/geometry/hull-padding.test.ts test/canvas/geometry/convex-hull.test.ts test/canvas/geometry/dashed-polygon.test.ts`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner lint`
  - `pnpm -F @ludoforge/runner test`
