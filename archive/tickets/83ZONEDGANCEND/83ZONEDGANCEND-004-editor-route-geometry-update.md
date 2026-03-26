# 83ZONEDGANCEND-004: Editor Route Geometry Update

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: `archive/tickets/83ZONEDGANCEND-001-schema-extension-and-export-serialization.md`, `archive/tickets/83ZONEDGANCEND-002-edge-position-math-utilities.md`

## Problem

The map editor's `resolveEndpointPosition` function resolves zone endpoints to the zone center. When a zone endpoint has an `anchor` angle, the editor must resolve it to the edge position to correctly render route geometry, sampled paths, and hit areas.

## Assumption Reassessment (2026-03-26)

1. `resolveEndpointPosition` is in `packages/runner/src/map-editor/map-editor-route-geometry.ts` and its current signature is `(endpoint, zonePositions, connectionAnchors) => Position | null`.
2. `resolveRouteGeometry` in the same file is the only caller of `resolveEndpointPosition`.
3. The actual editor callsites of `resolveRouteGeometry` are:
   - `packages/runner/src/map-editor/map-editor-route-renderer.ts`
   - `packages/runner/src/map-editor/map-editor-handle-renderer.ts`
4. The editor store currently owns zone positions, connection anchors, and connection routes only. It does **not** own zone visual metadata, and that is correct. Zone visuals should remain derived from `gameDef + VisualConfigProvider`, not duplicated into mutable editor state.
5. Presentation route resolution is already anchor-aware in `packages/runner/src/presentation/connection-route-resolver.ts`; the remaining gap is specifically the editor geometry path.
6. Existing tests already prove schema/storage/export support for `endpoint.anchor` metadata. The missing coverage is on editor geometry resolution and the renderers that consume it.
7. Spec 83 section 4 still mentions an optional `zoneVisuals` parameter for backward compatibility. This ticket should **not** follow that part of the spec; the repo foundations require the editor geometry contract to be updated comprehensively with no compatibility fallback.

## Architecture Check

1. The editor must adopt the same endpoint contract as presentation. A zone endpoint with `anchor` means edge attachment everywhere, not only in one renderer path.
2. `resolveEndpointPosition` and `resolveRouteGeometry` should take a required `zoneVisuals` map. Optional fallback here would preserve a stale architecture and violate F9/F10 by allowing center-only editor rendering to survive indefinitely.
3. The geometry module should stay pure and generic. It should consume resolved zone visuals, not import `VisualConfigProvider` or derive visuals itself.
4. Zone-visual derivation belongs at the renderer boundary. `createEditorRouteRenderer` and `createEditorHandleRenderer` should derive the shared zone-visual map from `gameDef + VisualConfigProvider` and pass it into geometry resolution.
5. Uses existing `getEdgePointAtAngle` and `resolveVisualDimensions` from shape-utils (no duplication).
6. Pure function, returns new Position objects (F7).

## What to Change

### 1. Extend `resolveEndpointPosition` signature

Add a required `zoneVisuals` parameter:

```typescript
export function resolveEndpointPosition(
  endpoint: ConnectionEndpoint,
  zonePositions: ReadonlyMap<string, Position>,
  connectionAnchors: ReadonlyMap<string, Position>,
  zoneVisuals: ReadonlyMap<string, { shape?: ZoneShape; width?: number; height?: number }>,
): Position | null
```

### 2. Apply edge offset when anchor is defined

In the `endpoint.kind === 'zone'` branch, after getting the center position, check for `endpoint.anchor` and `zoneVisuals`:

```typescript
if (endpoint.kind === 'zone') {
  const center = clonePosition(zonePositions.get(endpoint.zoneId));
  if (center === null) return null;
  if (endpoint.anchor !== undefined) {
    const visual = zoneVisuals.get(endpoint.zoneId);
    if (visual === undefined) return null;
    const dimensions = resolveVisualDimensions(visual, DEFAULT_ZONE_DIMENSIONS);
    const offset = getEdgePointAtAngle(visual.shape, dimensions, endpoint.anchor);
    return { x: center.x + offset.x, y: center.y + offset.y };
  }
  return center;
}
```

### 3. Update editor geometry entry points to pass `zoneVisuals`

Audit all callers of `resolveRouteGeometry`, update them in the same change, and remove any remaining center-only editor route rendering path.

The concrete editor updates are:

1. `createEditorRouteRenderer(...)` derives a zone-visual map once from `gameDef + VisualConfigProvider` and passes it to every `resolveRouteGeometry(...)` call.
2. `createEditorHandleRenderer(...)` must gain access to the same visual data source and pass the same zone-visual map to `resolveRouteGeometry(...)`.
3. `MapEditorScreen.tsx` must wire the additional `createEditorHandleRenderer(...)` dependency explicitly rather than relying on hidden/global access.

## Files to Touch

- `packages/runner/src/map-editor/map-editor-route-geometry.ts` (modify)
- `packages/runner/src/map-editor/map-editor-route-renderer.ts` (modify)
- `packages/runner/src/map-editor/map-editor-handle-renderer.ts` (modify)
- `packages/runner/src/map-editor/MapEditorScreen.tsx` (modify — pass visual context into handle renderer)
- Relevant map-editor tests that exercise geometry and renderer wiring

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
3. `resolveEndpointPosition` with zone endpoint, `anchor` set but zone missing from `zoneVisuals`: fails closed
4. `resolveRouteGeometry` produces correct sampled path when endpoints have anchors
5. `createEditorRouteRenderer` and `createEditorHandleRenderer` both compile and render using the required `zoneVisuals` contract
6. Existing suite: `pnpm -F @ludoforge/runner test`
7. Existing suite: `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. Editor route geometry and presentation route geometry use the same edge-anchor semantics.
2. No mutation of input maps or endpoint objects (F7).
3. Hit area and sampled path are derived from resolved positions — they automatically incorporate edge offsets.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/map-editor/map-editor-route-geometry.test.ts` — add tests for anchored endpoints, fail-closed missing visuals, and route geometry with anchored endpoints
2. `packages/runner/test/map-editor/map-editor-route-renderer.test.ts` — verify the editor route renderer consumes anchored endpoint geometry instead of zone centers
3. `packages/runner/test/map-editor/map-editor-handle-renderer.test.ts` — verify zone endpoint handles render at anchored edge positions when endpoint metadata includes `anchor`

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/map-editor/map-editor-route-geometry.test.ts`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`

## Outcome

- Completion date: 2026-03-26
- What actually changed:
  - Updated editor route geometry so zone endpoints with `anchor` resolve to zone-edge positions, not zone centers.
  - Made `zoneVisuals` a required input to the pure editor geometry helpers.
  - Added a shared map-editor zone-visual resolver and threaded it through both the route renderer and handle renderer.
  - Updated `MapEditorScreen` wiring so renderer dependencies are explicit.
  - Added geometry and renderer tests covering anchored editor paths.
- Deviations from original plan:
  - Added a small shared helper module for zone-visual lookup to avoid duplicating `gameDef + VisualConfigProvider` resolution logic across renderers.
  - Updated `MapEditorScreen` and its test because the new handle-renderer contract needs explicit `gameDef` wiring.
- Verification results:
  - `pnpm -F @ludoforge/runner test` ✅
  - `pnpm -F @ludoforge/runner typecheck` ✅
  - `pnpm -F @ludoforge/runner lint` ✅
