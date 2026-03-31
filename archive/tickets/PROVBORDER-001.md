# PROVBORDER-001: Weighted bisector using power-diagram formula

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

`computeBisector()` in `province-border-utils.ts` places the bisector at the midpoint between two province centers regardless of polygon size. When provinces have different areas (e.g., small Sihanoukville next to large The Parrots Beak), the border cuts through the larger province disproportionately, producing an unnatural asymmetric deformation.

## Assumption Reassessment (2026-03-31)

1. `computeBisector()` at `province-border-utils.ts:217` computes midpoint as `(aCenter + bCenter) / 2` — confirmed, no weighting.
2. `computeProvinceBorders()` at `province-border-utils.ts:29` passes `Position` objects only, not polygon vertices — bisector has no access to polygon geometry.
3. Both game canvas (`canvas-updater.ts:111`) and map editor (`MapEditorScreen.tsx:213`) call `computeProvinceBorders()` with identical signatures — fixing the function fixes both flows.
4. No mismatch found — the algorithm genuinely lacks size-awareness.

## Architecture Check

1. **Why this approach**: The power-diagram formula (`t = (d^2 + r_A^2 - r_B^2) / (2 * d^2)`) is the mathematically correct generalization of the midpoint bisector for circles of different radii. It degrades gracefully to `t = 0.5` (midpoint) when radii are equal, so this is a strict improvement with zero regression risk for same-size provinces.
2. **Game-agnostic**: The border computation operates on generic `PresentationZoneNode` data — no game-specific logic. Province polygons are visual-config data, not GameSpecDoc data.
3. **No backwards-compatibility shims**: `computeBisector` is an internal (non-exported) helper. Its signature changes are encapsulated within the module.

## What to Change

### 1. Add `polygonArea()` helper

Compute polygon area using the shoelace formula from a flat vertex array `[x1, y1, x2, y2, ...]`. Returns absolute area (always positive).

### 2. Add `effectiveRadius()` helper

Compute `Math.sqrt(area / Math.PI)` — the radius of a circle with equivalent area.

### 3. Modify `computeBisector` → `computeWeightedBisector`

Add `radiusA` and `radiusB` parameters. Compute weighted midpoint:

```typescript
const d2 = dx * dx + dy * dy;
const t = d2 > 0 ? (d2 + radiusA * radiusA - radiusB * radiusB) / (2 * d2) : 0.5;
const clampedT = Math.max(0.1, Math.min(0.9, t)); // prevent degenerate placement
```

Midpoint becomes `aCenter + clampedT * (bCenter - aCenter)`.

### 4. Update `computeProvinceBorders` call site

Pass polygon vertices to compute effective radii before calling `computeWeightedBisector`.

## Files to Touch

- `packages/runner/src/canvas/renderers/province-border-utils.ts` (modify)
- `packages/runner/test/canvas/renderers/province-border-utils.test.ts` (new or modify)

## Out of Scope

- Proximity gating (PROVBORDER-002)
- Cone blending (PROVBORDER-003)
- Changes to `selectiveSmoothPolygon` or any other function

## Acceptance Criteria

### Tests That Must Pass

1. Equal-area polygons: weighted bisector produces midpoint (t = 0.5)
2. Polygon A 4x area of polygon B: bisector shifts toward B (t > 0.5)
3. `polygonArea()` returns correct area for a known triangle and rectangle
4. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. `computeProvinceBorders()` return type unchanged (`ReadonlyMap<string, ModifiedProvincePolygon>`)
2. When all provinces have equal area, output is identical to current behavior

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/renderers/province-border-utils.test.ts` — `polygonArea` correctness, weighted bisector positioning for equal and unequal polygons

### Commands

1. `pnpm -F @ludoforge/runner test -- --grep "province-border"`
2. `pnpm -F @ludoforge/runner typecheck && pnpm -F @ludoforge/runner lint`

## Outcome

- **Completion date**: 2026-03-31
- **What changed**:
  - `province-border-utils.ts`: Added exported `polygonArea()` (shoelace formula) and `effectiveRadius()` helpers. Renamed `computeBisector` → `computeWeightedBisector` with `radiusA`/`radiusB` params using power-diagram formula `t = (d² + rA² - rB²) / (2d²)`, clamped to [0.1, 0.9]. Updated `computeProvinceBorders` neighbor loop to compute effective radii from polygon vertices.
  - `province-border-utils.test.ts`: Added test suites for `polygonArea` (triangle, rectangle, winding invariance, degenerate input), `effectiveRadius` (zero, π, 100π), and weighted bisector (equal-area → midpoint, 4x area → shift toward smaller).
- **Deviations**: None — implemented exactly as specified.
- **Verification**: 2102 tests passed, typecheck clean, lint clean (0 warnings).
