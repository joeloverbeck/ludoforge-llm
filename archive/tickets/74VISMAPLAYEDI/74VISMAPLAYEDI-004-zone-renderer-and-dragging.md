# 74VISMAPLAYEDI-004: Editor Zone Renderer and Zone Dragging

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: 74VISMAPLAYEDI-002, 74VISMAPLAYEDI-003

## Problem

Zones must render on the editor canvas at their initial ForceAtlas2 positions (or fixed positions from visual config) and be draggable. When a zone is dragged, its position updates in the editor store, and connection routes that reference the zone re-render in real-time.

## Assumption Reassessment (2026-03-21)

1. `drawZoneShape(base, shape, dimensions, options)` in `shape-utils.ts` draws any zone shape. Confirmed.
2. `resolveVisualDimensions(visual, defaults)` resolves width/height. Confirmed.
3. `parseHexColor(color)` converts hex strings to PixiJS color numbers. Confirmed.
4. Zone shapes are: circle, rectangle, hexagon, diamond, ellipse, triangle, line, octagon, connection. Confirmed.
5. PixiJS drag pattern: `eventMode = 'static'`, `cursor = 'grab'`, `pointerdown` → `globalpointermove` → `pointerup`. Standard PixiJS 8 pattern.
6. `ZoneDef` does not carry a `displayName`. Editor labels must follow the runner's existing source of truth: `visualConfigProvider.getZoneLabel(zoneId) ?? formatIdAsDisplayName(zoneId)`.
7. The editor store already exposes interaction batching primitives: `beginInteraction`, `previewZoneMove`, `commitInteraction`, and `cancelInteraction`. Dragging must use those APIs rather than mutating `zonePositions` directly during preview.
8. `createEditorCanvas` and `EditorLayerSet` already exist. This ticket should attach zone rendering to the existing `layers.zone` contract rather than redefining screen/bootstrap ownership.

## Architecture Check

1. Editor zone renderer is lightweight — uses `drawZoneShape` utilities but has simpler inputs than game zone renderer (no `PresentationZoneNode`, no animation state).
2. Dragging must reuse the store's existing preview/commit interaction boundary: preview updates are batched within a single interaction, then committed once on `pointerup` (immutable update, Foundation 7).
3. Game-agnostic — renders any game's zones (Foundation 1).
4. This ticket implements renderer and interaction modules only. Canvas bootstrap remains owned by the existing `createEditorCanvas`, while screen-level composition remains owned by `74VISMAPLAYEDI-005`.

## What to Change

### 1. Create editor zone renderer

New file `packages/runner/src/map-editor/map-editor-zone-renderer.ts`:

**`createEditorZoneRenderer(zoneLayer: Container, store: MapEditorStoreApi, visualConfigProvider: VisualConfigProvider)`**:
- For each zone in `store.getState().zonePositions`:
  - Create a `Container` per actual `gameDef.zones` entry, positioned from `store.getState().zonePositions`
  - Draw zone shape using `drawZoneShape` with visual config resolved dimensions and colors
  - Add a `BitmapText` label using `visualConfigProvider.getZoneLabel(zoneId) ?? formatIdAsDisplayName(zoneId)`
  - Set `eventMode = 'static'`, `cursor = 'grab'`
  - Wire up drag listeners (see below)
- Subscribe to store state so position and selection highlight stay in sync
- Return renderer object with `destroy()` for cleanup

### 2. Create drag interaction module

New file `packages/runner/src/map-editor/map-editor-drag.ts`:

**Zone drag logic**:
- `pointerdown`: Record offset between pointer world position and container position, call `store.beginInteraction()`, set `cursor = 'grabbing'`, set `store.setDragging(true)`, and update selection (`selectZone(zoneId)`, `selectRoute(null)`)
- `globalpointermove`: Compute new position = pointer world position - offset, optionally snap to grid, call `store.previewZoneMove(zoneId, nextPosition)` for live preview without per-frame undo pushes
- `pointerup` / `pointerupoutside`: Call `store.commitInteraction()`, set `cursor = 'grab'`, set `store.setDragging(false)`
- `pointerupoutside` before any preview delta still closes the interaction cleanly without creating history
- `destroy()`: remove all event listeners registered by the drag binding

**Snap-to-grid helper** (exported, pure function):
- `snapToGrid(position: Position, gridSize: number): Position` — rounds to nearest grid increment

### 3. Zone selection

- Selection happens on zone `pointerdown` inside the drag binding so drag start and selection do not compete
- Selected zone gets a highlight outline (thicker border or glow)

## Files to Touch

- `tickets/74VISMAPLAYEDI-004-zone-renderer-and-dragging.md`
- `packages/runner/src/map-editor/map-editor-zone-renderer.ts` (new)
- `packages/runner/src/map-editor/map-editor-drag.ts` (new)
- `packages/runner/test/map-editor/map-editor-zone-renderer.test.ts` (new)
- `packages/runner/test/map-editor/map-editor-drag.test.ts` (new)

## Out of Scope

- Connection route rendering (74VISMAPLAYEDI-006)
- Handle rendering and dragging (74VISMAPLAYEDI-006, 007)
- Waypoint operations (74VISMAPLAYEDI-007)
- Grid overlay rendering (74VISMAPLAYEDI-011)
- MapEditorScreen component (74VISMAPLAYEDI-005)
- Modifying `shape-utils.ts`, `zone-renderer.ts`, or any existing renderer

## Follow-up Architecture Note

- Recommended for `74VISMAPLAYEDI-005` and later editor tickets: introduce a single editor-scene/bootstrap seam that owns `createEditorCanvas`, instantiates editor renderers/interactions, and centralizes teardown. Keep `MapEditorScreen` responsible for React/session composition only, while Pixi scene wiring lives behind that seam. This preserves clean ownership boundaries as route rendering, handle rendering, and editor-wide shortcuts are added.

## Acceptance Criteria

### Tests That Must Pass

1. Zone renderer creates one container per zone in the store's `zonePositions` map.
2. Zone renderer creates one container per `gameDef.zones` entry that has a position in the store, ignoring non-zone `zonePositions` entries.
3. Each zone container is positioned at the zone's coordinates from the store.
4. Zone labels prefer `visualConfig` overrides and otherwise fall back to `formatIdAsDisplayName(zoneId)`.
4. `snapToGrid({x: 17, y: 23}, 10)` returns `{x: 20, y: 20}`.
5. `snapToGrid({x: 5, y: 5}, 10)` returns `{x: 10, y: 10}` (or `{x: 0, y: 0}` depending on rounding — document chosen behavior).
6. After a simulated drag (pointerdown → pointermove → pointerup), the store's `zonePositions` has the new position.
7. Zone drag uses `previewZoneMove` during movement and pushes exactly one undo entry on commit.
8. Selection highlight tracks `selectedZoneId`.
9. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. No modification to `shape-utils.ts`, `zone-renderer.ts`, or any existing renderer module.
2. Drag commits produce immutable state updates (Foundation 7).
3. Zone renderer is game-agnostic — no game-specific rendering logic (Foundation 1).
4. The zone renderer stays lifecycle-local: no game loading, no store creation, no session navigation, and no editor-wide orchestration logic.
5. Label resolution matches runner-wide display-name behavior: visual-config override first, formatted ID fallback second.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/map-editor/map-editor-zone-renderer.test.ts` — zone filtering against `gameDef.zones`, label resolution, position sync, selection highlight
2. `packages/runner/test/map-editor/map-editor-drag.test.ts` — snap-to-grid math, drag lifecycle, preview batching, final commit, no-history no-op release

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner lint`

## Outcome

- Outcome amended: 2026-03-22
- Completion date: 2026-03-22
- What actually changed:
  - Added `map-editor-zone-renderer.ts` to render one draggable Pixi container per real game zone, with visuals resolved from `VisualConfigProvider`, label resolution aligned to runner behavior, and selection highlighting driven from editor state.
  - Added `map-editor-drag.ts` with a pure `snapToGrid` helper plus zone drag bindings that reuse the existing store interaction API (`beginInteraction` / `previewZoneMove` / `commitInteraction`) instead of introducing direct preview mutations.
  - Added focused tests for zone rendering, label fallback, selection highlight, drag batching, grid snapping, no-op release, and cleanup behavior.
  - Corrected the ticket assumptions and scope before implementation so it reflects the existing `createEditorCanvas` and store contracts.
- Deviations from original plan:
  - Labels do not come from `ZoneDef.displayName` because that field does not exist. The implementation follows `visualConfigProvider.getZoneLabel(zoneId) ?? formatIdAsDisplayName(zoneId)`.
  - Drag preview does not write directly to `zonePositions`; it goes through the store's preview/commit interaction boundary to preserve single-entry undo semantics.
  - The renderer exposes an optional `dragSurface` override so future screen/canvas composition can bind global drag movement to the most appropriate Pixi surface without changing the renderer contract.
- Verification results:
  - `pnpm -F @ludoforge/runner test` ✅
  - `pnpm -F @ludoforge/runner typecheck` ✅
  - `pnpm -F @ludoforge/runner lint` ✅
