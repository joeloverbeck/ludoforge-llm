# 62RUNSEMUI-004: Add visual-config-driven showdown surface projection

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: [`specs/62-runner-semantic-ui-projection-boundary.md`](/home/joeloverbeck/projects/ludoforge-llm/specs/62-runner-semantic-ui-projection-boundary.md), `archive/tickets/62RUNSEMUI/62RUNSEMUI-001-internalize-runner-projection-source-and-semantic-frame-boundary.md`, `archive/tickets/62RUNSEMUI/62RUNSEMUI-002-add-explicit-render-surface-contracts.md`

## Problem

The ticket’s original assumptions no longer match the codebase.

Spec 62’s broader boundary cleanup has partially landed already:

- `RunnerProjectionBundle` exists and already internalizes raw `globalVars` / `playerVars` into `bundle.source`.
- `RunnerFrame` is already semantic-only and no longer exposes `globalVars` / `playerVars`.
- `RenderModel.surfaces` already exists.
- `WorldLayoutModel` already exists and table overlays already project through a dedicated projector instead of being derived ad hoc inside canvas scene assembly.

The remaining gap is narrower and more important architecturally:

- `ShowdownOverlay` still derives its own UI model from raw `RenderModel.zones`, `RenderModel.tokens`, `RenderModel.players`, and `RenderModel.playerVars`.
- `RenderModel.playerVars` is still exposed only to support that legacy showdown derivation path.
- `RenderModel.globalVars` is also still exposed even though no production runner surface consumes it directly anymore.
- `visual-config.yaml` still has no explicit showdown surface contract, so Texas Hold’em showdown presentation rules remain hardcoded in React.

This ticket should therefore stop describing the already-completed Spec 62 groundwork and instead finish the remaining showdown-specific cleanup cleanly.

## Assumption Reassessment (2026-03-19)

1. [`packages/runner/src/model/runner-frame.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/model/runner-frame.ts) already contains `RunnerProjectionSource` and keeps raw variable bags out of `RunnerFrame`.
2. [`packages/runner/src/layout/world-layout-model.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/layout/world-layout-model.ts) already exists, so this ticket does not need to introduce world/layout contracts.
3. [`packages/runner/src/presentation/project-table-overlay-surface.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/presentation/project-table-overlay-surface.ts) already provides the explicit projector path for table overlays, so table-overlay refactoring is out of scope here.
4. [`packages/runner/src/model/render-model.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/model/render-model.ts) already exposes `surfaces.showdown`, but [`packages/runner/src/model/project-render-model.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/model/project-render-model.ts) still leaves it `null` unconditionally.
5. [`packages/runner/src/ui/ShowdownOverlay.tsx`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/ui/ShowdownOverlay.tsx) is still hardcoded to `phaseName === "showdown"`, `showdownScore`, `community:` zone prefixes, and `hand:` ownership conventions.
6. [`data/games/texas-holdem/visual-config.yaml`](/home/joeloverbeck/projects/ludoforge-llm/data/games/texas-holdem/visual-config.yaml) does not yet declare a showdown surface section.
7. Validation coverage already exists for visual-config schema/provider/reference checks, but it currently has no showdown-specific coverage.
8. No production runner source reads `RenderModel.globalVars`; only tests still assert it.

## Architecture Check

1. The already-landed `RunnerProjectionBundle` + `RenderModel.surfaces` direction is better than the old architecture and should be finished rather than worked around.
2. A config-driven showdown projector is more robust than keeping presentation conventions buried in a React component because it gives showdown the same explicit ownership model that Spec 62 requires for nontrivial surfaces.
3. Once showdown projection exists, keeping `RenderModel.playerVars` public is architectural leakage and should be deleted rather than preserved.
4. `RenderModel.globalVars` should also be deleted in the same change unless a real production consumer appears during implementation. Tests are not a justification for keeping a leaky public contract.
5. Showdown config must stay presentation-only: visibility conditions, source bindings, labels, grouping, and zone selectors are allowed; scoring logic and winner calculation are not.
6. This ticket should not introduce compatibility aliases or dual paths. The explicit showdown surface should become the only runner UI contract for showdown rendering.

## What to Change

### 1. Add explicit showdown surface config support

Extend visual-config support with a dedicated showdown section under an explicit surface namespace, preferably `runnerSurfaces.showdown`.

The config must be able to declare:

- visibility gating for the showdown surface
- the per-player score source binding
- community-card zone selectors
- player-card zone selectors
- presentation-only visibility toggles such as hiding zero scores

### 2. Validate showdown references and bindings

Update reference validation so showdown config validates:

- referenced phase ids
- referenced global/per-player variable names
- referenced zone ids

Validation errors must identify the exact config path.

### 3. Project `RenderModel.surfaces.showdown`

Add a dedicated showdown projector that consumes:

- `RunnerProjectionBundle`
- `VisualConfigProvider`

The projector must emit the explicit showdown surface model and must not rely on Texas Hold’em-specific hardcoded strings outside the config.

### 4. Refactor `ShowdownOverlay` to consume only the projected surface

`ShowdownOverlay` should render from `renderModel.surfaces.showdown` plus any generic UI state it still genuinely needs. It must stop deriving showdown semantics from raw zones/tokens/vars.

### 5. Delete raw render-model var-bag leakage

If showdown projection lands cleanly, remove:

- `RenderModel.playerVars`
- `RenderModel.globalVars`

Do not preserve aliases or fallback accessors.

### 6. Add/update Texas Hold’em config and tests

Add the showdown surface section to Texas Hold’em visual config and strengthen tests to lock in the new contract and the removal of raw render-model var-bag access.

## Files to Touch

- [`packages/runner/src/config/visual-config-types.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/config/visual-config-types.ts) (modify)
- [`packages/runner/src/config/visual-config-provider.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/config/visual-config-provider.ts) (modify)
- [`packages/runner/src/config/validate-visual-config-refs.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/config/validate-visual-config-refs.ts) (modify)
- [`packages/runner/src/model/render-model.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/model/render-model.ts) (modify)
- [`packages/runner/src/model/project-render-model.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/model/project-render-model.ts) (modify)
- [`packages/runner/src/ui/ShowdownOverlay.tsx`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/ui/ShowdownOverlay.tsx) (modify)
- [`data/games/texas-holdem/visual-config.yaml`](/home/joeloverbeck/projects/ludoforge-llm/data/games/texas-holdem/visual-config.yaml) (modify)
- [`packages/runner/test/config/visual-config-schema.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/config/visual-config-schema.test.ts) (modify)
- [`packages/runner/test/config/visual-config-provider.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/config/visual-config-provider.test.ts) (modify)
- [`packages/runner/test/config/validate-visual-config-refs.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/config/validate-visual-config-refs.test.ts) (modify)
- [`packages/runner/test/config/visual-config-files.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/config/visual-config-files.test.ts) (modify)
- [`packages/runner/test/model/project-render-model-state.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/project-render-model-state.test.ts) (modify)
- [`packages/runner/test/model/runner-frame-projection-boundary.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/runner-frame-projection-boundary.test.ts) (modify)
- [`packages/runner/test/model/render-model-types.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/render-model-types.test.ts) (modify)
- [`packages/runner/test/ui/ShowdownOverlay.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/ui/ShowdownOverlay.test.ts) (modify)
- [`packages/runner/test/ui/helpers/render-model-fixture.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/ui/helpers/render-model-fixture.ts) (modify)

## Out of Scope

- Reworking table overlays again
- Introducing or refactoring `WorldLayoutModel`
- Moving gameplay rules, scoring math, or showdown evaluation into visual config
- Changing Texas Hold’em game rules or winner calculation
- Adding new generic runner surface DSLs beyond the showdown surface needed here

## Acceptance Criteria

### Tests That Must Pass

1. [`packages/runner/test/config/visual-config-schema.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/config/visual-config-schema.test.ts) accepts valid showdown surface config and rejects malformed showdown config shapes.
2. [`packages/runner/test/config/validate-visual-config-refs.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/config/validate-visual-config-refs.test.ts) reports bad showdown phase/var/zone references with precise config paths.
3. [`packages/runner/test/config/visual-config-files.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/config/visual-config-files.test.ts) verifies Texas Hold’em visual config includes the showdown surface section as parsed output.
4. [`packages/runner/test/model/project-render-model-state.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/project-render-model-state.test.ts) proves `surfaces.showdown` is projected from config plus semantic source.
5. [`packages/runner/test/ui/ShowdownOverlay.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/ui/ShowdownOverlay.test.ts) proves the overlay renders only from explicit showdown surface data.
6. [`packages/runner/test/model/runner-frame-projection-boundary.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/runner-frame-projection-boundary.test.ts) and related render-model tests confirm `RenderModel.globalVars` / `RenderModel.playerVars` are no longer part of the public render contract.
7. Command: `pnpm -F @ludoforge/runner test`
8. Command: `pnpm -F @ludoforge/runner typecheck`
9. Command: `pnpm -F @ludoforge/runner lint`

### Invariants

1. Showdown presentation selectors live in visual config, not in generic runner UI or projector code.
2. `ShowdownOverlay` renders explicit showdown surface data only.
3. `RenderModel` does not expose raw `globalVars` or `playerVars`.
4. The showdown config remains presentation-only and does not encode gameplay rules or scoring logic.
5. No per-game branches keyed on Texas Hold’em identifiers may be introduced.

## Test Plan

### New/Modified Tests

1. [`packages/runner/test/config/visual-config-schema.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/config/visual-config-schema.test.ts) — add valid and invalid showdown surface config cases.
2. [`packages/runner/test/config/validate-visual-config-refs.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/config/validate-visual-config-refs.test.ts) — cover bad phase ids, bad var bindings, and unknown zone ids in showdown config.
3. [`packages/runner/test/config/visual-config-files.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/config/visual-config-files.test.ts) — lock in Texas Hold’em showdown config shape.
4. [`packages/runner/test/model/project-render-model-state.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/project-render-model-state.test.ts) — assert showdown projection output, gating, and zero-score hiding.
5. [`packages/runner/test/ui/ShowdownOverlay.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/ui/ShowdownOverlay.test.ts) — assert the UI consumes `surfaces.showdown` rather than raw vars/zones.
6. [`packages/runner/test/model/runner-frame-projection-boundary.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/runner-frame-projection-boundary.test.ts) and [`packages/runner/test/model/render-model-types.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/render-model-types.test.ts) — tighten the public boundary by removing raw render-model var bags.

### Commands

1. `pnpm -F @ludoforge/runner test -- visual-config-schema`
2. `pnpm -F @ludoforge/runner test -- validate-visual-config-refs`
3. `pnpm -F @ludoforge/runner test -- visual-config-files`
4. `pnpm -F @ludoforge/runner test -- project-render-model-state`
5. `pnpm -F @ludoforge/runner test -- ShowdownOverlay`
6. `pnpm -F @ludoforge/runner test`
7. `pnpm -F @ludoforge/runner typecheck`
8. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completion date: 2026-03-19
- What actually changed:
  - Added explicit `runnerSurfaces.showdown` visual-config schema/provider/validation support.
  - Projected `RenderModel.surfaces.showdown` from `RunnerProjectionBundle` plus config.
  - Refactored `ShowdownOverlay` to render only explicit showdown surface data.
  - Removed `RenderModel.globalVars` and `RenderModel.playerVars` from the public render-model contract.
  - Added regression coverage for showdown config, projection, UI rendering, and dismissal reset behavior.
- Deviations from original plan:
  - The ticket was narrowed first because Spec 62 groundwork had already landed.
  - The implementation went one step further than the original draft by deleting raw render-model var bags instead of leaving them in place after showdown migration.
- Verification results:
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner lint`
