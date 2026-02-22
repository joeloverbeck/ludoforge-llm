# ANIMDIAG-005: Thread Logger into Tween Factories (Preset Registry)

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: ANIMDIAG-003

## Problem

The preset registry's tween factories contain the exact call sites where `setFaceUp()` is invoked on card sprites. These are the two locations where face-down bugs originate: the mid-arc flip path in the `arc-tween` factory and the mid-flip point in the `card-flip-3d` factory. Without logging at these call sites, diagnostic data cannot capture which cards had their face state changed, to what value, and in what context.

## Assumption Reassessment (2026-02-22)

1. Confirmed: `packages/runner/src/animation/preset-registry.ts` contains tween factories keyed by preset id (`'arc-tween'`, `'card-flip-3d'`, etc.).
2. Confirmed: factories consume `PresetTweenContext` with sprite refs and timeline dependencies, but no logger field is currently present on that context.
3. Corrected: `setFaceUp()` is called in **three** places in `preset-registry.ts`:
   - `arc-tween` midpoint callback for shared card deals.
   - `card-flip-3d` initial synchronization (`oldValue`) before tweening.
   - `card-flip-3d` midpoint callback (`newValue`) during flip.
4. Confirmed: `buildTimeline()` currently accepts a narrowed logger type that does not include `logFaceControllerCall`, so diagnostics cannot currently be threaded to preset factories.

## Architecture Check

1. Preferred contract: add a minimal optional logger capability on `PresetTweenContext` (`logFaceControllerCall` only), instead of coupling preset factories to the full `AnimationLogger` surface.
2. Every `setFaceUp()` invocation in preset factories should be paired with diagnostic logging to avoid partial observability and drift.
3. Threading logger from timeline builder into preset context keeps diagnostics flow explicit and avoids globals.
4. No compatibility shims/aliases are needed; this is a direct architectural correction.

## What to Change

### 1. Add `logger` to tween factory context

Add an optional logger field to `PresetTweenContext` (minimal interface with `logFaceControllerCall()`).
Update timeline builder context construction so preset factories receive that logger.

### 2. Log face controller call in `arc-tween` factory

In the arc-tween factory, at the point where `setFaceUp()` is called during card-deal-to-shared (the mid-arc flip path):
- Call `logger.logFaceControllerCall()` with:
  - `tokenId`: the token being animated
  - `setFaceUp`: the boolean value passed to `setFaceUp()`
  - `context`: `'card-deal-to-shared-mid-arc'`

### 3. Log face controller call in `card-flip-3d` factory

In the card-flip-3d factory, log at both face-controller call sites:
- Initial synchronization call (`setFaceUp(oldFaceUp)`) with context:
  - `'card-flip-3d-initial'`
- Mid-flip callback call (`setFaceUp(newFaceUp)`) with context:
- Call `logger.logFaceControllerCall()` with:
  - `tokenId`: the token being animated
  - `setFaceUp`: the boolean value passed to `setFaceUp()`
  - `context`: `'card-flip-3d-mid'`

## Files to Touch

- `packages/runner/src/animation/preset-registry.ts` (modify)
- `packages/runner/test/animation/preset-registry.test.ts` (modify)

## Out of Scope

- Non-face-controller timeline diagnostics already covered in prior ANIMDIAG tickets
- Controller wiring (ANIMDIAG-006)
- Any changes to the actual face controller logic

## Acceptance Criteria

### Tests That Must Pass

1. `logger.logFaceControllerCall()` called with `context: 'card-deal-to-shared-mid-arc'` when arc-tween factory calls `setFaceUp()`.
2. `logger.logFaceControllerCall()` called with `context: 'card-flip-3d-initial'` when card-flip-3d synchronizes `oldValue`.
3. `logger.logFaceControllerCall()` called with `context: 'card-flip-3d-mid'` when card-flip-3d midpoint callback applies `newValue`.
4. When `logger` is undefined in context, no errors occur.
5. Face controller call entries contain correct `tokenId` and `setFaceUp` values.
6. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Logger is optional — existing tween factory behavior unchanged.
2. No changes to actual `setFaceUp()` logic — logging is observational only.
3. Tween output (GSAP timeline) is identical with or without logger.
4. No aliasing/back-compat branches are introduced; diagnostics wiring is explicit in current code paths.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/animation/preset-registry.test.ts` — add tests with a mock logger verifying:
   - Face controller call logged in arc-tween factory with correct context
   - Face controller call logged in card-flip-3d initial sync path with correct context
   - Face controller call logged in card-flip-3d midpoint path with correct context
   - No errors when logger is absent

### Commands

1. `pnpm -F @ludoforge/runner test -- preset-registry`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner test`

## Outcome

- **Completion date**: 2026-02-22
- **What changed**:
  - Added optional face-controller logger capability to preset tween context and threaded it from timeline builder.
  - Added face-controller diagnostics at all real `setFaceUp()` call sites in preset factories (`card-deal-to-shared-mid-arc`, `card-flip-3d-initial`, `card-flip-3d-mid`).
  - Consolidated `setFaceUp`+logging into a single helper to keep behavior DRY and reduce future omission risk.
  - Expanded preset-registry test coverage for the new diagnostics and edge cases.
- **Deviation from original plan**:
  - Original ticket assumed two `setFaceUp()` call sites; implementation corrected this to three and instrumented all three.
  - Original ticket treated timeline-builder logging as out of scope, but minimal logger threading in timeline-builder was required to satisfy the preset-factory objective.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test -- preset-registry` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm -F @ludoforge/runner test` passed.
