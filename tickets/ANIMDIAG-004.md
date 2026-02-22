# ANIMDIAG-004: Thread Logger into Timeline Builder

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: ANIMDIAG-003

## Problem

The timeline builder is where descriptors are resolved to sprites, ephemeral containers are provisioned, tweens are created, and token visibility is initialized. These are the critical decision points for debugging animation bugs (e.g., "why didn't the token move?" or "why is it face-down?"). Currently none of these decisions are logged. This ticket threads the `AnimationLogger` through the timeline builder so every decision is captured.

## Assumption Reassessment (2026-02-22)

1. `timeline-builder.ts` exports `buildTimeline()` which accepts a `BuildTimelineOptions` object — to be confirmed by reading file during implementation.
2. Key internal functions: `filterVisualDescriptors()` (sprite resolution), `provisionEphemeralContainers()` (ephemeral creation), `processDescriptor()` (tween creation), `prepareTokensForAnimation()` (visibility init) — names to be confirmed during implementation.
3. Sprite positions can be extracted from `spriteRefs.zonePositions.positions.get(zoneId)` — to be confirmed.

## Architecture Check

1. Threading logger via `BuildTimelineOptions` is cleaner than a module-level logger or global — explicit dependency, testable, no hidden state.
2. Logger is optional (`logger?: AnimationLogger`) — existing callers don't break, tests that don't care about logging pass undefined.
3. No engine boundary concerns — purely runner animation internals.

## What to Change

### 1. Add `logger` to `BuildTimelineOptions`

Add `logger?: AnimationLogger` to the `BuildTimelineOptions` interface (or equivalent options type for `buildTimeline()`).

### 2. Log sprite resolution in `filterVisualDescriptors()`

For each descriptor processed:
- Call `logger.logSpriteResolution()` with:
  - `descriptorKind`: the descriptor's kind/type
  - `tokenId` / `zoneId`: from the descriptor
  - `resolved`: whether a sprite was found
  - `reason`: the missing sprite reason string (from `getMissingSpriteReason()` or equivalent) when not resolved
  - `containerType`: `'existing'` or `'ephemeral'`
  - `position`: the sprite's position if resolved

### 3. Log ephemeral container creation in `provisionEphemeralContainers()`

When a new ephemeral container is created:
- Call `logger.logEphemeralCreated()` with `tokenId` and `dimensions` (width/height of the created container).

### 4. Log tween creation in `processDescriptor()`

After each `createTween()` call:
- Call `logger.logTweenCreated()` with:
  - `descriptorKind`: descriptor type
  - `tokenId`: from the descriptor
  - `preset`: the preset name used
  - `durationSeconds`: tween duration
  - `isTriggeredPulse`: whether this is a triggered pulse animation
  - `fromPosition` / `toPosition`: extracted from sprite refs zone positions
  - `faceState`: if the descriptor involves face changes, capture old/new values

### 5. Log token visibility initialization in `prepareTokensForAnimation()`

For each token whose alpha is set to 0:
- Call `logger.logTokenVisibilityInit()` with `tokenId` and `alphaSetTo: 0`.

## Files to Touch

- `packages/runner/src/animation/timeline-builder.ts` (modify)
- `packages/runner/test/animation/timeline-builder.test.ts` (modify)

## Out of Scope

- Preset-level logging (ANIMDIAG-005)
- Controller wiring (ANIMDIAG-006)
- Buffer creation (ANIMDIAG-002)

## Acceptance Criteria

### Tests That Must Pass

1. `logger.logSpriteResolution()` called with correct data for found sprites (resolved=true, position present).
2. `logger.logSpriteResolution()` called with correct data for missing sprites (resolved=false, reason present).
3. `logger.logTweenCreated()` called with correct preset, duration, and positions for each tween.
4. `logger.logTokenVisibilityInit()` called for each token whose alpha is set to 0.
5. `logger.logEphemeralCreated()` called when ephemeral containers are provisioned.
6. When `logger` is undefined in options, no errors occur (all logging is guarded).
7. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Logger is optional — no existing tests or callers break.
2. No behavioral changes to timeline building — logging is observational only.
3. All log entries contain accurate data matching actual pipeline decisions.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/animation/timeline-builder.test.ts` — add tests with a mock logger verifying:
   - `logSpriteResolution` called for each descriptor (resolved and unresolved cases)
   - `logTweenCreated` called with correct positions and durations
   - `logTokenVisibilityInit` called for moved tokens
   - `logEphemeralCreated` called for ephemeral containers
   - No errors when logger is omitted

### Commands

1. `pnpm -F @ludoforge/runner test -- timeline-builder`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner test`
