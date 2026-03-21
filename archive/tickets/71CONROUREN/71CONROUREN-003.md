# 71CONROUREN-003: Connection-Route Resolver

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: archive/tickets/71CONROUREN-002.md

## Problem

The presentation layer currently treats all zones uniformly — it doesn't distinguish between spatial zones (provinces, cities) and connection zones (roads, rivers). To render connection zones as curves between their endpoints, a resolver must:
1. Identify which zones have `shape: 'connection'`
2. Determine which connection zones can be resolved into two primary endpoints (the non-connection zones the curve should connect)
3. Detect junctions where resolved connection zones meet through explicit connection-to-connection adjacency
4. Filter only resolved connection zones and their adjacencies from the standard zone/adjacency lists (so unresolved connection zones remain visible as ordinary zones instead of disappearing)

This is pure topology logic — no rendering, no PixiJS — fully testable with mock data.

## Assumption Reassessment (2026-03-21)

1. `PresentationZoneNode.visual.shape` already exists and already supports `'connection'`. `connectionStyleKey`, `connectionStyles`, and `VisualConfigProvider.resolveConnectionStyle()` also already exist in runner config code. This ticket must not restate those as new work.
2. `PresentationAdjacencyNode` has `from` and `to` string zone IDs — confirmed; we can build a topology index from these.
3. `PresentationScene` currently has `zones`, `tokens`, `adjacencies`, `overlays`, and `regions` only. This ticket should stay focused on a pure resolver utility and its tests; scene integration remains later work.
4. FITL LoCs are not uniformly inferable from zone IDs alone. Some routes have exactly two non-connection neighbors and are trivial. Others have 4+ non-connection neighbors, and some names refer to places that do not exist as standalone zone IDs (`loc-can-tho-long-phu:none`, `loc-kontum-ban-me-thuot:none`). Name parsing is therefore a best-effort fallback, not a reliable architecture.
5. There is currently no `connectionEndpoints` data exposed on `PresentationZoneNode` or from the resolver inputs. If explicit endpoint overrides are needed, they must be supplied to the resolver as explicit data rather than assumed to already exist on scene nodes.
6. FITL visual config still uses `shape: line` for `loc` zones. This ticket does not migrate FITL content; it only creates the resolver building block needed by later tickets.

## Architecture Check

1. The resolver should remain a pure function with explicit inputs and outputs. No provider lookups, no PixiJS, no hidden config access. Aligns with F7 (Immutability).
2. The current architecture is improved by making endpoint overrides an explicit resolver input instead of coupling the resolver to `VisualConfigProvider` internals or overloading `PresentationZoneNode`.
3. Endpoint inference must be conservative. If the resolver cannot determine exactly two endpoints unambiguously, it should leave that connection zone unresolved and pass it through unchanged. Silent guessing is weaker architecture than explicit omission.
4. Junction detection should use explicit connection-to-connection adjacency plus current layout positions. Computing junctions from "shared endpoints" is under-specified for FITL because several junctioning LoCs share multiple touching provinces and not a single canonical endpoint pair.
5. Connection style selection must not be recomputed here. The resolver should treat `zone.visual.connectionStyleKey` as authoritative resolved presentation data and pass it through unchanged.

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
  options: {
    readonly zones: readonly PresentationZoneNode[];
    readonly adjacencies: readonly PresentationAdjacencyNode[];
    readonly positions: ReadonlyMap<string, Position>;
    readonly endpointOverrides?: ReadonlyMap<string, readonly [string, string]>;
  },
): ConnectionRouteResolution;
```

**Algorithm (from spec):**
1. Filter zones where `visual.shape === 'connection'` → connection zone set
2. Build adjacency index: `Map<zoneId, Set<zoneId>>`
3. For each connection zone, partition adjacencies into non-connection neighbors and connection neighbors
4. Resolve endpoints using this precedence:
   - explicit override from `endpointOverrides`
   - exactly two non-connection neighbors
   - unambiguous zone-id parsing that matches exactly two known non-connection zone IDs
   - otherwise unresolved
5. For resolved connection zones:
   - `endpointZoneIds`: exactly two primary endpoints
   - `touchingZoneIds`: remaining non-connection neighbors not selected as endpoints
   - `connectedConnectionIds`: adjacent connection zones
   - `connectionStyleKey`: copy from `zone.visual.connectionStyleKey`
6. Detect junctions only from explicit connection-to-connection adjacency between resolved connection routes. If both connection zones have positions, place the junction at the midpoint of their layout positions.
7. Build filtered outputs:
   - `filteredZones`: all zones minus resolved connection zones only
   - `filteredAdjacencies`: all adjacencies minus those where one end is a resolved connection zone
   - unresolved connection zones and their adjacencies remain untouched

### 2. Endpoint inference helper

Internal helpers to:
- resolve explicit endpoint overrides
- infer endpoints conservatively from topology
- attempt unambiguous ID-token matching only as a fallback

Important: do not guess if more than one valid endpoint pair is plausible.

### 3. Create `connection-route-resolver.test.ts`

New test file at `packages/runner/test/presentation/connection-route-resolver.test.ts`.

## Files to Touch

- `packages/runner/src/presentation/connection-route-resolver.ts` (new)
- `packages/runner/test/presentation/connection-route-resolver.test.ts` (new)

## Out of Scope

- PixiJS rendering of curves (that's 71CONROUREN-004)
- Modifying `PresentationScene` interface (that's 71CONROUREN-005)
- FITL visual-config.yaml changes (that's 71CONROUREN-006)
- Visual-config schema/provider support for endpoint overrides; later integration can source `endpointOverrides` however it wants
- Token positioning on connection zones (handled by existing fan offset logic once container maps are merged in 71CONROUREN-005)
- Tangent-perpendicular token fanning (follow-up enhancement, explicitly out of scope per spec)
- Animated river flow (follow-up enhancement)

## Acceptance Criteria

### Tests That Must Pass

1. Given a connection zone with exactly two non-connection neighbors, it resolves without needing name parsing.
2. Given a connection zone with more than two non-connection neighbors plus an explicit override, the override is used and the remaining non-connection neighbors become `touchingZoneIds`.
3. Given a connection zone with ambiguous 3+ non-connection neighbors and no override, it remains in `filteredZones`, produces no `ConnectionRouteNode`, and its adjacencies remain in `filteredAdjacencies`.
4. Junction detection: when two resolved connection zones are directly adjacent, a junction is created at the midpoint of their layout positions.
5. Adjacency filtering removes all adjacencies involving resolved connection zones; non-connection adjacencies are preserved.
6. Zones without `shape: 'connection'` pass through unchanged.
7. Empty input (or input with no resolvable connection zones) returns original zones and adjacencies unchanged.
8. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. `filteredZones.length + connectionRoutes.length === zones.length` only for fully resolvable inputs; unresolved connection zones remain in `filteredZones`
2. Every `ConnectionRouteNode.endpointZoneIds` has exactly 2 entries
3. All returned arrays are new — no mutation of input collections (F7)
4. No PixiJS imports in the resolver module
5. No visual-config rule matching in the resolver module; `connectionStyleKey` is consumed only from `ResolvedZoneVisual`
6. Resolver output is deterministic for the same ordered inputs

## Test Plan

### New/Modified Tests

1. `packages/runner/test/presentation/connection-route-resolver.test.ts` — exact-two-neighbor resolution, explicit override handling, unresolved pass-through behavior, junction detection, adjacency filtering, and empty-input cases

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/presentation/connection-route-resolver.test.ts`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completed: 2026-03-21
- What actually changed:
  - Added `packages/runner/src/presentation/connection-route-resolver.ts` as a pure topology resolver.
  - Added `packages/runner/test/presentation/connection-route-resolver.test.ts` covering exact-two-neighbor resolution, explicit overrides, conservative unresolved pass-through, zone-ID parsing fallback, junction detection, and adjacency filtering.
  - Corrected this ticket's assumptions to match the current codebase: connection-zone config primitives already existed, FITL still uses `shape: line`, and endpoint overrides are not yet sourced from visual-config/provider code.
- Deviations from original plan:
  - This ticket did not add visual-config/provider schema support for endpoint overrides; instead, the resolver accepts explicit `endpointOverrides` input so later integration can supply overrides cleanly.
  - The resolver intentionally leaves ambiguous connection zones unresolved and visible rather than guessing endpoints.
  - Junctions are computed from explicit connection-to-connection adjacency and layout positions, not from a "shared endpoints" heuristic.
- Verification:
  - `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/presentation/connection-route-resolver.test.ts` passed. In this repo's current Vitest command shape, that invocation exercised the full runner suite: 178 files / 1804 tests passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
