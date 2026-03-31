# 99MAPEDITOR-002: Polygon label not recentered after vertex changes

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

When vertices are removed from a province polygon (or added/moved), the province label (e.g., "Sihanoukville") remains at its original position. If the polygon shape changes significantly, the label can end up outside the visible polygon area, making it confusing which province the label belongs to.

## Assumption Reassessment (2026-03-31)

1. **Label position is hardcoded for polygons** — Verified: `map-editor-presentation-adapter.ts:133` sets `nameLabelY = 0` for all non-circle shapes. The X position is also `0`. Label is positioned at the local origin of the zone container.
2. **Zone position is the polygon's reference point** — Verified: zone positions in the store represent the polygon's center. Vertices are stored relative to this center.
3. **Vertex changes don't trigger label recalculation** — Verified: `resolveEditorZoneRenderSpec` at line 124 receives only `displayName`, `visual`, and `isSelected` — no vertex data is passed.
4. **No mismatch**: The presentation adapter needs access to vertices to compute a polygon-aware label position.

## Architecture Check

1. **Pole-of-inaccessibility** guarantees the label is always inside the polygon, including concave shapes. A simple centroid would fail for concave polygons. This is the robust choice.
2. The algorithm is a pure geometric utility — no game-specific logic. It lives in the map-editor directory as a presentation utility.
3. No backwards-compatibility shims. The `resolveEditorZoneRenderSpec` function signature changes to accept optional vertices.

## What to Change

### 1. Create polygon centroid utility

New file `packages/runner/src/map-editor/polygon-centroid.ts`:
- Implement `poleOfInaccessibility(vertices: readonly number[]): { x: number; y: number }` — iterative cell subdivision algorithm
- Input: flat vertex array `[x0, y0, x1, y1, ...]` in local coordinates (relative to zone position)
- Output: `{ x, y }` in local coordinates — the point inside the polygon farthest from any edge
- Algorithm: grid-based cell subdivision with priority queue, ~50 lines

### 2. Wire polygon centroid into presentation adapter

In `packages/runner/src/map-editor/map-editor-presentation-adapter.ts`:
- Pass zone vertices to `resolveEditorZoneRenderSpec` when the shape is `polygon`
- When vertices are available and the shape is polygon, compute the pole-of-inaccessibility and use it as the label position instead of `(0, 0)`
- For non-polygon shapes, keep the existing behavior

### 3. Unit tests for centroid algorithm

New file `packages/runner/test/map-editor/polygon-centroid.test.ts`:
- Test with a regular convex polygon (square) — centroid should be near `(0, 0)`
- Test with a concave L-shaped polygon — centroid must be inside the polygon
- Test with a triangle — centroid should be inside
- Test with minimum 3 vertices

## Files to Touch

- `packages/runner/src/map-editor/polygon-centroid.ts` (new)
- `packages/runner/src/map-editor/map-editor-presentation-adapter.ts` (modify)
- `packages/runner/test/map-editor/polygon-centroid.test.ts` (new)

## Out of Scope

- Label font size scaling based on polygon area
- Label collision avoidance between overlapping provinces
- Centroid caching/memoization (vertices change infrequently)

## Acceptance Criteria

### Tests That Must Pass

1. `poleOfInaccessibility` returns a point inside a convex polygon
2. `poleOfInaccessibility` returns a point inside a concave polygon
3. Province label visually sits inside the polygon after vertex removal
4. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Label position is always geometrically inside the polygon boundary
2. Label position is returned in local coordinates (relative to zone position)
3. Non-polygon shapes (circle) are unaffected

## Test Plan

### New/Modified Tests

1. `packages/runner/test/map-editor/polygon-centroid.test.ts` — validates centroid is always inside polygon for various shapes

### Commands

1. `pnpm -F @ludoforge/runner test -- --grep "polygon-centroid"`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner test`
4. `pnpm -F @ludoforge/runner lint`

## Outcome

- **Completion date**: 2026-03-31
- **What changed**: Created `packages/runner/src/map-editor/polygon-centroid.ts` implementing a pole-of-inaccessibility algorithm (iterative cell subdivision). Modified `packages/runner/src/map-editor/map-editor-presentation-adapter.ts` to compute polygon label position using this algorithm when the zone shape is `polygon` with vertices. Added `packages/runner/test/map-editor/polygon-centroid.test.ts` with 5 tests covering convex, concave, triangle, offset, and degenerate polygons.
- **Deviations**: None.
- **Verification**: typecheck, 2093 tests (including 5 new polygon-centroid tests), lint — all pass.
