# BOARDLAY-006: Aux Zone Sidebar Layout

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: No
**Deps**: BOARDLAY-002 (partitionZones provides aux zones)

## Problem

Aux zones (decks, force pools, hands, out-of-play areas) should not clutter the main board layout. They need to be positioned in a sidebar/margin area to the right of the board's bounding box, grouped by functional role for readability.

This corresponds to Spec 41 deliverable D4.

## What to Change

**Files (expected)**:
- `packages/runner/src/layout/aux-zone-layout.ts` — create with `computeAuxLayout()`
- `packages/runner/test/layout/aux-zone-layout.test.ts` — unit tests

### Function Signature

```typescript
import type { ZoneDef } from '@ludoforge/engine';
import type { AuxLayoutResult } from './layout-types';

function computeAuxLayout(
  auxZones: readonly ZoneDef[],
  boardBounds: { minX: number; minY: number; maxX: number; maxY: number }
): AuxLayoutResult;
```

### Grouping Heuristic

Aux zones are classified into groups using only GameDef data (no visual config):

1. **Card zones**: `ordering === 'stack'` and no `adjacentTo` (or empty adjacency).
2. **Force pools**: Zone ID matches patterns like `available-*`, `out-of-play-*`, `casualties-*` (case-insensitive ID matching).
3. **Hand zones**: `owner === 'player'` and `visibility === 'owner'`.
4. **Other**: Remaining aux zones that don't fit the above categories.

Empty groups are omitted from the result.

### Sidebar Layout

1. Position the sidebar starting at `boardBounds.maxX + margin` (e.g., margin = 120).
2. Stack groups vertically (top to bottom):
   - Each group gets a label (e.g., "Cards", "Force Pools", "Hands", "Other").
   - Within each group, zones are arranged in a compact vertical column.
   - Spacing between zones within a group: ~80 units.
   - Spacing between groups: ~140 units (includes label space).
3. Sidebar starts at `boardBounds.minY` (aligned with top of board).
4. Return positions for all aux zones and the group metadata.

## Out of Scope

- Board layout computation (BOARDLAY-003, -004, -005)
- Layout caching (BOARDLAY-007)
- GameCanvas integration (BOARDLAY-008)
- Engine package changes
- Visual styling of group labels (that's a renderer concern, not layout)
- Layout hints from visual config (Spec 42)
- Modifying position store or canvas updater

## Acceptance Criteria

### Specific Tests That Must Pass

1. **Card zones grouped**: Zones with `ordering: 'stack'` and no adjacency are placed in the "Cards" group.
2. **Force pool zones grouped**: Zones with IDs `available-troops`, `out-of-play-leaders`, `casualties-guerrillas` are placed in the "Force Pools" group.
3. **Hand zones grouped**: Zones with `owner: 'player'` and `visibility: 'owner'` are placed in the "Hands" group.
4. **Remaining zones in Other**: Aux zones not matching any pattern go to "Other" group.
5. **Empty groups omitted**: If no zones match a category, that group is absent from the result.
6. **Positions are to the right of board**: All aux zone x-coordinates are greater than `boardBounds.maxX`.
7. **Vertical stacking**: Within a group, zones have the same x-coordinate and increasing y-coordinates.
8. **Group ordering**: Groups appear top-to-bottom in a consistent order (Cards → Force Pools → Hands → Other).
9. **All aux zones positioned**: The number of entries in the returned positions map equals the number of input aux zones.
10. **Empty input**: No aux zones → empty positions map and empty groups array.
11. **Zero-area board bounds**: Works correctly when board bounds are all zeros (sidebar starts at a reasonable offset).
12. **No duplicate positions**: No two aux zones share the same position.

### Invariants

1. `computeAuxLayout()` is a pure function — no side effects.
2. Grouping uses only `ZoneDef` fields (`ordering`, `id`, `owner`, `visibility`, `adjacentTo`) — no visual config.
3. Returned `AuxLayoutResult` is immutable.
4. No existing source files are modified.
5. `pnpm turbo build` and `pnpm -F @ludoforge/runner test` pass.
