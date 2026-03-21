# 71CONROUREN-003: Connection-Route Resolver

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: archive/tickets/71CONROUREN-002.md

## Problem

The presentation layer currently treats all zones uniformly — it doesn't distinguish between spatial zones (provinces, cities) and connection zones (roads, rivers). To render connection zones as curves between their endpoints, a resolver must:
1. Identify which zones have `shape: 'connection'`
2. Determine each connection zone's two primary endpoints (the non-connection zones it links)
3. Detect junctions where multiple connection zones meet
4. Filter out connection zones and their endpoint adjacencies from the standard zone/adjacency lists (so the zone renderer and adjacency renderer don't draw them)

This is pure topology logic — no rendering, no PixiJS — fully testable with mock data.

## Assumption Reassessment (2026-03-21)

1. `PresentationZoneNode` has `visual.shape` (from `ResolvedZoneVisual`) — confirmed; this is how we identify connection zones.
2. `PresentationAdjacencyNode` has `from` and `to` string zone IDs — confirmed; we can build an adjacency index from these.
3. Connection zones in FITL are adjacent to 2–4+ zones. The two "primary endpoints" are the zones whose names appear in the connection zone's ID (e.g., `loc-hue-da-nang` → endpoints `hue:none`, `da-nang:none`). The spec defines a name-parsing heuristic plus explicit `connectionEndpoints` override in visual config.
4. `PresentationScene` currently has `zones`, `tokens`, `adjacencies`, `overlays`, `regions` — no `connectionRoutes` or `junctions` fields yet (those are added in 71CONROUREN-005).

## Architecture Check

1. The resolver is a pure function: input = zones + adjacencies + positions → output = connection routes + junctions + filtered zones + filtered adjacencies. No side effects, no PixiJS dependencies. Aligns with F7 (Immutability).
2. Endpoint inference via zone ID parsing is game-agnostic — any game can name connection zones `<type>-<endpointA>-<endpointB>`. The `connectionEndpoints` override in visual config handles ambiguous cases. Aligns with F1 (Engine Agnosticism).
3. No backwards-compat — this is entirely new code.
4. Connection style selection must not be recomputed here. The resolver should treat `zone.visual.connectionStyleKey` as the authoritative resolved result from `VisualConfigProvider` and pass it through unchanged to `ConnectionRouteNode`.

## What to Change

### 1. Create `connection-route-resolver.ts`

New file at `packages/runner/src/presentation/connection-route-resolver.ts`.

**Interfaces:**

- `ConnectionRouteNode`: `{ zoneId, displayName, endpointZoneIds: [string, string], touchingZoneIds, connectedConnectionIds, connectionStyleKey: string | null, zone: PresentationZoneNode }`
- `JunctionNode`: `{ id, connectionIds, position: { x, y } }`
- `ConnectionRouteResolution`: `{ connectionRoutes, junctions, filteredZones, filteredAdjacencies }`

**Main function:**

```typescript
export function resolveConnectionRoutes(
  zones: readonly PresentationZoneNode[],
  adjacencies: readonly PresentationAdjacencyNode[],
  positions: ReadonlyMap<string, Position>,
): ConnectionRouteResolution;
```

**Algorithm (from spec):**
1. Filter zones where `visual.shape === 'connection'` → connection zone set
2. Build adjacency index: `Map<zoneId, Set<zoneId>>`
3. For each connection zone, partition adjacencies into:
   - Primary endpoints (2): inferred from zone ID name parsing or `connectionEndpoints` override
   - Touching zones (0+): other non-connection adjacencies
   - Connected connections (0+): other connection zones sharing an edge
   - Connection style key: copy from `zone.visual.connectionStyleKey`; do not re-run category/attribute matching in the resolver
4. Detect junctions: when 2+ connection zones share an adjacency edge, create a `JunctionNode` at the centroid of the shared endpoints' positions
5. Build filtered outputs:
   - `filteredZones`: all zones minus connection zones
   - `filteredAdjacencies`: all adjacencies minus those where one end is a connection zone (removes both endpoint and touching adjacencies involving connection zones)

### 2. Endpoint inference helper

Internal function to parse zone IDs like `loc-kontum-qui-nhon` → extract candidate endpoint names → match against known non-connection zone IDs. Handles the `connectionEndpoints` override from the zone's visual config.

### 3. Create `connection-route-resolver.test.ts`

New test file at `packages/runner/test/presentation/connection-route-resolver.test.ts`.

## Files to Touch

- `packages/runner/src/presentation/connection-route-resolver.ts` (new)
- `packages/runner/test/presentation/connection-route-resolver.test.ts` (new)

## Out of Scope

- PixiJS rendering of curves (that's 71CONROUREN-004)
- Modifying `PresentationScene` interface (that's 71CONROUREN-005)
- FITL visual-config.yaml changes (that's 71CONROUREN-006)
- Token positioning on connection zones (handled by existing fan offset logic once container maps are merged in 71CONROUREN-005)
- Tangent-perpendicular token fanning (follow-up enhancement, explicitly out of scope per spec)
- Animated river flow (follow-up enhancement)

## Acceptance Criteria

### Tests That Must Pass

1. Given 5 zones (A, B, C, D=connection, E=connection) with D adjacent to A+B+C and E adjacent to B+C:
   - `connectionRoutes` has 2 entries (D and E)
   - D's `endpointZoneIds` are [A-id, B-id] (inferred from name)
   - D's `touchingZoneIds` contains C-id
   - `filteredZones` has 3 entries (A, B, C only)
2. Junction detection: when D and E both connect to B, a junction is created with the correct position
3. Adjacency filtering: adjacencies from D→A, D→B, D→C, E→B, E→C are all removed from `filteredAdjacencies`; adjacency A→B (non-connection pair) is preserved
4. Zones without `shape: 'connection'` pass through unchanged in `filteredZones`
5. Empty input (no connection zones) returns original zones and adjacencies unchanged
6. `connectionEndpoints` override: when a zone has explicit endpoint overrides, those are used instead of name parsing
7. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. `filteredZones.length + connectionRoutes.length === zones.length` — no zones are lost or duplicated
2. Every `ConnectionRouteNode.endpointZoneIds` has exactly 2 entries
3. All returned objects are new — no mutation of input arrays (F7)
4. No PixiJS imports in the resolver module
5. No raw visual-config rule matching in the resolver module; `connectionStyleKey` is consumed only from `ResolvedZoneVisual`

## Test Plan

### New/Modified Tests

1. `packages/runner/test/presentation/connection-route-resolver.test.ts` — endpoint resolution, junction detection, adjacency filtering, edge cases (no connections, all connections, ambiguous names)

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/presentation/connection-route-resolver.test.ts`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner lint`
