# 88ADJUNIFY-005: Move dashed stroke ownership into renderers while keeping semantic dashed adapters

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: `archive/tickets/88ADJUNIFY/88ADJUNIFY-004.md`

## Problem

After 88ADJUNIFY-004 extracted pure dashed geometry, the runner still needs to fix the actual architectural issue exposed by 88ADJUNIFY-002: dashed rendering in key renderers still relies on helpers that emit many disconnected `moveTo` / `lineTo` sub-paths before a single stroke.

That path-emission strategy is the wrong ownership boundary. The renderer, not the geometry layer, must own how dash segments are stroked. Until that migration happens, the game canvas adjacency renderer and the dashed region-boundary renderer remain coupled to a helper shape that still assumes “build path now, stroke later”.

The recommended implementation is to render each dash segment as its own isolated stroke operation using the pure segment output from 88ADJUNIFY-004. The semantic adapters `drawDashedLine()` and `drawDashedPolygon()` should remain unless the codebase later proves they have no useful callers. They are not the architectural problem; hidden stroke ownership is.

## Assumption Reassessment (2026-03-27)

1. `packages/runner/src/canvas/renderers/adjacency-renderer.ts` still calls `drawDashedLine(...)` and then `graphics.stroke(strokeStyle)`. Confirmed.
2. `packages/runner/src/canvas/renderers/region-boundary-renderer.ts` still calls `graphics.setStrokeStyle(...)`, then `drawDashedPolygon(...)`, then `graphics.stroke()`. Confirmed.
3. `packages/runner/src/canvas/geometry/dashed-path.ts` has already been deleted by 88ADJUNIFY-004. Confirmed.
4. `packages/runner/src/canvas/geometry/dashed-line.ts` and `packages/runner/src/canvas/geometry/dashed-polygon.ts` now delegate to the pure `buildDashedSegments(...)` contract and only emit Pixi commands. Confirmed.
5. The remaining problem is therefore not geometry impurity. It is renderer-level stroke ownership: both renderers still rely on a helper that appends multiple disconnected sub-paths before one later stroke call. Confirmed.
6. Scope correction: this ticket should update every current renderer that still uses the “emit many dash sub-paths, stroke once later” approach. Leaving `region-boundary-renderer` behind would preserve the same architecture flaw under a different feature.

## Architecture Check

1. Renderer-owned isolated-stroke rendering is cleaner than the current architecture because it makes the Pixi-specific behavior explicit at the rendering layer and keeps geometry utilities pure.
2. Updating all current consumers in one change aligns with `docs/FOUNDATIONS.md` principle 9: no hidden ownership boundaries and no long-lived misuse of a helper contract once the better boundary is understood.
3. This is more robust than burying Pixi-specific stroke semantics inside a shared geometry helper. Renderers can own the exact stroke semantics they require while still reusing one dash-segment source of truth.
4. `drawDashedLine()` and `drawDashedPolygon()` remain clean semantic adapters for cases where “append dashed segments to the current Pixi path” is the intended behavior. Keeping them is cleaner than forcing every call site to rebuild trivial adapter code around the pure segment builder.
5. No game-specific logic is introduced. The change is entirely about generic dashed rendering infrastructure inside the runner.

## What to Change

### 1. Migrate adjacency renderer to explicit dash-segment stroking

In `packages/runner/src/canvas/renderers/adjacency-renderer.ts`:
- Replace `drawDashedLine(...)` usage with the pure dashed-segment builder or a tiny renderer-local stroke helper built on it.
- For each returned segment, emit one isolated path and stroke it immediately with the resolved edge stroke style.
- Preserve existing edge clipping, dash cadence, highlighted cadence, pair dedupe, and visibility behavior.

### 2. Migrate region boundary renderer to explicit dash-segment stroking

In `packages/runner/src/canvas/renderers/region-boundary-renderer.ts`:
- Replace `drawDashedPolygon(...)` usage with the pure dashed-segment builder in closed-path mode, or a tiny renderer-local stroke helper built on it.
- Render dashed borders by stroking each segment explicitly instead of relying on one accumulated mutable path.
- Preserve fill behavior, border width/color semantics, label layout, and solid-border behavior.

### 3. Keep semantic dashed adapters unless they become unused

- Do not delete `drawDashedLine()` or `drawDashedPolygon()` merely to force direct use of `buildDashedSegments()`.
- Reassess them after the renderer migration:
  - if they still express a legitimate semantic API for “append dashed segments to the current Pixi path”, keep them
  - if they become unused, remove them in the same change that makes them unused
- If a tiny local helper is useful for “stroke one segment”, keep it renderer-facing and Pixi-specific. Do not reintroduce a generic geometry helper that hides stroke ownership.

## Files to Touch

- `packages/runner/src/canvas/renderers/adjacency-renderer.ts` (modify)
- `packages/runner/src/canvas/renderers/region-boundary-renderer.ts` (modify)
- `packages/runner/src/canvas/geometry/dashed-segments.ts` (modify only if migration reveals a missing pure-contract detail)
- `packages/runner/src/canvas/geometry/dashed-line.ts` (optional modify if shared adapter helpers need cleanup afterward)
- `packages/runner/src/canvas/geometry/dashed-polygon.ts` (optional modify if shared adapter helpers need cleanup afterward)
- `packages/runner/test/canvas/renderers/adjacency-renderer.test.ts` (modify)
- `packages/runner/test/canvas/renderers/region-boundary-renderer.test.ts` (modify)
- `packages/runner/test/canvas/geometry/dashed-line.test.ts` (optional modify or delete only if the adapter becomes unused and is removed)
- `packages/runner/test/canvas/geometry/dashed-polygon.test.ts` (optional modify or delete only if the adapter becomes unused and is removed)

## Out of Scope

- Changing the map editor adjacency renderer geometry (it intentionally remains center-to-center and continuous).
- Changing adjacency style resolution or visual-config edge schema.
- Broad renderer-tree consolidation between game canvas and map editor.

## Acceptance Criteria

### Tests That Must Pass

1. The adjacency renderer no longer relies on a helper contract that appends many dash sub-paths before one later `stroke()` call, and still renders the same clipped endpoints, stroke styles, and normal/highlighted dash cadence.
2. The region boundary renderer no longer relies on a helper contract that appends many dash sub-paths before one later `stroke()` call, and still renders dashed region borders with the same width/color semantics.
3. Dash geometry remains pure and shared through `buildDashedSegments()`.
4. Any remaining dashed helper in `packages/runner/src/canvas/geometry/` has honest semantics and does not hide renderer stroke ownership.
5. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. No runner renderer emits many disconnected dash sub-paths through a shared “draw then stroke once later” dashed helper API.
2. Pixi stroke ownership for dashed rendering lives in renderer-facing code, while dash geometry stays pure.
3. Semantic dashed adapters may remain, but only for the distinct responsibility of appending dashed segments to the current Pixi path.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/renderers/adjacency-renderer.test.ts` — updates the renderer proof from “calls drawDashedLine” to “strokes the expected dash segments with the expected style and cadence”.
2. `packages/runner/test/canvas/renderers/region-boundary-renderer.test.ts` — adds proof that dashed region borders are rendered via explicit segment stroking without changing solid-border behavior.
3. `packages/runner/test/canvas/geometry/dashed-segments.test.ts` — remains the single source of truth for dash math.
4. `packages/runner/test/canvas/geometry/dashed-line.test.ts` / `dashed-polygon.test.ts` — remain only if those adapters still exist and still provide distinct semantic value after the migration.

### Commands

1. `pnpm -F @ludoforge/runner test -- test/canvas/renderers/adjacency-renderer.test.ts`
2. `pnpm -F @ludoforge/runner test -- test/canvas/renderers/region-boundary-renderer.test.ts`
3. `pnpm -F @ludoforge/runner typecheck`
4. `pnpm -F @ludoforge/runner lint`
5. `pnpm -F @ludoforge/runner test`
