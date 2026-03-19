# 62RUNSEMUI-003: Project table overlays before scene assembly

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: `specs/62-runner-semantic-ui-projection-boundary.md`, `archive/tickets/62RUNSEMUI/62RUNSEMUI-001-internalize-runner-projection-source-and-semantic-frame-boundary.md`, `archive/tickets/62RUNSEMUI/62RUNSEMUI-002-add-explicit-render-surface-contracts.md`

## Problem

`presentation-scene` currently reads `RunnerProjectionSource.globalVars` and `RunnerProjectionSource.playerVars` to derive table-overlay text and marker nodes. That violates the ownership boundary in Spec 62: overlays should be projected earlier into explicit surface nodes, and scene assembly should only render them.

## Assumption Reassessment (2026-03-19)

1. [`packages/runner/src/presentation/presentation-scene.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/presentation/presentation-scene.ts) currently owns `resolveOverlayNodes(...)` and reaches directly into semantic vars.
2. [`packages/runner/src/canvas/canvas-updater.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/canvas/canvas-updater.ts) still compares overlay-relevant `globalVars` / `playerVars` for redraw decisions, which is the exact late-derivation coupling Spec 62 calls out.
3. [`packages/runner/src/model/render-model.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/model/render-model.ts) already has a placeholder `surfaces.tableOverlays` contract from ticket `62RUNSEMUI-002`, but it is not populated anywhere today.
4. The current `RenderTableOverlayNode` shape includes absolute `point` coordinates. Those coordinates depend on resolved board positions from the position store, which `projectRenderModel(...)` does not currently own.
5. Existing tests in [`packages/runner/test/presentation/presentation-scene.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/presentation/presentation-scene.test.ts), [`packages/runner/test/canvas/renderers/table-overlay-renderer.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/renderers/table-overlay-renderer.test.ts), and [`packages/runner/test/canvas/canvas-updater.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/canvas-updater.test.ts) already give a stable place to pin the migration.

## Architecture Check

1. A dedicated overlay-surface projector is more beneficial than the current architecture because it centralizes overlay derivation into one owned stage without forcing point-resolution concerns into the render-model layer prematurely.
2. That projector belongs at the presentation/canvas boundary, where semantic projection input, visible zones, and resolved board positions are all available.
3. This preserves the agnostic engine rule: the projector remains generic and consumes selectors from `visual-config.yaml` instead of embedding game-specific overlay knowledge.
4. No compatibility bridge should leave `presentation-scene` half-reading raw vars and half-reading explicit overlay nodes; scene assembly and canvas updates should switch fully once this ticket lands.
5. Populating `RenderModel.surfaces.tableOverlays` remains a broader follow-up architectural option, but it is not the most robust change in this ticket unless overlay point ownership also moves into that layer.

## What to Change

### 1. Add a dedicated table-overlay surface projector

Move the logic that interprets `tableOverlays` config and raw projection vars out of [`packages/runner/src/presentation/presentation-scene.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/presentation/presentation-scene.ts) and into a dedicated projector at the presentation/canvas boundary.

Acceptable shapes:

- helper inside a focused presentation module
- new file such as `packages/runner/src/presentation/project-table-overlay-surface.ts`

The output must be explicit overlay surface nodes with resolved points and styling, owned outside renderer mutation code.

### 2. Change presentation-scene to consume preprojected overlay nodes

Refactor scene assembly so it accepts overlay nodes from the dedicated projector instead of recomputing overlay text/markers from semantic vars.

### 3. Tighten canvas redraw logic around explicit overlay surfaces

Update [`packages/runner/src/canvas/canvas-updater.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/canvas/canvas-updater.ts) so overlay redraw/equality decisions depend on explicit projected overlay surface nodes, not broad `globalVars` / `playerVars` comparisons.

## Files to Touch

- [`packages/runner/src/presentation/project-table-overlay-surface.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/presentation/project-table-overlay-surface.ts) (new or equivalent)
- [`packages/runner/src/presentation/presentation-scene.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/presentation/presentation-scene.ts) (modify)
- [`packages/runner/src/canvas/canvas-updater.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/canvas/canvas-updater.ts) (modify)
- [`packages/runner/test/presentation/presentation-scene.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/presentation/presentation-scene.test.ts) (modify)
- [`packages/runner/test/canvas/renderers/table-overlay-renderer.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/renderers/table-overlay-renderer.test.ts) (modify)
- [`packages/runner/test/canvas/canvas-updater.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/canvas-updater.test.ts) (modify)

## Out of Scope

- Adding new showdown config or UI behavior
- Populating or deleting `RenderModel.surfaces.tableOverlays` in the render-model layer
- Deleting `RenderModel.globalVars` / `RenderModel.playerVars`
- Refactoring unrelated zone/token presentation logic
- Changing table-overlay YAML semantics beyond what existing config already expresses

## Acceptance Criteria

### Tests That Must Pass

1. [`packages/runner/test/presentation/presentation-scene.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/presentation/presentation-scene.test.ts) proves the scene renders overlay nodes from the dedicated projector and does not contain inline overlay derivation logic.
2. [`packages/runner/test/canvas/renderers/table-overlay-renderer.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/renderers/table-overlay-renderer.test.ts) still passes using explicit overlay nodes.
3. [`packages/runner/test/canvas/canvas-updater.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/canvas-updater.test.ts) proves redraw decisions respond to projected overlay-node changes instead of raw var array equality.
4. [`packages/runner/test/presentation/project-table-overlay-surface.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/presentation/project-table-overlay-surface.test.ts) proves the dedicated projector produces stable explicit overlay nodes and ignores unrelated raw-var churn when the projected result is unchanged.
5. Command: `pnpm -F @ludoforge/runner test`
6. Command: `pnpm -F @ludoforge/runner typecheck`
7. Command: `pnpm -F @ludoforge/runner lint`

### Invariants

1. `presentation-scene` must not inspect `globalVars` or `playerVars` after this ticket.
2. Overlay labels, seat anchoring, and marker rendering remain presentation concerns driven by `visual-config.yaml`, not `GameDef` or semantic frame code.
3. Overlay updates remain deterministic and stable when projected overlay output is unchanged.
4. This ticket must not create a second long-lived overlay projection path that competes with the dedicated surface projector.

## Test Plan

### New/Modified Tests

1. [`packages/runner/test/presentation/presentation-scene.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/presentation/presentation-scene.test.ts) — update fixtures to pass projected overlay nodes and add a regression that raw vars are no longer required.
2. [`packages/runner/test/canvas/renderers/table-overlay-renderer.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/renderers/table-overlay-renderer.test.ts) — continue asserting exact overlay rendering, but through explicit overlay nodes.
3. [`packages/runner/test/canvas/canvas-updater.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/canvas-updater.test.ts) — add redraw tests that distinguish projected overlay-node changes from unrelated raw-var churn.
4. [`packages/runner/test/presentation/project-table-overlay-surface.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/presentation/project-table-overlay-surface.test.ts) — cover the new projector directly so overlay derivation semantics and equality behavior are locked outside the scene and renderer tests.

### Commands

1. `pnpm -F @ludoforge/runner test -- presentation-scene`
2. `pnpm -F @ludoforge/runner test -- table-overlay-renderer`
3. `pnpm -F @ludoforge/runner test -- canvas-updater`
4. `pnpm -F @ludoforge/runner test -- project-table-overlay-surface`
5. `pnpm -F @ludoforge/runner test`
6. `pnpm -F @ludoforge/runner typecheck`
7. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completion date: 2026-03-19
- What actually changed:
  - Added a dedicated presentation-layer projector at [`packages/runner/src/presentation/project-table-overlay-surface.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/presentation/project-table-overlay-surface.ts) that owns table-overlay node derivation from semantic projection input, positions, and `visual-config.yaml`.
  - Removed inline overlay derivation from [`packages/runner/src/presentation/presentation-scene.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/presentation/presentation-scene.ts); scene assembly now consumes explicit overlay nodes.
  - Updated [`packages/runner/src/canvas/canvas-updater.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/canvas/canvas-updater.ts) to compare projected overlay-node output instead of raw variable bags for overlay redraw decisions.
  - Updated [`packages/runner/src/canvas/renderers/table-overlay-renderer.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/canvas/renderers/table-overlay-renderer.ts) and related renderer contracts to consume explicit overlay-node styling instead of reading config items indirectly through scene-owned types.
  - Added focused projector coverage in [`packages/runner/test/presentation/project-table-overlay-surface.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/presentation/project-table-overlay-surface.test.ts) and tightened scene/updater tests around the new ownership boundary.
- Deviations from original plan:
  - Reassessment showed that projecting `tableOverlays` directly inside `projectRenderModel(...)` would be a worse fit for the current architecture because overlay `point` coordinates depend on the position store, which the render-model layer does not own.
  - The ticket was narrowed to a cleaner presentation/canvas boundary projector instead of populating `RenderModel.surfaces.tableOverlays` prematurely.
  - The renderer contract was made more explicit than originally listed by resolving overlay styling into the projected node type, which reduces coupling between renderer code and raw config item shapes.
- Verification results:
  - `pnpm -F @ludoforge/runner test -- presentation-scene project-table-overlay-surface canvas-updater table-overlay-renderer`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner lint`
