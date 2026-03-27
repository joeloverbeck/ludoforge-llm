# 88ADJUNIFY-002: Extract shared adjacency edge stroke utility

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: `tickets/88ADJUNIFY-001.md`

## Problem

The game canvas adjacency renderer and the map editor adjacency renderer both independently implement adjacency line stroke logic:

- **Game canvas** (`adjacency-renderer.ts`): `resolveStrokeStyle()` converts `ResolvedEdgeVisual` (string color, width, alpha) to `EdgeStrokeStyle` (numeric color, width, alpha) using `parseHexColor`, then calls `graphics.stroke(strokeStyle)`.
- **Map editor** (`map-editor-adjacency-renderer.ts`): After 88ADJUNIFY-001, will also need the same string-to-numeric color conversion and stroke call.

Both renderers must also respect a PixiJS 8 constraint: adjacency lines MUST use a single continuous path (`moveTo` + `lineTo`) per stroke call, not many sub-paths. This constraint is undocumented and was discovered during a multi-session debugging effort. Centralizing the stroke logic provides a single place to document this constraint and prevents future regressions.

## Assumption Reassessment (2026-03-27)

1. `resolveStrokeStyle` in `adjacency-renderer.ts:167-184` converts `ResolvedEdgeVisual` → `EdgeStrokeStyle` using `parseHexColor`. This logic is not reusable — it's a private function inside the module.
2. `EdgeStrokeStyle` interface is exported from `visual-config-provider.ts:121-125` — available for shared use.
3. `parseHexColor` is exported from `shape-utils.ts:64-90` — available for shared use.
4. The PixiJS 8 multi-sub-path regression (Issues #10265, #10676) means dashed-line approaches using many `moveTo/lineTo` pairs in a single `stroke()` call are unreliable in the current PixiJS version.
5. No mismatch found.

## Architecture Check

1. Extracting a shared `resolveEdgeStrokeStyle` function eliminates duplicated color-parsing logic and provides a single place to document the PixiJS 8 stroke constraint. Both renderers import the same function rather than independently implementing string-to-numeric color conversion.
2. The shared utility is purely presentational — no game-specific logic. It converts a `ResolvedEdgeVisual` (from `VisualConfigProvider`) to a PixiJS-compatible stroke style.
3. No backwards-compatibility shims. The private `resolveStrokeStyle` in `adjacency-renderer.ts` is replaced by the shared function.

## What to Change

### 1. Create shared edge stroke resolver

Create `packages/runner/src/canvas/renderers/resolve-edge-stroke-style.ts`:
- Export `resolveEdgeStrokeStyle(resolved: ResolvedEdgeVisual, fallback: ResolvedEdgeVisual): EdgeStrokeStyle`
- Move the `parseHexColor` + fallback logic from `adjacency-renderer.ts`'s private `resolveStrokeStyle` into this shared function.
- Add a JSDoc comment documenting the PixiJS 8 constraint: adjacency lines must use a single continuous path per `stroke()` call; many `moveTo/lineTo` sub-paths in a single `stroke()` are unreliable due to PixiJS 8 WebGL tessellation regressions.

### 2. Game canvas adjacency renderer uses shared function

In `packages/runner/src/canvas/renderers/adjacency-renderer.ts`:
- Replace the private `resolveStrokeStyle` with an import of `resolveEdgeStrokeStyle`.
- Adapt the call to use the shared signature.

### 3. Map editor adjacency renderer uses shared function

In `packages/runner/src/map-editor/map-editor-adjacency-renderer.ts`:
- Import `resolveEdgeStrokeStyle`.
- Use it to convert the `VisualConfigProvider` result (from 88ADJUNIFY-001) to a PixiJS-compatible stroke style.

## Files to Touch

- `packages/runner/src/canvas/renderers/resolve-edge-stroke-style.ts` (new)
- `packages/runner/src/canvas/renderers/adjacency-renderer.ts` (modify)
- `packages/runner/src/map-editor/map-editor-adjacency-renderer.ts` (modify)
- `packages/runner/test/canvas/renderers/resolve-edge-stroke-style.test.ts` (new)

## Out of Scope

- Unifying the drawing strategies (edge-clipping vs center-to-center) — the two renderers have legitimately different geometry needs.
- Dashed-line rendering — blocked by PixiJS 8 regression; revisit when PixiJS fixes the multi-sub-path issue.
- Connection route renderer stroke resolution — uses a separate `ResolvedStroke` type with wavy/amplitude properties.

## Acceptance Criteria

### Tests That Must Pass

1. `resolveEdgeStrokeStyle` correctly converts `{ color: '#ff0000', width: 5, alpha: 0.8 }` → `{ color: 0xff0000, width: 5, alpha: 0.8 }`.
2. `resolveEdgeStrokeStyle` falls back to the provided fallback color when the resolved color is null or unparseable.
3. Both adjacency renderers produce identical stroke styles for the same `VisualConfigProvider` config.
4. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. No duplicated `parseHexColor` + fallback logic across adjacency renderers.
2. The PixiJS 8 stroke constraint is documented in the shared module.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/renderers/resolve-edge-stroke-style.test.ts` — unit tests for color parsing, fallback behavior, null handling.
2. `packages/runner/test/canvas/renderers/adjacency-renderer.test.ts` — verify import of shared function (existing stroke style assertions still pass).
3. `packages/runner/test/map-editor/map-editor-adjacency-renderer.test.ts` — verify stroke style matches shared function output.

### Commands

1. `pnpm -F @ludoforge/runner test -- --testPathPattern resolve-edge-stroke`
2. `pnpm -F @ludoforge/runner typecheck && pnpm -F @ludoforge/runner lint && pnpm -F @ludoforge/runner test`
