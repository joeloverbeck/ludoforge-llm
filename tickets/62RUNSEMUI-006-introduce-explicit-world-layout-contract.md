# 62RUNSEMUI-006: Introduce explicit world-layout contract

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: `specs/62-runner-semantic-ui-projection-boundary.md`, `archive/tickets/62RUNSEMUI/62RUNSEMUI-001-internalize-runner-projection-source-and-semantic-frame-boundary.md`, `archive/tickets/62RUNSEMUI/62RUNSEMUI-003-project-table-overlays-before-scene-assembly.md`

## Problem

Stable board/world layout is currently an implicit canvas concern. Zone positions and bounds are derived deterministically from `GameDef` plus `visual-config.yaml`, but that contract is hidden behind `GameCanvas` and `position-store` instead of being exposed as a first-class layout/world model. This makes anchored presentation features depend on canvas-local plumbing and weakens the architectural boundary between layout and viewport runtime.

## Assumption Reassessment (2026-03-19)

1. [`packages/runner/src/layout/layout-cache.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/layout/layout-cache.ts) already computes deterministic zone positions and both unified bounds and `boardBounds` from `GameDef` plus `VisualConfigProvider`.
2. [`packages/runner/src/canvas/position-store.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/canvas/position-store.ts) currently exposes positions plus bounds, but not `boardBounds`, and it lives under canvas ownership even though the underlying layout is not a viewport/runtime concern.
3. [`packages/runner/src/canvas/GameCanvas.tsx`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/canvas/GameCanvas.tsx) currently computes layout, updates the position store, and uses `boardBounds` for background drawing. That means stable layout ownership is still trapped inside canvas bootstrapping.
4. [`packages/runner/src/presentation/action-announcement-presentation.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/presentation/action-announcement-presentation.ts) and the table-overlay path already depend on layout-derived anchors conceptually, but they do so through canvas-owned position plumbing rather than an explicit shared contract.

## Architecture Check

1. A dedicated world-layout contract is cleaner than forcing positions into `RenderModel` or leaving them hidden inside canvas setup code.
2. This preserves the game-agnostic boundary: layout derives from generic `GameDef` structure plus presentation-only `visual-config.yaml`, not from game-specific branches in engine/runtime code.
3. No backwards-compatibility shim should preserve the old implicit ownership once the new contract exists; stable layout ownership should move to the explicit contract and canvas code should consume it.
4. The contract should describe stable world-space facts only. Viewport pan/zoom, Pixi containers, screen conversion, and interaction runtime remain separate canvas/runtime concerns.

## What to Change

### 1. Define a first-class world-layout model

Introduce an explicit layout/world contract, for example:

- `WorldLayoutModel`
- `WorldLayoutSnapshot`
- or another focused equivalent

The contract must include:

- zone/world positions
- unified world bounds
- board bounds

It must not include viewport state, screen-space coordinates, or Pixi objects.

### 2. Move stable layout ownership out of canvas-local plumbing

Refactor ownership so stable world layout is not implicitly created and owned only by `GameCanvas`.

Acceptable shapes:

- a store-level `worldLayout` field derived from `gameDef + visual config`
- a dedicated shared world-layout store owned outside `GameCanvas`

The key requirement is architectural ownership, not a specific implementation vehicle.

### 3. Reduce `position-store` to runtime concerns or replace it

Once the explicit world-layout contract exists:

- either narrow `position-store` to runtime override / subscription mechanics only
- or replace it with the new shared contract if no separate runtime mutation layer is justified

Do not keep both as overlapping long-term ownership paths.

### 4. Align background/layout consumers with the new contract

Update current background/layout consumers so they read from the explicit world-layout contract rather than from canvas-owned ad hoc layout state.

## Files to Touch

- [`packages/runner/src/layout/layout-cache.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/layout/layout-cache.ts) (modify)
- [`packages/runner/src/canvas/position-store.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/canvas/position-store.ts) (modify or replace)
- [`packages/runner/src/canvas/GameCanvas.tsx`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/canvas/GameCanvas.tsx) (modify)
- [`packages/runner/src/store/game-store.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/store/game-store.ts) (modify if store-owned)
- [`packages/runner/test/layout/layout-cache.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/layout/layout-cache.test.ts) (modify)
- [`packages/runner/test/canvas/position-store.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/position-store.test.ts) (modify)
- [`packages/runner/test/canvas/GameCanvas.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/GameCanvas.test.ts) (modify)

## Out of Scope

- Adding new showdown config or showdown UI behavior
- Deleting generic `RenderModel.globalVars` / `RenderModel.playerVars`
- Refactoring anchored surface projectors beyond what is required to point them at the explicit world-layout contract
- Changing layout algorithms or visual direction unless required to preserve existing behavior under the new ownership model

## Acceptance Criteria

### Tests That Must Pass

1. [`packages/runner/test/layout/layout-cache.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/layout/layout-cache.test.ts) proves the explicit world-layout contract exposes positions, unified bounds, and board bounds deterministically.
2. [`packages/runner/test/canvas/position-store.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/position-store.test.ts) proves the remaining runtime store behavior, if still present, is scoped to runtime concerns rather than implicit stable-layout ownership.
3. [`packages/runner/test/canvas/GameCanvas.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/GameCanvas.test.ts) proves `GameCanvas` consumes the explicit world-layout contract instead of owning stable layout derivation ad hoc.
4. Existing suite: `pnpm -F @ludoforge/runner test`
5. Existing suite: `pnpm -F @ludoforge/runner typecheck`
6. Existing suite: `pnpm -F @ludoforge/runner lint`

### Invariants

1. Stable world layout is derived from `GameDef` plus `visual-config.yaml` only; it must not depend on game-state mutations or viewport runtime state.
2. The explicit world-layout contract remains separate from `RenderModel`; world-space ownership must not be smuggled back into generic semantic/render-model fields.
3. Viewport pan/zoom, Pixi objects, and screen-space conversion remain runtime concerns and are not folded into the stable world-layout model.

## Test Plan

### New/Modified Tests

1. [`packages/runner/test/layout/layout-cache.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/layout/layout-cache.test.ts) — lock the new world-layout contract shape and its deterministic board/unified bounds semantics.
2. [`packages/runner/test/canvas/position-store.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/position-store.test.ts) — verify the remaining store behavior matches its narrowed ownership model.
3. [`packages/runner/test/canvas/GameCanvas.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/GameCanvas.test.ts) — verify `GameCanvas` becomes a consumer of explicit world-layout data rather than the owner of stable layout derivation.

### Commands

1. `pnpm -F @ludoforge/runner test -- layout-cache`
2. `pnpm -F @ludoforge/runner test -- position-store`
3. `pnpm -F @ludoforge/runner test -- GameCanvas`
4. `pnpm -F @ludoforge/runner test`
5. `pnpm -F @ludoforge/runner typecheck`
6. `pnpm -F @ludoforge/runner lint`
