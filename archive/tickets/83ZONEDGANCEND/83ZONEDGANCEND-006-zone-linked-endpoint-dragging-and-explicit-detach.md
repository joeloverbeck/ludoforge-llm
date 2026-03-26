# 83ZONEDGANCEND-006: Zone-Linked Endpoint Dragging and Explicit Detach

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: `archive/tickets/83ZONEDGANCEND-002-edge-position-math-utilities.md`, `archive/tickets/83ZONEDGANCEND/83ZONEDGANCEND-004-editor-route-geometry-update.md`, `archive/tickets/83ZONEDGANCEND/83ZONEDGANCEND-005-store-actions-set-and-preview-anchor.md`

## Problem

When the user drags a zone endpoint in the map editor, the current behavior calls `convertEndpointToAnchor()` on first movement and permanently breaks the semantic link between the endpoint and the zone. That is now the main remaining gap for Spec 83. Zone-edge geometry resolution and anchored-handle rendering already exist; what remains is to make zone-linked dragging the default interaction and reserve detaching to a deliberate secondary path.

## Assumption Reassessment (2026-03-26)

1. `attachZoneEndpointConvertDragHandlers` is still present in `packages/runner/src/map-editor/map-editor-drag.ts` and is still wired from `map-editor-handle-renderer.ts`.
2. On first pointer move, it calls `state.convertEndpointToAnchor(routeId, pointIndex)` and then switches the interaction to free-anchor dragging.
3. Shared editor route geometry already resolves authored zone anchors through `resolveEndpointPosition()` in `packages/runner/src/map-editor/map-editor-route-geometry.ts`, and handle rendering already consumes that geometry. The original “handle rendering” part of this ticket is already delivered and should not be reworked here.
4. Existing store actions `previewEndpointAnchor` and `setEndpointAnchor` already provide the correct immutable editing contract for zone-linked dragging.
5. `convertEndpointToAnchor()` in `packages/runner/src/map-editor/map-editor-store.ts` still seeds the new free anchor from `zonePositions.get(zoneId)` rather than from the resolved endpoint position. That is inconsistent with anchored endpoint geometry once `anchor` metadata exists.
6. The only live caller of `convertEndpointToAnchor()` is the zone-endpoint drag path, so this ticket can tighten that detach contract without broad compatibility concerns.
7. The drag handler boundary still needs explicit zone center plus zone visual shape/dimensions so drag-time snapping uses the same geometry contract as rendering.

## Architecture Check

1. Replacing conversion-on-drag with edge-snapping is strictly better than the current architecture because it makes the primary editor interaction align with the persisted data model: zone endpoints stay zone endpoints.
2. The primary interaction path must be zone-linked endpoint editing, not conversion to free anchors. Detach remains useful as an explicit escape hatch for cases where a route truly should stop following the zone.
3. The clean architectural seam is already present: `beginInteraction` / `previewEndpointAnchor` / `commitInteraction` for linked editing, with route geometry providing the single shared endpoint-position contract.
4. Drag-time snapping must use the same zone shape/dimension contract as route geometry so editing and rendering cannot drift.
5. The detach path must accept a resolved position argument rather than re-deriving from zone center. That removes a now-invalid hidden assumption from store state and keeps one source of truth for endpoint geometry.
6. No compatibility aliasing: if `convertEndpointToAnchor()` changes shape, all callers and tests should move in the same change (F9).

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

The code that attaches drag handlers to zone endpoint handles in `map-editor-handle-renderer.ts` must call the new function with the additional zone data parameters. No handle-rendering redesign is required beyond this wiring change.

### 3. Tighten the detach store contract used by the escape hatch

Because drag is the only live caller of `convertEndpointToAnchor()`, this ticket should update that store contract in the same change so the detach path stays aligned with shared route geometry.

Preferred direction:
- replace the center-seeded conversion API with a position-aware version that accepts the resolved detach position
- rename the action if needed to reflect the explicit-detach semantics more clearly
- update all callers and tests in the same change
- do not introduce an alias or fallback signature (F9)

## Files to Touch

- `packages/runner/src/map-editor/map-editor-drag.ts` (modify — replace handler)
- `packages/runner/src/map-editor/map-editor-handle-renderer.ts` (modify — pass zone data into the drag handler)
- `packages/runner/src/map-editor/map-editor-store.ts` (modify — detach path must accept/use resolved endpoint position)
- `packages/runner/test/map-editor/map-editor-store.test.ts` (modify — cover position-aware detach semantics)
- `packages/runner/test/map-editor/map-editor-drag.test.ts` (modify — cover linked drag behavior and explicit detach)
- `packages/runner/test/map-editor/map-editor-handle-renderer.test.ts` (modify if needed — only for drag handler wiring, not for re-testing delivered geometry behavior)

## Out of Scope

- Schema changes — ticket 001
- Edge position math implementation — ticket 002
- Presentation resolver — ticket 003
- Editor route geometry — ticket 004
- Broad store work beyond the detach-path contract already required by this ticket
- FITL visual config — ticket 007
- `attachZoneDragHandlers`, `attachAnchorDragHandlers`, `attachControlPointDragHandlers` — unchanged
- Broad redesign of non-endpoint drag behavior
- Re-implementing route geometry or anchored handle rendering already covered by earlier Spec 83 work

## Acceptance Criteria

### Tests That Must Pass

1. Drag handler computes correct angle from zone center to cursor position.
2. Angle normalization keeps values in `[0, 360)` across all quadrants.
3. Edge snap uses `getEdgePointAtAngle(shape, dims, angle)` and moves the handle to `center + offset` during linked drag.
4. Linked drag calls `previewEndpointAnchor` during pointer move and commits via `setEndpointAnchor` on pointer up.
5. The committed normal-path route state keeps a `kind: 'zone'` endpoint and records the computed `anchor`.
6. Explicit detach remains secondary and requires the configured distance threshold to be exceeded.
7. Explicit detach creates the new free anchor at the current resolved endpoint position, including when the endpoint already had authored `anchor` metadata.
8. Existing route geometry / handle-rendering coverage stays green after the drag refactor.
9. Existing suite: `pnpm -F @ludoforge/runner exec vitest run test/map-editor/map-editor-drag.test.ts test/map-editor/map-editor-store.test.ts test/map-editor/map-editor-handle-renderer.test.ts`
10. Existing suite: `pnpm -F @ludoforge/runner test`
11. Existing suite: `pnpm -F @ludoforge/runner typecheck`
12. Existing suite: `pnpm -F @ludoforge/runner lint`

### Invariants

1. Zone endpoint dragging preserves semantic zone linkage in the normal path.
2. The detach path preserves the currently resolved endpoint position instead of re-seeding from zone center.
3. Drag behavior for non-zone endpoints (anchors, control points) is unchanged.
4. Drag-time endpoint geometry matches render-time endpoint geometry.
5. No mutation during drag outside the existing store interaction model (F7).
6. Cleanup function removes all event listeners and cancels active preview state correctly.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/map-editor/map-editor-drag.test.ts` — cover linked endpoint drag, angle normalization, edge snapping, commit behavior, and explicit detach preserving resolved position.
2. `packages/runner/test/map-editor/map-editor-store.test.ts` — cover the updated position-aware detach contract so detached anchors do not jump back to zone center.
3. `packages/runner/test/map-editor/map-editor-handle-renderer.test.ts` — keep existing geometry-backed handle coverage green and add wiring assertions only if the refactor changes its contract.

### Commands

1. `pnpm -F @ludoforge/runner exec vitest run test/map-editor/map-editor-drag.test.ts`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`
4. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completion date: 2026-03-26
- What actually changed:
  - replaced conversion-on-drag with zone-linked endpoint dragging that previews and commits `anchor` angles on zone endpoints
  - introduced explicit detach semantics that seed free anchors from the resolved snapped endpoint position
  - renamed the store detach action to reflect its explicit purpose and updated caller/test coverage in the same change
- Deviations from original plan:
  - did not rework handle rendering or route geometry because those parts were already delivered before this ticket; the ticket was corrected first to reflect that reduced scope
  - handle-renderer changes were limited to passing zone center and visual dimensions into the new drag handler
- Verification results:
  - `pnpm -F @ludoforge/runner exec vitest run test/map-editor/map-editor-drag.test.ts test/map-editor/map-editor-store.test.ts test/map-editor/map-editor-handle-renderer.test.ts`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner lint`
