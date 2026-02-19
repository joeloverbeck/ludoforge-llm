# BOARDLAY-003: Graph Layout Computation via ForceAtlas2

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: No
**Deps**: Existing `packages/runner/src/layout/build-layout-graph.ts` + `packages/runner/src/layout/layout-types.ts` (already present in repo)

## Problem

The primary layout mode for games with spatial adjacency (like FITL's ~40 board zones) is force-directed graph layout. ForceAtlas2 arranges connected zones into readable spatial clusters while respecting adjacency relationships. This ticket implements graph-mode layout and establishes the `computeLayout()` dispatcher scaffold that subsequent tickets (BOARDLAY-004, BOARDLAY-005) will extend.

This corresponds to Spec 41 deliverable D2 (graph mode portion), implemented on top of the already-landed D1 core pieces (`resolveLayoutMode`, `partitionZones`, `buildLayoutGraph`, `LayoutMode`/`LayoutResult` types).

## Assumption Reassessment (2026-02-19)

1. Dependency ticket IDs `BOARDLAY-001` and `BOARDLAY-002` do not exist in `tickets/`; their intended outputs already exist as source + tests.
2. `buildLayoutGraph()` currently accepts board zones directly (`buildLayoutGraph(boardZones)`), not a full `GameDef`; this ticket must consume that existing API.
3. `LayoutMode` and `LayoutResult` already exist in `packages/runner/src/layout/layout-types.ts`; this ticket should reuse them.
4. Architecture should remain game-agnostic: hardcoded attribute keys like `attributes.country` are not required for a robust graph layout and should not be relied upon.

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
3. **Initial position seeding (generic, deterministic)**:
   - Group nodes by `category` when present to encourage cluster locality.
   - Use deterministic pseudo-jitter derived from node IDs (not `Math.random`) so test assertions are stable.
   - Do not depend on game-specific attribute names (`country`, etc.).
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

### Architectural Intent

- Keep the dispatcher as the single stable entry point for board layout computation.
- Keep mode implementations isolated so BOARDLAY-004/005 can add table/track/grid without touching graph internals.
- Prefer deterministic computation where practical to improve reproducibility and testability, even though exact ForceAtlas2 output is not guaranteed between environments.

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
10. **Deterministic seeding baseline**: For the same input GameDef, pre-ForceAtlas2 seeded coordinates are stable (no `Math.random` dependency).
11. **Empty board zones**: Graph mode with 0 board zones returns empty positions map and zero-area bounds.
12. **Dispatcher routes graph mode**: `computeLayout(def, 'graph')` calls graph layout, not table/track/grid.

### Invariants

1. `computeLayout()` is a pure function — no side effects, no mutation.
2. The returned `LayoutResult` follows readonly typing contracts (`ReadonlyMap`, readonly bounds object shape).
3. Existing source files may be modified if required for clean integration; changes must remain layout-module scoped.
4. `pnpm turbo build` and `pnpm -F @ludoforge/runner test` pass.
5. ForceAtlas2 runs as a one-shot (synchronous `forceAtlas2()`, not the async worker variant).

## Outcome

- **Completion date**: 2026-02-19
- **What was changed**:
  - Added `packages/runner/src/layout/compute-layout.ts` with:
    - `computeLayout(def, mode)` dispatcher.
    - Graph-mode implementation (`partitionZones` + `buildLayoutGraph` + deterministic seeding + ForceAtlas2 one-shot + normalization + min-spacing + centering + bounds).
    - Placeholder throws for `table`, `track`, and `grid` modes for follow-up tickets.
  - Added `packages/runner/test/layout/compute-layout.test.ts` covering dispatcher behavior, graph layout output validity, spacing, centering, empty/single/disconnected edge cases, Barnes-Hut threshold behavior, and random-independence.
- **Deviations from original plan**:
  - Replaced proposed `attributes.country` seeding with deterministic, game-agnostic seeding to avoid game-specific coupling and keep the layout engine extensible.
  - Updated assumptions to reflect that D1 prerequisites already existed in repository code (not missing dependency tickets).
- **Verification results**:
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm turbo build` passed.
  - `pnpm turbo lint` passed.
  - `pnpm turbo test` passed.
