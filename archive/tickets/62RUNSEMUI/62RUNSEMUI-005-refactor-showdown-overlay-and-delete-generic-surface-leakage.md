# 62RUNSEMUI-005: Refactor showdown overlay and delete generic surface leakage

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: `specs/62-runner-semantic-ui-projection-boundary.md`, `archive/tickets/62RUNSEMUI/62RUNSEMUI-002-add-explicit-render-surface-contracts.md`, `archive/tickets/62RUNSEMUI/62RUNSEMUI-004-add-visual-config-driven-showdown-surface-projection.md`

## Problem

Ticket `62RUNSEMUI-004` completed the showdown migration already:

- `ShowdownOverlay` now renders from `surfaces.showdown`
- `RenderModel.globalVars` / `RenderModel.playerVars` have been deleted
- showdown wiring now lives in `visual-config.yaml`

This ticket is now only needed for follow-up hardening where the current implementation or tests still drift from the intended boundary. The production runner architecture is already in the right place; the remaining risk is mostly stale test scaffolding and one notable missing structural-sharing assertion for showdown surfaces.

## Assumption Reassessment (2026-03-19)

1. [`packages/runner/src/ui/ShowdownOverlay.tsx`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/ui/ShowdownOverlay.tsx) already renders `renderModel?.surfaces.showdown` directly.
2. [`packages/runner/src/model/render-model.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/model/render-model.ts) no longer exposes `globalVars` or `playerVars`.
3. Table overlays still correctly consume `RunnerProjectionBundle.source` through [`packages/runner/src/presentation/project-table-overlay-surface.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/presentation/project-table-overlay-surface.ts) instead of reading `RenderModel`.
4. That table-overlay architecture is intentional and should not be “normalized” by pushing anchored canvas surfaces into `RenderModel`; anchored canvas surfaces should continue to project from internal semantic + world-layout contracts rather than from the public DOM-facing render-model surface.
5. [`packages/runner/test/ui/ShowdownOverlay.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/ui/ShowdownOverlay.test.ts) is the live showdown overlay test file. The older `.tsx` path named below in the original ticket was stale.
6. The main remaining leakage is in test scaffolding, not production types: some canvas/table-overlay tests still create synthetic `RenderModel` objects with `globalVars` / `playerVars` bolted onto them, then derive `RunnerProjectionBundle` from those fake fields. That is test-only drift from the intended boundary and is worth removing.
7. There is existing production stabilization for `surfaces.showdown` in [`packages/runner/src/model/project-render-model.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/model/project-render-model.ts), but the dedicated structural-sharing test file does not currently assert showdown reference reuse directly.

## Architecture Check

1. UI components should render explicit surface contracts only; this keeps semantic derivation and presentation wiring out of React components.
2. Deleting the generic var bags after migration is cleaner than preserving them as tempting escape hatches for future surfaces.
3. The cleanup remains runner-only and does not move any game-specific presentation knowledge into engine/runtime code.
4. Do not pull world-layout or anchored-surface concerns back into `RenderModel`. `RenderModel` is for explicit UI-facing DOM surface contracts; anchored canvas surfaces may continue to consume `RunnerProjectionBundle` plus `WorldLayoutModel` directly.
5. Cleaning stale test scaffolding to match the production boundary is beneficial architecture work. It removes a misleading pattern where tests imply `RenderModel` still transports raw projection vars.
6. No broader architectural rewrite is justified here. The current split of `RenderModel` for explicit UI surfaces and `RunnerProjectionBundle` for internal projection input is cleaner than the old generic-bag design and should be reinforced, not replaced.

## What to Change

### 1. Reassess whether any meaningful follow-up work remains

Before implementing more code, verify whether there is still any real bug, regression risk, or architectural gap left after `62RUNSEMUI-004`.

### 2. Limit work to hardening that reflects the current architecture

Concrete remaining work justified by current code/tests:

- strengthen showdown surface structural-sharing tests
- tighten boundary tests to guard against future raw-data leakage
- clean up leftover test-only assumptions that still model the old architecture by treating `RunnerProjectionBundle.source` as its own input instead of as fake `RenderModel` fields

### 3. Preserve the anchored-surface boundary explicitly

Do not move table overlays or other anchored canvas features onto `RenderModel` just for consistency. The correct split is:

- explicit DOM-facing special surfaces like showdown can live on `RenderModel.surfaces`
- anchored canvas surfaces can continue projecting from internal semantic source plus `WorldLayoutModel`

## Files to Touch

- [`packages/runner/test/model/project-render-model-structural-sharing.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/project-render-model-structural-sharing.test.ts) (modify if needed)
- [`packages/runner/test/model/runner-frame-projection-boundary.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/runner-frame-projection-boundary.test.ts) (modify if needed)
- [`packages/runner/test/ui/ShowdownOverlay.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/ui/ShowdownOverlay.test.ts) (modify only if new regressions are found)
- [`packages/runner/test/canvas/canvas-updater.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/canvas-updater.test.ts) (clean stale test scaffolding if touched)
- [`packages/runner/test/canvas/renderers/table-overlay-renderer.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/renderers/table-overlay-renderer.test.ts) (clean stale test scaffolding if touched)

## Out of Scope

- Adding new surface types beyond table overlays and showdown
- Introducing or revising the world-layout contract for anchored canvas surfaces
- Reworking unrelated UI panels that already consume explicit non-surface render-model fields
- Changing showdown copy, styling, or CSS beyond what is required to bind the new data contract
- Modifying engine compilation, kernel logic, or game rules

## Acceptance Criteria

### Tests That Must Pass

1. If this ticket remains active, [`packages/runner/test/model/project-render-model-structural-sharing.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/project-render-model-structural-sharing.test.ts) should prove showdown surface identity is stable when projected showdown output is unchanged.
2. Any added boundary tests must preserve the rule that anchored canvas surfaces are allowed to depend on internal projection source plus `WorldLayoutModel` without being reintroduced as `RenderModel` fields.
3. Canvas/table-overlay tests must stop implying that `RenderModel` carries `globalVars` / `playerVars`; projection-source inputs should be modeled explicitly as `RunnerProjectionBundle.source` test data instead.
5. Command: `pnpm -F @ludoforge/runner test`
6. Command: `pnpm -F @ludoforge/runner typecheck`
7. Command: `pnpm -F @ludoforge/runner lint`

### Invariants

1. `RenderModel` must not regain raw variable bags or other generic leakage for surface-specific needs.
2. `RunnerProjectionSource` remains valid for internal projectors.
3. Anchored canvas surfaces must not be forced onto `RenderModel` purely for symmetry with DOM-facing surfaces.
4. No compatibility aliases or shadow getters should be introduced if another leaky field is deleted later.

## Test Plan

### New/Modified Tests

1. [`packages/runner/test/model/project-render-model-structural-sharing.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/project-render-model-structural-sharing.test.ts) — add coverage only if showdown-surface reuse or unrelated-state churn still lacks protection.
2. [`packages/runner/test/model/runner-frame-projection-boundary.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/runner-frame-projection-boundary.test.ts) — strengthen only if another leakage path is found.
3. [`packages/runner/test/canvas/canvas-updater.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/canvas-updater.test.ts) and/or [`packages/runner/test/canvas/renderers/table-overlay-renderer.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/renderers/table-overlay-renderer.test.ts) — replace stale fake-render-model var plumbing with explicit projection-source fixtures if those tests are touched.
4. Avoid adding tests that imply table overlays should move from internal projector inputs onto `RenderModel`.

### Commands

1. `pnpm -F @ludoforge/runner test -- project-render-model-structural-sharing`
2. `pnpm -F @ludoforge/runner test -- runner-frame-projection-boundary`
3. `pnpm -F @ludoforge/runner test -- canvas-updater`
4. `pnpm -F @ludoforge/runner test -- table-overlay-renderer`
5. `pnpm -F @ludoforge/runner test`
6. `pnpm -F @ludoforge/runner typecheck`
7. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completion date: 2026-03-19
- What actually changed:
  - Added direct structural-sharing coverage for `RenderModel.surfaces.showdown`.
  - Updated canvas/table-overlay test scaffolding so raw projection vars are modeled as `RunnerProjectionBundle.source` input instead of fake `RenderModel` fields.
  - Kept the existing production architecture intact: `RenderModel` remains explicit UI-facing surface data, while anchored table overlays continue to project from internal projection source plus world layout.
- Deviations from original plan:
  - No production runner code changed because the architecture described by the ticket had already landed cleanly.
  - The only necessary follow-up work was test hardening and test-boundary cleanup; there was no justified code refactor beyond that.
- Verification results:
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner lint`
