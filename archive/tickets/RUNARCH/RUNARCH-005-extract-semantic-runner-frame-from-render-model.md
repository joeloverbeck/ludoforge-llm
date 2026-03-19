# RUNARCH-005: Extract Semantic Runner Frame from RenderModel

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: None — runner-only contract refactor
**Deps**: archive/tickets/RUNARCH/RUNARCH-001-make-presentation-scene-the-authoritative-canvas-frame.md, archive/tickets/RUNARCH/RUNARCH-003-complete-renderer-migration-to-presentation-specs.md

## Problem

`packages/runner/src/model/render-model.ts` still acts as a mixed store contract that combines game-state semantics with view-facing presentation fields. `packages/runner/src/model/derive-render-model.ts` still resolves zone labels and zone visuals through `VisualConfigProvider`, which means the store contract is not actually semantic and the runner still allows visual-config concerns to leak into the central derived model.

That architecture will not stand the test of time. A robust runner boundary needs:

- one semantic frame derived only from `GameDef`, runtime state, and generic runner interaction state
- one or more presentation/view projections derived from that semantic frame for canvas and DOM surfaces
- game-specific visual presentation sourced only from `visual-config.yaml`, never from `GameDef`, simulation, or a mixed shared store model

## Assumption Reassessment (2026-03-19)

1. `packages/runner/src/model/render-model.ts` still embeds presentation-facing fields such as `RenderZone.displayName`, `RenderZone.visual`, `RenderPlayer.displayName`, `RenderTrack.displayName`, and other UI-ready labels, so the current contract is not a semantic frame.
2. `packages/runner/src/model/derive-render-model.ts` still depends on `VisualConfigProvider` for more than zone visuals. Current leakage includes hidden-zone filtering, zone labels, player/faction display names, action display names, choice prompts, and action-group policy. The mixed contract problem is broader than this ticket originally stated.
3. `archive/tickets/RUNARCH/RUNARCH-001-make-presentation-scene-the-authoritative-canvas-frame.md` and `archive/tickets/RUNARCH/RUNARCH-003-complete-renderer-migration-to-presentation-specs.md` already moved the canvas architecture much farther than this ticket assumes. `PresentationScene` and token presentation nodes are already the canvas-owned contract for most steady-state visuals. The remaining architectural gap is the authoritative store contract, not another canvas migration.
4. Corrected scope: this ticket should introduce an authoritative semantic runner frame and demote `RenderModel` from the store's central mixed contract into an explicit DOM/UI projection derived from that semantic frame. Canvas should derive from the semantic frame directly via `PresentationScene`.
5. Corrected boundary: this ticket must keep `GameDef` and simulation game-agnostic, keep `GameSpecDoc` limited to non-visual game-specific data, and keep game-specific visual presentation in `visual-config.yaml`.

## Architecture Check

1. A semantic-frame-plus-projections architecture is cleaner than the current mixed `RenderModel` because it gives the runner one authoritative place for game-state semantics and separate places for surface-specific presentation.
2. The clean split in this codebase is:
   - `RunnerFrame`: authoritative store-facing semantic frame
   - `RenderModel`: explicit DOM/UI projection derived from `RunnerFrame`
   - `PresentationScene`: explicit canvas projection derived from `RunnerFrame`
3. This preserves the repository boundary cleanly: `GameSpecDoc` remains the home of game-specific non-visual data, `visual-config.yaml` remains the home of game-specific visual presentation, and `GameDef` / simulation remain game-agnostic.
4. No backwards-compatibility aliasing should preserve the old mixed `RenderModel` as the store's authoritative contract. Migrate store/canvas ownership directly to the semantic frame and fix breakages at call sites.
5. This is more beneficial than incremental patching because the remaining problem is architectural, not local. Continuing to add fields/selectors to a mixed model would deepen the coupling between semantic state and surface presentation.

## What to Change

### 1. Introduce an authoritative semantic runner frame

Introduce the runner's authoritative semantic frame contract for derived state. The new contract must:

- be derived without `VisualConfigProvider`
- contain only semantic/game-state facts and generic runner interaction facts
- remove presentation-only fields such as provider-resolved visuals and canvas/UI-facing labels from semantic entities
- preserve deterministic derivation and structural stability guarantees where they still matter for store performance

If renaming is cleaner than keeping the `RenderModel` name for DOM/UI projection types, rename the semantic contract. Do not keep a compatibility alias that leaves the old mixed contract authoritative in store state.

### 2. Make `RenderModel` an explicit DOM/UI projection

Refactor the old mixed `RenderModel` role so it is no longer the authoritative store contract. Instead:

- `RenderModel` may remain as a DOM/UI-facing projection model if that keeps the boundary clearer than a full UI-type rename
- the DOM/UI projection must be derived from `RunnerFrame` plus formatting / `visual-config.yaml` inputs owned by the UI layer
- no runner consumer should need semantic derivation to import `VisualConfigProvider` anymore

### 3. Keep canvas on explicit projection layers

Refactor runner consumers so they no longer treat the shared store contract as presentation-ready. Instead:

- canvas continues to consume `PresentationScene` and token presentation nodes derived from the semantic frame plus `visual-config.yaml`
- DOM/UI surfaces consume explicit UI view projections or selectors derived from the semantic frame, using formatting/presentation helpers only where the surface actually needs them
- any game-specific visual naming, styling, shape, layout, or label behavior stays out of the semantic frame

### 4. Remove visual-config leakage from semantic derivation

`derive-render-model.ts` should be replaced or refactored so the semantic derivation path does not import or depend on visual-config-driven zone/token presentation decisions. Update store wiring, tests, and consumers so the semantic derivation layer depends only on game/runtime state and generic runner interaction inputs.

### 5. Tighten runner invariants around ownership boundaries

Strengthen type boundaries and tests so future changes cannot quietly reintroduce mixed presentation data into the semantic frame. The contract should make it obvious which layer owns:

- semantic entity identity and state
- UI-readable text formatting
- canvas render specs
- visual-config-driven game presentation

## Files to Touch

- `packages/runner/src/model/*` (modify)
- `packages/runner/src/store/*` (modify)
- `packages/runner/src/presentation/*` (modify as needed for semantic-frame input)
- `packages/runner/src/ui/*` (modify where DOM consumers currently assume presentation-ready render data)
- `packages/runner/test/model/*` (modify/add)
- `packages/runner/test/presentation/*` (modify/add as needed)
- `packages/runner/test/ui/*` or other runner consumer tests (modify/add as needed)

## Out of Scope

- changing `GameDef`, engine schemas, or simulation/runtime semantics
- introducing game-specific branches in runner code
- changing heavy-game browser stress policy itself; that belongs to `RUNARCH-004`
- rewriting unrelated runner surfaces that do not participate in the contract split

## Acceptance Criteria

### Tests That Must Pass

1. The runner's authoritative store-facing derived state contract is semantic and can be produced without `VisualConfigProvider`.
2. Canvas presentation remains derived from the semantic frame plus `visual-config.yaml`, with no provider-driven presentation fields stored in the semantic contract.
3. DOM/UI consumers compile and pass after migrating to explicit projections/selectors derived from the semantic frame.
4. `RenderModel`, if retained, is no longer the authoritative store contract; it is an explicit DOM/UI projection only.
5. Existing suite: `pnpm -F @ludoforge/runner test`
6. Existing suite: `pnpm -F @ludoforge/runner typecheck`
7. Existing suite: `pnpm -F @ludoforge/runner lint`

### Invariants

1. `GameSpecDoc` contains game-specific non-visual data only.
2. `visual-config.yaml` contains game-specific visual presentation data only.
3. `GameDef` and simulation remain game-agnostic and presentation-agnostic.
4. The semantic runner frame does not embed provider-resolved visuals or other surface-specific presentation payloads.
5. `VisualConfigProvider` is not a dependency of the semantic derivation path.
6. No backwards-compatibility alias keeps the old mixed `RenderModel` contract authoritative after migration.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/model/*runner-frame*` or equivalent model-contract coverage — prove semantic derivation is independent of `VisualConfigProvider` and contains no presentation payload leakage.
2. `packages/runner/test/model/*render-model*` or equivalent UI projection coverage — prove DOM/UI-facing labels and prompts derive from `RunnerFrame` plus UI-owned formatting / `visual-config.yaml`.
3. `packages/runner/test/presentation/*` — prove `PresentationScene` and token presentation still derive render-ready canvas specs from the semantic frame plus `visual-config.yaml`.
4. Runner store/UI consumer tests — prove store ownership moved to the semantic frame and DOM/UI consumers rely on explicit projections/selectors rather than a mixed presentation-ready store contract.

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner lint`
4. `pnpm run check:ticket-deps`

## Outcome

- Completion date: 2026-03-19
- What actually changed:
  - introduced `RunnerFrame` as the authoritative semantic runner/store contract and moved semantic derivation into `packages/runner/src/model/derive-runner-frame.ts`
  - kept `RenderModel`, but changed its role to an explicit DOM/UI projection derived from `RunnerFrame` in `packages/runner/src/model/project-render-model.ts`
  - updated the store so it owns both the authoritative `runnerFrame` and the derived DOM/UI `renderModel`, instead of treating `RenderModel` as the only derived contract
  - changed canvas/presentation code to derive from `RunnerFrame` rather than from the mixed `RenderModel`
  - moved hidden-zone filtering, labels, action grouping policy, and other visual-config-driven behavior out of semantic derivation and into projection layers
  - strengthened tests around the new ownership boundary, including a new regression test that proves semantic derivation stays provider-free while hidden-zone filtering and labels happen only in projection
- What changed versus the earlier ticket wording:
  - the corrected implementation did not remove `RenderModel` from the codebase entirely; instead it demoted it from authoritative store contract to explicit DOM/UI projection, which is the cleaner long-term split in this runner
  - the canvas side was not rewritten again; it was re-pointed to the new semantic frame because earlier RUNARCH tickets had already established the presentation-scene boundary
