# 68RUNPRESLIFE-006: Complete Canonical Scene Migration for Tokens and Action Announcements

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: None — runner-only
**Deps**: archive/tickets/RUNPRESLIFE/68RUNPRESLIFE-001-presentation-scene-contract.md, archive/tickets/FITLTOKLANLAY/67FITLTOKLANLAY-003-token-renderer-lanes-scale-and-badges.md, archive/tickets/VISFIX-006.md

## Problem

Archived ticket `68RUNPRESLIFE-001` established the right architectural boundary, but only partially applied it. The runner now has a canonical scene builder for overlays and region boundaries, yet two hot-path presentation surfaces still finish important derivation outside that scene boundary:

- `token-renderer.ts` still computes render-entry grouping, zone offsets, lane assignment fallbacks, and stack aggregation semantics during renderer mutation time
- `action-announcement-renderer.ts` still derives anchor selection and announcement payload timing from the store during its own rendering path instead of consuming canonical scene nodes

That leaves the runner in an in-between architecture: some surfaces are driven by a frame scene, while token placement and announcement presentation still rely on renderer-local/store-local mixed-input derivation. For a clean, robust, extensible runner, that is the wrong long-term shape.

## Assumption Reassessment (2026-03-18)

1. Archived ticket `68RUNPRESLIFE-001` already introduced `packages/runner/src/presentation/presentation-scene.ts` and moved overlays/regions onto canonical scene nodes, so the correct next step is to complete that same boundary rather than inventing a second abstraction.
2. Current token rendering still computes stack grouping and lane/grid/fan offsets inside `packages/runner/src/canvas/renderers/token-renderer.ts`, even though those decisions are presentation semantics sourced from `visual-config.yaml` plus render state.
3. Current action announcements still subscribe directly to store mutation and resolve their own anchors from render zones/positions inside `packages/runner/src/canvas/renderers/action-announcement-renderer.ts`, so they are not yet part of the canonical scene.
4. This gap is not cleanly owned by tickets `002` through `005`. Ticket `002` assumes scene text specs exist, ticket `003` wants a canonical commit boundary, ticket `004` wants semantic validation for scene contracts, and ticket `005` wants browser stress coverage. None of those should become the place where the missing scene derivation itself is quietly embedded.

## Architecture Check

1. Completing the canonical scene boundary is cleaner than leaving token grouping/layout and action announcements as exceptions. It gives the runner one inspectable presentation contract before Pixi mutation for all major hot-path surfaces.
2. This preserves the intended separation: `GameSpecDoc` holds game-specific non-visual data, `visual-config.yaml` holds game-specific visual data, and `GameDef` plus simulation remain game-agnostic. The scene remains a runner-only projection.
3. No backwards-compatibility shims or dual paths should be kept. Token and announcement renderers should consume canonical scene nodes directly once this lands.

## What to Change

### 1. Move token scene derivation out of the renderer

Extend the canonical scene builder so it produces resolved token scene nodes that include at least:

- stack/render-entry grouping
- zone-relative placement offsets
- lane assignment fallback resolution
- stack-badge display inputs
- any other token-placement semantics currently derived during renderer mutation

`token-renderer.ts` should then consume resolved token scene nodes rather than recomputing grouping/layout semantics from raw tokens plus provider calls.

### 2. Move action announcements onto canonical scene/event nodes

Introduce a canonical presentation contract for action announcements so announcement rendering no longer resolves anchors or payload text ad hoc from the store during its own render path.

That contract may be a frame-scoped scene slice, an event-scoped presentation descriptor stream, or another runner-only canonical node type, but it must satisfy these constraints:

- derived entirely from runner presentation inputs, not hardcoded per-game logic
- uses `visual-config.yaml` and runner state where presentation-specific data is required
- keeps `GameDef` and simulation agnostic
- gives the renderer immutable announcement specs rather than asking it to interpret store state directly

### 3. Make the completed scene boundary explicit in tests

Add tests that prove:

- token grouping/layout semantics are resolved before renderer mutation
- action-announcement payloads and anchors are resolved before renderer mutation
- unchanged token/announcement inputs preserve stable scene signatures where expected
- no renderer-local fallback derivation remains for these surfaces

## Files to Touch

- `packages/runner/src/presentation/presentation-scene.ts` (modify)
- `packages/runner/src/canvas/canvas-updater.ts` (modify)
- `packages/runner/src/canvas/renderers/token-renderer.ts` (modify)
- `packages/runner/src/canvas/renderers/action-announcement-renderer.ts` (modify)
- `packages/runner/src/canvas/renderers/renderer-types.ts` (modify)
- `packages/runner/src/canvas/GameCanvas.tsx` (modify if runtime wiring changes)
- `packages/runner/test/presentation/presentation-scene.test.ts` (modify)
- `packages/runner/test/canvas/renderers/token-renderer.test.ts` (modify)
- `packages/runner/test/canvas/renderers/action-announcement-renderer.test.ts` (modify)
- `packages/runner/test/canvas/canvas-updater.test.ts` and/or `packages/runner/test/canvas/GameCanvas.test.ts` (modify)

## Out of Scope

- introducing a retained text runtime by itself
- commit/disposal lifecycle redesign by itself
- visual-config fail-closed validation by itself
- FITL-specific runner branches or special cases

## Acceptance Criteria

### Tests That Must Pass

1. Token renderer consumes canonical token scene nodes and no longer computes grouping/layout semantics ad hoc during renderer mutation.
2. Action-announcement renderer consumes canonical announcement specs and no longer derives anchors/payloads directly from store state during renderer mutation.
3. New scene tests prove token and announcement scene derivation is canonical, inspectable, and stable where intended.
4. Existing suite: `pnpm -F @ludoforge/runner test`
5. Existing suite: `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. All major hot-path presentation surfaces flow through one canonical runner presentation contract before Pixi mutation.
2. Game-specific presentation still comes from `visual-config.yaml`, not from runner branches or `GameDef`.
3. `GameDef` and simulation remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/presentation/presentation-scene.test.ts` — token scene derivation, announcement scene derivation, and stable-scene behavior
2. `packages/runner/test/canvas/renderers/token-renderer.test.ts` — token renderer consumes resolved scene nodes instead of deriving grouping/layout
3. `packages/runner/test/canvas/renderers/action-announcement-renderer.test.ts` — announcement renderer consumes canonical announcement specs
4. `packages/runner/test/canvas/canvas-updater.test.ts` and/or `packages/runner/test/canvas/GameCanvas.test.ts` — runtime wiring for the completed scene contract

### Commands

1. `pnpm -F @ludoforge/runner test -- presentation-scene.test.ts token-renderer.test.ts action-announcement-renderer.test.ts`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`
