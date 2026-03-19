# 62RUNSEMUI-006: Introduce explicit world-layout contract

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: `specs/62-runner-semantic-ui-projection-boundary.md`, `archive/tickets/62RUNSEMUI/62RUNSEMUI-001-internalize-runner-projection-source-and-semantic-frame-boundary.md`, `archive/tickets/62RUNSEMUI/62RUNSEMUI-003-project-table-overlays-before-scene-assembly.md`

## Problem

Stable board/world layout is currently an implicit canvas concern. Zone positions and bounds are derived deterministically from `GameDef` plus `visual-config.yaml`, but that contract is hidden behind `GameCanvas` and `position-store` instead of being exposed as a first-class layout/world model. This makes anchored presentation features depend on canvas-local plumbing and weakens the architectural boundary between layout and viewport runtime.

## Assumption Reassessment (2026-03-19)

1. [`packages/runner/src/layout/layout-cache.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/layout/layout-cache.ts) already computes the stable world-layout data this ticket needs: zone/world positions, unified bounds, and `boardBounds`, all derived from `GameDef` plus `VisualConfigProvider`. The missing piece is explicit contract ownership, not a new layout algorithm.
2. [`packages/runner/src/store/game-store.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/store/game-store.ts) already receives `VisualConfigProvider` in `createGameStore(...)`, so the ticket does not need to invent a new cross-layer dependency to host the stable layout contract above canvas ownership.
3. [`packages/runner/src/canvas/position-store.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/canvas/position-store.ts) is broader than the ticket first described: it currently owns both fallback grid generation and the active zone-position subscription channel used by viewport/canvas consumers. That makes it the wrong long-term owner for stable `GameDef`-derived layout, but still a valid place for runtime layout snapshots after ownership moves out.
4. [`packages/runner/src/canvas/GameCanvas.tsx`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/canvas/GameCanvas.tsx) currently computes layout directly via `getOrComputeLayout(...)`, hydrates the position store, and draws the background from `boardBounds`. This confirms the architectural leak: stable layout derivation is still performed inside canvas bootstrapping instead of being consumed from a first-class shared contract.
5. [`packages/runner/src/presentation/action-announcement-presentation.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/presentation/action-announcement-presentation.ts) and the table-overlay/canvas path already depend on world anchors conceptually, but they currently receive those anchors only through canvas-owned runtime position plumbing.

## Architecture Check

1. A dedicated world-layout contract is cleaner than forcing positions into `RenderModel` or leaving them hidden inside canvas setup code.
2. This preserves the game-agnostic boundary: layout derives from generic `GameDef` structure plus presentation-only `visual-config.yaml`, not from game-specific branches in engine/runtime code.
3. The cleanest non-canvas owner is `game-store`, because it already owns `VisualConfigProvider` and already materializes other presentation-facing derived state. Adding world layout there is a tighter boundary than keeping derivation in `GameCanvas` or introducing a second parallel top-level store.
4. No backwards-compatibility shim should preserve the old implicit ownership once the new contract exists; stable layout ownership should move to the explicit contract and canvas code should consume it.
5. The contract should describe stable world-space facts only. Viewport pan/zoom, Pixi containers, screen conversion, fallback grid layout, and interaction runtime remain separate canvas/runtime concerns.

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

`layout-cache` should return or materialize this contract explicitly instead of exposing it only as an unnamed subset of `FullLayoutResult`.

### 2. Move stable layout ownership into `game-store`

Refactor ownership so stable world layout is derived above canvas and stored as shared runner state.

Required shape:

- a `game-store` `worldLayout` field derived from `gameDef + visual config`

`GameCanvas` must stop calling `getOrComputeLayout(...)` directly for steady-state layout ownership.

### 3. Reduce canvas-local layout plumbing to runtime concerns

Once the explicit world-layout contract exists:

- either narrow the current canvas store to runtime snapshot/fallback responsibilities only
- or replace it with a more accurately named runtime layout adapter/store

Do not keep a second canvas-owned path that independently derives stable `GameDef` layout.

### 4. Align background/layout consumers with the new contract

Update current background/layout consumers so they read stable layout from `game-store.worldLayout` and use any remaining canvas-local store only as a runtime adapter for viewport/fallback updates.

## Files to Touch

- [`packages/runner/src/layout/layout-cache.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/layout/layout-cache.ts) (modify)
- `packages/runner/src/layout/world-layout-model.ts` (new or equivalent)
- [`packages/runner/src/store/game-store.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/store/game-store.ts) (modify)
- [`packages/runner/src/canvas/position-store.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/canvas/position-store.ts) (modify or replace with a runtime-layout-focused module)
- [`packages/runner/src/canvas/GameCanvas.tsx`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/canvas/GameCanvas.tsx) (modify)
- [`packages/runner/src/presentation/action-announcement-presentation.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/presentation/action-announcement-presentation.ts) (modify if runtime layout adapter type changes)
- [`packages/runner/test/layout/layout-cache.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/layout/layout-cache.test.ts) (modify)
- [`packages/runner/test/store/game-store.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/store/game-store.test.ts) (modify)
- [`packages/runner/test/canvas/position-store.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/position-store.test.ts) (modify or replace if the module is renamed)
- [`packages/runner/test/canvas/GameCanvas.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/GameCanvas.test.ts) (modify)

## Out of Scope

- Adding new showdown config or showdown UI behavior
- Deleting generic `RenderModel.globalVars` / `RenderModel.playerVars`
- Refactoring anchored surface projectors beyond what is required to point them at the explicit world-layout contract
- Changing layout algorithms or visual direction unless required to preserve existing behavior under the new ownership model

## Acceptance Criteria

### Tests That Must Pass

1. [`packages/runner/test/layout/layout-cache.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/layout/layout-cache.test.ts) proves the explicit world-layout contract exposes positions, unified bounds, and board bounds deterministically.
2. [`packages/runner/test/store/game-store.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/store/game-store.test.ts) proves `game-store` owns stable `worldLayout` derivation from `gameDef + visual config`.
3. [`packages/runner/test/canvas/position-store.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/position-store.test.ts) proves the remaining runtime adapter behavior, if still present, is scoped to runtime concerns rather than implicit stable-layout ownership.
4. [`packages/runner/test/canvas/GameCanvas.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/GameCanvas.test.ts) proves `GameCanvas` consumes store-owned explicit world-layout data instead of deriving stable layout ad hoc.
5. Existing suite: `pnpm -F @ludoforge/runner test`
6. Existing suite: `pnpm -F @ludoforge/runner typecheck`
7. Existing suite: `pnpm -F @ludoforge/runner lint`

### Invariants

1. Stable world layout is derived from `GameDef` plus `visual-config.yaml` only; it must not depend on game-state mutations or viewport runtime state.
2. The explicit world-layout contract remains separate from `RenderModel`; world-space ownership must not be smuggled back into generic semantic/render-model fields.
3. `game-store.worldLayout` is the single stable ownership path for `GameDef`-derived layout. Any remaining canvas-local store is a runtime adapter only.
4. Viewport pan/zoom, Pixi objects, screen-space conversion, and fallback grid handling remain runtime concerns and are not folded into the stable world-layout model.

## Test Plan

### New/Modified Tests

1. [`packages/runner/test/layout/layout-cache.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/layout/layout-cache.test.ts) — lock the new world-layout contract shape and its deterministic board/unified bounds semantics.
2. [`packages/runner/test/store/game-store.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/store/game-store.test.ts) — prove store-owned `worldLayout` is derived deterministically from `gameDef + visual config` and updates only when that contract changes.
3. [`packages/runner/test/canvas/position-store.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/position-store.test.ts) — verify the remaining runtime layout adapter behavior matches its narrowed ownership model.
4. [`packages/runner/test/canvas/GameCanvas.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/GameCanvas.test.ts) — verify `GameCanvas` becomes a consumer of store-owned explicit world-layout data rather than the owner of stable layout derivation.

### Commands

1. `pnpm -F @ludoforge/runner test -- layout-cache`
2. `pnpm -F @ludoforge/runner test -- game-store`
3. `pnpm -F @ludoforge/runner test -- position-store`
4. `pnpm -F @ludoforge/runner test -- GameCanvas`
5. `pnpm -F @ludoforge/runner test`
6. `pnpm -F @ludoforge/runner typecheck`
7. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completion date: 2026-03-19
- What actually changed:
  - Added an explicit `WorldLayoutModel` contract and made [`packages/runner/src/layout/layout-cache.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/layout/layout-cache.ts) expose it directly as `worldLayout`.
  - Moved stable world-layout ownership into [`packages/runner/src/store/game-store.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/store/game-store.ts) via a new `worldLayout` field derived from `gameDef + visual config`.
  - Refactored [`packages/runner/src/canvas/GameCanvas.tsx`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/canvas/GameCanvas.tsx) to consume store-owned `worldLayout` instead of calling `getOrComputeLayout(...)` directly.
  - Narrowed [`packages/runner/src/canvas/position-store.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/canvas/position-store.ts) to runtime concerns by replacing the old ownership-shaped mutators with `setFallbackZoneIDs(...)` and `setActiveLayout(...)`.
  - Strengthened runner tests to lock the store ownership boundary, runtime adapter scope, and `GameCanvas` consumption path.
- Deviations from original plan:
  - Reassessment showed that `layout-cache` already computed the stable contract, so the implementation focused on making ownership explicit rather than inventing a second layout derivation layer.
  - The ticket originally treated `game-store` as optional. Implementation made it the required shared owner because it already owns `VisualConfigProvider` and is the cleanest non-canvas boundary.
  - The existing `position-store` file was retained but narrowed to runtime adapter responsibilities instead of being fully replaced; the architectural overlap was removed by moving stable ownership to `game-store`.
- Verification results:
  - `pnpm -F @ludoforge/runner test -- layout-cache position-store GameCanvas game-store`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner lint`
