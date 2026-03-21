# 71CONROUREN-010: Explicit Connection Route Paths Beyond Endpoint-Only Curves

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: archive/specs/71-connection-route-rendering.md, archive/tickets/71CONROUREN/71CONROUREN-009.md

## Problem

The current connection-route architecture is materially cleaner than the old proxy-endpoint model, but it still treats every route as a single curve between exactly two endpoints. That is not the ideal architecture for historically named or multi-stop routes such as `Saigon-An Loc-Ban Me Thuot`, where the visually correct shape is not a single inferred arc.

This forces geometry to be approximated from endpoints plus generic curvature instead of being declared explicitly in `visual-config.yaml`. The result is robust enough for now, but it still leaves route shape partially implicit in renderer math instead of fully owned by visual data.

## Assumption Reassessment (2026-03-21)

1. `71CONROUREN-009` has already established the generic anchor-aware endpoint architecture in this worktree:
   - `zones.connectionAnchors` exists in visual config
   - `zones.connectionEndpoints` already supports mixed `{ kind: zone | anchor }` refs
   - route resolution already carries resolved endpoint geometry into rendering
2. Therefore the old assumption that this ticket still needs to introduce non-zone anchors or replace a zone-id-only endpoint contract is false. That work is already done.
3. The actual remaining limitation is narrower and more architectural: a route is still rendered as one quadratic curve between exactly two resolved endpoints. Intermediate bends, corridors, and named multi-stop path topology still cannot be expressed explicitly in visual data.
4. FITL routes such as `Saigon-An Loc-Ban Me Thuot` are therefore still visually under-modeled. The problem is no longer endpoint ownership; it is missing ordered waypoint/path ownership.
5. The remaining gap is purely runner presentation topology. No engine/kernel/compiler changes are required.

## Architecture Check

1. The cleaner architecture is explicit route path data in `visual-config.yaml`, not additional renderer heuristics layered onto the new anchor contract. Visual path geometry belongs to F3 Visual Separation.
2. This keeps the engine agnostic under F1: route shapes remain runner presentation data only, with no game-specific logic in runtime/kernel.
3. This is better than adding more route-specific curvature rules or renderer heuristics. The path should be declared once as data and rendered generically.
4. The anchor-aware endpoint contract from `009` remains useful as the minimal 2-point route primitive, but long-term-correct topology for multi-stop routes should be an ordered point list. The path model should extend the endpoint model, not reintroduce inference.
5. No backwards-compatibility shims or alias paths. If path-aware route resolution changes an internal contract, all runner consumers and tests should move together in this change.

## What to Change

### 1. Add generic route-path primitives on top of the existing anchor model

Extend the runner visual-config contract so a connection route may declare a path as an ordered list of geometry refs instead of only a two-endpoint pair. The refs should reuse the same generic `zone` / `anchor` point vocabulary already introduced for `connectionEndpoints`.

One acceptable direction is:

```yaml
zones:
  connectionAnchors:
    an-loc: { x: 420, y: 250 }
    ban-me-thuot: { x: 560, y: 220 }

  connectionPaths:
    "loc-saigon-an-loc-ban-me-thuot:none":
      - { kind: zone, zoneId: "saigon:none" }
      - { kind: anchor, anchorId: "an-loc" }
      - { kind: anchor, anchorId: "ban-me-thuot" }
```

The exact schema may differ, but the contract must support 2+ ordered points, remain generic across games, and avoid duplicating a second incompatible point vocabulary.

### 2. Thread path geometry through presentation and rendering

- update schema, provider, and reference validation
- update route resolution to emit resolved path geometry, not only endpoint geometry
- update the renderer to draw multi-segment paths deterministically
- keep route labels, markers, badges, hit areas, and token ownership centered on the connection zone
- preserve the existing endpoint-only route behavior as the generic minimal case for routes that truly are just two points

### 3. Migrate FITL routes that are semantically multi-stop

Update FITL visual config so routes whose canonical names imply intermediate towns or path bends use explicit path geometry rather than a single inferred arc.

The migration should be data-owned and generic. No FITL-only renderer branches.

## Files to Touch

- `tickets/71CONROUREN-010.md` (new)
- `packages/runner/src/config/visual-config-types.ts` (modify)
- `packages/runner/src/config/visual-config-provider.ts` (modify)
- `packages/runner/src/config/validate-visual-config-refs.ts` (modify)
- `packages/runner/src/presentation/connection-route-resolver.ts` (modify)
- `packages/runner/src/presentation/presentation-scene.ts` (modify)
- `packages/runner/src/canvas/renderers/connection-route-renderer.ts` (modify)
- `packages/runner/test/config/visual-config-schema.test.ts` (modify)
- `packages/runner/test/config/visual-config-provider.test.ts` (modify)
- `packages/runner/test/config/validate-visual-config-refs.test.ts` (modify)
- `packages/runner/test/presentation/connection-route-resolver.test.ts` (modify)
- `packages/runner/test/presentation/presentation-scene.test.ts` (modify)
- `packages/runner/test/canvas/renderers/connection-route-renderer.test.ts` (modify)
- `packages/runner/test/config/visual-config-files.test.ts` (modify)
- `data/games/fire-in-the-lake/visual-config.yaml` (modify)

## Out of Scope

- Any engine/kernel/compiler changes
- Automatic path inference from labels or natural language
- Arbitrary spline editors or freehand path authoring tools
- Token interaction semantic changes for connection zones

## Acceptance Criteria

### Tests That Must Pass

1. Visual-config schema accepts explicit ordered route-path declarations with mixed zone/anchor refs.
2. Reference validation rejects unknown path refs and malformed under-length paths.
3. Route resolution emits deterministic resolved path geometry without FITL-specific branches.
4. The connection-route renderer draws multi-segment routes from resolved path geometry and preserves labels/markers/badges.
5. FITL production visual config uses explicit path geometry for the relevant multi-stop routes.
6. Existing suite: `pnpm -F @ludoforge/runner test`
7. `pnpm -F @ludoforge/runner typecheck`
8. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completion date: 2026-03-21
- What actually changed:
  - Corrected the ticket first to reflect the real starting point: the anchor-aware endpoint architecture from `71CONROUREN-009` was already present in this worktree, so this ticket focused on explicit ordered route paths rather than reintroducing anchor work.
  - Added generic `zones.connectionPaths` support on top of the existing `zone` / `anchor` point vocabulary.
  - Normalized route presentation onto ordered resolved path geometry, with endpoint-only routes preserved as the minimal two-point case and explicit multi-point routes rendered as deterministic polylines.
  - Migrated FITL `loc-saigon-an-loc-ban-me-thuot:none` to explicit path-owned geometry via the new `an-loc` anchor.
  - Strengthened schema, provider, reference-validation, resolver, scene, renderer, canvas-updater, and FITL production-config tests around the new path contract.
- Deviations from original plan:
  - The original ticket assumed this change still needed to add non-zone anchors and replace zone-only endpoint plumbing. That was already done, so the implemented scope was narrower and cleaner: explicit multi-point route geometry only.
  - The renderer keeps the existing curved behavior for true two-point routes. Explicit path data is used only where the route shape needs more than two points.
- Verification results:
  - `pnpm -F @ludoforge/runner exec vitest run test/config/visual-config-schema.test.ts`
  - `pnpm -F @ludoforge/runner exec vitest run test/config/visual-config-provider.test.ts`
  - `pnpm -F @ludoforge/runner exec vitest run test/config/validate-visual-config-refs.test.ts`
  - `pnpm -F @ludoforge/runner exec vitest run test/presentation/connection-route-resolver.test.ts`
  - `pnpm -F @ludoforge/runner exec vitest run test/presentation/presentation-scene.test.ts`
  - `pnpm -F @ludoforge/runner exec vitest run test/canvas/renderers/connection-route-renderer.test.ts`
  - `pnpm -F @ludoforge/runner exec vitest run test/config/visual-config-files.test.ts`
  - `pnpm -F @ludoforge/runner exec vitest run test/canvas/canvas-updater.test.ts`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner lint`

### Invariants

1. Route geometry remains entirely visual-config-owned data.
2. Connection zones remain the only logical gameplay zones; path points do not become gameplay spaces.
3. No backwards-compatibility aliases or route-name heuristics are introduced.
4. The existing anchor-aware endpoint model remains the canonical point vocabulary; path support must not fork the concept into parallel ad hoc schemas.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/config/visual-config-schema.test.ts` — proves ordered route paths parse and reject under-specified paths.
2. `packages/runner/test/config/visual-config-provider.test.ts` — proves path declarations are exposed deterministically.
3. `packages/runner/test/config/validate-visual-config-refs.test.ts` — proves mixed path refs validate strictly.
4. `packages/runner/test/presentation/connection-route-resolver.test.ts` — proves resolved path geometry is emitted deterministically and endpoint-only routes still resolve via the same generic point contract.
5. `packages/runner/test/presentation/presentation-scene.test.ts` — proves the scene path threads route geometry through the real pipeline.
6. `packages/runner/test/canvas/renderers/connection-route-renderer.test.ts` — proves the renderer draws multi-segment routes while preserving midpoint-owned labels/markers/badges.
7. `packages/runner/test/config/visual-config-files.test.ts` — proves FITL production config uses explicit path geometry where intended.

### Commands

1. `pnpm -F @ludoforge/runner exec vitest run test/config/visual-config-schema.test.ts`
2. `pnpm -F @ludoforge/runner exec vitest run test/config/visual-config-provider.test.ts`
3. `pnpm -F @ludoforge/runner exec vitest run test/config/validate-visual-config-refs.test.ts`
4. `pnpm -F @ludoforge/runner exec vitest run test/presentation/connection-route-resolver.test.ts`
5. `pnpm -F @ludoforge/runner exec vitest run test/presentation/presentation-scene.test.ts`
6. `pnpm -F @ludoforge/runner exec vitest run test/canvas/renderers/connection-route-renderer.test.ts`
7. `pnpm -F @ludoforge/runner exec vitest run test/config/visual-config-files.test.ts`
8. `pnpm -F @ludoforge/runner test`
9. `pnpm -F @ludoforge/runner typecheck`
10. `pnpm -F @ludoforge/runner lint`
