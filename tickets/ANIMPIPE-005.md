# ANIMPIPE-005: arc-bezier preset

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: ANIMPIPE-001, ANIMPIPE-002, ANIMPIPE-003

## Problem

The current `arc-tween` preset moves tokens/cards linearly from source to destination. This looks flat and unnatural. Cards being dealt should follow an arc trajectory with a vertical lift, creating a more natural motion.

## Assumption Reassessment (2026-02-20)

1. `arc-tween` preset in `preset-registry.ts` uses simple linear `appendTween` — confirmed.
2. GSAP supports bezier-like paths via `MotionPathPlugin` or manual two-phase tweens — confirmed.
3. `arc-tween` is mapped to kinds: `moveToken`, `cardDeal`, `cardBurn` — confirmed from `BUILTIN_PRESET_METADATA`.

## Architecture Check

1. The arc-bezier preset replaces the existing `arc-tween` ID mapping — same ID, better implementation.
2. Lift height is proportional to distance, keeping the motion natural regardless of distance.
3. No new dependencies required — GSAP core supports the two-phase tween approach.

## What to Change

### 1. Replace `arc-tween` implementation

Modify `packages/runner/src/animation/preset-registry.ts`:

Replace the linear `arc-tween` factory with an `arc-bezier` implementation:
- Calculate midpoint between source and destination
- Add vertical lift: `midY = Math.min(from.y, to.y) - liftHeight`
- `liftHeight = Math.max(20, distance * 0.3)` (proportional to distance, minimum 20px)
- Use two sequential tweens: `from → mid` then `mid → to`
- Both halves use `power2.inOut` easing for smooth arc

### 2. Update preset metadata

Update `BUILTIN_PRESET_METADATA` to use the new factory while keeping compatible kinds the same: `['moveToken', 'cardDeal', 'cardBurn']`.

## Files to Touch

- `packages/runner/src/animation/preset-registry.ts` (modify)
- `packages/runner/test/animation/preset-registry.test.ts` (modify)

## Out of Scope

- card-flip-3d preset (ANIMPIPE-006)
- counter-tick and banner-overlay presets (ANIMPIPE-007)
- Sequencing changes (ANIMPIPE-004)

## Acceptance Criteria

### Tests That Must Pass

1. `arc-bezier` creates two-phase tween (from→mid, mid→to)
2. Lift height is proportional to distance
3. Compatible kinds are `['moveToken', 'cardDeal', 'cardBurn']`
4. Duration config is respected when provided
5. Fallback to default duration when config absent
6. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Preset ID `arc-tween` still resolves correctly (same ID, new implementation)
2. All existing descriptor kinds that used `arc-tween` continue to work

## Test Plan

### New/Modified Tests

1. `packages/runner/test/animation/preset-registry.test.ts` — add arc-bezier tween structure tests

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/animation/preset-registry.test.ts`
2. `pnpm -F @ludoforge/runner test && pnpm -F @ludoforge/runner typecheck`
