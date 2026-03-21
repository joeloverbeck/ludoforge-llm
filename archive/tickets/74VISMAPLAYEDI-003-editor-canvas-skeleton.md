# 74VISMAPLAYEDI-003: Editor Canvas Skeleton with Viewport and Layer Structure

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: 74VISMAPLAYEDI-002

## Problem

The map editor needs a PixiJS canvas with pan/zoom viewport and a 4-layer structure (background, routes, zones, handles). This canvas skeleton is the foundation for all editor rendering and interaction.

## Assumption Reassessment (2026-03-22)

1. `setupViewport(config)` in `viewport-setup.ts` currently returns `{ viewport, worldLayers[], updateWorldBounds(), centerOnBounds(), destroy() }`. Confirmed, but incomplete for this ticket because it does not expose a resize path that updates its internal screen-dimension-dependent overscroll calculations.
2. The runner already centralizes PixiJS application and shared layer creation in `packages/runner/src/canvas/create-app.ts` and `packages/runner/src/canvas/layers.ts`. The editor should reuse those modules instead of constructing a raw `Application` and ad hoc top-level layers.
3. `74VISMAPLAYEDI-002` is already implemented beyond the dependency minimum: `mapEditor` session state, session-store transitions, `App.tsx` placeholder rendering, and editor store/types already exist. This ticket must not re-scope those files.
4. `map-editor-store.ts` already provides the mutable document state the canvas needs, including grouped drag-preview semantics (`beginInteraction`, `preview*`, `commitInteraction`, `cancelInteraction`). The canvas should integrate with that store instead of inventing a parallel interaction state.
5. `compute-layout.ts` still does not honor `layout.hints.fixed`, but that belongs to the later layout/export work from Spec 74, not to this canvas-skeleton ticket.

## Architecture Check

1. Reuse the shared PixiJS app factory and shared viewport helper. Duplicating app bootstrap or viewport wiring would drift from the runner canvas architecture and violate Foundations 9 and 10.
2. Represent the editor's 4 logical layers as editor-owned containers mounted into the shared layer hierarchy:
   - `background` mounted under shared `backgroundLayer`
   - `route` mounted under shared `connectionRouteLayer`
   - `zone` mounted under shared `zoneLayer`
   - `handle` mounted under shared `interfaceGroup`
3. A minimal shared change to `viewport-setup.ts` is allowed and required: add a viewport resize capability that updates screen dimensions and recomputes overscroll/clamp behavior. The previous "do not modify viewport-setup.ts" constraint was incorrect for the current codebase.
4. The editor canvas remains self-contained in `map-editor/`; the only shared-module touch allowed here is the viewport resize enhancement needed to support a correct reusable contract.

## What to Change

### 1. Create editor canvas module

New file `packages/runner/src/map-editor/map-editor-canvas.ts`:

**`createEditorCanvas(container: HTMLElement, store: MapEditorStore)`**:
- Asynchronously create the PixiJS app via `createGameCanvas(container, ...)`
- Mount 4 editor-owned logical layers into the shared runner layer hierarchy
- Call `setupViewport` with the shared layer hierarchy and appropriate world bounds (derived from editor zone positions)
- Subscribe to the editor store and recompute world bounds when `zonePositions` changes
- Return `EditorCanvas` object with:
  - `app: Application`
  - `viewport: Viewport`
  - `layers: { background, route, zone, handle }`
  - `resize(width, height)` — resize the renderer/viewport through the shared viewport resize contract
  - `centerOnContent()` — center viewport on zone bounds
  - `destroy()` — clean up all PixiJS resources

**World bounds computation**:
- Derive from the editor document's zone positions, ignoring non-zone bookkeeping entries if present
- Compute a stable padded content box; empty content falls back to a finite origin-centered box
- Update on zone position changes (subscribe to store)

### 2. Create editor canvas types

Add to `map-editor-types.ts`:
- `EditorCanvas` interface
- `EditorLayerSet` interface: `{ background: Container; route: Container; zone: Container; handle: Container }`

### 3. Extend shared viewport helper for reusable resize support

Modify `packages/runner/src/canvas/viewport-setup.ts`:
- Add a `resize(screenWidth, screenHeight, bounds)` method to `ViewportResult`
- Recompute internal overscroll padding from the latest screen size
- Keep existing `updateWorldBounds` and `centerOnBounds` behavior intact

## Files to Touch

- `packages/runner/src/map-editor/map-editor-canvas.ts` (new)
- `packages/runner/src/map-editor/map-editor-types.ts` (modify — add canvas types)
- `packages/runner/src/canvas/viewport-setup.ts` (modify — add reusable resize support)

## Out of Scope

- Session state, `App.tsx`, and `GameSelectionScreen` changes from 74VISMAPLAYEDI-002
- Zone rendering (74VISMAPLAYEDI-004)
- Route rendering (74VISMAPLAYEDI-006)
- Handle rendering (74VISMAPLAYEDI-006)
- Drag interaction wiring (74VISMAPLAYEDI-004, 007)
- Grid overlay (74VISMAPLAYEDI-011)
- `MapEditorScreen` React integration (74VISMAPLAYEDI-005)
- Layout-engine support for `layout.hints.fixed`

## Acceptance Criteria

### Tests That Must Pass

1. `createEditorCanvas` reuses the shared game-canvas bootstrap and exposes 4 logical editor layers in correct z-order (background < route < zone < handle).
2. `destroy()` unsubscribes from the store, removes the editor canvas from the DOM, detaches editor-owned layers, and destroys the PixiJS application.
3. `resize(w, h)` updates viewport screen dimensions through the shared viewport helper and recomputes clamp bounds from the latest content bounds.
4. World bounds are computed from editor zone positions with padding and refresh when `zonePositions` changes.
5. Existing shared viewport tests still pass after the resize enhancement.
6. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. The editor does not create a second Pixi bootstrap path; it must reuse the runner's shared canvas/app infrastructure.
2. Shared-layer reuse must not mutate the existing game canvas layer ordering contract.
3. All PixiJS resources are cleaned up in `destroy()` (no memory leaks).

## Test Plan

### New/Modified Tests

1. `packages/runner/test/map-editor/map-editor-canvas.test.ts` — shared app reuse, logical layer mounting/order, destroy cleanup, resize behavior, world bounds updates from store changes
2. `packages/runner/test/map-editor/map-editor-types.test.ts` — editor canvas/editor layer types
3. `packages/runner/test/canvas/viewport-setup.test.ts` — shared viewport resize behavior and latest-screen-size overscroll recomputation

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner lint`
3. `pnpm -F @ludoforge/runner typecheck`

## Outcome

- Completion date: 2026-03-22
- What actually changed:
  - Added `packages/runner/src/map-editor/map-editor-canvas.ts` with an async `createEditorCanvas(...)` that reuses the shared Pixi bootstrap via `createGameCanvas`, mounts four editor-owned logical layers into the shared layer hierarchy, subscribes to editor-store zone-position changes, and exposes `resize`, `centerOnContent`, and `destroy`.
  - Extended `packages/runner/src/canvas/viewport-setup.ts` with a reusable `resize(...)` contract so viewport clamp/overscroll math stays correct after screen-size changes.
  - Added editor canvas/runtime types in `packages/runner/src/map-editor/map-editor-types.ts`.
  - Added/updated tests covering the new editor canvas contract, the shared viewport resize behavior, and the new editor canvas types.
- Deviations from original plan:
  - The ticket originally assumed a raw Pixi `Application` and standalone editor layer stack. The implementation deliberately reuses the existing shared canvas bootstrap and mounts editor-specific containers into shared layers instead.
  - The ticket originally forbade touching `viewport-setup.ts`. That assumption was wrong for the current codebase because the existing helper could not satisfy a correct resize contract.
  - Session/App scaffolding and the editor store were already present from prior work, so they remained out of scope.
- Verification results:
  - `pnpm -F @ludoforge/runner test` ✅
  - `pnpm -F @ludoforge/runner lint` ✅
  - `pnpm -F @ludoforge/runner typecheck` ✅
