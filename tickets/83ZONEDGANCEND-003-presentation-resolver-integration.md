# 83ZONEDGANCEND-003: Presentation Resolver Integration

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: `archive/tickets/83ZONEDGANCEND-001-schema-extension-and-export-serialization.md`, `tickets/83ZONEDGANCEND-002-edge-position-math-utilities.md`

## Problem

The presentation layer's `resolveConfiguredEndpoint` function always resolves zone endpoints to the zone center position. When a zone endpoint has an `anchor` angle, the resolved position must be offset to the zone's edge at that angle.

## Assumption Reassessment (2026-03-26)

1. `resolveConfiguredEndpoint` is in `packages/runner/src/presentation/connection-route-resolver.ts` (lines 269-303).
2. It already receives `zoneById: ReadonlyMap<string, PresentationZoneNode>` which contains `zone.visual` with shape, width, height.
3. `resolveVisualDimensions` is already exported from `shape-utils.ts` and can be imported.
4. The function returns `ResolvedConnectionPoint` with `{ kind, id, position }` — the position field is what changes.
5. Default dimensions fallback uses `ZONE_RENDER_WIDTH` / `ZONE_RENDER_HEIGHT` from `layout-constants.ts`.

## Architecture Check

1. Minimal change: ~8 lines of conditional logic added to an existing function.
2. No signature change needed — `zoneById` already provides all required data.
3. Behavior is purely additive: no `anchor` → center (existing), `anchor` present → edge offset (new).
4. Pure position computation, no mutation (F7).

## What to Change

### 1. Offset zone endpoint position when `anchor` is defined

In `resolveConfiguredEndpoint` (connection-route-resolver.ts), after resolving the zone center position, add:

```typescript
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

### 2. Add imports

Import `getEdgePointAtAngle` from `shape-utils.ts`. Import or define `DEFAULT_ZONE_DIMENSIONS` using layout constants.

## Files to Touch

- `packages/runner/src/presentation/connection-route-resolver.ts` (modify)

## Out of Scope

- Schema changes — ticket 001
- Edge position math implementation — ticket 002
- Map editor route geometry — ticket 004
- Store actions — ticket 005
- Drag UX — ticket 006
- FITL visual config — ticket 007
- Changes to `resolveConnectionRoutes`, `validateRouteDefinition`, or segment resolution

## Acceptance Criteria

### Tests That Must Pass

1. Zone endpoint **without** `anchor`: position equals zone center (no regression)
2. Zone endpoint with `anchor: 0` on a circle zone: position is at the right edge (center.x + radius, center.y)
3. Zone endpoint with `anchor: 90` on a circle zone: position is at the top edge (center.x, center.y - radius)
4. Zone endpoint with `anchor: 270` on a rectangle zone: position is at bottom edge midpoint
5. Mixed endpoints (one anchored, one center) in the same route: both resolve correctly
6. Zone endpoint with `anchor` but zone not found in `zoneById`: falls through to center position
7. Existing suite: `pnpm -F @ludoforge/runner test`
8. Existing suite: `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. Omitting `anchor` produces identical behavior to before this change (full backward compat).
2. `ResolvedConnectionPoint` type shape is unchanged — only the position value differs.
3. No mutation of input maps or endpoint objects (F7).
4. The offset is relative to zone center, so zone repositioning automatically moves the endpoint.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/presentation/connection-route-resolver.test.ts` — add tests for anchored zone endpoints (circle, rectangle), no-anchor regression, mixed endpoints, missing zone fallback

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/presentation/connection-route-resolver.test.ts`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`
