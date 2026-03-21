# 71CONROUREN-011: Explicit Shared Route Nodes And Junction Topology

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: archive/specs/71-connection-route-rendering.md, archive/tickets/71CONROUREN/71CONROUREN-009.md, archive/tickets/71CONROUREN/71CONROUREN-010.md

## Problem

The current junction model is still inferred from connection-to-connection adjacency and positioned as the midpoint between route zone layout positions. That is serviceable for simple route crossings, but it is not the ideal long-term architecture once route geometry becomes explicitly data-owned.

The better model is for shared visual route nodes and junction topology to be declared explicitly in visual config. A named crossing, fork, or meeting point should be represented once in route topology data and consumed by the renderer generically.

## Assumption Reassessment (2026-03-21)

1. `71CONROUREN-009` made endpoint geometry explicit, but junction nodes are still inferred from route-zone adjacency and route-zone layout positions. Confirmed in `packages/runner/src/presentation/connection-route-resolver.ts`.
2. The current midpoint inference is not the same as explicit shared-node topology. It works for some cases but still leaves an important piece of route geometry implicit.
3. Once explicit route paths exist, inferred midpoint junctions become an architectural mismatch. Shared nodes should be first-class visual topology, not a renderer afterthought.
4. This remains runner-only presentation work aligned with `docs/FOUNDATIONS.md`.

## Architecture Check

1. The clean architecture is a generic visual route graph: shared nodes/junctions are data, routes reference them, and the renderer consumes the resolved graph. This is cleaner than midpoint heuristics.
2. This preserves F1 and F3: the runner remains generic, while game-specific visual topology stays in `visual-config.yaml`.
3. Explicit shared nodes are more robust and extensible than route-zone-position midpoint math, especially for crossings, forks, and future map-driven games.
4. No aliasing or fallback heuristics should remain for production-authored shared topology once this is implemented.

## What to Change

### 1. Add generic shared route-node declarations

Extend visual config so a game can define named route nodes/junctions and reference them from multiple routes.

One acceptable direction is:

```yaml
zones:
  connectionAnchors:
    crossroads-a: { x: 400, y: 200 }

  connectionPaths:
    "loc-route-1:none":
      - { kind: zone, zoneId: "alpha:none" }
      - { kind: anchor, anchorId: "crossroads-a" }
      - { kind: zone, zoneId: "beta:none" }
    "loc-route-2:none":
      - { kind: zone, zoneId: "gamma:none" }
      - { kind: anchor, anchorId: "crossroads-a" }
      - { kind: zone, zoneId: "delta:none" }
```

The exact schema may differ, but the topology must let multiple routes share the same visual node explicitly.

### 2. Replace inferred midpoint junctions with resolved shared-node topology

- update route resolution to emit explicit shared-node junctions from path topology
- update rendering so junction dots/markers are positioned from shared-node geometry, not route-zone midpoint inference
- remove the old connection-to-connection midpoint-junction fallback for production-authored routes

### 3. Add production-facing topology assertions

Strengthen tests so production visual configs can prove whether shared topology is authored explicitly and whether junction rendering follows those declarations deterministically.

## Files to Touch

- `tickets/71CONROUREN-011.md` (new)
- `packages/runner/src/config/visual-config-types.ts` (modify)
- `packages/runner/src/config/visual-config-provider.ts` (modify)
- `packages/runner/src/config/validate-visual-config-refs.ts` (modify)
- `packages/runner/src/presentation/connection-route-resolver.ts` (modify)
- `packages/runner/src/canvas/renderers/connection-route-renderer.ts` (modify)
- `packages/runner/test/config/visual-config-schema.test.ts` (modify)
- `packages/runner/test/config/visual-config-provider.test.ts` (modify)
- `packages/runner/test/config/validate-visual-config-refs.test.ts` (modify)
- `packages/runner/test/presentation/connection-route-resolver.test.ts` (modify)
- `packages/runner/test/canvas/renderers/connection-route-renderer.test.ts` (modify)
- `packages/runner/test/config/visual-config-files.test.ts` (modify)
- `data/games/fire-in-the-lake/visual-config.yaml` (modify if FITL needs explicit shared nodes)

## Out of Scope

- Any engine/kernel/compiler changes
- Automatic graph extraction from adjacency data
- Generic route-editing tools
- Non-route board graph semantics

## Acceptance Criteria

### Tests That Must Pass

1. Visual-config schema accepts shared route-node topology declarations.
2. Reference validation rejects unknown shared-node refs and malformed route-graph declarations.
3. Route resolution emits explicit junction/shared-node outputs from topology data rather than inferred midpoint math.
4. The renderer positions junction visuals from shared-node geometry deterministically.
5. Existing suite: `pnpm -F @ludoforge/runner test`
6. `pnpm -F @ludoforge/runner typecheck`
7. `pnpm -F @ludoforge/runner lint`

### Invariants

1. Shared route nodes remain visual-topology data only; they do not become gameplay zones.
2. No game-specific branches are introduced in runner code.
3. Route crossings/forks are explicit data, not inferred from route-zone layout positions.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/config/visual-config-schema.test.ts` — proves shared route-node declarations parse.
2. `packages/runner/test/config/visual-config-provider.test.ts` — proves shared topology is exposed deterministically.
3. `packages/runner/test/config/validate-visual-config-refs.test.ts` — proves shared-node refs validate strictly.
4. `packages/runner/test/presentation/connection-route-resolver.test.ts` — proves explicit shared-node topology produces deterministic junction nodes.
5. `packages/runner/test/canvas/renderers/connection-route-renderer.test.ts` — proves junction visuals render from shared-node geometry, not midpoint inference.
6. `packages/runner/test/config/visual-config-files.test.ts` — proves any production-authored shared topology remains valid and deterministic.

### Commands

1. `pnpm -F @ludoforge/runner exec vitest run test/config/visual-config-schema.test.ts`
2. `pnpm -F @ludoforge/runner exec vitest run test/config/visual-config-provider.test.ts`
3. `pnpm -F @ludoforge/runner exec vitest run test/config/validate-visual-config-refs.test.ts`
4. `pnpm -F @ludoforge/runner exec vitest run test/presentation/connection-route-resolver.test.ts`
5. `pnpm -F @ludoforge/runner exec vitest run test/canvas/renderers/connection-route-renderer.test.ts`
6. `pnpm -F @ludoforge/runner exec vitest run test/config/visual-config-files.test.ts`
7. `pnpm -F @ludoforge/runner test`
8. `pnpm -F @ludoforge/runner typecheck`
9. `pnpm -F @ludoforge/runner lint`
