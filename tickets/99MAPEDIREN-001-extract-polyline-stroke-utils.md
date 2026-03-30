# 99MAPEDIREN-001: Extract shared polyline and stroke utilities

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: `specs/99-map-editor-renderer-unification.md`

## Problem

`connection-route-renderer.ts` and `map-editor-route-renderer.ts` contain 11 duplicated pure functions (~200 lines each copy) for polyline geometry and stroke resolution. This duplication must be eliminated before the renderer unification work begins.

## Assumption Reassessment (2026-03-30)

1. Both files contain identical implementations of all 11 functions — CONFIRMED by codebase inspection.
2. `packages/runner/src/rendering/` already exists (contains `color-utils.ts`, `resolve-edge-stroke-style.ts`) — CONFIRMED.
3. `map-editor-handle-renderer.ts` does NOT directly import any of the 11 functions — CONFIRMED. It uses `resolveRouteGeometry()` from `map-editor-route-geometry.ts`.

## Architecture Check

1. Extracting pure geometry functions into a shared `rendering/` module follows DRY and single-responsibility. Both renderers become thinner consumers.
2. No engine changes. No GameSpecDoc/GameDef boundary affected. Purely internal runner refactoring.
3. No backwards-compatibility shims. Both renderers switch imports in the same change.

## What to Change

### 1. Create `packages/runner/src/rendering/polyline-utils.ts`

Extract from `connection-route-renderer.ts`:
- `getPolylineLength(points: readonly Position[]): number`
- `resolvePolylinePointAtDistance(points: readonly Position[], distance: number): Position`
- `samplePolylineWavePoints(points: readonly Position[], config: WaveConfig): Position[]`
- `approximatePolylineHitPolygon(points: readonly Position[], halfWidth: number): Position[]`
- `resolvePolylineNormal(points: readonly Position[], distance: number): number`
- `resolveLabelRotation(angle: number): number`
- `normalizeAngle(angle: number): number`
- `flattenPoints(points: readonly Position[]): number[]`

### 2. Create `packages/runner/src/rendering/route-stroke-utils.ts`

Extract from `connection-route-renderer.ts`:
- `ResolvedStroke` interface
- `sanitizePositiveNumber(value: number, fallback: number): number`
- `sanitizeUnitInterval(value: number, fallback: number): number`

### 3. Update `connection-route-renderer.ts` imports

Remove local definitions of all 11 functions/types. Import from the new shared modules.

### 4. Update `map-editor-route-renderer.ts` imports

Remove local definitions of all 11 functions/types. Import from the new shared modules.

## Files to Touch

- `packages/runner/src/rendering/polyline-utils.ts` (new)
- `packages/runner/src/rendering/route-stroke-utils.ts` (new)
- `packages/runner/src/canvas/renderers/connection-route-renderer.ts` (modify — replace local defs with imports)
- `packages/runner/src/map-editor/map-editor-route-renderer.ts` (modify — replace local defs with imports)

## Out of Scope

- Game canvas renderer logic changes (only import paths change)
- Map editor renderer deletion (that is 99MAPEDIREN-005)
- Map editor layer structure changes (99MAPEDIREN-002)
- Presentation adapter creation (99MAPEDIREN-003)
- Any changes to `map-editor-handle-renderer.ts` (does not import these functions)
- Any engine package changes

## Acceptance Criteria

### Tests That Must Pass

1. All existing `connection-route-renderer.test.ts` tests pass unchanged — renderer behavior is identical.
2. All existing `map-editor-route-renderer.test.ts` tests pass unchanged — renderer behavior is identical.
3. New `polyline-utils.test.ts` covers all 8 extracted functions with at least the same cases that existed inline.
4. New `route-stroke-utils.test.ts` covers `sanitizePositiveNumber` and `sanitizeUnitInterval`.
5. Existing suite: `pnpm -F @ludoforge/runner test`
6. Typecheck: `pnpm -F @ludoforge/runner typecheck`
7. Lint: `pnpm -F @ludoforge/runner lint`

### Invariants

1. No behavioral change to either renderer — output for identical inputs must be identical.
2. No new runtime dependencies. All extracted functions are pure (geometry math only).
3. The `rendering/` directory continues to hold only shared, renderer-agnostic utilities.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/rendering/polyline-utils.test.ts` — unit tests for all 8 geometry functions
2. `packages/runner/test/rendering/route-stroke-utils.test.ts` — unit tests for sanitize helpers and `ResolvedStroke` type usage

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose polyline-utils`
2. `pnpm -F @ludoforge/runner test -- --reporter=verbose route-stroke-utils`
3. `pnpm -F @ludoforge/runner test -- --reporter=verbose connection-route-renderer`
4. `pnpm -F @ludoforge/runner test -- --reporter=verbose map-editor-route-renderer`
5. `pnpm -F @ludoforge/runner typecheck && pnpm -F @ludoforge/runner lint`
