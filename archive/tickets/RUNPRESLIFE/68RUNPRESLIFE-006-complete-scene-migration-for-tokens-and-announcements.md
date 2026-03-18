# 68RUNPRESLIFE-006: Complete Canonical Scene Migration for Tokens and Action Announcements

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: None — runner-only
**Deps**: archive/tickets/RUNPRESLIFE/68RUNPRESLIFE-001-presentation-scene-contract.md, archive/tickets/FITLTOKLANLAY/67FITLTOKLANLAY-003-token-renderer-lanes-scale-and-badges.md, archive/tickets/VISFIX-006.md

## Problem

Archived ticket `68RUNPRESLIFE-001` established the right architectural boundary, but only partially applied it. The runner now has a canonical scene builder for overlays and region boundaries, yet two hot-path presentation surfaces still finish important derivation outside the presentation layer:

- `token-renderer.ts` still computes render-entry grouping, zone offsets, lane assignment fallbacks, and stack aggregation semantics during renderer mutation time
- `action-announcement-renderer.ts` still derives anchor selection and announcement payload text from the store during its own rendering path instead of consuming immutable presentation descriptors

That leaves the runner in an in-between architecture: some surfaces are driven by canonical presentation contracts, while token placement and announcement presentation still rely on renderer-local/store-local mixed-input derivation. For a clean, robust, extensible runner, that is the wrong long-term shape.

## Assumption Reassessment (2026-03-18)

1. Archived ticket `68RUNPRESLIFE-001` already introduced `packages/runner/src/presentation/presentation-scene.ts` and moved overlays/regions onto canonical frame-scene nodes. The correct next step is to finish frame-scene derivation for tokens and to introduce an equally explicit presentation-layer contract for temporal announcements.
2. Current token rendering still computes stack grouping and lane/grid/fan offsets inside `packages/runner/src/canvas/renderers/token-renderer.ts`, even though those decisions are presentation semantics sourced from `visual-config.yaml` plus render state.
3. Current action announcements still subscribe directly to store mutation and resolve their own anchors from render zones/positions inside `packages/runner/src/canvas/renderers/action-announcement-renderer.ts`. They are not part of the frame scene, and they should not be forced into it just to satisfy naming symmetry.
4. `canvas-updater.ts` currently owns frame-scene application only. The announcement migration likely belongs in `GameCanvas.tsx` wiring plus a new presentation-layer announcement module, not in `canvas-updater.ts`, unless implementation details prove otherwise.
5. This gap is not cleanly owned by tickets `002` through `005`. Ticket `002` assumes scene text specs exist, ticket `003` wants a canonical commit boundary, ticket `004` wants semantic validation for scene contracts, and ticket `005` wants browser stress coverage. None of those should become the place where the missing token/announcement presentation derivation is quietly embedded.

## Architecture Check

1. Completing the canonical frame-scene boundary for tokens is cleaner than leaving grouping/layout in `token-renderer.ts`. Those decisions are deterministic presentation semantics and belong in the presentation layer before Pixi mutation.
2. Action announcements are temporal presentation events, not steady-state frame geometry. The cleaner architecture is not to stuff them into `PresentationScene`; it is to move them onto a runner-only immutable announcement descriptor stream or presenter module that resolves text and anchors before the renderer mutates Pixi objects.
3. This preserves the intended separation: `GameSpecDoc` holds game-specific non-visual data, `visual-config.yaml` holds game-specific visual data, and `GameDef` plus simulation remain game-agnostic. Both frame scene and announcement descriptors remain runner-only projections.
4. No backwards-compatibility shims or dual paths should be kept. Token and announcement renderers should consume canonical presentation-layer outputs directly once this lands.

## What to Change

### 1. Move token scene derivation out of the renderer

Extend the canonical scene builder so it produces resolved token scene nodes that include at least:

- stack/render-entry grouping
- zone-relative placement offsets
- lane assignment fallback resolution
- stack-badge display inputs
- any other token-placement semantics currently derived during renderer mutation

`token-renderer.ts` should then consume resolved token scene nodes rather than recomputing grouping/layout semantics from raw tokens plus provider calls.

### 2. Move action announcements onto canonical presentation descriptors

Introduce a canonical presentation contract for action announcements so announcement rendering no longer resolves anchors or payload text ad hoc from the store during its own render path.

That contract should be an event-scoped presentation descriptor stream or presenter module, not a forced extension of the frame scene, unless implementation reveals a materially cleaner alternative. It must satisfy these constraints:

- derived entirely from runner presentation inputs, not hardcoded per-game logic
- uses `visual-config.yaml` and runner state where presentation-specific data is required
- keeps `GameDef` and simulation agnostic
- gives the renderer immutable announcement specs rather than asking it to interpret store state directly
- keeps temporal queueing/animation concerns in the renderer while moving semantic derivation into the presentation layer

### 3. Make the completed presentation boundary explicit in tests

Add tests that prove:

- token grouping/layout semantics are resolved before renderer mutation
- action-announcement payloads and anchors are resolved before renderer mutation
- unchanged token/announcement inputs preserve stable scene signatures where expected
- no renderer-local fallback derivation remains for these surfaces

## Files to Touch

- `packages/runner/src/presentation/presentation-scene.ts` (modify)
- `packages/runner/src/presentation/action-announcement-presentation.ts` (new)
- `packages/runner/src/canvas/canvas-updater.ts` (modify for token scene wiring as needed)
- `packages/runner/src/canvas/renderers/token-renderer.ts` (modify)
- `packages/runner/src/canvas/renderers/action-announcement-renderer.ts` (modify)
- `packages/runner/src/canvas/renderers/renderer-types.ts` (modify)
- `packages/runner/src/canvas/GameCanvas.tsx` (modify for announcement presenter wiring)
- `packages/runner/test/presentation/presentation-scene.test.ts` (modify)
- `packages/runner/test/presentation/action-announcement-presentation.test.ts` (new)
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
3. New presentation tests prove token and announcement derivation is canonical, inspectable, and stable where intended.
4. Existing suite: `pnpm -F @ludoforge/runner test`
5. Existing suite: `pnpm -F @ludoforge/runner typecheck`
6. Existing suite: `pnpm -F @ludoforge/runner lint`

### Invariants

1. All major hot-path presentation surfaces flow through canonical runner presentation contracts before Pixi mutation: a frame scene for steady-state visuals and immutable descriptors for temporal announcements.
2. Game-specific presentation still comes from `visual-config.yaml`, not from runner branches or `GameDef`.
3. `GameDef` and simulation remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/presentation/presentation-scene.test.ts` — token scene derivation, announcement scene derivation, and stable-scene behavior
2. `packages/runner/test/presentation/action-announcement-presentation.test.ts` — canonical announcement descriptor derivation from store/positions/render model
3. `packages/runner/test/canvas/renderers/token-renderer.test.ts` — token renderer consumes resolved scene nodes instead of deriving grouping/layout
4. `packages/runner/test/canvas/renderers/action-announcement-renderer.test.ts` — announcement renderer consumes canonical announcement specs
5. `packages/runner/test/canvas/canvas-updater.test.ts` and/or `packages/runner/test/canvas/GameCanvas.test.ts` — runtime wiring for the completed presentation contracts

### Commands

1. `pnpm -F @ludoforge/runner test -- presentation-scene.test.ts action-announcement-presentation.test.ts token-renderer.test.ts action-announcement-renderer.test.ts`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`
4. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completion date: 2026-03-18
- What actually changed:
  - moved token stack grouping and lane/grid/fan offset resolution into runner presentation code via `packages/runner/src/presentation/token-presentation.ts`
  - updated `buildPresentationScene()` and `canvas-updater.ts` so token renderers now consume canonical token scene nodes instead of deriving placement semantics during Pixi mutation
  - split AI action announcements into two explicit presentation-layer responsibilities:
    - `packages/runner/src/presentation/action-announcement-presentation.ts` resolves immutable announcement specs from store state, render model, and positions
    - `action-announcement-renderer.ts` now only queues and animates already-resolved specs
  - updated `GameCanvas.tsx` wiring to connect the announcement presenter to the renderer directly
  - added and updated tests around token scene derivation, announcement descriptor derivation, renderer consumption, and runtime wiring
- What changed versus the original plan:
  - action announcements were not folded into `PresentationScene`; they now use a dedicated immutable presentation descriptor stream, which is a cleaner fit for temporal UI events than forcing them into the frame scene
  - token visual drawing logic remained in `token-renderer.ts`; only deterministic grouping/layout semantics moved into presentation code
- Verification results:
  - `pnpm -F @ludoforge/runner test -- presentation-scene.test.ts action-announcement-presentation.test.ts token-renderer.test.ts action-announcement-renderer.test.ts canvas-updater.test.ts GameCanvas.test.ts renderer-types.test.ts` ✅
  - `pnpm -F @ludoforge/runner test` ✅
  - `pnpm -F @ludoforge/runner typecheck` ✅
  - `pnpm -F @ludoforge/runner lint` ✅
