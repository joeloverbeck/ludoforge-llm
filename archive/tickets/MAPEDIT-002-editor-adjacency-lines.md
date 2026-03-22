# MAPEDIT-002: Show read-only adjacency lines in Map Editor

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

The Map Editor does not show adjacency lines between zones. In play-mode, thin gray lines connect adjacent zones (via `adjacency-renderer.ts`), giving the user spatial context. The editor canvas creates 4 layers (background, route, zone, handle) but has no adjacency layer or renderer. Users cannot see which zones are adjacent while editing zone positions.

## Assumption Reassessment (2026-03-22)

1. The editor does not currently render adjacency, but it already mounts its logical layers into the shared game-canvas hierarchy from `packages/runner/src/canvas/layers.ts`. The right insertion point is the existing shared `adjacencyLayer`, not a new ad hoc layer stack under `interfaceGroup`.
2. `packages/runner/src/map-editor/map-editor-canvas.ts` currently exposes only `background`, `route`, `zone`, and `handle` in `EditorLayerSet`; this is the actual gap that prevents editor adjacency rendering.
3. Play-mode `packages/runner/src/canvas/renderers/adjacency-renderer.ts` is coupled to presentation-scene data (`PresentationAdjacencyNode`, highlight/category styling, disposal queue lifecycle). It should not be reused directly by the editor.
4. Raw `GameDef.zones[].adjacentTo` data is not sufficient on its own for the editor renderer. To stay aligned with the runner’s layout semantics, adjacency rendering should use the same board-zone partitioning and undirected edge deduplication rules as `packages/runner/src/layout/build-layout-graph.ts`:
   - skip internal zones
   - ignore aux-only adjacency
   - collapse symmetric / repeated pairs into one visual line
   - skip self-edges
5. Zone center positions are available from the editor store’s `zonePositions` map and are the correct source of truth for redraws while dragging.

## Architecture Check

1. An editor-specific renderer is still the right architecture, but it should be a minimal read-only overlay tailored to editor needs rather than a copy of the play-mode renderer.
2. Because the overlay is non-interactive and has no per-edge state, the cleanest implementation is a single `Graphics` object that redraws the full adjacency set when zone positions change. A per-pair display-object map would add lifecycle complexity without architectural benefit.
3. Adjacency pair derivation should be aligned with existing layout-graph rules instead of re-encoding slightly different edge semantics inside the editor. If a tiny shared helper is needed to avoid duplicated dedupe logic, prefer that over copy-paste.
4. All changes remain runner-only and game-agnostic. No shims or alias paths.

## What to Change

### 1. New editor adjacency renderer

Create `map-editor-adjacency-renderer.ts`:
- Accept the editor adjacency layer and store
- Derive the immutable adjacency pair set once from the store’s `gameDef`, using the same board partition / undirected dedupe semantics as layout graph construction
- Own a single non-interactive `Graphics` object and redraw all visible adjacency lines from `store.zonePositions`
- Subscribe to `zonePositions` changes to redraw on drag
- Styling should match the default play-mode adjacency stroke: gray, width `1.5`, alpha `0.3`

### 2. Add adjacency layer to EditorLayerSet

In `map-editor-types.ts`, add `adjacency: Container` to `EditorLayerSet`.

### 3. Create and mount adjacency layer in editor canvas

In `map-editor-canvas.ts` `createEditorLayers()`, create the adjacency container and mount it into the shared `adjacencyLayer`. Preserve the same ordering as the shared play-mode layer hierarchy: below connection routes, above regions/background.

### 4. Wire adjacency renderer lifecycle in MapEditorScreen

In `MapEditorScreen.tsx`, instantiate `createEditorAdjacencyRenderer()` after creating the canvas and destroy it alongside the other editor renderers.

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

1. Editor adjacency renders one line per undirected board adjacency pair
2. Symmetric / repeated adjacency entries are visually deduplicated
3. Aux/internal/self-only adjacency entries are not rendered
4. Lines update position when zones move
5. Adjacency layer remains non-interactive
6. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Adjacency lines are purely visual — they do not affect zone dragging, route selection, or any editor interactions
2. No game-specific logic in the renderer — it reads generic `adjacentTo` arrays from GameDef

## Test Plan

### New/Modified Tests

1. `packages/runner/test/map-editor/map-editor-adjacency-renderer.test.ts` — verify board-only undirected adjacency rendering, dedupe, and redraw-on-move behavior
2. `packages/runner/test/map-editor/map-editor-canvas.test.ts` — verify adjacency layer mounts into the shared adjacency layer and remains non-interactive
3. `packages/runner/test/map-editor/MapEditorScreen.test.tsx` — verify adjacency renderer lifecycle is wired into screen startup/cleanup
4. `packages/runner/test/map-editor/map-editor-types.test.ts` — keep the editor layer contract in sync with the added adjacency layer

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner lint`
3. `pnpm -F @ludoforge/runner typecheck`

## Outcome

- Completion date: 2026-03-22
- What actually changed:
  - Added a dedicated editor adjacency renderer at `packages/runner/src/map-editor/map-editor-adjacency-renderer.ts`
  - Extended the editor canvas layer contract with an `adjacency` layer and mounted it into the shared canvas `adjacencyLayer`
  - Wired adjacency renderer lifecycle into `MapEditorScreen`
  - Extracted shared layout adjacency-pair collection in `packages/runner/src/layout/build-layout-graph.ts` so the editor uses the same board-only undirected dedupe semantics as layout graph construction
  - Added focused renderer/lifecycle/type tests and strengthened layout adjacency helper coverage
- Deviations from original plan:
  - Implemented the overlay as a single redrawable `Graphics` object rather than a per-pair graphics map because editor adjacency is read-only and non-interactive
  - Reused shared layout adjacency semantics instead of scanning raw `GameDef.zones[].adjacentTo` independently inside the editor
  - Mounted into the existing shared `adjacencyLayer` instead of introducing a separate editor-only stacking convention
- Verification results:
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner lint`
  - `pnpm -F @ludoforge/runner typecheck`
