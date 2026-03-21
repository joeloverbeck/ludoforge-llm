# Spec 74 — Visual Map Layout Editor

## Problem

The runner renders board game maps using ForceAtlas2 force-directed layout based on zone adjacency. While topologically correct, this produces geographically unrealistic maps:

- **Roads go nowhere**: Bézier curve roads terminate at the viewport edge where force-directed layout placed zones that should be elsewhere.
- **Rivers end abruptly**: Mekong river lines end in empty space — on the physical board they connect to towns (Chau Doc, Bac Lieu, Long Phu) that exist geographically but have no game mechanics.
- **No geographic fidelity**: Force-directed layout optimizes for graph readability, not geographic realism. The physical FITL board was hand-authored with careful geographic placement.

The auto-layout system should be retained as the default, but games need a way to author exact zone positions and connector curves visually.

## Solution

A **Visual Map Layout Editor** — a new screen in the runner app where users can:

1. Start from ForceAtlas2 auto-layout positions as initial placement
2. Drag zones to reposition them
3. Reshape connector curves (roads/rivers) by dragging Bézier control points and anchor endpoints
4. Insert/remove waypoints to split curves into multi-segment paths
5. Export the result as an updated `visual-config.yaml` file (browser download)

The editor is a **repositioning tool** — it does not add or remove map elements. All zones, connections, and routes must already exist in the game's visual-config.yaml.

## Foundations Alignment

- **F1 (Engine Agnosticism)**: Editor is game-agnostic — works with any game that has map zones. No game-specific logic.
- **F3 (Visual Separation)**: All output goes to `visual-config.yaml`. Zone positions stored in `layout.hints.fixed` (schema already exists). No GameSpecDoc changes.
- **F7 (Immutability)**: Editor store uses immutable state transitions with snapshot-based undo/redo.
- **F9 (No Backwards Compatibility)**: No fallback paths. If `layout.hints.fixed` is present, the layout engine honors it.

---

## 1. Integration — Session State Machine

Add a `'mapEditor'` screen to the existing session state machine. No React Router introduction.

### Modified Types

**`packages/runner/src/session/session-types.ts`**:
- Add `'mapEditor'` to `AppScreen` union
- Add `MapEditorState` interface: `{ screen: 'mapEditor'; gameId: string }`
- Add to `SessionState` discriminated union

**`packages/runner/src/session/session-store.ts`**:
- Add `openMapEditor(gameId: string)` action — transitions from `'gameSelection'` to `'mapEditor'`
- Add `returnToMenu()` transition from `'mapEditor'` back to `'gameSelection'`

**`packages/runner/src/App.tsx`**:
- Add `case 'mapEditor':` that renders `<MapEditorScreen gameId={sessionState.gameId} onBack={returnToMenu} />`

**`packages/runner/src/ui/GameSelectionScreen.tsx`**:
- Add "Edit Map" button per game entry (only shown for games that have map zones — i.e., layout mode `'graph'`)

---

## 2. Editor Canvas

### Architecture

The editor canvas is a PixiJS `Application` with a `pixi-viewport` for pan/zoom, structured in 4 layers:

1. **Background layer**: Optional grid overlay
2. **Connection route layer**: Roads and rivers as Bézier curves
3. **Zone layer**: Zone shapes (circles for cities, rectangles for provinces)
4. **Handle layer**: Control point handles, anchor handles (topmost for interaction priority)

### Reused Modules (imported, not modified)

| Module | Path | What's Reused |
|--------|------|---------------|
| Viewport setup | `packages/runner/src/canvas/viewport-setup.ts` | `setupViewport` for pan/zoom/pinch/clamp |
| Shape drawing | `packages/runner/src/canvas/renderers/shape-utils.ts` | `drawZoneShape`, `parseHexColor`, `resolveVisualDimensions` |
| Bézier math | `packages/runner/src/canvas/geometry/bezier-utils.ts` | Point-on-curve, tangent, midpoint computation |
| Visual config parsing | `packages/runner/src/config/visual-config-loader.ts` | `parseVisualConfigStrict` |
| Visual config provider | `packages/runner/src/config/visual-config-provider.ts` | Zone visual resolution, connection route/anchor reading |
| Layout computation | `packages/runner/src/layout/compute-layout.ts` | ForceAtlas2 initial positions |
| Layout graph | `packages/runner/src/layout/build-layout-graph.ts` | Build graphology graph from adjacency |

### Why Not Reuse Game Renderers Directly

The game renderers (`zone-renderer.ts`, `connection-route-renderer.ts`) expect `PresentationZoneNode` and `ConnectionRouteNode` types from the full game presentation pipeline (game store, render model, animation state). The editor doesn't run a game — it only needs zone shapes and connection curves. Lightweight editor-specific renderers share the drawing utilities but have simpler inputs.

---

## 3. Zone Dragging

Standard PixiJS drag pattern:

1. Each zone container: `eventMode = 'static'`, `cursor = 'grab'`
2. `pointerdown`: Record offset between pointer and container position, set `cursor = 'grabbing'`
3. `globalpointermove` (on viewport stage): Update container position + editor store position in real-time
4. `pointerup` / `pointerupoutside`: Commit final position to editor store, push to undo stack

Connection routes touching the dragged zone re-render in real-time because route endpoints of `kind: 'zone'` resolve their position from the editor store's `zonePositions` map.

### Zone Labels

Each zone displays its display name (or zoneId fallback) as a text label, matching the game renderer style. Labels help the user identify zones during repositioning.

---

## 4. Connector Curve Editing

### Selection

Click on a connection route curve or its midpoint label to select it. The editor store sets `selectedRouteId`. When selected, the route's handles become visible.

### Handle Types

| Handle | Shape | Draggable | Purpose |
|--------|-------|-----------|---------|
| Zone endpoint | Circle (outline) | No (moves with zone) | Shows where route connects to a zone |
| Anchor endpoint | Circle (filled) | Yes | Freely reposition non-zone endpoints |
| Bézier control point | Diamond | Yes | Reshape quadratic Bézier curve |
| Tangent line | Thin line | No | Connects control point to curve (visual aid) |

### Waypoint Operations

| Operation | Trigger | Effect |
|-----------|---------|--------|
| Insert waypoint | Double-click on a segment | Computes nearest point on curve, inserts a new anchor at that position, splits the segment into two straight segments |
| Remove waypoint | Right-click on a non-endpoint anchor | Removes the anchor, merges the two adjacent segments into one |
| Convert to quadratic | Context menu on a straight segment | Adds a control point at the segment midpoint, converts to quadratic Bézier |
| Convert to straight | Context menu on a quadratic segment | Removes the control point, converts back to straight |

### Real-time Rendering

All route edits (anchor drag, control point drag, waypoint insert/remove) trigger immediate re-rendering of the affected route. The route renderer reads from the editor store's `connectionRoutes` map.

---

## 5. State Management — Editor Zustand Store

**New file**: `packages/runner/src/map-editor/map-editor-store.ts`

### State Shape

```typescript
interface MapEditorState {
  // Source data (immutable after load)
  readonly gameDef: GameDef;
  readonly originalVisualConfig: VisualConfig;

  // Editable state
  readonly zonePositions: ReadonlyMap<string, Position>;
  readonly connectionAnchors: ReadonlyMap<string, Position>;
  readonly connectionRoutes: ReadonlyMap<string, EditableConnectionRoute>;

  // UI state
  readonly selectedZoneId: string | null;
  readonly selectedRouteId: string | null;
  readonly isDragging: boolean;
  readonly showGrid: boolean;
  readonly snapToGrid: boolean;
  readonly gridSize: number;

  // Undo/redo
  readonly undoStack: readonly EditorSnapshot[];
  readonly redoStack: readonly EditorSnapshot[];
  readonly dirty: boolean;
}

interface Position { readonly x: number; readonly y: number }

interface EditableConnectionRoute {
  readonly points: readonly ConnectionEndpoint[];
  readonly segments: readonly ConnectionSegment[];
}

interface EditorSnapshot {
  readonly zonePositions: ReadonlyMap<string, Position>;
  readonly connectionAnchors: ReadonlyMap<string, Position>;
  readonly connectionRoutes: ReadonlyMap<string, EditableConnectionRoute>;
}
```

### Actions

| Action | Description |
|--------|-------------|
| `moveZone(zoneId, position)` | Update zone position, push to undo stack |
| `moveAnchor(anchorId, position)` | Update anchor position, push to undo stack |
| `moveControlPoint(routeId, segmentIndex, position)` | Update Bézier control point |
| `insertWaypoint(routeId, segmentIndex, position)` | Split segment at position |
| `removeWaypoint(routeId, pointIndex)` | Merge adjacent segments |
| `convertSegment(routeId, segmentIndex, kind)` | Toggle straight/quadratic |
| `selectZone(id \| null)` | Set selected zone |
| `selectRoute(id \| null)` | Set selected route |
| `undo()` | Pop from undo stack, push current to redo |
| `redo()` | Pop from redo stack, push current to undo |
| `toggleGrid()` | Toggle grid overlay |
| `setGridSize(n)` | Set grid spacing |

### Undo/Redo

Each action that modifies positions/routes:
1. Pushes current `EditorSnapshot` onto `undoStack`
2. Clears `redoStack`
3. Sets `dirty = true`

Capped at 50 entries. Standard undo/redo semantics.

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+Z | Undo |
| Ctrl+Shift+Z | Redo |
| Escape | Deselect all |
| G | Toggle grid |
| Delete | Remove selected waypoint (if non-endpoint anchor) |

---

## 6. YAML Export

### Process

1. Start from the parsed `VisualConfig` object (already validated by Zod)
2. **Zone positions** → written into `layout.hints.fixed` as an array of `{ zone: string, x: number, y: number }`
   - The `FixedPositionHintSchema` already exists at `packages/runner/src/config/visual-config-types.ts:41-45`
   - One entry per zone that was repositioned (or all zones, for simplicity)
3. **Connection anchors** → replace `zones.connectionAnchors` with edited positions
4. **Connection routes** → replace `zones.connectionRoutes` with edited route definitions
5. **All other sections** pass through unchanged (factions, tokens, styles, edges, regions, etc.)
6. Serialize to YAML using the `yaml` library (project dependency)
7. Validate output against `VisualConfigSchema` before download
8. Trigger browser download via `URL.createObjectURL(new Blob([yaml]))` + programmatic `<a>` click

### Output Format Example

```yaml
layout:
  mode: graph
  hints:
    regions:
      # ... existing region hints ...
    fixed:
      - { zone: "saigon:none", x: 320, y: 580 }
      - { zone: "hue:none", x: 150, y: 40 }
      - { zone: "da-nang:none", x: 280, y: 120 }
      # ... one per zone ...

zones:
  connectionAnchors:
    mekong-bend-1: { x: 400, y: 520 }
    # ... edited anchor positions ...
  connectionRoutes:
    "loc-hue-da-nang:none":
      points:
        - { kind: zone, zoneId: "da-nang:none" }
        - { kind: zone, zoneId: "hue:none" }
      segments:
        - kind: quadratic
          control: { kind: position, x: 480, y: 40 }
    # ... edited routes ...
```

### Follow-up Required: Layout Engine

`compute-layout.ts` does not currently honor `layout.hints.fixed`. A follow-up change is needed:

- If `layout.hints.fixed` is present and non-empty, pin those zones at their specified `(x, y)` positions
- Run ForceAtlas2 only on non-fixed zones (with fixed zones as immovable nodes in the graph)
- This is a small, isolated change to `compute-layout.ts` and should be part of this spec's implementation

---

## 7. File Organization

### New Files

```
packages/runner/src/map-editor/
  MapEditorScreen.tsx           — Top-level React component (loads game, renders canvas + toolbar)
  map-editor-store.ts           — Zustand store for editor state + undo/redo
  map-editor-types.ts           — Editor-specific type definitions
  map-editor-canvas.ts          — PixiJS Application setup (viewport, layers)
  map-editor-zone-renderer.ts   — Zone shape rendering with drag interaction
  map-editor-route-renderer.ts  — Connection route rendering with handle overlays
  map-editor-handle-renderer.ts — Control point and anchor handle rendering
  map-editor-drag.ts            — Drag interaction logic (zone, anchor, control point)
  map-editor-export.ts          — YAML serialization, validation, and download trigger
  map-editor-toolbar.tsx        — React toolbar (undo/redo, grid, snap, export)
  MapEditorScreen.module.css    — Styles
```

### Modified Files

| File | Change |
|------|--------|
| `packages/runner/src/session/session-types.ts` | Add `'mapEditor'` to `AppScreen`, add `MapEditorState` |
| `packages/runner/src/session/session-store.ts` | Add `openMapEditor(gameId)` transition |
| `packages/runner/src/App.tsx` | Add `case 'mapEditor'` rendering |
| `packages/runner/src/ui/GameSelectionScreen.tsx` | Add "Edit Map" button per game |
| `packages/runner/src/layout/compute-layout.ts` | Honor `layout.hints.fixed` positions |

---

## 8. Implementation Phases

### Phase 1: Skeleton + Zone Dragging
- Add `'mapEditor'` screen to session types and store
- Create `MapEditorScreen.tsx` with game loading logic
- Create editor Zustand store with zone positions
- Create editor canvas (viewport + zone renderer with drag)
- Zones render at ForceAtlas2 initial positions and are draggable
- Add "Edit Map" button to `GameSelectionScreen`

### Phase 2: Connection Route Display + Anchor Dragging
- Create editor route renderer (draws connection routes from editable state)
- Create handle renderer for anchor endpoints
- Implement anchor dragging with real-time route updates
- Routes re-render as zones or anchors move

### Phase 3: Bézier Control Point Editing
- Render control point handles for quadratic segments
- Implement control point dragging
- Add segment type conversion (straight ↔ quadratic)
- Add waypoint insertion and removal

### Phase 4: Undo/Redo + Toolbar
- Implement undo/redo snapshot stack in editor store
- Create toolbar component (undo, redo, grid toggle, snap toggle, export)
- Keyboard shortcuts (Ctrl+Z, Ctrl+Shift+Z, Escape, G, Delete)

### Phase 5: YAML Export
- Create serialization module (merge edits into visual config structure)
- Validate output against `VisualConfigSchema`
- Trigger browser file download
- Add "Export YAML" button to toolbar

### Phase 6: Layout Engine + Polish
- Update `compute-layout.ts` to honor `layout.hints.fixed`
- Grid overlay and snap-to-grid
- Zone/route selection highlighting
- Coordinate readout display
- Dirty state warning on navigation away

---

## 9. Testing Strategy

### Editor Store Unit Tests (`packages/runner/test/map-editor/`)

- Zone position updates produce correct state
- Anchor position updates propagate to routes
- Undo/redo stack: push, pop, cap at 50, clear redo on new action
- Waypoint insert: segment splits correctly, point inserted at right index
- Waypoint remove: segments merge correctly
- Segment conversion: straight → quadratic adds midpoint control, quadratic → straight removes control
- Immutability: original state never mutated

### YAML Export Tests

- Load known visual config → apply edits → export → re-parse with `VisualConfigSchema` → verify round-trip
- Unedited sections pass through unchanged (factions, tokens, styles)
- `layout.hints.fixed` contains correct zone positions
- `connectionAnchors` and `connectionRoutes` contain edited values
- Output validates against Zod schema

### Drag Math Tests

- Bézier nearest-point computation for waypoint insertion
- Snap-to-grid rounding
- Viewport coordinate ↔ world coordinate conversion

### Layout Engine Tests

- `compute-layout.ts` with `layout.hints.fixed`: fixed zones at specified positions, non-fixed zones laid out by ForceAtlas2
- Fixed zones not moved by force simulation
- Empty `fixed` array behaves identically to no `fixed` property

### Integration Tests

- Full flow: load game definition → compute layout → create editor store → simulate position edits → export YAML → re-parse and validate
- Editor store initializes correctly from visual config + layout result

---

## 10. Non-Goals

- **No adding/removing zones or connectors** — editor repositions existing elements only
- **No game-specific logic** — editor is game-agnostic
- **No server-side component** — browser-only, YAML downloaded as file
- **No visual regression testing** — manual verification via dev server for MVP
- **No background image support** — no map underlay/overlay for geographic reference (future enhancement)
- **No multi-user editing** — single-user, local workflow
