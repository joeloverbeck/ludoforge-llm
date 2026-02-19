# BOARDLAY-005: Track and Grid Layout Modes

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: No
**Deps**: BOARDLAY-003 (compute-layout.ts dispatcher exists)

## Problem

Two additional layout modes are needed for specific board topologies:

- **Track mode**: Linear boards (race games, score tracks) where zones form a chain. Must handle serpentine wrapping for long tracks and cycle breaking.
- **Grid mode**: Grid-based boards (chess, Go) where zones have `row`/`col` attributes. Falls back to square grid when attributes are missing.

These are explicitly-declared modes (`metadata.layoutMode: 'track'` or `'grid'`) and are never auto-detected.

Current codebase reality:
- `packages/runner/src/layout/compute-layout.ts` implements `graph` and `table`.
- `track` and `grid` branches currently throw placeholders.
- `packages/runner/test/layout/compute-layout.test.ts` still has placeholder throw assertions.

## What to Change

**Files (expected)**:
- `packages/runner/src/layout/compute-layout.ts` — add `computeTrackLayout()` and `computeGridLayout()` internals, replace dispatcher throws.
- `packages/runner/test/layout/compute-layout.test.ts` — replace placeholder throw tests and add track/grid behavior tests.
- `tickets/BOARDLAY-005-track-and-grid-layout-modes.md` — update assumptions/scope to match actual implementation state.

### Track Mode Algorithm (updated for robustness and determinism)

1. Build graph from board zones via `buildLayoutGraph()`.
2. **Find primary path starts**: Prefer degree-1 endpoints; if none exist (pure cycle), choose deterministic start by zone id.
3. **Deterministic traversal**: Build a stable track order via graph walk/BFS with lexical tie-breaking and visited dedupe.
4. **Serpentine placement**: For short tracks, use one row; for long tracks, wrap in serpentine rows.
5. **Branch handling**: Place unvisited branch nodes in nearby deterministic spill slots so no zones overlap and layout remains readable.
6. **Cycle handling**: Treat as deterministic broken cycle (same traversal/placement pipeline), without separate hardcoded game-specific logic.
7. Return `LayoutResult` with finite coordinates and non-overlapping positions.

### Grid Mode Algorithm (updated for partial metadata)

1. Inspect board zones for numeric `attributes.row` and `attributes.col`.
2. **Attributed zones**: Place at `(col * spacing, row * spacing)` in a normalized board coordinate system.
3. **Partial/missing metadata**: Fill unattributed zones into remaining deterministic grid cells (no overlap with attributed cells).
4. **No metadata fallback**: Arrange all zones in deterministic square grid.
5. Return `LayoutResult`.

### Dispatcher Update

Replace both placeholder throws with calls to `computeTrackLayout()` and `computeGridLayout()`.

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
3. **Cycle handling**: 6 zones forming a cycle produce stable, non-overlapping positions.
4. **Branch handling**: A chain with a branch places all nodes without overlap and preserves primary chain readability.
5. **Single node**: One zone placed at origin.
6. **mode field**: Result `mode` equals `'track'`.
7. **No overlap**: No two zone positions are identical.
8. **Dispatcher routes track mode**: `computeLayout(def, 'track')` produces `mode: 'track'`.

**Grid mode:**

9. **Row/col positioning**: Zones with `attributes.row: 0, col: 0` and `attributes.row: 0, col: 1` are placed in the same row, adjacent horizontally.
10. **Grid preserves row/col intent**: A 3x3 grid with row/col attributes produces 9 positions in a grid arrangement.
11. **Fallback without attributes**: Zones without row/col attributes are arranged in a square grid.
12. **Mixed attributes**: Zones with partial row/col attributes — attributed zones stay at declared cells, remaining zones fill available deterministic cells.
13. **mode field**: Result `mode` equals `'grid'`.
14. **Dispatcher routes grid mode**: `computeLayout(def, 'grid')` produces `mode: 'grid'`.

### Invariants

1. Both layout functions are pure — no side effects.
2. Track mode never auto-detects — only runs when explicitly requested.
3. Grid mode never auto-detects — only runs when explicitly requested.
4. Returned `LayoutResult` is immutable at the interface boundary (`ReadonlyMap` typing, no external mutation helpers).
5. No game-specific identifiers or hardcoded per-game branches are introduced.
6. `pnpm -F @ludoforge/runner test` and `pnpm -F @ludoforge/runner lint` pass.

## Outcome

- **Completion date**: 2026-02-19
- **What changed**:
  - Implemented `track` mode in `compute-layout.ts` with deterministic component traversal and serpentine wrapping.
  - Implemented `grid` mode in `compute-layout.ts` with row/col placement plus deterministic square-grid fallback for missing/partial metadata.
  - Replaced dispatcher placeholder throws for `track` and `grid`.
  - Replaced placeholder tests with behavior-based track/grid tests in `compute-layout.test.ts`.
- **Deviations from original plan**:
  - No separate special rectangle algorithm was added for cycles; cycle handling is unified under deterministic traversal + serpentine placement for cleaner, less brittle architecture.
  - Branch handling is deterministic spill placement via traversal order rather than explicit perpendicular spur geometry.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test -- compute-layout.test.ts` passed.
  - `pnpm turbo test` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm turbo lint` passed.
