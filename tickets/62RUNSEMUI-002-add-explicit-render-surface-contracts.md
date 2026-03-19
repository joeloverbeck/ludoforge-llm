# 62RUNSEMUI-002: Add explicit render-surface contracts

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: `specs/62-runner-semantic-ui-projection-boundary.md`, `archive/tickets/62RUNSEMUI/62RUNSEMUI-001-internalize-runner-projection-source-and-semantic-frame-boundary.md`

## Problem

`RenderModel` currently exposes generic `globalVars` and `playerVars`, but it has no explicit first-class surface ownership for table overlays or showdown. That keeps UI contracts broad and encourages components to derive their own game-specific view state.

## Assumption Reassessment (2026-03-19)

1. [`packages/runner/src/model/render-model.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/model/render-model.ts) has no `surfaces` field today; the main generic leakage is `globalVars` and `playerVars`.
2. [`packages/runner/test/model/render-model-types.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/render-model-types.test.ts) currently locks in the old `RenderModel` shape and will need to be updated before downstream UI work can proceed safely.
3. The current `projectRenderModel` path can start producing explicit surface placeholders immediately, even before all consumers migrate, as long as those surface models are owned by the render-model layer and not improvised in UI components.

## Architecture Check

1. A dedicated `surfaces` contract is cleaner than adding more ad hoc top-level fields every time a new visual surface appears.
2. The new types remain presentation-facing only and do not leak game-specific semantics back into engine/runtime layers.
3. No compatibility shim should preserve old generic surface fields once downstream consumers no longer need them; this ticket introduces the new contract and prepares later tickets to delete the old one.

## What to Change

### 1. Add render-surface model types

Define explicit types for:

- `RenderSurfaceModel`
- `RenderTableOverlayNode` or equivalent
- `ShowdownSurfaceModel`
- any nested row/entry types needed for showdown rankings and card groups

These types should live with render-model ownership, either in [`packages/runner/src/model/render-model.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/model/render-model.ts) or a new focused sibling such as `render-surfaces.ts`.

### 2. Extend `RenderModel` with `surfaces`

Add a `surfaces` field to `RenderModel` with at least:

- `tableOverlays`
- `showdown`

Use explicit empty/null defaults. Do not widen unrelated top-level contracts.

### 3. Update render-model fixtures and type tests

Bring all local render-model fixtures into sync with the new required shape so subsequent tickets can migrate consumers incrementally without inventing parallel test-only model contracts.

## Files to Touch

- [`packages/runner/src/model/render-model.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/model/render-model.ts) (modify)
- [`packages/runner/src/model/project-render-model.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/model/project-render-model.ts) (modify)
- [`packages/runner/test/model/render-model-types.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/render-model-types.test.ts) (modify)
- [`packages/runner/test/ui/helpers/render-model-fixture.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/ui/helpers/render-model-fixture.ts) (modify)
- [`packages/runner/test/canvas/canvas-updater.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/canvas-updater.test.ts) (modify)
- [`packages/runner/test/presentation/action-announcement-presentation.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/presentation/action-announcement-presentation.test.ts) (modify only if fixture construction requires it)

## Out of Scope

- Computing final table-overlay content from visual config
- Adding showdown config schema/provider support
- Refactoring `presentation-scene` or `ShowdownOverlay` consumers
- Deleting `RenderModel.globalVars` / `RenderModel.playerVars`

## Acceptance Criteria

### Tests That Must Pass

1. [`packages/runner/test/model/render-model-types.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/render-model-types.test.ts) proves the explicit `surfaces` contract is required and correctly typed.
2. [`packages/runner/test/model/project-render-model-state.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/project-render-model-state.test.ts) still passes with the richer render-model shape.
3. [`packages/runner/test/ui/helpers/render-model-fixture.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/ui/helpers/render-model-fixture.ts)-backed UI tests compile and run without hand-built missing fields.
4. Command: `pnpm -F @ludoforge/runner test`
5. Command: `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. Explicit surface contracts live under `RenderModel.surfaces`, not as scattered top-level one-off fields.
2. No UI consumer should need to inspect raw var bags to understand the type of a surface once the surface is modeled.
3. This ticket must not reintroduce dead contracts such as `tracks` or `globalMarkers`.

## Test Plan

### New/Modified Tests

1. [`packages/runner/test/model/render-model-types.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/render-model-types.test.ts) — add surface-type construction coverage for `tableOverlays` and `showdown`.
2. [`packages/runner/test/model/project-render-model-state.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/project-render-model-state.test.ts) — assert default empty/null surface outputs exist even before specific projectors are migrated.
3. [`packages/runner/test/ui/helpers/render-model-fixture.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/ui/helpers/render-model-fixture.ts) consumers — verify fixture-based UI tests still compile with the new required `surfaces` field.

### Commands

1. `pnpm -F @ludoforge/runner test -- render-model-types`
2. `pnpm -F @ludoforge/runner test -- project-render-model-state`
3. `pnpm -F @ludoforge/runner test`
4. `pnpm -F @ludoforge/runner typecheck`
