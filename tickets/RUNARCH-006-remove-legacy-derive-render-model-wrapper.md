# RUNARCH-006: Remove Legacy `derive-render-model` Wrapper

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only boundary cleanup
**Deps**: archive/tickets/RUNARCH/RUNARCH-005-extract-semantic-runner-frame-from-render-model.md

## Problem

`RUNARCH-005` established the correct architecture: `RunnerFrame` is the semantic contract and `RenderModel` is a projection. But the repo still keeps `packages/runner/src/model/derive-render-model.ts` as a transitional wrapper, and `RenderContext` still carries an optional `VisualConfigProvider` solely to support that wrapper.

That leaves two architectural problems in place:

1. the codebase still advertises a mixed-era entry point instead of the final semantic-plus-projection boundary
2. the semantic derivation context still exposes a visual-config dependency that should not exist in the semantic layer at all

This is no longer an implementation convenience; it is boundary debt. A clean, durable architecture should force callers and tests to use `deriveRunnerFrame()` for semantics and `projectRenderModel()` for DOM/UI projection, with no compatibility shim in between.

## Assumption Reassessment (2026-03-19)

1. `packages/runner/src/store/game-store.ts` already uses `deriveRunnerFrame()` and `projectRenderModel()` directly. The remaining wrapper is not part of the authoritative runtime path.
2. Current direct `deriveRenderModel()` usage is concentrated in runner model tests (`derive-render-model-state`, `derive-render-model-zones`, and `derive-render-model-structural-sharing`). That means the cleanup is real, but the blast radius is contained and should be handled as a deliberate migration rather than left indefinitely.
3. `packages/runner/src/store/store-types.ts` still includes `visualConfigProvider?: VisualConfigProvider` on `RenderContext`. That is a corrected scope item this ticket must remove because semantic derivation should not even type-reference visual-config concerns.
4. Corrected scope: this ticket should finish the architecture introduced by `RUNARCH-005`, not add another compatibility layer. Delete the wrapper, migrate remaining tests/callers, and tighten the type boundary so semantic inputs remain presentation-agnostic.

## Architecture Check

1. Removing the wrapper is cleaner than preserving a "convenience" API because the wrapper encodes the old mixed mental model and invites future callers to bypass the explicit semantic/projection split.
2. Removing `VisualConfigProvider` from `RenderContext` preserves the repository contract cleanly: `GameSpecDoc` contains game-specific non-visual data, `visual-config.yaml` contains game-specific visual presentation data, and neither `GameDef` nor semantic derivation imports visual policy.
3. No backwards-compatibility aliasing or shim should survive this cleanup. Break direct `deriveRenderModel()` callers and migrate them to the explicit two-step architecture.

## What to Change

### 1. Delete the legacy wrapper entry point

Remove `packages/runner/src/model/derive-render-model.ts` as a public derivation API. Do not replace it with another alias.

Any remaining callers must explicitly do one of the following:

- call `deriveRunnerFrame()` when they are asserting semantic facts
- call `projectRenderModel()` from an already-derived `RunnerFrame` when they are asserting DOM/UI projection behavior

### 2. Remove the provider leak from semantic context

Refactor runner types and helpers so semantic derivation inputs do not include `VisualConfigProvider`.

That includes:

- removing `visualConfigProvider` from `RenderContext`
- updating test helpers so projection tests provide the provider at projection time, not semantic-derivation time
- keeping visual-config usage fully owned by projection/presentation layers

### 3. Split remaining model tests by boundary

Migrate existing mixed-era model tests into boundary-accurate coverage:

- semantic derivation tests should target `RunnerFrame`
- projection tests should target `projectRenderModel()`
- structural-sharing assertions should live on the layer that actually owns that stability guarantee

Renaming test files is preferred if that makes ownership clearer. Do not keep misleading test names that imply a mixed derivation architecture after the wrapper is removed.

### 4. Update dependent tickets and references

Update any active ticket references that still describe `derive-render-model.ts` as a legitimate architectural boundary. `RUNARCH-004` should explicitly depend on this cleanup so browser stress validation targets the final architecture rather than a transitional one.

## Files to Touch

- `packages/runner/src/model/derive-render-model.ts` (delete)
- `packages/runner/src/store/store-types.ts` (modify)
- `packages/runner/test/model/*derive-render-model*` (modify/rename/split)
- `packages/runner/test/model/*runner-frame*` (modify/add as needed)
- `packages/runner/test/ui/helpers/*` (modify as needed)
- `tickets/RUNARCH-004-add-browser-stress-regression-for-heavy-visual-games.md` (modify if needed for dependency/reference alignment)

## Out of Scope

- new browser stress coverage itself; that belongs to `RUNARCH-004`
- changes to `GameDef`, engine runtime, or simulation
- introducing new projection types beyond what is needed to remove the wrapper cleanly
- unrelated UI or canvas behavior changes

## Acceptance Criteria

### Tests That Must Pass

1. No production or test code imports or calls `deriveRenderModel()` anymore.
2. Semantic derivation compiles and runs without `RenderContext` exposing `VisualConfigProvider`.
3. Runner model tests still cover semantic facts, projection facts, and relevant structural-sharing invariants after migration to the explicit two-step boundary.
4. Existing suite: `pnpm -F @ludoforge/runner test`
5. Existing suite: `pnpm -F @ludoforge/runner typecheck`
6. Existing suite: `pnpm -F @ludoforge/runner lint`

### Invariants

1. `RunnerFrame` remains the only authoritative semantic runner/store contract.
2. Game-specific visual presentation remains owned by `visual-config.yaml` and projection/presentation layers, never by semantic derivation inputs.
3. No backwards-compatibility wrapper or alias preserves the old mixed `RenderModel` derivation path.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/model/*runner-frame*` — semantic derivation assertions updated or expanded to cover facts previously asserted through the wrapper.
2. `packages/runner/test/model/*render-model*` or renamed projection tests — DOM/UI projection assertions moved to `projectRenderModel()` with provider ownership kept at projection time.
3. Structural-sharing regression coverage — updated so the tests assert stability at the correct boundary instead of through the deleted wrapper.

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner lint`
4. `pnpm run check:ticket-deps`
