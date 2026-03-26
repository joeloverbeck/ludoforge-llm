# Spec 83 — Zone Edge Anchor Endpoints

**Status**: ✅ COMPLETED

## Problem

Connection route endpoints in `visual-config.yaml` always attach to zone **centers**. When a connector (road/trail) links two zones, both ends are drawn from/to each zone's center point. This makes it impossible to express directional attachment — e.g., a road from the south of Hue to the north of Da Nang renders as a curve that departs Hue's center and arrives at Da Nang's center, producing visually incorrect connector routing.

**Concrete example**: In the FITL map, the `loc-hue-da-nang:none` road connects Hue (north) to Da Nang (south). Because endpoints use zone centers, the curve's control point at `{x: 480, y: 40}` creates a path that attaches to Da Nang's south side instead of its north side. There is no data model property to control where on a zone's boundary the connector attaches.

**Current workaround**: The map editor's `convertEndpointToAnchor` feature can replace a zone endpoint with a fixed-position anchor near the desired zone edge. But this breaks the semantic link to the zone — the anchor won't follow the zone when repositioned, creating a fragile layout.

## Solution

Add an optional `anchor` property (angle in degrees) to zone-type connection endpoints. When present, the endpoint position is computed as the intersection of a ray from the zone center at the given angle with the zone's bounding shape, rather than the zone center itself. The endpoint remains semantically linked to the zone and moves with it.

In the map editor, dragging a zone endpoint snaps to the nearest point on the zone's bounding shape edge, computing and storing the angle automatically.

## Foundations Alignment

- **F1 (Engine Agnosticism)**: No engine changes. This is entirely a runner/visual-config concern.
- **F3 (Visual Separation)**: The `anchor` property lives in `visual-config.yaml` connection route definitions, consistent with all other visual presentation data.
- **F7 (Immutability)**: All new functions are pure — they take inputs and return new positions. Editor store actions follow existing immutable update patterns.
- **F9 (No Backwards Compatibility)**: No shims needed. Omitting `anchor` means center attachment (existing behavior). No migration required.

---

## 1. Data Model — Schema Extension

### Modified Type

**`packages/runner/src/config/visual-config-types.ts`**

Extend `ZoneConnectionEndpointSchema` to accept an optional `anchor` angle:

```typescript
const ZoneConnectionEndpointSchema = z.object({
  kind: z.literal('zone'),
  zoneId: z.string(),
  anchor: z.number().min(0).max(360).optional(),
}).strict();
```

### Angle Convention

Standard mathematical angle measured from the positive x-axis (east), counterclockwise, with screen y-axis inversion:

| Direction | Angle | Meaning |
|-----------|-------|---------|
| East      | 0     | Right edge |
| North     | 90    | Top edge (screen up = negative y) |
| West      | 180   | Left edge |
| South     | 270   | Bottom edge (screen down = positive y) |

Values are stored as degrees (not radians) for YAML readability.

### YAML Example

```yaml
# Before (center attachment)
"loc-hue-da-nang:none":
  points:
    - { kind: zone, zoneId: "da-nang:none" }
    - { kind: zone, zoneId: "hue:none" }
  segments:
    - kind: quadratic
      control: { kind: position, x: 480, y: 40 }

# After (edge attachment)
"loc-hue-da-nang:none":
  points:
    - { kind: zone, zoneId: "da-nang:none", anchor: 90 }
    - { kind: zone, zoneId: "hue:none", anchor: 270 }
  segments:
    - kind: quadratic
      control: { kind: position, x: 480, y: 40 }
```

### Inferred Types

The `ConnectionEndpoint` discriminated union type remains the same shape. The zone variant gains `anchor?: number`. No changes to `AnchorConnectionEndpoint`, `ConnectionRouteSegment`, or `ConnectionRouteDefinition`.

---

## 2. Edge Position Resolution — New Utility

### New Function

**`packages/runner/src/canvas/renderers/shape-utils.ts`** — add alongside existing shape utilities:

```typescript
export function getEdgePointAtAngle(
  shape: ZoneShape | undefined,
  dimensions: ShapeDimensions,
  angleDeg: number,
): Position
```

Given a zone shape, its dimensions (width/height), and an angle in degrees, returns the point on the shape's boundary at that angle, relative to the shape's center at (0, 0).

### Shape-Specific Calculations

**Circle** (`shape: 'circle'`):
- `radius = Math.min(width, height) / 2`
- `x = radius * cos(angleRad)`, `y = -radius * sin(angleRad)` (negative sin for screen y-axis)

**Ellipse** (`shape: 'ellipse'`):
- `x = (width/2) * cos(angleRad)`, `y = -(height/2) * sin(angleRad)`

**Rectangle** (`shape: 'rectangle'`, `'line'`, or default):
- Ray-cast from origin at angle, intersect with rectangle edges at `[-width/2, width/2] x [-height/2, height/2]`
- The ray exits through whichever edge it hits first

**Diamond** (`shape: 'diamond'`):
- Ray-cast from origin at angle, intersect with the 4 diamond edges (polygon with vertices at cardinal points: `(0, -h/2)`, `(w/2, 0)`, `(0, h/2)`, `(-w/2, 0)`)

**Regular Polygons** (`shape: 'hexagon'`, `'triangle'`, `'octagon'`):
- Build polygon points using existing `buildRegularPolygonPoints(sides, width, height)`
- Ray-cast from origin at angle, intersect with polygon edges

**Connection** (`shape: 'connection'`):
- Connection zones have no visual shape — return `{x: 0, y: 0}` (center). The `anchor` property has no effect on connection-type zones.

### Helper: Ray-Polygon Intersection

A `rayPolygonIntersection(angleDeg, polygonPoints)` helper handles diamond, hexagon, triangle, and octagon uniformly by iterating polygon edges and finding the first intersection with the ray from origin.

---

## 3. Resolver Integration

### Modified Function

**`packages/runner/src/presentation/connection-route-resolver.ts`** — `resolveConfiguredEndpoint()`:

Currently (lines 269-303), zone endpoints return the zone center position directly:

```typescript
// Current
return {
  kind: 'zone',
  id: endpoint.zoneId,
  position,  // zone center
};
```

When `endpoint.anchor` is defined, the resolved position must be offset to the zone's edge:

```typescript
// New
if (endpoint.anchor !== undefined) {
  const zone = zoneById.get(endpoint.zoneId);
  if (zone !== undefined) {
    const dimensions = resolveVisualDimensions(zone.visual, DEFAULT_ZONE_DIMENSIONS);
    const offset = getEdgePointAtAngle(zone.visual.shape, dimensions, endpoint.anchor);
    return {
      kind: 'zone',
      id: endpoint.zoneId,
      position: { x: position.x + offset.x, y: position.y + offset.y },
    };
  }
}
```

### Signature Change

`resolveConfiguredEndpoint` already receives `zoneById: ReadonlyMap<string, PresentationZoneNode>`, which contains `zone.visual` (shape, width, height). No new parameters needed.

### Import

Add import for `getEdgePointAtAngle` from `shape-utils.ts` and `resolveVisualDimensions` (already exported from shape-utils).

### Default Zone Dimensions

Use the existing layout constants (`ZONE_RENDER_WIDTH`, `ZONE_RENDER_HEIGHT` from `layout-constants.ts`) as the default dimensions fallback.

---

## 4. Map Editor — Route Geometry Resolution

### Modified Function

**`packages/runner/src/map-editor/map-editor-route-geometry.ts`** — `resolveEndpointPosition()`:

Currently (lines 54-64), zone endpoints return the zone center:

```typescript
if (endpoint.kind === 'zone') {
  return clonePosition(zonePositions.get(endpoint.zoneId));
}
```

When `endpoint.anchor` is defined, apply the edge offset. This function needs access to zone visual data (shape, dimensions) to compute the offset. The function signature must be extended:

```typescript
export function resolveEndpointPosition(
  endpoint: ConnectionEndpoint,
  zonePositions: ReadonlyMap<string, Position>,
  connectionAnchors: ReadonlyMap<string, Position>,
  zoneVisuals: ReadonlyMap<string, { shape?: ZoneShape; width?: number; height?: number }>,
): Position | null
```

`zoneVisuals` is required. The editor geometry path must be updated comprehensively rather than preserving a center-only fallback. This keeps the geometry helpers pure while enforcing one endpoint contract across presentation and editor rendering.

`resolveRouteGeometry()` must also take and forward `zoneVisuals` as a required argument.

Zone visual resolution belongs at the renderer boundary, not inside the geometry helpers and not inside mutable editor store state. The concrete editor wiring is:
- `createEditorRouteRenderer(...)` derives a shared `zoneVisuals` map from `gameDef + VisualConfigProvider` and passes it into `resolveRouteGeometry(...)`.
- `createEditorHandleRenderer(...)` derives or receives the same `zoneVisuals` context and passes it into `resolveRouteGeometry(...)`.
- `MapEditorScreen.tsx` wires the required visual context explicitly when constructing the editor renderers.

---

## 5. Map Editor — Drag UX

### Current Behavior (to be replaced)

**`packages/runner/src/map-editor/map-editor-drag.ts`** — `attachZoneEndpointConvertDragHandlers()` (lines 57-154):

When the user drags a zone endpoint, the first pointer move calls `convertEndpointToAnchor()`, which:
1. Creates a new anchor at the zone's center position
2. Replaces the zone endpoint with an anchor endpoint in the route
3. Subsequent drags move the anchor freely

This breaks the zone link permanently.

### New Behavior

Replace `attachZoneEndpointConvertDragHandlers` with `attachZoneEdgeAnchorDragHandlers`:

1. **On pointer down**: Record drag start. Select the route.
2. **On pointer move**:
   - Compute the vector from the zone center to the cursor position
   - Compute the angle: `angleDeg = Math.atan2(-(cursor.y - center.y), cursor.x - center.x) * (180 / Math.PI)` (negative y for screen coords)
   - Normalize to [0, 360): `angleDeg = ((angleDeg % 360) + 360) % 360`
   - Call `getEdgePointAtAngle(shape, dimensions, angleDeg)` to get the snapped edge position
   - Move the drag handle to `center + edgeOffset`
   - Call `store.getState().previewEndpointAnchor(routeId, pointIndex, angleDeg)` for live preview
3. **On pointer up**: Commit the angle via `store.getState().setEndpointAnchor(routeId, pointIndex, angleDeg)`
4. **Escape hatch**: If the cursor distance from zone center exceeds `2 * max(width, height)`, fall back to `convertEndpointToAnchor()` behavior (detach from zone). This allows users to deliberately break the zone link when needed.

### Dependencies

The drag handler needs to know:
- The zone's center position (from `zonePositions` map)
- The zone's shape and dimensions (from visual config)

These must be passed as additional parameters to the drag handler attachment function.

---

## 6. Map Editor Store — New Actions

### New Action

**`packages/runner/src/map-editor/map-editor-store.ts`**

Add to `MapEditorStoreActions`:

## Outcome

- Completion date: 2026-03-26
- What actually changed: Spec 83 was implemented across the runner in the staged ticket sequence. The visual-config schema now accepts optional zone-endpoint `anchor` angles, shared edge-point math exists in `shape-utils.ts`, the presentation resolver and map-editor route geometry both resolve anchored zone endpoints to zone edges, the map editor store and drag flow preserve zone-linked endpoint editing, and FITL now authors the Hue↔Da Nang route with zone-edge anchors in `visual-config.yaml`.
- Deviations from original plan: implementation was split across multiple focused tickets instead of landing as a single change. The spec’s broad direction held up, but some ticket-level assumptions needed correction during execution, especially once parts of the infrastructure were already in place. The FITL authoring follow-up became primarily a data-plus-test-hardening task rather than additional runner feature work.
- Verification results: the completed ticket chain includes targeted runner tests for schema validation, shape math, presentation resolver behavior, editor route geometry, editor store actions, and drag behavior, plus final FITL integration coverage in `packages/runner/test/config/visual-config-files.test.ts`. On 2026-03-26, `pnpm -F @ludoforge/runner test`, `pnpm -F @ludoforge/runner typecheck`, and `pnpm -F @ludoforge/runner lint` passed while finalizing the FITL authoring ticket.

```typescript
setEndpointAnchor(routeId: string, pointIndex: number, anchor: number): void;
previewEndpointAnchor(routeId: string, pointIndex: number, anchor: number): void;
```

### Implementation

`setEndpointAnchor`: Updates the zone endpoint's `anchor` property in the route definition within `connectionRoutes`. Follows the same immutable update pattern as other store actions:

1. Get the route from `connectionRoutes`
2. Clone the points array
3. Set `points[pointIndex] = { ...points[pointIndex], anchor }` (only if it's a zone endpoint)
4. Update the route in the map

`previewEndpointAnchor`: Same as `setEndpointAnchor` but used during active drag (within a `beginInteraction`/`commitInteraction` pair) for live preview without creating undo entries.

---

## 7. Export — YAML Serialization

### Modified Function

**`packages/runner/src/map-editor/map-editor-export.ts`** — `cloneRouteDefinition()`:

Currently (lines 88-106), zone endpoints are cloned without `anchor`:

```typescript
point.kind === 'zone'
  ? { kind: 'zone', zoneId: point.zoneId }
  : { kind: 'anchor', anchorId: point.anchorId }
```

Must include `anchor` when present:

```typescript
point.kind === 'zone'
  ? {
      kind: 'zone',
      zoneId: point.zoneId,
      ...(point.anchor !== undefined ? { anchor: point.anchor } : {}),
    }
  : { kind: 'anchor', anchorId: point.anchorId }
```

This ensures exported YAML includes the anchor angle for zone endpoints that have one, and omits it for those that don't (preserving clean YAML output for center-attached endpoints).

---

## 8. Handle Rendering

### Modified Behavior

The map editor renders drag handles for route endpoints. Currently, zone endpoint handles are positioned at the zone center. When `anchor` is defined, the handle must be rendered at the edge position instead.

The handle rendering code (in the map editor canvas layer) must:
1. Check if the zone endpoint has an `anchor` value
2. If yes: compute edge position via `getEdgePointAtAngle` and position the handle there
3. If no: position at zone center (existing behavior)

Audit the map editor canvas code that creates endpoint handles to identify the exact file and function to modify.

---

## 9. Files to Modify — Summary

| File | Change |
|------|--------|
| `packages/runner/src/config/visual-config-types.ts` | Add `anchor?: number` to `ZoneConnectionEndpointSchema` |
| `packages/runner/src/canvas/renderers/shape-utils.ts` | Add `getEdgePointAtAngle()` and `rayPolygonIntersection()` |
| `packages/runner/src/presentation/connection-route-resolver.ts` | Apply edge offset in `resolveConfiguredEndpoint()` when anchor is set |
| `packages/runner/src/map-editor/map-editor-route-geometry.ts` | Extend `resolveEndpointPosition()` with zone visuals for edge offset |
| `packages/runner/src/map-editor/map-editor-drag.ts` | Replace `attachZoneEndpointConvertDragHandlers` with edge-snap drag |
| `packages/runner/src/map-editor/map-editor-store.ts` | Add `setEndpointAnchor` and `previewEndpointAnchor` actions |
| `packages/runner/src/map-editor/map-editor-export.ts` | Include `anchor` in `cloneRouteDefinition()` |
| Map editor canvas (handle rendering) | Position endpoint handles at edge when anchor is set |
| `data/games/fire-in-the-lake/visual-config.yaml` | Add `anchor` values to Hue-Da Nang route and audit other routes |

---

## 10. Testing

### Unit Tests — Edge Position Math

**New test file**: `packages/runner/test/canvas/renderers/shape-edge-point.test.ts`

- Circle: angles 0, 90, 180, 270 produce correct edge points
- Rectangle: cardinal angles hit midpoints of edges; diagonal angles (45, 135, 225, 315) hit corners
- Ellipse: angles produce points on the ellipse boundary
- Diamond: angles produce points on diamond edges
- Hexagon: test several angles including vertex-aligned and mid-edge
- Connection shape: returns center regardless of angle

### Unit Tests — Resolver Integration

**New tests in**: `packages/runner/test/presentation/connection-route-resolver.test.ts` (or alongside existing tests)

- Route with zone endpoint without `anchor`: position = zone center (no regression)
- Route with zone endpoint with `anchor: 90` on a circle zone: position = top of circle
- Route with zone endpoint with `anchor: 270` on a rectangle zone: position = bottom edge midpoint
- Route with mixed endpoints (one anchored, one center): both resolve correctly

### Unit Tests — Store Actions

- `setEndpointAnchor`: sets anchor on zone endpoint, returns new state
- `setEndpointAnchor` on anchor endpoint (not zone): no-op / ignored
- `previewEndpointAnchor`: updates during interaction without creating undo entry

### Unit Tests — Export

- Zone endpoint with `anchor` exports to YAML with anchor field
- Zone endpoint without `anchor` exports without anchor field (clean YAML)

### Visual Verification

- Load FITL in dev (`pnpm -F @ludoforge/runner dev`)
- Verify Hue→Da Nang road connects from south of Hue to north of Da Nang
- Open map editor, drag a zone endpoint around a city circle — verify snapping to edge
- Reposition a zone (drag it) — verify the anchored endpoint follows to the correct edge position
- Export YAML — verify anchor values present in output

---

## 11. Backward Compatibility

- **No `anchor`** = endpoint at zone center. All existing routes work unchanged.
- **Schema is additive**: The new `anchor` field is `.optional()`. Existing YAML files parse without modification.
- **No migration needed**: Routes can be incrementally updated to use `anchor` as desired.
- The `convertEndpointToAnchor` feature remains available as an escape hatch for endpoints that need to be fully detached from a zone.
