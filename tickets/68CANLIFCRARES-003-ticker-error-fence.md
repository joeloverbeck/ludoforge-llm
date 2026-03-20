# 68CANLIFCRARES-003: Add ticker error fence

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

An uncaught error in PixiJS's ticker enters an infinite crash loop: every subsequent `_tick` call re-throws the same error, producing cascading `requestAnimationFrame` stack traces visible in the console. React's `ErrorBoundary` cannot catch errors thrown inside the PixiJS ticker (which runs outside React's component tree).

The fix: install a ticker error fence that wraps the PixiJS application ticker's `_tick` method. Single transient errors are caught and logged. If errors occur on N consecutive ticks (default: 3), the ticker is stopped and a `canvas-crash` event is emitted for the recovery layer to handle.

## Assumption Reassessment (2026-03-20)

1. PixiJS v8's `Application.ticker` has a `_tick` method that is the RAF callback. The fence wraps this.
2. No existing ticker wrapping code exists in the runner — this is a new file.
3. The fence must not monkey-patch PixiJS internals (Constraint C-1). Wrapping `_tick` on the application instance (not the prototype) is acceptable — it's the same pattern as event handler wrapping.
4. `GameCanvas.tsx` creates the PixiJS app via `createGameCanvas()` at line 216. The fence must be installed after app creation.

## Architecture Check

1. A dedicated `ticker-error-fence.ts` module keeps error containment separate from rendering and disposal logic.
2. The fence uses an event-based contract (`canvas-crash` event via `EventTarget`) for loose coupling with the crash observer (68CANLIFCRARES-005).
3. No PixiJS prototype modification — only instance-level wrapping.

## What to Change

### 1. Create `ticker-error-fence.ts`

New file: `packages/runner/src/canvas/ticker-error-fence.ts`

Exports:
- `installTickerErrorFence(app: Application, options?: TickerErrorFenceOptions): TickerErrorFence`
- `TickerErrorFence` interface: `{ destroy(): void; readonly crashTarget: EventTarget }`
- `TickerErrorFenceOptions`: `{ maxConsecutiveErrors?: number }` (default: 3)

Behavior:
1. Store reference to `app.ticker` and its original `_tick` bound method.
2. Replace `app.ticker._tick` with a wrapped version that:
   - Calls the original in a try/catch.
   - On success: resets `consecutiveErrors` to 0.
   - On error: increments `consecutiveErrors`, logs a warning.
   - If `consecutiveErrors >= maxConsecutiveErrors`: stops the ticker via `app.ticker.stop()`, dispatches a `canvas-crash` `CustomEvent` on `crashTarget` with the error as detail.
3. `destroy()` restores the original `_tick` method.

### 2. Create test file

New file: `packages/runner/test/canvas/ticker-error-fence.test.ts`

## Files to Touch

- `packages/runner/src/canvas/ticker-error-fence.ts` (new)
- `packages/runner/test/canvas/ticker-error-fence.test.ts` (new)

## Out of Scope

- Wiring the fence into `GameCanvas.tsx` (that's 68CANLIFCRARES-005).
- Store lifecycle changes (68CANLIFCRARES-004).
- Canvas crash recovery/observer (68CANLIFCRARES-005).
- Modifying `safe-destroy.ts` or `disposal-queue.ts`.
- Modifying any engine package files.
- Persistent crash telemetry or error reporting infrastructure.

## Acceptance Criteria

### Tests That Must Pass

1. `ticker error fence > single error is caught and does not propagate` — verify wrapped tick catches one error, does not re-throw, ticker continues.
2. `ticker error fence > successful tick resets consecutive error counter` — verify error followed by success followed by error does not accumulate.
3. `ticker error fence > stops ticker after N consecutive errors` — verify `app.ticker.stop()` is called after threshold is reached.
4. `ticker error fence > emits canvas-crash event with error detail after threshold` — verify `CustomEvent` is dispatched on `crashTarget`.
5. `ticker error fence > logs warning for each contained error` — verify `console.warn` is called.
6. `ticker error fence > destroy restores original _tick` — verify original method is restored.
7. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Must not modify PixiJS's `Ticker` prototype — only instance-level wrapping.
2. Must not suppress errors silently — all contained errors are logged via `console.warn`.
3. `destroy()` must fully restore original behavior (no lingering wrapper).
4. The fence must be safe to install multiple times (idempotent or throws if already installed).

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/ticker-error-fence.test.ts` — full unit test suite using a mock PixiJS `Application` with a mock `ticker` object.

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/canvas/ticker-error-fence.test.ts`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`
