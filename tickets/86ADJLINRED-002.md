# 86ADJLINRED-002: Dashed Line Geometry Utility

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

The adjacency renderer needs to draw dashed straight lines between zone edge points (86ADJLINRED-003). The existing `drawDashedPolygon()` in `dashed-polygon.ts` walks polygon edges toggling dash/gap state — but it iterates over a closed polygon loop. A straight-line version is needed: a degenerate single-edge case with no polygon wrapping.

## Assumption Reassessment (2026-03-27)

1. `dashed-polygon.ts` (59 lines) uses a dash/gap walker that iterates over polygon edges with `(i+1) % n` wrapping — confirmed. The algorithm is: normalize direction vector → step by `Math.min(remaining, edgeLen)` → toggle drawing state when `remaining` exhausted.
2. PixiJS `Graphics` API uses `moveTo()`/`lineTo()` for dash segments, then `stroke()` to apply styling — confirmed from `adjacency-renderer.ts`.
3. No existing dashed line utility exists in the codebase — confirmed via exploration.

## Architecture Check

1. A standalone `drawDashedLine()` function is the minimal abstraction — it does one thing (Foundation 6: Bounded Computation — bounded iteration over a single edge).
2. Pure geometry utility with no game-specific logic (Foundation 1: Engine Agnosticism).
3. No backwards compatibility needed — this is a new file.

## What to Change

### 1. Create `packages/runner/src/canvas/geometry/dashed-line.ts`

A single exported function:

```typescript
export function drawDashedLine(
  graphics: Graphics,
  from: Point2D,
  to: Point2D,
  dashLength: number,
  gapLength: number,
): void
```

**Algorithm** (adapted from `drawDashedPolygon`):
1. Compute `dx`, `dy`, `edgeLen` from `from` to `to`
2. If `edgeLen < 1e-10`, return (degenerate zero-length line)
3. Normalize to unit vector `(ux, uy)`
4. Initialize `drawing = true`, `remaining = dashLength`, `cx = from.x`, `cy = from.y`
5. Walk along the edge:
   - `step = Math.min(remaining, edgeLen)`
   - `nx = cx + ux * step`, `ny = cy + uy * step`
   - If `drawing`: `graphics.moveTo(cx, cy)` then `graphics.lineTo(nx, ny)`
   - Update `cx`, `cy`, `edgeLen -= step`, `remaining -= step`
   - When `remaining < 1e-10`: toggle `drawing`, reset `remaining`

**Import**: `Point2D` from the existing `dashed-polygon.ts` (or from wherever the shared type is defined — check the import in `dashed-polygon.ts`).

## Files to Touch

- `packages/runner/src/canvas/geometry/dashed-line.ts` (new)

## Out of Scope

- Modifying `dashed-polygon.ts` — it continues to serve polygon use cases
- Integrating the dashed line into the adjacency renderer (86ADJLINRED-003)
- Any rendering or styling decisions — this is a pure geometry utility
- Adding curve/bezier dash support — only straight lines

## Acceptance Criteria

### Tests That Must Pass

1. **New unit test**: `packages/runner/test/canvas/geometry/dashed-line.test.ts`
   - A line of length 20 with dash=6, gap=4 produces segments at expected positions: dash [0,6], gap [6,10], dash [10,16], gap [16,20]
   - A line shorter than one dash (length=3, dash=6) produces a single segment of length 3
   - A zero-length line (from === to) produces no `moveTo`/`lineTo` calls
   - Horizontal, vertical, and diagonal lines all produce correct geometry
   - Dash/gap pattern is consistent regardless of line direction
2. Runner lint: `pnpm -F @ludoforge/runner lint`
3. Runner typecheck: `pnpm -F @ludoforge/runner typecheck`
4. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. `drawDashedLine` is a pure function — no side effects beyond Graphics mutation
2. The number of iterations is bounded by `ceil(edgeLen / min(dashLength, gapLength))` — always terminates
3. All dash segments lie on the straight line between `from` and `to` — no off-axis deviation
4. The function does NOT call `graphics.stroke()` — the caller controls stroke styling

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/geometry/dashed-line.test.ts` — unit tests with mocked PixiJS Graphics (track `moveTo`/`lineTo` calls)

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner lint`
3. `pnpm -F @ludoforge/runner typecheck`
