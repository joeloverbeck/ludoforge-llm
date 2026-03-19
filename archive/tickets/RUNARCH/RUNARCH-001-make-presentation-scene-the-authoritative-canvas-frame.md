# RUNARCH-001: Make PresentationScene the Authoritative Canvas Frame

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: None — runner-only
**Deps**: archive/specs/42-per-game-visual-config.md, archive/tickets/RUNPRESLIFE/68RUNPRESLIFE-001-presentation-scene-contract.md, archive/tickets/RUNPRESLIFE/68RUNPRESLIFE-006-complete-scene-migration-for-tokens-and-announcements.md

## Problem

The runner still treats `RenderModel` as a mixed semantic-plus-view payload. It is not a semantic frame; it is the shared store contract for both DOM UI panels and canvas presentation. Zone labels and zone visuals are still resolved during `deriveRenderModel`, while `presentation-scene` only finishes a subset of canvas-facing work such as token grouping, overlays, and region boundaries.

That is not a clean architecture boundary. It leaves the runner with:

- a mixed store contract that combines game-derived facts with display-derived fields
- a canvas presentation scene that is only partially authoritative
- canvas renderers still depending on pass-through `RenderModel` slices

The result is a brittle canvas architecture where the scene is not the single immutable owner of what gets drawn.

## Assumption Reassessment (2026-03-19)

1. `packages/runner/src/model/render-model.ts` still embeds presentation-facing fields such as `RenderZone.displayName` and `RenderZone.visual`, so the current `RenderModel` is not a semantic frame.
2. `packages/runner/src/model/derive-render-model.ts` still resolves display-facing zone labels and zone visuals before the presentation layer runs. However, the current ticket overstated the leak: token grouping/layout decisions are already derived in `packages/runner/src/presentation/presentation-scene.ts`, not in `derive-render-model.ts`.
3. `packages/runner/src/presentation/presentation-scene.ts` already owns token grouping/layout, overlays, and region boundaries, but it still passes through mixed `RenderModel.zones` and `RenderModel.adjacencies` instead of deriving a fully canvas-owned scene from a semantic input contract.
4. `packages/runner/src/store/game-store.ts` and many files under `packages/runner/src/ui/` currently consume `RenderModel` directly. Corrected scope: this ticket should fix the canvas boundary, not attempt a cross-runner store/UI contract rewrite in the same change.
5. Corrected boundary: this ticket must not change `GameDef`, simulation, or `GameSpecDoc`. It should restructure canvas-owned contracts so game-specific visual presentation remains sourced from `visual-config.yaml` only.

## Architecture Check

1. A durable canvas boundary is cleaner than the current mixed `RenderModel`: `RenderModel` can continue to serve runner store/UI consumers for now, but `PresentationScene` should become the single canvas-facing frame contract.
2. This preserves the repository boundary cleanly: `GameSpecDoc` remains the home of non-visual game-specific data, `visual-config.yaml` remains the home of game-specific presentation data, and `GameDef` / simulation remain game-agnostic.
3. No backwards-compatibility shim should preserve the canvas renderers' dependency on pass-through mixed `RenderModel` slices. The touched canvas layers should migrate directly to scene-owned canvas nodes.
4. This is cleaner than patching individual renderers because it removes the architectural ambiguity about where canvas derivation happens without forcing an oversized DOM/UI contract rewrite into the same ticket.

## What to Change

### 1. Keep `RenderModel` as the store/UI contract for now

Do not rewrite the runner-wide store/UI contract in this ticket. `RenderModel` remains the store-facing view model for DOM/UI consumers until a separate semantic-frame extraction ticket lands.

### 2. Redefine `PresentationScene` as the single canvas visual contract for a frame

Refactor the current presentation layer so it derives the complete immutable frame scene from:

- `RenderModel`
- layout/position snapshot
- validated `VisualConfigProvider`
- runner-only interaction state

The resulting scene should become the only canonical owner of canvas-facing data such as:

- visual text content
- visual shapes and dimensions
- token grouping/layout decisions
- region boundaries
- overlays
- announcement payloads
- zone/adjacency canvas nodes
- any other game-specific canvas behavior coming from `visual-config.yaml`

### 3. Remove canvas leakage from updater/tests

Migrate current runner types/tests so `presentation-scene` tests assert canvas derivation and `canvas-updater` tests assert consumption of scene-owned canvas nodes instead of pass-through `RenderModel` slices. `derive-render-model` tests should continue to cover the mixed store/UI contract only until a dedicated semantic-frame extraction ticket exists.

## Files to Touch

- `packages/runner/src/model/render-model.ts` (no intended changes unless needed for type imports)
- `packages/runner/src/model/derive-render-model.ts` (no intended changes unless tests reveal a bug)
- `packages/runner/src/presentation/*` (modify)
- `packages/runner/src/canvas/canvas-updater.ts` (modify)
- `packages/runner/test/presentation/*` (modify)
- `packages/runner/test/canvas/*` (modify where updater contracts change)

## Out of Scope

- changing `GameDef` schemas or simulation/runtime semantics
- introducing FITL-specific branches in runner code
- choosing a final Pixi text backend by itself; that belongs to the reconciler/text-ownership ticket once the contract split exists

## Acceptance Criteria

### Tests That Must Pass

1. Presentation-scene tests prove all canvas-facing frame data is derived inside the presentation layer, not consumed as pass-through mixed `RenderModel` slices.
2. Canvas-updater tests prove the updater consumes `PresentationScene` canvas nodes rather than `RenderModel.zones` / `RenderModel.adjacencies` directly.
3. Existing suite: `pnpm -F @ludoforge/runner test`
4. Existing suite: `pnpm -F @ludoforge/runner typecheck`
5. Existing suite: `pnpm -F @ludoforge/runner lint`

### Invariants

1. `GameSpecDoc` contains game-specific non-visual data only, while game-specific visual presentation is derived exclusively from `visual-config.yaml`.
2. `GameDef` and simulation remain presentation-agnostic.
3. Canvas renderers consume exactly one presentation-scene contract, with no pass-through mixed `RenderModel` alias layer left between the scene builder and the renderers.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/presentation/presentation-scene.test.ts` — prove the full canvas scene, including zone/adjacency nodes, is derived at the presentation layer.
2. `packages/runner/test/canvas/canvas-updater.test.ts` — prove the updater consumes the new presentation scene rather than pass-through mixed slices.
3. Strengthened presentation/canvas regression tests as needed for any newly exposed invariants.

### Commands

1. `pnpm -F @ludoforge/runner test -- presentation-scene canvas-updater`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`
4. `pnpm -F @ludoforge/runner lint`
5. `pnpm run check:ticket-deps`

## Outcome

Implemented a narrower, corrected version of the ticket rather than the original full semantic-frame rewrite.

What actually changed:

- `PresentationScene` now derives scene-owned zone nodes and adjacency nodes instead of passing `RenderModel.zones` / `RenderModel.adjacencies` straight through to canvas renderers.
- Region boundaries now derive from provider-resolved scene zone visuals inside the scene layer, so the scene remains authoritative for canvas geometry.
- Canvas renderer contracts were updated to consume presentation-scene nodes directly.
- Presentation and updater tests were strengthened to lock in the new scene-ownership invariant.

What did not change:

- `RenderModel` remains the store/UI contract for non-canvas consumers in this ticket.
- `derive-render-model.ts`, `GameDef`, simulation/runtime behavior, and game-specific YAML boundaries were left intact.
