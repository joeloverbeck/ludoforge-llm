# Spec 71 — Connection-Route Zone Rendering

## Status: DRAFT

## Problem

Lines of Communication (LoCs) in Fire in the Lake — 13 highway roads and 4 Mekong river segments — are currently rendered as small rectangles (`shape: 'line'`, 270×50px) with adjacency lines radiating outward to connected provinces and cities. This visual treatment is identical to how provinces and cities are rendered (as nodes), despite LoCs being semantically *connections* between spaces.

The result is visually confusing: a road like "Kontum-Qui Nhon" appears as an independent rectangular space with its own adjacency lines pointing to Kontum and Qui Nhon, rather than *being* the visual connection between them. Similarly, Mekong river segments like "Can Tho-Long Phu" look like standalone bluish boxes rather than waterway links.

**Evidence**: `screenshots/fitl-roads.png` (highway LoCs as tan rectangles), `screenshots/fitl-mekong.png` (Mekong LoCs as blue rectangles).

This spec introduces a generic **connection-route** zone visual mode where zones declared as `shape: 'connection'` are rendered as Bézier curves connecting their endpoint zones, replacing both the rectangular node and its endpoint adjacency lines.

## Foundations Alignment

| Foundation | Alignment |
|------------|-----------|
| F1 (Engine Agnosticism) | `connection` is a generic zone shape, not FITL-specific. Any game can declare connection-route zones (trade routes, railways, rivers). |
| F3 (Visual Separation) | All connection-route visuals are driven by `visual-config.yaml` — `connectionStyles` section with per-style stroke, color, width, wave parameters. No game-specific code in the renderer. |
| F7 (Immutability) | New `PresentationConnectionRouteNode` and `PresentationJunctionNode` are readonly interfaces. The resolver returns new objects, never mutates. |
| F9 (No Backwards Compat) | The `shape: 'line'` treatment for LoC zones is replaced by `shape: 'connection'`. No alias, no fallback, no shim. |

## Scope

### In Scope

- New `'connection'` entry in the `ZoneShape` union
- `ConnectionStyleConfig` schema and `connectionStyles` visual config section
- Connection-route resolver (topology: endpoints, junctions, adjacency filtering)
- Bézier math utilities (quadratic curves, tangents, hit polygons)
- Connection-route renderer (curves, labels, hit areas, junction dots)
- Pipeline integration (presentation scene, canvas layers, token positioning)
- FITL `visual-config.yaml` migration from `shape: line` to `shape: connection`

### Out of Scope

- Kernel/compiler changes (LoC zones remain zones mechanically — this is visual-only)
- Tangent-perpendicular token fanning (follow-up enhancement)
- Animated river flow (follow-up enhancement; this spec defines the config schema for it but does not implement animation)
- Layout algorithm changes (connection-route zones still have positions in the layout store; the renderer just ignores the position and draws between endpoints instead)

## Visual Config Schema Changes

### ZoneShape Union

In `packages/runner/src/config/visual-config-defaults.ts`, add `'connection'` to the `ZoneShape` type:

```typescript
export type ZoneShape =
  | 'rectangle'
  | 'circle'
  | 'hexagon'
  | 'diamond'
  | 'ellipse'
  | 'triangle'
  | 'line'
  | 'octagon'
  | 'connection';
```

### ConnectionStyleConfig

In `packages/runner/src/config/visual-config-types.ts`, add:

```typescript
export interface ConnectionStyleConfig {
  readonly strokeWidth: number;
  readonly strokeColor: string;
  readonly strokeAlpha?: number;
  readonly wavy?: boolean;
  readonly waveAmplitude?: number;
  readonly waveFrequency?: number;
}
```

Extend `ZonesConfig` to include:

```typescript
readonly connectionStyles?: Record<string, ConnectionStyleConfig>;
```

### VisualConfigProvider

In `packages/runner/src/config/visual-config-provider.ts`, add:

```typescript
resolveConnectionStyle(styleKey: string): ConnectionStyleConfig | null;
```

This looks up `connectionStyles[styleKey]` from the zones config. Returns `null` if the style key is not found.

### FITL visual-config.yaml

```yaml
zones:
  categoryStyles:
    loc:
      shape: connection
      # width/height no longer used for connection shape

  connectionStyles:
    highway:
      strokeWidth: 8
      strokeColor: "#8b7355"
      strokeAlpha: 0.8
    mekong:
      strokeWidth: 12
      strokeColor: "#4a7a8c"
      strokeAlpha: 0.9
      wavy: true
      waveAmplitude: 4
      waveFrequency: 0.08

  attributeRules:
    - match:
        category: [loc]
        attributeContains:
          terrainTags: highway
      style:
        connectionStyleKey: highway
    - match:
        category: [loc]
        attributeContains:
          terrainTags: mekong
      style:
        connectionStyleKey: mekong
```

The `connectionStyleKey` attribute rule maps a zone's terrain tags to a named connection style. The resolver reads this from the resolved zone visual.

## Connection-Route Resolver

**New file**: `packages/runner/src/presentation/connection-route-resolver.ts`

### Interfaces

```typescript
export interface ConnectionRouteNode {
  readonly zoneId: string;
  readonly displayName: string;
  readonly endpointZoneIds: readonly [string, string];
  readonly touchingZoneIds: readonly string[];
  readonly connectedConnectionIds: readonly string[];
  readonly connectionStyleKey: string | null;
  readonly zone: PresentationZoneNode;
}

export interface JunctionNode {
  readonly id: string;
  readonly connectionIds: readonly string[];
  readonly position: Position; // computed as midpoint of meeting curves
}

export interface ConnectionRouteResolution {
  readonly connectionRoutes: readonly ConnectionRouteNode[];
  readonly junctions: readonly JunctionNode[];
  readonly filteredZones: readonly PresentationZoneNode[];
  readonly filteredAdjacencies: readonly PresentationAdjacencyNode[];
}
```

### resolveConnectionRoutes()

```typescript
export function resolveConnectionRoutes(
  zones: readonly PresentationZoneNode[],
  adjacencies: readonly PresentationAdjacencyNode[],
  positions: ReadonlyMap<string, Position>,
): ConnectionRouteResolution;
```

**Algorithm**:

1. **Identify connection zones**: Filter zones where `visual.shape === 'connection'`.
2. **Build adjacency index**: Map each zone ID to its set of adjacent zone IDs.
3. **Resolve endpoints**: For each connection zone, partition its adjacencies into:
   - **Primary endpoints** (2): The non-connection zones that the connection links. Heuristic: parse zone ID for embedded endpoint names (e.g., `loc-kontum-qui-nhon` → `kontum`, `qui-nhon`). Fallback: first two non-connection adjacencies.
   - **Touching zones** (0+): Other non-connection adjacencies (provinces that border the LoC but aren't its endpoints).
   - **Connected connections** (0+): Other connection zones that share an adjacency edge.
4. **Detect junctions**: When two or more connection zones share an adjacency, create a `JunctionNode`. The junction position is computed as the geometric centroid of the shared adjacency endpoints' positions.
5. **Filter outputs**:
   - `filteredZones`: All zones minus connection zones.
   - `filteredAdjacencies`: All adjacencies minus pairs where both ends include a connection zone and one of its primary endpoints. (Adjacencies between two non-connection zones are never removed.)

### Endpoint Inference Details

LoC zones are adjacent to more than 2 zones. For example, `loc-hue-da-nang` is adjacent to `hue:none`, `da-nang:none`, `quang-tri-thua-thien:none`, and `quang-nam:none`. The first two match the zone name and are the primary endpoints defining the curve. The other two are "touching" provinces — geographically adjacent but not the curve's terminators.

The name-parsing heuristic handles all 17 FITL LoCs. For robustness, `visual-config.yaml` can declare explicit endpoint overrides per zone:

```yaml
zones:
  zoneOverrides:
    "loc-saigon-an-loc-ban-me-thuot:none":
      connectionEndpoints: ["an-loc:none", "saigon:none"]
```

This is needed for zones like `loc-saigon-an-loc-ban-me-thuot` where the name contains 3 city references.

## Bézier Math Utilities

**New file**: `packages/runner/src/canvas/geometry/bezier-utils.ts`

Pure, stateless math functions for quadratic Bézier curves. Quadratic (not cubic) because a single control point is sufficient for the gentle arcs needed, and PixiJS `Graphics.quadraticCurveTo()` is well-supported.

### Functions

```typescript
export interface Point2D {
  readonly x: number;
  readonly y: number;
}

/** Point on quadratic Bézier at parameter t ∈ [0,1]. */
export function quadraticBezierPoint(t: number, p0: Point2D, cp: Point2D, p2: Point2D): Point2D;

/** Tangent vector (unnormalized) at parameter t. */
export function quadraticBezierTangent(t: number, p0: Point2D, cp: Point2D, p2: Point2D): Point2D;

/** Shorthand: point at t=0.5. */
export function quadraticBezierMidpoint(p0: Point2D, cp: Point2D, p2: Point2D): Point2D;

/** Shorthand: tangent at t=0.5. */
export function quadraticBezierMidpointTangent(p0: Point2D, cp: Point2D, p2: Point2D): Point2D;

/**
 * Compute the control point for a gentle arc between p0 and p2.
 * The control point is offset perpendicular to the midpoint of the straight line p0-p2.
 * @param curvature - Signed offset magnitude. 0 = straight line. Positive = curve one way, negative = the other.
 */
export function computeControlPoint(p0: Point2D, p2: Point2D, curvature: number): Point2D;

/**
 * Generate a polygon approximating the thick Bézier curve for hit testing.
 * Samples `segments` points along the curve, offsets each point perpendicular
 * to the tangent by ±halfWidth, returns a closed polygon.
 */
export function approximateBezierHitPolygon(
  p0: Point2D, cp: Point2D, p2: Point2D,
  halfWidth: number, segments: number,
): readonly Point2D[];

/** 90-degree counterclockwise rotation of a 2D vector. */
export function perpendicular(v: Point2D): Point2D;

/** Normalize a 2D vector to unit length. Returns {x:0,y:0} for zero-length input. */
export function normalize(v: Point2D): Point2D;
```

## Connection-Route Renderer

**New file**: `packages/runner/src/canvas/renderers/connection-route-renderer.ts`

### Factory

```typescript
export interface ConnectionRouteRendererOptions {
  readonly parentContainer: Container;
  readonly junctionRadius: number;         // default: 6
  readonly defaultCurvature: number;        // default: 30 (px perpendicular offset)
  readonly hitAreaPadding: number;           // default: 12 (px beyond stroke width)
  readonly curveSegments: number;            // default: 24
  readonly wavySegments: number;             // default: 32
}

export function createConnectionRouteRenderer(
  options: ConnectionRouteRendererOptions,
): ConnectionRouteRenderer;
```

### Rendering Per Connection Zone

For each `ConnectionRouteNode`:

1. **Look up endpoint positions** from the layout position map.
2. **Compute control point** via `computeControlPoint(endpointA, endpointB, curvature)`. If two connections share the same pair of endpoints, offset their curvatures in opposite directions to avoid overlap.
3. **Draw the curve**:
   - **Highway (non-wavy)**: `graphics.moveTo(p0).quadraticCurveTo(cp.x, cp.y, p2.x, p2.y).stroke(style)`.
   - **Mekong (wavy)**: Sample `wavySegments` points along the Bézier. At each sample point, apply a sine-wave perpendicular displacement: `offset = sin(i * waveFrequency * 2π) * waveAmplitude`. Draw the displaced points as a polyline via `moveTo/lineTo`.
4. **Hit area**: Generate polygon via `approximateBezierHitPolygon()`, create a PixiJS `Polygon`, assign as `container.hitArea`.
5. **Midpoint container**: Create an invisible `Container` at the curve midpoint (`quadraticBezierMidpoint`). This container is where tokens attach. Register it in `getContainerMap()` keyed by the zone ID.
6. **Label**: Create a `BitmapText` at the midpoint, rotated to match the tangent angle. Rotation = `Math.atan2(tangent.y, tangent.x)`. If the text would be upside-down (angle > π/2 or < -π/2), add π to flip it. Position the label slightly offset perpendicular to the curve to avoid overlapping the stroke.
7. **Sabotage badge**: If the zone has a marker badge (from `PresentationZoneRenderSpec`), position it relative to the midpoint container, following the same badge pattern as zone-renderer.

### Junction Rendering

For each `JunctionNode`:
- Draw a filled circle at the junction position with radius `junctionRadius`.
- Color: average of the two connecting curves' stroke colors, or a neutral gray.

### Selection/Highlight Strokes

Follow the same stroke spec pattern as zone-renderer:
- `isHighlighted` → yellow stroke (`#facc15`, width 4)
- `isSelectable` → blue stroke (`#93c5fd`, width 2)
- Default → the connection style stroke

### Container Map

```typescript
getContainerMap(): ReadonlyMap<string, Container>;
```

Returns a map of zone ID → midpoint Container for all connection-route zones. This map is merged with the zone-renderer's container map when passed to `token-renderer.update()`, so tokens on connection zones render at the curve midpoint.

### Destroy

Remove all graphics, containers, labels, and junction dots from the parent container. Follow the same `safeDestroyContainer` pattern as other renderers.

## Pipeline Integration

### presentation-scene.ts

In `buildPresentationScene()`, after filtering hidden zones and resolving zone nodes:

```typescript
const connectionResolution = resolveConnectionRoutes(zones, adjacencies, options.positions);

return {
  zones: connectionResolution.filteredZones,
  tokens: resolvePresentationTokenNodes(/* ... */),
  adjacencies: connectionResolution.filteredAdjacencies,
  connectionRoutes: connectionResolution.connectionRoutes,
  junctions: connectionResolution.junctions,
  overlays: options.overlays,
  regions: resolveRegionNodes(connectionResolution.filteredZones, options.positions, options.visualConfigProvider),
};
```

Add to `PresentationScene` interface:

```typescript
readonly connectionRoutes: readonly ConnectionRouteNode[];
readonly junctions: readonly JunctionNode[];
```

### game-canvas-runtime.ts

1. Create `connectionRouteLayer` container in the layer hierarchy, positioned between `adjacencyLayer` and `zoneLayer`:
   - Z-order: regions < adjacency < **connection-routes** < zones < tokens
2. Instantiate `createConnectionRouteRenderer({ parentContainer: connectionRouteLayer, ... })`.
3. Wire into canvas updater deps.
4. Add to destroy chain.
5. Wire selection/pointer handlers for connection-route containers (same pattern as zone containers).

### canvas-updater.ts

In the update cycle:

```typescript
connectionRouteRenderer.update(scene.connectionRoutes, scene.junctions, positions, visualConfigProvider);

// Merge container maps for token rendering
const allContainers = new Map([
  ...zoneRenderer.getContainerMap(),
  ...connectionRouteRenderer.getContainerMap(),
]);
tokenRenderer.update(scene.tokens, allContainers);
```

### Token Positioning

Tokens on connection-route zones use the standard fan offset from `computeFanOffset()`, relative to the midpoint container. This positions them in a horizontal fan at the curve midpoint. A follow-up enhancement can rotate the fan perpendicular to the curve tangent.

### shape-utils.ts

Add a `'connection'` case to `drawZoneShape()` that is a no-op (returns without drawing). Connection zones are not drawn by the zone renderer — they are handled entirely by the connection-route renderer. If a `'connection'` zone somehow reaches `drawZoneShape()`, it should silently do nothing.

## Adjacency Filtering

The connection-route resolver removes adjacency pairs where one end is a connection zone and the other is one of its primary endpoints. The curve *replaces* those lines.

**Preserved adjacencies**:
- Between two non-connection zones (provinces, cities)
- Between a connection zone and a "touching" province (these are standard adjacency lines from the touching province to the curve midpoint — or they can be suppressed entirely via visual config if they add clutter)

**Open question**: Should adjacencies from touching provinces to connection zones be drawn? In the physical FITL map, these provinces border the road but aren't its endpoints. Drawing a line from a province to a curve midpoint may look odd. Recommendation: **suppress them by default** (the resolver removes all adjacencies involving a connection zone), with a visual config flag to re-enable if needed.

## FITL LoC Inventory

17 LoC zones affected by this change:

| Zone ID | Terrain | Econ | Primary Endpoints |
|---------|---------|------|-------------------|
| loc-hue-khe-sanh | highway | 1 | Hue, Central Laos |
| loc-hue-da-nang | highway | 1 | Hue, Da Nang |
| loc-da-nang-dak-to | highway | 0 | Da Nang, (junction w/ Kontum-Dak To) |
| loc-da-nang-qui-nhon | highway | 1 | Da Nang, Qui Nhon |
| loc-kontum-dak-to | highway | 1 | Kontum, (junction w/ Da Nang-Dak To) |
| loc-kontum-qui-nhon | highway | 1 | Kontum, Qui Nhon |
| loc-kontum-ban-me-thuot | highway | 1 | Kontum, (complex — 3+ adjacent LoCs) |
| loc-qui-nhon-cam-ranh | highway | 1 | Qui Nhon, Cam Ranh |
| loc-cam-ranh-da-lat | highway | 1 | Cam Ranh, (junction area) |
| loc-ban-me-thuot-da-lat | highway | 0 | (junction area) |
| loc-saigon-cam-ranh | highway | 1 | Saigon, Cam Ranh |
| loc-saigon-da-lat | highway | 1 | Saigon, (junction area) |
| loc-saigon-an-loc-ban-me-thuot | highway | 1 | An Loc, Saigon (explicit override needed) |
| loc-saigon-can-tho | mekong | 2 | Saigon, Can Tho |
| loc-can-tho-chau-doc | mekong | 1 | Can Tho, Chau Doc (Parrot's Beak) |
| loc-can-tho-bac-lieu | mekong | 0 | Can Tho, Bac Lieu (Ba Xuyen) |
| loc-can-tho-long-phu | mekong | 1 | Can Tho, Long Phu (Ba Xuyen) |

## Phased Implementation Order

### Phase 1: Bézier Math Utilities
- Create `packages/runner/src/canvas/geometry/bezier-utils.ts`
- Create `packages/runner/test/canvas/geometry/bezier-utils.test.ts`
- Pure functions, zero dependencies, fully testable in isolation

### Phase 2: Connection-Route Resolver
- Create `packages/runner/src/presentation/connection-route-resolver.ts`
- Create `packages/runner/test/presentation/connection-route-resolver.test.ts`
- Testable with mock zone/adjacency data, no rendering needed

### Phase 3: Visual Config Schema Extension
- Modify `packages/runner/src/config/visual-config-defaults.ts` — add `'connection'` to `ZoneShape`
- Modify `packages/runner/src/config/visual-config-types.ts` — add `ConnectionStyleConfig`, extend `ZonesConfig`
- Modify `packages/runner/src/config/visual-config-provider.ts` — add `resolveConnectionStyle()`
- Modify `data/games/fire-in-the-lake/visual-config.yaml` — change LoC config
- Modify `packages/runner/src/canvas/renderers/shape-utils.ts` — add no-op `'connection'` case

### Phase 4: Connection-Route Renderer
- Create `packages/runner/src/canvas/renderers/connection-route-renderer.ts`
- Create `packages/runner/test/canvas/renderers/connection-route-renderer.test.ts`
- Add `ConnectionRouteRenderer` interface to `packages/runner/src/canvas/renderers/renderer-types.ts`

### Phase 5: Pipeline Integration
- Modify `packages/runner/src/presentation/presentation-scene.ts`
- Modify `packages/runner/src/canvas/game-canvas-runtime.ts`
- Modify `packages/runner/src/canvas/canvas-updater.ts`
- Update `packages/runner/test/presentation/presentation-scene.test.ts`

### Phase 6: Adjacency Filtering & Cleanup
- Verify adjacency lines from LoC endpoints are removed
- Verify zone-renderer no longer draws connection zones
- Update `packages/runner/test/canvas/renderers/zone-renderer.test.ts`

### Phase 7 (Follow-up)
- Tangent-perpendicular token fanning
- Animated river flow (GSAP-based sine wave animation on mekong curves)
- Curvature auto-adjustment for overlapping connections

## Testing Strategy

### Unit Tests

| Test File | Coverage |
|-----------|----------|
| `bezier-utils.test.ts` | Midpoint accuracy, tangent direction, hit polygon vertex count, perpendicular orthogonality, zero-curvature = straight line |
| `connection-route-resolver.test.ts` | Endpoint resolution (2 of 4 adjacencies), junction detection (2 LoCs sharing edge), filtering correctness (connection zones removed, endpoint adjacencies removed, non-endpoint adjacencies preserved) |
| `connection-route-renderer.test.ts` | Container creation per route, midpoint positioning, getContainerMap() completeness, destroy cleanup |

### Integration Tests

- `presentation-scene.test.ts`: `connectionRoutes` field populated, `filteredZones` excludes connection zones, `filteredAdjacencies` excludes endpoint pairs
- `zone-renderer.test.ts`: Zones with `shape: 'connection'` are not passed to zone renderer (filtered upstream)

### Visual Verification

1. Run `pnpm -F @ludoforge/runner dev`
2. Load FITL game
3. Confirm: LoC rectangles are gone, replaced by curves
4. Confirm: Highway curves are solid brown, Mekong curves are wavy blue
5. Confirm: Junction dots appear where LoCs meet
6. Confirm: Labels are readable, rotated to follow curve direction
7. Confirm: Tokens on LoCs cluster at curve midpoints
8. Confirm: LoC zones remain selectable (pointer hover, click)
9. Confirm: Sabotage badges appear on sabotaged LoCs
10. Confirm: No adjacency lines from LoC endpoints remain

## Files Summary

| File | Action |
|------|--------|
| `packages/runner/src/config/visual-config-defaults.ts` | Modify — add `'connection'` to `ZoneShape` |
| `packages/runner/src/config/visual-config-types.ts` | Modify — add `ConnectionStyleConfig`, extend `ZonesConfig` |
| `packages/runner/src/config/visual-config-provider.ts` | Modify — add `resolveConnectionStyle()` |
| `packages/runner/src/canvas/geometry/bezier-utils.ts` | **New** — Bézier math utilities |
| `packages/runner/src/presentation/connection-route-resolver.ts` | **New** — topology resolution |
| `packages/runner/src/canvas/renderers/connection-route-renderer.ts` | **New** — curve rendering |
| `packages/runner/src/canvas/renderers/renderer-types.ts` | Modify — add `ConnectionRouteRenderer` interface |
| `packages/runner/src/canvas/renderers/shape-utils.ts` | Modify — add no-op `'connection'` case |
| `packages/runner/src/presentation/presentation-scene.ts` | Modify — split zones, add `connectionRoutes`/`junctions` to `PresentationScene` |
| `packages/runner/src/canvas/game-canvas-runtime.ts` | Modify — instantiate renderer, add layer |
| `packages/runner/src/canvas/canvas-updater.ts` | Modify — wire renderer, merge container maps |
| `data/games/fire-in-the-lake/visual-config.yaml` | Modify — change LoC style, add `connectionStyles` |
| `packages/runner/test/canvas/geometry/bezier-utils.test.ts` | **New** — math tests |
| `packages/runner/test/presentation/connection-route-resolver.test.ts` | **New** — resolver tests |
| `packages/runner/test/canvas/renderers/connection-route-renderer.test.ts` | **New** — renderer tests |
| `packages/runner/test/presentation/presentation-scene.test.ts` | Modify — add connection route assertions |
| `packages/runner/test/canvas/renderers/zone-renderer.test.ts` | Modify — verify connection zones excluded |
