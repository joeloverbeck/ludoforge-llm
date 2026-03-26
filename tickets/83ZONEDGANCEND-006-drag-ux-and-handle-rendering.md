# 83ZONEDGANCEND-006: Drag UX and Zone-Linked Endpoint Editing

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: `archive/tickets/83ZONEDGANCEND-002-edge-position-math-utilities.md`, `archive/tickets/83ZONEDGANCEND/83ZONEDGANCEND-004-editor-route-geometry-update.md`, `archive/tickets/83ZONEDGANCEND/83ZONEDGANCEND-005-store-actions-set-and-preview-anchor.md`

## Problem

When the user drags a zone endpoint in the map editor, the current behavior calls `convertEndpointToAnchor()` which permanently breaks the semantic link between the endpoint and the zone. The remaining work is to replace that default drag path with zone-linked endpoint editing driven by `previewEndpointAnchor` / `setEndpointAnchor`.

## Assumption Reassessment (2026-03-26)

1. `attachZoneEndpointConvertDragHandlers` is in `packages/runner/src/map-editor/map-editor-drag.ts` (lines 57-154).
2. On first pointer move, it calls `state.convertEndpointToAnchor(routeId, pointIndex)` to get an `anchorId`, then switches to free anchor dragging.
3. The function returns a cleanup function removing event listeners.
4. Other drag handlers follow the pattern: `attachZoneDragHandlers`, `attachAnchorDragHandlers`, `attachControlPointDragHandlers`, `attachPositionDragHandlers`.
5. Handle rendering for anchored zone endpoints is already implemented through shared editor route geometry. `map-editor-handle-renderer.ts` positions handles from resolved geometry, so that portion of the original scope is no longer pending.
6. The remaining drag change still needs zone center position plus zone shape/dimensions at the handler boundary.
7. This ticket is the primary owner of the remaining design gap: zone endpoint drags must preserve zone linkage by default, and the old detach-on-first-move behavior should cease to be the normal path.
8. `convertEndpointToAnchor()` still seeds the new free anchor from the raw zone center in `map-editor-store.ts`. Because drag is the only live caller, this ticket must also correct the escape-hatch detach semantics so a deliberate detach starts from the current resolved endpoint position, not a center jump.

## Architecture Check

1. Replaces the existing conversion-based approach with edge-snapping — cleaner UX, preserves zone semantics.
2. The primary interaction path must be zone-linked endpoint editing, not conversion to free anchors. Any escape hatch must be explicit and secondary.
3. Uses existing store interaction pattern (`beginInteraction` → `previewEndpointAnchor` → `commitInteraction`) and the geometry contract from ticket 004.
4. Drag-time snapping must use the same zone shape/dimension contract as route geometry so editing and rendering cannot drift.
5. Pure angle computation from cursor position (F7).
6. If the user explicitly detaches, the resulting free anchor must inherit the currently resolved endpoint position. Reverting to zone center would reintroduce a second, conflicting endpoint-geometry contract.

## What to Change

### 1. Replace `attachZoneEndpointConvertDragHandlers`

In `packages/runner/src/map-editor/map-editor-drag.ts`, replace `attachZoneEndpointConvertDragHandlers` with `attachZoneEdgeAnchorDragHandlers` and update every caller in the same change:

**Parameters** (extended from current):
- `handle`: drag target
- `routeId`, `pointIndex`: identify the endpoint
- `dragSurface`: pointer event surface
- `store`: editor store
- `zoneCenter`: `Position` — the zone's current center position
- `zoneShape`: `ZoneShape | undefined` — the zone's shape
- `zoneDimensions`: `ShapeDimensions` — the zone's width/height

**Behavior**:
1. **On pointer down**: Record drag start. Select the route.
2. **On pointer move**:
   - Compute angle from zone center to cursor: `atan2(-(cursor.y - center.y), cursor.x - center.x)` → degrees
   - Normalize to [0, 360)
   - Compute edge point via `getEdgePointAtAngle(shape, dimensions, angle)`
   - Move handle to `center + offset`
   - Call `store.getState().previewEndpointAnchor(routeId, pointIndex, angle)`
3. **On pointer up**: The committed route state must retain a `kind: 'zone'` endpoint with the computed `anchor`
4. **Escape hatch**: If cursor distance from center > `2 * Math.max(width, height)`, an explicit detach to free anchor is acceptable, but it must remain a secondary branch rather than the default flow
5. **Detach position invariant**: When that explicit detach happens, the new free anchor must be created at the current snapped endpoint position (`center + edgeOffset`), not at the zone center

### 2. Update callers of the drag handler

The code that attaches drag handlers to zone endpoint handles in `map-editor-handle-renderer.ts` must call the new function with the additional zone data parameters.

### 3. Tighten the detach store contract used by the escape hatch

Because drag is the only live caller of `convertEndpointToAnchor()`, this ticket should update that store contract in the same change so the detach path stays aligned with shared route geometry.

Preferred direction:
- replace the center-seeded conversion API with a position-aware version that accepts the resolved detach position
- update all callers and tests in the same change
- do not introduce an alias or fallback signature (F9)

## Files to Touch

- `packages/runner/src/map-editor/map-editor-drag.ts` (modify — replace handler)
- `packages/runner/src/map-editor/map-editor-handle-renderer.ts` (modify — pass zone data into the drag handler)
- `packages/runner/src/map-editor/map-editor-store.ts` (modify — detach path must accept/use resolved endpoint position)
- `packages/runner/test/map-editor/map-editor-store.test.ts` (modify — cover position-aware detach semantics)
- Any shared editor geometry caller updated by ticket 004 (modify as needed)

## Out of Scope

- Schema changes — ticket 001
- Edge position math implementation — ticket 002
- Presentation resolver — ticket 003
- Editor route geometry — ticket 004
- Broad store work beyond the detach-path contract already required by this ticket
- FITL visual config — ticket 007
- `attachZoneDragHandlers`, `attachAnchorDragHandlers`, `attachControlPointDragHandlers` — unchanged
- Broad redesign of non-endpoint drag behavior

## Acceptance Criteria

### Tests That Must Pass

1. Drag handler computes correct angle from zone center to cursor position
2. Angle normalization: cursor positions in all four quadrants produce angles in [0, 360)
3. Edge snap: handle position matches `center + getEdgePointAtAngle(shape, dims, angle)` during drag
4. Preview: `previewEndpointAnchor` is called during drag move with computed angle
5. Commit: the final route state keeps a `kind: 'zone'` endpoint and records the computed `anchor` on pointer up
6. Escape hatch: dragging beyond `2 * max(w, h)` triggers explicit detach instead of zone-linked editing
7. Escape hatch detach creates the new free anchor at the current snapped endpoint position, including when the endpoint already had authored `anchor` metadata
8. Existing handle rendering behavior for authored anchors remains intact during and after the drag refactor
9. Existing suite: `pnpm -F @ludoforge/runner test`
10. Existing suite: `pnpm -F @ludoforge/runner typecheck`
11. Existing suite: `pnpm -F @ludoforge/runner lint`

### Invariants

1. Zone endpoint dragging preserves semantic zone linkage in the normal path.
2. The detach path preserves the currently resolved endpoint position instead of re-seeding from zone center.
3. Drag behavior for non-zone endpoints (anchors, control points) is unchanged.
4. No mutation during drag — all position updates go through store actions (F7).
5. Cleanup function removes all event listeners (no memory leaks).

## Test Plan

### New/Modified Tests

1. `packages/runner/test/map-editor/map-editor-drag.test.ts` — test angle computation, edge snap, preview/commit flow, and explicit detach preserving the snapped endpoint position
2. `packages/runner/test/map-editor/map-editor-store.test.ts` — cover the updated position-aware detach contract so detached anchors do not jump back to zone center
3. `packages/runner/test/map-editor/map-editor-handle-renderer.test.ts` — keep existing anchored-handle coverage green to prove the drag refactor does not regress the already-delivered rendering contract

### Commands

1. `pnpm -F @ludoforge/runner exec vitest run test/map-editor/map-editor-drag.test.ts`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`
4. `pnpm -F @ludoforge/runner lint`
