# 88ADJUNIFY-001: Map editor adjacency renderer consumes VisualConfigProvider for edge styling

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

The map editor adjacency renderer (`map-editor-adjacency-renderer.ts`) uses a hardcoded `DEFAULT_LINE_STYLE` constant for adjacency line color, width, and alpha. Every other map editor renderer (zones, routes, handles) already receives and uses `VisualConfigProvider`. This violates Foundation #3 (Visual Separation): "Game-specific visual presentation data SHALL live in `visual-config.yaml`."

The hardcoded style drifted independently from the game canvas adjacency renderer's config-driven style, causing a multi-session debugging failure where 7+ commits modified the wrong renderer because both had independent style constants.

## Assumption Reassessment (2026-03-27)

1. `createEditorAdjacencyRenderer` currently takes `(adjacencyLayer, store)` — confirmed at `map-editor-adjacency-renderer.ts:16-18`. It does NOT receive `VisualConfigProvider`.
2. `MapEditorScreen.tsx:127-130` calls `createEditorAdjacencyRenderer(canvas.layers.adjacency, screenState.editor.store)` — `screenState.editor.visualConfigProvider` IS available at the call site but is not passed.
3. `VisualConfigProvider.resolveEdgeStyle(category, isHighlighted)` exists and returns `ResolvedEdgeVisual { color: string | null; width: number; alpha: number }` — confirmed at `visual-config-provider.ts:349-365`.
4. The FITL `visual-config.yaml` already has `edges.default: { color: "#ffffff", width: 4, alpha: 0.9 }` — confirmed.
5. No mismatch found.

## Architecture Check

1. This is the minimal change that fixes the Foundation #3 violation. The map editor adjacency renderer gains one new parameter (`VisualConfigProvider`) and uses `resolveEdgeStyle()` instead of a hardcoded constant, matching the pattern already used by every other map editor renderer.
2. No game-specific logic introduced. `resolveEdgeStyle` is game-agnostic — it reads from the generic `edges` config section.
3. No backwards-compatibility shims. The hardcoded constant is deleted outright.

## What to Change

### 1. Add `visualConfigProvider` parameter to `createEditorAdjacencyRenderer`

In `packages/runner/src/map-editor/map-editor-adjacency-renderer.ts`:
- Add `visualConfigProvider: VisualConfigProvider` as the third parameter.
- Remove the `DEFAULT_LINE_STYLE` constant.
- In the `render` function, call `visualConfigProvider.resolveEdgeStyle(null, false)` to get the resolved style.
- Convert the resolved string color to a numeric color using `parseHexColor` (from `shape-utils.ts`), matching the pattern in `adjacency-renderer.ts`'s `resolveStrokeStyle`.
- Pass the resolved `{ color, width, alpha }` to `graphics.stroke()`.

### 2. Pass `visualConfigProvider` at the call site

In `packages/runner/src/map-editor/MapEditorScreen.tsx`:
- Update the `createEditorAdjacencyRenderer` call (line ~127) to pass `screenState.editor.visualConfigProvider` as the third argument.

## Files to Touch

- `packages/runner/src/map-editor/map-editor-adjacency-renderer.ts` (modify)
- `packages/runner/src/map-editor/MapEditorScreen.tsx` (modify)
- `packages/runner/test/map-editor/map-editor-adjacency-renderer.test.ts` (modify)

## Out of Scope

- Changing the game canvas adjacency renderer (`adjacency-renderer.ts`) — it already uses `VisualConfigProvider`.
- Extracting a shared drawing utility — see 88ADJUNIFY-002.
- Changing the connection route renderer's `DEFAULT_ROUTE_STROKE` — separate concern.

## Acceptance Criteria

### Tests That Must Pass

1. Map editor adjacency renderer test uses a mock `VisualConfigProvider` and verifies the stroke style comes from `resolveEdgeStyle()`, not a hardcoded constant.
2. When `VisualConfigProvider` returns a custom edge style (e.g., `{ color: '#ff0000', width: 6, alpha: 1 }`), the renderer applies that style to `graphics.stroke()`.
3. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Adjacency line styling in the map editor is fully determined by `visual-config.yaml` via `VisualConfigProvider`.
2. No hardcoded color, width, or alpha values for adjacency lines remain in map editor source.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/map-editor/map-editor-adjacency-renderer.test.ts` — update fixture to provide a mock `VisualConfigProvider`; assert `graphics.strokeStyle` matches the resolved config values, not hardcoded constants.

### Commands

1. `pnpm -F @ludoforge/runner test -- --testPathPattern map-editor-adjacency`
2. `pnpm -F @ludoforge/runner typecheck && pnpm -F @ludoforge/runner lint && pnpm -F @ludoforge/runner test`
