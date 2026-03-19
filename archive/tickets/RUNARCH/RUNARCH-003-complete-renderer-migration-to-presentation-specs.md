# RUNARCH-003: Finish Zone/Token Render-Spec Migration in Presentation Layer

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: archive/tickets/RUNARCH/RUNARCH-001-make-presentation-scene-the-authoritative-canvas-frame.md, archive/tickets/RUNARCH/RUNARCH-002-canonical-keyed-text-reconciler.md, archive/tickets/RUNPRESLIFE/68RUNPRESLIFE-006-complete-scene-migration-for-tokens-and-announcements.md

## Problem

`RUNARCH-003` was written as if large parts of the steady-state runner still bypassed presentation-layer ownership. That is no longer true.

The current runner already routes overlays, regions, token grouping/layout, and action announcements through explicit presentation contracts before Pixi mutation. The remaining hybrid boundary is narrower:

- `zone-renderer.ts` still derives fill/stroke/badge semantics from mixed scene data during renderer mutation
- `token-renderer.ts` still resolves render-ready token details such as colors, symbols, card-template fields, hit-area dimensions, and badge styling from provider-backed semantic inputs during renderer mutation

That is still worth fixing, but the clean architecture target is not “remove renderers” or “redo every surface.” It is to make `PresentationScene` and token presentation nodes the single render-ready contract for steady-state zone/token visuals, while keeping renderers as pure Pixi backends.

## Assumption Reassessment (2026-03-19)

1. Corrected: overlays, regions, token grouping/layout, and action announcements are already presentation-layer owned via `packages/runner/src/presentation/presentation-scene.ts`, `packages/runner/src/presentation/token-presentation.ts`, and `packages/runner/src/presentation/action-announcement-presentation.ts`.
2. Confirmed: the remaining renderer-local derivation is concentrated in zone/token visual resolution, not in overlays/regions/announcements.
3. Confirmed: current `PresentationZoneNode` and `PresentationTokenNode` still expose mixed semantic inputs that force renderers to resolve render-ready details locally.
4. Corrected scope: this ticket should finish render-ready presentation ownership for steady-state zones and tokens only.
5. Corrected command assumption: `pnpm -F @ludoforge/runner test -- <name>` is not a reliable focused-run pattern in this package because it still expands to `vitest run -- <name>` and currently runs the full runner suite. Use `pnpm -F @ludoforge/runner exec vitest run <paths...>` for true targeted runs.

## Architecture Check

1. A narrow zone/token render-spec migration is more beneficial than the current architecture because it removes the last meaningful renderer-side presentation derivation without duplicating already-completed work.
2. This is cleaner than the previous ticket framing. Rewriting overlays, regions, or announcements again would be churn, not architectural improvement.
3. The ideal boundary is:
   - `RenderModel`: runner/store-facing view model for now
   - `PresentationScene` + token presentation nodes: immutable, render-ready canvas contract
   - renderers: Pixi-only mutation backends with no provider-driven semantic interpretation
4. No backwards-compatibility alias should preserve both render-ready scene specs and renderer-local derivation for the touched zone/token surfaces. Once migrated, renderers should consume presentation specs directly.

## What to Change

### 1. Make zone scene nodes render-ready

Extend the presentation layer so zone nodes carry the resolved steady-state render spec the renderer needs, including at minimum:

- resolved base fill/stroke inputs
- resolved label text and label layout inputs
- hidden-stack display inputs
- resolved marker badge payload and marker text payload
- resolved dimensions/shape already sourced from provider-owned visuals

`zone-renderer.ts` should stop interpreting `visibility`, `ownerID`, marker badge config, and other mixed semantic inputs to decide what to draw.

### 2. Make token scene nodes render-ready

Extend token presentation nodes so they carry the resolved steady-state render spec the renderer needs, including at minimum:

- resolved token colors and stroke inputs
- resolved symbols / back symbols
- resolved shape and dimensions
- resolved stack badge payload/style inputs
- resolved card template field payloads for face-up card content

`token-renderer.ts` may still own Pixi object lifecycle and face-flip mutation, but it should stop resolving provider-backed presentation semantics during update.

### 3. Keep renderers as drawing backends, not semantic owners

Do not remove the renderers outright. Keep them as pure backend helpers that:

- receive immutable presentation specs
- mutate retained Pixi objects
- manage disposal / pooling / animation-facing lifecycle only

## Files to Touch

- `packages/runner/src/presentation/presentation-scene.ts`
- `packages/runner/src/presentation/token-presentation.ts`
- `packages/runner/src/canvas/renderers/zone-renderer.ts`
- `packages/runner/src/canvas/renderers/token-renderer.ts`
- `packages/runner/src/canvas/renderers/renderer-types.ts` if contracts need tightening
- `packages/runner/test/presentation/presentation-scene.test.ts`
- `packages/runner/test/canvas/renderers/zone-renderer.test.ts`
- `packages/runner/test/canvas/renderers/token-renderer.test.ts`

## Out of Scope

- reworking overlays, regions, adjacency rendering, or action announcements again
- changing `GameDef`, simulation/runtime behavior, or `GameSpecDoc`
- introducing FITL-specific renderer branches
- runner-wide `RenderModel` extraction beyond the zone/token canvas boundary

## Acceptance Criteria

### Tests That Must Pass

1. Zone and token renderers consume render-ready presentation specs rather than resolving provider-backed presentation semantics locally.
2. Presentation tests prove the scene layer resolves the zone/token render-ready data before renderer mutation.
3. Existing suite: `pnpm -F @ludoforge/runner test`
4. Existing suite: `pnpm -F @ludoforge/runner typecheck`
5. Existing suite: `pnpm -F @ludoforge/runner lint`

### Invariants

1. Game-specific presentation remains sourced from `visual-config.yaml`, not runner branches or simulation.
2. `PresentationScene` plus token presentation nodes are the single steady-state canvas contract for the touched zone/token surfaces.
3. Renderers retain Pixi lifecycle ownership only; they do not remain the place where provider-backed presentation meaning is resolved.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/presentation/presentation-scene.test.ts` — prove zone render specs are fully resolved in presentation code.
2. `packages/runner/test/presentation/presentation-scene.test.ts` and/or token-presentation-focused tests — prove token render specs, including card-field payloads, are fully resolved in presentation code.
3. `packages/runner/test/canvas/renderers/zone-renderer.test.ts` — prove the renderer consumes render-ready zone specs and no longer owns fallback presentation interpretation.
4. `packages/runner/test/canvas/renderers/token-renderer.test.ts` — prove the renderer consumes render-ready token specs and no longer resolves provider-backed presentation semantics during update.

### Commands

1. `pnpm -F @ludoforge/runner exec vitest run test/presentation/presentation-scene.test.ts test/canvas/renderers/zone-renderer.test.ts test/canvas/renderers/token-renderer.test.ts`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`
4. `pnpm -F @ludoforge/runner lint`
5. `pnpm run check:ticket-deps`

## Outcome

- Completion date: 2026-03-19
- What actually changed:
  - presentation code now resolves render-ready zone specs, including fill/stroke, label layout, marker text, hidden-stack inputs, and badge payloads
  - token presentation nodes now resolve render-ready token specs, including colors, stroke, symbols, card-field payloads, badge payloads, and selected-scale inputs
  - `zone-renderer.ts` now consumes presentation-owned render specs and no longer interprets marker badge config or zone semantics locally
  - `token-renderer.ts` now consumes presentation-owned render specs and no longer depends on the token style provider during renderer mutation
  - `card-template-renderer.ts` gained a resolved-field entry point so steady-state token card content can be derived before renderer mutation
  - canvas updater and canvas runtime wiring were tightened to the new renderer contracts
  - presentation and renderer tests were updated to lock in the new render-ready boundary
- Deviations from original plan:
  - the ticket was narrowed before implementation because overlays, regions, token grouping/layout, and action announcements were already migrated by earlier tickets
  - renderers were retained as Pixi backends; the change removed semantic ownership from them instead of removing them entirely
- Verification results:
  - `pnpm -F @ludoforge/runner exec vitest run test/presentation/presentation-scene.test.ts test/canvas/renderers/zone-renderer.test.ts test/canvas/renderers/token-renderer.test.ts test/canvas/canvas-updater.test.ts test/canvas/GameCanvas.test.ts test/canvas/renderers/renderer-types.test.ts`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner lint`
