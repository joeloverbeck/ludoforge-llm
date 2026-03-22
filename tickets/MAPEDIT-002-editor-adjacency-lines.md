# MAPEDIT-002: Show read-only adjacency lines in Map Editor

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

The Map Editor does not show adjacency lines between zones. In play-mode, thin gray lines connect adjacent zones (via `adjacency-renderer.ts`), giving the user spatial context. The editor canvas creates 4 layers (background, route, zone, handle) but has no adjacency layer or renderer. Users cannot see which zones are adjacent while editing zone positions.

## Assumption Reassessment (2026-03-22)

1. Editor canvas layers confirmed in `map-editor-canvas.ts` `createEditorLayers()`: background, route, zone, handle — no adjacency. Confirmed via grep: zero matches for "adjacency" in the `map-editor/` directory.
2. Play-mode layer hierarchy in `layers.ts` lines 70-77: adjacency layer sits between `regionLayer` and `connectionRouteLayer` in `boardGroup`.
3. Play-mode `adjacency-renderer.ts` depends on `PresentationAdjacencyNode` and `DisposalQueue` — coupled to the presentation pipeline, cannot be reused directly.
4. `GameDef.zones[].adjacentTo` arrays provide the adjacency data needed. Zone positions available from the store's `zonePositions` map.

## Architecture Check

1. A lightweight editor-specific adjacency renderer avoids coupling the editor to the play-mode presentation pipeline. It reads directly from GameDef and store state — simpler and more maintainable than adapting the play-mode renderer.
2. All changes are runner-only. Adjacency data comes from GameDef (which is game-agnostic). No game-specific branching.
3. No backwards-compatibility shims. New layer added cleanly to the existing layer set.

## What to Change

### 1. New editor adjacency renderer

Create `map-editor-adjacency-renderer.ts`:
- Accept the adjacency layer container, store, and GameDef
- Build an adjacency pair list from `gameDef.zones[].adjacentTo` arrays
- Draw simple `Graphics` lines between zone center positions from `store.zonePositions`
- Subscribe to `zonePositions` changes to redraw on drag
- Non-interactive: `eventMode: 'none'`
- Styling: gray (#9ca3af), width 1.5, alpha 0.3 (matching play-mode `adjacency-renderer.ts` defaults)

### 2. Add adjacency layer to EditorLayerSet

In `map-editor-types.ts`, add `adjacency: Container` to `EditorLayerSet`.

### 3. Create and mount adjacency layer in editor canvas

In `map-editor-canvas.ts` `createEditorLayers()`, create the adjacency container. Mount it between route and zone layers (or between background and route, matching play-mode ordering where adjacency is below connection routes).

### 4. Wire adjacency renderer lifecycle in MapEditorScreen

In `MapEditorScreen.tsx`, instantiate `createEditorAdjacencyRenderer()` after creating the canvas. Wire its `destroy()` into the cleanup chain.

## Files to Touch

- `packages/runner/src/map-editor/map-editor-adjacency-renderer.ts` (new)
- `packages/runner/src/map-editor/map-editor-types.ts` (modify)
- `packages/runner/src/map-editor/map-editor-canvas.ts` (modify)
- `packages/runner/src/map-editor/MapEditorScreen.tsx` (modify)

## Out of Scope

- Making adjacency lines editable (they reflect GameDef data, not visual config)
- Adjacency highlighting on hover or selection
- Route editing (MAPEDIT-001, MAPEDIT-003, MAPEDIT-004)

## Acceptance Criteria

### Tests That Must Pass

1. Adjacency lines drawn between each pair of adjacent zones
2. Lines update position when zones are dragged
3. Non-adjacent zone pairs have no line drawn
4. Adjacency layer has `eventMode: 'none'` (non-interactive)
5. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Adjacency lines are purely visual — they do not affect zone dragging, route selection, or any editor interactions
2. No game-specific logic in the renderer — it reads generic `adjacentTo` arrays from GameDef

## Test Plan

### New/Modified Tests

1. `packages/runner/test/map-editor/map-editor-adjacency-renderer.test.ts` — verify lines drawn for adjacent pairs, positions update on drag, non-adjacent pairs excluded

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner lint && pnpm -F @ludoforge/runner typecheck`
