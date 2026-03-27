# 88ADJUNIFY-002: Extract shared adjacency edge stroke utility

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: `archive/tickets/88ADJUNIFY/88ADJUNIFY-001.md`

## Problem

The game canvas adjacency renderer and the map editor adjacency renderer both independently implement adjacency line stroke logic:

- **Game canvas** (`adjacency-renderer.ts`): `resolveStrokeStyle()` converts `ResolvedEdgeVisual` (string color, width, alpha) to `EdgeStrokeStyle` (numeric color, width, alpha) using `parseHexColor`, then calls `graphics.stroke(strokeStyle)`.
- **Map editor** (`map-editor-adjacency-renderer.ts`): now also resolves `ResolvedEdgeVisual` to Pixi stroke style using its own private helper.

That duplication is small, but it is exactly the kind of cross-pipeline drift that already caused the map editor to diverge from the game canvas in 88ADJUNIFY-001. The cleaner architecture is one neutral stroke-style resolver owned outside either rendering pipeline.

There is a second architectural issue nearby: generic color parsing currently lives in `packages/runner/src/canvas/renderers/shape-utils.ts`, yet non-canvas modules already import it. That utility ownership is misplaced. This ticket should fix that boundary while extracting the shared adjacency stroke resolver.

## Assumption Reassessment (2026-03-27)

1. `resolveStrokeStyle` in `adjacency-renderer.ts:167-184` converts `ResolvedEdgeVisual` → `EdgeStrokeStyle` using `parseHexColor`. This logic is not reusable — it's a private function inside the module.
2. `map-editor-adjacency-renderer.ts` now contains its own private `resolveStrokeStyle` helper with the same `parseHexColor` + fallback behavior introduced by 88ADJUNIFY-001.
3. `EdgeStrokeStyle` and `ResolvedEdgeVisual` are exported from `packages/runner/src/config/visual-config-provider.ts` and are already shared contracts suitable for a pipeline-neutral utility.
4. `parseHexColor` is currently exported from `packages/runner/src/canvas/renderers/shape-utils.ts`, but it is already used outside the game-canvas renderer tree by map-editor modules. That confirms the helper is generic and currently owned in the wrong place.
5. Important discrepancy: the two adjacency renderers do NOT currently share the same path-building constraints. The map editor emits one continuous path and then strokes once, but the game canvas still calls `drawDashedLine()`, which emits repeated `moveTo/lineTo` sub-paths through `drawDashedPath()`.
6. Because of (5), this ticket cannot truthfully make a shared stroke-style resolver the canonical home for PixiJS path-construction rules. Path-building semantics and stroke-style resolution are separate concerns in the current architecture.
7. Scope correction: the original ticket proposed placing the new utility under `packages/runner/src/canvas/renderers/`. That path is not appropriate for code shared by canvas and map-editor pipelines. The extraction should use a pipeline-neutral module location instead.

## Architecture Check

1. Extracting a shared `resolveEdgeStrokeStyle` function is better than the current architecture. It removes duplicated fallback behavior and makes edge-stroke conversion deterministic across both adjacency pipelines.
2. Extracting `parseHexColor` into a neutral rendering utility is also better than the current architecture. Color parsing is not a canvas-renderer concern, and leaving it under `shape-utils.ts` deepens accidental coupling every time a non-canvas module imports it.
3. The shared utilities should live in a neutral location, not under `canvas/renderers/`, because the map editor is not a sub-feature of the game canvas. That keeps ownership boundaries explicit and aligns with the repo's no-alias / no-shim rule.
4. This ticket should NOT pretend to solve the broader PixiJS 8 path-rendering issue. The game canvas still relies on dashed multi-sub-path drawing. The ideal long-term architecture is to separate:
   - color and stroke resolution in neutral rendering utilities
   - path generation in geometry/path utilities that can be evolved independently if PixiJS path constraints require a new dashed-edge strategy
5. No backwards-compatibility shims. Both private `resolveStrokeStyle` implementations are deleted in the same change, `parseHexColor` stops being exported from the pipeline-specific module, and all imports are updated immediately.

## What to Change

### 1. Extract generic color parsing to a neutral module

Create `packages/runner/src/rendering/color-utils.ts`:
- Move `parseHexColor` and its option type/constants into this module.
- Keep behavior unchanged: strict `#RRGGBB` by default, optional `#RGB`, optional named-color support.
- Update all runner source and test imports that currently read `parseHexColor` from `canvas/renderers/shape-utils.ts`.
- Remove `parseHexColor` from `shape-utils.ts` entirely rather than re-exporting it.

### 2. Create shared edge stroke resolver

Create `packages/runner/src/rendering/resolve-edge-stroke-style.ts`:
- Export `resolveEdgeStrokeStyle(resolved: ResolvedEdgeVisual, fallback: ResolvedEdgeVisual): EdgeStrokeStyle`
- Move the `parseHexColor` + fallback logic from both private adjacency-renderer helpers into this shared function.
- Add a JSDoc comment documenting this module's actual responsibility: it resolves `ResolvedEdgeVisual` values into Pixi stroke styles only; path construction remains the responsibility of the calling renderer/geometry utility.

### 3. Game canvas adjacency renderer uses shared function

In `packages/runner/src/canvas/renderers/adjacency-renderer.ts`:
- Replace the private `resolveStrokeStyle` with an import of `resolveEdgeStrokeStyle`.
- Adapt the call to pass `DEFAULT_EDGE_STYLE` or `HIGHLIGHTED_EDGE_STYLE` explicitly as the fallback.

### 4. Map editor adjacency renderer uses shared function

In `packages/runner/src/map-editor/map-editor-adjacency-renderer.ts`:
- Import `resolveEdgeStrokeStyle`.
- Use it to convert the `VisualConfigProvider` result (from 88ADJUNIFY-001) to a PixiJS-compatible stroke style.
- Pass `DEFAULT_EDGE_STYLE` as the fallback.

## Files to Touch

- `packages/runner/src/rendering/color-utils.ts` (new)
- `packages/runner/src/rendering/resolve-edge-stroke-style.ts` (new)
- `packages/runner/src/canvas/renderers/adjacency-renderer.ts` (modify)
- `packages/runner/src/map-editor/map-editor-adjacency-renderer.ts` (modify)
- `packages/runner/src/canvas/renderers/shape-utils.ts` (modify — remove generic color parsing)
- other runner files importing `parseHexColor` from `shape-utils.ts` (modify — point at neutral color utility)
- `packages/runner/test/rendering/color-utils.test.ts` (new)
- `packages/runner/test/rendering/resolve-edge-stroke-style.test.ts` (new)
- `packages/runner/test/canvas/renderers/adjacency-renderer.test.ts` (modify only as needed to keep existing behavior pinned through the shared utility)
- `packages/runner/test/map-editor/map-editor-adjacency-renderer.test.ts` (modify only as needed to keep existing behavior pinned through the shared utility)
- `packages/runner/test/canvas/renderers/shape-utils.test.ts` (modify — remove parser assertions if ownership moves)

## Out of Scope

- Unifying the drawing strategies (edge-clipping vs center-to-center) — the two renderers have legitimately different geometry needs.
- Replacing the game-canvas dashed adjacency path generation. The current dashed `drawDashedLine()` architecture is a separate concern from stroke-style resolution and should be handled by a follow-up ticket if PixiJS 8 path constraints require it.
- Connection route renderer stroke resolution — uses a separate `ResolvedStroke` type with wavy/amplitude properties.
- Broader rendering-pipeline reorganization beyond introducing neutral shared helpers for color parsing and adjacency stroke resolution.

## Acceptance Criteria

### Tests That Must Pass

1. `resolveEdgeStrokeStyle` correctly converts `{ color: '#ff0000', width: 5, alpha: 0.8 }` → `{ color: 0xff0000, width: 5, alpha: 0.8 }`.
2. `resolveEdgeStrokeStyle` falls back to the provided fallback color when the resolved color is null or unparseable.
3. `parseHexColor` remains behaviorally identical after moving to the neutral module.
4. Both adjacency renderers produce identical stroke styles for the same `VisualConfigProvider` config.
5. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. No duplicated `parseHexColor` + fallback logic across adjacency renderers.
2. Generic color parsing does not live under a pipeline-specific directory.
3. Shared adjacency stroke resolution does not live under a pipeline-specific directory.
4. The shared stroke-style module documents only stroke resolution responsibility; it does not misrepresent path-construction ownership.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/rendering/color-utils.test.ts` — behavior lock for `parseHexColor` after moving it out of `shape-utils.ts`.
2. `packages/runner/test/rendering/resolve-edge-stroke-style.test.ts` — unit tests for color parsing, fallback behavior, null handling, and stable numeric output for both valid and invalid colors.
3. `packages/runner/test/canvas/renderers/adjacency-renderer.test.ts` — existing stroke style assertions continue to pass through the shared resolver.
4. `packages/runner/test/map-editor/map-editor-adjacency-renderer.test.ts` — verify stroke style matches shared resolver output and fallback behavior.
5. `packages/runner/test/canvas/renderers/shape-utils.test.ts` — remove the parser assertions now that color parsing has neutral ownership.

### Commands

1. `pnpm -F @ludoforge/runner typecheck`
2. `pnpm -F @ludoforge/runner lint`
3. `pnpm -F @ludoforge/runner test`

## Outcome

- Completion date: 2026-03-27
- What actually changed:
  - Added `packages/runner/src/rendering/color-utils.ts` and moved the generic `parseHexColor` helper there so it is no longer owned by `canvas/renderers/shape-utils.ts`.
  - Added `packages/runner/src/rendering/resolve-edge-stroke-style.ts` as the shared adjacency stroke resolver used by both the game canvas and map editor adjacency renderers.
  - Updated all runner modules that still depended on the old pipeline-specific color-parser location to import from the new neutral rendering utility.
  - Added dedicated tests for the neutral color parser and shared edge-stroke resolver, and trimmed the old `shape-utils` test to match the new ownership boundary.
- Deviations from original plan:
  - The ticket was corrected before implementation because its earlier scope conflated stroke-style resolution with Pixi path-construction semantics. The current game-canvas dashed adjacency path still uses multi-sub-path drawing, so this ticket was narrowed to the shared style/color concern only.
  - The implementation extracted the generic color parser as part of the same change because adding a neutral stroke resolver without fixing parser ownership would have preserved the wrong architectural dependency.
- Verification results:
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm -F @ludoforge/runner test` passed (`199` files, `2020` tests).
