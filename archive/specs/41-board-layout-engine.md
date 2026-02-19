# Spec 41: Board Layout Engine

**Status**: ✅ COMPLETED
**Priority**: P1
**Complexity**: M
**Dependencies**: Spec 38 (PixiJS Canvas Foundation)
**Roadmap**: [35-00-frontend-implementation-roadmap.md](./35-00-frontend-implementation-roadmap.md)
**Design doc**: [brainstorming/browser-based-game-runner.md](../brainstorming/browser-based-game-runner.md), Section 3

---

## Objective

Implement automatic board layout computation from the GameDef's zone adjacency graph. Distinguish **board zones** (spatial/game-map zones) from **aux zones** (decks, force pools, hands) via `zoneKind`. Support four layout modes — `graph`, `table`, `track`, `grid` — selected via the new `GameDef.metadata.layoutMode` field with auto-detection fallback. Position zones in 2D space without overlap, with visual connections showing adjacency.

**Success criteria**: Any compiled game's board auto-layouts to a readable 2D arrangement. FITL's ~40 board zones arrange in a connected map while aux zones sit in a sidebar. Texas Hold'em renders as a card table without graph layout. Games declaring `track` or `grid` modes get appropriate linear or grid layouts.

---

## Constraints

- Layout is computed **once per GameDef**, not per frame. Cache the result.
- Layout is **visual only** — zone positions do not affect gameplay.
- ForceAtlas2 is non-deterministic between runs. Accept this: layout is for visual convenience, not game mechanics.
- The layout engine must handle games with 0 adjacencies (table mode), few adjacencies (simple boards), and many adjacencies (complex maps).
- The engine's new `GameDef.metadata.layoutMode` field is an optional `'graph' | 'table' | 'track' | 'grid'` enum. When absent, the runner auto-detects `graph` (if any zone has adjacency) or `table` (otherwise). `track` and `grid` are never auto-detected; they must be explicitly declared.

---

## Architecture

```
GameDef.zones + adjacency + metadata.layoutMode
    |
    v
resolveLayoutMode(def) → 'graph' | 'table' | 'track' | 'grid'
    |
    v
Split zones by zoneKind:
  board zones → main layout area
  aux zones   → sidebar/margin layout
    |
    v
Board layout (dispatched by mode):
  graph → graphology + ForceAtlas2 (category/attribute seeding)
  table → circle/oval player arrangement
  track → topological ordering, serpentine wrap
  grid  → row/col attributes or square grid fallback
    |
    v
Aux zone sidebar layout (grouped by functional role)
    |
    v
Merged position map: Map<zoneId, { x, y }>
    |
    v
positionStore.setPositions(merged) → renderers
```

### Position Store Integration

**Current flow** (preserved as fallback):
```
GameCanvas selectZoneIDs → positionStore.setZoneIDs() → computeGridLayout() → renderers
```

**New flow**:
```
GameCanvas detects GameDef → getOrComputeLayout(def) → merge board+aux positions
  → positionStore.setPositions(merged) → renderers
```

- `setPositions()` already exists on `PositionStore` (line 110 of position-store.ts).
- `computeGridLayout()` remains as fallback when no GameDef is available.
- New subscription in `createGameCanvasRuntime` watches `gameDef` changes and triggers layout.

---

## Deliverables

### D1: Layout Engine Core + Graph Construction

**File**: `packages/runner/src/layout/build-layout-graph.ts`

- Filter zones by `zoneKind`: board zones go to graph, aux zones to sidebar.
- Build a graphology `Graph` from board zones + their `adjacentTo` edges.
- Export `resolveLayoutMode(def: GameDef): LayoutMode` — reads `def.metadata.layoutMode` or auto-detects:
  - Any zone has `adjacentTo` with length > 0 => `'graph'`
  - Otherwise => `'table'`
  - `'track'` and `'grid'` are never auto-detected; must be explicitly declared.
- Store node attributes (`category`, `attributes`, `visual`) for ForceAtlas2 clustering.

```typescript
import Graph from 'graphology';
import type { GameDef } from '@ludoforge/engine';

type LayoutMode = 'graph' | 'table' | 'track' | 'grid';

function resolveLayoutMode(def: GameDef): LayoutMode;
function buildLayoutGraph(def: GameDef): Graph;
function partitionZones(def: GameDef): { board: ZoneDef[]; aux: ZoneDef[] };
```

### D2: Layout Computation (ForceAtlas2 + Table + Track + Grid)

**File**: `packages/runner/src/layout/compute-layout.ts`

Unified dispatcher by `layoutMode`:

**Graph mode (ForceAtlas2)**:
- Initial position seeding from `category` and `attributes.country` (same-category zones start clustered, country maps to coarse quadrants).
- `forceAtlas2(graph, { iterations: 100 })` one-shot.
- Post-processing: normalize to bounding box, enforce minimum spacing, center on origin.
- `barnesHutOptimize: true` for 50+ nodes.

**Table mode**:
- Shared zones centered, player zones in circle/oval around perimeter.
- Extracted/refined from existing `computeGridLayout()`.

**Track mode**:
- Find chain endpoints (degree-1 nodes). BFS produces linear ordering.
- Serpentine wrapping for long tracks (>15 spaces).
- Branch spurs for non-linear nodes.
- Cycle handling: break at arbitrary point, lay out as rectangle.

**Grid mode**:
- Read `attributes.row`/`attributes.col` if present (from grid macros).
- Fallback to square grid arrangement.

```typescript
interface LayoutResult {
  readonly positions: Map<string, { x: number; y: number }>;
  readonly mode: LayoutMode;
  readonly boardBounds: { minX: number; minY: number; maxX: number; maxY: number };
}

function computeLayout(def: GameDef, mode: LayoutMode): LayoutResult;
```

### D3: Layout Caching

**File**: `packages/runner/src/layout/layout-cache.ts`

- Module-level `Map<string, LayoutResult>` keyed by `GameDef.metadata.id`.
- `getOrComputeLayout(def: GameDef): LayoutResult`.
- `clearLayoutCache()` for game changes.

### D4: Aux Zone Sidebar Layout

**File**: `packages/runner/src/layout/aux-zone-layout.ts`

Position aux zones in sidebar/margin areas:

- **Grouping heuristic** (inferred from GameDef, no visual config needed):
  - Card zones: `ordering: 'stack'` without adjacency
  - Force pools: IDs matching `available-*`, `out-of-play-*`, `casualties-*`
  - Hand zones: player-owned aux zones
  - Other: remaining aux zones
- Groups stacked vertically to the right of the board bounding box.
- Each group has a label and compact column layout within.

```typescript
interface AuxLayoutResult {
  readonly positions: Map<string, { x: number; y: number }>;
  readonly groups: readonly { label: string; zoneIds: readonly string[] }[];
}

function computeAuxLayout(
  auxZones: readonly ZoneDef[],
  boardBounds: { minX: number; minY: number; maxX: number; maxY: number }
): AuxLayoutResult;
```

---

## Verification

- [ ] `resolveLayoutMode()` returns `'graph'` for FITL GameDef (has adjacency, no explicit mode)
- [ ] `resolveLayoutMode()` returns `'table'` for Texas Hold'em GameDef (no adjacency, no explicit mode)
- [ ] `resolveLayoutMode()` returns declared mode when `metadata.layoutMode` is set
- [ ] FITL board zones (~40) auto-layout to a connected map with readable spacing
- [ ] FITL aux zones (force pools, card decks) positioned in sidebar, grouped by role
- [ ] Adjacency lines connect the correct zones after layout
- [ ] Texas Hold'em renders as a card table (player zones in circle, shared zones in center)
- [ ] Layout is computed once and cached (no recomputation on state changes)
- [ ] `clearLayoutCache()` enables recomputation after game change
- [ ] Games with different zone counts (5, 40, 100+) produce readable layouts
- [ ] Track mode produces linear layout for sequential zone chains
- [ ] Grid mode arranges zones by row/col attributes when present
- [ ] Position store integration: `setPositions()` receives merged board+aux positions

---

## Out of Scope

- Zone style hints (moved to Spec 42 D-NEW-1)
- Layout hints from visual config — region groupings, position constraints, fixed positions (moved to Spec 42 D-NEW-2)
- Token stacking within zones (moved to Spec 42 D-NEW-3)
- Adjacency highlighting for target selection (already implemented in `derive-render-model.ts` via `deriveHighlightedAdjacencyKeys` and adjacency renderer)
- Pan/zoom to fit (already implemented in `viewport-setup.ts`; position store changes auto-trigger `updateWorldBounds()` in canvas-updater.ts)
- Minimap overlay (future enhancement)
- Animated layout transitions (zones settling into position)
- Manual zone position editing by the user
- 3D or isometric board rendering
- Per-game visual config creation (Spec 42)

---

## Outcome

- **Completed**: 2026-02-19
- **Implemented changes**:
  - Added a generic board layout pipeline in the runner with mode resolution (`graph`/`table`/`track`/`grid`), board/aux partitioning, graph construction, per-mode layout computation, and aux sidebar placement.
  - Integrated layout caching (`getOrComputeLayout`, `clearLayoutCache`) and GameCanvas position-store application via `setPositions()` with merged board+aux coordinates.
  - Added/updated runner layout test coverage across graph/table/track/grid dispatch, layout mode resolution, partitioning, cache behavior, aux grouping/layout, and canvas integration points.
- **Deviations from original plan**:
  - Aux force-pool grouping defaults to explicit `layoutRole: 'forcePool'` semantics rather than inferring solely from zone-id patterns.
- **Verification**:
  - Layout-focused runner tests pass, including `build-layout-graph`, `compute-layout`, `aux-zone-layout`, and `layout-cache` suites.
  - GameCanvas integration tests pass with layout cache wiring.
