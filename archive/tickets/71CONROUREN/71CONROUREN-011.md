# 71CONROUREN-011: Explicit Shared Route Nodes And Junction Topology

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: archive/specs/71-connection-route-rendering.md, archive/tickets/71CONROUREN/71CONROUREN-009.md, archive/tickets/71CONROUREN/71CONROUREN-010.md

## Problem

The current junction model is still inferred from connection-to-connection adjacency and positioned as the midpoint between route zone layout positions. That is serviceable for simple route crossings, but it is not the ideal long-term architecture once route geometry becomes explicitly data-owned.

The better model is for shared visual route nodes and junction topology to be declared explicitly in visual config. A named crossing, fork, or meeting point should be represented once in route topology data and consumed by the renderer generically.

## Assumption Reassessment (2026-03-21)

1. `71CONROUREN-009` already introduced generic `connectionAnchors`, `connectionEndpoints`, and `connectionPaths` support in schema, provider, reference validation, runner wiring, FITL visual config, and tests. Those pieces do not need to be invented again.
2. The remaining architectural gap is specifically in junction resolution: `packages/runner/src/presentation/connection-route-resolver.ts` still creates junction markers from connection-zone adjacency and route-zone midpoint math instead of from authored shared route topology.
3. FITL already authors reusable anchors such as `ban-me-thuot`, `da-lat`, `dak-to`, and `khe-sanh`. Those anchors are the correct generic primitive for shared route nodes, but the current resolver does not elevate shared anchor usage into explicit junction outputs.
4. This remains runner-only presentation work aligned with `docs/FOUNDATIONS.md`, and the cleanest scope is to finish the explicit-topology architecture already started rather than adding a parallel model.

## Architecture Check

1. The clean architecture is a generic visual route graph: shared nodes/junctions are data, routes reference them, and the renderer consumes the resolved graph. This is cleaner than midpoint heuristics.
2. This preserves F1 and F3: the runner remains generic, while game-specific visual topology stays in `visual-config.yaml`.
3. Explicit shared nodes are more robust and extensible than route-zone-position midpoint math, especially for crossings, forks, and future map-driven games.
4. The current config/provider architecture is already directionally correct. The needed change is to make shared-anchor topology authoritative for junction markers and remove the resolver's midpoint-junction heuristic rather than adding new alias surfaces.

## What to Change

### 1. Make authored shared anchors the authoritative junction topology

No new config surface is required unless a production map lacks the shared anchors needed to describe its topology. Reuse the existing generic primitives:

- `zones.connectionAnchors`
- `zones.connectionEndpoints`
- `zones.connectionPaths`

Two or more resolved routes that reference the same authored anchor should produce one explicit shared junction node at that anchor's authored coordinates.

### 2. Replace inferred midpoint junctions with resolved shared-anchor topology

- update route resolution to emit explicit shared-node junctions from path topology
- treat authored anchors shared by multiple routes as the source of truth for junction identity and position
- update rendering expectations so junction dots/markers are positioned from shared-anchor geometry, not route-zone midpoint inference
- remove the old connection-to-connection midpoint-junction heuristic entirely rather than keeping a parallel fallback path

### 3. Add production-facing topology assertions

Strengthen tests so production visual configs prove whether shared topology is authored explicitly and whether junction rendering follows those declarations deterministically.

## Files to Touch

- `tickets/71CONROUREN-011.md` (modify)
- `packages/runner/src/presentation/connection-route-resolver.ts` (modify)
- `packages/runner/src/canvas/renderers/connection-route-renderer.ts` (modify)
- `packages/runner/test/presentation/connection-route-resolver.test.ts` (modify)
- `packages/runner/test/canvas/renderers/connection-route-renderer.test.ts` (modify)
- `packages/runner/test/config/visual-config-files.test.ts` (modify)
- `data/games/fire-in-the-lake/visual-config.yaml` (modify only if FITL needs additional explicit shared anchors/paths beyond what is already authored)

## Out of Scope

- Any engine/kernel/compiler changes
- Automatic graph extraction from adjacency data
- Generic route-editing tools
- Non-route board graph semantics

## Acceptance Criteria

### Tests That Must Pass

1. Route resolution emits explicit junction/shared-node outputs from authored shared-anchor topology rather than inferred midpoint math.
2. Shared anchors referenced by multiple routes produce one deterministic junction node at the authored anchor coordinates.
3. The renderer positions junction visuals from resolved shared-anchor geometry deterministically.
4. Production FITL route topology resolves shared junctions from authored anchors without relying on connection-to-connection adjacency midpoint inference.
5. Existing suite: `pnpm -F @ludoforge/runner test`
6. `pnpm -F @ludoforge/runner typecheck`
7. `pnpm -F @ludoforge/runner lint`

### Invariants

1. Shared route nodes remain visual-topology data only; they do not become gameplay zones.
2. No game-specific branches are introduced in runner code.
3. Route crossings/forks are explicit data, not inferred from route-zone layout positions.
4. The resolver no longer synthesizes junction positions from connection-zone positions.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/presentation/connection-route-resolver.test.ts` — proves shared anchors used by multiple routes produce deterministic junction nodes and that adjacency-only midpoint junctions no longer exist.
2. `packages/runner/test/canvas/renderers/connection-route-renderer.test.ts` — proves junction visuals render from shared-anchor geometry and still color-resolve correctly for shared nodes.
3. `packages/runner/test/config/visual-config-files.test.ts` — proves production FITL route topology resolves shared junctions from authored anchors deterministically.

### Commands

1. `pnpm -F @ludoforge/runner exec vitest run test/presentation/connection-route-resolver.test.ts`
2. `pnpm -F @ludoforge/runner exec vitest run test/canvas/renderers/connection-route-renderer.test.ts`
3. `pnpm -F @ludoforge/runner exec vitest run test/config/visual-config-files.test.ts`
4. `pnpm -F @ludoforge/runner test`
5. `pnpm -F @ludoforge/runner typecheck`
6. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completion date: 2026-03-21
- What actually changed:
  - narrowed the ticket after reassessment because `connectionAnchors`, `connectionEndpoints`, `connectionPaths`, FITL data, and their config/provider/reference-validation coverage were already implemented
  - updated `connection-route-resolver` so junctions are emitted from shared authored anchors referenced by multiple resolved routes
  - removed the resolver's connection-to-connection midpoint junction heuristic
  - strengthened runner tests to prove adjacency alone no longer creates junctions, shared anchors do, and FITL resolves deterministic shared junctions from authored anchor topology
- Deviations from original plan:
  - no schema, provider, validator, or production YAML changes were needed
  - renderer logic did not need structural changes beyond validating the new multi-route shared-junction contract through tests
- Verification results:
  - `pnpm -F @ludoforge/runner exec vitest run test/presentation/connection-route-resolver.test.ts`
  - `pnpm -F @ludoforge/runner exec vitest run test/canvas/renderers/connection-route-renderer.test.ts`
  - `pnpm -F @ludoforge/runner exec vitest run test/config/visual-config-files.test.ts`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner lint`
