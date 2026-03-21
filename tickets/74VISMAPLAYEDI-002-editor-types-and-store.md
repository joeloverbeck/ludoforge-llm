# 74VISMAPLAYEDI-002: Editor Types and Zustand Store

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: 74VISMAPLAYEDI-001

## Problem

The map editor needs a dedicated Zustand store to hold editable zone positions, connection routes, UI selection state, and an undo/redo snapshot stack. This store is the single source of truth for all editor state and must use immutable state transitions (Foundation 7).

## Assumption Reassessment (2026-03-21)

1. Existing Zustand stores use `create<T>()(subscribeWithSelector((set, get) => ({...})))` pattern. Confirmed in `game-store.ts`.
2. `Position` type `{ readonly x: number; readonly y: number }` exists in `packages/runner/src/spatial/position-types.ts`. Confirmed.
3. `ConnectionEndpoint`, `ConnectionRouteSegment`, and related types exist in `visual-config-types.ts`. Confirmed.
4. `ReadonlyMap` is used throughout the codebase for immutable map state. Confirmed.

## Architecture Check

1. Separate editor store follows the pattern established by `game-store.ts` — each major feature gets its own Zustand store.
2. Store is game-agnostic — operates on generic zone IDs, positions, and connection route structures (Foundation 1).
3. Undo/redo uses immutable snapshots (Foundation 7) — no mutation of history entries.

## What to Change

### 1. Create editor type definitions

New file `packages/runner/src/map-editor/map-editor-types.ts`:
- `EditableConnectionRoute`: `{ readonly points: readonly ConnectionEndpoint[]; readonly segments: readonly ConnectionSegment[] }`
- `ConnectionSegment`: discriminated union for `'straight'` and `'quadratic'` segments with optional inline control point position
- `EditorSnapshot`: `{ readonly zonePositions: ReadonlyMap<string, Position>; readonly connectionAnchors: ReadonlyMap<string, Position>; readonly connectionRoutes: ReadonlyMap<string, EditableConnectionRoute> }`
- Re-export `Position` from spatial types

### 2. Create Zustand store

New file `packages/runner/src/map-editor/map-editor-store.ts`:

**State shape** (all `readonly`):
- `gameDef: GameDef` — source data (immutable after load)
- `originalVisualConfig: VisualConfig` — source data (immutable after load)
- `zonePositions: ReadonlyMap<string, Position>`
- `connectionAnchors: ReadonlyMap<string, Position>`
- `connectionRoutes: ReadonlyMap<string, EditableConnectionRoute>`
- `selectedZoneId: string | null`
- `selectedRouteId: string | null`
- `isDragging: boolean`
- `showGrid: boolean`
- `snapToGrid: boolean`
- `gridSize: number` (default 20)
- `undoStack: readonly EditorSnapshot[]`
- `redoStack: readonly EditorSnapshot[]`
- `dirty: boolean`

**Actions**:
- `moveZone(zoneId, position)` — update zone position, push undo snapshot
- `moveAnchor(anchorId, position)` — update anchor position, push undo snapshot
- `moveControlPoint(routeId, segmentIndex, position)` — update Bézier control point
- `insertWaypoint(routeId, segmentIndex, position)` — split segment at position
- `removeWaypoint(routeId, pointIndex)` — merge adjacent segments
- `convertSegment(routeId, segmentIndex, kind)` — toggle straight/quadratic
- `selectZone(id | null)` — set selected zone
- `selectRoute(id | null)` — set selected route
- `undo()` — pop from undo stack, push current to redo
- `redo()` — pop from redo stack, push current to undo
- `toggleGrid()` — toggle grid overlay
- `setGridSize(n)` — set grid spacing
- `setDragging(v)` — set drag state

**Undo/redo rules**:
- Each mutating action pushes current snapshot to `undoStack`, clears `redoStack`, sets `dirty = true`
- Stack capped at 50 entries (oldest dropped)
- Standard undo/redo semantics

### 3. Create store initializer

Factory function `createMapEditorStore(gameDef, visualConfig, initialPositions)` that:
- Takes `GameDef`, parsed `VisualConfig`, and `ReadonlyMap<string, Position>` (from ForceAtlas2 layout)
- Initializes `zonePositions` from the layout result
- Initializes `connectionAnchors` from `visualConfig.zones.connectionAnchors`
- Initializes `connectionRoutes` from `visualConfig.zones.connectionRoutes`, converting to `EditableConnectionRoute` format
- Returns a Zustand store instance

## Files to Touch

- `packages/runner/src/map-editor/map-editor-types.ts` (new)
- `packages/runner/src/map-editor/map-editor-store.ts` (new)

## Out of Scope

- Canvas rendering (74VISMAPLAYEDI-003, 004)
- Drag interaction logic (74VISMAPLAYEDI-004, 007)
- YAML export (74VISMAPLAYEDI-009)
- Keyboard shortcuts (74VISMAPLAYEDI-008)
- MapEditorScreen component (74VISMAPLAYEDI-005)
- Any engine or visual-config-types changes

## Acceptance Criteria

### Tests That Must Pass

1. `moveZone('saigon:none', {x:100, y:200})` updates `zonePositions` map, sets `dirty = true`, pushes previous state to `undoStack`.
2. After `moveZone`, `undo()` restores previous position and pushes current to `redoStack`.
3. After `undo`, `redo()` restores the moved position.
4. After a new mutating action, `redoStack` is cleared.
5. Undo stack capped at 50 — after 51 mutations, oldest snapshot is dropped.
6. `insertWaypoint(routeId, segIdx, pos)` splits the specified segment into two straight segments with a new anchor point at `pos`.
7. `removeWaypoint(routeId, pointIdx)` merges adjacent segments into one.
8. `convertSegment(routeId, segIdx, 'quadratic')` adds a control point at the segment midpoint.
9. `convertSegment(routeId, segIdx, 'straight')` removes the control point.
10. Immutability: after `moveZone`, the previous `zonePositions` map instance is unchanged (referential check).
11. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. All state transitions produce new objects — no mutation (Foundation 7).
2. Store is game-agnostic — no game-specific logic (Foundation 1).
3. `originalVisualConfig` and `gameDef` are never modified after initialization.
4. `EditorSnapshot` captures only position/route data, not UI state (selection, grid, dragging).

## Test Plan

### New/Modified Tests

1. `packages/runner/test/map-editor/map-editor-store.test.ts` — store creation, zone/anchor/control moves, undo/redo cycle, stack cap, immutability, waypoint ops, segment conversion
2. `packages/runner/test/map-editor/map-editor-types.test.ts` — type import verification (compile-time check)

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`
