# 71CONROUREN-008: Shared Zone Presentation Visuals for Zone and Connection Renderers

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: archive/tickets/71CONROUREN/71CONROUREN-005.md, archive/tickets/71CONROUREN/71CONROUREN-007.md, specs/71-connection-route-rendering.md

## Problem

`zone-renderer.ts` and `connection-route-renderer.ts` now both render the same zone-presentation concepts: name label, marker label, and badge. After `71CONROUREN-007`, the connection-route renderer reached feature parity, but it did so by re-implementing badge and marker visual update logic that already exists in the ordinary zone renderer.

That duplication is still small, but it is architectural debt. If zone presentation styling changes again, the code now has two places that must stay behaviorally aligned. Left alone, that increases the risk of renderer drift where ordinary zones and connection-shaped zones silently diverge again.

## Assumption Reassessment (2026-03-21)

1. `PresentationZoneRenderSpec` is already the shared presentation contract for both ordinary zones and connection routes: it exposes `nameLabel`, `markersLabel`, and `badge`.
2. `packages/runner/src/canvas/renderers/zone-renderer.ts` and `packages/runner/src/canvas/renderers/connection-route-renderer.ts` both now create and update bitmap-text marker labels plus badge graphics/labels using closely related logic, but there is no shared helper for that work.
3. The duplication is currently localized to runner canvas rendering. No engine/compiler/runtime agnostic layer is involved, so the clean fix belongs in runner rendering utilities, not in specs, kernel, or visual-config schema.
4. The goal is not a generic renderer framework. The right scope is a small shared helper for zone-presentation visuals only, because over-abstracting full renderer lifecycles would add complexity without solving a real problem.

## Architecture Check

1. A shared zone-presentation visual helper is cleaner than maintaining parallel label/badge logic in two renderers because the presentation contract lives in one place and both renderers consume it the same way.
2. This stays aligned with F1 and F3. The refactor remains fully generic and runner-local: it reuses already-resolved presentation data and introduces no game-specific branching.
3. No backwards-compatibility shims or alias exports should be introduced. The old duplicated helper paths should be removed once the shared helper is in place.
4. The extraction should be narrow. Share only the label/badge visual creation and update logic, while leaving renderer-specific geometry, hit areas, and container ownership inside each renderer.

## What to Change

### 1. Extract shared zone-presentation visual helpers

Create a runner-local helper module for the common visual primitives used by both zone renderers:

- creation of the stroked name label
- creation of the stroked marker label
- creation/update/hide behavior for the badge graphics and badge label

The helper should operate on `PresentationZoneRenderSpec`-compatible data and stay ignorant of whether the caller is an ordinary zone renderer or a connection-route renderer.

### 2. Refactor both renderers onto the shared helper

Update:

- `packages/runner/src/canvas/renderers/zone-renderer.ts`
- `packages/runner/src/canvas/renderers/connection-route-renderer.ts`

So both renderers use the shared helper for label/badge visuals while preserving their own container layout rules:

- ordinary zones keep rectangular/shape-local label placement
- connection routes keep midpoint-local label-cluster placement

### 3. Prove renderer parity through tests

Strengthen or adjust renderer tests so the shared helper is covered through both call sites:

- ordinary zone renderer still renders and updates markers/badges correctly
- connection-route renderer still renders and updates markers/badges correctly
- removing or changing badge/marker presentation behaves identically across both renderers

## Files to Touch

- `packages/runner/src/canvas/renderers/zone-renderer.ts` (modify)
- `packages/runner/src/canvas/renderers/connection-route-renderer.ts` (modify)
- `packages/runner/src/canvas/renderers/` (new helper module)
- `packages/runner/test/canvas/renderers/zone-renderer.test.ts` (modify if needed)
- `packages/runner/test/canvas/renderers/connection-route-renderer.test.ts` (modify if needed)

## Out of Scope

- Changing the `PresentationZoneRenderSpec` data contract
- Changing route topology, curvature, junction, or hit-area behavior
- FITL visual-config migration
- New visual-config schema fields
- A broad renderer inheritance/composition framework

## Acceptance Criteria

### Tests That Must Pass

1. Ordinary zone renderer continues to render and update marker labels and badges correctly via the shared helper path.
2. Connection-route renderer continues to render and update marker labels and badges correctly via the shared helper path.
3. Removing badge/marker presentation hides the correct display objects without stale visual leakage in either renderer.
4. Existing suite: `pnpm -F @ludoforge/runner test`
5. `pnpm -F @ludoforge/runner typecheck`
6. `pnpm -F @ludoforge/runner lint`

### Invariants

1. `PresentationZoneRenderSpec` remains the single presentation contract for zone marker/badge visuals across renderer paths.
2. No game-specific branches or visual-config special cases are introduced.
3. Renderer-specific geometry/layout ownership stays local to each renderer; only shared zone-presentation visual logic is extracted.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/renderers/zone-renderer.test.ts` — proves ordinary zone marker/badge behavior still holds after the shared-helper refactor.
2. `packages/runner/test/canvas/renderers/connection-route-renderer.test.ts` — proves connection-route marker/badge behavior still holds after the shared-helper refactor.

### Commands

1. `pnpm -F @ludoforge/runner exec vitest run test/canvas/renderers/zone-renderer.test.ts`
2. `pnpm -F @ludoforge/runner exec vitest run test/canvas/renderers/connection-route-renderer.test.ts`
3. `pnpm -F @ludoforge/runner test`
4. `pnpm -F @ludoforge/runner typecheck`
5. `pnpm -F @ludoforge/runner lint`
