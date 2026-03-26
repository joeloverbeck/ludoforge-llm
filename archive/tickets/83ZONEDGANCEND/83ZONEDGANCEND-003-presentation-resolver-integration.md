# 83ZONEDGANCEND-003: Presentation Resolver Integration

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: `archive/tickets/83ZONEDGANCEND-001-schema-extension-and-export-serialization.md`, `archive/tickets/83ZONEDGANCEND-002-edge-position-math-utilities.md`

## Problem

The presentation layer's `resolveConfiguredEndpoint` function always resolves zone endpoints to the zone center position. When a zone endpoint has an `anchor` angle, the resolved position must be offset to the zone's edge at that angle.

## Assumption Reassessment (2026-03-26)

1. `resolveConfiguredEndpoint` is in `packages/runner/src/presentation/connection-route-resolver.ts` and still returns zone endpoints at the zone center.
2. The schema change from Spec 83 is already implemented: `ZoneConnectionEndpointSchema` already accepts optional `anchor`.
3. The shared edge math from Spec 83 is already implemented: `resolveVisualDimensions` and `getEdgePointAtAngle` already exist in `packages/runner/src/canvas/renderers/shape-utils.ts` with dedicated tests.
4. `resolveConfiguredEndpoint` already receives `zoneById: ReadonlyMap<string, PresentationZoneNode>`, and each `PresentationZoneNode` already exposes `visual.shape`, `visual.width`, and `visual.height`.
5. The resolver already returns `ResolvedConnectionPoint` with `{ kind, id, position }`; only the computed `position` should change for anchored zone endpoints.
6. The runner already has separate map-editor code paths for endpoint resolution and drag behavior. Those remain out of scope for this ticket and are tracked by later Spec 83 work.

## Architecture Check

1. The clean architecture here is to reuse the shared shape utility in the presentation resolver rather than re-implement geometry locally.
2. No signature change is needed; the resolver already has the required zone visual metadata.
3. This ticket should not introduce aliases, fallback APIs, or a parallel geometry path. The single source of truth for edge-point math remains `shape-utils.ts`.
4. Omitting `anchor` continues to mean center attachment because that is the current schema contract, not because we are preserving a legacy alias path.
5. Pure position computation only; no mutation (F7).

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

### 2. Add imports and shared defaults

Import `getEdgePointAtAngle` and `resolveVisualDimensions` from `shape-utils.ts`. Define a local default dimensions constant from layout constants rather than duplicating magic numbers inline.

## Files to Touch

- `packages/runner/src/presentation/connection-route-resolver.ts` (modify)

## Out of Scope

- Schema changes — already completed in ticket 001
- Edge position math implementation — already completed in ticket 002
- Map editor route geometry and editor endpoint rendering
- Map editor store actions and drag UX that keep zone endpoints attached while editing
- FITL visual config authoring updates
- Any changes to `validateRouteDefinition` or segment resolution semantics beyond endpoint position resolution

## Acceptance Criteria

### Tests That Must Pass

1. Zone endpoint **without** `anchor`: position equals zone center (no regression)
2. Zone endpoint with `anchor: 0` on a circle zone: position is at the right edge (center.x + radius, center.y)
3. Zone endpoint with `anchor: 90` on a circle zone: position is at the top edge (center.x, center.y - radius)
4. Zone endpoint with `anchor: 270` on a rectangle zone: position is at bottom edge midpoint
5. Mixed endpoints (one anchored, one center) in the same route: both resolve correctly
6. Zone endpoint with `anchor` but missing zone metadata or position still fails closed, matching the resolver's existing invalid-geometry behavior
7. Route definitions for connection zones continue to resolve only non-connection zone endpoints; this ticket does not broaden that contract
8. Existing suite: `pnpm -F @ludoforge/runner test`
9. Existing suite: `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. Omitting `anchor` produces the same center-based resolution defined by the current schema contract.
2. `ResolvedConnectionPoint` type shape is unchanged — only the position value differs.
3. No mutation of input maps or endpoint objects (F7).
4. The offset is relative to zone center, so zone repositioning automatically moves the endpoint.
5. Geometry remains derived from shared shape utilities; the resolver does not become a second shape-math implementation.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/presentation/connection-route-resolver.test.ts` — add tests for anchored zone endpoints (circle, rectangle), no-anchor regression, mixed endpoints, and invalid configured zone endpoints failing closed

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/presentation/connection-route-resolver.test.ts`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`

## Outcome

- Completion date: 2026-03-26
- What actually changed: `resolveConfiguredEndpoint` now uses the shared shape utilities to offset anchored zone endpoints from zone centers to zone edges. The presentation resolver continues to fail closed for invalid configured zone endpoints. Resolver tests were expanded to cover center-preserving behavior, anchored circle and rectangle endpoints, mixed anchored and unanchored paths, and invalid configured zone endpoints.
- Deviations from original plan: the ticket was corrected before implementation because several assumptions were stale. Schema support and edge-math utilities were already implemented, and the original ticket incorrectly assumed missing zones should fall back to center resolution. That behavior remains fail-closed by design. The ticket also now explicitly keeps map-editor endpoint behavior out of scope.
- Verification results: `pnpm -F @ludoforge/runner test`, `pnpm -F @ludoforge/runner typecheck`, and `pnpm -F @ludoforge/runner lint` all passed on 2026-03-26. The targeted `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/presentation/connection-route-resolver.test.ts` command exercised the full runner Vitest suite in the current package script shape and also passed.
