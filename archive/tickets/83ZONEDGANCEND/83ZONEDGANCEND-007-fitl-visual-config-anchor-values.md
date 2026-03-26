# 83ZONEDGANCEND-007: FITL Visual Config Anchor Values

**Status**: ✅ COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — runner-only visual-config authoring and test coverage
**Deps**: `archive/tickets/83ZONEDGANCEND-001-schema-extension-and-export-serialization.md`, `archive/tickets/83ZONEDGANCEND-002-edge-position-math-utilities.md`, `archive/tickets/83ZONEDGANCEND/83ZONEDGANCEND-003-presentation-resolver-integration.md`, `archive/tickets/83ZONEDGANCEND/83ZONEDGANCEND-004-editor-route-geometry-update.md`, `archive/tickets/83ZONEDGANCEND/83ZONEDGANCEND-005-store-actions-set-and-preview-anchor.md`, `archive/tickets/83ZONEDGANCEND/83ZONEDGANCEND-006-zone-linked-endpoint-dragging-and-explicit-detach.md`

## Problem

The FITL visual config still contains at least one authored connection route whose zone endpoints attach at zone centers even though the runner already supports zone-edge anchors. The canonical example is the Hue↔Da Nang road, where the curve departs and arrives at zone centers instead of the correct edges (south of Hue, north of Da Nang).

## Assumption Reassessment (2026-03-26)

1. FITL visual config is at `data/games/fire-in-the-lake/visual-config.yaml`.
2. The Hue↔Da Nang route currently uses zone endpoints `da-nang:none` and `hue:none` without `anchor` values.
3. Spec 83 infrastructure is already implemented in runner code and tests:
   - `ZoneConnectionEndpointSchema` already accepts optional `anchor`.
   - `resolveConfiguredEndpoint` already offsets anchored zone endpoints to zone edges.
   - map-editor geometry/store/dragging support for zone-linked endpoint anchors is already present.
4. Existing FITL file tests currently assert route definitions structurally, but they do not yet prove that the authored FITL Hue↔Da Nang route resolves to edge-offset positions.
5. Anchor values use degrees from positive x-axis (east), counterclockwise, with screen y inversion.
6. Explicit connection anchors remain the right tool for shared junctions or off-zone bends; zone-endpoint `anchor` values are the right tool for endpoint attachment to a specific zone edge.

## Architecture Check

1. The clean architecture is to author FITL against the existing zone-linked endpoint-anchor model rather than introduce more detached `connectionAnchors` for zone-edge attachment. Detached anchors are brittle for endpoints because they stop following the zone if layout changes.
2. This ticket should stay focused on visual-config authoring plus integration-test hardening. New runner logic is out of scope unless a test proves an actual gap.
3. No engine or game-specific code changes are expected (F1/F3).
4. No backwards-compatibility shims or aliasing are needed (F9). The route should simply use the current canonical schema.

## What to Change

### 1. Add `anchor` values to Hue↔Da Nang route

The primary motivating example from the spec:

```yaml
"loc-hue-da-nang:none":
  points:
    - { kind: zone, zoneId: "da-nang:none", anchor: 90 }
    - { kind: zone, zoneId: "hue:none", anchor: 270 }
  segments:
    - kind: quadratic
      control: { kind: position, x: 480, y: 40 }
```

### 2. Audit other FITL connection routes

Review all connection routes in the FITL visual config. For each route where the endpoint should visibly attach to a specific zone edge, use zone-endpoint `anchor` values. Keep explicit `connectionAnchors` for shared junctions and non-zone bends. Routes where center attachment is acceptable can remain unchanged.

**Audit criteria**:
- Long routes connecting distant zones: likely need anchors for directional clarity
- Short routes between adjacent zones: center attachment may be acceptable
- Routes with control points that suggest a specific departure/arrival direction: should have anchors matching
- Do not replace shared authored junction anchors with zone endpoint anchors; those solve a different problem

## Files to Touch

- `tickets/83ZONEDGANCEND-007-fitl-visual-config-anchor-values.md` (modify first to correct scope/assumptions)
- `data/games/fire-in-the-lake/visual-config.yaml` (modify)
- `packages/runner/test/config/visual-config-files.test.ts` (modify to prove the FITL-authored route resolves to edge-offset geometry)

## Out of Scope

- Runner feature work already covered by tickets 001-006
- Texas Hold'em visual config (if it exists — no connection routes expected)
- Creating new routes or modifying route segments/control points
- Changing zone positions or dimensions

## Acceptance Criteria

### Tests That Must Pass

1. `data/games/fire-in-the-lake/visual-config.yaml` parses successfully via `VisualConfigSchema`
2. FITL file/integration tests assert that `loc-hue-da-nang:none` now serializes with `anchor: 90` for `da-nang:none` and `anchor: 270` for `hue:none`
3. FITL route-resolution coverage proves the authored Hue↔Da Nang route resolves to edge-offset positions rather than zone centers
4. Existing suite: `pnpm -F @ludoforge/runner test`
5. Existing suite: `pnpm -F @ludoforge/runner typecheck`
6. Existing suite: `pnpm -F @ludoforge/runner lint`

### Invariants

1. Routes without `anchor` continue to render at zone center because that is the current schema contract.
2. No schema validation errors introduced.
3. Shared/off-zone authored anchors remain intact where they model junctions rather than zone-edge attachment.
4. This ticket does not widen the architecture surface; it consumes the existing anchored-endpoint model.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/config/visual-config-files.test.ts` — update expected FITL route data for `loc-hue-da-nang:none`
2. `packages/runner/test/config/visual-config-files.test.ts` — add an assertion that the resolved Hue↔Da Nang route endpoints are offset from zone centers according to the authored anchors

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/config/visual-config-files.test.ts`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`
4. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completion date: 2026-03-26
- What actually changed: authored `anchor: 90` for `da-nang:none` and `anchor: 270` for `hue:none` on `loc-hue-da-nang:none` in FITL `visual-config.yaml`, and strengthened FITL file coverage so the suite now proves both the serialized route metadata and the resolved edge-offset geometry.
- What changed versus the original ticket plan: the ticket itself was corrected first because its core assumptions were stale. Spec 83 runner support was already implemented, so this was not a runner-feature ticket. The work stayed focused on visual-config authoring plus integration-test hardening.
- Audit result: reviewed the existing FITL connection routes against the current architecture. Shared `connectionAnchors` remain appropriate where they model shared junctions or off-zone bends. No additional route required endpoint-anchor conversion in this ticket.
- Verification results: `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/config/visual-config-files.test.ts`, `pnpm -F @ludoforge/runner typecheck`, and `pnpm -F @ludoforge/runner lint` passed on 2026-03-26. The targeted test command exercised the full runner Vitest suite under the current package script shape.
