# RUNARCH-003: Complete Renderer Migration to Presentation Specs

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: None — runner-only
**Deps**: archive/tickets/RUNARCH/RUNARCH-001-make-presentation-scene-the-authoritative-canvas-frame.md, archive/tickets/RUNARCH/RUNARCH-002-canonical-keyed-text-reconciler.md, archive/tickets/RUNPRESLIFE/68RUNPRESLIFE-006-complete-scene-migration-for-tokens-and-announcements.md

## Problem

Even after the existing presentation-scene work, important surfaces still rely on renderer-local interpretation of presentation behavior or renderer-local ownership of Pixi primitives. That leaves the runner with too many “almost canonical” layers.

If the goal is a clean, robust, extensible architecture, then every steady-state visual surface needs one upstream owner: immutable presentation specs derived from semantic state plus `visual-config.yaml`, reconciled by one scene pipeline.

## Assumption Reassessment (2026-03-19)

1. The current presentation-scene layer already resolves overlays, regions, token grouping/layout, and announcements in part, but several canvas renderers still embed local lifecycle and rendering semantics rather than consuming a single complete spec surface.
2. Text-heavy surfaces are not the only concern; hidden stacks, badges, card faces, token face visibility, and other retained visuals also need the same immutable-spec treatment if the architecture is to remain coherent.
3. Some existing renderer files may remain useful as pure drawing helpers, but they are no longer the correct ownership boundary for scene semantics or object lifecycle.
4. Corrected scope: this ticket should finish the migration to one presentation-spec contract for all steady-state runner surfaces, not merely fix the current text crash.

## Architecture Check

1. A complete migration to presentation specs is cleaner than leaving a hybrid system where some surfaces are scene-driven and others remain renderer-owned.
2. This keeps game-specific presentation where it belongs: `visual-config.yaml` plus generic runner derivation logic, not hardcoded branches in renderers or simulation.
3. No backwards-compatibility layer should keep both old renderer-local contracts and new presentation-spec contracts alive simultaneously.
4. This is more extensible than patching specific FITL surfaces because it gives every future game one consistent runner presentation pipeline.

## What to Change

### 1. Make all steady-state visual surfaces presentation-scene driven

Ensure the canonical `PresentationScene` includes explicit immutable nodes/specs for all steady-state surfaces, including at minimum:

- zone visuals and labels
- hidden-zone stack visuals and count labels
- token visuals, face state, badges, and card content fields
- table overlays and overlay markers
- region boundaries and labels
- action announcements and other steady-state text overlays

### 2. Reduce renderers to pure backend helpers or remove them

Refactor existing renderer modules so they no longer:

- derive scene semantics
- own visual identity keys
- own Pixi object lifecycle policy
- reach back into game/store state to interpret presentation meaning

Any renderer file that remains should be a pure helper invoked by the reconciler/backend using already-resolved presentation specs.

### 3. Tighten visual-config ownership for presentation-only behavior

Where presentation choices are still implicit in generic runner code, move them onto explicit generic `visual-config.yaml`-driven contracts if they are truly game-specific presentation decisions. Do not move those choices into `GameSpecDoc`, `GameDef`, or simulation.

## Files to Touch

- `packages/runner/src/presentation/*` (modify)
- `packages/runner/src/canvas/renderers/*` (modify/remove/refactor)
- `packages/runner/src/config/visual-config-types.ts` (modify if new generic presentation spec fields are required)
- `packages/runner/src/config/visual-config-provider.ts` (modify if new generic presentation spec fields are required)
- `packages/runner/test/presentation/*` (modify/new)
- `packages/runner/test/canvas/renderers/*` (modify heavily or replace with reconciler-focused coverage)

## Out of Scope

- changing engine/runtime/kernel behavior
- FITL-specific emergency branches
- browser harness work except where tests need updated fixtures

## Acceptance Criteria

### Tests That Must Pass

1. Every steady-state runner visual surface is derived from canonical presentation specs rather than renderer-local semantic interpretation.
2. Focused tests prove hidden stacks, token badges, card fields, overlays, regions, and announcements all consume resolved presentation nodes/specs.
3. Existing suite: `pnpm -F @ludoforge/runner test`
4. Existing suite: `pnpm -F @ludoforge/runner typecheck`
5. Existing suite: `pnpm -F @ludoforge/runner lint`

### Invariants

1. All game-specific presentation behavior remains data-driven in `visual-config.yaml`.
2. The runner presentation pipeline is complete: semantic frame -> presentation scene -> reconciler/backend, with no renderer-local semantic side channels.
3. `GameDef` and simulation remain game-agnostic and presentation-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/presentation/*` — prove full-surface presentation-node derivation for zones, tokens, overlays, regions, hidden stacks, and announcements.
2. `packages/runner/test/canvas/*` — prove the canvas layer consumes already-resolved specs and does not derive presentation semantics locally.
3. `packages/runner/test/config/*` — add/adjust tests only where generic visual-config-owned presentation fields are expanded.

### Commands

1. `pnpm -F @ludoforge/runner test -- presentation-scene.test.ts`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`
4. `pnpm -F @ludoforge/runner lint`
5. `pnpm run check:ticket-deps`
