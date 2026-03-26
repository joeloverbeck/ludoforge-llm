# 83ZONEDGANCEND-005: Store Actions — setEndpointAnchor and previewEndpointAnchor

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: `archive/tickets/83ZONEDGANCEND-001-schema-extension-and-export-serialization.md`

## Problem

The map editor store has no canonical actions to set or preview a zone endpoint `anchor` angle while preserving the endpoint as `kind: 'zone'`. The drag UX still defaults to `convertEndpointToAnchor()`, which detaches the endpoint into a free anchor and breaks the semantic zone link. Ticket 006 needs store-level actions that edit the authored endpoint directly instead of using conversion as the default editing path.

## Assumption Reassessment (2026-03-26)

1. `MapEditorStoreActions` lives in `packages/runner/src/map-editor/map-editor-store.ts`, and it already exposes the preview/interaction pattern used by other editor drags.
2. Existing preview actions (`previewZoneMove`, `previewAnchorMove`, `previewControlPointMove`) automatically establish an interaction snapshot and do not create undo history until `commitInteraction()`.
3. Store/document cloning already preserves optional zone endpoint `anchor` metadata. This is already covered in `packages/runner/test/map-editor/map-editor-store.test.ts`.
4. Export serialization already preserves optional zone endpoint `anchor` metadata. That is already covered in `packages/runner/test/map-editor/map-editor-export.test.ts`.
5. Editor route geometry and handle rendering already resolve anchored zone endpoints to the zone edge. This is already covered in `packages/runner/test/map-editor/map-editor-route-geometry.test.ts`, `packages/runner/test/map-editor/map-editor-route-renderer.test.ts`, and `packages/runner/test/map-editor/map-editor-handle-renderer.test.ts`.
6. The real remaining gap for this ticket is the store editing contract: the store can preserve authored anchors, but it still lacks dedicated actions for changing them in place.

## Architecture Check

1. This change should stay store-local. The store is the right seam for route document edits because it already owns immutable updates, undo/redo snapshots, dirty tracking, and preview grouping.
2. `setEndpointAnchor` should be the committed edit path. `previewEndpointAnchor` should mirror the existing preview action contract and feed `beginInteraction()` / `commitInteraction()` flows.
3. Both actions must operate only on `kind: 'zone'` endpoints. Editing anchor endpoints here would collapse two separate concepts and weaken the route model.
4. These actions are architecturally preferable to using `convertEndpointToAnchor()` as the normal editing path because they preserve semantic linkage, reduce route-shape churn, and keep authored data aligned with Spec 83.
5. No aliasing or compatibility layer is needed. Ticket 006 should switch to these actions directly once they exist.

## What to Change

### 1. Extend `MapEditorStoreActions` interface

Add two new actions:

```typescript
setEndpointAnchor(routeId: string, pointIndex: number, anchor: number): void;
previewEndpointAnchor(routeId: string, pointIndex: number, anchor: number): void;
```

### 2. Implement `setEndpointAnchor`

Committed action that:
1. Gets the route from `connectionRoutes`
2. Validates `pointIndex` is in bounds and the endpoint is `kind: 'zone'`
3. Clones the route, sets `points[pointIndex] = { ...points[pointIndex], anchor }`
4. Updates the route in the map
5. Pushes undo snapshot
6. Is a no-op when the computed route would be unchanged

### 3. Implement `previewEndpointAnchor`

Same document update logic as `setEndpointAnchor`, but used within an active interaction and does not push to undo history until `commitInteraction()`.

### 4. Keep scope narrow

Do not reopen already-finished Spec 83 work in this ticket:
- no schema changes
- no export serialization changes
- no editor geometry changes
- no handle-positioning changes

This ticket exists to provide the missing store contract that later drag work should call.

## Files to Touch

- `packages/runner/src/map-editor/map-editor-store.ts` (modify)
- `packages/runner/test/map-editor/map-editor-store.test.ts` (modify)

## Out of Scope

- Schema changes — ticket 001
- Edge position math — ticket 002
- Presentation resolver — ticket 003
- Editor route geometry — ticket 004
- Drag UX implementation — ticket 006
- FITL visual config — ticket 007
- Undo/redo system changes (existing system handles this)
- Export serialization changes for endpoint `anchor` metadata
- Large-scale route model redesign beyond adding anchor-angle editing to existing zone endpoints

## Acceptance Criteria

### Tests That Must Pass

1. `setEndpointAnchor(routeId, 0, 90)` on a route with zone endpoint at index 0: sets `anchor: 90` on that endpoint
2. `setEndpointAnchor` on an anchor endpoint (not zone): no-op, state unchanged
3. `setEndpointAnchor` with out-of-bounds pointIndex: no-op, state unchanged
4. `setEndpointAnchor` with non-existent routeId: no-op, state unchanged
5. `setEndpointAnchor` with the same anchor value: no-op, state unchanged, no history entry
6. `setEndpointAnchor` creates undo entry when it changes the route
7. `previewEndpointAnchor` updates endpoint anchor during interaction without creating undo entry
8. After `beginInteraction` → `previewEndpointAnchor` → `commitInteraction`: undo reverts the anchor change
9. After `beginInteraction` → `previewEndpointAnchor` → `cancelInteraction`: anchor is reverted to pre-interaction value
10. Existing suite: `pnpm -F @ludoforge/runner test`
11. Existing suite: `pnpm -F @ludoforge/runner typecheck`
12. Existing suite: `pnpm -F @ludoforge/runner lint`

### Invariants

1. Immutable state updates — no mutation of existing state objects (F7).
2. Undo/redo stack integrity maintained — `setEndpointAnchor` pushes snapshot only when the route changes, `previewEndpointAnchor` does not.
3. Only zone endpoints are modified — anchor endpoints are ignored.
4. `dirty` flag is set when anchor is changed.
5. These actions become the canonical store editing path for zone endpoints with semantic zone linkage preserved.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/map-editor/map-editor-store.test.ts` — add coverage for committed and preview endpoint-anchor edits, no-op cases, undo/redo behavior, and cancel behavior

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/map-editor/map-editor-store.test.ts`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`
4. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completion date: 2026-03-26
- What actually changed:
  - Added `setEndpointAnchor` and `previewEndpointAnchor` to the map editor store.
  - Implemented store-level immutable updates for zone endpoint `anchor` editing with no-op handling for invalid targets and unchanged values.
  - Strengthened `map-editor-store` tests for committed edits, preview edits, undo/redo, and cancel behavior.
- Deviations from original plan:
  - No export or geometry changes were needed. Those assumptions were stale; the codebase already preserved endpoint `anchor` metadata and already rendered anchored zone endpoints on the zone edge.
  - The ticket was narrowed to the actual missing store contract needed by ticket 006.
- Verification results:
  - `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/map-editor/map-editor-store.test.ts` completed successfully, but Vitest executed the full runner suite under the package script.
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
