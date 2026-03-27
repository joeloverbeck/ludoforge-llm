# 86ADJLINRED-002: Shared Dashed Path Geometry

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

Ticket 86ADJLINRED-003 needs dashed adjacency strokes, but the current plan in this ticket proposed copying the dash-walking logic from `drawDashedPolygon()` into a new line-only helper. That would solve the immediate need, but it would duplicate the core dash algorithm in two runner geometry utilities that differ only by whether the path closes.

The architectural gap is not "missing dashed line helper"; it is "missing shared dashed path primitive for open vs closed paths."

## Assumption Reassessment (2026-03-27)

1. `packages/runner/src/canvas/geometry/dashed-polygon.ts` is the only dashed stroke helper in the runner. It owns the real dash/gap walker today.
2. `Point2D` already lives in `packages/runner/src/canvas/geometry/point2d.ts`; importing it from `dashed-polygon.ts` would be the wrong dependency direction.
3. The runner already has other reusable path/route geometry utilities instead of one-off copies, especially in `packages/runner/src/map-editor/map-editor-route-geometry.ts`. That makes another duplicated walker a worse fit than a shared primitive.
4. The current edge-style config supports `color`, `width`, and `alpha` only. Dash pattern is not yet part of visual-config schema, so this ticket should stay focused on geometry and not silently expand config shape unless the implementation proves it is required.
5. The user instruction says to rely on `specs/85-adjacency*`, but no such files exist in the repository. The only adjacency redesign spec present is `specs/86-adjacency-line-redesign.md`, so this ticket should treat Spec 86 as the authoritative design input for this slice.

## Architecture Check

1. The cleaner architecture is a shared dashed-path walker that supports both open and closed point sequences. `drawDashedPolygon()` should become a thin closed-path wrapper over that shared logic.
2. A line helper may still exist if it materially improves adjacency-renderer readability, but it should delegate to the shared path primitive instead of re-implementing the walker.
3. This keeps bounded iteration and pure geometry semantics while avoiding duplicated dash-state behavior across polygon and line rendering.
4. No backwards compatibility. If a better shared API replaces the current internal structure, update all call sites in the same change.

## What to Change

### 1. Extract a Shared Dashed-Path Primitive

Create a runner geometry helper that owns the dash/gap walk for a sequence of points and can be used for:

- open paths (straight lines or sampled polylines)
- closed paths (polygon borders)

The implementation must preserve the current dash-state behavior across consecutive edges instead of resetting per edge.

### 2. Keep a Focused Straight-Line Entry Point for Adjacency Work

Expose a small straight-line helper only if it improves the adjacency renderer API, for example by accepting `from` and `to` points directly. If added, it must call the shared dashed-path primitive instead of duplicating logic.

### 3. Update Existing Polygon Rendering to Reuse the Shared Primitive

Refactor `drawDashedPolygon()` to delegate to the shared implementation so the runner has one source of truth for dash walking.

### 4. Add/Strengthen Tests

Add tests that prove both the new open-path behavior and the preserved closed-path behavior:

- a straight line of length 20 with dash=6 and gap=4 produces the expected drawn segments
- a line shorter than one dash draws a single truncated dash
- zero-length open segments produce no draw calls
- horizontal, vertical, diagonal, and reversed-direction lines all keep the pattern on-axis
- polygon rendering still works after the refactor and still carries dash state across edges

## Files to Touch

- `packages/runner/src/canvas/geometry/dashed-polygon.ts`
- `packages/runner/src/canvas/geometry/point2d.ts` only if truly needed for shared typing
- one new shared dashed-path geometry file
- relevant runner tests

## Out of Scope

- Integrating dashed lines into the adjacency renderer (86ADJLINRED-003)
- Spur line rendering (86ADJLINRED-004)
- Highlight styling updates (86ADJLINRED-005)
- Extending edge visual-config schema with dash properties unless implementation requires a separate follow-up
- Curve-specific dash sampling beyond what naturally falls out of an open polyline/path helper

## Acceptance Criteria

### Tests That Must Pass

1. Runner tests: `pnpm -F @ludoforge/runner test`
2. Runner lint: `pnpm -F @ludoforge/runner lint`
3. Runner typecheck: `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. The dash/gap walker exists in one shared implementation, not duplicated between polygon and line helpers.
2. Open-path rendering does not wrap the last point back to the first point.
3. Closed-path rendering preserves current polygon behavior.
4. The helper does not call `graphics.stroke()`; callers keep stroke ownership.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/geometry/dashed-line.test.ts`
   Verify open-path dashed geometry for straight lines, short lines, zero-length lines, diagonals, and reversed directions.
2. `packages/runner/test/canvas/geometry/dashed-polygon.test.ts`
   Strengthen coverage so the polygon wrapper is proven to preserve dash behavior after refactoring onto the shared primitive.

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner lint`
3. `pnpm -F @ludoforge/runner typecheck`

## Outcome

- Completion date: 2026-03-27
- What actually changed:
  - Corrected the ticket assumptions before implementation.
  - Added a shared `drawDashedPath()` geometry primitive for open and closed point sequences.
  - Added `drawDashedLine()` as a thin straight-line wrapper for future adjacency work.
  - Refactored `drawDashedPolygon()` to delegate to the shared walker.
  - Added line-geometry tests and strengthened polygon coverage to prove dash-state continuity across edges.
- Deviations from original plan:
  - Did **not** duplicate the dash walker into a standalone line-only implementation.
  - Added a new shared dashed-path helper because that is cleaner and more extensible than parallel polygon/line walkers.
  - Did **not** change adjacency rendering yet; that remains the responsibility of 86ADJLINRED-003.
- Verification results:
  - `pnpm -F @ludoforge/runner test` ✅
  - `pnpm -F @ludoforge/runner lint` ✅
  - `pnpm -F @ludoforge/runner typecheck` ✅
