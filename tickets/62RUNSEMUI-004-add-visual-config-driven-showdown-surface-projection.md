# 62RUNSEMUI-004: Add visual-config-driven showdown surface projection

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: `specs/62-runner-semantic-ui-projection-boundary.md`, `archive/tickets/62RUNSEMUI/62RUNSEMUI-001-internalize-runner-projection-source-and-semantic-frame-boundary.md`, `archive/tickets/62RUNSEMUI/62RUNSEMUI-002-add-explicit-render-surface-contracts.md`

## Problem

The runner has no visual-config contract for showdown surfaces. `ShowdownOverlay` currently hardcodes assumptions like phase name, `showdownScore`, `community:` zone prefixes, and `hand:` ownership rules. Spec 62 requires those presentation selectors to move into `visual-config.yaml` and be projected into an explicit showdown surface model before UI rendering.

## Assumption Reassessment (2026-03-19)

1. [`packages/runner/src/config/visual-config-types.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/config/visual-config-types.ts) currently supports `tableOverlays` and `phaseBanners`, but not a showdown surface section.
2. [`data/games/texas-holdem/visual-config.yaml`](/home/joeloverbeck/projects/ludoforge-llm/data/games/texas-holdem/visual-config.yaml) already contains the presentation facts a showdown projector needs conceptually, but they are implicit in current zone/var naming rather than declared under a dedicated surface contract.
3. Validation coverage already exists in [`packages/runner/test/config/visual-config-schema.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/config/visual-config-schema.test.ts), [`packages/runner/test/config/visual-config-provider.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/config/visual-config-provider.test.ts), and [`packages/runner/test/config/validate-visual-config-refs.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/config/validate-visual-config-refs.test.ts).
4. Unlike table overlays, showdown projection does not depend on world-space layout anchors. It remains a good fit for `projectRenderModel(...)` and should not wait on the layout/world-contract work.

## Architecture Check

1. A dedicated showdown config section is cleaner than keeping hidden conventions in React component code.
2. The config remains presentation-only: selectors, labels, display order, and visibility conditions belong here; scoring math and rules logic do not.
3. No hardcoded Texas Hold’em fallback should remain in the projector once config support exists.
4. Because showdown is not world-anchor-dependent, projecting it into `RenderModel.surfaces.showdown` is still the right architecture even after Spec 62’s layout/world split.

## What to Change

### 1. Add showdown surface schema/types/provider accessors

Extend visual-config support with a presentation-only showdown section, for example under `runnerSurfaces.showdown` or another explicit surface namespace that matches Spec 62.

The config must be able to declare:

- visibility gating, including showdown-phase display conditions
- the per-player ranking score source
- community-card zone selectors
- player-card selectors
- optional display toggles such as hide-zero-scores

### 2. Validate showdown references

Update reference validation so the new showdown config points only at generic runtime facts and valid zone/seat selectors. Validation errors must identify the exact config path.

### 3. Project the showdown surface model from bundle source plus config

Update render-model projection to build `RenderModel.surfaces.showdown` from:

- semantic frame data
- internal projection source vars
- visual-config selectors

This projector should be generic enough for other card games that can express equivalent showdown presentation via config.

### 4. Add/update game config fixtures

Add the showdown surface section to Texas Hold’em visual config and update any config fixture tests that enumerate expected parsed sections. Do not add showdown config to unrelated games unless they already need an equivalent surface.

## Files to Touch

- [`packages/runner/src/config/visual-config-types.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/config/visual-config-types.ts) (modify)
- [`packages/runner/src/config/visual-config-provider.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/config/visual-config-provider.ts) (modify)
- [`packages/runner/src/config/validate-visual-config-refs.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/config/validate-visual-config-refs.ts) (modify)
- [`packages/runner/src/model/project-render-model.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/model/project-render-model.ts) (modify)
- [`data/games/texas-holdem/visual-config.yaml`](/home/joeloverbeck/projects/ludoforge-llm/data/games/texas-holdem/visual-config.yaml) (modify)
- [`packages/runner/test/config/visual-config-schema.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/config/visual-config-schema.test.ts) (modify)
- [`packages/runner/test/config/visual-config-provider.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/config/visual-config-provider.test.ts) (modify)
- [`packages/runner/test/config/validate-visual-config-refs.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/config/validate-visual-config-refs.test.ts) (modify)
- [`packages/runner/test/config/visual-config-files.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/config/visual-config-files.test.ts) (modify)
- [`packages/runner/test/model/project-render-model-state.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/project-render-model-state.test.ts) (modify)

## Out of Scope

- Refactoring the React `ShowdownOverlay` component itself
- Introducing the explicit world-layout contract for anchored canvas surfaces
- Deleting `RenderModel.playerVars` or `RenderModel.globalVars`
- Adding non-showdown runner surface DSLs
- Changing gameplay rules, winner calculation, or move legality

## Acceptance Criteria

### Tests That Must Pass

1. [`packages/runner/test/config/visual-config-schema.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/config/visual-config-schema.test.ts) accepts valid showdown surface config and rejects malformed selector/source shapes.
2. [`packages/runner/test/config/validate-visual-config-refs.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/config/validate-visual-config-refs.test.ts) reports bad showdown zone/selector references with precise config paths.
3. [`packages/runner/test/config/visual-config-files.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/config/visual-config-files.test.ts) verifies the Texas Hold’em config includes the new showdown section as parsed output.
4. [`packages/runner/test/model/project-render-model-state.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/project-render-model-state.test.ts) proves `surfaces.showdown` is projected from config plus semantic source, including hide-zero-score behavior.
5. Command: `pnpm -F @ludoforge/runner test`
6. Command: `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. All showdown presentation selectors live in `visual-config.yaml`; none may be hardcoded in generic runner UI or projector code once the config exists.
2. The showdown config must remain presentation-only and must not encode scoring math, rules, or simulation behavior.
3. The projector must continue to work from generic runtime facts; no per-game branches keyed on Texas Hold’em identifiers may be introduced.

## Test Plan

### New/Modified Tests

1. [`packages/runner/test/config/visual-config-schema.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/config/visual-config-schema.test.ts) — add valid and invalid showdown config cases.
2. [`packages/runner/test/config/validate-visual-config-refs.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/config/validate-visual-config-refs.test.ts) — cover unknown zone ids and bad source bindings inside the showdown section.
3. [`packages/runner/test/config/visual-config-files.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/config/visual-config-files.test.ts) — lock in the Texas Hold’em showdown config shape.
4. [`packages/runner/test/model/project-render-model-state.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/project-render-model-state.test.ts) — assert showdown projection output ordering, visibility gating, and card grouping.

### Commands

1. `pnpm -F @ludoforge/runner test -- visual-config-schema`
2. `pnpm -F @ludoforge/runner test -- validate-visual-config-refs`
3. `pnpm -F @ludoforge/runner test -- visual-config-files`
4. `pnpm -F @ludoforge/runner test -- project-render-model-state`
5. `pnpm -F @ludoforge/runner test`
6. `pnpm -F @ludoforge/runner typecheck`
