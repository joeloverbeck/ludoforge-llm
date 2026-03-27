# 88ADJUNIFY-002: Extract shared adjacency edge stroke utility

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: `archive/tickets/88ADJUNIFY/88ADJUNIFY-001.md`

## Problem

The game canvas adjacency renderer and the map editor adjacency renderer both independently implement adjacency line stroke logic:

- **Game canvas** (`adjacency-renderer.ts`): `resolveStrokeStyle()` converts `ResolvedEdgeVisual` (string color, width, alpha) to `EdgeStrokeStyle` (numeric color, width, alpha) using `parseHexColor`, then calls `graphics.stroke(strokeStyle)`.
- **Map editor** (`map-editor-adjacency-renderer.ts`): now also resolves `ResolvedEdgeVisual` to Pixi stroke style using its own private helper.

Both renderers must also respect a PixiJS 8 constraint: adjacency lines MUST use a single continuous path (`moveTo` + `lineTo`) per stroke call, not many sub-paths. This constraint is undocumented and was discovered during a multi-session debugging effort. Centralizing the stroke logic provides a single place to document this constraint and prevents future regressions.

## Assumption Reassessment (2026-03-27)

1. `resolveStrokeStyle` in `adjacency-renderer.ts:167-184` converts `ResolvedEdgeVisual` → `EdgeStrokeStyle` using `parseHexColor`. This logic is not reusable — it's a private function inside the module.
2. `map-editor-adjacency-renderer.ts` now contains its own private `resolveStrokeStyle` helper with the same `parseHexColor` + fallback behavior introduced by 88ADJUNIFY-001.
3. `EdgeStrokeStyle` and `ResolvedEdgeVisual` are exported from `packages/runner/src/config/visual-config-provider.ts` and are already shared contracts suitable for a pipeline-neutral utility.
4. `parseHexColor` is currently exported from `packages/runner/src/canvas/renderers/shape-utils.ts`, which means the map editor already reaches into the game-canvas renderer tree for a generic color-parsing helper.
5. The PixiJS 8 multi-sub-path regression (Issues #10265, #10676) means dashed-line approaches using many `moveTo/lineTo` pairs in a single `stroke()` call are unreliable in the current PixiJS version.
6. Scope correction: the original ticket proposed placing the new shared utility under `packages/runner/src/canvas/renderers/`. That path is no longer ideal because the utility is shared by both rendering pipelines. The extraction should use a pipeline-neutral module location instead.

## Architecture Check

1. Extracting a shared `resolveEdgeStrokeStyle` function eliminates duplicated color-parsing logic and provides a single place to document the PixiJS 8 stroke constraint. Both renderers import the same function rather than independently implementing string-to-numeric color conversion.
2. The shared utility is purely presentational and pipeline-agnostic. It converts a `ResolvedEdgeVisual` (from `VisualConfigProvider`) to a PixiJS-compatible stroke style without embedding any game-specific or screen-specific logic, which aligns with `docs/FOUNDATIONS.md` by keeping shared contracts generic and centralized.
3. The utility should live in a pipeline-neutral location, not under `canvas/renderers/`, because the map editor is not a sub-feature of the game canvas. That keeps ownership boundaries explicit and avoids deepening accidental coupling between the two rendering trees.
4. No backwards-compatibility shims. Both private `resolveStrokeStyle` implementations are deleted in the same change and every caller is updated immediately.

## What to Change

### 1. Create shared edge stroke resolver

Create `packages/runner/src/rendering/resolve-edge-stroke-style.ts`:
- Export `resolveEdgeStrokeStyle(resolved: ResolvedEdgeVisual, fallback: ResolvedEdgeVisual): EdgeStrokeStyle`
- Move the `parseHexColor` + fallback logic from both private adjacency-renderer helpers into this shared function.
- Add a JSDoc comment documenting the PixiJS 8 constraint: adjacency lines must use a single continuous path per `stroke()` call; many `moveTo/lineTo` sub-paths in a single `stroke()` are unreliable due to PixiJS 8 WebGL tessellation regressions.
- If the implementation needs a color parser that is still trapped under `canvas/renderers/shape-utils.ts`, extract only the generic color-parsing piece into a pipeline-neutral helper as part of the same change rather than introducing another long-term cross-pipeline import from `map-editor/` into `canvas/renderers/`.

### 2. Game canvas adjacency renderer uses shared function

In `packages/runner/src/canvas/renderers/adjacency-renderer.ts`:
- Replace the private `resolveStrokeStyle` with an import of `resolveEdgeStrokeStyle`.
- Adapt the call to use the shared signature.

### 3. Map editor adjacency renderer uses shared function

In `packages/runner/src/map-editor/map-editor-adjacency-renderer.ts`:
- Import `resolveEdgeStrokeStyle`.
- Use it to convert the `VisualConfigProvider` result (from 88ADJUNIFY-001) to a PixiJS-compatible stroke style.

## Files to Touch

- `packages/runner/src/rendering/resolve-edge-stroke-style.ts` (new)
- `packages/runner/src/canvas/renderers/adjacency-renderer.ts` (modify)
- `packages/runner/src/map-editor/map-editor-adjacency-renderer.ts` (modify)
- `packages/runner/test/rendering/resolve-edge-stroke-style.test.ts` (new)
- `packages/runner/src/canvas/renderers/shape-utils.ts` (modify only if generic color parsing must be moved to support the neutral utility location)
- `packages/runner/test/canvas/renderers/shape-utils.test.ts` (modify only if color parsing ownership changes)

## Out of Scope

- Unifying the drawing strategies (edge-clipping vs center-to-center) — the two renderers have legitimately different geometry needs.
- Dashed-line rendering — blocked by PixiJS 8 regression; revisit when PixiJS fixes the multi-sub-path issue.
- Connection route renderer stroke resolution — uses a separate `ResolvedStroke` type with wavy/amplitude properties.
- Broader rendering-pipeline reorganization beyond introducing a neutral shared helper for this duplicated concern.

## Acceptance Criteria

### Tests That Must Pass

1. `resolveEdgeStrokeStyle` correctly converts `{ color: '#ff0000', width: 5, alpha: 0.8 }` → `{ color: 0xff0000, width: 5, alpha: 0.8 }`.
2. `resolveEdgeStrokeStyle` falls back to the provided fallback color when the resolved color is null or unparseable.
3. Both adjacency renderers produce identical stroke styles for the same `VisualConfigProvider` config.
4. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. No duplicated `parseHexColor` + fallback logic across adjacency renderers.
2. Shared adjacency stroke resolution does not live under a pipeline-specific directory.
3. The PixiJS 8 stroke constraint is documented in the shared module.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/rendering/resolve-edge-stroke-style.test.ts` — unit tests for color parsing, fallback behavior, null handling, and stable numeric output for both valid and invalid colors.
2. `packages/runner/test/canvas/renderers/adjacency-renderer.test.ts` — verify import of shared function (existing stroke style assertions still pass).
3. `packages/runner/test/map-editor/map-editor-adjacency-renderer.test.ts` — verify stroke style matches shared function output.
4. `packages/runner/test/canvas/renderers/shape-utils.test.ts` — update only if a generic color parser moves out of `shape-utils.ts`; keep behavior pinned if ownership changes.

### Commands

1. `pnpm -F @ludoforge/runner test -- resolve-edge-stroke-style`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner lint`
4. `pnpm -F @ludoforge/runner test`
