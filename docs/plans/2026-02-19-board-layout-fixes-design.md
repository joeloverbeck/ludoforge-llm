# Board Layout Fixes Design

**Date**: 2026-02-19
**Status**: APPROVED

## Problem

Three distinct issues with the board layout system, visible in FITL's ~44-node graph:

1. **Viewport clamp too tight**: Bounds are computed from zone center points only. Zones at edges (180x110px) are clipped because the viewport clamp doesn't account for zone rendering size. Users can't pan far enough to see edge zones.

2. **Graph layout massively overlapping**: `GRAPH_NORMALIZED_EXTENT = 1000` for ~44 nodes with 180x110px zones. `GRAPH_MIN_SPACING = 60` is far below the ~211px zone diagonal. ForceAtlas2 output plus 6 relaxation passes can't prevent overlap.

3. **Aux zones overlapping**: `ZONE_VERTICAL_SPACING = 80` while zone height is 110px. Aux zones literally stack on top of each other. `SIDEBAR_MARGIN_X = 120` is too close to board edge zones.

## Design

### Shared Zone Size Constants

New file: `packages/runner/src/layout/layout-constants.ts`

Exports `ZONE_RENDER_WIDTH` (180), `ZONE_RENDER_HEIGHT` (110), `ZONE_HALF_WIDTH` (90), `ZONE_HALF_HEIGHT` (55). Imported by zone-renderer, aux-zone-layout, layout-cache, and compute-layout. Single source of truth for zone dimensions.

### Fix 1: Zone-Size-Aware Viewport Bounds

**File**: `packages/runner/src/layout/layout-cache.ts`

`computeUnifiedBounds` pads the raw point-based bounds by `ZONE_HALF_WIDTH` (90) on X and `ZONE_HALF_HEIGHT` (55) on Y. This ensures the viewport clamp allows panning to see full zones at every edge.

No changes needed to `viewport-setup.ts` — it already uses the bounds from the position store.

### Fix 2: Dynamic Graph Layout

**File**: `packages/runner/src/layout/compute-layout.ts`

Three coordinated changes:

1. **Dynamic extent**: Replace fixed `GRAPH_NORMALIZED_EXTENT = 1000` with `computeGraphExtent(nodeCount)` that scales as `sqrt(nodeCount) * zoneDiagonal * GRAPH_NODE_SPACING_FACTOR` (factor ~2.5). For FITL's 44 nodes: ~3500px. Minimum floor of 1000px.

2. **Zone-aware minimum spacing**: Replace fixed `GRAPH_MIN_SPACING = 60` with `computeGraphMinSpacing()` returning `zoneDiagonal * 1.3` (~275px). Increase `GRAPH_SPACING_RELAXATION_PASSES` from 6 to 10.

3. **Attribute-enhanced seeding**: Enhance `seedInitialPositions` to build composite grouping keys from zone attributes (e.g., `country:category`). Zones sharing the same `country` attribute cluster in the same angular sector. Falls back to category-only grouping when no suitable attributes exist. Entirely data-driven — no game-specific code.

### Fix 3: Zone-Height-Aware Aux Spacing

**File**: `packages/runner/src/layout/aux-zone-layout.ts`

Replace hardcoded spacing with zone-size-derived values:
- `SIDEBAR_MARGIN_X`: `ZONE_RENDER_WIDTH + 40` = 220 (40px clearance between zone edges)
- `ZONE_VERTICAL_SPACING`: `ZONE_RENDER_HEIGHT + 20` = 130 (20px gap between zones)
- `GROUP_VERTICAL_SPACING`: `ZONE_RENDER_HEIGHT + 60` = 170 (60px gap between groups)

### Testing Strategy

**layout-constants**: Constants are positive, halves are correct.

**layout-cache.test.ts**: Bounds include zone-size padding. Empty/single-position edge cases.

**compute-layout.test.ts**:
- Dynamic extent scales with node count
- Minimum spacing >= zone diagonal * factor
- Attribute-based seeding clusters same-attribute nodes
- Fallback to category-only without attributes
- No two positioned zones overlap (pairwise distance check)
- Edge cases: 0 nodes, 1 node

**aux-zone-layout.test.ts**:
- Vertical spacing exceeds zone height
- Group spacing exceeds zone height
- Sidebar X provides clearance from board bounds
- No pairwise overlap across all aux zones

**Integration**: FITL game definition produces non-overlapping layout with padded bounds.

## Files Changed

| File | Change |
|------|--------|
| `packages/runner/src/layout/layout-constants.ts` | NEW — shared zone size constants |
| `packages/runner/src/layout/layout-cache.ts` | Pad bounds by half-zone dimensions |
| `packages/runner/src/layout/compute-layout.ts` | Dynamic extent, zone-aware spacing, attribute seeding |
| `packages/runner/src/layout/aux-zone-layout.ts` | Zone-height-aware spacing |
| `packages/runner/src/canvas/renderers/zone-renderer.ts` | Import constants from layout-constants |
| `packages/runner/test/layout/layout-cache.test.ts` | Add bounds padding tests |
| `packages/runner/test/layout/compute-layout.test.ts` | Add graph layout tests |
| `packages/runner/test/layout/aux-zone-layout.test.ts` | Add aux spacing tests |

## Constraints

- No game-specific code in engine or runner
- Deterministic layout (same input = same output)
- All existing tests must pass
- Zone renderer dimensions must match layout constants
