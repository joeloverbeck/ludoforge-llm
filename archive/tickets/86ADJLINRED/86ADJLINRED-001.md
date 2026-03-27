# 86ADJLINRED-001: Exclude Connection Zones from Primary Layout

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

FITL LoC zones are rendered as connection overlays, but they still participate in primary layout computation. That is the architectural mismatch. A connection zone is not a board node; letting it occupy a graph/grid/track position pollutes layout with synthetic nodes and causes the surrounding board to be arranged around artifacts that are never meant to render as normal zones.

The original ticket assumed this should be solved by adding LoCs to `hiddenZones`. That assumption is incorrect.

## Assumption Reassessment (2026-03-27)

1. `hiddenZones` does **not** control layout participation. `getOrComputeLayout()` builds positions from `partitionZones(def)` and `computeLayout(...)`; neither path consults `hiddenZones`. Adding LoCs to `visual-config.yaml` would not remove them from graph/grid/track layout.
2. `hiddenZones` is applied later, in `project-render-model.ts` and `presentation-scene.ts`. In `buildPresentationScene()`, hidden zones are filtered **before** `resolveConnectionRoutes()`. Hiding LoC zones there would suppress the route overlay itself, not just its node box.
3. FITL currently defines **17** LoC connection routes in `visual-config.yaml`, not the 10 listed in the spec/ticket split. Several IDs in the original plan were incomplete or outdated (`loc-saigon-an-loc-ban-me-thuot:none`, `loc-saigon-da-lat:none`, `loc-kontum-ban-me-thuot:none`, `loc-kontum-qui-nhon:none`, `loc-can-tho-*`, etc.).
4. The runner already has the right semantic hook: connection zones are identified through visual config as `shape: connection`, and `resolveConnectionRoutes()` already projects them into route overlays. The missing piece is excluding those zones from primary layout, not hiding them from rendering.

## Architecture Check

1. The cleaner architecture is: zones whose resolved visual shape is `connection` do not receive primary board-layout positions. They remain renderable through the connection-route pipeline.
2. This is game-agnostic and belongs in layout resolution, because the distinction is visual/presentation semantics (`shape: connection`), not FITL-specific data.
3. `hiddenZones` should keep its current meaning: do not project/render the zone as a normal zone. It should not be overloaded to mean "exclude from layout but still render as a route". Adding such aliasing would weaken the architecture.
4. No backwards compatibility. If any code path wrongly assumes every zone must have a world-layout position, that assumption should be fixed at the consumer.

## What to Change

### 1. Exclude `shape: connection` Zones from Layout Computation

Update the layout pipeline so connection-shaped zones are omitted from primary layout inputs:

- They must not participate in graph layout nodes/edges
- They must not receive grid slots
- They must not receive track positions
- They must not be placed in the aux layout sidebar either

The practical source of truth is `VisualConfigProvider.resolveZoneVisual(...).shape === 'connection'`.

### 2. Preserve Connection-Route Rendering

Do **not** add LoC zones to FITL `hiddenZones`.

The route overlay pipeline must continue to work with connection zones present in the runner frame, even when those zones have no world-layout position of their own.

### 3. Add/Strengthen Tests

Add focused tests that prove the corrected architecture:

- layout excludes connection-shaped zones from computed positions
- connection routes still resolve/render from endpoint positions without requiring a position for the connection zone itself
- tokens assigned to a connection zone remain associated with the route presentation path rather than disappearing

## Files to Touch

- `packages/runner/src/layout/layout-cache.ts`
- `packages/runner/src/layout/compute-layout.ts`
- `packages/runner/src/presentation/presentation-scene.ts` only if needed to preserve route/token projection with unpositioned connection zones
- relevant runner tests

## Out of Scope

- Editing FITL `hiddenZones`
- Adjacency restyling (86ADJLINRED-003)
- Dashed line utility (86ADJLINRED-002)
- Spur lines (86ADJLINRED-004)
- Highlight styling updates (86ADJLINRED-005)
- Engine changes

## Acceptance Criteria

### Tests That Must Pass

1. Runner tests: `pnpm -F @ludoforge/runner test`
2. Runner lint: `pnpm -F @ludoforge/runner lint`
3. Runner typecheck: `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. A zone resolved as `shape: connection` has no primary world-layout position.
2. Connection routes still render from endpoint/anchor geometry without requiring a center position for the connection zone.
3. `hiddenZones` semantics remain unchanged.
4. No FITL-specific conditionals are introduced in runner code.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/layout/layout-cache.test.ts`
   Verify connection-shaped zones are excluded from computed layout positions while normal board zones still receive positions.
2. `packages/runner/test/presentation/presentation-scene.test.ts`
   Verify a connection route and its tokens still project correctly when the positions map omits the connection zone itself.

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner lint`
3. `pnpm -F @ludoforge/runner typecheck`

## Outcome

- Completion date: 2026-03-27
- What actually changed:
  - Corrected the ticket assumptions before implementation.
  - Updated the layout pipeline so zones resolved as `shape: connection` are excluded from computed world-layout positions.
  - Preserved route projection by leaving connection zones in the runner frame and presentation pipeline.
  - Added proof tests for layout exclusion and route projection without a connection-zone position.
- Deviations from original plan:
  - Did **not** add any FITL LoC IDs to `hiddenZones`.
  - Did **not** edit `data/games/fire-in-the-lake/visual-config.yaml`.
  - Solved the issue architecturally in layout resolution rather than as a FITL data tweak, because `hiddenZones` neither controls layout nor preserves route rendering.
- Verification results:
  - `pnpm -F @ludoforge/runner test` ✅
  - `pnpm -F @ludoforge/runner lint` ✅
  - `pnpm -F @ludoforge/runner typecheck` ✅
