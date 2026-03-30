# 99MAPEDIREN-002: Align editor layer hierarchy to game canvas structure

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: `specs/99-map-editor-renderer-unification.md`

## Problem

The map editor canvas uses a 5-layer structure (`background`, `adjacency`, `route`, `zone`, `handle`) that does not match the game canvas 7-layer structure (`backgroundLayer`, `regionLayer`, `provinceZoneLayer`, `connectionRouteLayer`, `cityZoneLayer`, `adjacencyLayer`, `tableOverlayLayer`). Game canvas renderers expect specific layers by name and ordering. Before game canvas renderers can be reused in the editor (99MAPEDIREN-004), the layer hierarchy must align.

## Assumption Reassessment (2026-03-30)

1. Current `EditorLayerSet` has 5 containers: `background`, `adjacency`, `route`, `zone`, `handle` — CONFIRMED in `map-editor-types.ts`.
2. Game canvas `LayerHierarchy` has 7+ board-level containers plus groups — CONFIRMED in `layers.ts`.
3. `createEditorLayers()` in `map-editor-canvas.ts` maps editor layers to shared layers from `createBoardLayers()` — CONFIRMED.
4. The `map-editor-canvas.test.ts` and `MapEditorScreen.test.tsx` tests exercise the current layer structure — CONFIRMED.

## Architecture Check

1. Expanding `EditorLayerSet` to include `regionLayer`, `provinceZoneLayer`, and `tableOverlayLayer` (plus renaming for consistency) is the minimal change needed for renderer reuse. No over-engineering — just alignment.
2. No engine changes. No GameSpecDoc/GameDef boundary affected. Purely internal runner layer plumbing.
3. No backwards-compatibility shims. Old layer names are replaced, not aliased.

## What to Change

### 1. Update `EditorLayerSet` in `map-editor-types.ts`

Expand from 5 to 8 layers to match game canvas structure plus the editor-specific `handle` layer:

```typescript
export interface EditorLayerSet {
  readonly backgroundLayer: Container;
  readonly regionLayer: Container;
  readonly provinceZoneLayer: Container;
  readonly connectionRouteLayer: Container;
  readonly cityZoneLayer: Container;
  readonly adjacencyLayer: Container;
  readonly tableOverlayLayer: Container;
  readonly handleLayer: Container;  // editor-specific
}
```

### 2. Update `createEditorLayers()` in `map-editor-canvas.ts`

Create and wire the expanded layer set. Ensure z-ordering matches game canvas:
1. backgroundLayer
2. regionLayer
3. provinceZoneLayer
4. connectionRouteLayer
5. cityZoneLayer
6. adjacencyLayer
7. tableOverlayLayer
8. handleLayer (editor-specific, on top)

### 3. Update all editor references to old layer names

All files that reference `editorLayers.background`, `.adjacency`, `.route`, `.zone`, `.handle` must be updated to the new names. This includes `MapEditorScreen.tsx`, `map-editor-canvas.ts`, and any renderer wiring.

## Files to Touch

- `packages/runner/src/map-editor/map-editor-types.ts` (modify — expand `EditorLayerSet`)
- `packages/runner/src/map-editor/map-editor-canvas.ts` (modify — update `createEditorLayers()` and layer wiring)
- `packages/runner/src/map-editor/MapEditorScreen.tsx` (modify — update layer name references)
- `packages/runner/test/map-editor/map-editor-canvas.test.ts` (modify — update assertions for new layer names)
- `packages/runner/test/map-editor/MapEditorScreen.test.tsx` (modify — update any layer references in mocks)
- `packages/runner/test/map-editor/map-editor-types.test.ts` (modify — if it tests EditorLayerSet shape)

## Out of Scope

- Game canvas `layers.ts` changes (game canvas layer structure is NOT modified)
- Editor renderer logic changes (renderers still use old wiring until 99MAPEDIREN-004)
- Presentation adapter (99MAPEDIREN-003)
- Polyline utility extraction (99MAPEDIREN-001)
- Deleting editor renderers (99MAPEDIREN-005)
- Any engine package changes

## Acceptance Criteria

### Tests That Must Pass

1. `map-editor-canvas.test.ts` — layer creation asserts all 8 layers exist, z-ordering is correct, layers are attached to parent containers.
2. `MapEditorScreen.test.tsx` — screen renders without errors with the expanded layer set.
3. `map-editor-types.test.ts` — if it has structural assertions, they reflect the new interface shape.
4. Existing editor renderer tests continue to pass (they will be updated to reference new layer names).
5. Existing suite: `pnpm -F @ludoforge/runner test`
6. Typecheck: `pnpm -F @ludoforge/runner typecheck`
7. Lint: `pnpm -F @ludoforge/runner lint`

### Invariants

1. Game canvas `LayerHierarchy` in `layers.ts` is NOT changed.
2. The z-ordering of editor layers matches game canvas ordering for the shared layers.
3. The `handleLayer` remains the topmost layer (above all game canvas layers).
4. Editor still functions identically — this ticket only restructures containers, not rendering.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/map-editor/map-editor-canvas.test.ts` — update layer creation assertions to verify all 8 layers and correct z-ordering
2. `packages/runner/test/map-editor/MapEditorScreen.test.tsx` — update mocks/assertions referencing layer names
3. `packages/runner/test/map-editor/map-editor-types.test.ts` — update if structural checks exist

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose map-editor-canvas`
2. `pnpm -F @ludoforge/runner test -- --reporter=verbose MapEditorScreen`
3. `pnpm -F @ludoforge/runner typecheck && pnpm -F @ludoforge/runner lint`
