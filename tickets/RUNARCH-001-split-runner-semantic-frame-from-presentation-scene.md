# RUNARCH-001: Split Runner Semantic Frame from Presentation Scene

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: None — runner-only
**Deps**: archive/specs/42-per-game-visual-config.md, archive/tickets/RUNPRESLIFE/68RUNPRESLIFE-001-presentation-scene-contract.md, archive/tickets/RUNPRESLIFE/68RUNPRESLIFE-006-complete-scene-migration-for-tokens-and-announcements.md

## Problem

The runner still treats `RenderModel` as a mixed semantic-plus-presentation payload. Zone labels, zone visuals, token presentation grouping inputs, and other display-facing fields are still derived before the canonical scene layer and then passed through to Pixi-facing renderer code.

That is not a clean architecture boundary. It leaves the runner with:

- a semantic model that already knows visualized shapes/labels
- a presentation scene that is only partially authoritative
- renderers that still depend on mixed semantic and display contracts

The result is a brittle architecture where visual presentation cannot be reasoned about or tested as one complete immutable layer.

## Assumption Reassessment (2026-03-19)

1. `packages/runner/src/model/render-model.ts` still embeds presentation-facing fields such as `RenderZone.displayName` and `RenderZone.visual`, so the current `RenderModel` is not a purely semantic runner contract.
2. `packages/runner/src/model/derive-render-model.ts` still resolves display-facing zone and token state before the presentation-scene layer runs, so presentation derivation is split across multiple layers rather than owned by one canonical scene builder.
3. `packages/runner/src/presentation/presentation-scene.ts` exists, but it currently wraps mixed `RenderModel` slices instead of deriving the entire frame from a cleaner semantic input contract.
4. Corrected scope: this ticket should not change `GameDef`, simulation, or `GameSpecDoc`; it should restructure runner-owned contracts so game-specific visual presentation remains sourced from `visual-config.yaml` only.

## Architecture Check

1. A two-step runner contract is cleaner than the current mixed `RenderModel`: a semantic frame model for game-derived facts, then a fully visual presentation scene derived from semantic state plus `visual-config.yaml`.
2. This preserves the repository boundary cleanly: `GameSpecDoc` remains the home of non-visual game-specific data, `visual-config.yaml` remains the home of game-specific presentation data, and `GameDef` / simulation remain game-agnostic.
3. No backwards-compatibility shim should preserve the mixed `RenderModel` contract. The touched runner layers should migrate directly to the new semantic-frame and presentation-scene split.
4. This is cleaner than patching individual renderers because it removes the architectural ambiguity about where presentation semantics are supposed to live.

## What to Change

### 1. Introduce a semantic frame contract that is presentation-agnostic

Create a runner-only semantic frame model derived from `GameDef + GameState + runner context` that carries only game-derived semantics needed by the runner, not visualized labels, text formatting, resolved zone visuals, or Pixi-facing styling data.

This contract should include the semantic state currently needed for:

- zones, tokens, adjacencies, markers, tracks, variables, choice state, and event-deck state
- player/faction identity and semantic ownership information
- semantic selection/highlight eligibility inputs

but should not include:

- resolved typography
- resolved zone visuals
- formatted overlay labels
- presentation grouping/layout signatures
- other canvas/backend-facing rendering details

### 2. Redefine `PresentationScene` as the single visual contract for a frame

Refactor the current presentation layer so it derives the complete immutable frame scene from:

- semantic frame state
- layout/position snapshot
- validated `VisualConfigProvider`
- runner-only interaction state

The resulting scene should become the only canonical owner of:

- visual text content
- visual shapes and dimensions
- token grouping/layout decisions
- region boundaries
- overlays
- announcement payloads
- any other game-specific presentation behavior coming from `visual-config.yaml`

### 3. Remove presentation leakage from runner semantic types and tests

Migrate current runner types/tests so semantic-model tests assert semantic derivation and presentation-scene tests assert visual derivation. After this split, presentation state should no longer be asserted through `derive-render-model.ts` tests except where semantic inputs are required.

## Files to Touch

- `packages/runner/src/model/render-model.ts` (modify or replace)
- `packages/runner/src/model/derive-render-model.ts` (modify)
- `packages/runner/src/presentation/*` (modify)
- `packages/runner/src/canvas/canvas-updater.ts` (modify)
- `packages/runner/test/model/*` (modify)
- `packages/runner/test/presentation/*` (modify)
- `packages/runner/test/canvas/*` (modify where updater contracts change)

## Out of Scope

- changing `GameDef` schemas or simulation/runtime semantics
- introducing FITL-specific branches in runner code
- choosing a final Pixi text backend by itself; that belongs to the reconciler/text-ownership ticket once the contract split exists

## Acceptance Criteria

### Tests That Must Pass

1. Runner semantic-model tests prove semantic frame derivation is presentation-agnostic and no longer emits visualized zone/token payloads.
2. Presentation-scene tests prove all visualized frame data is derived from semantic frame state plus `visual-config.yaml`, not directly from mixed `RenderModel` contracts.
3. Existing suite: `pnpm -F @ludoforge/runner test`
4. Existing suite: `pnpm -F @ludoforge/runner typecheck`
5. Existing suite: `pnpm -F @ludoforge/runner lint`

### Invariants

1. `GameSpecDoc` contains game-specific non-visual data only, while game-specific visual presentation is derived exclusively from `visual-config.yaml`.
2. `GameDef` and simulation remain presentation-agnostic.
3. The runner has exactly one semantic frame contract and exactly one presentation-scene contract, with no mixed visual-semantic alias layer left in between.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/model/derive-render-model.test.ts` or successor semantic-frame tests — prove the runner semantic contract no longer exposes visual payloads.
2. `packages/runner/test/presentation/presentation-scene.test.ts` — prove the full visual frame is derived at the presentation layer from semantic state plus visual config.
3. `packages/runner/test/canvas/canvas-updater.test.ts` — prove the updater consumes the new presentation scene rather than mixed semantic slices.

### Commands

1. `pnpm -F @ludoforge/runner test -- derive-render-model.test.ts presentation-scene.test.ts canvas-updater.test.ts`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`
4. `pnpm -F @ludoforge/runner lint`
5. `pnpm run check:ticket-deps`
