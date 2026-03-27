# 86ADJLINRED-004: LoC Connector Spur Lines

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: archive/tickets/86ADJLINRED/86ADJLINRED-001.md

## Problem

After excluding connection zones from primary layout (86ADJLINRED-001), intermediate provinces that were adjacent to the LoC zone lose their visual connection to the road. For example, `loc-da-nang-qui-nhon` is adjacent to `quang-tin-quang-ngai` and `binh-dinh`, but the road connector only draws between the route endpoints (Da Nang → Qui Nhon). Without spur lines, the intermediate provinces appear disconnected from the highway.

## Assumption Reassessment (2026-03-27)

1. `connection-route-resolver.ts` (465 lines) identifies connection zones and resolves route geometry. Each `ConnectionRouteNode` has a `touchingZoneIds` field (line 51) — confirmed.
2. Route endpoints are determined from zone adjacency and route definitions. The route's `path` array contains the endpoint zone IDs — confirmed.
3. `connection-route-renderer.ts` (728 lines) already samples polylines via `samplePolylineAtIntervals()` (lines 532-590) and has `approximatePolylineHitPolygon()` for hit areas — confirmed. These utilities can inform spur computation.
4. `getEdgePointAtAngle()` in `shape-utils.ts` is available for computing zone edge points — confirmed.
5. The GameDef's `zones[].adjacentTo[]` contains LoC-to-province adjacency data — this is the source for determining which zones get spurs.

## Architecture Check

1. Spur computation belongs in `connection-route-resolver.ts` (geometry resolution) and spur rendering in `connection-route-renderer.ts` (drawing). This follows the existing resolver→renderer split.
2. Spur lines inherit the parent route's stroke style — no new style system needed. Game-agnostic: any connection route with adjacent zones beyond its endpoints gets spurs automatically (Foundation 1: Engine Agnosticism).
3. No backwards compatibility. Spur data is a new field on `ConnectionRouteNode` — existing consumers ignore unknown fields.

## What to Change

### 1. Compute Spur Geometry in `connection-route-resolver.ts`

Add spur computation after route geometry resolution:

**Algorithm**:
1. For each `ConnectionRouteNode`, collect the set of zones adjacent to the LoC zone from the GameDef (`zones[locZoneId].adjacentTo`)
2. Subtract zones that are already route path endpoints (these are already visually connected by the route itself)
3. For each remaining adjacent zone:
   a. Get the adjacent zone's center position from `zonePositions`
   b. Sample the route polyline at regular intervals (reuse or adapt `samplePolylineAtIntervals` from the renderer)
   c. Find the polyline sample point nearest to the adjacent zone's center
   d. Compute the edge point on the adjacent zone's boundary using `getEdgePointAtAngle()`
   e. Emit a spur segment: `{ from: nearestRoutePoint, to: zoneEdgePoint }`

**New type**:
```typescript
interface SpurSegment {
  readonly from: Position;
  readonly to: Position;
  readonly targetZoneId: string;
}
```

**Add to `ConnectionRouteNode`**:
```typescript
readonly spurs: readonly SpurSegment[];
```

**Data needed**: Zone positions and zone dimensions must be available during route resolution. Check whether `resolveConnectionRoutes()` already receives zone positions — if not, add them as a parameter.

### 2. Render Spur Lines in `connection-route-renderer.ts`

In the `update()` function, after drawing the main route polyline, iterate over `route.spurs` and draw each spur segment:

1. Use the same `ResolvedStroke` as the parent route (same color, width, alpha)
2. Draw a straight line from `spur.from` to `spur.to` using `graphics.moveTo()` → `graphics.lineTo()` → `graphics.stroke()`
3. Spurs are solid lines (not dashed) — they are extensions of the road connector

### 3. Nearest-Point-on-Polyline Utility

Create a helper function (can be local to `connection-route-resolver.ts` or in a shared geometry util):

```typescript
function nearestPointOnPolyline(
  polyline: readonly Position[],
  target: Position,
): Position
```

This projects `target` onto each polyline segment and returns the closest projection point. Standard point-to-line-segment projection math.

## Files to Touch

- `packages/runner/src/presentation/connection-route-resolver.ts` (modify — add spur computation, `SpurSegment` type, nearest-point-on-polyline helper)
- `packages/runner/src/canvas/renderers/connection-route-renderer.ts` (modify — render spur lines)

## Out of Scope

- Hiding LoC zones (86ADJLINRED-001 — prerequisite)
- Adjacency line restyling (86ADJLINRED-003)
- Dashed line utility (86ADJLINRED-002)
- Modifying `shape-utils.ts` — only consuming existing `getEdgePointAtAngle()`
- Spur hover/highlight behavior — spurs inherit the parent route's interaction state
- Curved or wavy spurs — spurs are always straight lines
- Any engine changes

## Acceptance Criteria

### Tests That Must Pass

1. **New unit test**: `packages/runner/test/presentation/connection-route-resolver.test.ts` (or extend existing)
   - Given a route with path [A, B] and an adjacent zone C not in the path, a spur is generated for C
   - Given a route with path [A, B] and zone A adjacent to the LoC, NO spur is generated for A (it's already an endpoint)
   - The spur's `from` point lies on the route polyline
   - The spur's `to` point lies on zone C's boundary (edge point, not center)
2. **New unit test**: nearest-point-on-polyline
   - A point directly on a segment returns that point
   - A point perpendicular to a segment midpoint returns the perpendicular projection
   - A point beyond the polyline endpoints returns the nearest endpoint
3. Runner lint: `pnpm -F @ludoforge/runner lint`
4. Runner typecheck: `pnpm -F @ludoforge/runner typecheck`
5. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Every zone adjacent to an LoC that is NOT a route endpoint gets exactly one spur
2. No spur is generated for route endpoints — they are already connected by the route polyline
3. Spur `from` points are always on the route polyline
4. Spur `to` points are always on the target zone's boundary
5. Spur styling matches the parent route's stroke (color, width, alpha)
6. No game-specific logic in the spur computation — it works for any connection route with adjacencies (Foundation 1)

## Test Plan

### New/Modified Tests

1. `packages/runner/test/presentation/connection-route-resolver.test.ts` — spur computation logic
2. `packages/runner/test/canvas/renderers/connection-route-renderer.test.ts` — verify spurs are drawn with correct styling (if renderer tests exist)

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner lint`
3. `pnpm -F @ludoforge/runner typecheck`

### Visual Verification

1. `pnpm -F @ludoforge/runner dev` → load FITL game
2. Confirm road connectors have spur branches extending to adjacent provinces (e.g., the Da Nang–Qui Nhon highway has branches to Quang Tin/Quang Ngai and Binh Dinh)
3. Confirm spurs match the parent road's color and width
4. Confirm no spurs appear at route endpoints (Da Nang, Qui Nhon themselves)
