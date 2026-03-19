# 62RUNSEMUI-008: Rename runtime layout adapter and delete position-store terminology

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: `specs/62-runner-semantic-ui-projection-boundary.md`, `archive/tickets/62RUNSEMUI/62RUNSEMUI-006-introduce-explicit-world-layout-contract.md`, `tickets/62RUNSEMUI-007-migrate-anchored-presentation-consumers-to-world-layout.md`

## Problem

After `62RUNSEMUI-006`, stable board/world layout ownership correctly lives in `game-store.worldLayout`, and the remaining canvas-local store only handles runtime snapshots and fallback layout. However, the code still uses `position-store` / `PositionStore` terminology, which now misstates ownership and encourages future code to treat that module as the primary layout contract again. The architecture is functionally cleaner than before, but the naming is still leaky.

## Assumption Reassessment (2026-03-19)

1. The former [`packages/runner/src/canvas/position-store.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/canvas/runtime-layout-store.ts) no longer owns stable `GameDef`-derived layout. Its contract exposes runtime mutators `setFallbackZoneIDs(...)` and `setActiveLayout(...)`, which makes it a runtime layout adapter/store in behavior, not a stable layout source.
2. The remaining runtime consumers still refer to this adapter through `PositionStore` naming in [`packages/runner/src/canvas/GameCanvas.tsx`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/canvas/GameCanvas.tsx), [`packages/runner/src/canvas/canvas-updater.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/canvas/canvas-updater.ts), and the corresponding canvas tests.
3. Archived ticket [`62RUNSEMUI-007`](/home/joeloverbeck/projects/ludoforge-llm/archive/tickets/62RUNSEMUI/62RUNSEMUI-007-migrate-anchored-presentation-consumers-to-world-layout.md) already removed anchored presentation dependence on `PositionStore`. [`packages/runner/src/presentation/action-announcement-presentation.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/presentation/action-announcement-presentation.ts) now reads store-owned `worldLayout`, so it is no longer in scope for this rename.
4. Spec 62’s current architecture explicitly separates stable `WorldLayoutModel` ownership from viewport/runtime state. Keeping the old `position-store` name after that split is a real architectural terminology mismatch, not merely a cosmetic issue.
5. The runtime adapter still owns `computeGridLayout(...)` as its fallback layout policy. That fallback remains a generic canvas/runtime concern, so it can stay with the renamed adapter for now; splitting fallback derivation into a separate module would be broader refactoring and is not required to restore the ownership boundary.
6. The original focused-test command shape in this ticket was too loose. In this repo, `pnpm -F @ludoforge/runner test -- <pattern>` forwards to `vitest run`, but explicit file-path invocations are the cleaner and less ambiguous verification command for this rename.

## Architecture Check

1. Renaming the remaining runtime adapter to match its narrowed responsibility is cleaner than leaving a misleading name in place. Accurate names matter here because this boundary is architectural, not incidental.
2. This preserves the intended separation of concerns: `GameSpecDoc` and `GameDef` remain game-agnostic, `visual-config.yaml` remains the home for game-specific presentation policy, `game-store.worldLayout` remains the stable layout contract, and the runtime adapter remains a generic canvas/runtime concern only.
3. No backwards-compatibility aliasing should be kept. Once the rename lands, the old module path and `PositionStore` naming should be deleted rather than preserved as compatibility exports.
4. This is more robust than “just documenting it” because it removes the misleading vocabulary that would otherwise keep pulling future code back toward the wrong ownership model.
5. A larger redesign is not warranted here. The current architecture is already directionally correct after `62RUNSEMUI-006` and `62RUNSEMUI-007`; the remaining problem is inaccurate naming around an otherwise valid runtime boundary.

## What to Change

### 1. Rename the runtime adapter module and types

Rename the remaining canvas-local layout adapter to a name that reflects its post-`62RUNSEMUI-006` role.

Representative shapes:

- `runtime-layout-store.ts`
- `canvas-layout-runtime-store.ts`

Representative type names:

- `RuntimeLayoutStore`
- `RuntimeLayoutSnapshot`

Do not keep `PositionStore` as the long-term public name once the new contract is in place.

### 2. Update runtime consumers to use the new adapter terminology

Refactor the remaining runtime consumers to import and depend on the renamed adapter/type names.

At minimum:

- `GameCanvas`
- `canvas-updater`
- relevant test fixtures and mocks

### 3. Tighten the boundary in naming and comments

Where this runtime adapter is referenced, make the ownership boundary obvious:

- stable layout comes from `game-store.worldLayout`
- runtime adapter snapshots exist for viewport/fallback/render loop concerns only

Do not reintroduce comments or type names that imply the runtime adapter owns stable layout.

## Files to Touch

- `packages/runner/src/canvas/runtime-layout-store.ts` (new or rename from existing module)
- [`packages/runner/src/canvas/GameCanvas.tsx`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/canvas/GameCanvas.tsx) (modify)
- [`packages/runner/src/canvas/canvas-updater.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/canvas/canvas-updater.ts) (modify)
- [`packages/runner/test/canvas/runtime-layout-store.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/runtime-layout-store.test.ts) (rename/modify)
- [`packages/runner/test/canvas/GameCanvas.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/GameCanvas.test.ts) (modify)
- [`packages/runner/test/canvas/canvas-updater.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/canvas-updater.test.ts) (modify)

## Out of Scope

- Introducing new world-layout ownership paths beyond `game-store.worldLayout`
- Changing layout algorithms or visual behavior
- Moving stable world-space data into `RenderModel`
- Refactoring unrelated showdown or semantic projection work

## Acceptance Criteria

### Tests That Must Pass

1. [`packages/runner/test/canvas/runtime-layout-store.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/runtime-layout-store.test.ts) proves the runtime adapter behavior remains correct under the new module/type names.
2. [`packages/runner/test/canvas/GameCanvas.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/GameCanvas.test.ts) proves `GameCanvas` still consumes store-owned `worldLayout` and uses the renamed runtime adapter only for runtime concerns.
3. [`packages/runner/test/canvas/canvas-updater.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/canvas-updater.test.ts) proves viewport/render-loop behavior still works after the adapter rename.
4. Existing suite: `pnpm -F @ludoforge/runner test`
5. Existing suite: `pnpm -F @ludoforge/runner typecheck`
6. Existing suite: `pnpm -F @ludoforge/runner lint`

### Invariants

1. `game-store.worldLayout` remains the only stable ownership path for deterministic `GameDef + visual-config` world layout.
2. The renamed runtime adapter remains a viewport/render-loop concern only; it must not regain stable layout derivation responsibilities.
3. No compatibility alias module or type should preserve `position-store` / `PositionStore` as the public long-term API.

## Test Plan

### New/Modified Tests

1. [`packages/runner/test/canvas/runtime-layout-store.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/runtime-layout-store.test.ts) — lock the runtime adapter API under its corrected ownership-oriented name.
2. [`packages/runner/test/canvas/GameCanvas.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/GameCanvas.test.ts) — verify the renamed adapter is still only a runtime bridge while `worldLayout` remains store-owned.
3. [`packages/runner/test/canvas/canvas-updater.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/canvas-updater.test.ts) — verify runtime snapshot subscription behavior survives the rename without boundary regression.

### Commands

1. `pnpm -F @ludoforge/runner exec vitest run test/canvas/runtime-layout-store.test.ts`
2. `pnpm -F @ludoforge/runner exec vitest run test/canvas/GameCanvas.test.ts`
3. `pnpm -F @ludoforge/runner exec vitest run test/canvas/canvas-updater.test.ts`
4. `pnpm -F @ludoforge/runner test`
5. `pnpm -F @ludoforge/runner typecheck`
6. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completion date: 2026-03-19
- What actually changed:
  - Renamed [`packages/runner/src/canvas/position-store.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/canvas/runtime-layout-store.ts) to [`packages/runner/src/canvas/runtime-layout-store.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/canvas/runtime-layout-store.ts) and renamed its public API from `PositionStore` / `PositionStoreSnapshot` / `createPositionStore(...)` to `RuntimeLayoutStore` / `RuntimeLayoutSnapshot` / `createRuntimeLayoutStore(...)`.
  - Updated [`packages/runner/src/canvas/GameCanvas.tsx`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/canvas/GameCanvas.tsx) and [`packages/runner/src/canvas/canvas-updater.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/canvas/canvas-updater.ts) to use the renamed runtime-layout contract consistently, including local dependency and snapshot terminology.
  - Renamed and updated [`packages/runner/test/canvas/runtime-layout-store.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/runtime-layout-store.test.ts), plus updated [`packages/runner/test/canvas/GameCanvas.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/GameCanvas.test.ts) and [`packages/runner/test/canvas/canvas-updater.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/canvas-updater.test.ts) so fixtures and assertions no longer preserve the old public name.
  - Added one extra invariant test to prove identical active-layout snapshots do not emit redundant runtime-layout updates.
- Deviations from original plan:
  - `action-announcement-presentation` and its tests were correctly left untouched because archived ticket `62RUNSEMUI-007` had already migrated that path onto store-owned `worldLayout`.
  - The architecture did not need a broader runtime-layout redesign. The clean, durable change here was to align names with the existing boundary rather than splitting fallback policy into another module prematurely.
- Verification results:
  - `pnpm -F @ludoforge/runner exec vitest run test/canvas/runtime-layout-store.test.ts`
  - `pnpm -F @ludoforge/runner exec vitest run test/canvas/GameCanvas.test.ts`
  - `pnpm -F @ludoforge/runner exec vitest run test/canvas/canvas-updater.test.ts`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner lint`
