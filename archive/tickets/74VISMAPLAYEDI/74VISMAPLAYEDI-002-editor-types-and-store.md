# 74VISMAPLAYEDI-002: Editor Types and Zustand Store

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: archive/tickets/74VISMAPLAYEDI/74VISMAPLAYEDI-001-session-state-machine.md

## Problem

The map editor needs a dedicated Zustand store for editable document state, selection state, and undo/redo history. That store must stay aligned with the existing runner contracts for route definitions and layout hints instead of introducing parallel route data models that later tickets would need to translate back out.

## Assumption Reassessment (2026-03-21)

1. `mapEditor` session wiring is already implemented in `packages/runner/src/session/session-types.ts`, `packages/runner/src/session/session-store.ts`, and `packages/runner/src/App.tsx`. This ticket must not re-scope that work.
2. Existing runner stores do not use a single universal Zustand pattern: `game-store.ts` uses `subscribeWithSelector`, while `session-store.ts` and `replay-store.ts` use plain `create<T>()((set, get) => ...)`. The editor store should choose the lightest pattern that serves its subscriptions cleanly.
3. `Position` already exists at `packages/runner/src/spatial/position-types.ts` and should be reused directly.
4. Connection route contracts already exist in `packages/runner/src/config/visual-config-types.ts` as `ConnectionEndpoint`, `ConnectionRouteDefinition`, and `ConnectionRouteSegment`. The editor store should preserve those contracts rather than inventing editor-only route aliases.
5. `VisualConfigProvider` already exposes cloned `connectionAnchors`, `connectionRoutes`, and `layout.hints`, and `layout.hints.fixed` already exists in schema/validation. Runtime consumption of fixed hints remains ticket `74VISMAPLAYEDI-010`.
6. The route map is keyed by the connection zone id, as shown in `VisualConfigProvider.getConnectionRoutes()` and `connection-route-resolver.ts`. The editor store should keep that key contract.
7. Drag-oriented tickets (`74VISMAPLAYEDI-004`, `74VISMAPLAYEDI-007`) require live preview without creating one undo entry per pointermove frame. A store API that pushes history on every `move*` call would be the wrong architecture.

## Architecture Check

1. The store should own only editor state: immutable source data, editable document state, UI selection/flags, and history. Rendering and interaction modules should stay outside the store.
2. The editable route shape should remain `ConnectionRouteDefinition`. Translating into a second route type here would add avoidable duplication and create export/render drift risk.
3. Undo/redo needs transaction semantics:
   - one-shot edits such as waypoint insertion can push history immediately
   - drag previews need `beginInteraction` / preview updates / `commitInteraction`
   - one user gesture must produce one undo entry
4. This keeps the architecture extensible for future editor tools without adding compatibility shims or duplicate route schemas (Foundations 7, 9, 10).

## Scope Correction

1. This ticket should create the editor type definitions and the editor store only.
2. It should not modify session routing, `App.tsx`, or `GameSelectionScreen`; those concerns are already covered elsewhere.
3. It should not implement layout-engine support for `layout.hints.fixed`; that remains ticket `74VISMAPLAYEDI-010`.
4. It should add runner tests using existing Vitest conventions, including `expectTypeOf` where type-level coverage is useful.

## What to Change

### 1. Create editor type definitions

New file `packages/runner/src/map-editor/map-editor-types.ts`:
- Re-export `Position` from spatial types
- Re-export the existing route contract types needed by the editor from `visual-config-types.ts`
- Define `MapEditorDocumentState`:
  - `zonePositions: ReadonlyMap<string, Position>`
  - `connectionAnchors: ReadonlyMap<string, Position>`
  - `connectionRoutes: ReadonlyMap<string, ConnectionRouteDefinition>`
- Define `EditorSnapshot` as the immutable history payload for document state only

### 2. Create Zustand store

New file `packages/runner/src/map-editor/map-editor-store.ts`:

**State shape**:
- `gameDef: GameDef`
- `originalVisualConfig: VisualConfig`
- `zonePositions: ReadonlyMap<string, Position>`
- `connectionAnchors: ReadonlyMap<string, Position>`
- `connectionRoutes: ReadonlyMap<string, ConnectionRouteDefinition>`
- `selectedZoneId: string | null`
- `selectedRouteId: string | null`
- `isDragging: boolean`
- `showGrid: boolean`
- `snapToGrid: boolean`
- `gridSize: number`
- `undoStack: readonly EditorSnapshot[]`
- `redoStack: readonly EditorSnapshot[]`
- `dirty: boolean`

**Core actions**:
- `moveZone(zoneId, position)` — one-shot committed zone edit
- `moveAnchor(anchorId, position)` — one-shot committed anchor edit
- `moveControlPoint(routeId, segmentIndex, position)` — one-shot committed control-point edit for position-backed quadratic segments
- `insertWaypoint(routeId, segmentIndex, position)` — split segment at position
- `removeWaypoint(routeId, pointIndex)` — remove non-endpoint waypoint and merge surrounding segments
- `convertSegment(routeId, segmentIndex, kind)` — toggle straight/quadratic
- `selectZone(id | null)`
- `selectRoute(id | null)`
- `setDragging(v)`
- `toggleGrid()`
- `setGridSize(n)`
- `setSnapToGrid(v)`
- `undo()`
- `redo()`

**Interaction transaction actions**:
- `beginInteraction()` — capture a pre-edit snapshot for drag/preview workflows
- `previewZoneMove(zoneId, position)` — live update without pushing history
- `previewAnchorMove(anchorId, position)` — live update without pushing history
- `previewControlPointMove(routeId, segmentIndex, position)` — live update without pushing history
- `commitInteraction()` — if document state changed, push the captured snapshot once, clear redo, set `dirty = true`
- `cancelInteraction()` — restore the captured snapshot and discard the in-progress interaction

**Undo/redo rules**:
- One-shot document edits push the current snapshot to `undoStack`, clear `redoStack`, set `dirty = true`
- Interaction previews do not touch history until `commitInteraction()`
- Stack capped at 50 entries
- Snapshots capture only document state, never UI state

### 3. Create store initializer

Factory function `createMapEditorStore(gameDef, visualConfig, initialPositions)` that:
- initializes `zonePositions` from layout results
- initializes `connectionAnchors` from `visualConfig.zones.connectionAnchors`
- initializes `connectionRoutes` from `visualConfig.zones.connectionRoutes`
- returns the Zustand store instance

## Files to Touch

- `packages/runner/src/map-editor/map-editor-types.ts` (new)
- `packages/runner/src/map-editor/map-editor-store.ts` (new)

## Out of Scope

- Session state machine or entry point UI
- Canvas rendering
- Drag wiring modules
- YAML export
- Layout-engine fixed-hint consumption
- Any engine changes

## Acceptance Criteria

### Tests That Must Pass

1. Store initialization copies initial zone positions, anchors, and routes without mutating source inputs.
2. `moveZone('saigon:none', { x: 100, y: 200 })` updates `zonePositions`, sets `dirty = true`, and pushes the previous document snapshot to `undoStack`.
3. `undo()` restores the previous document state and `redo()` reapplies it.
4. A new committed edit clears `redoStack`.
5. Undo stack is capped at 50 entries.
6. `beginInteraction()` + repeated `previewZoneMove()` + `commitInteraction()` produces exactly one undo entry with the pre-drag state.
7. `cancelInteraction()` restores the captured pre-interaction document state and creates no undo entry.
8. `insertWaypoint(routeId, segIdx, pos)` inserts an anchor waypoint and splits the route into two segments.
9. `removeWaypoint(routeId, pointIdx)` removes a non-endpoint anchor waypoint and merges surrounding segments.
10. `convertSegment(routeId, segIdx, 'quadratic')` adds a midpoint position control for a straight segment; converting back to `'straight'` removes it.
11. Immutability: prior map/route instances remain unchanged after committed edits.
12. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. All state transitions are immutable.
2. The store preserves the existing runner route contract (`ConnectionRouteDefinition`) rather than translating to editor-only route shapes.
3. `gameDef` and `originalVisualConfig` are never mutated after initialization.
4. History entries capture document state only.
5. One user interaction can map to one undo entry.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/map-editor/map-editor-store.test.ts` — initialization, undo/redo, interaction transactions, waypoint ops, segment conversion, immutability
2. `packages/runner/test/map-editor/map-editor-types.test.ts` — type contracts via `expectTypeOf`

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completed: 2026-03-21
- Actually changed:
  - Added `packages/runner/src/map-editor/map-editor-types.ts` with editor document/history types that reuse the shared `ConnectionRouteDefinition` contract instead of introducing editor-only route aliases.
  - Added `packages/runner/src/map-editor/map-editor-store.ts` with immutable document state, undo/redo, grid/selection flags, and transaction-style preview/commit APIs for drag workflows.
  - Added runner tests for store behavior and type contracts in `packages/runner/test/map-editor/`.
- Deviations from original plan:
  - The ticket was corrected before implementation because `mapEditor` session wiring already existed and because drag-heavy editing needed transaction semantics rather than “push history on every move”.
  - The store preserves the existing route-definition schema directly; the original proposal’s separate editable route type was dropped because it would have duplicated the renderer/export contract without adding value.
  - Control-point editing supports both position-backed and anchor-backed quadratic controls, matching the current visual-config schema.
- Verification results:
  - `pnpm -F @ludoforge/runner test -- map-editor`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner lint`
