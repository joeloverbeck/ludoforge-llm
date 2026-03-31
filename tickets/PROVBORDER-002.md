# PROVBORDER-002: Proximity gate for border activation

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: `tickets/PROVBORDER-001.md` (uses effective radii computed there)

## Problem

Border snapping activates for all topologically adjacent provinces regardless of geometric distance. The only guard is a per-vertex 200px `MAX_EXTRUSION_DISTANCE` reject, which is too generous. When provinces are far apart, vertices within the facing cone still get projected toward the bisector, producing unnatural polygon deformation (visible in the pre-border screenshot where Sihanoukville is far from The Parrots Beak but still topologically adjacent).

## Assumption Reassessment (2026-03-31)

1. `computeProvinceBorders()` iterates all province-to-province adjacency pairs from the `PresentationAdjacencyNode[]` array — confirmed at line 49-54. No distance check before processing.
2. `MAX_EXTRUSION_DISTANCE = 200` is checked per-vertex at line 130, not per-pair. A pair can have some vertices within 200px and some outside, producing partial borders.
3. PROVBORDER-001 adds `effectiveRadius()` which can be reused here for O(1) gap estimation.
4. No mismatch — the function genuinely lacks a per-pair proximity gate.

## Architecture Check

1. **Why per-pair gating**: The MAX_EXTRUSION_DISTANCE per-vertex check is a safety valve, not a proximity gate. Checking the gap before processing any vertices for a pair prevents wasted computation and eliminates partial-border artifacts entirely. The gap formula (`centerDist - r_A - r_B`) uses effective radii already computed in PROVBORDER-001.
2. **Game-agnostic**: Gate operates on generic positions and radii — no game-specific logic.
3. **No backwards-compatibility shims**: Internal logic change only. Public API unchanged.

## What to Change

### 1. Add `PROXIMITY_THRESHOLD` constant

```typescript
/** Maximum gap (pixels) between effective circles before border formation activates. */
const PROXIMITY_THRESHOLD = 40;
```

### 2. Add proximity check in neighbor loop

Before computing the bisector for a neighbor pair, compute the gap:

```typescript
const gap = Math.hypot(dx, dy) - radiusA - radiusB;
if (gap > PROXIMITY_THRESHOLD) continue; // skip — too far apart
```

This goes inside the `for (const neighborId of neighbors)` loop at line 84, after retrieving the neighbor position and before calling `computeWeightedBisector`.

## Files to Touch

- `packages/runner/src/canvas/renderers/province-border-utils.ts` (modify)
- `packages/runner/test/canvas/renderers/province-border-utils.test.ts` (modify)

## Out of Scope

- Weighted bisector logic (PROVBORDER-001)
- Cone blending (PROVBORDER-003)
- Adjusting `MAX_EXTRUSION_DISTANCE` — it remains as a secondary safety valve

## Acceptance Criteria

### Tests That Must Pass

1. Two provinces with gap > 40px: no border vertices in output (all `isBorder: false`)
2. Two provinces with gap < 40px: border vertices present in output
3. Two provinces with gap exactly at threshold boundary: deterministic inclusion/exclusion
4. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. `computeProvinceBorders()` return type unchanged
2. Provinces with no adjacent neighbors still produce uniform non-border segments

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/renderers/province-border-utils.test.ts` — proximity gate activation/deactivation with known center distances and polygon areas

### Commands

1. `pnpm -F @ludoforge/runner test -- --grep "province-border"`
2. `pnpm -F @ludoforge/runner typecheck && pnpm -F @ludoforge/runner lint`
