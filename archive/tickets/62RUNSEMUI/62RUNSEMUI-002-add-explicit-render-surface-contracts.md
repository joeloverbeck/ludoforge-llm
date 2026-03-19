# 62RUNSEMUI-002: Add explicit render-surface contracts

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: `specs/62-runner-semantic-ui-projection-boundary.md`, `archive/tickets/62RUNSEMUI/62RUNSEMUI-001-internalize-runner-projection-source-and-semantic-frame-boundary.md`

## Problem

`RenderModel` currently exposes generic `globalVars` and `playerVars`, but it has no explicit first-class `surfaces` root for later surface-specific projection work. Spec 62 needs an owned render-surface contract before follow-up tickets can move table overlays and showdown onto explicit projected models.

## Assumption Reassessment (2026-03-19)

1. [`packages/runner/src/model/render-model.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/model/render-model.ts) has no `surfaces` field today; the main generic leakage is still `globalVars` and `playerVars`.
2. Table overlays already have an explicit render-ready node shape in [`packages/runner/src/presentation/presentation-scene.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/presentation/presentation-scene.ts), but that ownership is still too late in the pipeline because the scene derives overlays directly from raw vars. That migration belongs to [`tickets/62RUNSEMUI-003-project-table-overlays-before-scene-assembly.md`](/home/joeloverbeck/projects/ludoforge-llm/tickets/62RUNSEMUI-003-project-table-overlays-before-scene-assembly.md), not this ticket.
3. [`packages/runner/src/ui/ShowdownOverlay.tsx`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/ui/ShowdownOverlay.tsx) still hardcodes Texas Hold'em conventions (`showdown` phase, `showdownScore`, `community:` and `hand:` prefixes). Moving those same assumptions into `projectRenderModel` now would not improve architecture; config-driven showdown projection belongs to [`tickets/62RUNSEMUI-004-add-visual-config-driven-showdown-surface-projection.md`](/home/joeloverbeck/projects/ludoforge-llm/tickets/62RUNSEMUI-004-add-visual-config-driven-showdown-surface-projection.md).
4. [`packages/runner/test/model/render-model-types.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/render-model-types.test.ts), [`packages/runner/test/model/project-render-model-state.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/project-render-model-state.test.ts), and shared render-model fixtures currently lock in the old shape and must be updated before downstream tickets can rely on the new contract safely.

## Architecture Check

1. A dedicated `surfaces` contract is cleaner than adding more ad hoc top-level fields every time a new visual surface appears.
2. This ticket is only beneficial if it stays structural: it should add the owned contract and default values now, without duplicating existing table-overlay projection or relocating hardcoded showdown semantics prematurely.
3. The new types remain presentation-facing only and do not leak game-specific semantics back into engine/runtime layers.
4. No compatibility shim should preserve old generic surface fields once downstream consumers no longer need them; this ticket prepares later tickets to delete them, but does not delete them yet.

## What to Change

### 1. Add render-surface model types

Define explicit types for:

- `RenderSurfaceModel`
- `RenderTableOverlayNode` or equivalent render-layer placeholder type
- `ShowdownSurfaceModel`
- any minimal nested types needed so later tickets can project showdown rankings/card groups into an owned contract

These types should live with render-model ownership, either in [`packages/runner/src/model/render-model.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/model/render-model.ts) or a new focused sibling such as `render-surfaces.ts`.

### 2. Extend `RenderModel` with `surfaces`

Add a `surfaces` field to `RenderModel` with at least:

- `tableOverlays`
- `showdown`

Use explicit empty/null defaults. Do not widen unrelated top-level contracts.

Important:

- `tableOverlays` remains empty/default in this ticket; ticket `62RUNSEMUI-003` owns moving overlay projection into it.
- `showdown` remains `null` in this ticket; ticket `62RUNSEMUI-004` owns config-driven showdown projection into it.

### 3. Update render-model fixtures and type tests

Bring local render-model fixtures and state/type tests into sync with the new required shape so subsequent tickets can migrate consumers incrementally without inventing parallel test-only model contracts.

### 4. Lock the boundary with default-surface tests

Add tests that prove the new `surfaces` contract exists with deterministic defaults, while current generic var bags remain unchanged until the later migration tickets land.

## Files to Touch

- [`packages/runner/src/model/render-model.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/model/render-model.ts) (modify)
- [`packages/runner/src/model/project-render-model.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/model/project-render-model.ts) (modify)
- [`packages/runner/test/model/render-model-types.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/render-model-types.test.ts) (modify)
- [`packages/runner/test/model/project-render-model-state.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/project-render-model-state.test.ts) (modify)
- [`packages/runner/test/model/project-render-model-structural-sharing.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/project-render-model-structural-sharing.test.ts) (modify)
- [`packages/runner/test/ui/helpers/render-model-fixture.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/ui/helpers/render-model-fixture.ts) (modify)

## Out of Scope

- Computing final table-overlay content from visual config
- Refactoring `presentation-scene`, `canvas-updater`, or table-overlay renderer consumers
- Adding showdown config schema/provider support
- Refactoring `ShowdownOverlay` to consume `surfaces.showdown`
- Deleting `RenderModel.globalVars` / `RenderModel.playerVars`

## Acceptance Criteria

### Tests That Must Pass

1. [`packages/runner/test/model/render-model-types.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/render-model-types.test.ts) proves the explicit `surfaces` contract is required and correctly typed.
2. [`packages/runner/test/model/project-render-model-state.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/project-render-model-state.test.ts) proves `projectRenderModel` emits deterministic default `surfaces` values while preserving current generic var bags.
3. [`packages/runner/test/model/project-render-model-structural-sharing.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/project-render-model-structural-sharing.test.ts) proves default surface references stay stable across unrelated render-model changes.
4. [`packages/runner/test/ui/helpers/render-model-fixture.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/ui/helpers/render-model-fixture.ts)-backed UI tests compile and run without hand-built missing fields.
4. Command: `pnpm -F @ludoforge/runner test`
5. Command: `pnpm -F @ludoforge/runner typecheck`
6. Command: `pnpm -F @ludoforge/runner lint`

### Invariants

1. Explicit surface contracts live under `RenderModel.surfaces`, not as scattered top-level one-off fields.
2. This ticket must not duplicate table-overlay ownership by introducing a second live overlay projection path alongside `presentation-scene`; later ticket `62RUNSEMUI-003` owns the real migration.
3. This ticket must not relocate current hardcoded showdown conventions into `projectRenderModel`; later tickets `62RUNSEMUI-004` and `62RUNSEMUI-005` own the config-driven showdown model and UI refactor.
4. This ticket must not reintroduce dead contracts such as `tracks` or `globalMarkers`.

## Test Plan

### New/Modified Tests

1. [`packages/runner/test/model/render-model-types.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/render-model-types.test.ts) — add surface-type construction coverage for `tableOverlays` and `showdown`.
2. [`packages/runner/test/model/project-render-model-state.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/project-render-model-state.test.ts) — assert default empty/null surface outputs exist even before specific projectors are migrated.
3. [`packages/runner/test/model/project-render-model-structural-sharing.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/project-render-model-structural-sharing.test.ts) — assert the default surface container remains structurally shared across unrelated updates.
4. [`packages/runner/test/ui/helpers/render-model-fixture.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/ui/helpers/render-model-fixture.ts) consumers — verify fixture-based UI tests still compile with the new required `surfaces` field.

### Commands

1. `pnpm -F @ludoforge/runner test -- render-model-types`
2. `pnpm -F @ludoforge/runner test -- project-render-model-state`
3. `pnpm -F @ludoforge/runner test -- project-render-model-structural-sharing`
4. `pnpm -F @ludoforge/runner test`
5. `pnpm -F @ludoforge/runner typecheck`
6. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completion date: 2026-03-19
- What actually changed:
  - Added explicit render-surface ownership types under `RenderModel`, including `RenderSurfaceModel`, `RenderTableOverlayNode`, and `ShowdownSurfaceModel`.
  - Added required `RenderModel.surfaces` with deterministic defaults: `tableOverlays: []` and `showdown: null`.
  - Updated `projectRenderModel(...)` to emit a stable default `surfaces` object.
  - Updated render-model fixtures and tests to require the new shape and to lock in default-surface structural sharing.
- Deviations from original plan:
  - The ticket originally implied immediate first-class ownership for both table overlays and showdown semantics. Reassessment showed that would overlap the responsibilities of `62RUNSEMUI-003`, `62RUNSEMUI-004`, and `62RUNSEMUI-005`.
  - This ticket was narrowed to structural scaffolding only. It intentionally does not duplicate table-overlay projection or move hardcoded showdown conventions into `projectRenderModel`.
  - The active test surface was broader than first listed. In addition to the shared render-model fixture, several test-local `RenderModel` builders required updates to carry the new required `surfaces` field.
- Verification results:
  - `pnpm -F @ludoforge/runner test -- render-model-types`
  - `pnpm -F @ludoforge/runner test -- project-render-model-state`
  - `pnpm -F @ludoforge/runner test -- project-render-model-structural-sharing`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner lint`
