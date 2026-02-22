# ANIMDIAG-005: Thread Logger into Tween Factories (Preset Registry)

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: ANIMDIAG-003

## Problem

The preset registry's tween factories contain the exact call sites where `setFaceUp()` is invoked on card sprites. These are the two locations where face-down bugs originate: the mid-arc flip path in the `arc-tween` factory and the mid-flip point in the `card-flip-3d` factory. Without logging at these call sites, diagnostic data cannot capture which cards had their face state changed, to what value, and in what context.

## Assumption Reassessment (2026-02-22)

1. `preset-registry.ts` contains tween factory functions registered by preset name (e.g., `'arc-tween'`, `'card-flip-3d'`) — to be confirmed by reading during implementation.
2. Factories receive a context object (likely `PresetTweenContext` or similar) containing sprite references — to be confirmed.
3. `setFaceUp()` is called in exactly two places: the `arc-tween` factory (for card-deal-to-shared mid-arc) and the `card-flip-3d` factory (at the mid-flip point).

## Architecture Check

1. Adding `logger?: AnimationLogger` to `PresetTweenContext` (or the factory's context parameter) is consistent with the pattern used in ANIMDIAG-004 for timeline builder — optional, no new globals.
2. Only two `logFaceControllerCall()` insertions — minimal, targeted changes at the exact debugging pain points.
3. No backwards-compatibility concerns — the logger field is optional.

## What to Change

### 1. Add `logger` to tween factory context

Add `logger?: AnimationLogger` to `PresetTweenContext` (or the equivalent context type passed to tween factories).

### 2. Log face controller call in `arc-tween` factory

In the arc-tween factory, at the point where `setFaceUp()` is called during card-deal-to-shared (the mid-arc flip path):
- Call `logger.logFaceControllerCall()` with:
  - `tokenId`: the token being animated
  - `setFaceUp`: the boolean value passed to `setFaceUp()`
  - `context`: `'card-deal-to-shared-mid-arc'`

### 3. Log face controller call in `card-flip-3d` factory

In the card-flip-3d factory, at the mid-flip point where `setFaceUp()` is called:
- Call `logger.logFaceControllerCall()` with:
  - `tokenId`: the token being animated
  - `setFaceUp`: the boolean value passed to `setFaceUp()`
  - `context`: `'card-flip-3d-mid'`

## Files to Touch

- `packages/runner/src/animation/preset-registry.ts` (modify)
- `packages/runner/test/animation/preset-registry.test.ts` (modify)

## Out of Scope

- Timeline builder logging (ANIMDIAG-004)
- Controller wiring (ANIMDIAG-006)
- Any changes to the actual face controller logic

## Acceptance Criteria

### Tests That Must Pass

1. `logger.logFaceControllerCall()` called with `context: 'card-deal-to-shared-mid-arc'` when arc-tween factory calls `setFaceUp()`.
2. `logger.logFaceControllerCall()` called with `context: 'card-flip-3d-mid'` when card-flip-3d factory calls `setFaceUp()`.
3. When `logger` is undefined in context, no errors occur.
4. Face controller call entries contain correct `tokenId` and `setFaceUp` values.
5. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Logger is optional — existing tween factory behavior unchanged.
2. No changes to actual `setFaceUp()` logic — logging is observational only.
3. Tween output (GSAP timeline) is identical with or without logger.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/animation/preset-registry.test.ts` — add tests with a mock logger verifying:
   - Face controller call logged in arc-tween factory with correct context
   - Face controller call logged in card-flip-3d factory with correct context
   - No errors when logger is absent

### Commands

1. `pnpm -F @ludoforge/runner test -- preset-registry`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner test`
