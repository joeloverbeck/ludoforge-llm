# 62RUNSEMUI-005: Refactor showdown overlay and delete generic surface leakage

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: `specs/62-runner-semantic-ui-projection-boundary.md`, `archive/tickets/62RUNSEMUI/62RUNSEMUI-002-add-explicit-render-surface-contracts.md`, `archive/tickets/62RUNSEMUI/62RUNSEMUI-004-add-visual-config-driven-showdown-surface-projection.md`

## Problem

Ticket `62RUNSEMUI-004` completed the showdown migration already:

- `ShowdownOverlay` now renders from `surfaces.showdown`
- `RenderModel.globalVars` / `RenderModel.playerVars` have been deleted
- showdown wiring now lives in `visual-config.yaml`

This ticket is now only needed for any follow-up cleanup that remains after that migration, especially structural-sharing hardening and boundary regressions that may still be worth tightening.

## Assumption Reassessment (2026-03-19)

1. [`packages/runner/src/ui/ShowdownOverlay.tsx`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/ui/ShowdownOverlay.tsx) already renders `renderModel?.surfaces.showdown` directly.
2. [`packages/runner/src/model/render-model.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/model/render-model.ts) no longer exposes `globalVars` or `playerVars`.
3. Table overlays still correctly consume `RunnerProjectionBundle.source` through [`packages/runner/src/presentation/project-table-overlay-surface.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/presentation/project-table-overlay-surface.ts) instead of reading `RenderModel`.
4. That table-overlay architecture is intentional and should not be “normalized” by pushing anchored canvas surfaces into `RenderModel`; anchored canvas surfaces should continue to project from internal semantic + world-layout contracts rather than from the public DOM-facing render-model surface.
5. The only plausible remaining value in this ticket is extra hardening around structural sharing, boundary tests, or deletion of any new leakage if it reappears.

## Architecture Check

1. UI components should render explicit surface contracts only; this keeps semantic derivation and presentation wiring out of React components.
2. Deleting the generic var bags after migration is cleaner than preserving them as tempting escape hatches for future surfaces.
3. The cleanup remains runner-only and does not move any game-specific presentation knowledge into engine/runtime code.
4. Do not pull world-layout or anchored-surface concerns back into `RenderModel`. `RenderModel` is for explicit UI-facing DOM surface contracts; anchored canvas surfaces may continue to consume `RunnerProjectionBundle` plus `WorldLayoutModel` directly.
5. If no concrete follow-up cleanup remains after validation, this ticket should be closed rather than inventing work.

## What to Change

### 1. Reassess whether any meaningful follow-up work remains

Before implementing more code, verify whether there is still any real bug, regression risk, or architectural gap left after `62RUNSEMUI-004`.

### 2. If needed, limit work to hardening

Potential remaining work, if justified by code/tests:

- strengthen showdown surface structural-sharing tests
- tighten boundary tests to guard against future raw-data leakage
- clean up any leftover test-only assumptions that still model the old architecture

### 3. Preserve the anchored-surface boundary explicitly

Do not move table overlays or other anchored canvas features onto `RenderModel` just for consistency. The correct split is:

- explicit DOM-facing special surfaces like showdown can live on `RenderModel.surfaces`
- anchored canvas surfaces can continue projecting from internal semantic source plus `WorldLayoutModel`

## Files to Touch

- [`packages/runner/test/model/project-render-model-structural-sharing.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/project-render-model-structural-sharing.test.ts) (modify if needed)
- [`packages/runner/test/model/runner-frame-projection-boundary.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/runner-frame-projection-boundary.test.ts) (modify if needed)
- [`packages/runner/test/ui/ShowdownOverlay.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/ui/ShowdownOverlay.test.ts) (modify only if new regressions are found)

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
3. Avoid adding tests that imply table overlays should move from internal projector inputs onto `RenderModel`.

### Commands

1. `pnpm -F @ludoforge/runner test -- project-render-model-structural-sharing`
2. `pnpm -F @ludoforge/runner test -- runner-frame-projection-boundary`
4. `pnpm -F @ludoforge/runner test`
5. `pnpm -F @ludoforge/runner typecheck`
6. `pnpm -F @ludoforge/runner lint`
