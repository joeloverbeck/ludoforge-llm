# Spec 86 — Adjacency Line Redesign

**Status**: Draft
**Dependencies**: Spec 71 (connection route rendering), Spec 83 (zone edge anchor endpoints)
**Blocked by**: None
**Enables**: Visual polish for the FITL map; generalizable to any game with adjacency + LoC overlays

## Problem

The FITL visual runner draws thin gray adjacency lines between zones. Two visual defects exist:

### 1. Nexus Artifacts from LoC Grid Positioning

Line of Communication (LoC) zones — highways like `loc-da-nang-dak-to` and `loc-da-nang-qui-nhon` — are positioned in the grid layout as if they were provinces or cities. Multiple zones are adjacent to each LoC, so multiple adjacency lines converge on the LoC's computed grid position, creating unexplained visual "nexus" points. These nexus points appear as clusters of converging gray lines at positions where no visible zone exists (e.g., near Binh Dinh in the current FITL map).

**Root cause**: LoC zones are conceptually *connections* (the road itself), not spatial nodes. They should not occupy grid positions. The road connector renderer already draws the LoC as a styled route line — the adjacency to the LoC is therefore represented twice: once as a road connector and once as gray adjacency lines converging on an invisible grid position.

### 2. Visual Inconsistency

Adjacency lines (thin gray, 1.5px, alpha 0.3, center-to-center) look visually disconnected from the styled road connectors (thick, colored, edge-anchored with optional curves/waves) and river connectors. The adjacency lines cross through zone interiors because they connect zone centers rather than edges.

## Solution

Four coordinated changes:

### Part 1: Exclude LoC Zones from Grid Layout

Add all LoC zone IDs to the `hiddenZones` list in the FITL visual config. The existing hidden zone filtering in `presentation-scene.ts` (lines 142-148) already removes hidden zones before grid layout computation and adjacency resolution.

**FITL LoC zones to hide** (from `40-content-data-assets.md`):
- `loc-da-nang-dak-to:none`
- `loc-da-nang-qui-nhon:none`
- `loc-hue-da-nang:none`
- `loc-hue-khe-sanh:none`
- `loc-kontum-dak-to:none`
- `loc-pleiku-qui-nhon:none`
- `loc-qui-nhon-cam-ranh:none`
- `loc-saigon-an-loc:none`
- `loc-saigon-can-tho:none`
- `loc-saigon-cam-ranh:none`

Additionally, filter adjacency lines in `resolveAdjacencyNodes()` where either endpoint is a hidden zone, preventing ghost lines to non-rendered positions.

**Files**:
- `data/games/fire-in-the-lake/visual-config.yaml` — add LoC IDs to `hiddenZones`
- `packages/runner/src/presentation/presentation-scene.ts` — ensure adjacency filtering respects `hiddenZones`

### Part 2: LoC Connector Spur Lines

For each LoC zone, the road connector route currently draws a line between the route's defined endpoints (e.g., Da Nang → Qui Nhon). But the LoC is also adjacent to intermediate provinces (e.g., `quang-tin-quang-ngai`, `binh-dinh`). After hiding the LoC from the grid, these intermediate adjacencies would be lost visually.

**Solution**: Generate spur lines from the route polyline to each adjacent zone that is not already a route endpoint.

**Algorithm**:
1. For each connection route (LoC), collect the set of zones adjacent to the LoC from the GameDef
2. Subtract zones that are already route endpoints (these are already visually connected)
3. For each remaining adjacent zone:
   a. Sample the route polyline at regular intervals
   b. Find the point on the polyline nearest to the adjacent zone's center
   c. Compute the edge point on the adjacent zone's boundary (using `getEdgePointAtAngle()`)
   d. Emit a spur segment: `{ from: nearestRoutePoint, to: zoneEdgePoint }`
4. Render spurs with the same stroke style as the parent route (inheriting color, width, alpha)

**Files**:
- `packages/runner/src/presentation/connection-route-resolver.ts` — compute spur geometry
- `packages/runner/src/canvas/renderers/connection-route-renderer.ts` — draw spur lines
- `packages/runner/src/canvas/renderers/shape-utils.ts` — reuse `getEdgePointAtAngle()`

### Part 3: Adjacency Line Restyling

Restyle province-to-province (and province-to-city, city-to-city) adjacency lines.

**Visual spec**:
- **Style**: Dashed line (not solid)
- **Color**: White (`#ffffff`)
- **Width**: ~2px (similar to road connector width)
- **Alpha**: 0.6 (normal), 0.85 (highlighted)
- **Dash pattern**: dash length = 6px, gap length = 4px (tunable)
- **Endpoints**: Zone edge-to-edge (not center-to-center)

**Edge clipping algorithm**:
1. Given `fromZone` and `toZone` with their center positions
2. Compute the angle from `fromCenter` to `toCenter`
3. Call `getEdgePointAtAngle(fromShape, fromDimensions, angle)` → `fromEdge`
4. Call `getEdgePointAtAngle(toShape, toDimensions, angle + π)` → `toEdge`
5. Draw dashed line from `fromEdge` to `toEdge`

**Dashed line utility**: Create `drawDashedLine(graphics, from, to, dashLength, gapLength)` adapted from the existing `drawDashedPolygon()` in `packages/runner/src/canvas/geometry/dashed-polygon.ts`. The polygon walker walks polygon edges toggling dash/gap — the line version is a degenerate case with a single edge.

**Files**:
- `packages/runner/src/canvas/geometry/dashed-line.ts` — **new file**, dashed straight line utility
- `packages/runner/src/canvas/renderers/adjacency-renderer.ts` — edge clipping + dashed drawing
- `packages/runner/src/config/visual-config-provider.ts` — update default edge style constants

### Part 4: Hover Highlight Preservation

The adjacency renderer already supports `isHighlighted` via `resolveEdgeStyle()`. Ensure the dashed line drawing function respects the highlight state:

- **Normal**: white, 2px width, alpha 0.6, dash 6/gap 4
- **Highlighted**: bright white, 3px width, alpha 0.85, dash 8/gap 3

No new architecture needed — the existing highlight data flow (`RunnerAdjacency.isHighlighted` → `PresentationAdjacencyNode.isHighlighted` → `drawAdjacencyLine()`) remains unchanged.

**Files**:
- `packages/runner/src/canvas/renderers/adjacency-renderer.ts` — pass highlight state to dashed draw
- `packages/runner/src/config/visual-config-provider.ts` — update highlighted edge style

## Data Flow (After Changes)

```
GameDef.zones[].adjacentTo[]
    ↓
deriveAdjacencies() → RunnerFrame.adjacencies[]
    ↓
resolveAdjacencyNodes(adjacencies, visibleZoneIDs)
    ├── Filter: exclude pairs where either zone is hidden (LoC zones)
    └── Result: province/city-only adjacency pairs
    ↓
adjacencyRenderer.update(adjacencies, positions, zoneDimensions)
    ├── For each pair: compute edge points via getEdgePointAtAngle()
    └── Draw dashed white line between edge points
    ↓
Canvas: Dashed white lines between zone edges

GameDef connection routes (LoC roads)
    ↓
resolveConnectionRoutes() → ConnectionRoute[]
    ├── Route polyline + styling
    └── NEW: spur segments to adjacent zones not at route endpoints
    ↓
connectionRouteRenderer.update(routes)
    ├── Draw main route (existing)
    └── Draw spur lines to adjacent zones (new)
    ↓
Canvas: Road connectors with branch spurs
```

## Game-Agnosticism

This spec is game-agnostic in design:
- LoC exclusion is configured via `hiddenZones` in the per-game `visual-config.yaml`, not hardcoded
- Spur line generation works for any connection route with adjacent zones
- Dashed adjacency line styling is the new default for all games (configurable via `edges.default` in visual config)
- Edge clipping uses existing shape-aware utilities that handle all zone shapes

## Testing

### Unit Tests
- `dashed-line.ts`: verify dash/gap pattern for various line lengths, degenerate cases (line shorter than one dash)
- `adjacency-renderer.ts`: verify edge clipping produces points on zone boundaries, not centers
- Spur computation: verify nearest-point-on-polyline algorithm, verify spur endpoints touch zone edges

### Visual Verification
1. `pnpm -F @ludoforge/runner dev` → load FITL game
2. Confirm no LoC zones appear as grid rectangles
3. Confirm road connectors have spur branches to adjacent provinces
4. Confirm adjacency lines are dashed white, edge-to-edge
5. Hover a zone → confirm adjacent lines highlight
6. Confirm no nexus artifacts remain
7. Pan/zoom → confirm lines render correctly at all viewport scales

### Regression
- `pnpm -F @ludoforge/runner test`
- `pnpm -F @ludoforge/runner lint`
- `pnpm -F @ludoforge/runner typecheck`

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `data/games/fire-in-the-lake/visual-config.yaml` | Modify | Add LoC zone IDs to `hiddenZones` |
| `packages/runner/src/presentation/presentation-scene.ts` | Modify | Filter adjacencies against hidden zones |
| `packages/runner/src/presentation/connection-route-resolver.ts` | Modify | Compute spur geometry for LoC adjacencies |
| `packages/runner/src/canvas/renderers/connection-route-renderer.ts` | Modify | Render spur lines |
| `packages/runner/src/canvas/geometry/dashed-line.ts` | **New** | Dashed straight line drawing utility |
| `packages/runner/src/canvas/renderers/adjacency-renderer.ts` | Modify | Edge clipping + dashed drawing |
| `packages/runner/src/config/visual-config-provider.ts` | Modify | Update default/highlighted edge styles |
| `packages/runner/src/canvas/renderers/shape-utils.ts` | Reuse | `getEdgePointAtAngle()` for edge clipping |
| `packages/runner/src/canvas/geometry/dashed-polygon.ts` | Reuse | Reference for dash/gap walking algorithm |
