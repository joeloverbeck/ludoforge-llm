# 61RUNRIGRAI-005: Prune Placeholder-Only Runner-Frame and Render-Model Fields

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner projection cleanup only
**Deps**: specs/61-runner-right-rail-cleanup-and-event-log-dock.md, archive/tickets/RUNARCH/61RUNRIGRAI-003-delete-variables-panel-and-variables-visual-config-contract.md, archive/tickets/RUNARCH/61RUNRIGRAI-004-delete-scoreboard-and-global-markers-placeholder-widgets.md

## Problem

Spec 61 requires dead placeholder-only projection plumbing to be removed once the associated widgets are gone. After Ticket 004 deleted the last placeholder right-rail widgets, the current runner-frame/render-model boundary still carries `globalVars`, `playerVars`, `globalMarkers`, and `tracks`, but only some of those fields are now dead.

## Assumption Reassessment (2026-03-19)

1. `packages/runner/src/model/runner-frame.ts`, `render-model.ts`, and `project-render-model.ts` still define and project `globalVars`, `playerVars`, `globalMarkers`, and `tracks`.
2. `globalVars` and `playerVars` still have real production consumers today:
   - `packages/runner/src/presentation/presentation-scene.ts` uses `runnerFrame.globalVars` and `runnerFrame.playerVars` for table-overlay text/marker rendering.
   - `packages/runner/src/ui/ShowdownOverlay.tsx` uses `renderModel.playerVars` to derive showdown scores.
3. No remaining production `packages/runner/src/**` consumer reads `globalMarkers` or `tracks`; after Ticket 004 they survive only as dead derivation/projection surface and test fixture baggage.
4. Corrected scope: this ticket should remove only `globalMarkers` and `tracks` from runner-frame/render-model derivation, projection, and tests. `globalVars` and `playerVars` must remain.

## Note

This ticket is the final architectural cleanup pass for Spec 61. Tickets 003 and 004 removed the placeholder UI surfaces; this ticket must then lock the surviving projection contract to the fields that still power real surfaces:

- `globalMarkers`
- `tracks`

`globalVars` and `playerVars` are already justified by active production consumers and should stay. `globalMarkers` and `tracks` should be deleted rather than preserved as speculative API surface.

## Architecture Check

1. A dedicated projection-cleanup pass remains the right architecture boundary because it forces proof of what still earns a place in the runner model contract.
2. Under the current architecture, keeping `globalVars`/`playerVars` is beneficial because they still carry semantic game data used by overlays and showdown UI; deleting them now would either break those surfaces or force a worse duplication path.
3. Removing `globalMarkers`/`tracks` is beneficial because they no longer serve any runner surface. Keeping them would preserve dead API surface, dead derivation work, and misleading tests.
4. The work stays within runner projection/presentation boundaries and preserves game-agnostic engine/runtime responsibilities.

## What to Change

### 1. Audit projection consumers

Trace all remaining uses of:

- `globalVars`
- `playerVars`
- `globalMarkers`
- `tracks`

Classify each as surviving production consumer vs placeholder-only residue. Record in tests/ticket scope that `globalVars` and `playerVars` survive because of table overlays and showdown UI, while `globalMarkers` and `tracks` do not.

### 2. Remove dead model fields and projection steps

Delete `globalMarkers` and `tracks` from `RunnerFrame`, `RenderModel`, `derive-runner-frame`, and `project-render-model`. Update helper fixtures and model test data accordingly.

### 3. Tighten projection-boundary tests

Update model tests so they assert only the surviving runner-frame/render-model contract. Make the `globalVars`/`playerVars` justification explicit in tests instead of carrying broad placeholder-oriented fixtures.

## File List

- `packages/runner/src/model/derive-runner-frame.ts` (modify)
- `packages/runner/src/model/runner-frame.ts` (modify)
- `packages/runner/src/model/render-model.ts` (modify)
- `packages/runner/src/model/project-render-model.ts` (modify)
- `packages/runner/test/model/runner-frame-projection-boundary.test.ts` (modify)
- `packages/runner/test/model/render-model-types.test.ts` (modify)
- `packages/runner/test/model/project-render-model-state.test.ts` (modify)
- `packages/runner/test/model/project-render-model-structural-sharing.test.ts` (modify as needed)
- `packages/runner/test/model/runner-frame-structural-sharing.test.ts` (modify as needed)
- `packages/runner/test/ui/helpers/render-model-fixture.ts` (modify as needed)

## Out of Scope

- deleting variable data still used by `packages/runner/src/presentation/presentation-scene.ts`, table overlays, or `packages/runner/src/ui/ShowdownOverlay.tsx`
- changing store serialization, engine game state, or worker contracts
- reintroducing replacement widgets for deleted placeholder fields
- modifying event-log dock layout

## Acceptance Criteria

### Tests That Must Pass

1. `packages/runner/test/model/runner-frame-projection-boundary.test.ts` and `packages/runner/test/model/render-model-types.test.ts` prove the public runner-frame/render-model contracts no longer include `globalMarkers` or `tracks`.
2. `packages/runner/test/model/project-render-model-state.test.ts` proves `globalVars` and `playerVars` still map because active production consumers require them, while dead `globalMarkers`/`tracks` projections no longer exist.
3. Existing suite: `pnpm -F @ludoforge/runner test -- project-render-model`
4. Existing suite: `pnpm -F @ludoforge/runner test -- runner-frame`
5. Existing suite: `pnpm -F @ludoforge/runner typecheck`
6. Existing suite: `pnpm -F @ludoforge/runner lint`

### Invariants

1. `RunnerFrame` and `RenderModel` contain no fields that exist solely for removed placeholder widgets.
2. `globalVars` and `playerVars` remain because they are required by active non-placeholder production surfaces.
3. `globalMarkers` and `tracks` are absent from runner-frame/render-model contracts because no active production consumer requires them.
4. The cleanup does not alter engine `GameDef`, simulation, compiler, or kernel contracts.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/model/runner-frame-projection-boundary.test.ts` — projection boundary after dead-field pruning.
2. `packages/runner/test/model/render-model-types.test.ts` — public render-model surface after cleanup.
3. `packages/runner/test/model/project-render-model-state.test.ts` — surviving variable projection behavior and explicit justification.
4. `packages/runner/test/ui/helpers/render-model-fixture.ts` — test fixture alignment with the reduced model shape.

### Commands

1. `pnpm -F @ludoforge/runner test -- project-render-model`
2. `pnpm -F @ludoforge/runner test -- runner-frame`
3. `pnpm -F @ludoforge/runner typecheck`
4. `pnpm -F @ludoforge/runner lint`
5. `pnpm run check:ticket-deps`

## Outcome

- Completion date: 2026-03-19
- What actually changed:
  - Removed `globalMarkers` and `tracks` from `RunnerFrame`, `RenderModel`, runner-frame derivation, and render-model projection.
  - Deleted the now-dead global-marker and track derivation helpers from `derive-runner-frame`.
  - Updated runner model tests and shared render-model fixtures so the public contract now keeps only the surviving semantic variable projections.
  - Added explicit boundary assertions that `globalMarkers` and `tracks` are absent while `globalVars` and `playerVars` remain available for live consumers.
- Deviations from original plan:
  - The ticket was corrected before implementation because its original wording treated all four fields as suspect. Audit evidence showed only `globalMarkers` and `tracks` were dead.
  - `globalVars` and `playerVars` were intentionally preserved because table overlays and showdown UI still consume them in production.
  - The implementation also updated adjacent test helpers (`canvas-updater`, table-overlay renderer, `GameContainer`, `bottom-bar-mode`, presentation-scene fixtures) where they were manually constructing the old render-model shape.
- Verification results:
  - `pnpm -F @ludoforge/runner test` passed (`162` files, `1612` tests).
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm run check:ticket-deps` passed.
