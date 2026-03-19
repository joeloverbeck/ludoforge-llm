# RUNARCH-005: Extract Semantic Runner Frame from RenderModel

**Status**: PENDING
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

1. `packages/runner/src/model/render-model.ts` still embeds presentation-facing fields such as `RenderZone.displayName` and `RenderZone.visual`, so the current contract is not a semantic frame.
2. `packages/runner/src/model/derive-render-model.ts` still calls `context.visualConfigProvider.getZoneLabel(...)` and `context.visualConfigProvider.resolveZoneVisual(...)`, confirming that visual-config presentation semantics still leak into the core derived model.
3. `archive/tickets/RUNARCH/RUNARCH-001-make-presentation-scene-the-authoritative-canvas-frame.md` and `archive/tickets/RUNARCH/RUNARCH-003-complete-renderer-migration-to-presentation-specs.md` both intentionally left this runner-wide contract split out of scope. No active ticket currently owns it.
4. Corrected scope: this ticket should finish the runner contract split, not just remove a single field. The goal is to replace the mixed `RenderModel` architecture with a semantic runner frame plus explicit view/presentation projections.
5. Corrected boundary: this ticket must keep `GameDef` and simulation game-agnostic, keep `GameSpecDoc` limited to non-visual game-specific data, and keep game-specific visual presentation in `visual-config.yaml`.

## Architecture Check

1. A semantic-frame-plus-projections architecture is cleaner than the current mixed `RenderModel` because it gives the runner one authoritative place for game-state semantics and separate places for surface-specific presentation.
2. This preserves the repository boundary cleanly: `GameSpecDoc` remains the home of game-specific non-visual data, `visual-config.yaml` remains the home of game-specific visual presentation, and `GameDef` / simulation remain game-agnostic.
3. No backwards-compatibility aliasing should preserve both the old mixed `RenderModel` and the new semantic contract. Migrate consumers directly to the replacement architecture and fix breakages at call sites.
4. This is more beneficial than incremental patching because the remaining problem is architectural, not local. Continuing to add fields/selectors to a mixed model would deepen the coupling between semantic state and surface presentation.

## What to Change

### 1. Replace the mixed `RenderModel` contract with a semantic runner frame

Introduce the runner's authoritative semantic frame contract for derived state. The replacement contract must:

- be derived without `VisualConfigProvider`
- contain only semantic/game-state facts and generic runner interaction facts
- remove presentation-only fields such as provider-resolved visuals and canvas/UI-facing labels from semantic entities
- preserve deterministic derivation and structural stability guarantees where they still matter for store performance

If renaming is cleaner than keeping the `RenderModel` name, rename it. Do not keep a compatibility alias.

### 2. Add explicit projection layers for canvas and DOM UI

Refactor runner consumers so they no longer treat the shared store contract as presentation-ready. Instead:

- canvas continues to consume `PresentationScene` and token presentation nodes derived from the semantic frame plus `visual-config.yaml`
- DOM/UI surfaces consume explicit UI view projections or selectors derived from the semantic frame, using formatting/presentation helpers only where the surface actually needs them
- any game-specific visual naming, styling, shape, layout, or label behavior stays out of the semantic frame

### 3. Remove visual-config leakage from semantic derivation

`derive-render-model.ts` should be replaced or refactored so the semantic derivation path does not import or depend on visual-config-driven zone/token presentation decisions. Update store wiring, tests, and consumers so the semantic derivation layer depends only on game/runtime state and generic runner interaction inputs.

### 4. Tighten runner invariants around ownership boundaries

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

1. The runner's central derived state contract is semantic and can be produced without `VisualConfigProvider`.
2. Canvas presentation remains derived from the semantic frame plus `visual-config.yaml`, with no provider-driven presentation fields stored in the semantic contract.
3. DOM/UI consumers compile and pass after migrating to explicit projections/selectors instead of the old mixed contract.
4. Existing suite: `pnpm -F @ludoforge/runner test`
5. Existing suite: `pnpm -F @ludoforge/runner typecheck`
6. Existing suite: `pnpm -F @ludoforge/runner lint`

### Invariants

1. `GameSpecDoc` contains game-specific non-visual data only.
2. `visual-config.yaml` contains game-specific visual presentation data only.
3. `GameDef` and simulation remain game-agnostic and presentation-agnostic.
4. The semantic runner frame does not embed provider-resolved visuals or other surface-specific presentation payloads.
5. No backwards-compatibility alias keeps the old mixed `RenderModel` contract alive after migration.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/model/*semantic-frame*` or equivalent model-contract coverage — prove semantic derivation is independent of `VisualConfigProvider` and contains no presentation payload leakage.
2. `packages/runner/test/presentation/*` — prove `PresentationScene` and token presentation still derive render-ready canvas specs from the semantic frame plus `visual-config.yaml`.
3. Runner UI/store consumer tests — prove DOM/UI selectors or view projections consume the semantic frame through explicit surface-owned projection logic rather than a mixed presentation-ready store contract.

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner lint`
4. `pnpm run check:ticket-deps`
