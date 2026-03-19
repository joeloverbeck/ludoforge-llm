# 62RUNSEMUI-007: Migrate anchored presentation consumers to world-layout

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: `specs/62-runner-semantic-ui-projection-boundary.md`, `archive/tickets/62RUNSEMUI/62RUNSEMUI-003-project-table-overlays-before-scene-assembly.md`, `archive/tickets/62RUNSEMUI/62RUNSEMUI-006-introduce-explicit-world-layout-contract.md`

## Problem

Anchored presentation features still depend on canvas-local position plumbing instead of on an explicit shared world-layout contract. Table overlays, action announcements, and any future anchored surfaces should project from semantic facts plus world-layout anchors through owned projectors, not by reaching into ad hoc `positionStore` wiring.

## Assumption Reassessment (2026-03-19)

1. [`packages/runner/src/store/game-store.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/store/game-store.ts) already owns a first-class `worldLayout` contract derived from `GameDef + visual-config.yaml`. This ticket must consume that existing contract rather than invent another layout source or move ownership again.
2. [`packages/runner/src/presentation/project-table-overlay-surface.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/presentation/project-table-overlay-surface.ts) already centralizes overlay derivation, but it still accepts a raw `positions` map instead of the explicit `WorldLayoutModel`.
3. [`packages/runner/src/presentation/action-announcement-presentation.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/presentation/action-announcement-presentation.ts) still resolves anchors through `PositionStore`, which keeps anchored presenter logic coupled to canvas-local runtime plumbing even though stable layout is already available in store state.
4. [`packages/runner/src/canvas/canvas-updater.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/canvas/canvas-updater.ts) still projects anchored overlays from the runtime position snapshot. That is the remaining architectural leak; scene rendering still needs runtime positions, but anchored surface projection should not.
5. The codebase already has the reusable anchored-surface ingredients this ticket needs: `RunnerProjectionBundle`, `WorldLayoutModel`, and visual-config-driven anchor selectors. The missing piece is to standardize anchored projectors on `projection + worldLayout + visualConfig` and remove their direct dependency on `PositionStore`.
6. The original test-plan command shapes were too optimistic: `pnpm -F @ludoforge/runner test -- <name>` currently executes the full runner suite under Vitest instead of reliably targeting only the affected files. Focused verification in this ticket should use explicit file-path test invocations.

## Architecture Check

1. Routing anchored presentation through `semantic + world-layout + visual-config` is cleaner than letting each feature reach into canvas-local stores independently.
2. This preserves the agnostic boundary: semantic facts remain in projection bundles, layout remains in the world-layout contract, and game-specific wiring remains in `visual-config.yaml`.
3. No backwards-compatibility aliasing should preserve the old `PositionStore` dependency path for anchored presenters once the world-layout path exists.
4. This ticket improves extensibility beyond the current features because future anchored surfaces can follow the same projector contract instead of inventing new layout plumbing.
5. `PositionStore` should remain only a runtime adapter for scene assembly, hit testing, and viewport updates. Using it as anchored surface input is architecturally worse than the existing store-owned `worldLayout` contract.
6. This ticket should not fold in the broader runtime-layout adapter rename/terminology cleanup; `62RUNSEMUI-008` still owns that naming work unless a small signature change is necessary to remove the dependency path here.

## What to Change

### 1. Change anchored surface projectors to accept `WorldLayoutModel`

Update anchored projector APIs so they consume the explicit `WorldLayoutModel` rather than a raw positions map.

At minimum:

- table-overlay projection
- any shared anchor helpers used by anchored presentation code

### 2. Move action-announcement anchoring onto the world-layout contract

Refactor [`packages/runner/src/presentation/action-announcement-presentation.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/presentation/action-announcement-presentation.ts) so anchored announcement specs are resolved from render/semantic data plus the explicit world-layout contract. `PositionStore` should no longer be an input to the presenter API.

### 3. Tighten canvas updater and presenter boundaries

Update canvas/presentation consumers so anchored-surface projection depends on the explicit world-layout contract and not on hidden canvas-local position ownership. Do not disturb scene assembly paths that still need runtime position snapshots for actual renderer placement.

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
- [`packages/runner/src/layout/world-layout-model.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/layout/world-layout-model.ts) (consume existing contract only; modify only if a minimal helper is justified)
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

1. [`packages/runner/test/presentation/project-table-overlay-surface.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/presentation/project-table-overlay-surface.test.ts) proves the overlay projector consumes `WorldLayoutModel` input rather than raw position maps and ignores unrelated projection churn.
2. [`packages/runner/test/presentation/action-announcement-presentation.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/presentation/action-announcement-presentation.test.ts) proves action-announcement anchoring depends on explicit `WorldLayoutModel` input, not canvas-local `PositionStore` ownership.
3. [`packages/runner/test/canvas/canvas-updater.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/canvas-updater.test.ts) proves anchored overlay updates continue to respond to projected output changes under the new contract and still respond to world-layout anchor movement even when semantic projection is unchanged.
4. Existing suite: `pnpm -F @ludoforge/runner test`
5. Existing suite: `pnpm -F @ludoforge/runner typecheck`
6. Existing suite: `pnpm -F @ludoforge/runner lint`

### Invariants

1. Anchored presentation projectors consume explicit world-layout data rather than reaching into canvas-local layout plumbing.
2. Game-specific anchor/selector policy remains in `visual-config.yaml`; projector code must remain generic.
3. This ticket must not reintroduce a second overlapping layout ownership path alongside the explicit world-layout contract.
4. Scene renderer placement may still consume runtime position snapshots; this ticket only removes runtime layout ownership from anchored surface projection.

## Test Plan

### New/Modified Tests

1. [`packages/runner/test/presentation/project-table-overlay-surface.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/presentation/project-table-overlay-surface.test.ts) — update the projector contract to use `WorldLayoutModel` explicitly and cover world-layout anchor movement.
2. [`packages/runner/test/presentation/action-announcement-presentation.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/presentation/action-announcement-presentation.test.ts) — lock action-announcement anchoring to the store-owned world-layout contract and remove `PositionStore`-based presenter assumptions.
3. [`packages/runner/test/canvas/canvas-updater.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/canvas-updater.test.ts) — verify canvas updater wiring stays correct after the anchored-surface input contract shift, including world-layout-only anchor changes.

### Commands

1. `pnpm -F @ludoforge/runner exec vitest run test/presentation/project-table-overlay-surface.test.ts`
2. `pnpm -F @ludoforge/runner exec vitest run test/presentation/action-announcement-presentation.test.ts`
3. `pnpm -F @ludoforge/runner exec vitest run test/canvas/canvas-updater.test.ts`
4. `pnpm -F @ludoforge/runner test`
5. `pnpm -F @ludoforge/runner typecheck`
6. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completion date: 2026-03-19
- What actually changed:
  - Refactored [`packages/runner/src/presentation/project-table-overlay-surface.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/presentation/project-table-overlay-surface.ts) to consume `WorldLayoutModel` directly and to derive table-center anchoring from `worldLayout.boardBounds` instead of from ad hoc runtime position averaging.
  - Refactored [`packages/runner/src/presentation/action-announcement-presentation.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/presentation/action-announcement-presentation.ts) so announcement anchoring reads store-owned `worldLayout`; the presenter API no longer depends on `PositionStore`.
  - Updated [`packages/runner/src/canvas/canvas-updater.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/canvas/canvas-updater.ts) to reproject anchored overlays from `worldLayout` changes while leaving scene placement on runtime position snapshots.
  - Adjusted [`packages/runner/src/canvas/GameCanvas.tsx`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/canvas/GameCanvas.tsx) wiring and strengthened runner tests around the new boundary.
- Deviations from original plan:
  - Reassessment showed the store-owned `worldLayout` contract already existed, so the work stayed narrowly focused on consumer migration instead of creating new layout ownership machinery.
  - The cleanest long-term anchor for `tableCenter` turned out to be `worldLayout.boardBounds`, not averaged zone positions. This is a behavior change, but it is a cleaner, more explicit contract than the previous incidental calculation.
  - The broader `PositionStore` naming cleanup remains out of scope and is still best handled by `62RUNSEMUI-008`.
- Verification results:
  - `pnpm -F @ludoforge/runner exec vitest run test/presentation/project-table-overlay-surface.test.ts`
  - `pnpm -F @ludoforge/runner exec vitest run test/presentation/action-announcement-presentation.test.ts`
  - `pnpm -F @ludoforge/runner exec vitest run test/canvas/canvas-updater.test.ts`
  - `pnpm -F @ludoforge/runner exec vitest run test/canvas/GameCanvas.test.ts`
  - `pnpm -F @ludoforge/runner exec vitest run test/canvas/renderers/table-overlay-renderer.test.ts`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner lint`
