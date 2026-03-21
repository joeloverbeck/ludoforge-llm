# 71CONROUREN-007: Connection-Route Marker Presentation Parity

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: archive/tickets/71CONROUREN/71CONROUREN-004.md, archive/tickets/71CONROUREN/71CONROUREN-005.md, specs/71-connection-route-rendering.md

## Problem

Connection-route zones are now first-class render and interaction surfaces, but their renderer still drops zone marker presentation. `PresentationScene` computes both `render.markersLabel` and `render.badge` for every zone, yet `connection-route-renderer.ts` only renders the route stroke and route name label.

That becomes a real user-facing regression as soon as FITL LoCs migrate from `shape: line` to `shape: connection`: sabotage state on LoCs is currently part of zone marker presentation, and moving those zones onto the connection-route renderer would hide that state entirely. This violates architectural completeness because connection-shaped zones would have a weaker presentation contract than ordinary zones.

## Assumption Reassessment (2026-03-21)

1. `PresentationZoneRenderSpec` already includes `nameLabel`, `markersLabel`, and `badge`, and `buildPresentationScene()` computes those fields for connection-shaped zones too. The missing behavior is in rendering, not presentation projection.
2. `connection-route-renderer.ts` currently renders only the route display name label plus curve/junction graphics. It does not render `zone.render.markersLabel` or `zone.render.badge`, and it positions the route name label outside the midpoint container while the midpoint container is reserved for tokens/selection.
3. FITL's current `visual-config.yaml` uses `markerBadge.markerId: support`, not `sabotage`. So the immediate FITL risk is broader marker visibility loss, not specifically badge loss.
4. FITL LoCs can carry sabotage markers mechanically, and `71CONROUREN-006` expects sabotage state to remain visibly represented after migration.
5. `packages/runner/test/presentation/presentation-scene.test.ts` already proves that connection-shaped zones project into `scene.connectionRoutes` while retaining route-zone tokens. The missing automated proof is renderer parity for marker-bearing connection routes, not route-scene projection itself.
6. No active ticket currently owns generic connection-route marker presentation. `71CONROUREN-006` is a data-migration ticket and should depend on this renderer-parity work rather than absorb it.

## Architecture Check

1. The clean architecture is presentation parity by renderer contract: if `PresentationZoneRenderSpec` exposes marker text and badge data for zones, every zone renderer path must honor that contract. Adding game-specific sabotage special cases would be the wrong design.
2. This stays fully aligned with F1 and F3. The renderer remains generic and consumes already-resolved presentation data plus generic visual config; no FITL-specific branching is introduced.
3. No backwards-compat shims are needed. Connection-route rendering becomes the canonical rendering path for connection-shaped zones, with the same marker semantics as ordinary zones.
4. The cleaner renderer architecture is a midpoint-local label cluster: route name, markers, and badge should all live under the midpoint container so label layout, token anchoring, selection, and rerender cleanup all share one spatial root.
5. Keeping marker rendering in `connection-route-renderer.ts` is cleaner than trying to reintroduce hidden line-zone overlays or dual-rendering hacks during FITL migration.

## What to Change

### 1. Extend connection-route renderer visual parity

In `packages/runner/src/canvas/renderers/connection-route-renderer.ts`:

- Move the route name label into the route midpoint container so the full label cluster shares one local coordinate system.
- Add marker text rendering for `route.zone.render.markersLabel`.
- Add badge rendering for `route.zone.render.badge` when present.
- Position all three label-cluster elements relative to the route midpoint container, not a fake rectangular zone body.
- Preserve current route-name label behavior and ensure marker/badge visibility updates in place across rerenders.

### 2. Define midpoint-relative marker layout

Use a generic midpoint-relative layout that mirrors zone-renderer semantics without inventing FITL-specific rules:

- Route name label remains centered on the midpoint via the midpoint container, with tangent-aware rotation applied to the label cluster root.
- Marker text is rendered below or offset from the name label in midpoint-local coordinates.
- Badge is rendered in midpoint-local coordinates and anchored consistently near the route label cluster.

The exact offsets should be deterministic and derived from the existing presentation spec, not from hardcoded game IDs.

### 3. Add renderer tests for marker parity

In `packages/runner/test/canvas/renderers/connection-route-renderer.test.ts`:

- Verify marker text visibility and updates for connection routes.
- Verify badge visibility and updates for connection routes.
- Verify removing markers/badges hides them cleanly without leaking display objects.

### 4. Add integration proof that connection-shaped zones keep marker presentation

Extend the existing renderer-focused test coverage with one integration-level proof in the cleanest existing location. `presentation-scene.test.ts` already covers projection into `connectionRoutes`; use it only if needed to assert marker-bearing route data survives projection. Prefer renderer/canvas tests for proving that the visuals actually appear and update.

## Files to Touch

- `packages/runner/src/canvas/renderers/connection-route-renderer.ts` (modify)
- `packages/runner/test/canvas/renderers/connection-route-renderer.test.ts` (modify)
- `packages/runner/test/presentation/presentation-scene.test.ts` (modify only if needed to pin projection of marker-bearing connection routes)

## Out of Scope

- FITL `visual-config.yaml` migration itself
- New visual-config schema fields
- Tangent-perpendicular token fanning
- Animated river flow
- Any engine/kernel/compiler changes

## Acceptance Criteria

### Tests That Must Pass

1. A connection route with `zone.render.markersLabel.visible === true` renders marker text and keeps it updated across rerenders.
2. A connection route with `zone.render.badge !== null` renders badge graphics/text and hides them when the badge disappears.
3. Connection-route rerenders do not leak stale marker/badge display objects.
4. The route label cluster is midpoint-local, so route labels, markers, badges, tokens, and selection remain spatially coherent under rerenders.
5. Existing route label, token midpoint container, and interaction tests continue to pass.
6. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Connection-shaped zones honor the same marker presentation contract as ordinary zones.
2. No FITL-specific renderer branches are introduced.
3. Marker presentation stays attached to the route midpoint container so hover, token placement, and marker visuals remain spatially coherent.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/renderers/connection-route-renderer.test.ts` — proves midpoint-local label-cluster parity on connection routes, including marker/badge update and removal behavior.
2. `packages/runner/test/presentation/presentation-scene.test.ts` — optional only if needed to pin that marker-bearing connection zones still project into `connectionRoutes` with their render data intact.

### Commands

1. `pnpm -F @ludoforge/runner exec vitest run test/canvas/renderers/connection-route-renderer.test.ts`
2. `pnpm -F @ludoforge/runner exec vitest run test/presentation/presentation-scene.test.ts`
3. `pnpm -F @ludoforge/runner test`
4. `pnpm -F @ludoforge/runner typecheck`
5. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completion date: 2026-03-21
- What actually changed:
  - Reassessed the ticket assumptions against the current runner code and tightened the scope around the real architectural gap: the connection-route renderer had a split label layout, with the route name outside the midpoint container and no support for marker text or badges.
  - Updated `connection-route-renderer.ts` so connection routes now render a midpoint-local label cluster containing the route name, marker label, and badge visuals, with in-place update/removal behavior.
  - Added renderer tests covering midpoint-local marker/badge rendering, updates, and cleanup, and strengthened `presentation-scene.test.ts` to prove marker-bearing connection zones retain their render payload when projected into `connectionRoutes`.
- Deviations from original plan:
  - No `canvas-updater` test change was needed. The cleaner proof boundary was renderer parity plus presentation-scene projection, because route wiring through the updater was already covered.
  - The implementation deliberately moved the existing route name label into the midpoint container instead of only appending new visuals around the old split layout. This is a small architectural improvement over the original ticket wording and produces a cleaner long-term renderer contract.
- Verification results:
  - `pnpm -F @ludoforge/runner exec vitest run test/canvas/renderers/connection-route-renderer.test.ts`
  - `pnpm -F @ludoforge/runner exec vitest run test/presentation/presentation-scene.test.ts`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner lint`
