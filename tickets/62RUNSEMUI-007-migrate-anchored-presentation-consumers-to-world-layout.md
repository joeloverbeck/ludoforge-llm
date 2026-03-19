# 62RUNSEMUI-007: Migrate anchored presentation consumers to world-layout

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: `specs/62-runner-semantic-ui-projection-boundary.md`, `archive/tickets/62RUNSEMUI/62RUNSEMUI-003-project-table-overlays-before-scene-assembly.md`, `tickets/62RUNSEMUI-006-introduce-explicit-world-layout-contract.md`

## Problem

Anchored presentation features still depend on canvas-local position plumbing instead of on an explicit shared world-layout contract. Table overlays, action announcements, and any future anchored surfaces should project from semantic facts plus world-layout anchors through owned projectors, not by reaching into ad hoc `positionStore` wiring.

## Assumption Reassessment (2026-03-19)

1. [`packages/runner/src/presentation/project-table-overlay-surface.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/presentation/project-table-overlay-surface.ts) already centralizes overlay derivation, but it still accepts raw positions directly instead of a first-class world-layout contract.
2. [`packages/runner/src/presentation/action-announcement-presentation.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/presentation/action-announcement-presentation.ts) still reads positions through `PositionStore`, which keeps anchored presenter logic coupled to canvas-local infrastructure.
3. [`packages/runner/src/canvas/canvas-updater.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/canvas/canvas-updater.ts) still resolves anchored overlay projection from the local position snapshot rather than from an explicit shared world-layout input.
4. The current architecture has no general anchored-surface contract, so each anchored feature risks inventing its own position/anchor dependency path.

## Architecture Check

1. Routing anchored presentation through `semantic + world-layout + visual-config` is cleaner than letting each feature reach into canvas-local stores independently.
2. This preserves the agnostic boundary: semantic facts remain in projection bundles, layout remains in the world-layout contract, and game-specific wiring remains in `visual-config.yaml`.
3. No backwards-compatibility aliasing should preserve the old `PositionStore` dependency path for anchored presenters once the world-layout path exists.
4. This ticket improves extensibility beyond the current features because future anchored surfaces can follow the same projector contract instead of inventing new layout plumbing.

## What to Change

### 1. Change anchored surface projectors to accept the world-layout contract

Update anchored projector APIs so they consume the explicit world-layout model/snapshot rather than a raw positions map.

At minimum:

- table-overlay projection
- any shared anchor helpers used by anchored presentation code

### 2. Move action-announcement anchoring onto the world-layout contract

Refactor [`packages/runner/src/presentation/action-announcement-presentation.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/presentation/action-announcement-presentation.ts) so anchored announcement specs are resolved from render/semantic data plus the explicit world-layout contract.

### 3. Tighten canvas updater and presenter boundaries

Update canvas/presentation consumers so they depend on the explicit world-layout contract and not on hidden canvas-local position ownership.

### 4. Add a reusable anchored-surface projection convention

Document and encode the rule that anchored surfaces project from:

- semantic projection input
- explicit world-layout input
- `visual-config.yaml`

not from ad hoc direct canvas state access.

## Files to Touch

- [`packages/runner/src/presentation/project-table-overlay-surface.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/presentation/project-table-overlay-surface.ts) (modify)
- [`packages/runner/src/presentation/action-announcement-presentation.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/presentation/action-announcement-presentation.ts) (modify)
- [`packages/runner/src/canvas/canvas-updater.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/canvas/canvas-updater.ts) (modify)
- [`packages/runner/src/canvas/GameCanvas.tsx`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/canvas/GameCanvas.tsx) (modify if wiring changes are needed)
- [`packages/runner/test/presentation/project-table-overlay-surface.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/presentation/project-table-overlay-surface.test.ts) (modify)
- [`packages/runner/test/presentation/action-announcement-presentation.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/presentation/action-announcement-presentation.test.ts) (modify)
- [`packages/runner/test/canvas/canvas-updater.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/canvas-updater.test.ts) (modify)

## Out of Scope

- Introducing showdown config or showdown UI behavior
- Deleting `RenderModel.globalVars` / `RenderModel.playerVars`
- Reworking viewport pan/zoom or Pixi interaction runtime
- Creating new anchored surfaces beyond the current table-overlay and action-announcement consumers

## Acceptance Criteria

### Tests That Must Pass

1. [`packages/runner/test/presentation/project-table-overlay-surface.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/presentation/project-table-overlay-surface.test.ts) proves the overlay projector consumes world-layout input rather than raw position maps.
2. [`packages/runner/test/presentation/action-announcement-presentation.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/presentation/action-announcement-presentation.test.ts) proves action-announcement anchoring depends on explicit world-layout input, not canvas-local `PositionStore` ownership.
3. [`packages/runner/test/canvas/canvas-updater.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/canvas-updater.test.ts) proves anchored overlay updates continue to respond to projected output changes under the new contract.
4. Existing suite: `pnpm -F @ludoforge/runner test`
5. Existing suite: `pnpm -F @ludoforge/runner typecheck`
6. Existing suite: `pnpm -F @ludoforge/runner lint`

### Invariants

1. Anchored presentation projectors consume explicit world-layout data rather than reaching into canvas-local layout plumbing.
2. Game-specific anchor/selector policy remains in `visual-config.yaml`; projector code must remain generic.
3. This ticket must not reintroduce a second overlapping layout ownership path alongside the explicit world-layout contract.

## Test Plan

### New/Modified Tests

1. [`packages/runner/test/presentation/project-table-overlay-surface.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/presentation/project-table-overlay-surface.test.ts) — update the projector contract to use the world-layout input explicitly.
2. [`packages/runner/test/presentation/action-announcement-presentation.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/presentation/action-announcement-presentation.test.ts) — lock action-announcement anchoring to the world-layout contract.
3. [`packages/runner/test/canvas/canvas-updater.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/canvas-updater.test.ts) — verify canvas updater wiring stays correct after the input contract shift.

### Commands

1. `pnpm -F @ludoforge/runner test -- project-table-overlay-surface`
2. `pnpm -F @ludoforge/runner test -- action-announcement-presentation`
3. `pnpm -F @ludoforge/runner test -- canvas-updater`
4. `pnpm -F @ludoforge/runner test`
5. `pnpm -F @ludoforge/runner typecheck`
6. `pnpm -F @ludoforge/runner lint`
