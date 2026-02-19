# BOARDLAY-003: Graph Layout Computation via ForceAtlas2

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: No
**Deps**: BOARDLAY-001 (graphology deps), BOARDLAY-002 (buildLayoutGraph, partitionZones)

## Problem

The primary layout mode for games with spatial adjacency (like FITL's ~40 board zones) is force-directed graph layout. ForceAtlas2 arranges connected zones into readable spatial clusters while respecting adjacency relationships. This ticket implements graph-mode layout and establishes the `computeLayout()` dispatcher scaffold that subsequent tickets (BOARDLAY-004, BOARDLAY-005) will extend.

This corresponds to Spec 41 deliverable D2 (graph mode portion).

## What to Change

**Files (expected)**:
- `packages/runner/src/layout/compute-layout.ts` — create with `computeLayout()` dispatcher + `computeGraphLayout()` internal
- `packages/runner/test/layout/compute-layout.test.ts` — unit tests for graph mode

### Function Signatures

```typescript
import type { GameDef } from '@ludoforge/engine';
import type { LayoutMode, LayoutResult } from './layout-types';

function computeLayout(def: GameDef, mode: LayoutMode): LayoutResult;
```

### Graph Mode Algorithm

1. Call `partitionZones(def)` → get board zones.
2. Call `buildLayoutGraph(boardZones)` → get graphology graph.
3. **Initial position seeding**:
   - Group nodes by `category`. Assign each category a coarse angular sector.
   - Within each category, apply small random jitter to initial positions.
   - If `attributes.country` exists, use it for coarse quadrant positioning.
4. **ForceAtlas2 one-shot**: `forceAtlas2(graph, { iterations: 100 })`.
   - Enable `barnesHutOptimize: true` when node count >= 50.
5. **Post-processing**:
   - Normalize positions to a bounding box (preserve aspect ratio).
   - Enforce minimum spacing between nodes (shift overlapping nodes apart).
   - Center layout on origin (0, 0).
6. Extract positions from graph nodes → build `LayoutResult`.

### Dispatcher Scaffold

`computeLayout()` switches on `mode`:
- `'graph'` → call `computeGraphLayout()`
- `'table'` → throw `Error('Table layout not yet implemented')` (BOARDLAY-004)
- `'track'` → throw `Error('Track layout not yet implemented')` (BOARDLAY-005)
- `'grid'` → throw `Error('Grid layout not yet implemented')` (BOARDLAY-005)

The throws are temporary placeholders; subsequent tickets replace them.

## Out of Scope

- Table layout mode (BOARDLAY-004)
- Track and grid layout modes (BOARDLAY-005)
- Aux zone sidebar layout (BOARDLAY-006)
- Layout caching (BOARDLAY-007)
- GameCanvas integration (BOARDLAY-008)
- Any engine package changes
- Position store modifications
- Deterministic layout reproducibility (ForceAtlas2 is inherently non-deterministic — accepted per Spec 41 constraints)

## Acceptance Criteria

### Specific Tests That Must Pass

1. **Graph layout produces positions for all board zones**: Given a GameDef with N board zones, the result `positions` map has exactly N entries with the correct zone IDs.
2. **Positions are finite numbers**: All x and y values are finite (not NaN, not Infinity).
3. **Minimum spacing respected**: No two zone positions are closer than a configurable minimum distance (e.g., 60 units).
4. **Layout is centered**: The centroid of all positions is approximately (0, 0) (within tolerance).
5. **Bounding box is populated**: `boardBounds` has valid minX < maxX and minY < maxY.
6. **mode field is 'graph'**: Result `mode` equals `'graph'`.
7. **Single-node graph**: GameDef with one board zone produces valid positions (at origin).
8. **Disconnected components**: GameDef with two disconnected clusters produces positions for all zones (no zones lost).
9. **barnesHutOptimize for large graphs**: When node count >= 50, ForceAtlas2 runs with Barnes-Hut optimization (verified via mock or integration).
10. **Category seeding groups related zones**: Zones with the same `category` start closer together than zones with different categories (probabilistic — tested with large enough margin).
11. **Empty board zones**: Graph mode with 0 board zones returns empty positions map and zero-area bounds.
12. **Dispatcher routes graph mode**: `computeLayout(def, 'graph')` calls graph layout, not table/track/grid.

### Invariants

1. `computeLayout()` is a pure function — no side effects, no mutation.
2. The returned `LayoutResult` is immutable (readonly map, readonly bounds).
3. No existing source files are modified.
4. `pnpm turbo build` and `pnpm -F @ludoforge/runner test` pass.
5. ForceAtlas2 runs as a one-shot (synchronous `forceAtlas2()`, not the async worker variant).
