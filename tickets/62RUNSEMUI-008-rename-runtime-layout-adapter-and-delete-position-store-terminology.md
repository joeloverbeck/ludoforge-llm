# 62RUNSEMUI-008: Rename runtime layout adapter and delete position-store terminology

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: `specs/62-runner-semantic-ui-projection-boundary.md`, `archive/tickets/62RUNSEMUI/62RUNSEMUI-006-introduce-explicit-world-layout-contract.md`, `tickets/62RUNSEMUI-007-migrate-anchored-presentation-consumers-to-world-layout.md`

## Problem

After `62RUNSEMUI-006`, stable board/world layout ownership correctly lives in `game-store.worldLayout`, and the remaining canvas-local store only handles runtime snapshots and fallback layout. However, the code still uses `position-store` / `PositionStore` terminology, which now misstates ownership and encourages future code to treat that module as the primary layout contract again. The architecture is functionally cleaner than before, but the naming is still leaky.

## Assumption Reassessment (2026-03-19)

1. [`packages/runner/src/canvas/position-store.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/canvas/position-store.ts) no longer owns stable `GameDef`-derived layout. It now exposes runtime mutators `setFallbackZoneIDs(...)` and `setActiveLayout(...)`, which makes it a runtime layout adapter/store in behavior, not a stable layout source.
2. The remaining runtime consumers still refer to this adapter through `PositionStore` naming, including [`packages/runner/src/canvas/GameCanvas.tsx`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/canvas/GameCanvas.tsx), [`packages/runner/src/canvas/canvas-updater.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/canvas/canvas-updater.ts), and [`packages/runner/src/presentation/action-announcement-presentation.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/presentation/action-announcement-presentation.ts).
3. Ticket [`62RUNSEMUI-007`](/home/joeloverbeck/projects/ludoforge-llm/tickets/62RUNSEMUI-007-migrate-anchored-presentation-consumers-to-world-layout.md) will further reduce anchored-presenter dependence on this adapter, but it does not fully own the module/type rename and general terminology cleanup across the remaining runtime surface.
4. Spec 62’s current architecture explicitly separates stable `WorldLayoutModel` ownership from viewport/runtime state. Keeping the old `position-store` name after that split is now a codebase terminology mismatch, not merely a cosmetic issue.

## Architecture Check

1. Renaming the remaining runtime adapter to match its narrowed responsibility is cleaner than leaving a misleading name in place. Accurate names matter here because this boundary is architectural, not incidental.
2. This preserves the intended separation of concerns: `GameSpecDoc` and `GameDef` remain game-agnostic, `visual-config.yaml` remains the home for game-specific presentation policy, `game-store.worldLayout` remains the stable layout contract, and the runtime adapter remains a generic canvas/runtime concern only.
3. No backwards-compatibility aliasing should be kept. Once the rename lands, the old module path and `PositionStore` naming should be deleted rather than preserved as compatibility exports.
4. This is more robust than “just documenting it” because it removes the misleading vocabulary that would otherwise keep pulling future code back toward the wrong ownership model.

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
- any remaining presenter/runtime wiring that still subscribes to the runtime adapter
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
- [`packages/runner/src/presentation/action-announcement-presentation.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/presentation/action-announcement-presentation.ts) (modify if still wired through the runtime adapter after `62RUNSEMUI-007`)
- [`packages/runner/test/canvas/position-store.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/position-store.test.ts) (rename/modify)
- [`packages/runner/test/canvas/GameCanvas.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/GameCanvas.test.ts) (modify)
- [`packages/runner/test/canvas/canvas-updater.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/canvas-updater.test.ts) (modify)
- [`packages/runner/test/presentation/action-announcement-presentation.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/presentation/action-announcement-presentation.test.ts) (modify if needed)

## Out of Scope

- Introducing new world-layout ownership paths beyond `game-store.worldLayout`
- Changing layout algorithms or visual behavior
- Moving stable world-space data into `RenderModel`
- Refactoring unrelated showdown or semantic projection work

## Acceptance Criteria

### Tests That Must Pass

1. [`packages/runner/test/canvas/position-store.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/position-store.test.ts) or its renamed equivalent proves the runtime adapter behavior remains correct under the new module/type names.
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

1. [`packages/runner/test/canvas/position-store.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/position-store.test.ts) or renamed equivalent — lock the runtime adapter API under its corrected ownership-oriented name.
2. [`packages/runner/test/canvas/GameCanvas.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/GameCanvas.test.ts) — verify the renamed adapter is still only a runtime bridge while `worldLayout` remains store-owned.
3. [`packages/runner/test/canvas/canvas-updater.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/canvas-updater.test.ts) — verify runtime snapshot subscription behavior survives the rename without boundary regression.

### Commands

1. `pnpm -F @ludoforge/runner test -- position-store GameCanvas canvas-updater`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`
4. `pnpm -F @ludoforge/runner lint`
