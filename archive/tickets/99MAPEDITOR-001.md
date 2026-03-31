# 99MAPEDITOR-001: Vertex handles desync from province during drag

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

When a province polygon is selected and then dragged to a new position, the yellow vertex handles and blue midpoint handles remain at their original world positions instead of moving with the polygon. The user sees the handles left behind while the polygon moves away.

## Assumption Reassessment (2026-03-31)

1. **vertex-handle-renderer.ts subscription** — Verified: lines 112-118 subscribe to `selectedZoneId` and `zoneVertices` only. `zonePositions` is not watched.
2. **Province drag updates zonePositions** — Verified: `previewZoneMove` at map-editor-store.ts calls `moveZoneInDocument` which updates `zonePositions` map.
3. **Vertices are stored as relative coordinates** — Verified: vertices are relative to zone position (vertex-handle-renderer.ts:66 adds `zonePos` to vertex coordinates for world position).
4. **No mismatch**: Root cause confirmed — subscription misses `zonePositions` changes.

## Architecture Check

1. Adding one condition to an existing subscription is the minimal correct fix. No new abstractions or data flows needed.
2. No game-specific logic. This is purely presentation-layer state synchronization.
3. No backwards-compatibility shims.

## What to Change

### 1. Add `zonePositions` to vertex handle subscription

In `packages/runner/src/map-editor/vertex-handle-renderer.ts`, add `state.zonePositions !== prevState.zonePositions` to the subscription condition at lines 112-118. This ensures `rebuild()` fires when the selected province moves, recalculating all handle positions.

## Files to Touch

- `packages/runner/src/map-editor/vertex-handle-renderer.ts` (modify)

## Out of Scope

- Optimizing rebuild to update positions without destroying/recreating handles (future perf ticket if needed)
- Label repositioning after vertex changes (covered by 99MAPEDITOR-002)

## Acceptance Criteria

### Tests That Must Pass

1. Selecting a province shows vertex handles at correct world positions
2. Dragging a selected province keeps vertex handles aligned with polygon vertices
3. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Vertex handles always render at `vertex[i] + zonePosition` in world space
2. Handles rebuild whenever the selected zone's position or vertices change

## Test Plan

### New/Modified Tests

1. No new tests needed — this is a one-line subscription fix. Existing renderer tests verify handle creation. Manual visual verification confirms the drag behavior.

### Commands

1. `pnpm -F @ludoforge/runner typecheck`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner lint`

## Outcome

- **Completion date**: 2026-03-31
- **What changed**: Added `state.zonePositions !== prevState.zonePositions` to the store subscription in `packages/runner/src/map-editor/vertex-handle-renderer.ts` (line 116). This triggers `rebuild()` when the selected province's position changes during drag, keeping vertex/midpoint handles aligned.
- **Deviations**: None.
- **Verification**: typecheck, 2093 tests, lint — all pass.
