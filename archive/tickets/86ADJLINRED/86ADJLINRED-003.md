# 86ADJLINRED-003: Adjacency Line Restyling — Edge-to-Edge Dashed Lines

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: archive/tickets/86ADJLINRED/86ADJLINRED-002.md

## Problem

Adjacency lines are currently drawn as thin gray solid lines (1.5px, alpha 0.3) from zone center to zone center. This causes two visual defects: (1) lines cross through zone interiors because they connect centers, and (2) lines look visually inconsistent with the styled road/river connectors which are thicker and edge-anchored.

## Assumption Reassessment (2026-03-27)

1. `packages/runner/src/canvas/renderers/adjacency-renderer.ts` currently draws center-to-center solid lines via `graphics.moveTo(...)` → `graphics.lineTo(...)` → `graphics.stroke(...)` — confirmed.
2. `packages/runner/src/config/visual-config-provider.ts` still defaults edges to `{ color: '#6b7280', width: 1.5, alpha: 0.3 }`, and highlighted edges to `{ color: '#93c5fd', width: 3, alpha: 0.7 }` — confirmed.
3. `packages/runner/src/canvas/renderers/shape-utils.ts` already exposes `getEdgePointAtAngle(shape, dimensions, angleDeg)` for the shapes used by zone visuals, including rectangle, line, circle, ellipse, diamond, and regular polygons — confirmed.
4. `packages/runner/src/canvas/geometry/dashed-line.ts` and `packages/runner/test/canvas/geometry/dashed-line.test.ts` already exist. This ticket must consume the existing utility, not plan to introduce it.
5. The current adjacency renderer API only receives `adjacencies` and `positions`. There is no existing `zoneDimensions` parameter or standalone geometry map in the renderer pipeline.
6. The required geometry already exists one layer up in `buildPresentationScene()`: `scene.zones` contains each zone's resolved visual shape/width/height. The clean architecture is to thread existing presentation zone visuals into the adjacency renderer, not to invent a parallel `zoneDimensions` channel.
7. FITL currently overrides `edges.default` in `data/games/fire-in-the-lake/visual-config.yaml`, so the runner default change alone would not restyle FITL. The ticket must explicitly update the FITL override if FITL is in scope.

## Architecture Check

1. Edge clipping should reuse the existing `getEdgePointAtAngle()` utility. No new geometry primitive is needed.
2. The most robust renderer contract is to consume existing presentation-zone visuals from `scene.zones`. Duplicating shape/size into `PresentationAdjacencyNode` would denormalize scene data, and inventing a new `zoneDimensions` side map would create another geometry pipeline to maintain.
3. Game-agnostic: the renderer computes endpoints from whatever zone shape/size the visual config resolves. Per-game styling overrides still belong in visual config (Foundation 3: Visual Separation).
4. No backwards compatibility: center-to-center solid adjacency lines should be replaced directly, and the renderer/tests updated in the same change (Foundation 9: No Backwards Compatibility).

## What to Change

### 1. Update Adjacency Rendering Data Flow to Use Presentation Zone Visuals

Update the renderer contract so adjacency drawing has access to zone geometry from the already-resolved presentation scene.

**Required API change**:
- Update `AdjacencyRenderer.update(...)` in `packages/runner/src/canvas/renderers/renderer-types.ts`
- Update `createAdjacencyRenderer(...).update(...)` in `packages/runner/src/canvas/renderers/adjacency-renderer.ts`
- Update the call site in `packages/runner/src/canvas/canvas-updater.ts`

**Preferred shape of the change**:
1. Pass `scene.zones` into the adjacency renderer update path.
2. Build a per-update lookup by zone id inside the renderer, or otherwise consume the existing `PresentationZoneNode.visual` data without duplicating it into adjacency nodes.
3. Keep `PresentationAdjacencyNode` focused on adjacency semantics (`from`, `to`, `category`, `isHighlighted`) unless a stronger reason emerges.

### 2. Update `adjacency-renderer.ts` — Edge Clipping + Dashed Drawing

Replace center-to-center drawing with shape-aware dashed drawing:

1. Compute the direction from `fromCenter` to `toCenter`
2. Resolve both endpoint zones from the passed presentation zone data
3. Convert each zone visual into shape dimensions using existing width/height values
4. Call `getEdgePointAtAngle(fromVisual.shape, fromDimensions, angleDeg)` for the source endpoint
5. Call `getEdgePointAtAngle(toVisual.shape, toDimensions, angleDeg + 180)` for the target endpoint
6. Offset both returned edge points by their zone-center positions
7. Call the existing `drawDashedLine(graphics, fromEdge, toEdge, dashLength, gapLength)`
8. Stroke once with the resolved edge style

**Imports to add**: `drawDashedLine` from `../geometry/dashed-line`, `getEdgePointAtAngle` from `./shape-utils`

### 3. Update Default Edge Style in `visual-config-provider.ts`

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

Also update the highlighted default to match the spec direction:

```typescript
applyEdgeStyle(resolved, {
  color: '#ffffff',
  width: 3,
  alpha: 0.85,
});
```

### 4. Update FITL `visual-config.yaml` Edge Defaults

FITL already overrides `edges.default`, so this file is in scope, not optional.

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
- `packages/runner/src/canvas/renderers/renderer-types.ts` (modify — adjacency renderer contract)
- `packages/runner/src/canvas/canvas-updater.ts` (modify — pass presentation zones into adjacency renderer)
- `packages/runner/src/config/visual-config-provider.ts` (modify — update default edge style constants)
- `data/games/fire-in-the-lake/visual-config.yaml` (modify — update `edges.default`)

## Out of Scope

- Creating `dashed-line.ts` (already exists)
- Spur line rendering (86ADJLINRED-004)
- Highlight styling updates (86ADJLINRED-005)
- Changing connection route rendering
- Modifying `shape-utils.ts` — only consuming existing `getEdgePointAtAngle()`
- Expanding `PresentationAdjacencyNode` to duplicate zone geometry, unless implementation proves the existing scene-level zone data cannot be threaded cleanly

## Acceptance Criteria

### Tests That Must Pass

1. **New/updated unit test**: `packages/runner/test/canvas/renderers/adjacency-renderer.test.ts`
   - Given two rectangular zones with known centers and visuals, the rendered line endpoints are on the zone boundaries (not at centers)
   - Given shaped zones, edge points are offset by zone center position (not raw `getEdgePointAtAngle` output)
   - The renderer uses dashed geometry rather than drawing a single center-to-center line segment
   - Missing zone-visual data causes the adjacency to stay hidden rather than crash or silently draw from the center
2. Existing dashed line utility tests remain green: `packages/runner/test/canvas/geometry/dashed-line.test.ts`
2. Runner lint: `pnpm -F @ludoforge/runner lint`
3. Runner typecheck: `pnpm -F @ludoforge/runner typecheck`
4. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Adjacency lines never cross through zone interiors when both endpoint visuals are available
2. Endpoint clipping uses source/target zone shapes and `angleDeg` / `angleDeg + 180`
3. The adjacency renderer consumes presentation-zone geometry from the existing scene pipeline rather than introducing a duplicate geometry source of truth
4. Default edge style is white (`#ffffff`), 2px, alpha 0.6; highlighted default is white, 3px, alpha 0.85
5. No game-specific logic in `adjacency-renderer.ts` (Foundation 1)

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/renderers/adjacency-renderer.test.ts` — verify edge clipping produces boundary points, verify dashed drawing behavior, verify graceful handling when positions or zone visuals are missing
2. `packages/runner/test/canvas/geometry/dashed-line.test.ts` — regression only; no new coverage required unless the utility changes

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner lint`
3. `pnpm -F @ludoforge/runner typecheck`

### Visual Verification

1. `pnpm -F @ludoforge/runner dev` → load FITL game
2. Confirm adjacency lines are dashed white lines between zone edges
3. Confirm lines do not cross through zone interiors
4. Pan/zoom → confirm lines render correctly at all viewport scales

## Outcome

- **Completion date**: 2026-03-27
- **What actually changed**:
  - Corrected the ticket assumptions before implementation to match the current runner architecture.
  - Updated the adjacency renderer contract to consume `scene.zones` so edge clipping uses existing presentation-zone visuals as the single geometry source of truth.
  - Replaced center-to-center solid adjacency drawing with dashed, edge-clipped drawing using the existing `drawDashedLine()` utility and `getEdgePointAtAngle()`.
  - Updated runner edge defaults and FITL `edges.default` to white `2px` / `0.6 alpha`, with highlighted defaults at white `3px` / `0.85 alpha`.
  - Strengthened adjacency-renderer tests and updated affected runner/config tests for the new renderer contract and visual defaults.
- **Deviations from original plan**:
  - No new `zoneDimensions` pipeline was introduced. The implementation intentionally uses existing presentation-zone visuals because that is cleaner and more extensible than duplicating geometry state.
  - No work was needed in `dashed-line.ts`; the utility and its tests already existed.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test` ✅
  - `pnpm -F @ludoforge/runner lint` ✅
  - `pnpm -F @ludoforge/runner typecheck` ✅
