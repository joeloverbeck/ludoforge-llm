# 68RUNPRESLIFE-001: Introduce a Presentation Scene Contract for Runner Rendering

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: None — runner-only
**Deps**: archive/specs/42-per-game-visual-config.md, archive/tickets/RENDERLIFE-001.md, archive/tickets/FITLTOKLANLAY/67FITLTOKLANLAY-004-fitl-visual-config-migration.md

## Problem

[`logs/fitl-logs.log`](/home/joeloverbeck/projects/ludoforge-llm/logs/fitl-logs.log) originally motivated a broader presentation rewrite after a Pixi text-texture crash:

- `TexturePoolClass.returnTexture`
- `CanvasTextSystem.decreaseReferenceCount`
- `CanvasTextPipe._updateGpuText`

However, the runner architecture has already moved part of the way toward a stable presentation boundary since that crash: `deriveRenderModel()` now resolves zone labels, zone visuals, and other display-facing state before the canvas layer sees it, and destroy/disposal hardening is already in place. The remaining architectural gap is narrower and more specific:

- `canvas-updater.ts` still pushes mixed raw slices (`RenderZone[]`, `RenderToken[]`, `RenderModel`) directly into renderers
- some renderers still resolve presentation-local semantics from `VisualConfigProvider` or other mixed inputs during Pixi mutation time
- there is no single immutable canvas-scene contract that captures the final presentation payload for the current frame before Pixi objects are touched

That leaves update ordering, renderer responsibilities, and scene-level testing weaker than they should be.

## Assumption Reassessment (2026-03-18)

1. The game/presentation boundary already exists conceptually: `GameSpecDoc` rejects visual fields and `visual-config.yaml` is the intended home for presentation metadata — confirmed in `packages/engine/src/cnl/validate-zones.ts`, `packages/engine/src/cnl/validate-metadata.ts`, and `archive/specs/42-per-game-visual-config.md`.
2. `RenderModel` already centralizes a meaningful portion of runner presentation state. Zone display names and zone visuals are derived before canvas mutation, so the runner is not starting from a wholly raw `GameDef + state` surface — confirmed in `packages/runner/src/model/derive-render-model.ts` and `packages/runner/src/model/render-model.ts`.
3. The current runner still lacks a single final canvas-scene contract. `createCanvasUpdater()` pushes mixed slices into renderers, and several renderers still resolve presentation-local semantics at draw time (`token-renderer.ts`, `table-overlay-renderer.ts`, `region-boundary-renderer.ts`, `action-announcement-renderer.ts`) — confirmed in those files plus `packages/runner/src/canvas/canvas-updater.ts`.
4. Current architecture already contains post-failure hardening (`safe-destroy`, deferred disposal), but that is downstream of the scene-boundary problem rather than a replacement for one — confirmed in `packages/runner/src/canvas/renderers/safe-destroy.ts` and `packages/runner/src/canvas/renderers/disposal-queue.ts`.

## Architecture Check

1. A single immutable canvas-scene contract is cleaner than letting each renderer finish its own presentation derivation from mixed inputs. It makes the final frame payload inspectable and testable before Pixi objects are touched.
2. The clean architectural boundary for this ticket is not a brand-new top-level presentation system from `GameDef`; it is a runner-only scene builder that sits after `RenderModel` and before Pixi mutation. That preserves existing good boundaries instead of duplicating them.
3. This still preserves the repo boundary: `GameSpecDoc` continues to hold non-visual game-specific data, `visual-config.yaml` continues to hold game-specific presentation data, and `GameDef` / simulation remain game-agnostic.
4. No backwards-compatibility shims should be added. Existing renderers should be migrated to the canonical scene contract directly instead of supporting both old and new mutation paths.

## What to Change

### 1. Add a runner-only canvas scene model

Create a new runner module layer that derives one immutable canonical scene (name may vary, but keep one contract) from:

- current `RenderModel`
- current layout/position snapshot
- validated `VisualConfigProvider`
- runner-only interaction state

This scene is the final presentation payload for the frame. It should cover at least the surfaces that still require renderer-local resolution today:

- zones as rendered by canvas, including interaction-highlight state
- tokens as rendered by canvas, including interaction-highlight state
- table overlays
- region boundaries

Announcement rendering may stay on its store-driven path for now if it does not naturally fit the same frame scene yet. If so, do not force a partial abstraction; document it as follow-up work.

### 2. Move remaining frame-local presentation resolution out of individual renderers

Renderers should consume resolved scene nodes, not repeatedly recompute presentation semantics from mixed runtime inputs. For this ticket, centralize at least:

- overlay item resolution from table variables/seat anchors into drawable nodes
- region grouping/label/style resolution into drawable nodes

Do not duplicate logic already centralized in `deriveRenderModel()`. If a value is already part of `RenderModel`, the new scene should carry it through rather than recomputing it elsewhere.

Token grouping/layout resolution and action-announcement migration are follow-up work. This ticket establishes the scene layer and migrates the surfaces where renderer-local mixed-input derivation was still easiest to remove cleanly.

### 3. Make the scene contract explicit for testing

Add targeted scene-builder tests that prove:

- the runner derives one canonical canvas scene from `RenderModel + positions + visual-config + interaction state`
- unchanged inputs preserve stable identities/signatures where the scene contract intends renderer/pooling stability
- overlay and region nodes are fully resolved before renderer mutation
- game-specific presentation continues to come from `visual-config.yaml`, not runner branches

## Files to Touch

- `packages/runner/src/presentation/*` (new)
- `packages/runner/src/canvas/canvas-updater.ts` (modify)
- `packages/runner/src/canvas/renderers/*` (modify)
- `packages/runner/test/presentation/*` (new)
- existing runner canvas tests that currently assert updater/renderer wiring behavior (modify)

## Out of Scope

- changing `GameDef` or simulation semantics
- FITL-specific runtime branches
- choosing a final text-rendering backend by itself; that belongs to downstream tickets once the scene contract exists
- replacing the action-announcement path unless it fits the same scene cleanly in this ticket
- screenshot/artifact refresh

## Acceptance Criteria

### Tests That Must Pass

1. New presentation-scene tests prove the runner derives one canonical scene from `RenderModel + positions + visual-config + interaction state`.
2. Table overlays and region boundaries consume canonical scene nodes rather than recomputing visual-config semantics ad hoc, and the updater routes all frame rendering through the canonical scene builder.
3. Existing suite: `pnpm -F @ludoforge/runner test`
4. Existing suite: `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. Game-specific visual rules remain data-driven in `visual-config.yaml`; no game-specific branching is added to generic runner/runtime layers.
2. `GameDef` remains presentation-agnostic.
3. Every frame-scene canvas renderer has exactly one upstream presentation contract.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/presentation/presentation-scene.test.ts` — canonical scene derivation, overlay resolution, region resolution, and stable-node behavior
2. `packages/runner/test/canvas/canvas-updater.test.ts` — updater consumes the scene contract
3. Update focused renderer tests to assert scene consumption for overlays/regions rather than renderer-local mixed-input derivation

### Commands

1. `pnpm -F @ludoforge/runner test -- presentation-scene.test.ts canvas-updater.test.ts`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`

## Outcome

- Completion date: 2026-03-18
- What actually changed:
  - added `packages/runner/src/presentation/presentation-scene.ts` as the canonical frame-scene builder after `RenderModel`
  - routed `canvas-updater.ts` through that scene builder
  - moved table-overlay and region-boundary resolution out of renderer mutation paths and into canonical scene nodes
  - removed the region renderer's need to re-resolve zone visuals from `VisualConfigProvider`; it now consumes resolved scene geometry derived from `RenderModel`
  - added scene-builder tests and updated canvas/renderer tests around the new contract
- Deviations from original plan:
  - this ticket did not migrate token lane/layout resolution or action-announcement rendering into scene nodes
  - the scene contract now wraps existing `RenderModel` zone/token/adjacency slices and fully resolves overlays/regions, which is the narrower boundary the codebase actually needed first
- Verification results:
  - `pnpm -F @ludoforge/runner test -- presentation-scene.test.ts canvas-updater.test.ts region-boundary-renderer.test.ts table-overlay-renderer.test.ts` ✅
  - `pnpm -F @ludoforge/runner test` ✅
  - `pnpm -F @ludoforge/runner typecheck` ✅
  - `pnpm -F @ludoforge/runner lint` ✅
  - `pnpm run check:ticket-deps` ❌ due to pre-existing unresolved dependency paths in unrelated active tickets (`66MCTSCOMEVAFRA-001`, `66MCTSCOMEVAFRA-008`, `66MCTSCOMEVAFRA-009`)
