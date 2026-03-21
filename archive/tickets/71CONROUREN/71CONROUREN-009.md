# 71CONROUREN-009: Generic Non-Zone Route Anchors For Connection Rendering

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: archive/specs/71-connection-route-rendering.md, archive/tickets/71CONROUREN/71CONROUREN-006.md

## Problem

The current connection-route architecture assumes every rendered route endpoint must be an existing board zone. That works for many games, but it is not the ideal model for Fire in the Lake and similar map-driven games where a route name may refer to a town or junction that is not encoded as a standalone board zone in `GameDef`.

As a result, FITL currently uses explicit neighboring board-zone proxies for some route endpoints. This is workable, but it conflates visual geometry with gameplay adjacency and weakens the clarity of `visual-config.yaml`. The cleaner long-term architecture is to let visual config define route anchors explicitly, including non-zone anchors, while keeping the runtime and kernel fully game-agnostic.

## Assumption Reassessment (2026-03-21)

1. `71CONROUREN-006` already completed the first FITL migration to `shape: connection`, `connectionStyles`, and explicit `zones.connectionEndpoints`. The old assumption that this ticket must introduce those primitives is false.
2. The resolver still contains a zone-id parsing fallback (`resolveEndpointsByZoneIdParsing()` in `packages/runner/src/presentation/connection-route-resolver.ts`). The old assumption that route topology is already fully owned by visual config is false.
3. The current route/render contract is zone-backed all the way through:
   - visual config stores `zones.connectionEndpoints` as `[zoneId, zoneId]`
   - `ConnectionRouteNode` exposes `endpointZoneIds`
   - the renderer resolves geometry from `positions.get(zoneId)`
4. Because of that contract, non-zone anchors cannot be added just by extending schema/provider validation. The presentation pipeline must carry endpoint geometry or endpoint references that can resolve to geometry without requiring a runtime zone.
5. The remaining limitation is still not a GameSpecDoc correctness bug. FITL route names such as `Hue-Khe Sanh`, `Saigon-Da Lat`, or `Can Tho-Chau Doc` can be historically meaningful labels even when the named town is not modeled as a standalone board zone in the current `GameDef`.
6. The mismatch is therefore visual-topology expressiveness, not kernel semantics. Fixing it belongs in runner visual config / presentation architecture, not in the engine and not by adding more FITL proxy aliases.

## Architecture Check

1. The clean architecture is explicit visual anchors owned by `visual-config.yaml`, with connection routes allowed to target either:
   - an existing zone anchor, or
   - a named fixed visual anchor with coordinates supplied through visual config
2. This aligns with `docs/FOUNDATIONS.md`:
   - F1 Engine Agnosticism: no game-specific logic in kernel/runtime
   - F3 Visual Separation: game-specific route geometry stays in `visual-config.yaml`
   - F9 No Backwards Compatibility: no FITL-only shims or alias paths
3. This is cleaner than forcing every visually meaningful town or junction to become a mechanical zone. Mechanical map spaces and visual route anchors are different concepts and should stay separate.
4. The runner should expose one generic route-anchor contract that any game can use. FITL is only the motivating case, not a branch in the implementation.
5. The better long-term architecture is to retire the zone-id parsing heuristic once explicit endpoint declarations exist. A generic visual-topology contract is more robust and extensible than inferring topology from naming conventions.

## What to Change

### 1. Add generic route-anchor config primitives

Extend runner visual config so a connection route can declare endpoints through a generic anchor contract instead of a raw zone-id pair only.

One acceptable direction is:

```yaml
zones:
  connectionAnchors:
    khe-sanh:
      x: 120
      y: 80
    da-lat:
      x: 480
      y: 310

  connectionEndpoints:
    "loc-hue-khe-sanh:none":
      - { kind: zone, zoneId: "hue:none" }
      - { kind: anchor, anchorId: "khe-sanh" }
```

The exact schema may differ, but the contract must distinguish zone-backed anchors from pure visual anchors. It must replace the current `connectionEndpoints: Record<string, [zoneId, zoneId]>` contract rather than layering aliases on top of it.

### 2. Thread anchor-aware resolution through the presentation pipeline

- update visual-config schema and provider APIs
- validate route-anchor references
- update connection-route resolution to produce renderable endpoint geometry from zone positions and/or configured visual anchors
- update the route node / renderer contract so rendering no longer depends on endpoint zone ids only
- keep unresolved or invalid routes fail-closed and deterministic
- remove the zone-id parsing fallback once explicit endpoint declarations are in place

### 3. Keep token/interactions centered on the connection zone itself

This ticket is only about route geometry endpoints. It must not change the fact that:

- the connection zone remains the logical zone for tokens, markers, selection, and move targeting
- non-zone anchors are visual geometry inputs only

### 4. Migrate FITL off proxy endpoints

Once the generic contract exists, update FITL visual config so routes that currently use neighboring board-zone proxies instead use the appropriate named visual anchors.

## Files to Touch

- `tickets/71CONROUREN-009.md` (update first)
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
- Re-encoding FITL map spaces solely to satisfy visual route geometry
- Changes to connection-route marker rendering, token rendering, or interaction semantics
- Automatic anchor inference from labels or natural language

## Acceptance Criteria

### Tests That Must Pass

1. Visual-config schema accepts generic route-anchor declarations and endpoint references to those anchors.
2. Reference validation rejects unknown anchor ids and unknown zone ids in endpoint declarations.
3. Connection-route resolution supports mixed zone/anchor endpoints without introducing FITL-specific branches.
4. Connection-route rendering consumes resolved endpoint geometry without requiring endpoint ids to be zones.
5. Connection routes still fail closed when endpoint geometry is invalid or missing.
6. The zone-id parsing fallback is removed; production route topology is fully explicit.
7. FITL production visual config no longer needs proxy board-zone endpoints for routes whose canonical labels refer to non-zone towns/junctions.
8. Existing suite: `pnpm -F @ludoforge/runner test`
9. `pnpm -F @ludoforge/runner typecheck`
10. `pnpm -F @ludoforge/runner lint`

### Invariants

1. Route-anchor geometry remains visual-config-owned data; no game-specific logic leaks into generic runner code.
2. Mechanical zones and visual anchors remain separate concepts. Non-zone anchors do not become gameplay spaces.
3. No backwards-compat aliasing or FITL-only fallback behavior is introduced.
4. Route topology is explicit data, not inferred from route-id naming conventions.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/config/visual-config-schema.test.ts` — proves the new generic route-anchor schema parses.
2. `packages/runner/test/config/visual-config-provider.test.ts` — proves the provider exposes anchor declarations and endpoint definitions deterministically.
3. `packages/runner/test/config/validate-visual-config-refs.test.ts` — proves anchor and endpoint references are validated strictly.
4. `packages/runner/test/presentation/connection-route-resolver.test.ts` — proves mixed zone/anchor endpoint resolution works, explicit topology wins, and invalid anchor geometry fails closed.
5. `packages/runner/test/presentation/presentation-scene.test.ts` — proves the scene path consumes provider-owned anchor geometry correctly.
6. `packages/runner/test/canvas/renderers/connection-route-renderer.test.ts` — proves route rendering uses resolved endpoint geometry and no longer requires endpoint zone positions.
7. `packages/runner/test/config/visual-config-files.test.ts` — proves FITL production config uses the generic anchor contract as intended.

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

## Outcome

- Completion date: 2026-03-21
- What actually changed:
  - Added generic `zones.connectionAnchors` plus mixed `zone` / `anchor` endpoint definitions to the runner visual-config contract.
  - Replaced the route/render contract’s zone-id-only endpoint model with resolved endpoint geometry, so connection rendering no longer requires every endpoint to be a runtime zone.
  - Removed the zone-id parsing fallback from `resolveConnectionRoutes()` and kept the deterministic two-neighbor structural fallback only.
  - Migrated FITL connection endpoints away from neighboring board-zone proxies and onto named non-zone anchors where the route label refers to towns/junctions not modeled as zones.
  - Strengthened schema, provider, reference-validation, resolver, scene, renderer, canvas-updater, and FITL production-config tests around the new anchor contract.
- Deviations from originally planned scope:
  - The ticket initially understated the implementation surface. The renderer and route node contract had to change as well, because schema/provider changes alone could not support non-zone anchors.
  - The architecture is now cleaner than the pre-ticket state, but the ideal long-term model for multi-stop named routes would be explicit route waypoints/polyline geometry rather than endpoint-only curves. That is a separate follow-up, not required for this ticket.
- Verification:
  - `pnpm -F @ludoforge/runner exec vitest run test/config/visual-config-schema.test.ts`
  - `pnpm -F @ludoforge/runner exec vitest run test/config/visual-config-provider.test.ts`
  - `pnpm -F @ludoforge/runner exec vitest run test/config/validate-visual-config-refs.test.ts`
  - `pnpm -F @ludoforge/runner exec vitest run test/presentation/connection-route-resolver.test.ts`
  - `pnpm -F @ludoforge/runner exec vitest run test/presentation/presentation-scene.test.ts`
  - `pnpm -F @ludoforge/runner exec vitest run test/canvas/renderers/connection-route-renderer.test.ts`
  - `pnpm -F @ludoforge/runner exec vitest run test/canvas/canvas-updater.test.ts`
  - `pnpm -F @ludoforge/runner exec vitest run test/config/visual-config-files.test.ts`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner lint`
