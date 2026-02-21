# ANIMPIPE-006: card-flip-3d midpoint face-swap architecture hardening

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None - runner-only
**Deps**: ANIMPIPE-001, ANIMPIPE-002, ANIMPIPE-003

## Problem

`card-flip-3d` is already present and mapped to `cardFlip`, but it currently only runs a two-phase `scaleX` tween (1 -> 0 -> 1). It does not perform a true midpoint face swap because the animation preset layer only receives token containers, not explicit face controls (`frontBase`/`backBase`/card front content visibility handles).

Result: the current behavior is visually weaker than intended and architecturally brittle if we try to infer faces from container children.

## Assumption Reassessment (2026-02-21)

1. `cardFlip` already resolves to `card-flip-3d` (not `tint-flash`) in `DESCRIPTOR_KIND_DEFAULT_PRESETS` and built-in metadata.
2. `card-flip-3d` factory already exists in `preset-registry.ts` and has baseline tests.
3. Token renderer does have front/back visibility logic, but preset context currently cannot address it directly. This is the key discrepancy.
4. GSAP `onComplete` callback support is available and can drive midpoint swaps once explicit face controls are exposed.

## Architecture Check

1. Keeping `cardFlip` as a dedicated semantic descriptor and dedicated preset is correct and extensible.
2. A scaleX midpoint flip remains the correct primitive for this pipeline.
3. The missing piece is explicit face-control plumbing from renderer -> animation context.
4. No aliasing/compat layer should be introduced. Prefer explicit interfaces over implicit child-order coupling.

## What to Change

### 1. Add explicit token face controls to animation sprite refs

Expose typed face controls from token renderer for each token id used by animations, and thread these through animation controller/timeline sprite refs.

Requirements:
- API must be explicit and typed (no child index lookups).
- Existing container map usage for other presets remains intact.

### 2. Upgrade `card-flip-3d` to perform midpoint face swap

Update preset tween factory:
- Phase 1: `scaleX` 1 -> 0 over half duration
- Midpoint: callback flips face visibility using the new face controller (`oldValue` -> `newValue`)
- Phase 2: `scaleX` 0 -> 1 over half duration
- Default duration remains `0.3s`

## Files to Touch

- `packages/runner/src/canvas/renderers/renderer-types.ts` (modify)
- `packages/runner/src/canvas/renderers/token-renderer.ts` (modify)
- `packages/runner/src/canvas/GameCanvas.tsx` (modify)
- `packages/runner/src/animation/animation-controller.ts` (modify)
- `packages/runner/src/animation/timeline-builder.ts` (modify)
- `packages/runner/src/animation/preset-registry.ts` (modify)
- `packages/runner/test/animation/preset-registry.test.ts` (modify)
- `packages/runner/test/canvas/renderers/token-renderer.test.ts` (modify/add focused assertions if needed)

## Out of Scope

- arc-bezier preset (ANIMPIPE-005)
- counter-tick and banner-overlay presets (ANIMPIPE-007)
- Any change to card semantic classification (`trace-to-descriptors`) for `cardFlip`
- Any token shape/template redesign

## Acceptance Criteria

### Tests That Must Pass

1. `card-flip-3d` still creates two-phase tween (`scaleX` 1 -> 0 -> 1)
2. Midpoint callback is present and flips via explicit face controller when available
3. `cardFlip` remains mapped to `card-flip-3d`
4. No container child-order assumptions are used for face swapping
5. Existing suite passes: `pnpm -F @ludoforge/runner test`

### Invariants

1. `cardFlip` descriptors resolve to `card-flip-3d`
2. Preset layer remains descriptor-driven and generic; token-renderer internals are exposed only through typed face controls
3. Flip tween mutates only `scaleX` and face visibility

## Test Plan

### New/Modified Tests

1. `packages/runner/test/animation/preset-registry.test.ts` - assert midpoint callback and face-controller-driven swap
2. `packages/runner/test/canvas/renderers/token-renderer.test.ts` - validate exposed face controller toggles front/back visibility consistently

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/animation/preset-registry.test.ts`
2. `pnpm -F @ludoforge/runner test && pnpm -F @ludoforge/runner typecheck`

## Outcome

- Completion date: 2026-02-21
- Actually changed:
  - Added explicit token face-controller plumbing from token renderer -> animation controller -> timeline sprite refs.
  - Upgraded `card-flip-3d` midpoint to swap face visibility through typed controller callbacks (no child-order coupling).
  - Added/updated tests for midpoint face swap, controller plumbing, and token renderer face-controller behavior.
- Deviations from original plan:
  - Original ticket assumed preset creation/mapping was pending, but those were already implemented.
  - Work focused on the real remaining gap: robust midpoint face swap architecture.
- Verification:
  - `pnpm -F @ludoforge/runner exec vitest run test/animation/preset-registry.test.ts test/canvas/renderers/token-renderer.test.ts test/animation/animation-controller.test.ts`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner lint`
