# 86ADJLINRED-003: Adjacency Line Restyling — Edge-to-Edge Dashed Lines

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: archive/tickets/86ADJLINRED/86ADJLINRED-002.md

## Problem

Adjacency lines are currently drawn as thin gray solid lines (1.5px, alpha 0.3) from zone center to zone center. This causes two visual defects: (1) lines cross through zone interiors because they connect centers, and (2) lines look visually inconsistent with the styled road/river connectors which are thicker and edge-anchored.

## Assumption Reassessment (2026-03-27)

1. `adjacency-renderer.ts` (154 lines) draws straight solid lines via `graphics.moveTo(fromPosition)` → `graphics.lineTo(toPosition)` → `graphics.stroke(strokeStyle)` — confirmed.
2. `resolveEdgeStyle()` in `visual-config-provider.ts` returns `{ color: '#6b7280', width: 1.5, alpha: 0.3 }` as defaults (lines 337-361) — confirmed.
3. `getEdgePointAtAngle()` in `shape-utils.ts` (lines 132-164) handles rectangle, circle, ellipse, and diamond shapes — confirmed. It takes `(shape, dimensions, angleDeg)` and returns a `Position` on the shape boundary.
4. The `adjacency-renderer.ts` `update()` function receives `positions: ReadonlyMap<string, Position>` (zone centers) and `zoneDimensions: ReadonlyMap<string, ZoneDimensions>` — need to verify `ZoneDimensions` availability.
5. `drawDashedLine()` from 86ADJLINRED-002 will be available as an import.

## Architecture Check

1. Edge clipping uses the existing `getEdgePointAtAngle()` utility — no new geometry math needed. The adjacency renderer gains shape-awareness by consuming zone dimension data it already receives.
2. Game-agnostic: all games get dashed edge-to-edge adjacency lines by default. Per-game styling overrides remain possible via `edges.default` in visual config (Foundation 3: Visual Separation).
3. No backwards compatibility — the old center-to-center solid lines are replaced wholesale (Foundation 9: No Backwards Compatibility).

## What to Change

### 1. Update `adjacency-renderer.ts` — Edge Clipping + Dashed Drawing

Replace the `drawAdjacencyLine()` function:

**Current**: `graphics.moveTo(fromCenter)` → `graphics.lineTo(toCenter)` → `graphics.stroke()`

**New**:
1. Compute angle from `fromCenter` to `toCenter`: `Math.atan2(dy, dx) * (180 / Math.PI)`
2. Look up zone shape/dimensions for both endpoints from the `zoneDimensions` map
3. Call `getEdgePointAtAngle(fromShape, fromDims, angle)` → `fromEdge`
4. Call `getEdgePointAtAngle(toShape, toDims, angle + 180)` → `toEdge`
5. Offset edge points by zone center position (since `getEdgePointAtAngle` returns relative-to-center)
6. Call `drawDashedLine(graphics, fromEdge, toEdge, dashLength, gapLength)`
7. Call `graphics.stroke(strokeStyle)`

**Imports to add**: `drawDashedLine` from `../geometry/dashed-line`, `getEdgePointAtAngle` from `./shape-utils`

**Data flow change**: The `update()` signature may need zone shape information. Check whether `zoneDimensions` already carries shape type or if the renderer needs an additional parameter (e.g., `zoneShapes: ReadonlyMap<string, ZoneShape>`). If not available, pass it through from the presentation scene.

### 2. Update Default Edge Style in `visual-config-provider.ts`

Change the hardcoded defaults in `resolveEdgeStyle()`:

```typescript
// Before:
const resolved: ResolvedEdgeVisual = {
  color: '#6b7280',
  width: 1.5,
  alpha: 0.3,
};

// After:
const resolved: ResolvedEdgeVisual = {
  color: '#ffffff',
  width: 2,
  alpha: 0.6,
};
```

### 3. Update FITL `visual-config.yaml` Edge Defaults (if overriding)

Update `edges.default` in the FITL visual config to match the new style:

```yaml
edges:
  default:
    color: "#ffffff"
    width: 2
    alpha: 0.6
```

## Files to Touch

- `packages/runner/src/canvas/renderers/adjacency-renderer.ts` (modify — edge clipping + dashed drawing)
- `packages/runner/src/config/visual-config-provider.ts` (modify — update default edge style constants)
- `data/games/fire-in-the-lake/visual-config.yaml` (modify — update `edges.default`)

## Out of Scope

- Creating `dashed-line.ts` (86ADJLINRED-002)
- Spur line rendering (86ADJLINRED-004)
- Highlight styling updates (86ADJLINRED-005)
- Changing connection route rendering
- Modifying `shape-utils.ts` — only consuming existing `getEdgePointAtAngle()`
- Modifying `presentation-scene.ts` (unless zone shape data needs to be threaded through)

## Acceptance Criteria

### Tests That Must Pass

1. **New/updated unit test**: `packages/runner/test/canvas/renderers/adjacency-renderer.test.ts`
   - Given two rectangular zones with known centers and dimensions, the rendered line endpoints are on the zone boundaries (not at centers)
   - Given two adjacent zones, `drawDashedLine` is called (not `graphics.lineTo` directly)
   - Edge points are offset by zone center position (not raw `getEdgePointAtAngle` output)
2. Runner lint: `pnpm -F @ludoforge/runner lint`
3. Runner typecheck: `pnpm -F @ludoforge/runner typecheck`
4. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Adjacency lines never cross through zone interiors — endpoints are always on zone boundaries
2. `getEdgePointAtAngle` is called with correct angles: `angle` for the "from" zone, `angle + 180` for the "to" zone
3. `drawDashedLine` is called instead of `graphics.lineTo` for all adjacency lines
4. Default edge style is white (#ffffff), 2px, alpha 0.6 — matching spec
5. No game-specific logic in `adjacency-renderer.ts` (Foundation 1)

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/renderers/adjacency-renderer.test.ts` — verify edge clipping produces boundary points, verify dashed line function is invoked

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner lint`
3. `pnpm -F @ludoforge/runner typecheck`

### Visual Verification

1. `pnpm -F @ludoforge/runner dev` → load FITL game
2. Confirm adjacency lines are dashed white lines between zone edges
3. Confirm lines do not cross through zone interiors
4. Pan/zoom → confirm lines render correctly at all viewport scales
