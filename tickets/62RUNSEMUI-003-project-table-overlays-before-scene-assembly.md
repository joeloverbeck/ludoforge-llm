# 62RUNSEMUI-003: Project table overlays before scene assembly

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: `specs/62-runner-semantic-ui-projection-boundary.md`, `tickets/62RUNSEMUI-001-internalize-runner-projection-source-and-semantic-frame-boundary.md`, `tickets/62RUNSEMUI-002-add-explicit-render-surface-contracts.md`

## Problem

`presentation-scene` currently reads `RunnerFrame.globalVars` and `RunnerFrame.playerVars` to derive table-overlay text and marker nodes. That violates the ownership boundary in Spec 62: overlays should be projected earlier into explicit surface nodes, and scene assembly should only render them.

## Assumption Reassessment (2026-03-19)

1. [`packages/runner/src/presentation/presentation-scene.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/presentation/presentation-scene.ts) currently owns `resolveOverlayNodes(...)` and reaches directly into semantic vars.
2. [`packages/runner/src/canvas/canvas-updater.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/canvas/canvas-updater.ts) still compares overlay-relevant `globalVars` / `playerVars` for redraw decisions, which is the exact late-derivation coupling Spec 62 calls out.
3. Existing tests in [`packages/runner/test/presentation/presentation-scene.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/presentation/presentation-scene.test.ts), [`packages/runner/test/canvas/renderers/table-overlay-renderer.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/renderers/table-overlay-renderer.test.ts), and [`packages/runner/test/canvas/canvas-updater.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/canvas-updater.test.ts) already give a stable place to pin the migration.

## Architecture Check

1. Overlay projection belongs in the render-model projector because it combines semantic source data plus visual-config presentation policy.
2. This preserves the agnostic engine rule: the projector remains generic and consumes selectors from `visual-config.yaml` instead of embedding game-specific overlay knowledge.
3. No compatibility bridge should leave `presentation-scene` half-reading raw vars and half-reading explicit overlay nodes; the scene should switch fully once this ticket lands.

## What to Change

### 1. Add a dedicated table-overlay projector

Move the logic that interprets `tableOverlays` config and raw projection vars out of [`packages/runner/src/presentation/presentation-scene.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/presentation/presentation-scene.ts) and into the render-model projection layer.

Acceptable shapes:

- helper inside [`packages/runner/src/model/project-render-model.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/model/project-render-model.ts)
- new file such as `packages/runner/src/model/project-table-overlay-surface.ts`

The output must be explicit `RenderModel.surfaces.tableOverlays` data.

### 2. Change presentation-scene to consume preprojected overlay nodes

Refactor scene assembly so it accepts overlay nodes from `RenderModel.surfaces.tableOverlays` instead of recomputing overlay text/markers from semantic vars.

### 3. Tighten canvas redraw logic around explicit overlay surfaces

Update [`packages/runner/src/canvas/canvas-updater.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/canvas/canvas-updater.ts) so overlay redraw/equality decisions depend on explicit projected surface nodes, not broad `globalVars` / `playerVars` comparisons.

## Files to Touch

- [`packages/runner/src/model/project-render-model.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/model/project-render-model.ts) (modify)
- [`packages/runner/src/presentation/presentation-scene.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/presentation/presentation-scene.ts) (modify)
- [`packages/runner/src/canvas/canvas-updater.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/canvas/canvas-updater.ts) (modify)
- [`packages/runner/test/presentation/presentation-scene.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/presentation/presentation-scene.test.ts) (modify)
- [`packages/runner/test/canvas/renderers/table-overlay-renderer.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/renderers/table-overlay-renderer.test.ts) (modify)
- [`packages/runner/test/canvas/canvas-updater.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/canvas-updater.test.ts) (modify)
- [`packages/runner/test/model/project-render-model-structural-sharing.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/project-render-model-structural-sharing.test.ts) (modify)

## Out of Scope

- Adding new showdown config or UI behavior
- Deleting `RenderModel.globalVars` / `RenderModel.playerVars`
- Refactoring unrelated zone/token presentation logic
- Changing table-overlay YAML semantics beyond what existing config already expresses

## Acceptance Criteria

### Tests That Must Pass

1. [`packages/runner/test/presentation/presentation-scene.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/presentation/presentation-scene.test.ts) proves the scene renders overlay nodes from projected surface data and does not require raw semantic vars.
2. [`packages/runner/test/canvas/renderers/table-overlay-renderer.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/renderers/table-overlay-renderer.test.ts) still passes using explicit overlay nodes.
3. [`packages/runner/test/canvas/canvas-updater.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/canvas-updater.test.ts) proves redraw decisions respond to `surfaces.tableOverlays` changes instead of raw var array equality.
4. [`packages/runner/test/model/project-render-model-structural-sharing.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/project-render-model-structural-sharing.test.ts) proves overlay node sharing is stable when overlay content is unchanged.
5. Command: `pnpm -F @ludoforge/runner test`
6. Command: `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. `presentation-scene` must not inspect `globalVars` or `playerVars` after this ticket.
2. Overlay labels, seat anchoring, and marker rendering remain presentation concerns driven by `visual-config.yaml`, not `GameDef` or semantic frame code.
3. Overlay updates remain deterministic and structurally shared when projected overlay output is unchanged.

## Test Plan

### New/Modified Tests

1. [`packages/runner/test/presentation/presentation-scene.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/presentation/presentation-scene.test.ts) — update fixtures to pass projected overlay nodes and add a regression that raw vars are no longer required.
2. [`packages/runner/test/canvas/renderers/table-overlay-renderer.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/renderers/table-overlay-renderer.test.ts) — continue asserting exact overlay rendering, but through `surfaces.tableOverlays`.
3. [`packages/runner/test/canvas/canvas-updater.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/canvas-updater.test.ts) — add a redraw test that changes unrelated raw vars while keeping overlay nodes identical.
4. [`packages/runner/test/model/project-render-model-structural-sharing.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/project-render-model-structural-sharing.test.ts) — cover identity reuse for unchanged overlay projections.

### Commands

1. `pnpm -F @ludoforge/runner test -- presentation-scene`
2. `pnpm -F @ludoforge/runner test -- table-overlay-renderer`
3. `pnpm -F @ludoforge/runner test -- canvas-updater`
4. `pnpm -F @ludoforge/runner test`
5. `pnpm -F @ludoforge/runner typecheck`
