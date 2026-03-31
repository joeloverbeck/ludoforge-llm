# Province Border Rendering Fix — Design

**Date**: 2026-03-31
**Status**: Approved

## Context

Province border rendering in the runner produces visual artifacts when adjacent provinces of different sizes get close. The `computeProvinceBorders()` function in `province-border-utils.ts` uses a bisector-projection algorithm that has three defects:

1. The bisector is placed at the midpoint between centers regardless of polygon size
2. The ±60 facing cone creates binary snap — vertices jump to bisector or stay, no blending
3. No proximity gating — border snapping activates for all topologically adjacent provinces even when far apart

The same code is used by both the game canvas (`canvas-updater.ts`) and map editor (`MapEditorScreen.tsx`) after the Spec 99 renderer unification.

## Approach: Incremental Fix (3 Tickets)

Fix all three problems within the existing bisector-projection architecture. No new dependencies. ~80 lines changed in a single file.

### PROVBORDER-001: Weighted Bisector

Replace the midpoint bisector with a power-diagram weighted bisector that accounts for polygon area.

- Compute effective radius per polygon: `r = sqrt(area / pi)` using shoelace formula
- Weighted midpoint parameter: `t = (d^2 + r_A^2 - r_B^2) / (2 * d^2)`
- When equal sizes: t = 0.5 (same as current). When unequal: border shifts toward smaller province.
- ~15 lines: new `polygonArea()` helper + modify `computeBisector` signature

### PROVBORDER-002: Proximity Gate

Skip border formation when provinces are geometrically far apart.

- Gap estimate: `gap = center_distance - r_A - r_B`
- If `gap > PROXIMITY_THRESHOLD` (40px), skip this neighbor pair
- Uses effective radii from PROVBORDER-001 (O(1) per pair)
- ~10 lines in the neighbor loop

### PROVBORDER-003: Soft Cone Blending

Replace the binary facing-cone cutoff with a smooth blend at the cone boundary.

- Blend margin: `BLEND_MARGIN = pi/12` (15 degrees)
- For vertices in the blend zone: `blend = smoothstep((FACING_CONE_HALF - angleDiff) / BLEND_MARGIN)`
- Position = `lerp(original, projected, blend)`
- Blended vertices marked `isBorder: false` to receive Chaikin smoothing
- ~20 lines in the vertex loop

## Files to Touch

- `packages/runner/src/canvas/renderers/province-border-utils.ts` (modify)
- `packages/runner/test/canvas/renderers/province-border-utils.test.ts` (new or modify)

## FOUNDATIONS Alignment

- F5 (Determinism): Pure math, same inputs = same outputs
- F7 (Immutability): Returns new `ModifiedProvincePolygon` objects
- F9 (No Backwards Compat): Direct algorithm fix, no shims
- F10 (Architectural Completeness): Addresses all three root causes
- F11 (Testing as Proof): Golden tests with known polygon inputs

## Test Plan

1. Equal-size provinces: weighted bisector = midpoint (regression)
2. Unequal-size provinces: border shifts toward smaller
3. Far-apart provinces: proximity gate skips border
4. Close provinces: proximity gate allows border
5. Vertex at cone center: fully projected
6. Vertex at cone edge: smoothly blended
7. Vertex outside cone: not projected
8. Selective smoothing preserves straight border segments
9. End-to-end golden test: known polygon pair -> expected output

## Verification

```bash
pnpm -F @ludoforge/runner test
pnpm -F @ludoforge/runner typecheck
pnpm -F @ludoforge/runner lint
```

Visual verification: open map editor, move Sihanoukville close to The Parrots Beak, confirm clean border formation.
