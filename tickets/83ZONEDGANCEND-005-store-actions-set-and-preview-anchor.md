# 83ZONEDGANCEND-005: Store Actions — setEndpointAnchor and previewEndpointAnchor

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: 83ZONEDGANCEND-001 (schema — `anchor` field must exist on type)

## Problem

The map editor store has no actions to set or preview an anchor angle on a zone endpoint. The drag UX (ticket 006) needs these actions to update the data model during and after drag interactions.

## Assumption Reassessment (2026-03-26)

1. `MapEditorStoreActions` is in `packages/runner/src/map-editor/map-editor-store.ts` (lines 32-55).
2. Existing pattern: `previewZoneMove` / `previewAnchorMove` / `previewControlPointMove` for live preview, committed actions for final state.
3. Preview actions mutate state within a `beginInteraction`/`commitInteraction` pair — no undo entry until commit.
4. `cloneRouteDefinition` in the store (lines 401-419) already handles zone/anchor endpoint cloning.
5. Immutable update pattern: clone maps with `new Map()`, spread objects, return new state.

## Architecture Check

1. Follows existing store action patterns exactly — no new patterns introduced.
2. `setEndpointAnchor` is a committed action (creates undo entry). `previewEndpointAnchor` is a preview-only mutation within an interaction.
3. Both actions validate that the target endpoint is `kind: 'zone'` before modifying — no-op for anchor endpoints.
4. Immutable updates throughout (F7).

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

### 3. Implement `previewEndpointAnchor`

Same logic as `setEndpointAnchor` but used within an active interaction (between `beginInteraction` and `commitInteraction`) — does not push to undo stack.

## Files to Touch

- `packages/runner/src/map-editor/map-editor-store.ts` (modify)

## Out of Scope

- Schema changes — ticket 001
- Edge position math — ticket 002
- Presentation resolver — ticket 003
- Editor route geometry — ticket 004
- Drag UX implementation — ticket 006
- FITL visual config — ticket 007
- Undo/redo system changes (existing system handles this)
- `convertEndpointToAnchor` modifications

## Acceptance Criteria

### Tests That Must Pass

1. `setEndpointAnchor(routeId, 0, 90)` on a route with zone endpoint at index 0: sets `anchor: 90` on that endpoint
2. `setEndpointAnchor` on an anchor endpoint (not zone): no-op, state unchanged
3. `setEndpointAnchor` with out-of-bounds pointIndex: no-op, state unchanged
4. `setEndpointAnchor` with non-existent routeId: no-op, state unchanged
5. `setEndpointAnchor` creates undo entry (state is undoable)
6. `previewEndpointAnchor` updates endpoint anchor during interaction without creating undo entry
7. After `beginInteraction` → `previewEndpointAnchor` → `commitInteraction`: undo reverts the anchor change
8. After `beginInteraction` → `previewEndpointAnchor` → `cancelInteraction`: anchor is reverted to pre-interaction value
9. Existing suite: `pnpm -F @ludoforge/runner test`
10. Existing suite: `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. Immutable state updates — no mutation of existing state objects (F7).
2. Undo/redo stack integrity maintained — `setEndpointAnchor` pushes snapshot, `previewEndpointAnchor` does not.
3. Only zone endpoints are modified — anchor endpoints are ignored.
4. `dirty` flag is set when anchor is changed.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/map-editor/map-editor-store.test.ts` — add test group for `setEndpointAnchor` and `previewEndpointAnchor` covering all acceptance criteria

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/map-editor/map-editor-store.test.ts`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`
