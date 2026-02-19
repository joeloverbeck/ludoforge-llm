# BOARDLAY-004: Table Layout Mode

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: No
**Deps**: BOARDLAY-003 (compute-layout.ts dispatcher exists)

## Problem

Games without spatial adjacency (like Texas Hold'em) need a table-style layout: shared zones centered, player zones arranged in a circle/oval around the perimeter. The existing `computeGridLayout()` in `position-store.ts` provides a basic square grid but not the table arrangement described in Spec 41 D2 (table mode).

## What to Change

**Files (expected)**:
- `packages/runner/src/layout/compute-layout.ts` — add `computeTableLayout()` internal, replace throw in dispatcher
- `packages/runner/test/layout/compute-layout.test.ts` — add table mode tests

### Table Mode Algorithm

1. Call `partitionZones(def)` → get board zones (in table mode, all zones are treated as "board" for positioning purposes — the board/aux split still applies for sidebar grouping).
2. Classify zones:
   - **Shared zones**: `owner === 'none'` — these go in the center.
   - **Player zones**: `owner === 'player'` — these go around the perimeter.
3. **Center layout**: Stack shared zones vertically in the center of the layout area.
4. **Perimeter layout**: Distribute player zones evenly around an ellipse. Group zones by their assigned player (using zone ID naming conventions or attributes), placing each player's zones together.
5. Build `LayoutResult` with all positions and bounding box.

### Dispatcher Update

Replace `throw Error('Table layout not yet implemented')` with call to `computeTableLayout()`.

## Out of Scope

- Track and grid layout modes (BOARDLAY-005)
- Aux zone sidebar layout (BOARDLAY-006)
- Layout caching (BOARDLAY-007)
- GameCanvas integration (BOARDLAY-008)
- Engine package changes
- Modifying `computeGridLayout()` in position-store.ts (it remains as the position store's internal fallback)
- Zone styling or visual enhancements

## Acceptance Criteria

### Specific Tests That Must Pass

1. **Table layout produces positions for all zones**: Given N board zones, result has N position entries.
2. **Shared zones are centered**: Zones with `owner === 'none'` have positions near the center of the bounding box.
3. **Player zones are on perimeter**: Zones with `owner === 'player'` are positioned farther from center than shared zones.
4. **Player zones are distributed angularly**: Player zones are spread around the perimeter (no two player zones at same angle, within tolerance).
5. **mode field is 'table'**: Result `mode` equals `'table'`.
6. **Single shared zone**: One `owner: 'none'` zone is placed at origin.
7. **No shared zones**: All player zones arranged in circle (no center cluster).
8. **No player zones**: Only shared zones stacked at center.
9. **Bounding box is valid**: `boardBounds` has minX < maxX and minY < maxY for non-trivial input.
10. **Dispatcher routes table mode**: `computeLayout(def, 'table')` produces a result with `mode: 'table'`.

### Invariants

1. `computeTableLayout()` is pure — no side effects.
2. Returned `LayoutResult` is immutable.
3. The only file modified is `compute-layout.ts` (and its test file).
4. `computeGridLayout()` in `position-store.ts` is NOT modified.
5. `pnpm turbo build` and `pnpm -F @ludoforge/runner test` pass.
