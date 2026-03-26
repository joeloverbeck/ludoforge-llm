# 83ZONEDGANCEND-004: Editor Route Geometry Update

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: `archive/tickets/83ZONEDGANCEND-001-schema-extension-and-export-serialization.md`, `tickets/83ZONEDGANCEND-002-edge-position-math-utilities.md`

## Problem

The map editor's `resolveEndpointPosition` function resolves zone endpoints to the zone center. When a zone endpoint has an `anchor` angle, the editor must resolve it to the edge position to correctly render route geometry, sampled paths, and hit areas.

## Assumption Reassessment (2026-03-26)

1. `resolveEndpointPosition` is in `packages/runner/src/map-editor/map-editor-route-geometry.ts` (lines 54-64).
2. Current signature: `(endpoint, zonePositions, connectionAnchors) → Position | null`.
3. The function is called by `resolveRouteGeometry` in the same file (line 66-125).
4. `resolveRouteGeometry` is called from map editor canvas code — callers must be audited to pass `zoneVisuals`.
5. The function currently has no access to zone visual data (shape/dimensions).

## Architecture Check

1. The function signature is extended with an optional `zoneVisuals` parameter — backward compatible.
2. Uses existing `getEdgePointAtAngle` and `resolveVisualDimensions` from shape-utils (no duplication).
3. Pure function, returns new Position objects (F7).

## What to Change

### 1. Extend `resolveEndpointPosition` signature

Add an optional `zoneVisuals` parameter:

```typescript
export function resolveEndpointPosition(
  endpoint: ConnectionEndpoint,
  zonePositions: ReadonlyMap<string, Position>,
  connectionAnchors: ReadonlyMap<string, Position>,
  zoneVisuals?: ReadonlyMap<string, { shape?: ZoneShape; width?: number; height?: number }>,
): Position | null
```

### 2. Apply edge offset when anchor is defined

In the `endpoint.kind === 'zone'` branch, after getting the center position, check for `endpoint.anchor` and `zoneVisuals`:

```typescript
if (endpoint.kind === 'zone') {
  const center = clonePosition(zonePositions.get(endpoint.zoneId));
  if (center === null) return null;
  if (endpoint.anchor !== undefined && zoneVisuals !== undefined) {
    const visual = zoneVisuals.get(endpoint.zoneId);
    if (visual !== undefined) {
      const dimensions = resolveVisualDimensions(visual, DEFAULT_ZONE_DIMENSIONS);
      const offset = getEdgePointAtAngle(visual.shape, dimensions, endpoint.anchor);
      return { x: center.x + offset.x, y: center.y + offset.y };
    }
  }
  return center;
}
```

### 3. Update callers to pass `zoneVisuals`

Audit all callers of `resolveEndpointPosition` and `resolveRouteGeometry`. Where zone visual data is available (from the editor store or visual config), pass it through. At minimum, `resolveRouteGeometry` must accept and forward `zoneVisuals`.

## Files to Touch

- `packages/runner/src/map-editor/map-editor-route-geometry.ts` (modify)
- Caller files that invoke `resolveEndpointPosition` or `resolveRouteGeometry` (modify — pass `zoneVisuals`)

## Out of Scope

- Schema changes — ticket 001
- Edge position math implementation — ticket 002
- Presentation resolver — ticket 003
- Store actions — ticket 005
- Drag UX — ticket 006
- FITL visual config — ticket 007
- Changes to hit area calculation or sampled path generation logic

## Acceptance Criteria

### Tests That Must Pass

1. `resolveEndpointPosition` with zone endpoint, no `anchor`: returns zone center (no regression)
2. `resolveEndpointPosition` with zone endpoint, `anchor: 90`, circle shape: returns top edge position
3. `resolveEndpointPosition` with zone endpoint, `anchor` set but no `zoneVisuals`: returns zone center (graceful fallback)
4. `resolveEndpointPosition` with zone endpoint, `anchor` set but zone not in `zoneVisuals`: returns zone center
5. `resolveRouteGeometry` produces correct sampled path when endpoints have anchors
6. Existing suite: `pnpm -F @ludoforge/runner test`
7. Existing suite: `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. Omitting `zoneVisuals` produces identical behavior to before (full backward compat for callers not yet updated).
2. No mutation of input maps or endpoint objects (F7).
3. Hit area and sampled path are derived from resolved positions — they automatically incorporate edge offsets.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/map-editor/map-editor-route-geometry.test.ts` — add tests for anchored endpoints with/without zoneVisuals, fallback behavior, route geometry with anchored endpoints

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/map-editor/map-editor-route-geometry.test.ts`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`
