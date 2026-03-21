# 71CONROUREN-012: Unified Connection Route Geometry Contract

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: archive/specs/71-connection-route-rendering.md, archive/tickets/71CONROUREN/71CONROUREN-010.md, archive/tickets/71CONROUREN/71CONROUREN-011.md

## Problem

`71CONROUREN-010` and `71CONROUREN-011` materially improved route rendering, but the route-geometry contract is still split across two config surfaces:

- `zones.connectionEndpoints` for 2-point routes
- `zones.connectionPaths` for 2+-point routes

That split was acceptable as an incremental step, but it is not the ideal long-term architecture:

- the topology model forks into two parallel route-definition shapes
- 2-point routes still depend on renderer curvature heuristics
- 3+-point routes can express bends but cannot declare curved segments explicitly

The clean architecture is one generic route-definition contract in `visual-config.yaml` that owns both point topology and per-segment geometry for every connection route, regardless of length.

## Assumption Reassessment (2026-03-21)

1. Ordered path topology already exists in the runner, so the old assumption that this ticket needs to invent path ownership from scratch is false.
2. The current renderer still derives 2-point curvature from `computeControlPoint()` and treats authored multi-point paths as straight segment chains. Confirmed in `packages/runner/src/canvas/renderers/connection-route-renderer.ts`.
3. The current config/provider/validator split between `connectionEndpoints` and `connectionPaths` is itself an architectural smell. Keeping that split and only bolting `segments` onto `connectionPaths` would preserve duplicate concepts instead of converging on one route contract.
4. `71CONROUREN-011` correctly moved junction ownership onto shared authored anchors, but it did not address the split route-definition contract or explicit per-segment geometry.
5. The remaining `connectedConnectionIds` adjacency metadata in `packages/runner/src/presentation/connection-route-resolver.ts` is still separate cleanup scope and should not be folded into this ticket.
6. The remaining gap is runner-only presentation geometry and remains aligned with `docs/FOUNDATIONS.md`:
   - F1 Engine Agnosticism
   - F3 Visual Separation
   - F9 No Backwards Compatibility

## Architecture Check

1. The better architecture is one generic route-definition map, not two parallel maps. Every connection route should resolve from the same config shape whether it uses 2 points or 5.
2. A unified contract is cleaner than extending only `connectionPaths`, because it removes duplicate provider methods, duplicate validator paths, and resolver branching between two conceptually identical inputs.
3. Each route definition should separate:
   - `points`: where the route goes
   - `segments`: how each consecutive point pair is rendered
4. Segment geometry should be explicit and generic:
   - `straight`
   - `quadratic` with an authored control point
5. This preserves game-agnostic runner behavior: the renderer consumes generic route geometry and does not know which game authored it.
6. No backwards-compatibility aliasing or legacy fallback schemas should survive this change. Runner code, tests, and FITL data should all move together onto the unified contract.

## What to Change

### 1. Replace the split route config with one unified route-definition contract

Replace `zones.connectionEndpoints` and `zones.connectionPaths` with a single `zones.connectionRoutes` map.

One acceptable direction is:

```yaml
zones:
  connectionRoutes:
    "loc-hue-da-nang:none":
      points:
        - { kind: zone, zoneId: "hue:none" }
        - { kind: zone, zoneId: "da-nang:none" }
      segments:
        - { kind: quadratic, control: { kind: position, x: 460, y: 120 } }
```

If reuse is beneficial, a quadratic control point may instead reference an existing authored anchor, for example:

```yaml
segments:
  - { kind: quadratic, control: { kind: anchor, anchorId: "hue-da-nang-arc" } }
```

The exact field names may differ, but the contract must be:

- explicit
- generic across games
- deterministic
- fully visual-config-owned
- singular rather than split across endpoint/path aliases

### 2. Normalize route resolution and rendering onto explicit route definitions

- update schema, provider, and reference validation around `connectionRoutes`
- update route resolution to emit explicit renderable segment geometry from the unified contract
- update the renderer to consume that geometry directly
- keep labels, badges, markers, hit areas, and selection anchored to the connection zone rather than to segment control data

### 3. Migrate FITL production data onto the unified contract

Update FITL route data so all connection routes use `zones.connectionRoutes`. Routes whose visual shape materially benefits from explicit curvature should declare it through explicit segment geometry instead of renderer defaults.

This migration must remain data-owned and generic. No FITL-only rendering branches.

## Files to Touch

- `tickets/71CONROUREN-012.md` (new)
- `packages/runner/src/config/visual-config-types.ts` (modify)
- `packages/runner/src/config/visual-config-provider.ts` (modify)
- `packages/runner/src/config/validate-visual-config-refs.ts` (modify)
- `packages/runner/src/presentation/connection-route-resolver.ts` (modify)
- `packages/runner/src/presentation/presentation-scene.ts` (modify)
- `packages/runner/src/canvas/renderers/connection-route-renderer.ts` (modify)
- `packages/runner/test/bootstrap/resolve-bootstrap-config.test.ts` (modify)
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
- Route-editing tooling
- Automatic curvature inference from labels or natural language
- Shared-node/junction-topology ownership beyond what `71CONROUREN-011` covers
- Removing leftover adjacency-derived route-graph metadata such as `connectedConnectionIds`; that belongs in a separate cleanup ticket

## Acceptance Criteria

### Tests That Must Pass

1. Visual-config schema accepts a unified `zones.connectionRoutes` contract with explicit point topology and segment geometry.
2. Reference validation rejects malformed route definitions, unknown zone/anchor refs, and segment-count mismatches.
3. Route resolution emits deterministic explicit render geometry from the unified route contract without FITL-specific branches.
4. The renderer draws authored straight and quadratic segments from resolved geometry rather than default curvature inference.
5. FITL production data uses the unified route contract rather than the old split endpoint/path config.
6. Existing suite: `pnpm -F @ludoforge/runner test`
7. `pnpm -F @ludoforge/runner typecheck`
8. `pnpm -F @ludoforge/runner lint`

### Invariants

1. Route geometry remains entirely visual-config-owned data; gameplay zones and rules do not change.
2. No game-specific branches, route-name heuristics, or legacy alias surfaces remain.
3. Route topology and route segment shape remain separate concerns inside one data model so each can evolve cleanly.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/config/visual-config-schema.test.ts` — proves unified route definitions parse and malformed segment declarations fail.
2. `packages/runner/test/config/visual-config-provider.test.ts` — proves unified route definitions are exposed deterministically.
3. `packages/runner/test/config/validate-visual-config-refs.test.ts` — proves route point/control references validate strictly and segment-count mismatches fail.
4. `packages/runner/test/presentation/connection-route-resolver.test.ts` — proves authored route geometry resolves deterministically and without curvature heuristics.
5. `packages/runner/test/presentation/presentation-scene.test.ts` — proves the real scene pipeline consumes the unified route contract.
6. `packages/runner/test/canvas/renderers/connection-route-renderer.test.ts` — proves the renderer consumes authored segment geometry directly.
7. `packages/runner/test/config/visual-config-files.test.ts` — proves FITL production route geometry remains valid and deterministic after migration.
8. `packages/runner/test/bootstrap/resolve-bootstrap-config.test.ts` — proves the bootstrap provider exposes the new unified route contract.

### Commands

1. `pnpm -F @ludoforge/runner exec vitest run test/config/visual-config-schema.test.ts`
2. `pnpm -F @ludoforge/runner exec vitest run test/config/visual-config-provider.test.ts`
3. `pnpm -F @ludoforge/runner exec vitest run test/config/validate-visual-config-refs.test.ts`
4. `pnpm -F @ludoforge/runner exec vitest run test/presentation/connection-route-resolver.test.ts`
5. `pnpm -F @ludoforge/runner exec vitest run test/presentation/presentation-scene.test.ts`
6. `pnpm -F @ludoforge/runner exec vitest run test/canvas/renderers/connection-route-renderer.test.ts`
7. `pnpm -F @ludoforge/runner exec vitest run test/config/visual-config-files.test.ts`
8. `pnpm -F @ludoforge/runner exec vitest run test/bootstrap/resolve-bootstrap-config.test.ts`
9. `pnpm -F @ludoforge/runner test`
10. `pnpm -F @ludoforge/runner typecheck`
11. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completion date: 2026-03-21
- What actually changed:
  - corrected the ticket first so it targeted the real architectural gap: the split `connectionEndpoints` / `connectionPaths` route contract, not missing path ownership
  - replaced that split with one generic `zones.connectionRoutes` contract that owns ordered route points plus per-segment geometry
  - updated schema, provider, reference validation, presentation-scene wiring, route resolution, renderer logic, FITL production visual config, and runner tests to use the unified contract
  - removed renderer-owned 2-point curvature inference in favor of authored `straight` and `quadratic` segments, with resolved control-point geometry threaded through presentation
- Deviations from original plan:
  - the originally proposed `segments`-on-`connectionPaths` direction was not used because it would have preserved the old split architecture
  - the implemented contract is broader but cleaner: one route-definition surface instead of layered aliases
  - the resolver still supports the generic adjacency-based straight-line fallback when a game authors no route definition at all; that is base renderer behavior, not a legacy alias surface
- Verification results:
  - `pnpm -F @ludoforge/runner exec vitest run test/config/visual-config-schema.test.ts test/config/visual-config-provider.test.ts test/config/validate-visual-config-refs.test.ts test/presentation/connection-route-resolver.test.ts test/presentation/presentation-scene.test.ts test/canvas/renderers/connection-route-renderer.test.ts test/config/visual-config-files.test.ts test/bootstrap/resolve-bootstrap-config.test.ts`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner lint`
