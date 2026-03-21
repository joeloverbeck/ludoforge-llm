# 71CONROUREN-013: Remove Adjacency-Derived Route Graph Metadata

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: archive/specs/71-connection-route-rendering.md, archive/tickets/71CONROUREN/71CONROUREN-011.md, archive/tickets/71CONROUREN/71CONROUREN-012.md

## Problem

`71CONROUREN-011` made shared-anchor topology authoritative for junctions, but `ConnectionRouteNode` still carries `connectedConnectionIds` derived from adjacency between connection zones. That data is now architecturally stale:

- it no longer drives junction resolution
- it keeps route graph semantics tied to presentation adjacency rather than authored topology
- it risks future drift as route geometry becomes more explicitly data-owned

The clean architecture is for resolved route nodes to expose only the data that is still authoritative and consumed.

## Assumption Reassessment (2026-03-21)

1. `packages/runner/src/presentation/connection-route-resolver.ts` still computes and stores `connectedConnectionIds` from adjacency between connection zones even after junction resolution moved to shared authored anchors.
2. The current runner codebase does not consume `connectedConnectionIds` anywhere downstream. A repo-wide search on 2026-03-21 shows the field is only:
   - declared on `ConnectionRouteNode`
   - populated in `resolveConnectionRoutes()`
   - referenced by two runner tests as fixture/expectation shape
3. Current junction rendering does not depend on connection-to-connection adjacency midpoint heuristics. Junctions are resolved from shared authored anchors, so `connectedConnectionIds` is not part of the active route-junction pipeline.
4. `71CONROUREN-012` is now completed and did move the runner onto a unified `zones.connectionRoutes` geometry contract. That ticket explicitly left `connectedConnectionIds` as separate cleanup scope, so this ticket remains the correct follow-up seam for deleting the last adjacency-derived route metadata.
5. `presentation-scene` and FITL route-config validation still exercise the overall route pipeline, but they do not currently assert or depend on `connectedConnectionIds`. Any changes there should be limited to new invariant coverage if it adds signal.
6. This cleanup is runner-only and aligns with `docs/FOUNDATIONS.md`:
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

- treat this as the post-`71CONROUREN-012` cleanup that finishes the route contract simplification
- remove `connectedConnectionIds` from `ConnectionRouteNode`
- stop collecting adjacency-derived connection-neighbor metadata during route resolution
- update any downstream types or tests that still mention the removed field

### 2. Prove the route pipeline still works without adjacency-derived route graph data

- keep junction resolution based on shared authored anchors
- ensure resolver, scene construction, renderer fixtures, and production FITL route coverage still pass without the deleted field
- verify no remaining code path depends on connection-to-connection adjacency metadata for route presentation behavior

## Files to Touch

- `tickets/71CONROUREN-013.md` (modify)
- `packages/runner/src/presentation/connection-route-resolver.ts` (modify)
- `packages/runner/test/presentation/connection-route-resolver.test.ts` (modify)
- `packages/runner/test/canvas/renderers/connection-route-renderer.test.ts` (modify)
- `packages/runner/test/presentation/presentation-scene.test.ts` (modify only if adding direct invariant coverage improves signal)
- `packages/runner/test/config/visual-config-files.test.ts` (modify only if adding direct invariant coverage improves signal)

## Out of Scope

- Any engine/kernel/compiler changes
- Route geometry ownership or unified route-definition schema work; that was completed in `archive/tickets/71CONROUREN/71CONROUREN-012.md`
- New route topology config surfaces
- Reintroducing any adjacency-based junction inference
- Broad presentation-scene or config refactors unrelated to removing the stale field

## Acceptance Criteria

### Tests That Must Pass

1. `ConnectionRouteNode` no longer exposes adjacency-derived `connectedConnectionIds`.
2. `resolveConnectionRoutes()` no longer collects adjacency-derived connection-neighbor metadata.
3. Route resolution and renderer tests pass with the reduced route contract.
4. Production FITL route topology coverage still passes with shared-anchor junction ownership intact.
5. Existing suite: `pnpm -F @ludoforge/runner test`
6. `pnpm -F @ludoforge/runner typecheck`
7. `pnpm -F @ludoforge/runner lint`

### Invariants

1. Resolved route contracts contain only authoritative, currently consumed presentation topology data.
2. Shared route topology remains authored visual data, not adjacency-derived inference.
3. No alias fields or deprecated compatibility shims are introduced.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/presentation/connection-route-resolver.test.ts` — proves resolved route objects no longer expose adjacency-derived connection-neighbor metadata and that shared-anchor junction resolution remains intact.
2. `packages/runner/test/canvas/renderers/connection-route-renderer.test.ts` — keeps renderer fixtures aligned with the reduced route contract.
3. `packages/runner/test/presentation/presentation-scene.test.ts` — optional invariant coverage only if it materially improves confidence in the scene pipeline contract.
4. `packages/runner/test/config/visual-config-files.test.ts` — optional invariant coverage only if it materially improves confidence in production FITL route resolution.

### Commands

1. `pnpm -F @ludoforge/runner exec vitest run test/presentation/connection-route-resolver.test.ts`
2. `pnpm -F @ludoforge/runner exec vitest run test/presentation/presentation-scene.test.ts`
3. `pnpm -F @ludoforge/runner exec vitest run test/canvas/renderers/connection-route-renderer.test.ts`
4. `pnpm -F @ludoforge/runner exec vitest run test/config/visual-config-files.test.ts`
5. `pnpm -F @ludoforge/runner test`
6. `pnpm -F @ludoforge/runner typecheck`
7. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completion date: 2026-03-21
- What actually changed:
  - corrected the ticket first so its assumptions matched the real codebase: `connectedConnectionIds` was stale resolver-only metadata with no runtime consumers, not a broader scene/config dependency
  - removed `connectedConnectionIds` from `ConnectionRouteNode` and stopped collecting adjacency-derived connection-neighbor metadata in `resolveConnectionRoutes()`
  - updated the affected renderer fixture and strengthened resolver/scene tests to assert that resolved routes no longer expose the removed field
- Deviations from original plan:
  - `packages/runner/src/presentation/presentation-scene.ts` did not need production code changes
  - `packages/runner/test/config/visual-config-files.test.ts` did not need changes because FITL route-topology coverage already validated the active route contract without mentioning the stale field
- Verification results:
  - `pnpm -F @ludoforge/runner exec vitest run test/presentation/connection-route-resolver.test.ts`
  - `pnpm -F @ludoforge/runner exec vitest run test/presentation/presentation-scene.test.ts`
  - `pnpm -F @ludoforge/runner exec vitest run test/canvas/renderers/connection-route-renderer.test.ts`
  - `pnpm -F @ludoforge/runner exec vitest run test/config/visual-config-files.test.ts`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner lint`
