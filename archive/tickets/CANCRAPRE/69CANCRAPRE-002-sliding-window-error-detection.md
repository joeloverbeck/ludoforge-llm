# 69CANCRAPRE-002: Sliding-Window Error Detection

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: Spec 68 (completed), Spec 69

## Problem

The ticker error fence only models one failure pattern: consecutive render-loop errors. The production log proves that at least one Pixi render-loop crash was contained without triggering recovery, but it does not prove the exact cadence after that first error. The architectural gap is still real: a crash fence should be able to trip on an error budget over time, not only on adjacency.

## Assumption Reassessment (2026-03-20)

1. `ticker-error-fence.ts` uses a single `consecutiveErrors` counter, reset to 0 on any successful tick. **Confirmed**.
2. `TickerErrorFenceOptions` currently has `maxConsecutiveErrors` and `onCrash` — no window-based options. **Confirmed**.
3. The fence wraps `ticker._tick` and calls `ticker.stop()` + `onCrash()` when the threshold is reached. **Confirmed**.
4. The `installedFences` WeakMap prevents duplicate installation. **Confirmed**.
5. `logs/fitl-logs.log` shows a contained `TexturePoolClass.returnTexture` error, but does not show enough evidence to claim a proven `error-success-error-success` pattern. **Confirmed discrepancy with the original ticket wording**.

## Architecture Check

1. Adding a sliding window alongside the consecutive counter is a clean hardening change. The consecutive fast-path stays intact, while the window adds a time-bounded error budget.
2. The ring buffer is O(1) per error with zero allocations after init.
3. Injectable `now` clock enables deterministic testing without timers.
4. This ticket is defensive architecture, not a claim that the sliding window alone fixes the root cause.

## What to Change

### 1. Extend `TickerErrorFenceOptions`

Add three new optional fields:
- `windowErrors?: number` — errors within window to trigger crash. Default 5.
- `windowMs?: number` — sliding window duration in ms. Default 2000.
- `now?: () => number` — injectable clock. Default `Date.now`.

### 2. Implement a bounded time-window error buffer

Inside the wrapped tick:
- on each error, push `now()` into a fixed-size circular buffer
- if the buffer is full and `newest - oldest < windowMs`, the window threshold is reached
- if either the consecutive threshold or the window threshold is reached, stop the ticker and call `onCrash`
- successful frames reset the consecutive counter but do not clear the window buffer

### 3. Validate new options

- `windowErrors` must be an integer >= 2
- `windowMs` must be a positive number

## Files to Touch

- `packages/runner/src/canvas/ticker-error-fence.ts` (modify)
- `packages/runner/test/canvas/ticker-error-fence.test.ts` (modify)

## Out of Scope

- `safe-destroy.ts` changes (ticket 001)
- `canvas-crash-recovery.ts` changes (ticket 003)
- `GameCanvas.tsx` changes (tickets 003, 004)
- `game-canvas-runtime.ts` changes (ticket 004)
- Any engine package files

## Acceptance Criteria

### Tests That Must Pass

1. Repeated errors separated by successful frames still trigger crash via the window threshold when enough errors land within the configured time window.
2. Consecutive errors still trigger crash via the fast-path.
3. Window threshold respects time boundary: errors outside the window duration do not count toward the threshold.
4. Ring buffer wraps correctly when full.
5. Successful frames do NOT clear the window buffer.
6. `onCrash` is called exactly once even if both thresholds are reached simultaneously.
7. Existing tests for the consecutive-error path continue to pass.
8. Invalid `windowErrors` and `windowMs` inputs throw validation errors.

### Invariants

1. The consecutive fast-path behavior is unchanged.
2. `destroy()` still restores the original `_tick` callback.
3. Duplicate installation on the same ticker is still rejected.
4. The injected `now` clock is used for all timestamp reads.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/ticker-error-fence.test.ts` — add `describe('sliding window error detection')` with cases for time-windowed failure accumulation, expiry, ring-buffer wrap, dual-threshold behavior, and option validation.

### Commands

1. `pnpm -F @ludoforge/runner exec vitest run test/canvas/ticker-error-fence.test.ts`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completion date: 2026-03-20
- What actually changed:
  - added `windowErrors`, `windowMs`, and `now` to `TickerErrorFenceOptions`
  - implemented a bounded timestamp ring buffer so repeated errors can trip recovery even when successful frames reset the consecutive counter
  - expanded `ticker-error-fence.test.ts` with time-window, wraparound, and validation coverage
- Deviations from original plan:
  - the ticket and implementation now describe this as defensive hardening rather than a proven root-cause fix for the production crash cadence
- Verification results:
  - `pnpm -F @ludoforge/runner exec vitest run test/canvas/ticker-error-fence.test.ts`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner lint`
