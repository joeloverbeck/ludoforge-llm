# 71CONROUREN-012: Explicit Route Segment Geometry And Curvature Ownership

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: archive/specs/71-connection-route-rendering.md, archive/tickets/71CONROUREN/71CONROUREN-010.md, archive/tickets/71CONROUREN/71CONROUREN-011.md

## Problem

`71CONROUREN-010` moved route topology onto explicit ordered path data, which is materially cleaner than the old endpoint-only contract. But route segment shape is still only partially data-owned:

- a 2-point route is rendered as a quadratic curve with curvature inferred by renderer math
- a 3+-point route is rendered as a polyline with straight segments between points

That is still not the ideal long-term architecture. The visual shape of a route segment should be declared in `visual-config.yaml`, not inferred from generic curvature defaults or constrained to straight-line bends. If a route needs a shallow arc, hard bend, or custom segment shape, that should be explicit data.

## Assumption Reassessment (2026-03-21)

1. `71CONROUREN-010` already established ordered `connectionPaths` and normalized route rendering onto resolved path geometry. The old assumption that path topology is still missing is false.
2. The current renderer still derives 2-point curvature from `computeControlPoint()` and treats multi-point paths as straight segment chains. Confirmed in `packages/runner/src/canvas/renderers/connection-route-renderer.ts`.
3. `71CONROUREN-011` is about shared visual nodes/junction topology, not segment-shape ownership. It will not, by itself, make route curvature or bend style explicit data.
4. The remaining `connectedConnectionIds` adjacency metadata in `packages/runner/src/presentation/connection-route-resolver.ts` is a separate architectural cleanup concern and should not be folded into this geometry ticket. It is tracked separately to keep route-shape ownership distinct from route-graph contract cleanup.
5. The remaining gap is runner-only presentation geometry and remains aligned with `docs/FOUNDATIONS.md`:
   - F1 Engine Agnosticism
   - F3 Visual Separation
   - F9 No Backwards Compatibility

## Architecture Check

1. The clean architecture is explicit segment geometry in `visual-config.yaml`: route point topology answers where a route goes, while segment geometry answers how it travels between those points.
2. This is cleaner than keeping curvature in renderer heuristics because visual shape remains data-owned, inspectable, and authorable per game without introducing game-specific branches.
3. This preserves game-agnostic runner behavior: the renderer consumes a generic segment contract and does not know or care which game authored it.
4. No backwards-compatibility aliasing or fallback schemas should be introduced. If the route geometry contract is refined, runner code and tests should move together in the same change.

## What to Change

### 1. Add generic route segment-geometry primitives

Extend the visual-config route contract so a connection path can declare explicit segment geometry rather than relying solely on renderer-derived curvature.

One acceptable direction is:

```yaml
zones:
  connectionPaths:
    "loc-hue-da-nang:none":
      points:
        - { kind: zone, zoneId: "hue:none" }
        - { kind: zone, zoneId: "da-nang:none" }
      segments:
        - { kind: quadratic, control: { x: 460, y: 120 } }
```

Another acceptable direction is a point-sequence contract with per-point bend metadata, provided the result is still:

- explicit
- generic across games
- deterministic
- fully visual-config-owned

The exact schema may differ, but the contract must let authored data distinguish straight segments from curved ones without depending on route-name heuristics or renderer defaults.

### 2. Normalize route resolution onto explicit render geometry

- update schema, provider, and reference validation
- update route resolution to emit explicit renderable segment geometry
- update the renderer to consume that geometry directly
- keep labels, badges, markers, hit areas, and selection anchored to the connection zone rather than to segment control data

### 3. Migrate production-authored routes that need explicit segment shape

Update FITL route data where authored shape meaningfully benefits from explicit curvature or segment geometry rather than the current generic defaults.

This migration must remain data-owned and generic. No FITL-only rendering branches.

## Files to Touch

- `tickets/71CONROUREN-012.md` (new)
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
- `data/games/fire-in-the-lake/visual-config.yaml` (modify if FITL benefits from explicit segment geometry)

## Out of Scope

- Any engine/kernel/compiler changes
- Route-editing tooling
- Automatic curvature inference from labels or natural language
- Shared-node/junction-topology ownership beyond what `71CONROUREN-011` covers
- Removing leftover adjacency-derived route-graph metadata such as `connectedConnectionIds`; that belongs in a separate cleanup ticket

## Acceptance Criteria

### Tests That Must Pass

1. Visual-config schema accepts explicit generic route segment-geometry declarations.
2. Reference validation rejects malformed segment-geometry declarations and unknown referenced geometry points.
3. Route resolution emits deterministic explicit render geometry without FITL-specific branches.
4. The renderer draws authored curved/straight route segments from resolved geometry rather than default curvature inference.
5. Production-authored FITL routes that need explicit segment shape use the new geometry contract.
6. Existing suite: `pnpm -F @ludoforge/runner test`
7. `pnpm -F @ludoforge/runner typecheck`
8. `pnpm -F @ludoforge/runner lint`

### Invariants

1. Route shape remains entirely visual-config-owned data; gameplay zones and rules do not change.
2. No game-specific branches, aliases, or route-name heuristics are introduced.
3. Route topology and route segment shape remain separate concerns in the data model so each can evolve cleanly.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/config/visual-config-schema.test.ts` — proves explicit segment-geometry declarations parse and malformed declarations fail.
2. `packages/runner/test/config/visual-config-provider.test.ts` — proves segment-geometry declarations are exposed deterministically.
3. `packages/runner/test/config/validate-visual-config-refs.test.ts` — proves geometry references validate strictly.
4. `packages/runner/test/presentation/connection-route-resolver.test.ts` — proves authored route geometry is resolved deterministically and without heuristics.
5. `packages/runner/test/canvas/renderers/connection-route-renderer.test.ts` — proves the renderer consumes authored segment geometry directly.
6. `packages/runner/test/config/visual-config-files.test.ts` — proves any production-authored route geometry remains valid and deterministic.

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
