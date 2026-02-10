# Spec 07: Board-as-Graph Spatial Model

**Status**: ✅ COMPLETED
**Priority**: P1 (required for MVP)
**Complexity**: M
**Dependencies**: Spec 04, Spec 05, Spec 06
**Estimated effort**: 2-3 days
**Source sections**: Brainstorming section 5

## Overview

Implement the spatial layer: zones serve double duty as containers (for tokens/cards) and spatial nodes in a graph topology. This enables route building, area control, piece movement, and tile placement without a separate board type.

This spec extends:
- Spec 04: spatial queries/conditions
- Spec 05: `moveTokenAdjacent`
- Spec 08b: board generation macros (`grid`, `hex`)

This revision hardens the spatial contract for deterministic behavior, bounded execution, and cross-spec consistency.

## Scope

### In Scope
- Adjacency graph construction from `ZoneDef.adjacentTo`
- Adjacency graph normalization and validation
- Spatial query implementations: `adjacentZones`, `tokensInAdjacentZones`, `connectedZones`
- Spatial condition implementations: `adjacent`, `connected`
- Spatial effect implementation: `moveTokenAdjacent`
- Bounded BFS traversal for `connectedZones`
- Deterministic ordering rules for all spatial query outputs
- Compiler-facing board generation macros: `grid(rows, cols)` and `hex(radius)`
- Spatial diagnostics for malformed topologies and invalid destinations

### Out of Scope
- Named compass directions (`N/S/E/W`) as engine primitives
- Rotation/symmetry detection
- Weighted edges
- Line-of-sight and visibility graphs
- Continuous coordinates/geometry physics
- Multi-level boards (Z-axis)
- General shortest-path APIs

## Cross-Spec Contract Updates

### Required type/schema delta (to align with spatial conditions)

Spec 07 requires extending `ConditionAST` with two spatial operators. This is a post-completion contract patch against the Spec 02 type/schema baseline:

```typescript
type ConditionAST =
  | { readonly op: 'and'; readonly args: readonly ConditionAST[] }
  | { readonly op: 'or'; readonly args: readonly ConditionAST[] }
  | { readonly op: 'not'; readonly arg: ConditionAST }
  | {
      readonly op: '==' | '!=' | '<' | '<=' | '>' | '>=';
      readonly left: ValueExpr;
      readonly right: ValueExpr;
    }
  | { readonly op: 'in'; readonly item: ValueExpr; readonly set: ValueExpr }
  | { readonly op: 'adjacent'; readonly left: ZoneSel; readonly right: ZoneSel }
  | {
      readonly op: 'connected';
      readonly from: ZoneSel;
      readonly to: ZoneSel;
      readonly via?: ConditionAST;
      readonly maxDepth?: number;
    };
```

`schemas.ts` must mirror this union exactly.

## Key Types & Interfaces

### Adjacency Graph

```typescript
interface AdjacencyGraph {
  readonly neighbors: Readonly<Record<string, readonly ZoneId[]>>;
  readonly zoneCount: number;
}

function buildAdjacencyGraph(zones: readonly ZoneDef[]): AdjacencyGraph;

function validateAdjacency(graph: AdjacencyGraph, zones: readonly ZoneDef[]): readonly Diagnostic[];
```

### Spatial Query APIs (Spec 04 extension)

```typescript
interface ConnectedQueryOptions {
  readonly includeStart?: boolean; // default false
  readonly maxDepth?: number; // default zoneCount - 1
}

function queryAdjacentZones(graph: AdjacencyGraph, zone: ZoneId): readonly ZoneId[];

function queryTokensInAdjacentZones(
  graph: AdjacencyGraph,
  state: GameState,
  zone: ZoneId,
): readonly Token[];

function queryConnectedZones(
  graph: AdjacencyGraph,
  state: GameState,
  zone: ZoneId,
  evalCtx: EvalContext,
  via?: ConditionAST,
  options?: ConnectedQueryOptions,
): readonly ZoneId[];
```

### Spatial Condition APIs

```typescript
function evalAdjacentCondition(
  graph: AdjacencyGraph,
  left: ZoneId,
  right: ZoneId,
): boolean;

function evalConnectedCondition(
  graph: AdjacencyGraph,
  state: GameState,
  from: ZoneId,
  to: ZoneId,
  evalCtx: EvalContext,
  via?: ConditionAST,
  maxDepth?: number,
): boolean;
```

### Spatial Effect API (Spec 05 extension)

```typescript
function applyMoveTokenAdjacent(
  effect: {
    moveTokenAdjacent: {
      token: TokenSel;
      from: ZoneSel;
      direction?: string; // destination zone id or bound move-param name (e.g. "$to")
    };
  },
  ctx: EffectContext,
): EffectResult;
```

### Board Macro APIs (Spec 08b dependency)

```typescript
function generateGrid(rows: number, cols: number): readonly ZoneDef[];
function generateHex(radius: number): readonly ZoneDef[];
```

## Implementation Requirements

### Adjacency graph build + normalize

`buildAdjacencyGraph(zones)` must:
1. Build a full entry in `neighbors` for every zone ID (isolated zones map to `[]`).
2. Treat adjacency as undirected in runtime semantics by normalizing edge pairs:
   - If `A -> B` exists or `B -> A` exists in `ZoneDef`, both `A` and `B` include each other in the graph.
3. Remove duplicate neighbor IDs.
4. Reject self-loop edges (`A -> A`) via validation diagnostic.
5. Sort each neighbor list lexicographically for deterministic traversal.

Rationale: runtime behavior remains deterministic and symmetric even when author input is partially asymmetric.

### Adjacency validation diagnostics

`validateAdjacency(graph, zones)` must emit:
- `SPATIAL_DANGLING_ZONE_REF` (`error`): `adjacentTo` references unknown zone ID.
- `SPATIAL_ASYMMETRIC_EDGE_NORMALIZED` (`warning`): only one direction specified; runtime normalized to both directions.
- `SPATIAL_SELF_LOOP` (`error`): zone references itself.
- `SPATIAL_DUPLICATE_NEIGHBOR` (`warning`): duplicate neighbor declarations in `adjacentTo`.

Diagnostics include path, message, and suggestion.

### Query semantics and ordering

`adjacentZones(zone)`:
- Returns normalized neighbor list from graph (`ZoneId[]`), already lexicographically sorted.

`tokensInAdjacentZones(zone)`:
- Traversal order: adjacent zones in `adjacentZones` order.
- For each adjacent zone, tokens are returned in that zone's existing token order.

`connectedZones(zone, via?, options?)`:
- BFS over normalized graph.
- Default `includeStart = false`.
- Default `maxDepth = graph.zoneCount - 1`.
- Depth is edge distance from `start`.
- `maxDepth = 0` returns `[]` unless `includeStart = true`.
- `via` is evaluated on candidate destination zone before enqueue.
- `via` evaluation context adds/overwrites binding `$zone` with candidate `ZoneId`.
- Neighbor visitation order is the sorted neighbor order in graph.
- Returned zones are BFS discovery order (deterministic).

All spatial query outputs must obey Spec 04 `maxQueryResults` limits.

### Spatial conditions

`adjacent(left, right)`:
- Resolves both `ZoneSel` operands to exactly one concrete zone each.
- Returns true iff `right` is in normalized neighbor set of `left`.

`connected(from, to, via?, maxDepth?)`:
- Resolves `from` and `to` to single concrete zones.
- Uses same traversal semantics as `connectedZones`.
- Returns true iff `to` appears in reachable set under bounds/filter.

### `moveTokenAdjacent` destination semantics

`applyMoveTokenAdjacent(effect, ctx)` must:
1. Resolve `token` and `from`.
2. Resolve destination from `direction`:
   - If omitted: fail with `SPATIAL_DESTINATION_REQUIRED`.
   - If string starts with `$`: treat as move-param/binding name and resolve to `ZoneId`.
   - Otherwise treat as concrete destination `ZoneId`.
3. Verify destination is adjacent to `from` in normalized graph.
4. Move token from source to destination preserving single-token movement rules from `moveToken`.
5. Emit `tokenEntered` event for destination zone (parity with other movement effects).

No numeric neighbor-index semantics are allowed.

### Spatial context threading

`AdjacencyGraph` is immutable and derived from `GameDef.zones`. Build it once per `GameDef` load and thread it through:
- `EvalContext`
- `EffectContext`

Do not rebuild per query/effect.

### Board macro constraints

`grid(rows, cols)`:
- Inputs must be integers with `rows >= 1`, `cols >= 1`.
- Zone IDs use `cell_{row}_{col}` (row-major generation order).
- Adjacency is 4-connected and symmetric by construction.
- Generated zones default to `owner: 'none'`, `visibility: 'public'`, `ordering: 'set'`.

`hex(radius)`:
- Input must be integer with `radius >= 0`.
- Axial coordinates `(q, r)` with membership rule `|q| <= radius && |r| <= radius && |q + r| <= radius`.
- Zone ID format: `hex_<q>_<r>`, where negatives are encoded as `n` prefix (e.g. `hex_n1_2`).
- 6-neighbor axial adjacency.
- Zone count formula: `3 * radius * (radius + 1) + 1`.
- Same default zone attributes as grid.

Macro expansion must fail with diagnostics on invalid inputs.

## Invariants

1. `AdjacencyGraph.neighbors` contains every zone ID exactly once as a key.
2. Runtime adjacency is symmetric after normalization.
3. No query returns zone IDs not present in `GameDef.zones`.
4. Spatial query outputs are deterministic for identical input state.
5. `connectedZones` terminates for all valid inputs.
6. `connectedZones` never returns duplicates.
7. `moveTokenAdjacent` rejects non-adjacent destinations.
8. `moveTokenAdjacent` emits `tokenEntered` for successful moves.
9. `grid(R, C)` returns exactly `R * C` zones with valid symmetric 4-connectivity.
10. `hex(radius)` returns exactly `3 * radius * (radius + 1) + 1` zones with valid symmetric 6-connectivity.
11. Spatial query cardinality is bounded by `maxQueryResults`.
12. Macro outputs contain no dangling adjacency references.

## Required Tests

### Unit Tests

**Adjacency graph and validation**:
- Symmetric input graph builds expected neighbors.
- Asymmetric input is normalized at runtime and emits warning.
- Dangling zone reference emits error.
- Self-loop emits error.
- Duplicate neighbor declaration emits warning and de-duplicates runtime graph.
- Zone with no `adjacentTo` has `[]` neighbors.

**Spatial conditions**:
- `adjacent` true/false cases.
- `connected` true/false cases.
- `connected` with `via` filter success and failure.
- `connected` with `maxDepth` boundary behavior.

**Spatial queries**:
- `adjacentZones` deterministic sorted output.
- `tokensInAdjacentZones` preserves zone-then-token order.
- `connectedZones` cycle handling (no duplicates).
- `connectedZones` include/exclude start behavior.
- `connectedZones` maxDepth behavior (`0`, `1`, full).
- `connectedZones` with `via` filter and `$zone` binding.
- Spatial queries enforce `maxQueryResults`.

**`moveTokenAdjacent`**:
- Success path for adjacent destination.
- Reject non-adjacent destination.
- Reject missing destination (`direction` omitted).
- Destination from `$` binding resolves correctly.
- Emits `tokenEntered` event on success.

**Board macros**:
- `grid(3,3)` topology and naming.
- `grid(1,1)` single isolated node.
- `hex(0)`, `hex(1)`, `hex(2)` counts and core adjacency.
- Invalid params: `grid(0,3)`, `grid(2,-1)`, `hex(-1)`, non-integer inputs -> diagnostics.

### Integration Tests

- Spatial query + condition evaluation through `evalQuery`/`evalCondition` with context-threaded graph.
- `moveTokenAdjacent` through `applyEffect` updates state and emits events consumed by trigger dispatch.
- Compiler `grid`/`hex` expansion followed by `validateGameDef` has zero spatial errors on valid inputs.

### Property Tests

- For generated `grid(R,C)` (`R,C >= 1`): symmetric adjacency and valid refs.
- For generated `hex(radius)` (`radius >= 0`): symmetric adjacency and valid refs.
- For any valid graph/start zone: `connectedZones` output has unique members and is subset of all zones.
- Spatial query determinism: repeated evaluation yields identical output ordering.

### Golden Tests

- `grid(3,3)` exact zone list + adjacency lists.
- `hex(1)` exact zone list + adjacency lists.

## Acceptance Criteria

- [ ] Spatial query/effect stubs are fully replaced.
- [ ] Spatial condition AST operators are defined in runtime types and schemas.
- [ ] Runtime adjacency normalization + diagnostics behavior is implemented as specified.
- [ ] All spatial queries have deterministic ordering and respect cardinality bounds.
- [ ] `connectedZones` semantics (includeStart/maxDepth/via) are documented and tested.
- [ ] `moveTokenAdjacent` destination semantics are unambiguous and tested.
- [ ] `moveTokenAdjacent` emits `tokenEntered` events.
- [ ] `AdjacencyGraph` is built once and threaded via contexts.
- [ ] `grid` and `hex` validate inputs and generate valid symmetric topologies.
- [ ] Macro-generated spatial topologies pass `validateGameDef`.

## Files to Create/Modify

```
src/kernel/spatial.ts                   # NEW — graph build/validate + spatial query/condition helpers
src/kernel/eval-query.ts                # MODIFY — replace spatial query stubs
src/kernel/eval-condition.ts            # MODIFY — add adjacent/connected condition operators
src/kernel/effects.ts                   # MODIFY — replace moveTokenAdjacent stub and emit tokenEntered
src/kernel/eval-context.ts              # MODIFY — thread adjacencyGraph in EvalContext
src/kernel/effect-context.ts            # MODIFY — thread adjacencyGraph in EffectContext
src/kernel/types.ts                     # MODIFY — add spatial condition AST variants
src/kernel/schemas.ts                   # MODIFY — add spatial condition schema variants
src/cnl/expand-macros.ts                # MODIFY — invoke generateGrid/generateHex with validation
src/cnl/compiler.ts                     # MODIFY — surface spatial diagnostics from macro expansion
src/kernel/index.ts                     # MODIFY — export spatial APIs

# tests
test/unit/spatial-graph.test.ts
test/unit/spatial-queries.test.ts
test/unit/spatial-conditions.test.ts
test/unit/spatial-effects.test.ts
test/unit/board-macros.test.ts
test/integration/spatial-kernel-integration.test.ts
```

## Outcome
- **Completion date**: 2026-02-10
- **What was implemented**:
  - Spatial adjacency graph build/validation with deterministic normalization and diagnostics.
  - Spatial query runtime (`adjacentZones`, `tokensInAdjacentZones`, `connectedZones`) and spatial conditions (`adjacent`, `connected`).
  - `moveTokenAdjacent` runtime semantics with adjacency enforcement and `tokenEntered` emission.
  - Board macro generation for `grid(rows, cols)` and `hex(radius)` with argument diagnostics.
  - Integration/property/golden coverage for spatial behavior and topologies.
- **Notable implementation adjustment**:
  - Action-effect emitted events are now dispatched through trigger dispatch in `applyMove` before `actionResolved`, ensuring `moveTokenAdjacent`-originated `tokenEntered` events are observable by triggers.
- **Verification**:
  - Spatial unit/integration/property/golden tests pass.
  - Full suite verification via `npm test` passed.
