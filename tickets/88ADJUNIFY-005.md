# 88ADJUNIFY-005: Migrate dashed renderers to isolated-stroke segment rendering and delete the old path walker

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: `tickets/88ADJUNIFY-004.md`

## Problem

After 88ADJUNIFY-004 extracts pure dashed geometry, the runner still needs to fix the actual architectural issue exposed by 88ADJUNIFY-002: dashed rendering currently depends on APIs that emit many disconnected `moveTo` / `lineTo` sub-paths before a single stroke.

That path-emission strategy is the wrong ownership boundary. The renderer, not the geometry layer, must own how dash segments are stroked. Until that migration happens, the game canvas adjacency renderer and the dashed region-boundary renderer both remain coupled to the old mutating dashed-path API.

The recommended implementation is to render each dash segment as its own isolated stroke operation using the pure segment output from 88ADJUNIFY-004, then delete `drawDashedPath()` and the old Pixi-mutating dashed wrappers entirely.

## Assumption Reassessment (2026-03-27)

1. `packages/runner/src/canvas/renderers/adjacency-renderer.ts` still calls `drawDashedLine(...)` and then `graphics.stroke(strokeStyle)`. Confirmed.
2. `packages/runner/src/canvas/renderers/region-boundary-renderer.ts` still calls `graphics.setStrokeStyle(...)`, then `drawDashedPolygon(...)`, then `graphics.stroke()`. Confirmed.
3. Both renderers therefore depend on the old API shape where a dashed helper mutates the current Pixi path before the caller strokes it. Confirmed.
4. Once 88ADJUNIFY-004 lands, the pure segment builder will make it possible to move stroke ownership into renderers cleanly without re-implementing dash math. Expected dependency.
5. Scope correction: this ticket should update every current consumer of the old dashed mutating API in the runner, not just adjacency. Leaving `region-boundary-renderer` behind would preserve the same architecture flaw under a different feature.

## Architecture Check

1. Renderer-owned isolated-stroke rendering is cleaner than the current architecture because it makes the Pixi-specific behavior explicit at the rendering layer and keeps geometry utilities pure.
2. Updating all current consumers in one change aligns with `docs/FOUNDATIONS.md` principle 9: no alias paths, no long-lived compatibility layer. The old mutating dashed-path API should be deleted once no consumers remain.
3. This is more robust than burying a Pixi 8 workaround inside a shared geometry helper. Renderers can own the exact stroke semantics they require while still reusing one dash-segment source of truth.
4. No game-specific logic is introduced. The change is entirely about generic dashed rendering infrastructure inside the runner.

## What to Change

### 1. Migrate adjacency renderer to explicit dash-segment stroking

In `packages/runner/src/canvas/renderers/adjacency-renderer.ts`:
- Replace `drawDashedLine(...)` usage with the pure dashed-segment builder.
- For each returned segment, emit one isolated path and stroke it immediately with the resolved edge stroke style.
- Preserve existing edge clipping, dash cadence, highlighted cadence, pair dedupe, and visibility behavior.

### 2. Migrate region boundary renderer to explicit dash-segment stroking

In `packages/runner/src/canvas/renderers/region-boundary-renderer.ts`:
- Replace `drawDashedPolygon(...)` usage with the pure dashed-segment builder in closed-path mode.
- Render dashed borders by stroking each segment explicitly instead of relying on one accumulated mutable path.
- Preserve fill behavior, border width/color semantics, label layout, and solid-border behavior.

### 3. Delete the old mutating dashed-path API

Remove the obsolete path-walker API after all consumers migrate:
- delete `drawDashedPath()`
- delete `drawDashedLine()`
- delete `drawDashedPolygon()`
- update all tests accordingly

If a tiny local helper is still useful for “stroke one segment”, keep it renderer-facing and Pixi-specific. Do not reintroduce a generic geometry helper that mutates `Graphics`.

## Files to Touch

- `packages/runner/src/canvas/renderers/adjacency-renderer.ts` (modify)
- `packages/runner/src/canvas/renderers/region-boundary-renderer.ts` (modify)
- `packages/runner/src/canvas/geometry/dashed-segments.ts` (modify only if migration reveals a missing pure-contract detail)
- `packages/runner/src/canvas/geometry/dashed-path.ts` (delete)
- `packages/runner/src/canvas/geometry/dashed-line.ts` (delete)
- `packages/runner/src/canvas/geometry/dashed-polygon.ts` (delete)
- `packages/runner/test/canvas/renderers/adjacency-renderer.test.ts` (modify)
- `packages/runner/test/canvas/renderers/region-boundary-renderer.test.ts` (modify)
- `packages/runner/test/canvas/geometry/dashed-line.test.ts` (delete)
- `packages/runner/test/canvas/geometry/dashed-polygon.test.ts` (delete)

## Out of Scope

- Changing the map editor adjacency renderer geometry (it intentionally remains center-to-center and continuous).
- Changing adjacency style resolution or visual-config edge schema.
- Broad renderer-tree consolidation between game canvas and map editor.

## Acceptance Criteria

### Tests That Must Pass

1. The adjacency renderer no longer relies on `drawDashedLine()` and still renders the same clipped endpoints, stroke styles, and normal/highlighted dash cadence.
2. The region boundary renderer no longer relies on `drawDashedPolygon()` and still renders dashed region borders with the same width/color semantics.
3. No mutating dashed-path helper remains in `packages/runner/src/canvas/geometry/`.
4. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. No runner renderer emits many disconnected dash sub-paths through a shared “draw then stroke once later” dashed helper API.
2. Pixi stroke ownership for dashed rendering lives in renderer-facing code, while dash geometry stays pure.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/renderers/adjacency-renderer.test.ts` — updates the renderer proof from “calls drawDashedLine” to “strokes the expected dash segments with the expected style and cadence”.
2. `packages/runner/test/canvas/renderers/region-boundary-renderer.test.ts` — adds proof that dashed region borders are rendered via explicit segment stroking without changing solid-border behavior.
3. `packages/runner/test/canvas/geometry/dashed-segments.test.ts` — remains the single source of truth for dash math after the old wrapper tests are removed.

### Commands

1. `pnpm -F @ludoforge/runner test -- test/canvas/renderers/adjacency-renderer.test.ts`
2. `pnpm -F @ludoforge/runner test -- test/canvas/renderers/region-boundary-renderer.test.ts`
3. `pnpm -F @ludoforge/runner typecheck`
4. `pnpm -F @ludoforge/runner lint`
5. `pnpm -F @ludoforge/runner test`
