# Spec 07: Board-as-Graph Spatial Model

**Status**: Draft
**Priority**: P1 (required for MVP)
**Complexity**: M
**Dependencies**: Spec 04, Spec 05, Spec 06
**Estimated effort**: 2-3 days
**Source sections**: Brainstorming section 5

## Overview

Implement the spatial layer: zones serve double duty as containers (for tokens/cards) AND spatial nodes in a graph topology. This enables route building, area control, piece movement, and tile placement without a separate Board type. This spec extends Spec 04 (spatial queries/conditions), Spec 05 (moveTokenAdjacent effect), and provides board generation macros (grid, hex) used by the compiler (Spec 08b).

## Scope

### In Scope
- Adjacency graph construction from ZoneDef `adjacentTo` arrays
- Adjacency graph validation (symmetry check)
- Spatial condition implementations: `adjacent`, `connected`
- Spatial effect implementation: `moveTokenAdjacent`
- Spatial query implementations: `adjacentZones`, `tokensInAdjacentZones`, `connectedZones`
- Bounded graph traversal (BFS) for `connectedZones`
- Board generation macros: `grid(rows, cols)` → 4-connected zones, `hex(radius)` → 6-connected zones

### Out of Scope
- Named directions (N/S/E/W) — implicit from adjacency is sufficient
- Rotation / symmetry detection
- Complex geometry (triangular, star graphs)
- Unbounded pathfinding (use bounded `forEach` over adjacency instead)
- Line-of-sight / visibility graphs
- Continuous space / coordinate-based movement
- Multi-level boards (Z-axis)
- Edge weights / weighted adjacency

## Key Types & Interfaces

### Adjacency Graph

```typescript
interface AdjacencyGraph {
  readonly neighbors: Readonly<Record<string, readonly ZoneId[]>>;
  // neighbors[zoneId] → list of adjacent zone IDs
}

// Build adjacency graph from zone definitions
function buildAdjacencyGraph(zones: readonly ZoneDef[]): AdjacencyGraph;

// Validate graph consistency (symmetry check)
function validateAdjacency(
  graph: AdjacencyGraph,
  zones: readonly ZoneDef[]
): readonly Diagnostic[];
```

### Spatial Queries (extending Spec 04)

```typescript
// Get zones adjacent to the given zone
function queryAdjacentZones(
  graph: AdjacencyGraph,
  zone: ZoneId
): readonly ZoneId[];

// Get all tokens in zones adjacent to the given zone
function queryTokensInAdjacentZones(
  graph: AdjacencyGraph,
  state: GameState,
  zone: ZoneId
): readonly Token[];

// Get all zones reachable from the given zone within bounded traversal
function queryConnectedZones(
  graph: AdjacencyGraph,
  state: GameState,
  zone: ZoneId,
  via?: ConditionAST,
  maxDepth?: number  // default: total zone count (bounded by graph size)
): readonly ZoneId[];
```

### Spatial Conditions (extending Spec 04)

```typescript
// Check if zone A is adjacent to zone B
function evalAdjacentCondition(
  graph: AdjacencyGraph,
  zoneA: ZoneId,
  zoneB: ZoneId
): boolean;

// Check if zone A is connected to zone B (optionally via path satisfying condition)
function evalConnectedCondition(
  graph: AdjacencyGraph,
  state: GameState,
  zoneA: ZoneId,
  zoneB: ZoneId,
  via?: ConditionAST,
  ctx?: EvalContext
): boolean;
```

### Spatial Effects (extending Spec 05)

```typescript
// Move token to an adjacent zone
function applyMoveTokenAdjacent(
  effect: { moveTokenAdjacent: { token: TokenSel; from: ZoneSel; direction?: string } },
  ctx: EffectContext,
  graph: AdjacencyGraph
): EffectResult;
```

### Board Generation Macros

```typescript
// Generate a grid of zones with 4-connectivity
function generateGrid(rows: number, cols: number): readonly ZoneDef[];

// Generate hex-grid zones with 6-connectivity
function generateHex(radius: number): readonly ZoneDef[];
```

## Implementation Requirements

### Adjacency Graph Construction

`buildAdjacencyGraph(zones)`:
1. For each zone with `adjacentTo` defined, add edges
2. Store as a `Record<ZoneId, ZoneId[]>`
3. Zones without `adjacentTo` have empty neighbor lists (isolated nodes)

`validateAdjacency(graph, zones)`:
1. For each zone A that lists zone B as adjacent, verify B also lists A
2. If asymmetric: produce warning diagnostic with path and suggestion to add missing edge
3. Verify all referenced zone IDs in `adjacentTo` actually exist in the zone list
4. If dangling reference: produce error diagnostic with alternatives (fuzzy match)

### connectedZones — Bounded BFS

`queryConnectedZones(graph, state, startZone, via?, maxDepth?)`:

1. Initialize BFS queue with `startZone`, visited set with `startZone`
2. Set `maxDepth` to `min(maxDepth ?? zones.length, zones.length)` — always bounded by graph size
3. BFS loop:
   - Dequeue zone
   - For each neighbor not in visited:
     - If `via` condition present: evaluate condition with neighbor zone in context. Skip if false.
     - Add neighbor to visited and queue
   - Track depth; stop when depth exceeds `maxDepth`
4. Return all visited zones (excluding start zone, or including — document the choice)

**Termination guarantee**: BFS visits each zone at most once. Graph size is finite. Depth is bounded. Therefore `connectedZones` always terminates.

### moveTokenAdjacent

`applyMoveTokenAdjacent(effect, ctx, graph)`:

1. Resolve `token` from bindings
2. Resolve `from` zone
3. Determine destination:
   - If `direction` specified: look up direction as neighbor index or zone ID
   - If no direction: destination must be resolved from move params (agent chose adjacent zone)
4. Validate destination is in `graph.neighbors[from]` — error if not adjacent
5. Remove token from source, add to destination
6. Return new state

### Board Generation: grid(rows, cols)

Generate `rows * cols` zones with 4-connected adjacency:

1. Zone naming: `cell_R_C` where R is row (0-indexed), C is column (0-indexed)
2. Adjacency: each cell connects to up/down/left/right neighbors (if they exist)
   - `cell_R_C` → `cell_{R-1}_C` (up, if R > 0)
   - `cell_R_C` → `cell_{R+1}_C` (down, if R < rows-1)
   - `cell_R_C` → `cell_R_{C-1}` (left, if C > 0)
   - `cell_R_C` → `cell_R_{C+1}` (right, if C < cols-1)
3. All zones: `owner: 'none'`, `visibility: 'public'`, `ordering: 'set'`
4. Adjacency is symmetric by construction

**Neighbor counts**:
- Corner: 2 neighbors
- Edge: 3 neighbors
- Interior: 4 neighbors

### Board Generation: hex(radius)

Generate hex-grid zones with 6-connected adjacency using axial coordinates:

1. Use axial coordinate system (q, r) where center is (0, 0)
2. Generate all hexes within `radius` of center: `|q| <= radius && |r| <= radius && |q + r| <= radius`
3. Zone naming: `hex_Q_R` (with negative values: `hex_n1_2` for q=-1, r=2)
4. Adjacency: each hex connects to 6 neighbors:
   - (q+1, r), (q-1, r)
   - (q, r+1), (q, r-1)
   - (q+1, r-1), (q-1, r+1)
5. Only include neighbors that exist in the grid
6. All zones: `owner: 'none'`, `visibility: 'public'`, `ordering: 'set'`

**Zone count formula**: `3 * radius * (radius + 1) + 1` for radius >= 0

### Integration with Existing Specs

**Spec 04 extension**: Replace the `SpatialNotImplementedError` stubs in `evalQuery` with calls to the spatial query functions. The integration point is the `evalQuery` function — it needs access to the `AdjacencyGraph` (passed via `EvalContext` or a parallel parameter).

**Spec 05 extension**: Replace the `SpatialNotImplementedError` stub in `applyEffect` for `moveTokenAdjacent` with the actual implementation. The `AdjacencyGraph` must be accessible from the `EffectContext`.

**Context threading**: The `AdjacencyGraph` is built once from the GameDef (during `initialState` or on first use) and cached. It does not change during gameplay. Thread it through `EvalContext` and `EffectContext`:

```typescript
// Extended context (add to existing EvalContext/EffectContext)
interface SpatialContext {
  readonly adjacencyGraph: AdjacencyGraph;
}
```

## Invariants

1. Adjacency graph is undirected: if A adjacent to B, then B adjacent to A (validated at load time)
2. `adjacentZones` query returns exactly the zones listed in the zone's `adjacentTo` array
3. `connectedZones` traversal terminates within bounded depth (always <= total zone count)
4. `connectedZones` never visits same zone twice (BFS visited set)
5. `moveTokenAdjacent` only moves to adjacent zones (rejects non-adjacent destinations)
6. `grid(R, C)` produces exactly `R * C` zones with correct 4-connectivity
7. `hex(radius)` produces exactly `3 * radius * (radius + 1) + 1` zones with correct 6-connectivity
8. Board macros produce valid ZoneDef arrays (all `adjacentTo` references are valid zone IDs)
9. All adjacency constructed by macros is symmetric (no validation warnings)
10. Isolated zones (no `adjacentTo`) have empty neighbor lists, not missing entries

## Required Tests

### Unit Tests

**Adjacency graph**:
- Build graph from 3 zones with mutual adjacency → correct neighbors
- Build graph from zone with no adjacentTo → empty neighbor list
- Validate symmetric adjacency → no warnings
- Validate asymmetric adjacency (A→B but not B→A) → warning diagnostic
- Validate dangling reference (zone references nonexistent zone) → error diagnostic

**Spatial conditions**:
- `adjacent(A, B)` where A and B are adjacent → true
- `adjacent(A, C)` where A and C are not adjacent → false
- `connected(A, C)` where A-B-C path exists → true
- `connected(A, D)` where no path exists → false
- `connected(A, C, via)` where path exists but via condition fails → false

**connectedZones**:
- Linear graph A-B-C-D: from A → returns [B, C, D]
- Linear graph A-B-C-D: from A, maxDepth=1 → returns [B]
- Graph with cycle A-B-C-A: from A → returns [B, C] (no duplicates)
- Disconnected graph: from A → only returns connected component
- Empty adjacency: from A → returns [] (just start zone, or empty)

**tokensInAdjacentZones**:
- Zone A has neighbors B, C; B has 2 tokens, C has 1 → returns 3 tokens

**moveTokenAdjacent**:
- Move token from A to adjacent B → token in B, removed from A
- Move token from A to non-adjacent C → error thrown
- Move token from A when A has no neighbors → error (no valid destination)

**grid(3, 3)** (9 zones):
- Produces 9 zones named cell_0_0 through cell_2_2
- Corner cell_0_0 has exactly 2 neighbors: cell_0_1, cell_1_0
- Edge cell_0_1 has exactly 3 neighbors: cell_0_0, cell_0_2, cell_1_1
- Center cell_1_1 has exactly 4 neighbors
- All adjacencies are symmetric

**grid(1, 1)**: Single zone with no neighbors

**grid(2, 3)**: 6 zones with correct connectivity

**hex(0)**: 1 zone (center only), no neighbors

**hex(1)**: 7 zones, center has 6 neighbors, outer ring each has 3 neighbors

**hex(2)**: 19 zones with correct 6-connectivity

### Integration Tests

- Build grid(3,3), place tokens on several cells, run `connectedZones` from corner → correct reachable set
- Build hex(2), verify `tokensInAdjacentZones` for center zone returns tokens from all 6 neighbors

### Property Tests

- For any `grid(R, C)` where R,C >= 1: all adjacencies are symmetric
- For any `grid(R, C)`: zone count equals R * C
- For any `hex(radius)` where radius >= 0: zone count equals `3 * radius * (radius + 1) + 1`
- For any `hex(radius)`: all adjacencies are symmetric
- `connectedZones` from any zone returns a subset of all zones (no invented zones)
- `connectedZones` never contains duplicates

### Golden Tests

- `grid(3, 3)` → expected zone definitions with exact adjacency lists
- `hex(1)` → expected 7 zone definitions with exact adjacency lists

## Acceptance Criteria

- [ ] Adjacency graph builds correctly from ZoneDefs
- [ ] Asymmetric adjacency detected and reported as warning
- [ ] Dangling adjacency references detected and reported as error
- [ ] `adjacent` condition works correctly
- [ ] `connected` condition works with optional `via` filter
- [ ] `connectedZones` BFS terminates and handles cycles
- [ ] `moveTokenAdjacent` validates adjacency before moving
- [ ] `grid(R, C)` produces correct 4-connected zones
- [ ] `hex(radius)` produces correct 6-connected zones
- [ ] Spatial stubs from Spec 04/05 are replaced with real implementations
- [ ] `AdjacencyGraph` is accessible from evaluation and effect contexts
- [ ] All macro-generated adjacency is symmetric (no validation warnings on macro output)

## Files to Create/Modify

```
src/kernel/spatial.ts            # NEW — adjacency graph, spatial queries, spatial conditions
src/kernel/board-macros.ts       # NEW — grid and hex generation macros
src/kernel/eval-query.ts         # MODIFY — replace spatial stubs with real implementations
src/kernel/effects.ts            # MODIFY — replace moveTokenAdjacent stub
src/kernel/eval-context.ts       # MODIFY — add AdjacencyGraph to context types
src/kernel/effect-context.ts     # MODIFY — add AdjacencyGraph to context types
src/kernel/index.ts              # MODIFY — re-export spatial APIs
test/unit/spatial.test.ts        # NEW — adjacency graph and spatial query tests
test/unit/board-macros.test.ts   # NEW — grid and hex generation tests
test/unit/spatial-conditions.test.ts   # NEW — adjacent/connected condition tests
test/unit/spatial-effects.test.ts      # NEW — moveTokenAdjacent tests
test/integration/spatial-game.test.ts  # NEW — spatial model in game context
```
