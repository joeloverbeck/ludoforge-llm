# 83ZONEDGANCEND-008: convertSegment Respects Anchored Endpoints

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: `archive/tickets/83ZONEDGANCEND/83ZONEDGANCEND-004-editor-route-geometry-update.md`, `archive/tickets/83ZONEDGANCEND/83ZONEDGANCEND-005-store-actions-set-and-preview-anchor.md`

## Problem

The map editor store still initializes new quadratic segments from zone centers when `convertSegment(routeId, segmentIndex, 'quadratic')` is called. For routes whose endpoints carry zone-edge `anchor` metadata, that produces a control point midpoint that is inconsistent with the rendered path geometry. The result is architectural drift: the editor renders anchored endpoints from resolved edge positions, but segment conversion still seeds control points from a stale center-only model.

## Assumption Reassessment (2026-03-26)

1. `convertSegmentInDocument()` in `packages/runner/src/map-editor/map-editor-store.ts` computes new quadratic controls from a store-local `resolveEndpointPosition()` helper.
2. That store-local helper currently returns zone centers for `kind: 'zone'` endpoints and ignores optional `endpoint.anchor` metadata.
3. Shared editor route geometry in `packages/runner/src/map-editor/map-editor-route-geometry.ts` already resolves anchored zone endpoints from zone-edge positions, requires `zoneVisuals`, and existing tests already cover that behavior.
4. No active ticket currently owns this mismatch. Ticket 006 covers drag-time zone-linked endpoint editing, not control-point initialization for segment conversion.

### Verified Discrepancies vs Earlier Plan

1. `packages/runner/src/map-editor/map-editor-route-geometry.ts` does **not** need the contract added; that work already landed.
2. The remaining defect is isolated to the store’s private endpoint resolver used only by `convertSegmentInDocument()`.
3. The store already has enough immutable inputs to resolve zone visuals cleanly: `gameDef` plus `originalVisualConfig` can derive the same `zoneVisuals` map the renderers use.

## Architecture Check

1. Segment conversion should derive from the same endpoint-resolution contract as route rendering and hit testing. Anything else creates two geometries for one route model, which violates architectural completeness (F10).
2. This remains runner-only and game-agnostic: the change is about generic endpoint geometry, not FITL-specific behavior (F1, F3).
3. No backwards-compatibility shim is needed. `convertSegment()` should stop using the obsolete center-only assumption and adopt the existing shared endpoint resolver directly (F9).
4. The clean architecture is to keep endpoint semantics centralized in `map-editor-route-geometry.ts` and make the store consume that contract. Re-implementing anchor math in the store would just preserve the duplication that caused the bug.

## What to Change

### 1. Remove the store-private center-only endpoint resolution path from segment conversion

Update `convertSegmentInDocument()` so that when it creates a new quadratic segment, the midpoint control is computed from resolved endpoint positions that honor zone endpoint `anchor` metadata.

The implementation must reuse the shared `map-editor-route-geometry` endpoint resolver rather than maintaining another store-local copy of the logic.

### 2. Derive store-side `zoneVisuals` from immutable editor inputs

If the store needs zone shape/dimension data to resolve anchored endpoints correctly, derive `zoneVisuals` once from `gameDef` + `originalVisualConfig` and thread that derived context into the conversion helper. Do not duplicate renderer-specific logic and do not push visual state into mutable editor document state.

The goal is one source of truth for endpoint position semantics across:
- route rendering
- handle rendering
- hit testing
- segment conversion

### 3. Strengthen tests around anchored segment conversion

Add or update tests proving that converting a straight segment to quadratic on a route with anchored zone endpoints seeds the control point from the anchored edge endpoints, not the zone centers.

Also keep a regression test for the existing unanchored midpoint behavior so the contract stays explicit.

## Files to Touch

- `packages/runner/src/map-editor/map-editor-store.ts` (modify)
- `packages/runner/test/map-editor/map-editor-store.test.ts` (modify)

## Out of Scope

- Drag interaction behavior for zone endpoints — ticket 006
- Visual-config data authoring for FITL routes — ticket 007
- Schema changes for connection endpoints
- Broad refactors of the map editor store unrelated to endpoint geometry
- Changes to `map-editor-route-geometry.ts` unless a defect is discovered while wiring the store to the existing contract

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
4. The fix does not add a second anchor-resolution implementation path inside the store.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/map-editor/map-editor-store.test.ts` — keep the existing center-midpoint conversion test and add anchored `convertSegment` coverage so midpoint control initialization follows resolved endpoint geometry
2. `packages/runner/test/map-editor/map-editor-route-geometry.test.ts` — no ticketed edits expected; existing coverage remains the reference contract and must stay green

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/map-editor/map-editor-store.test.ts`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`
4. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completed: 2026-03-26
- What changed: `convertSegmentInDocument()` now resolves endpoints through the shared `map-editor-route-geometry` contract, using store-derived `zoneVisuals` from `gameDef` plus `originalVisualConfig`, so anchored zone endpoints seed quadratic controls from resolved edge positions instead of zone centers.
- What changed: `packages/runner/test/map-editor/map-editor-store.test.ts` now includes explicit anchored midpoint coverage and keeps the existing unanchored midpoint regression coverage in place.
- Deviations from original plan: no changes were needed in `packages/runner/src/map-editor/map-editor-route-geometry.ts` because the shared anchored-endpoint contract and tests already existed; the fix was isolated to the store plus store tests.
- Verification: `pnpm -F @ludoforge/runner exec vitest run test/map-editor/map-editor-store.test.ts`
- Verification: `pnpm -F @ludoforge/runner exec vitest run test/map-editor/map-editor-route-geometry.test.ts`
- Verification: `pnpm -F @ludoforge/runner test`
- Verification: `pnpm -F @ludoforge/runner typecheck`
- Verification: `pnpm -F @ludoforge/runner lint`
