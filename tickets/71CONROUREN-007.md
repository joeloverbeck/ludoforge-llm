# 71CONROUREN-007: Connection-Route Marker Presentation Parity

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: archive/tickets/71CONROUREN/71CONROUREN-004.md, archive/tickets/71CONROUREN/71CONROUREN-005.md, specs/71-connection-route-rendering.md

## Problem

Connection-route zones are now first-class render and interaction surfaces, but their renderer still drops zone marker presentation. `PresentationScene` computes both `render.markersLabel` and `render.badge` for every zone, yet `connection-route-renderer.ts` only renders the route stroke and route name label.

That becomes a real user-facing regression as soon as FITL LoCs migrate from `shape: line` to `shape: connection`: sabotage state on LoCs is currently part of zone marker presentation, and moving those zones onto the connection-route renderer would hide that state entirely. This violates architectural completeness because connection-shaped zones would have a weaker presentation contract than ordinary zones.

## Assumption Reassessment (2026-03-21)

1. `PresentationZoneRenderSpec` already includes `nameLabel`, `markersLabel`, and `badge`, and `buildPresentationScene()` computes those fields for connection-shaped zones too. The missing behavior is in rendering, not presentation projection.
2. `connection-route-renderer.ts` currently renders only the route display name label plus curve/junction graphics. It does not render `zone.render.markersLabel` or `zone.render.badge`.
3. FITL's current `visual-config.yaml` uses `markerBadge.markerId: support`, not `sabotage`. So the immediate FITL risk is broader marker visibility loss, not specifically badge loss.
4. FITL LoCs can carry sabotage markers mechanically, and `71CONROUREN-006` expects sabotage state to remain visibly represented after migration.
5. No active ticket currently owns generic connection-route marker presentation. `71CONROUREN-006` is a data-migration ticket and should depend on this renderer-parity work rather than absorb it.

## Architecture Check

1. The clean architecture is presentation parity by renderer contract: if `PresentationZoneRenderSpec` exposes marker text and badge data for zones, every zone renderer path must honor that contract. Adding game-specific sabotage special cases would be the wrong design.
2. This stays fully aligned with F1 and F3. The renderer remains generic and consumes already-resolved presentation data plus generic visual config; no FITL-specific branching is introduced.
3. No backwards-compat shims are needed. Connection-route rendering becomes the canonical rendering path for connection-shaped zones, with the same marker semantics as ordinary zones.
4. Keeping marker rendering in `connection-route-renderer.ts` is cleaner than trying to reintroduce hidden line-zone overlays or dual-rendering hacks during FITL migration.

## What to Change

### 1. Extend connection-route renderer visual parity

In `packages/runner/src/canvas/renderers/connection-route-renderer.ts`:

- Add marker text rendering for `route.zone.render.markersLabel`.
- Add badge rendering for `route.zone.render.badge` when present.
- Position both relative to the route midpoint container, not a fake rectangular zone body.
- Preserve current route-name label behavior and ensure marker/badge visibility updates in place across rerenders.

### 2. Define midpoint-relative marker layout

Use a generic midpoint-relative layout that mirrors zone-renderer semantics without inventing FITL-specific rules:

- Route name label remains centered on the midpoint with tangent-aware rotation.
- Marker text is rendered below or offset from the name label in midpoint-local coordinates.
- Badge is rendered in midpoint-local coordinates and anchored consistently near the route label cluster.

The exact offsets should be deterministic and derived from the existing presentation spec, not from hardcoded game IDs.

### 3. Add renderer tests for marker parity

In `packages/runner/test/canvas/renderers/connection-route-renderer.test.ts`:

- Verify marker text visibility and updates for connection routes.
- Verify badge visibility and updates for connection routes.
- Verify removing markers/badges hides them cleanly without leaking display objects.

### 4. Add integration proof that connection-shaped zones keep marker presentation

Add or extend a scene/runtime integration test proving that a connection-shaped zone carrying marker presentation still surfaces that presentation through the connection-route renderer path. This should specifically guard the FITL migration path without embedding FITL-specific logic in the renderer.

## Files to Touch

- `packages/runner/src/canvas/renderers/connection-route-renderer.ts` (modify)
- `packages/runner/test/canvas/renderers/connection-route-renderer.test.ts` (modify)
- `packages/runner/test/canvas/canvas-updater.test.ts` or `packages/runner/test/presentation/presentation-scene.test.ts` (modify, whichever provides the cleanest integration proof)

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
4. Existing route label, token midpoint container, and interaction tests continue to pass.
5. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Connection-shaped zones honor the same marker presentation contract as ordinary zones.
2. No FITL-specific renderer branches are introduced.
3. Marker presentation stays attached to the route midpoint container so hover, token placement, and marker visuals remain spatially coherent.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/renderers/connection-route-renderer.test.ts` — proves marker label and badge parity on connection routes, including update/removal behavior.
2. `packages/runner/test/canvas/canvas-updater.test.ts` or `packages/runner/test/presentation/presentation-scene.test.ts` — proves the connection-route path preserves marker-bearing zone presentation for migration scenarios.

### Commands

1. `pnpm -F @ludoforge/runner exec vitest run test/canvas/renderers/connection-route-renderer.test.ts`
2. `pnpm -F @ludoforge/runner exec vitest run test/canvas/canvas-updater.test.ts test/presentation/presentation-scene.test.ts`
3. `pnpm -F @ludoforge/runner test`
4. `pnpm -F @ludoforge/runner typecheck`
5. `pnpm -F @ludoforge/runner lint`
