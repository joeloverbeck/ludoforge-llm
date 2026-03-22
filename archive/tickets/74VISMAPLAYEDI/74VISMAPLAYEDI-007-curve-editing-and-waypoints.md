# 74VISMAPLAYEDI-007: Bezier Control Point Editing and Waypoint Operations

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None - runner-only
**Deps**: 74VISMAPLAYEDI-002, 74VISMAPLAYEDI-006

## Problem

Users need to reshape connection route curves by dragging Bezier control points, dragging anchor endpoints, and inserting/removing waypoints. This is the core curve editing functionality of the map editor.

## Assumption Reassessment (2026-03-22)

1. `packages/runner/src/map-editor/map-editor-store.ts` already implements `moveAnchor`, `moveControlPoint`, `insertWaypoint`, `removeWaypoint`, and `convertSegment`, plus preview/commit/cancel interaction grouping for single-entry undo behavior. The ticket must not restate these as missing store work.
2. `packages/runner/src/map-editor/map-editor-route-geometry.ts` already owns route resolution for the editor. New nearest-point and segment-targeting math belongs there or in a tightly related helper, not in a parallel module unless the existing geometry module becomes incoherent.
3. `packages/runner/src/map-editor/map-editor-drag.ts` currently supports zone dragging only. Anchor/control-point dragging is the real missing behavior.
4. `packages/runner/src/map-editor/map-editor-handle-renderer.ts` currently renders passive visuals only. It does not yet expose interactive handles for dragging or waypoint removal.
5. `packages/runner/src/map-editor/map-editor-route-renderer.ts` currently supports route selection only. It does not yet expose double-click waypoint insertion, right-click segment conversion, or segment-targeting behavior.
6. Relevant coverage already exists in `packages/runner/test/map-editor/map-editor-store.test.ts` for document-state mutations. Missing coverage is at the interaction layer and for nearest-point/segment-targeting helpers.

## Architecture Check

1. Preserve the existing split of responsibilities:
   - store owns immutable document mutation and undo/redo
   - route geometry owns pure route math
   - renderers own Pixi interaction wiring
2. Do not duplicate store logic inside renderers or drag helpers. Interactions should delegate to the existing preview/commit/store actions.
3. Favor one generic drag primitive for zone, anchor, and control-point handles rather than separate bespoke drag implementations.
4. All segment targeting and nearest-point math must remain pure and independently testable (Foundations 10 and 11).

## What to Change

### 1. Generalize drag support for editor handles

Modify `packages/runner/src/map-editor/map-editor-drag.ts`:

- Extract the shared drag lifecycle currently used by zone dragging.
- Add anchor drag support that previews through `previewAnchorMove(...)`.
- Add control-point drag support that previews through `previewControlPointMove(...)`.
- Commit through the store's existing `commitInteraction()` path so one completed drag yields one undo entry.
- Keep grid snapping behavior consistent with zone dragging.

### 2. Wire interactive handles

Modify `packages/runner/src/map-editor/map-editor-handle-renderer.ts`:

- Anchor endpoint handles: `eventMode = 'static'`, `cursor = 'grab'`, wire drag listeners.
- Control point handles: `eventMode = 'static'`, `cursor = 'grab'`, wire drag listeners.
- Zone endpoint handles remain non-interactive because their position is derived from the zone itself.
- Non-endpoint anchor handles should handle right-click removal directly because that operation is point-targeted, not segment-targeted.

### 3. Implement route-segment operations at the route renderer layer

Modify `packages/runner/src/map-editor/map-editor-route-renderer.ts` and supporting pure geometry helpers:

- Double-click on a route segment inserts a waypoint using the nearest point on the targeted segment.
- Right-click on a route segment converts that specific segment between `straight` and `quadratic`.
- Route interaction must target the actual clicked segment rather than guessing from the whole route.

### 4. Add pure segment-targeting helpers

Modify `packages/runner/src/map-editor/map-editor-route-geometry.ts` or add a tightly scoped adjacent helper module only if it keeps the geometry API clearer:

- `nearestPointOnStraight(p0, p1, target): { position: Position; t: number }`
- `nearestPointOnQuadratic(p0, cp, p2, target, samples = 50): { position: Position; t: number }`
- `findNearestRouteSegment(geometry, target): { segmentIndex: number; position: Position; t: number; distance: number } | null`

These helpers must stay pure and reusable by the renderer and tests.

## Files to Touch

- `packages/runner/src/map-editor/map-editor-drag.ts`
- `packages/runner/src/map-editor/map-editor-handle-renderer.ts`
- `packages/runner/src/map-editor/map-editor-route-renderer.ts`
- `packages/runner/src/map-editor/map-editor-route-geometry.ts`

## Out of Scope

- Zone dragging (already implemented)
- Base route rendering (already implemented)
- Keyboard shortcuts for undo/redo (`74VISMAPLAYEDI-008`)
- YAML export (`74VISMAPLAYEDI-009`)
- Grid overlay UX work (`74VISMAPLAYEDI-011`)
- Any game-specific map behavior

## Acceptance Criteria

### Tests That Must Pass

1. `nearestPointOnStraight({x:0,y:0}, {x:10,y:0}, {x:5,y:3})` returns position near `{x:5, y:0}` with `t ~= 0.5`.
2. `nearestPointOnStraight` clamps to the nearest endpoint when the target is beyond the segment.
3. `nearestPointOnQuadratic` returns a point on or very near the rendered curve and reports a stable `t`.
4. Segment-targeting logic resolves the nearest clicked segment on multi-segment routes.
5. Anchor drag lifecycle: pointerdown -> move -> pointerup results in exactly one undo entry with the correct final anchor position.
6. Control point drag lifecycle: same undo behavior, including anchor-backed quadratic controls.
7. Double-click on a route segment inserts a waypoint at a point on or near that segment.
8. Right-click on a non-endpoint anchor handle removes the waypoint.
9. Right-click on an endpoint anchor handle does not remove anything.
10. Right-click on a route segment converts straight <-> quadratic for the targeted segment.
11. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. No game-specific logic is introduced; all behavior remains generic editor infrastructure.
2. Pure curve/segment math stays isolated from Pixi/store access (Foundation 11).
3. Each completed user action (drag, insert, remove, convert) produces exactly one undo entry (Foundation 7).
4. The implementation must build on the existing immutable document model instead of bypassing it with renderer-local state.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/map-editor/map-editor-route-geometry.test.ts` - nearest-point and segment-targeting helpers, including degenerate and multi-segment cases
2. `packages/runner/test/map-editor/map-editor-drag.test.ts` - anchor drag and control-point drag lifecycle coverage
3. `packages/runner/test/map-editor/map-editor-handle-renderer.test.ts` - interactive handles, removal guards, and drag wiring
4. `packages/runner/test/map-editor/map-editor-route-renderer.test.ts` - double-click insertion and right-click conversion behavior

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completed: 2026-03-22
- Actual changes:
  - corrected the ticket assumptions before implementation so the scope matched the real codebase
  - generalized `map-editor-drag.ts` into a shared drag primitive used for zones, anchor handles, and control-point handles
  - kept document mutations in the existing store and added pure nearest-point / nearest-segment helpers in `map-editor-route-geometry.ts`
  - wired interactive anchor/control handles in `map-editor-handle-renderer.ts`
  - wired route double-click waypoint insertion and right-click straight/quadratic conversion in `map-editor-route-renderer.ts`
  - strengthened map-editor interaction and geometry tests rather than adding a separate redundant curve-math module
- Deviations from original plan:
  - no new `map-editor-curve-math.ts` file was added because `map-editor-route-geometry.ts` was already the correct architectural home for pure route math
  - waypoint insert/remove and segment conversion store actions were not implemented because they already existed and were already covered by store tests
  - route conversion used direct route-segment interaction instead of a separate context-menu framework
- Verification:
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner lint`
