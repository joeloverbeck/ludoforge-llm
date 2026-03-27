# 88ADJUNIFY-001: Map editor adjacency renderer consumes VisualConfigProvider for edge styling

**Status**: ✅ COMPLETED
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
3. The actual provider module path is `packages/runner/src/config/visual-config-provider.ts`, not `packages/runner/src/rendering/visual-config-provider.ts`.
4. `VisualConfigProvider.resolveEdgeStyle(category, isHighlighted)` exists and returns `ResolvedEdgeVisual { color: string | null; width: number; alpha: number }` — confirmed at `packages/runner/src/config/visual-config-provider.ts:349-363`.
5. The shared game-canvas adjacency renderer lives at `packages/runner/src/canvas/renderers/adjacency-renderer.ts`, not `packages/runner/src/rendering/adjacency-renderer.ts`.
6. The shared `parseHexColor` helper lives at `packages/runner/src/canvas/renderers/shape-utils.ts`, not `packages/runner/src/rendering/shape-utils.ts`.
7. FITL does define `edges.default`, but the current values are `{ color: "#ffffff", width: 3.5, alpha: 0.85 }`, matching `VisualConfigProvider` defaults rather than the ticket's earlier `4 / 0.9` claim.
8. Existing tests do not yet cover `VisualConfigProvider` wiring for the map editor adjacency renderer, and `MapEditorScreen.test.tsx` currently asserts the old two-argument call signature.

## Architecture Check

1. This is the minimal change that fixes the Foundation #3 violation. The map editor adjacency renderer gains one new parameter (`VisualConfigProvider`) and uses `resolveEdgeStyle()` instead of a hardcoded constant, matching the pattern already used by every other map editor renderer.
2. No game-specific logic introduced. `resolveEdgeStyle` is game-agnostic — it reads from the generic `edges` config section.
3. No backwards-compatibility shims. The hardcoded constant is deleted outright.
4. The current runner architecture still duplicates edge-style parsing between the game-canvas adjacency renderer and the map editor adjacency renderer. That duplication is acceptable for this small fix, but the cleaner long-term architecture is a shared edge-stroke resolver used by both renderers. That extraction stays out of scope for this ticket unless the implementation proves awkward.

## What to Change

### 1. Add `visualConfigProvider` parameter to `createEditorAdjacencyRenderer`

In `packages/runner/src/map-editor/map-editor-adjacency-renderer.ts`:
- Add `visualConfigProvider: VisualConfigProvider` as the third parameter.
- Remove the `DEFAULT_LINE_STYLE` constant.
- In the `render` function, call `visualConfigProvider.resolveEdgeStyle(null, false)` to get the resolved style.
- Convert the resolved string color to a numeric color using `parseHexColor` from `packages/runner/src/canvas/renderers/shape-utils.ts`, matching the pattern in `packages/runner/src/canvas/renderers/adjacency-renderer.ts`'s `resolveStrokeStyle`.
- Pass the resolved `{ color, width, alpha }` to `graphics.stroke()`.

### 2. Pass `visualConfigProvider` at the call site

In `packages/runner/src/map-editor/MapEditorScreen.tsx`:
- Update the `createEditorAdjacencyRenderer` call (line ~127) to pass `screenState.editor.visualConfigProvider` as the third argument.

## Files to Touch

- `packages/runner/src/map-editor/map-editor-adjacency-renderer.ts` (modify)
- `packages/runner/src/map-editor/MapEditorScreen.tsx` (modify)
- `packages/runner/test/map-editor/map-editor-adjacency-renderer.test.ts` (modify)
- `packages/runner/test/map-editor/MapEditorScreen.test.tsx` (modify)

## Out of Scope

- Changing the game canvas adjacency renderer (`adjacency-renderer.ts`) — it already uses `VisualConfigProvider`.
- Extracting a shared drawing utility — see 88ADJUNIFY-002.
- Changing the connection route renderer's `DEFAULT_ROUTE_STROKE` — separate concern.

## Acceptance Criteria

### Tests That Must Pass

1. Map editor adjacency renderer test uses a mock `VisualConfigProvider` and verifies the stroke style comes from `resolveEdgeStyle()`, not a hardcoded constant.
2. When `VisualConfigProvider` returns a custom edge style (e.g., `{ color: '#ff0000', width: 6, alpha: 1 }`), the renderer applies that style to `graphics.stroke()`.
3. `MapEditorScreen` test verifies the screen passes `screenState.editor.visualConfigProvider` into `createEditorAdjacencyRenderer`.
4. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Adjacency line styling in the map editor is fully determined by `visual-config.yaml` via `VisualConfigProvider`.
2. No hardcoded color, width, or alpha values for adjacency lines remain in map editor source.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/map-editor/map-editor-adjacency-renderer.test.ts` — update fixture to provide a mock `VisualConfigProvider`; assert `graphics.strokeStyle` matches the resolved config values, not hardcoded constants.
2. `packages/runner/test/map-editor/MapEditorScreen.test.tsx` — update the renderer-construction assertion to require the `visualConfigProvider` third argument.

### Commands

1. `pnpm -F @ludoforge/runner test -- map-editor-adjacency-renderer`
2. `pnpm -F @ludoforge/runner test -- MapEditorScreen`
3. `pnpm -F @ludoforge/runner typecheck`
4. `pnpm -F @ludoforge/runner lint`
5. `pnpm -F @ludoforge/runner test`

## Outcome

- Completion date: 2026-03-27
- What actually changed:
  - `packages/runner/src/map-editor/map-editor-adjacency-renderer.ts` now accepts `VisualConfigProvider`, resolves edge styling through `resolveEdgeStyle(null, false)`, converts configured colors with `parseHexColor`, and no longer contains a hardcoded adjacency stroke constant.
  - `packages/runner/src/map-editor/MapEditorScreen.tsx` now passes `screenState.editor.visualConfigProvider` into `createEditorAdjacencyRenderer`.
  - `packages/runner/test/map-editor/map-editor-adjacency-renderer.test.ts` now verifies provider-driven stroke styling and fallback behavior for an unparsable configured color.
  - `packages/runner/test/map-editor/MapEditorScreen.test.tsx` now verifies the adjacency renderer receives the provider dependency.
- Deviations from original plan:
  - The ticket itself was corrected first because its module paths, FITL edge-default assumption, and targeted test command no longer matched the codebase.
  - A fallback-color test was added because this change exposed a renderer invariant: config-driven colors still need a deterministic numeric fallback when parsing fails.
- Verification results:
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm -F @ludoforge/runner test` passed (`197` files, `2017` tests).
