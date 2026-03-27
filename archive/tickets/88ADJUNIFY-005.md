# 88ADJUNIFY-005: Move dashed stroke ownership into renderers while keeping semantic dashed adapters

**Status**: COMPLETED
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
7. Test-surface correction: `packages/runner/test/canvas/renderers/adjacency-renderer.test.ts` currently proves delegation to `drawDashedLine()` rather than proving renderer-owned dash stroking. Confirmed.
8. Test-surface correction: `packages/runner/test/canvas/renderers/region-boundary-renderer.test.ts` currently exercises high-level region rendering behavior with real Pixi objects, but it does not directly prove how dashed border segments are stroked. Confirmed.
9. Verification correction: the runner package uses `vitest run`, so focused test commands should pass the test file path as a Vitest positional filter. The ticket should describe commands that match the actual package scripts. Confirmed.

## Architecture Check

1. Renderer-owned isolated-stroke rendering is cleaner than the current architecture because it makes the Pixi-specific behavior explicit at the rendering layer and keeps geometry utilities pure.
2. Updating all current consumers in one change aligns with `docs/FOUNDATIONS.md` principle 9: no hidden ownership boundaries and no long-lived misuse of a helper contract once the better boundary is understood.
3. This is more robust than burying Pixi-specific stroke semantics inside a shared geometry helper. Renderers can own the exact stroke semantics they require while still reusing one dash-segment source of truth.
4. A shared helper is still architecturally clean if, and only if, it lives in a renderer-facing Pixi layer and its semantics are honest, for example “stroke these dash segments as isolated Pixi strokes.” What must not survive is a geometry helper that hides stroke ownership behind path mutation.
5. `drawDashedLine()` and `drawDashedPolygon()` remain clean semantic adapters only if there is still a legitimate need for “append dashed segments to the current Pixi path.” If they become unused after this migration, delete them in the same change rather than preserving them out of habit.
6. No game-specific logic is introduced. The change is entirely about generic dashed rendering infrastructure inside the runner.

## What to Change

### 1. Migrate adjacency renderer to explicit dash-segment stroking

In `packages/runner/src/canvas/renderers/adjacency-renderer.ts`:
- Replace `drawDashedLine(...)` usage with the pure dashed-segment builder or a small shared Pixi-specific stroke helper outside the geometry layer.
- For each returned segment, emit one isolated path and stroke it immediately with the resolved edge stroke style.
- Preserve existing edge clipping, dash cadence, highlighted cadence, pair dedupe, and visibility behavior.

### 2. Migrate region boundary renderer to explicit dash-segment stroking

In `packages/runner/src/canvas/renderers/region-boundary-renderer.ts`:
- Replace `drawDashedPolygon(...)` usage with the pure dashed-segment builder in closed-path mode, or the same shared Pixi-specific stroke helper if both renderers can use one honest rendering-layer abstraction.
- Render dashed borders by stroking each segment explicitly instead of relying on one accumulated mutable path.
- Preserve fill behavior, border width/color semantics, label layout, and solid-border behavior.

### 3. Keep semantic dashed adapters unless they become unused

- Do not keep `drawDashedLine()` or `drawDashedPolygon()` purely as compatibility leftovers.
- Reassess them after the renderer migration:
  - if they still express a legitimate semantic API for “append dashed segments to the current Pixi path”, keep them
  - if they become unused, remove them in the same change that makes them unused
- If a helper is useful for “stroke one segment” or “stroke a segment list,” keep it renderer-facing and Pixi-specific. Do not reintroduce a generic geometry helper that hides stroke ownership.

## Files to Touch

- `packages/runner/src/canvas/renderers/adjacency-renderer.ts` (modify)
- `packages/runner/src/canvas/renderers/region-boundary-renderer.ts` (modify)
- `packages/runner/src/canvas/renderers/stroke-dashed-segments.ts` (new shared Pixi stroke helper)
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
5. Renderer tests prove isolated dash-segment stroking directly rather than only proving delegation to `drawDashedLine()` / `drawDashedPolygon()`.
6. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. No runner renderer emits many disconnected dash sub-paths through a shared “draw then stroke once later” dashed helper API.
2. Pixi stroke ownership for dashed rendering lives in renderer-facing code, while dash geometry stays pure.
3. Semantic dashed adapters may remain, but only for the distinct responsibility of appending dashed segments to the current Pixi path.
4. If multiple renderers share identical isolated-stroke behavior, that sharing happens in a Pixi-specific rendering helper, not in geometry.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/renderers/adjacency-renderer.test.ts` — updates the renderer proof from “calls drawDashedLine” to “strokes the expected dash segments with the expected style and cadence”.
2. `packages/runner/test/canvas/renderers/region-boundary-renderer.test.ts` — adds proof that dashed region borders are rendered via explicit segment stroking without changing solid-border behavior.
3. `packages/runner/test/canvas/geometry/dashed-segments.test.ts` — remains the single source of truth for dash math.
4. `packages/runner/test/canvas/geometry/dashed-line.test.ts` / `dashed-polygon.test.ts` — delete them if the adapters become unused and are removed in the same change.

### Commands

1. `pnpm -F @ludoforge/runner test test/canvas/renderers/adjacency-renderer.test.ts`
2. `pnpm -F @ludoforge/runner test test/canvas/renderers/region-boundary-renderer.test.ts`
3. `pnpm -F @ludoforge/runner typecheck`
4. `pnpm -F @ludoforge/runner lint`
5. `pnpm -F @ludoforge/runner test`

## Outcome

- Completion date: 2026-03-27
- What actually changed:
  - Moved dashed segment generation directly into `adjacency-renderer.ts` and `region-boundary-renderer.ts` via `buildDashedSegments(...)`.
  - Added `packages/runner/src/canvas/renderers/stroke-dashed-segments.ts` as the shared Pixi-specific isolated-stroke helper.
  - Removed the now-unused semantic geometry adapters `dashed-line.ts` and `dashed-polygon.ts`.
  - Reworked adjacency and region-boundary renderer tests so they prove isolated dash-segment stroking directly.
  - Removed the adapter-only geometry wrapper tests because the adapters no longer exist.
- Deviations from original plan:
  - The semantic adapters were deleted rather than retained, because after the renderer migration they had no runtime callers and no remaining architectural role.
  - The shared stroke helper landed under `packages/runner/src/canvas/renderers/` rather than a separate rendering directory, because that matches the runner’s existing module layout and keeps Pixi stroke ownership alongside renderer code.
- Verification results:
  - `pnpm -F @ludoforge/runner test test/canvas/renderers/adjacency-renderer.test.ts`
  - `pnpm -F @ludoforge/runner test test/canvas/renderers/region-boundary-renderer.test.ts`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner lint`
  - `pnpm -F @ludoforge/runner test`
