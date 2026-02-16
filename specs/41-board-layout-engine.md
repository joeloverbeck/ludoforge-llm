# Spec 41: Board Layout Engine

**Status**: ACTIVE
**Priority**: P1
**Complexity**: M
**Dependencies**: Spec 38 (PixiJS Canvas Foundation)
**Roadmap**: [35-00-frontend-implementation-roadmap.md](./35-00-frontend-implementation-roadmap.md)
**Design doc**: [brainstorming/browser-based-game-runner.md](../brainstorming/browser-based-game-runner.md), Section 3

---

## Objective

Implement automatic board layout computation from the GameDef's zone adjacency graph using graphology + ForceAtlas2. Position zones in 2D space without overlap, with visual connections showing adjacency. Support table-only mode for games without spatial adjacency.

**Success criteria**: Any compiled game's board auto-layouts to a readable 2D arrangement. FITL's ~40 zones arrange in a connected map. Texas Hold'em renders as a card table without graph layout.

---

## Constraints

- Layout is computed **once per GameDef**, not per frame. Cache the result.
- Layout is **visual only** — zone positions do not affect gameplay.
- ForceAtlas2 is non-deterministic between runs. Accept this: layout is for visual convenience, not game mechanics.
- The layout engine must handle games with 0 adjacencies (table mode), few adjacencies (simple boards), and many adjacencies (complex maps).

---

## Architecture

```
GameDef.zones + adjacency
    |
    v
graphology Graph construction
    |
    v
ForceAtlas2 one-shot layout (if adjacencies exist)
    OR
Table layout (if no adjacencies)
    |
    v
Position map: Map<zoneId, { x, y }>
    |
    v
Cached in Zustand store or module-level cache
    |
    v
Canvas zone renderer uses positions
```

---

## Deliverables

### D1: Graph Construction from GameDef

`packages/runner/src/layout/build-zone-graph.ts`

Build a graphology `Graph` from the GameDef:

- Each zone becomes a node with attributes: `{ id, name, type, metadata }`.
- Each adjacency relationship becomes an undirected edge.
- Zone metadata (type, size hints) stored as node attributes for layout influence.

```typescript
import Graph from 'graphology';

function buildZoneGraph(def: GameDef): Graph;
```

### D2: ForceAtlas2 Layout Computation

`packages/runner/src/layout/compute-layout.ts`

Run ForceAtlas2 on the graph to compute zone positions:

```typescript
import forceAtlas2 from 'graphology-layout-forceatlas2';

function computeLayout(graph: Graph, options?: LayoutOptions): Map<string, { x: number; y: number }>;
```

**Configuration**:
- `iterations`: 100 (one-shot, not iterative animation)
- `settings.gravity`: Moderate (keep zones from flying apart)
- `settings.scalingRatio`: Adjusted based on zone count
- `settings.barnesHutOptimize`: true for graphs with 50+ nodes

**Post-processing**:
- Normalize positions to fit within a target bounding box (e.g., 2000x2000 world units).
- Apply minimum spacing between zones (prevent overlap).
- Center the layout around origin (0, 0).

### D3: Position Caching

`packages/runner/src/layout/layout-cache.ts`

- Compute layout once per GameDef, cache by GameDef hash or ID.
- Return cached positions on subsequent calls with same GameDef.
- Cache stored in module-level variable (cleared on game change).

### D4: Table-Only Mode Detection

`packages/runner/src/layout/table-layout.ts`

When no adjacency exists in the GameDef, use a card table layout:

- Detect table mode: `graph.size === 0` (no edges).
- Position player zones in a circle/oval around a center area.
- Center area holds shared zones (community cards, pot, deck, discard).
- Player zones spaced evenly around the perimeter.
- Human player's zone at the bottom center.

```typescript
function computeTableLayout(def: GameDef, humanPlayerID: string): Map<string, { x: number; y: number }>;
```

### D5: Zone Type Styling Hints

`packages/runner/src/layout/zone-style.ts`

Provide sizing and shape hints based on zone metadata:

- Different zone types get different default sizes (e.g., city zones larger than LoC zones).
- Stack zones (decks) rendered smaller.
- Set zones (hands, map spaces) rendered larger based on expected token count.
- These hints influence both the layout algorithm (node size → ForceAtlas2 settings) and the renderer.

### D6: Zone Layout Hints from Visual Config

`packages/runner/src/layout/apply-layout-hints.ts`

If a per-game visual config (Spec 42) provides layout hints, apply them:

- **Region groupings**: Zones assigned to a region are attracted to each other in the layout (modify ForceAtlas2 gravity or use initial position seeding).
- **Position constraints**: "This zone should be top-left" → set initial position before layout.
- **Fixed positions**: Some zones can be manually positioned, bypassing auto-layout.

If no visual config exists, this module is a no-op pass-through.

### D7: Token Stacking Within Zones

`packages/runner/src/layout/token-stacking.ts`

Compute token positions within a zone:

- **Few tokens (1–6)**: Spread evenly within zone bounds, slight overlap for cards.
- **Moderate tokens (7–12)**: Group by owner/faction, show group with count.
- **Many tokens (13+)**: Show faction-grouped stacks with count badges. Click-to-expand reveals individual tokens in a popup or zoomed view.

```typescript
interface TokenLayout {
  readonly tokenID: string;
  readonly localX: number;    // Position relative to zone center
  readonly localY: number;
  readonly scale: number;     // Scale down for crowded zones
  readonly groupID: string | null;  // Faction/owner group
}

function computeTokenStacking(
  zone: RenderZone,
  tokens: readonly RenderToken[]
): readonly TokenLayout[];
```

### D8: Adjacency Highlighting for Target Selection

`packages/runner/src/layout/adjacency-highlight.ts`

When a choice requires selecting adjacent zones:

- Given a source zone and the adjacency graph, compute the set of adjacent zone IDs.
- Mark those zones as `isHighlighted` in the RenderModel (or provide a highlight overlay).
- Non-adjacent zones are visually muted (reduced alpha).

### D9: Pan/Zoom to Fit

`packages/runner/src/layout/fit-board.ts`

On initial load or game change:

- Compute bounding box of all zone positions.
- Set viewport to fit the entire board with margin.
- Use pixi-viewport's `fit()` or `moveCenter()` + `setZoom()`.

---

## Verification

- [ ] FITL zones (~40) auto-layout to a connected map with readable spacing
- [ ] Adjacency lines connect the correct zones after layout
- [ ] Texas Hold'em renders as a card table (player zones in circle, shared zones in center)
- [ ] Layout is computed once and cached (no recomputation on state changes)
- [ ] Token stacking shows grouped tokens with counts for crowded zones
- [ ] Adjacent zones highlight when a choice requires zone selection
- [ ] Board fits viewport on initial load
- [ ] Pan/zoom works correctly with auto-layout positions
- [ ] Games with different zone counts (5, 40, 100+) produce readable layouts

---

## Out of Scope

- Minimap overlay (future enhancement)
- Animated layout transitions (zones settling into position)
- Manual zone position editing by the user
- 3D or isometric board rendering
- Per-game visual config creation (Spec 42)
