# 86ADJLINRED-004: LoC Connector Spur Lines

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: archive/tickets/86ADJLINRED/86ADJLINRED-001.md

## Problem

After excluding connection zones from primary layout (86ADJLINRED-001), intermediate provinces that were adjacent to the LoC zone lose their visual connection to the road. For example, `loc-da-nang-qui-nhon` is adjacent to `quang-tin-quang-ngai` and `binh-dinh`, but the road connector only draws between the route endpoints (Da Nang → Qui Nhon). Without spur lines, the intermediate provinces appear disconnected from the highway.

## Assumption Reassessment (2026-03-27)

1. `packages/runner/src/presentation/connection-route-resolver.ts` already identifies connection-shaped zones, resolves authored route geometry, and records non-endpoint neighbors in `ConnectionRouteNode.touchingZoneIds` — confirmed.
2. The resolver does **not** read `GameDef.zones[].adjacentTo[]` directly. It consumes `PresentationAdjacencyNode[]` from `buildPresentationScene()`, which already filters hidden zones and provides the adjacency truth used by the runner. Spur derivation must extend this existing presentation-scene pipeline rather than introduce a parallel GameDef lookup path.
3. `packages/runner/test/presentation/connection-route-resolver.test.ts` and `packages/runner/test/canvas/renderers/connection-route-renderer.test.ts` already exist. This ticket should extend those tests, not plan entirely new test files from scratch.
4. `packages/runner/src/canvas/renderers/connection-route-renderer.ts` already contains private polyline sampling and hit-area helpers, but those helpers are renderer-local. Reusing renderer internals from the resolver would invert the layering. If spur computation needs route-path sampling or nearest-point projection, that math should move into a shared route-geometry utility owned outside the renderer.
5. `packages/runner/src/canvas/renderers/shape-utils.ts` already exposes `getEdgePointAtAngle()` and the existing connection-route resolver already uses it for authored anchored endpoints. Spur endpoints should reuse the same shape-aware edge-anchor behavior.
6. Spec 86 Part 1 and Part 3 are already implemented: FITL LoC zones are hidden, adjacency filtering respects hidden zones via `buildPresentationScene()`, dashed edge-clipped adjacency rendering exists, and those tickets are archived. This ticket is now narrowly about adding connection-route spur branches and the minimum shared geometry extraction needed to keep that design clean.

## Architecture Check

1. Spur ownership still belongs in the resolver→renderer split: the resolver should emit complete route presentation geometry, and the renderer should stay focused on drawing that geometry.
2. The ticket's original "reuse or adapt sampling from the renderer" approach is not architectural enough. The cleaner design is to extract shared route-path math into a small neutral utility and have both resolver and renderer depend on it. That removes duplication and prevents presentation resolution from reaching into renderer internals.
3. Spur lines should inherit the parent route stroke. No new visual-config surface is needed unless the current design later proves insufficient. This stays game-agnostic because the rule is based on connection-route adjacencies, not FITL-specific IDs.
4. No backwards compatibility: `ConnectionRouteNode` can grow a required `spurs` field and all renderer/tests should be updated in the same change (Foundation 9).

## What to Change

### 1. Extract Shared Route-Path Geometry Helpers

Create a small shared utility for resolved connection-route path math. The exact file name can be chosen during implementation, but it should not live inside the renderer.

**Required helpers**:
1. Sample a resolved route path into a polyline from `path + segments`
2. Project an arbitrary point onto that polyline and return the nearest point on the path

**Why this is required**:
- The renderer already samples paths for midpoint/hit-area work
- Spur computation needs the same geometric truth
- Duplicating that math or importing renderer-private helpers would make the architecture worse, not better

### 2. Compute Spur Geometry in `connection-route-resolver.ts`

Add spur computation after route geometry resolution, using the existing adjacency-derived `touchingZoneIds` and the shared route-path utility.

**Algorithm**:
1. For each resolved connection route, treat `touchingZoneIds` as the candidate spur targets
2. Resolve the route's sampled polyline from the shared route-geometry utility
3. For each touching zone:
   a. Resolve the zone center from `positions`
   b. Resolve the target zone visual/dimensions from `zoneById`
   c. Find the nearest point on the route polyline to the zone center
   d. Compute the angle from that nearest route point toward the zone center
   e. Compute the edge point on the adjacent zone boundary via `getEdgePointAtAngle()`
   f. Emit a spur segment from the route point to the target zone edge
4. If required geometry is missing for a touching zone, skip that spur and keep the route itself valid

**New type**:
```typescript
interface SpurSegment {
  readonly from: Position;
  readonly to: Position;
  readonly targetZoneId: string;
}
```

**Add to `ConnectionRouteNode`**:
```typescript
readonly spurs: readonly SpurSegment[];
```

### 3. Render Spur Lines in `connection-route-renderer.ts`

In the `update()` function, after drawing the main route polyline, iterate over `route.spurs` and draw each spur segment:

1. Use the same `ResolvedStroke` as the parent route (same color, width, alpha)
2. Draw each spur as a straight segment on the same route graphics object so hit-area/visibility lifecycle remains tied to the route
3. Spurs are solid lines (not dashed) — they are extensions of the road connector

### 4. Tests

Strengthen existing runner tests rather than creating parallel coverage from scratch:
1. Extend `packages/runner/test/presentation/connection-route-resolver.test.ts`
2. Extend `packages/runner/test/canvas/renderers/connection-route-renderer.test.ts`
3. Add targeted tests for the shared route-geometry helper if a new utility file is introduced

## Files to Touch

- `packages/runner/src/presentation/connection-route-resolver.ts` (modify — add `SpurSegment`, compute route spurs from `touchingZoneIds`)
- `packages/runner/src/canvas/renderers/connection-route-renderer.ts` (modify — render spur lines using parent route stroke)
- `packages/runner/src/...` shared route geometry utility (new or extracted module — sampled-path + nearest-point helpers used by resolver and renderer)
- `packages/runner/test/presentation/connection-route-resolver.test.ts` (modify — spur computation coverage)
- `packages/runner/test/canvas/renderers/connection-route-renderer.test.ts` (modify — spur rendering coverage)
- `packages/runner/test/...` shared geometry utility test (new only if a new utility module is created)

## Out of Scope

- Reimplementing hidden-zone filtering or adjacency restyling from prior 86ADJLINRED tickets
- New config/schema surface for spur-specific styling
- Any engine changes
- Curved spur branches; spurs remain straight connector branches
- Special FITL-only heuristics; spur generation must follow generic connection-route adjacency data
- Rewriting large route-rendering files without need; keep the change focused on shared geometry extraction plus spur support

## Acceptance Criteria

### Tests That Must Pass

1. **Updated resolver test**: a route with path `[A, B]` and touching zone `C` emits exactly one spur for `C`
2. **Updated resolver test**: touching zones that are already authored path points do not produce duplicate spurs
3. **Updated resolver/shared-geometry test**: the spur `from` point lies on the sampled route path and nearest-point projection clamps correctly for on-segment, perpendicular, and beyond-endpoint cases
4. **Updated resolver test**: the spur `to` point lies on the target zone boundary, not the zone center
5. **Updated renderer test**: the renderer draws spur segments with the same stroke style as the parent route
6. Runner lint: `pnpm -F @ludoforge/runner lint`
7. Runner typecheck: `pnpm -F @ludoforge/runner typecheck`
8. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Every `touchingZoneId` with resolvable geometry yields exactly one spur
2. Authored route path points are not duplicated as spur targets
3. Spur `from` points lie on the resolved route polyline
4. Spur `to` points lie on the target zone boundary
5. Spur styling matches the parent route stroke
6. Resolver and renderer use shared route-path math instead of duplicated geometry logic
7. No game-specific logic in spur computation — any connection route with extra touching zones can emit spurs

## Test Plan

### New/Modified Tests

1. `packages/runner/test/presentation/connection-route-resolver.test.ts` — spur derivation, endpoint exclusion, boundary anchoring
2. `packages/runner/test/canvas/renderers/connection-route-renderer.test.ts` — spur drawing and stroke inheritance
3. Shared route-geometry utility test — nearest-point projection and sampled-path behavior, if the shared utility is introduced as a separate module

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner lint`
3. `pnpm -F @ludoforge/runner typecheck`

### Visual Verification

1. `pnpm -F @ludoforge/runner dev` → load FITL game
2. Confirm road connectors have spur branches extending to adjacent provinces (e.g., the Da Nang–Qui Nhon highway has branches to Quang Tin/Quang Ngai and Binh Dinh)
3. Confirm spurs match the parent road's color and width
4. Confirm no spurs appear at route endpoints (Da Nang, Qui Nhon themselves)

## Outcome

- **Completion date**: 2026-03-27
- **What actually changed**:
  - Corrected the ticket assumptions first so they matched the current runner architecture: prior adjacency redesign work was already complete, and connection routes derive from presentation-scene adjacencies rather than direct GameDef traversal.
  - Added a shared route-geometry utility so route sampling and nearest-point projection are no longer renderer-private logic.
  - Extended `ConnectionRouteNode` with required `spurs` geometry resolved from `touchingZoneIds`, with target endpoints clipped to zone boundaries via existing shape-aware helpers.
  - Updated the connection-route renderer to draw spur branches with the parent route stroke.
  - Strengthened resolver, renderer, scene, and shared-geometry tests to lock in the new invariants.
- **Deviations from original plan**:
  - Spur computation does not reach into renderer internals or sample from the rendered graphics path. Shared route-path math was extracted instead because that is cleaner and more extensible.
  - No new styling/config surface was added. The existing parent-route stroke remains the single source of truth for route and spur presentation.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test` ✅
  - `pnpm -F @ludoforge/runner lint` ✅
  - `pnpm -F @ludoforge/runner typecheck` ✅
