# 62RUNSEMUI-001: Internalize runner projection source and semantic frame boundary

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: `specs/62-runner-semantic-ui-projection-boundary.md`

## Problem

`RunnerFrame` currently exposes `globalVars` and `playerVars` as part of its public contract, which makes the semantic frame double as a UI projection bag. Spec 62 requires a semantic-only `RunnerFrame` plus an internal projection-source bundle that surface projectors can consume without exposing raw variable bags as a default public API.

## Assumption Reassessment (2026-03-19)

1. Current code still derives `globalVars` and `playerVars` inside [`packages/runner/src/model/derive-runner-frame.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/model/derive-runner-frame.ts) and publishes them on [`packages/runner/src/model/runner-frame.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/model/runner-frame.ts).
2. Current boundary tests in [`packages/runner/test/model/runner-frame-projection-boundary.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/runner-frame-projection-boundary.test.ts) only prove the absence of some dead fields; they do not yet enforce a semantic-only frame plus internal projection bundle.
3. `projectRenderModel` currently accepts only a `RunnerFrame`, so helper/test plumbing such as [`packages/runner/test/model/helpers/derive-projected-render-model.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/helpers/derive-projected-render-model.ts) will need to shift to a bundle return type rather than silently reconstructing raw variable access elsewhere.

## Architecture Check

1. This keeps semantic truth in one contract and low-level projection inputs in a separate internal bundle, which is cleaner than continuing to expose raw vars on `RunnerFrame`.
2. The change stays runner-only and does not move any game-specific behavior into `GameSpecDoc`, `GameDef`, compiler, kernel, or simulation.
3. No compatibility aliasing is allowed: once the bundle exists, tickets must update downstream consumers rather than keeping shadow `globalVars` / `playerVars` fields on `RunnerFrame`.

## What to Change

### 1. Introduce the projection bundle types

Add runner-model types for:

- `RunnerProjectionBundle`
- `RunnerProjectionSource`

The source should carry the raw semantic inputs surface projectors need now:

- `globalVars`
- `playerVars`
- any existing marker-derived source maps that are already truly projection input

Place the types in the runner model layer, either by extending [`packages/runner/src/model/runner-frame.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/model/runner-frame.ts) or by adding a focused file such as `projection-bundle.ts`.

### 2. Make `deriveRunnerFrame` return the semantic frame plus source bundle

Refactor [`packages/runner/src/model/derive-runner-frame.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/model/derive-runner-frame.ts) so its public output is the bundle:

- `bundle.frame` contains semantic runner state only
- `bundle.source` contains low-level raw projection inputs

Do not add display labels, visual config decisions, or surface-specific data here.

### 3. Update store/test plumbing to use the new bundle shape

Adjust the immediate call sites that construct or thread runner projection state:

- [`packages/runner/src/store/game-store.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/store/game-store.ts)
- [`packages/runner/test/model/helpers/derive-projected-render-model.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/helpers/derive-projected-render-model.ts)
- any runner-frame structural-sharing tests that need to compare bundle reuse rather than raw frame reuse

This ticket stops once the bundle exists and downstream code compiles against it; it does not yet require explicit render-surface models.

## Files to Touch

- [`packages/runner/src/model/derive-runner-frame.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/model/derive-runner-frame.ts) (modify)
- [`packages/runner/src/model/runner-frame.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/model/runner-frame.ts) (modify)
- [`packages/runner/src/store/game-store.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/store/game-store.ts) (modify)
- [`packages/runner/test/model/helpers/derive-projected-render-model.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/helpers/derive-projected-render-model.ts) (modify)
- [`packages/runner/test/model/runner-frame-projection-boundary.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/runner-frame-projection-boundary.test.ts) (modify)
- [`packages/runner/test/model/runner-frame-structural-sharing.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/runner-frame-structural-sharing.test.ts) (modify)

## Out of Scope

- Defining new render-surface types on `RenderModel`
- Moving table-overlay derivation out of `presentation-scene`
- Adding showdown config to `visual-config.yaml`
- Refactoring React UI components

## Acceptance Criteria

### Tests That Must Pass

1. [`packages/runner/test/model/runner-frame-projection-boundary.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/runner-frame-projection-boundary.test.ts) proves `RunnerFrame` no longer exposes raw projection bags and that raw vars remain available only through the internal bundle.
2. [`packages/runner/test/model/runner-frame-structural-sharing.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/runner-frame-structural-sharing.test.ts) still passes with the new bundle output and does not regress semantic frame sharing.
3. [`packages/runner/test/model/project-render-model-state.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/project-render-model-state.test.ts) still passes after the projector is updated to read bundle source instead of frame vars.
4. Command: `pnpm -F @ludoforge/runner test`
5. Command: `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. `RunnerFrame` remains a semantic contract only: no display labels, visual config, or surface-specific UI data may be added to it.
2. Raw semantic vars may remain available for projection, but only through the internal projection bundle, not as a broad UI-facing frame API.
3. No game-specific branching or hardcoded Texas Hold’em / FITL identifiers may be introduced in runner model derivation.

## Test Plan

### New/Modified Tests

1. [`packages/runner/test/model/runner-frame-projection-boundary.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/runner-frame-projection-boundary.test.ts) — add assertions that `frame` is semantic-only while `bundle.source` retains raw vars for projector use.
2. [`packages/runner/test/model/runner-frame-structural-sharing.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/runner-frame-structural-sharing.test.ts) — ensure bundle/frame reuse still behaves deterministically across unchanged semantic inputs.
3. [`packages/runner/test/model/project-render-model-state.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/project-render-model-state.test.ts) — prove the render projector still sees raw vars after the boundary shift.

### Commands

1. `pnpm -F @ludoforge/runner test -- runner-frame-projection-boundary`
2. `pnpm -F @ludoforge/runner test -- runner-frame-structural-sharing`
3. `pnpm -F @ludoforge/runner test`
4. `pnpm -F @ludoforge/runner typecheck`
