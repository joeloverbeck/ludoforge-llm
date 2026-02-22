# ANIMDIAG-003: Extend AnimationLogger Interface

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: ANIMDIAG-001, ANIMDIAG-002

## Problem

The existing `AnimationLogger` interface only logs high-level summaries (trace received, descriptors mapped, timeline built, queue events) to the browser console. It has no methods for logging fine-grained pipeline decisions — sprite resolution outcomes, ephemeral container creation, individual tween parameters, face controller calls, or token visibility initialization. Without these, the diagnostic buffer cannot be populated from the pipeline stages.

## Assumption Reassessment (2026-02-22)

1. `AnimationLogger` interface exists in `packages/runner/src/animation/animation-logger.ts` with methods: `logTraceReceived`, `logDescriptorsMapped`, `logTimelineBuilt`, `logQueueEvent`, plus `enabled`/`setEnabled` — to be confirmed by reading file during implementation.
2. `createAnimationLogger()` factory exists and returns the concrete implementation.
3. Test file `packages/runner/test/animation/animation-logger.test.ts` exists and tests the current interface.

## Architecture Check

1. Extending the existing interface is cleaner than creating a parallel "diagnostic logger" — one interface, one implementation, two output channels (console + buffer).
2. The key design decision: **buffer always records, console is optional**. The `enabled` flag gates console output only. Buffer recording is unconditional when a buffer is provided. This ensures diagnostic data is never missed in dev mode.
3. No backwards-compatibility issues — new methods are additive. Existing call sites don't need to change. The buffer parameter is optional in the factory.

## What to Change

### 1. Extend `AnimationLogger` interface

Add these methods to the interface:

- `logSpriteResolution(entry: SpriteResolutionEntry): void`
- `logEphemeralCreated(entry: EphemeralCreatedEntry): void`
- `logTweenCreated(entry: TweenLogEntry): void`
- `logFaceControllerCall(entry: FaceControllerCallEntry): void`
- `logTokenVisibilityInit(entry: TokenVisibilityInitEntry): void`
- `logWarning(message: string): void`
- `beginBatch(isSetup: boolean): void`
- `endBatch(): void`

### 2. Update `createAnimationLogger()` factory

- Accept optional `diagnosticBuffer?: DiagnosticBuffer` in the options/config parameter.
- Each new log method: if `enabled`, log a summary to console; **always** (regardless of `enabled`) forward to `diagnosticBuffer.record*()` if buffer is present.
- Existing log methods (`logTraceReceived`, `logDescriptorsMapped`, etc.) should also forward to the buffer where applicable (e.g., `logQueueEvent` → `diagnosticBuffer.recordQueueEvent()`).
- `beginBatch()` / `endBatch()` delegate directly to the buffer.

### 3. Handle no-buffer case gracefully

When no buffer is provided, the new methods are no-ops beyond optional console logging. No errors, no conditionals in callers.

## Files to Touch

- `packages/runner/src/animation/animation-logger.ts` (modify)
- `packages/runner/test/animation/animation-logger.test.ts` (modify)

## Out of Scope

- Calling the new methods from pipeline stages (ANIMDIAG-004, ANIMDIAG-005)
- Wiring buffer into the controller (ANIMDIAG-006)
- UI changes (ANIMDIAG-007)

## Acceptance Criteria

### Tests That Must Pass

1. New log methods write to the diagnostic buffer when one is provided.
2. Buffer records even when `enabled=false` — console is silent, buffer is populated.
3. When no buffer is provided, new methods are no-ops (no errors).
4. Existing log methods (`logTraceReceived`, etc.) continue to work unchanged.
5. `beginBatch()` / `endBatch()` delegate to buffer correctly.
6. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. `enabled` flag gates console output only — never gates buffer recording.
2. All existing `AnimationLogger` consumers continue to work without changes.
3. Factory remains backwards-compatible — buffer parameter is optional.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/animation/animation-logger.test.ts` — add tests for:
   - Each new method writes to buffer
   - Buffer populated when `enabled=false`
   - No-op behavior without buffer
   - `beginBatch`/`endBatch` delegation

### Commands

1. `pnpm -F @ludoforge/runner test -- animation-logger`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner test`
