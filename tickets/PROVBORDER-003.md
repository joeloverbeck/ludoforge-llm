# PROVBORDER-003: Soft cone blending at facing-cone boundary

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: `tickets/PROVBORDER-001.md`, `tickets/PROVBORDER-002.md`

## Problem

The ±60 degree facing cone in `computeProvinceBorders()` creates a binary snap: vertices just inside the cone jump fully to the bisector, while adjacent vertices just outside keep their original positions. This produces visible kinks/notches at the cone boundary — a discontinuity between projected and non-projected vertices.

## Assumption Reassessment (2026-03-31)

1. `FACING_CONE_HALF = Math.PI / 3` (60 degrees) at line 7 — confirmed. The cone check at line 112 is `angleDiff <= FACING_CONE_HALF`, which is a hard threshold.
2. Projected vertices are marked `isBorder: true` (line 139) and kept as straight segments by `selectiveSmoothPolygon()`. Non-projected vertices are `isBorder: false` and get Chaikin-smoothed. The hard transition between these two regimes is the visual kink.
3. No existing blend/gradient logic — the transition is strictly binary.

## Architecture Check

1. **Why smoothstep blending**: A smoothstep interpolation at the cone boundary produces C1-continuous transitions (no visible kink). Blended vertices are marked `isBorder: false` so they receive Chaikin smoothing, which further smooths the transition. The smoothstep function `t^2 * (3 - 2t)` is standard in graphics rendering for exactly this purpose.
2. **Game-agnostic**: The blending operates on angular geometry — no game-specific logic.
3. **No backwards-compatibility shims**: Internal vertex processing only. Public API unchanged.

## What to Change

### 1. Add blend constants

```typescript
/** Angular margin (radians) for soft blending at cone boundary. */
const BLEND_MARGIN = Math.PI / 12; // 15 degrees
```

### 2. Replace binary snap with blended projection

In the vertex processing loop (lines 97-140), after finding `bestBisector` and computing the projected position:

```typescript
// Compute blend factor
let blend = 1.0; // fully projected by default
if (bestAngleDiff > FACING_CONE_HALF - BLEND_MARGIN) {
  const t = (FACING_CONE_HALF - bestAngleDiff) / BLEND_MARGIN;
  blend = t * t * (3 - 2 * t); // smoothstep
}

// Lerp between original and projected
const blendedX = localX + (projected.x - pos.x - localX) * blend;
const blendedY = localY + (projected.y - pos.y - localY) * blend;

modifiedVerts.push(blendedX, blendedY);
// Only mark as border if fully projected (blend >= 1)
segments.push({ isBorder: blend >= 1.0 });
```

Also update the condition for entering the projection path. Currently vertices with `bestBisector === null` (outside cone) keep original positions. No change needed there — the blend naturally reaches 0 at the cone edge.

### 3. Adjust `isBorder` marking

Blended vertices (`blend < 1.0`) are marked `isBorder: false` so they receive Chaikin smoothing. Only fully-snapped vertices remain as straight border segments.

## Files to Touch

- `packages/runner/src/canvas/renderers/province-border-utils.ts` (modify)
- `packages/runner/test/canvas/renderers/province-border-utils.test.ts` (modify)

## Out of Scope

- Weighted bisector logic (PROVBORDER-001)
- Proximity gating (PROVBORDER-002)
- Changes to `selectiveSmoothPolygon()` — it already handles the `isBorder` flag correctly

## Acceptance Criteria

### Tests That Must Pass

1. Vertex at cone center (angleDiff = 0): blend = 1.0, fully projected, `isBorder: true`
2. Vertex deep in cone (angleDiff = 30 deg): blend = 1.0, fully projected, `isBorder: true`
3. Vertex in blend zone (angleDiff = 52 deg, within 15 deg margin): 0 < blend < 1, partially projected, `isBorder: false`
4. Vertex at cone edge (angleDiff = 60 deg): blend ~= 0, essentially original position, `isBorder: false`
5. Vertex outside cone (angleDiff = 70 deg): not projected at all
6. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. `computeProvinceBorders()` return type unchanged
2. Vertices deep inside the cone (angleDiff < FACING_CONE_HALF - BLEND_MARGIN) behave identically to current implementation
3. `selectiveSmoothPolygon()` receives correct `isBorder` annotations

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/renderers/province-border-utils.test.ts` — blend factor correctness at cone center, blend zone, cone edge, and outside cone

### Commands

1. `pnpm -F @ludoforge/runner test -- --grep "province-border"`
2. `pnpm -F @ludoforge/runner typecheck && pnpm -F @ludoforge/runner lint`
