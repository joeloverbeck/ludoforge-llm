# Spec 99 — Map Editor Renderer Unification

## Status: Draft

## Problem

The map editor renders the base map (provinces, cities, adjacency lines, labels, connection routes, background) with completely independent renderer implementations that produce visually different output from the game canvas. Contrasting `screenshots/fitl-game-map.png` and `screenshots/fitl-map-editor.png` reveals these differences:

| Feature | Game Canvas | Map Editor |
|---------|------------|-----------|
| Background | Dark green table ellipse (`#0a5c2e`) | Light/white, no table shape |
| Province borders | Chaikin-smoothed organic edges with straight bisector segments where provinces share borders | Raw unsmoothed polygons, no border treatment |
| Adjacency lines | Styled dashed lines (10px dash / 5px gap), category-aware color, edge-to-edge positioning | Thin straight center-to-center lines, no dashes |
| City zones | Properly styled circles with fill color + stroke from visual config | Simplified circles with different styling |
| Zone labels | White text on black pill background, 34px, stroke font | Plain text, smaller, no pill background |
| Region boundaries | Subtle colored overlays (15% alpha) with rotated region labels | Not rendered at all |
| Connection routes | Styled bezier curves with junctions, labels, badges | Simpler bezier rendering |
| Province fill colors | Resolved from VisualConfigProvider with attribute rules | Resolved but with different defaults/styling |

**Root cause**: The map editor has three independent renderer files (~920 lines total) that duplicate game canvas rendering logic with simpler, divergent visual output:

- `map-editor-zone-renderer.ts` (210 lines) — parallel to `zone-renderer.ts` (345 lines)
- `map-editor-adjacency-renderer.ts` (70 lines) — parallel to `adjacency-renderer.ts` (175 lines)
- `map-editor-route-renderer.ts` (641 lines) — parallel to `connection-route-renderer.ts` (728 lines)

The editor also lacks renderers for region boundaries and table background, which the game canvas has.

## Design: Adapter Pattern

### Principle

Instead of maintaining two parallel rendering pipelines, the map editor will reuse the game canvas renderers directly. A thin adapter converts editor state into the `PresentationScene` structure that game canvas renderers already consume. Visual parity is guaranteed by construction — both flows run the same rendering code.

### Architecture

```
Game Canvas Flow (unchanged):
  GameState → buildPresentationScene() → PresentationScene → Game Canvas Renderers

Map Editor Flow (new):
  EditorState → buildEditorPresentationScene() → PresentationScene → Game Canvas Renderers
                                                                    ↓
                                                          + Editor-only overlays
                                                            (vertex handles, control
                                                             point handles, grid)
```

### New File: `packages/runner/src/map-editor/map-editor-presentation-adapter.ts`

**Function**: `buildEditorPresentationScene()`

**Inputs**:
- `gameDef: GameDef` — zone definitions, adjacency data
- `visualConfigProvider: VisualConfigProvider` — visual styling resolution
- `positions: ReadonlyMap<string, Position>` — editor zone positions
- `zoneVertices: ReadonlyMap<string, readonly Position[]>` — editor polygon vertices
- `connectionAnchors: ReadonlyMap<string, Position>` — editor anchor positions
- `connectionRoutes: ReadonlyMap<string, ConnectionRouteDefinition>` — editor route definitions
- `selectedZoneId: string | null` — current selection for highlight

**Output**: `PresentationScene`

**Field mapping**:

| PresentationScene field | Source | Notes |
|------------------------|--------|-------|
| `zones` | GameDef zones + VisualConfigProvider | `ownerID: null`, `hiddenStackCount: 0`, `markers: ''`, `badge: null`. `isSelectable: true`. Stroke highlight from `selectedZoneId`. |
| `adjacencies` | GameDef adjacency pairs | `isHighlighted: false`, `category` from GameDef edge definitions |
| `connectionRoutes` | Editor routes via `resolveConnectionRoutes()` | Reuse existing resolver with editor anchor positions |
| `junctions` | From `resolveConnectionRoutes()` | Same resolver produces junctions |
| `regions` | Visual config region hints via `resolveRegionNodes()` | Reuse existing region resolution |
| `tokens` | Empty array `[]` | Editor does not display game tokens |
| `overlays` | Empty array `[]` | Editor does not display game overlays |

**Province borders**: Computed via existing `computeProvinceBorders()` using adapter zone data and positions. Passed to `ZoneRenderer.update()` as the third argument.

**Table background**: Drawn via existing `drawTableBackground()` using `VisualConfigProvider.getTableBackground()` and bounds computed from editor positions.

### Renderer Reuse

Each game canvas renderer is instantiated in the map editor and receives data from the adapter:

| Renderer | `update()` signature | Editor wiring |
|----------|---------------------|---------------|
| `createZoneRenderer` | `update(zones, positions, provinceBorders?)` | zones from adapter, positions from store, provinceBorders from `computeProvinceBorders()` |
| `createAdjacencyRenderer` | `update(adjacencies, positions, zones)` | adjacencies + zones from adapter, positions from store |
| `createConnectionRouteRenderer` | `update(routes, junctions, positions)` | routes + junctions from adapter, positions from store |
| `createRegionBoundaryRenderer` | `update(regions)` | regions from adapter |
| `drawTableBackground` | `(container, config, bounds)` | config from VisualConfigProvider, bounds from positions |

### Editor-Specific Overlays (Unchanged)

These renderers remain editor-only and layer on top of the shared base rendering:

- `vertex-handle-renderer.ts` — polygon vertex editing handles
- `map-editor-handle-renderer.ts` — route anchor/control point handles
- Editor grid renderer — snap grid overlay

### Editor-Specific Interaction Wiring

Game canvas renderers expose interaction hooks that the editor must wire:

- **Zone selection**: Game canvas `createZoneRenderer` accepts a `bindSelection` callback. Editor wires this to its zone selection logic in the editor store.
- **Route selection**: `createConnectionRouteRenderer` accepts `bindSelection`. Editor wires to its route selection logic.
- **Waypoint insertion** (double-click on route): Currently handled inside `map-editor-route-renderer.ts`. Must be re-attached as an event listener on route containers obtained from `getContainerMap()`.
- **Segment type conversion** (right-click): Same approach — event listener on route containers.

## Prerequisite: Extract Shared Polyline Utilities

Before the adapter work, extract duplicated pure functions from `connection-route-renderer.ts` and `map-editor-route-renderer.ts` into shared modules. This is a clean prerequisite that reduces duplication immediately.

### New file: `packages/runner/src/rendering/polyline-utils.ts`

Functions to extract:
- `getPolylineLength(points)`
- `resolvePolylinePointAtDistance(points, distance)`
- `samplePolylineWavePoints(points, config)`
- `approximatePolylineHitPolygon(points, halfWidth)`
- `resolvePolylineNormal(points, distance)`
- `resolveLabelRotation(angle)`
- `normalizeAngle(angle)`
- `flattenPoints(points)`

### New file: `packages/runner/src/rendering/route-stroke-utils.ts`

Types and functions to extract:
- `ResolvedStroke` interface
- `sanitizePositiveNumber(value, fallback)`
- `sanitizeUnitInterval(value, fallback)`

Both `connection-route-renderer.ts` and `map-editor-route-renderer.ts` (and later `map-editor-handle-renderer.ts` if it uses any of these) import from the shared modules.

## Files Summary

### Create
| File | Purpose | Est. Lines |
|------|---------|-----------|
| `packages/runner/src/map-editor/map-editor-presentation-adapter.ts` | Editor state → PresentationScene adapter | ~200 |
| `packages/runner/src/rendering/polyline-utils.ts` | Shared polyline geometry functions | ~120 |
| `packages/runner/src/rendering/route-stroke-utils.ts` | Shared stroke resolution types/functions | ~30 |

### Modify
| File | Change |
|------|--------|
| `packages/runner/src/map-editor/MapEditorScreen.tsx` | Replace editor renderer creation with game canvas renderer creation + adapter wiring |
| `packages/runner/src/map-editor/map-editor-canvas.ts` | Adjust layer hierarchy to match game canvas layer structure (needs backgroundLayer, regionLayer, provinceZoneLayer, cityZoneLayer, adjacencyLayer, connectionRouteLayer, tableOverlayLayer) |
| `packages/runner/src/map-editor/map-editor-types.ts` | Update EditorLayerSet if layer structure changes |
| `packages/runner/src/canvas/renderers/connection-route-renderer.ts` | Import polyline/stroke utils from shared modules instead of local definitions |
| `packages/runner/src/map-editor/map-editor-handle-renderer.ts` | Import from shared modules if it uses any extracted functions |

### Delete
| File | Lines Removed |
|------|--------------|
| `packages/runner/src/map-editor/map-editor-zone-renderer.ts` | 210 |
| `packages/runner/src/map-editor/map-editor-adjacency-renderer.ts` | 70 |
| `packages/runner/src/map-editor/map-editor-route-renderer.ts` | 641 |
| `packages/runner/src/map-editor/map-editor-zone-visuals.ts` | TBD (check if handle renderers still need it) |

**Net change**: ~350 lines added, ~920+ lines deleted = **~570+ lines net reduction**

## Layer Hierarchy Alignment

The map editor canvas must provide the same layer structure as the game canvas for renderers to attach to. Current game canvas layers (from `layers.ts`):

1. `backgroundLayer` — table background
2. `regionLayer` — region boundaries
3. `provinceZoneLayer` — province-shaped zones
4. `connectionRouteLayer` — connection routes
5. `cityZoneLayer` — city/non-province zones
6. `adjacencyLayer` — adjacency lines
7. `tableOverlayLayer` — table overlays

The editor canvas currently has a simpler 5-layer set (`background`, `adjacency`, `route`, `zone`, `handle`). It must be expanded to match the game canvas layer structure, plus the editor-specific `handle` layer on top.

## Migration Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Editor route interactions (waypoint insert, segment convert) depend on editor renderer internals | Medium | Re-attach as event listeners on containers from `getContainerMap()`. Game canvas renderers expose container maps for exactly this purpose. |
| Editor drag preview needs real-time PresentationScene updates on each tick | Low | Adapter is pure data mapping — cheap to run on every drag frame. No heavy computation. |
| `map-editor-zone-visuals.ts` may be needed by handle renderers | Low | Check imports before deletion. If needed, keep the specific functions or migrate them. |
| `resolveConnectionRoutes()` expects game canvas anchor format | Medium | Editor already stores anchors as `{x, y}` positions. May need to adapt the input format or use the resolver's existing API which accepts `connectionAnchors` from VisualConfig. |
| ContainerPool / DisposalQueue required by game canvas renderers | Low | Instantiate these in editor canvas setup, same as game canvas runtime does. |

## Testing Strategy

### Unit Tests
- **Adapter tests**: Assert `buildEditorPresentationScene()` produces correct PresentationScene from known editor state inputs. Verify zone defaults (null owner, zero hidden count, empty markers). Verify adjacency mapping. Verify empty tokens/overlays.
- **Polyline utils tests**: Extract existing tests that cover the duplicated functions, ensure they pass against the shared module.

### Integration Tests
- Existing game canvas renderer tests remain unchanged (renderers not modified).
- Editor interaction tests: verify zone selection, route selection, vertex editing, control point dragging still function correctly through the new wiring.

### Visual Verification
- Manual screenshot comparison: map editor should match game canvas for base map elements (provinces, adjacencies, labels, routes, regions, background).
- Expected remaining differences: editor shows grid + handles; game shows tokens + markers + hidden stacks. These are correct by design.

## Verification Commands

```bash
pnpm -F @ludoforge/runner typecheck
pnpm -F @ludoforge/runner test
pnpm -F @ludoforge/runner lint
```

## FOUNDATIONS.md Alignment

| Foundation | Alignment |
|-----------|-----------|
| F1: Engine Agnosticism | No engine changes. Adapter works with any GameDef. |
| F3: Visual Separation | Visual config continues to drive all styling through VisualConfigProvider. |
| F7: Immutability | Adapter produces immutable PresentationScene snapshots. |
| F9: No Backwards Compatibility | Editor renderers are deleted, not wrapped or shimmed. |
| F10: Architectural Completeness | One rendering pipeline instead of two parallel ones. Root cause (duplication) is eliminated, not papered over. |
| F11: Testing as Proof | Adapter unit tests prove correct field mapping. Visual parity proven by construction (same code path). |
