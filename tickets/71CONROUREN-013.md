# 71CONROUREN-013: Remove Adjacency-Derived Route Graph Metadata

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: archive/specs/71-connection-route-rendering.md, archive/tickets/71CONROUREN/71CONROUREN-011.md, tickets/71CONROUREN-012.md

## Problem

`71CONROUREN-011` made shared-anchor topology authoritative for junctions, but `ConnectionRouteNode` still carries `connectedConnectionIds` derived from adjacency between connection zones. That data is now architecturally stale:

- it no longer drives junction resolution
- it keeps route graph semantics tied to presentation adjacency rather than authored topology
- it risks future drift as route geometry becomes more explicitly data-owned

The clean architecture is for resolved route nodes to expose only the data that is still authoritative and consumed.

## Assumption Reassessment (2026-03-21)

1. `packages/runner/src/presentation/connection-route-resolver.ts` still computes and stores `connectedConnectionIds` from adjacency between connection zones even after junction resolution moved to shared authored anchors.
2. Current runner tests added in `71CONROUREN-011` prove junction rendering no longer depends on connection-to-connection adjacency midpoint heuristics, which means `connectedConnectionIds` is no longer required for the active route-junction pipeline.
3. `71CONROUREN-012` is about explicit segment geometry and curvature ownership. Folding adjacency-metadata cleanup into that ticket would mix route-graph contract cleanup with segment-shape authoring, which is the wrong architectural seam.
4. This cleanup is runner-only and aligns with `docs/FOUNDATIONS.md`:
   - F1 Engine Agnosticism
   - F3 Visual Separation
   - F9 No Backwards Compatibility
   - F10 Architectural Completeness

## Architecture Check

1. Removing stale adjacency-derived metadata is cleaner than preserving unused route-graph fields "just in case". The route contract should reflect current truth, not historical implementation leftovers.
2. This preserves the game-agnostic boundary because the runner remains a generic consumer of visual-config-owned topology rather than a hybrid of authored topology plus inferred route graph state.
3. No backwards-compatibility aliasing should be introduced. If `connectedConnectionIds` is no longer part of the correct route contract, all consumers and tests should be updated in the same change.

## What to Change

### 1. Remove stale route-graph fields from the resolved route contract

- remove `connectedConnectionIds` from `ConnectionRouteNode`
- stop collecting adjacency-derived connection-neighbor metadata during route resolution
- update any downstream types or tests that still mention the removed field

### 2. Prove the route pipeline still works without adjacency-derived route graph data

- keep junction resolution based on shared authored anchors
- ensure route rendering, scene construction, and production FITL coverage still pass without the deleted field
- verify no remaining code path depends on connection-to-connection adjacency metadata for route presentation behavior

## Files to Touch

- `tickets/71CONROUREN-013.md` (new)
- `packages/runner/src/presentation/connection-route-resolver.ts` (modify)
- `packages/runner/src/presentation/presentation-scene.ts` (modify if type propagation requires it)
- `packages/runner/test/presentation/connection-route-resolver.test.ts` (modify)
- `packages/runner/test/presentation/presentation-scene.test.ts` (modify if expectations mention the removed field)
- `packages/runner/test/canvas/renderers/connection-route-renderer.test.ts` (modify if route fixtures mention the removed field)
- `packages/runner/test/config/visual-config-files.test.ts` (modify only if route-node shape assertions need adjustment)

## Out of Scope

- Any engine/kernel/compiler changes
- Explicit segment geometry and curvature ownership; that belongs to `71CONROUREN-012`
- New route topology config surfaces
- Reintroducing any adjacency-based junction inference

## Acceptance Criteria

### Tests That Must Pass

1. `ConnectionRouteNode` no longer exposes adjacency-derived `connectedConnectionIds`.
2. Route resolution, scene assembly, and renderer tests pass with the reduced route contract.
3. Production FITL route topology coverage still passes with shared-anchor junction ownership intact.
4. Existing suite: `pnpm -F @ludoforge/runner test`
5. `pnpm -F @ludoforge/runner typecheck`
6. `pnpm -F @ludoforge/runner lint`

### Invariants

1. Resolved route contracts contain only authoritative, currently consumed presentation topology data.
2. Shared route topology remains authored visual data, not adjacency-derived inference.
3. No alias fields or deprecated compatibility shims are introduced.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/presentation/connection-route-resolver.test.ts` — proves resolved route objects no longer expose adjacency-derived connection-neighbor metadata.
2. `packages/runner/test/presentation/presentation-scene.test.ts` — proves scene-level connection route outputs still match the cleaned contract.
3. `packages/runner/test/canvas/renderers/connection-route-renderer.test.ts` — keeps renderer fixtures aligned with the reduced route contract.
4. `packages/runner/test/config/visual-config-files.test.ts` — confirms production FITL route resolution still behaves deterministically after the contract cleanup.

### Commands

1. `pnpm -F @ludoforge/runner exec vitest run test/presentation/connection-route-resolver.test.ts`
2. `pnpm -F @ludoforge/runner exec vitest run test/presentation/presentation-scene.test.ts`
3. `pnpm -F @ludoforge/runner exec vitest run test/canvas/renderers/connection-route-renderer.test.ts`
4. `pnpm -F @ludoforge/runner exec vitest run test/config/visual-config-files.test.ts`
5. `pnpm -F @ludoforge/runner test`
6. `pnpm -F @ludoforge/runner typecheck`
7. `pnpm -F @ludoforge/runner lint`
