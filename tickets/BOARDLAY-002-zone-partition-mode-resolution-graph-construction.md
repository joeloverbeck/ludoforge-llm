# BOARDLAY-002: Zone Partitioning, Mode Resolution, and Graph Construction

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: No
**Deps**: BOARDLAY-001 (graphology dependency available)

## Problem

The layout engine needs three foundational pure functions before any layout algorithm can run:

1. **`partitionZones()`** — Split `GameDef.zones` into board zones (`zoneKind === 'board'` or inferred) and aux zones (`zoneKind === 'aux'`) so they can be laid out independently.
2. **`resolveLayoutMode()`** — Determine which layout algorithm to use: read `metadata.layoutMode` if declared, otherwise auto-detect `'graph'` (if any zone has adjacency) or `'table'` (otherwise). Track and grid are never auto-detected.
3. **`buildLayoutGraph()`** — Construct a `graphology` `Graph` from board zones and their `adjacentTo` edges, with node attributes (`category`, `attributes`) for ForceAtlas2 clustering.

These correspond to Spec 41 deliverable D1.

## What to Change

**Files (expected)**:
- `packages/runner/src/layout/build-layout-graph.ts` — create with `partitionZones()`, `resolveLayoutMode()`, `buildLayoutGraph()`
- `packages/runner/test/layout/build-layout-graph.test.ts` — unit tests

### Function Signatures

```typescript
import Graph from 'graphology';
import type { GameDef, ZoneDef } from '@ludoforge/engine';
import type { LayoutMode } from './layout-types';

function resolveLayoutMode(def: GameDef): LayoutMode;
function partitionZones(def: GameDef): { board: readonly ZoneDef[]; aux: readonly ZoneDef[] };
function buildLayoutGraph(boardZones: readonly ZoneDef[]): Graph;
```

### Zone Partitioning Rules

- `zoneKind === 'board'` → board zone
- `zoneKind === 'aux'` → aux zone
- `zoneKind === undefined` — infer from context:
  - Has `adjacentTo` with length > 0 → board
  - Otherwise → aux
- GameDef with no zones → both arrays empty

### Mode Resolution Rules

- `def.metadata.layoutMode` is `'graph'` | `'table'` | `'track'` | `'grid'` → return as-is
- `def.metadata.layoutMode` is `undefined`:
  - Any zone in `def.zones` has `adjacentTo` with length > 0 → `'graph'`
  - Otherwise → `'table'`
- `'track'` and `'grid'` are never auto-detected

### Graph Construction Rules

- Each board zone becomes a node with id = `zone.id`
- Node attributes stored: `category` (string | undefined), `attributes` (record | undefined)
- For each `zone.adjacentTo` entry, add an undirected edge (skip if target not in board set)
- Duplicate edges silently ignored (graphology handles this)

## Out of Scope

- Layout algorithms (BOARDLAY-003 through BOARDLAY-005) — this ticket builds the graph, not the layout
- Aux zone sidebar positioning (BOARDLAY-006)
- Layout caching (BOARDLAY-007)
- Position store or GameCanvas integration (BOARDLAY-008)
- Any engine package changes
- Any existing runner source file modifications

## Acceptance Criteria

### Specific Tests That Must Pass

1. **`resolveLayoutMode` — explicit mode passthrough**: GameDef with `metadata.layoutMode: 'grid'` returns `'grid'`.
2. **`resolveLayoutMode` — explicit track**: GameDef with `metadata.layoutMode: 'track'` returns `'track'`.
3. **`resolveLayoutMode` — auto-detect graph**: GameDef without `layoutMode` but with zones having `adjacentTo` returns `'graph'`.
4. **`resolveLayoutMode` — auto-detect table**: GameDef without `layoutMode` and no zones with adjacency returns `'table'`.
5. **`resolveLayoutMode` — empty zones**: GameDef with empty `zones` array returns `'table'`.
6. **`partitionZones` — explicit zoneKind**: Zones with `zoneKind: 'board'` go to board, `zoneKind: 'aux'` go to aux.
7. **`partitionZones` — inferred from adjacency**: Zone without `zoneKind` but with `adjacentTo` goes to board.
8. **`partitionZones` — inferred no adjacency**: Zone without `zoneKind` and without `adjacentTo` goes to aux.
9. **`partitionZones` — empty zones**: Returns both arrays empty.
10. **`buildLayoutGraph` — nodes match board zones**: Graph has one node per board zone with correct IDs.
11. **`buildLayoutGraph` — edges from adjacentTo**: Each `adjacentTo` entry produces an undirected edge.
12. **`buildLayoutGraph` — node attributes preserved**: `category` and `attributes` are stored on graph nodes.
13. **`buildLayoutGraph` — cross-partition edges skipped**: `adjacentTo` pointing to an aux zone (not in board set) does not create an edge.
14. **`buildLayoutGraph` — empty board zones**: Returns empty graph.

### Invariants

1. All three functions are pure — no side effects, no mutation of input.
2. `buildLayoutGraph` produces an undirected graph (graphology `Graph` default).
3. No existing source files are modified.
4. `pnpm turbo build` and `pnpm -F @ludoforge/runner test` pass.
