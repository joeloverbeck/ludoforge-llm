# 62RUNSEMUI-005: Refactor showdown overlay and delete generic surface leakage

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: `specs/62-runner-semantic-ui-projection-boundary.md`, `archive/tickets/62RUNSEMUI/62RUNSEMUI-002-add-explicit-render-surface-contracts.md`, `tickets/62RUNSEMUI-004-add-visual-config-driven-showdown-surface-projection.md`

## Problem

After the showdown surface model exists, `ShowdownOverlay` must stop deriving its own semantics from `phaseName`, zones, tokens, players, and `playerVars`. The final cleanup in Spec 62 is to move the component onto explicit projected surface data and then delete generic render-model fields that only survived to support old surface derivation.

## Assumption Reassessment (2026-03-19)

1. [`packages/runner/src/ui/ShowdownOverlay.tsx`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/ui/ShowdownOverlay.tsx) currently derives rankings directly from `renderModel.playerVars`, `renderModel.zones`, and `renderModel.tokens`.
2. Test helpers and UI tests such as [`packages/runner/test/ui/ShowdownOverlay.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/ui/ShowdownOverlay.test.ts) and [`packages/runner/test/ui/helpers/render-model-fixture.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/ui/helpers/render-model-fixture.ts) currently assume those generic fields are sufficient to build the overlay.
3. In current production code, `ShowdownOverlay` is the only live runner consumer still deriving presentation semantics from `RenderModel.playerVars` / `globalVars`; table overlays now consume `RunnerProjectionBundle.source` through a dedicated projector instead of reading `RenderModel`.
4. Once showdown consumes `surfaces.showdown`, `RenderModel.globalVars` and `RenderModel.playerVars` should be removed if no remaining non-surface consumer truly requires them. The internal projection source remains valid; the public render-model bags do not.

## Architecture Check

1. UI components should render explicit surface contracts only; this keeps semantic derivation and presentation wiring out of React components.
2. Deleting the generic var bags after migration is cleaner than preserving them as tempting escape hatches for future surfaces.
3. The cleanup remains runner-only and does not move any game-specific presentation knowledge into engine/runtime code.
4. This ticket should delete public render-model leakage only after the showdown projector exists; it must not pull world-layout or anchored-surface concerns back into `RenderModel`.

## What to Change

### 1. Refactor `ShowdownOverlay` to read only the showdown surface model

Update [`packages/runner/src/ui/ShowdownOverlay.tsx`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/ui/ShowdownOverlay.tsx) so it:

- selects `renderModel?.surfaces.showdown`
- renders directly from that data
- stops deriving from `phaseName`, zone prefixes, or `playerVars`

If `phaseName` is still needed anywhere for non-showdown UI, it may remain on `RenderModel`; it must not be used as a showdown-specific derivation crutch inside this component.

### 2. Delete obsolete generic render-model fields

Remove `RenderModel.playerVars`, `RenderModel.globalVars`, and any other surface-specific generic leakage that remains only to support overlay/showdown consumers.

Update any remaining legitimate consumer to use either:

- semantic frame data
- the internal projection source
- or explicit surface contracts

### 3. Tighten boundary and structural-sharing tests

Add tests that prove:

- `ShowdownOverlay` renders from surface data only
- unrelated changes do not force showdown surface churn
- the reduced `RenderModel` contract no longer exposes deleted generic bags

## Files to Touch

- [`packages/runner/src/model/render-model.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/model/render-model.ts) (modify)
- [`packages/runner/src/model/project-render-model.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/model/project-render-model.ts) (modify)
- [`packages/runner/src/ui/ShowdownOverlay.tsx`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/ui/ShowdownOverlay.tsx) (modify)
- [`packages/runner/test/ui/ShowdownOverlay.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/ui/ShowdownOverlay.test.ts) (modify)
- [`packages/runner/test/ui/helpers/render-model-fixture.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/ui/helpers/render-model-fixture.ts) (modify)
- [`packages/runner/test/model/runner-frame-projection-boundary.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/runner-frame-projection-boundary.test.ts) (modify)
- [`packages/runner/test/model/render-model-types.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/render-model-types.test.ts) (modify)
- [`packages/runner/test/model/project-render-model-structural-sharing.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/project-render-model-structural-sharing.test.ts) (modify)

## Out of Scope

- Adding new surface types beyond table overlays and showdown
- Introducing or revising the world-layout contract for anchored canvas surfaces
- Reworking unrelated UI panels that already consume explicit non-surface render-model fields
- Changing showdown copy, styling, or CSS beyond what is required to bind the new data contract
- Modifying engine compilation, kernel logic, or game rules

## Acceptance Criteria

### Tests That Must Pass

1. [`packages/runner/test/ui/ShowdownOverlay.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/ui/ShowdownOverlay.test.ts) proves the component renders from `surfaces.showdown` only and no longer needs generic vars or zone-prefix conventions.
2. [`packages/runner/test/model/render-model-types.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/render-model-types.test.ts) proves `RenderModel` no longer exposes deleted generic var bags.
3. [`packages/runner/test/model/runner-frame-projection-boundary.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/runner-frame-projection-boundary.test.ts) proves the semantic/render boundary is reduced to semantic frame plus explicit surfaces.
4. [`packages/runner/test/model/project-render-model-structural-sharing.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/project-render-model-structural-sharing.test.ts) proves showdown surface identity is stable when projected showdown output is unchanged.
5. Command: `pnpm -F @ludoforge/runner test`
6. Command: `pnpm -F @ludoforge/runner typecheck`
7. Command: `pnpm -F @ludoforge/runner lint`

### Invariants

1. `ShowdownOverlay` must not inspect `playerVars`, `globalVars`, zone prefixes, or raw token groupings to derive showdown semantics after this ticket.
2. `RenderModel` must expose explicit surfaces rather than generic raw-data bags for special UI surfaces.
3. Deletion is real deletion: no backwards-compatibility aliases, duplicate fields, or shadow getters may remain.
4. `RunnerProjectionSource` may still retain low-level semantic facts needed for internal projectors; this ticket only deletes the public render-model leakage once its consumers are gone.

## Test Plan

### New/Modified Tests

1. [`packages/runner/test/ui/ShowdownOverlay.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/ui/ShowdownOverlay.test.ts) — rebuild fixtures around `surfaces.showdown`, including null/hidden/zero-score cases.
2. [`packages/runner/test/model/render-model-types.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/render-model-types.test.ts) — remove old var-bag assumptions and assert the reduced contract.
3. [`packages/runner/test/model/runner-frame-projection-boundary.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/runner-frame-projection-boundary.test.ts) — add explicit negative assertions for deleted render-model fields.
4. [`packages/runner/test/model/project-render-model-structural-sharing.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/project-render-model-structural-sharing.test.ts) — cover unchanged showdown surface reuse and unrelated-state non-churn.

### Commands

1. `pnpm -F @ludoforge/runner test -- ShowdownOverlay`
2. `pnpm -F @ludoforge/runner test -- render-model-types`
3. `pnpm -F @ludoforge/runner test -- project-render-model-structural-sharing`
4. `pnpm -F @ludoforge/runner test`
5. `pnpm -F @ludoforge/runner typecheck`
6. `pnpm -F @ludoforge/runner lint`
