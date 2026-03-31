# 99MAPEDITOR-003: Vertex handle drag blocked by viewport pan

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

When attempting to drag a yellow vertex handle to reshape a province polygon, the map viewport pans instead. The cursor correctly shows "grab" on hover, but the drag gesture is captured by pixi-viewport's `.drag()` plugin before the vertex handle can process it.

## Assumption Reassessment (2026-03-31)

1. **Vertex handle pointerdown lacks stopPropagation** — Verified: `vertex-handle-renderer.ts:172` handler does NOT call `event.stopPropagation()`.
2. **Zone drag handlers correctly stop propagation** — Verified: `map-editor-drag.ts:259` calls `event.stopPropagation?.()` in `attachPositionDragHandlers`. Zone edge anchor handlers also stop propagation at line 100.
3. **Viewport drag is enabled** — Verified: `viewport-setup.ts:54-55` calls `.drag()` on the viewport, which processes pointer events for panning.
4. **Midpoint handles have the same issue** — Verified: `vertex-handle-renderer.ts:102` midpoint `pointerdown` also lacks `stopPropagation`.
5. **No mismatch**: The fix is to add `stopPropagation` calls matching the established pattern.

## Architecture Check

1. Adding `event.stopPropagation?.()` follows the exact pattern used by all other draggable elements in the map editor (zone containers, edge anchors, control points). This is the canonical way to prevent viewport panning during element drags in pixi-viewport.
2. No game-specific logic. Purely input handling.
3. No backwards-compatibility shims.

## What to Change

### 1. Add stopPropagation to vertex handle pointerdown

In `packages/runner/src/map-editor/vertex-handle-renderer.ts`, line 172:
- Change the `pointerdown` handler parameter from `_event` to `event`
- Add `event.stopPropagation?.()` as the first line of the handler body

### 2. Add stopPropagation to midpoint handle pointerdown

In `packages/runner/src/map-editor/vertex-handle-renderer.ts`, line 102:
- Change the `pointerdown` handler parameter from `_event` to `event`
- Add `event.stopPropagation?.()` as the first line of the handler body

## Files to Touch

- `packages/runner/src/map-editor/vertex-handle-renderer.ts` (modify)

## Out of Scope

- Cursor feedback during drag (e.g., changing to "grabbing") — vertex handles already set `cursor: 'grab'`
- Drag snapping to grid for vertex handles
- Touch event handling

## Acceptance Criteria

### Tests That Must Pass

1. Dragging a yellow vertex handle moves the vertex, not the map
2. Clicking a blue midpoint handle adds a vertex without panning
3. Map still pans when dragging on empty space (viewport drag unaffected)
4. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. All interactive map-editor elements call `stopPropagation` in their pointerdown handler
2. Viewport panning only activates from pointer events that reach the viewport without being stopped

## Test Plan

### New/Modified Tests

1. No new tests needed — this is a two-line event handling fix. The existing interaction pattern is well-established. Manual visual verification confirms vertex handles become draggable.

### Commands

1. `pnpm -F @ludoforge/runner typecheck`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner lint`

## Outcome

- **Completion date**: 2026-03-31
- **What changed**: Added `event.stopPropagation?.()` to vertex handle `pointerdown` (line 173) and midpoint handle `pointerdown` (line 103) in `packages/runner/src/map-editor/vertex-handle-renderer.ts`. Also renamed `_event` parameters to `event` so they are used. This matches the established pattern in `map-editor-drag.ts:259`.
- **Deviations**: None.
- **Verification**: typecheck, 2093 tests, lint — all pass.
