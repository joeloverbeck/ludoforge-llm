# BOARDLAY-005: Track and Grid Layout Modes

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: No
**Deps**: BOARDLAY-003 (compute-layout.ts dispatcher exists)

## Problem

Two additional layout modes are needed for specific board topologies:

- **Track mode**: Linear boards (race games, score tracks) where zones form a chain. Must handle serpentine wrapping for long tracks and cycle breaking.
- **Grid mode**: Grid-based boards (chess, Go) where zones have `row`/`col` attributes. Falls back to square grid when attributes are missing.

These are explicitly-declared modes (`metadata.layoutMode: 'track'` or `'grid'`) — never auto-detected.

## What to Change

**Files (expected)**:
- `packages/runner/src/layout/compute-layout.ts` — add `computeTrackLayout()` and `computeGridModeLayout()` internals, replace throws in dispatcher
- `packages/runner/test/layout/compute-layout.test.ts` — add track and grid mode tests

### Track Mode Algorithm

1. Build graph from board zones via `buildLayoutGraph()`.
2. **Find chain endpoints**: Nodes with degree 1 (exactly one neighbor). If no degree-1 nodes exist (cycle), pick an arbitrary node as the break point.
3. **BFS/DFS ordering**: Walk from one endpoint to produce a linear ordering of nodes.
4. **Serpentine layout**: For tracks with <= 15 spaces, lay out in a single row. For longer tracks, wrap in serpentine pattern (left-to-right, then right-to-left on next row, etc.).
5. **Branch spurs**: Nodes with degree > 2 create branch spurs laid out perpendicular to the main track.
6. **Cycle handling**: Break cycle at arbitrary point, lay out as a rectangle (chain wrapping around).
7. Build `LayoutResult`.

### Grid Mode Algorithm

1. Inspect board zones for `attributes.row` and `attributes.col` (number values).
2. **If row/col attributes present**: Position zones at `(col * spacing, row * spacing)`.
3. **Fallback**: If no row/col attributes, arrange zones in a square grid (same logic as position-store's `computeGridLayout()` but using LayoutResult interface).
4. Build `LayoutResult`.

### Dispatcher Update

Replace both `throw Error('Track layout not yet implemented')` and `throw Error('Grid layout not yet implemented')` with calls to the respective functions.

## Out of Scope

- Graph mode (BOARDLAY-003) and table mode (BOARDLAY-004) — already implemented
- Aux zone sidebar layout (BOARDLAY-006)
- Layout caching (BOARDLAY-007)
- GameCanvas integration (BOARDLAY-008)
- Engine package changes
- Position store modifications

## Acceptance Criteria

### Specific Tests That Must Pass

**Track mode:**

1. **Linear chain**: 5 zones in a chain (A→B→C→D→E) produce positions in a horizontal line, left to right.
2. **Serpentine wrapping**: 20 zones in a chain wrap into serpentine rows (row 1 left-to-right, row 2 right-to-left).
3. **Cycle handling**: 6 zones forming a cycle produce positions in a rectangular arrangement.
4. **Branch spur**: A main chain with a branch node produces the branch perpendicular to the main track.
5. **Single node**: One zone placed at origin.
6. **mode field**: Result `mode` equals `'track'`.
7. **No overlap**: No two zone positions are identical.
8. **Dispatcher routes track mode**: `computeLayout(def, 'track')` produces `mode: 'track'`.

**Grid mode:**

9. **Row/col positioning**: Zones with `attributes.row: 0, col: 0` and `attributes.row: 0, col: 1` are placed in the same row, adjacent horizontally.
10. **Grid preserves topology**: A 3x3 grid with row/col attributes produces 9 positions in a grid arrangement.
11. **Fallback without attributes**: Zones without row/col attributes are arranged in a square grid.
12. **Mixed attributes**: Zones with partial row/col attributes (some have, some don't) — zones with attributes use them, others fill remaining grid cells.
13. **mode field**: Result `mode` equals `'grid'`.
14. **Dispatcher routes grid mode**: `computeLayout(def, 'grid')` produces `mode: 'grid'`.

### Invariants

1. Both layout functions are pure — no side effects.
2. Track mode never auto-detects — only runs when explicitly requested.
3. Grid mode never auto-detects — only runs when explicitly requested.
4. Returned `LayoutResult` is immutable.
5. The only file modified is `compute-layout.ts` (and its test file).
6. `pnpm turbo build` and `pnpm -F @ludoforge/runner test` pass.
