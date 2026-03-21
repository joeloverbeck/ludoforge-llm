# 71CONROUREN-005: Pipeline Integration (Presentation Scene, Canvas Runtime, Canvas Updater)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: archive/tickets/71CONROUREN/71CONROUREN-003.md, archive/tickets/71CONROUREN/71CONROUREN-004.md

## Problem

This ticket originally assumed the connection-route pipeline was still unwired. That assumption was stale.

By inspection of the current runner code on 2026-03-21:

- `PresentationScene` already exposes `connectionRoutes` and `junctions`.
- `buildPresentationScene()` already resolves connection routes and filters ordinary zones/adjacencies correctly.
- `createLayerHierarchy()` already contains a dedicated `connectionRouteLayer`.
- `createCanvasUpdater()` already updates the connection-route renderer and merges route containers into token placement.
- `createGameCanvasRuntime()` already instantiates `createConnectionRouteRenderer()` and passes it into the updater.

The remaining discrepancy was narrower but real: connection-route zones were not wired into the same interaction/container architecture as ordinary zones. Route zones rendered and anchored tokens correctly, but they were not selectable/hoverable and were invisible to zone-container consumers such as hover-anchor resolution and zone-targeted animation plumbing. That violated Spec 71's requirement that LoC zones remain selectable.

## Assumption Reassessment (2026-03-21)

1. The core pipeline integration proposed by this ticket was already implemented before this pass. Repeating those edits would have been redundant and architecturally noisy.
2. The only missing behavior in this area was route-zone interaction parity: connection routes needed to participate in the same zone-selection and zone-container contract as ordinary zones.
3. The right architecture is not a special-case post-processing branch in hover/selection code. Connection routes should be first-class zone surfaces in the runtime, with the renderer owning its selection binding just as `ZoneRenderer` does.
4. The token-attachment container and the route interaction surface should remain the same object. Using the midpoint container for both keeps token placement, hover anchoring, and pointer targeting aligned.
5. Consumers that operate on rendered "zone containers" must see both ordinary zones and connection-route zones. That includes hover-anchor resolution and animation descriptor execution.

## Architecture Check

1. The current connection-route architecture is better than the ticket's original plan because the scene/updater/runtime split already exists and is clean: resolver in presentation, drawing in a dedicated renderer, orchestration in updater/runtime.
2. The remaining fix belongs in renderer/runtime plumbing, not in presentation. Selection and hover are canvas concerns, so the resolver and scene contracts should stay unchanged.
3. Merging ordinary-zone and connection-route container maps is the correct long-term design. Any runtime subsystem that targets rendered zones should not need to know whether a zone is drawn by the zone renderer or the connection-route renderer.
4. No backwards compatibility or alias path is needed. Route zones now follow the same zone interaction contract directly.

## What Changed

### 1. Kept the existing scene/updater integration

No changes were needed in `presentation-scene.ts` or `canvas-updater.ts` for the originally proposed pipeline wiring. The existing architecture there was already correct and beneficial.

### 2. Made the connection-route layer interactive

In `packages/runner/src/canvas/layers.ts`:

- `connectionRouteLayer` now uses passive event mode with interactive children enabled, matching the fact that route midpoint containers are legitimate interaction targets.

### 3. Added renderer-owned route selection binding

In `packages/runner/src/canvas/renderers/connection-route-renderer.ts`:

- Extended `ConnectionRouteRendererOptions` with an optional `bindSelection` callback.
- Route midpoint containers now become selectable interaction surfaces when binding is supplied.
- The renderer tracks route selectability and cleans up bindings when routes disappear or the renderer is destroyed.
- Midpoint containers now receive the translated curve hit polygon so pointer interaction, token anchoring, and hover anchoring all share the same logical target.

### 4. Promoted connection routes into the runtime zone-container contract

In `packages/runner/src/canvas/game-canvas-runtime.ts`:

- `createConnectionRouteRenderer()` now receives zone-style selection/hover wiring through `attachZoneSelectHandlers()`.
- Hover-anchor resolution now looks up route containers alongside ordinary zone containers.
- Animation controller `zoneContainers` now merges ordinary-zone and connection-route containers, so zone-targeted animation descriptors can resolve route zones too.

### 5. Strengthened tests around the missing invariant

- Added coverage proving the connection-route layer is interactive.
- Added coverage proving the route renderer binds midpoint selection and cleans it up.
- Added runtime coverage proving merged zone-container maps reach animation and hover systems.

## Files Touched

- `packages/runner/src/canvas/layers.ts`
- `packages/runner/src/canvas/renderers/connection-route-renderer.ts`
- `packages/runner/src/canvas/game-canvas-runtime.ts`
- `packages/runner/test/canvas/layers.test.ts`
- `packages/runner/test/canvas/renderers/connection-route-renderer.test.ts`
- `packages/runner/test/canvas/GameCanvas.test.ts`

## Out of Scope

- Rewriting already-correct scene/updater integration
- Changing connection-route topology resolution
- Tangent-perpendicular token fanning
- Animated river flow
- FITL visual-config migration

## Acceptance Criteria

### Verified

1. Connection-route zones remain part of `PresentationScene` / updater integration through the already-implemented pipeline.
2. Connection-route midpoint containers are selectable/hoverable through the same zone handler plumbing as ordinary zones.
3. Hover-anchor resolution can resolve route-zone containers.
4. Zone-targeted animation plumbing can resolve route-zone containers.
5. Runner test, typecheck, and lint all pass.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/layers.test.ts`
2. `packages/runner/test/canvas/renderers/connection-route-renderer.test.ts`
3. `packages/runner/test/canvas/GameCanvas.test.ts`

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completion date: 2026-03-21
- What actually changed:
  - Reassessed the ticket and confirmed that its originally proposed presentation/updater/runtime integration had already been implemented.
  - Fixed the one missing architectural gap: connection-route zones now participate in zone selection, hover anchoring, and zone-container runtime consumers.
  - Added test coverage that proves route midpoint containers are wired as first-class zone surfaces.
- Deviations from original plan:
  - Did not reimplement scene/updater integration because it already existed and was correct.
  - Focused the code change on route interaction/container parity rather than reopening the entire connection-route pipeline.
- Verification results:
  - `pnpm -F @ludoforge/runner test` passed with 179 files and 1812 tests passing.
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
