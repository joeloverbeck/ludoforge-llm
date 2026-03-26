# 83ZONEDGANCEND-008: convertSegment Respects Anchored Endpoints

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: `archive/tickets/83ZONEDGANCEND/83ZONEDGANCEND-004-editor-route-geometry-update.md`, `archive/tickets/83ZONEDGANCEND/83ZONEDGANCEND-005-store-actions-set-and-preview-anchor.md`

## Problem

The map editor store still initializes new quadratic segments from zone centers when `convertSegment(routeId, segmentIndex, 'quadratic')` is called. For routes whose endpoints carry zone-edge `anchor` metadata, that produces a control point midpoint that is inconsistent with the rendered path geometry. The result is architectural drift: the editor renders anchored endpoints from resolved edge positions, but segment conversion still seeds control points from a stale center-only model.

## Assumption Reassessment (2026-03-26)

1. `convertSegmentInDocument()` in `packages/runner/src/map-editor/map-editor-store.ts` computes new quadratic controls from a store-local `resolveEndpointPosition()` helper.
2. That store-local helper currently returns zone centers for `kind: 'zone'` endpoints and ignores optional `endpoint.anchor` metadata.
3. Shared editor route geometry in `packages/runner/src/map-editor/map-editor-route-geometry.ts` already resolves anchored zone endpoints from zone-edge positions, and existing tests cover that behavior.
4. No active ticket currently owns this mismatch. Ticket 006 covers drag-time zone-linked endpoint editing, not control-point initialization for segment conversion.

## Architecture Check

1. Segment conversion should derive from the same endpoint-resolution contract as route rendering and hit testing. Anything else creates two geometries for one route model, which violates architectural completeness (F10).
2. This remains runner-only and game-agnostic: the change is about generic endpoint geometry, not FITL-specific behavior (F1, F3).
3. No backwards-compatibility shim is needed. `convertSegment()` should simply stop using the obsolete center-only assumption and adopt the current route geometry contract directly (F9).

## What to Change

### 1. Remove the center-only endpoint resolution path from segment conversion

Update `convertSegmentInDocument()` so that when it creates a new quadratic segment, the midpoint control is computed from resolved endpoint positions that honor zone endpoint `anchor` metadata.

The preferred implementation is to reuse shared route-geometry endpoint resolution rather than maintaining another store-local copy of the logic.

### 2. Align store-side geometry inputs with the shared route contract

If the store needs zone shape/dimension data to resolve anchored endpoints correctly, introduce the smallest clean change necessary to provide that data without duplicating renderer-specific logic or pushing visual state into mutable editor document state.

The goal is one source of truth for endpoint position semantics across:
- route rendering
- handle rendering
- hit testing
- segment conversion

### 3. Strengthen tests around anchored segment conversion

Add or update tests proving that converting a straight segment to quadratic on a route with anchored zone endpoints seeds the control point from the anchored edge endpoints, not the zone centers.

## Files to Touch

- `packages/runner/src/map-editor/map-editor-store.ts` (modify)
- `packages/runner/src/map-editor/map-editor-route-geometry.ts` (modify only if a small shared extraction is necessary)
- `packages/runner/test/map-editor/map-editor-store.test.ts` (modify)

## Out of Scope

- Drag interaction behavior for zone endpoints — ticket 006
- Visual-config data authoring for FITL routes — ticket 007
- Schema changes for connection endpoints
- Broad refactors of the map editor store unrelated to endpoint geometry

## Acceptance Criteria

### Tests That Must Pass

1. `convertSegment(routeId, segmentIndex, 'quadratic')` on a route with unanchored zone endpoints still seeds the control point from the center-based midpoint of the resolved endpoints
2. `convertSegment(routeId, segmentIndex, 'quadratic')` on a route with anchored zone endpoints seeds the control point from the midpoint of the resolved edge endpoints
3. Converting the same segment back to `straight` still preserves current cleanup behavior
4. Existing suite: `pnpm -F @ludoforge/runner test`
5. Existing suite: `pnpm -F @ludoforge/runner typecheck`
6. Existing suite: `pnpm -F @ludoforge/runner lint`

### Invariants

1. There is a single route-geometry contract for endpoint position semantics across editing and rendering.
2. Zone endpoint `anchor` metadata affects segment conversion wherever it already affects rendered route geometry.
3. Immutable store updates and existing undo/redo behavior remain intact.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/map-editor/map-editor-store.test.ts` — add anchored `convertSegment` coverage so midpoint control initialization follows resolved endpoint geometry
2. `packages/runner/test/map-editor/map-editor-route-geometry.test.ts` — keep existing anchored endpoint geometry coverage green as the reference contract

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/map-editor/map-editor-store.test.ts`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`
4. `pnpm -F @ludoforge/runner lint`
