# ANIMPIPE-006: card-flip-3d preset

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: ANIMPIPE-001, ANIMPIPE-002, ANIMPIPE-003

## Problem

The current `cardFlip` descriptor uses a `tint-flash` preset — a simple tint color change that doesn't visually communicate a card being flipped. A proper card flip should show scaleX compression to zero (card edge), swap front/back visibility, then expand back.

## Assumption Reassessment (2026-02-20)

1. `tint-flash` is mapped to `cardFlip` kind in `BUILTIN_PRESET_METADATA` — confirmed.
2. Token renderer has `frontBase`/`backBase` visibility toggling logic — confirmed from reading token-renderer.ts.
3. GSAP supports scaleX tweens with `onComplete` callbacks — confirmed.

## Architecture Check

1. The card-flip-3d preset replaces `tint-flash` for the `cardFlip` kind only.
2. The approach uses scaleX compression/expansion which is a standard CSS/canvas flip technique, no 3D transforms needed.
3. The midpoint callback swaps sprite visibility, matching the token renderer's existing front/back model.

## What to Change

### 1. Implement `card-flip-3d` preset

Modify `packages/runner/src/animation/preset-registry.ts`:

New preset factory for `card-flip-3d`:
- Phase 1 (first half of duration): scaleX 1 → 0 (card appears to rotate away)
- At midpoint (scaleX=0): swap front/back sprite visibility via `onComplete` callback
- Phase 2 (second half of duration): scaleX 0 → 1 (card appears to rotate back)
- Total default duration: 0.3s (0.15s each phase)

### 2. Update preset metadata

Update `BUILTIN_PRESET_METADATA` to map `cardFlip` → `card-flip-3d` factory instead of `tint-flash`.

## Files to Touch

- `packages/runner/src/animation/preset-registry.ts` (modify)
- `packages/runner/test/animation/preset-registry.test.ts` (modify)

## Out of Scope

- arc-bezier preset (ANIMPIPE-005)
- counter-tick and banner-overlay presets (ANIMPIPE-007)
- Token renderer changes (the flip just animates scaleX and swaps visibility via the container reference)

## Acceptance Criteria

### Tests That Must Pass

1. `card-flip-3d` creates two-phase tween (scaleX 1→0, then 0→1)
2. Midpoint callback exists to swap front/back visibility
3. Compatible kinds are `['cardFlip']`
4. Duration config is respected when provided
5. Fallback to default 0.3s duration
6. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. `cardFlip` descriptors resolve to `card-flip-3d` preset
2. The preset only manipulates scaleX and visibility, no other container properties

## Test Plan

### New/Modified Tests

1. `packages/runner/test/animation/preset-registry.test.ts` — add card-flip-3d tween structure tests

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/animation/preset-registry.test.ts`
2. `pnpm -F @ludoforge/runner test && pnpm -F @ludoforge/runner typecheck`
