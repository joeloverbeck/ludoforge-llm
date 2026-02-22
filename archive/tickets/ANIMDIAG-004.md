# ANIMDIAG-004: Thread Logger into Timeline Builder

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: ANIMDIAG-003

## Problem

The timeline builder is where descriptors are resolved to sprites, ephemeral containers are provisioned, tweens are created, and token visibility is initialized. These are the critical decision points for debugging animation bugs (e.g., "why didn't the token move?" or "why is it face-down?"). Currently none of these decisions are logged. This ticket threads the `AnimationLogger` through the timeline builder so every decision is captured.

## Assumption Reassessment (2026-02-22)

1. `timeline-builder.ts` exports `buildTimeline()` and already accepts `BuildTimelineOptions` — confirmed.
2. Key internal functions are exactly:
   - `filterVisualDescriptors()` (descriptor/sprite eligibility),
   - `provisionEphemeralContainers()` (ephemeral provisioning),
   - `processDescriptor()` (triggered pulse + preset tween creation),
   - `prepareTokensForAnimation()` (alpha initialization).
   These are the correct insertion points for timeline-stage diagnostics.
3. Position lookups are available via `spriteRefs.zonePositions.positions.get(zoneId)` — confirmed.
4. Logger contracts already exist (ANIMDIAG-003 complete) in `animation-logger.ts` and diagnostics types in `animation-diagnostics.ts`; required payload fields must match existing contracts (`EphemeralCreatedEntry` uses `width`/`height`, not a nested `dimensions` object).
5. `timeline-builder.test.ts` already has broad behavior coverage (filtering, sequencing, setup, ephemerals, highlights). This ticket should add targeted logger assertions, not rewrite existing suite intent.

## Architecture Check

1. Threading logger via `BuildTimelineOptions` is cleaner than a module-level logger or global — explicit dependency, testable, no hidden state.
2. For runtime cleanliness, timeline internals should avoid repeated optional chaining by using a local no-op logger fallback (null-object pattern). This keeps logic linear while preserving explicit DI at the boundary.
3. Logger is observational only; it must not change descriptor filtering, sequencing, or tween construction behavior.
4. No engine boundary concerns — purely runner animation internals.

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
  - `containerType`: `'existing'` or `'ephemeral'` when token-backed
  - `position`: the sprite's position if resolved

### 3. Log ephemeral container creation in `provisionEphemeralContainers()`

When a new ephemeral container is created:
- Call `logger.logEphemeralCreated()` with `tokenId`, `width`, and `height`.

### 4. Log tween creation in `processDescriptor()`

After each `createTween()` call (pulse and main preset are logged separately):
- Call `logger.logTweenCreated()` with:
  - `descriptorKind`: descriptor type
  - `tokenId`: from the descriptor
  - `preset`: the preset name used
  - `durationSeconds`: tween duration
  - `isTriggeredPulse`: whether this is a triggered pulse animation
  - `fromPosition` / `toPosition`: extracted from sprite refs zone positions when the descriptor has `from`/`to`
  - `faceState`: for `cardFlip` descriptors, capture `oldValue`/`newValue`

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
3. `logger.logTweenCreated()` called with correct preset, duration, trigger flag, and positions/face state when applicable.
4. `logger.logTokenVisibilityInit()` called for each token whose alpha is set to 0.
5. `logger.logEphemeralCreated()` called when ephemeral containers are provisioned.
6. When `logger` is undefined in options, timeline build still succeeds (observational logging only).
7. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Logger is optional — no existing tests or callers break.
2. No behavioral changes to timeline building — logging is observational only.
3. All log entries contain accurate data matching actual pipeline decisions.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/animation/timeline-builder.test.ts` — add tests with a mock logger verifying:
   - `logSpriteResolution` called for each descriptor (resolved and unresolved cases)
   - `logTweenCreated` called with correct positions, durations, and trigger/face-state metadata
   - `logTokenVisibilityInit` called for moved tokens
   - `logEphemeralCreated` called for ephemeral containers with `width`/`height`
   - No errors when logger is omitted

### Commands

1. `pnpm -F @ludoforge/runner test -- timeline-builder`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner test`

## Outcome

- Completion date: 2026-02-22
- What was actually changed:
  - Updated `packages/runner/src/animation/timeline-builder.ts` to thread timeline-stage diagnostics through build/filter/provision/process/setup paths via an injected logger.
  - Added `logger` to `BuildTimelineOptions` (minimal timeline logger contract) and used a no-op fallback to keep internals linear and observational.
  - Logged sprite resolution outcomes in `filterVisualDescriptors()` (resolved/missing/suppressed zone-highlight cases).
  - Logged ephemeral container creation in `provisionEphemeralContainers()` with `tokenId`, `width`, and `height`.
  - Logged tween creation metadata in `processDescriptor()` for both pulse and primary tweens, including duration, trigger flag, positions, and `cardFlip` face state.
  - Logged token visibility initialization in `prepareTokensForAnimation()`.
  - Added/updated tests in `packages/runner/test/animation/timeline-builder.test.ts` for logger behavior and safety when logger is omitted.
- Deviations from original plan:
  - Ticket assumptions/scope were corrected first to match current code/tests and existing diagnostics contracts (`width`/`height` instead of nested `dimensions`).
  - Kept logger dependency minimal (`Pick<AnimationLogger, ...>`) inside timeline builder to reduce coupling while preserving explicit DI.
- Verification results:
  - `pnpm -F @ludoforge/runner test -- timeline-builder` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm -F @ludoforge/runner test` passed.
